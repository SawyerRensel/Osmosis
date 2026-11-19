---
title: Style sidebar - Replace the color picker with Pickr
summary: "Batch 12 (T94). Replace Osmosis's hand-rolled ColorPicker with the Pickr library (MIT), keeping theme and custom palettes and reopening on the current color."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Style sidebar - Sliders snap back after release]]"
status: In-Review
batch: 12
priority:
progress:
date_created: 2026-11-18T12:00:00.000Z
date_modified: 2026-11-19T04:05:00.000Z
date_start_scheduled: 2026-11-19T03:47:06.000Z
date_start_actual: 2026-11-19T03:47:06.000Z
date_end_scheduled:
date_end_actual:
all_day: false
repeat_frequency:
repeat_interval:
repeat_until:
repeat_count:
repeat_byday:
repeat_bymonth:
repeat_bymonthday:
repeat_bysetpos:
repeat_completed_dates:
parent:
children:
blocked_by:
cover:
color:
pull_request:
---

# Style sidebar - Replace the color picker with Pickr (T94)

## What do you need built?

Sawyer doesn't like the current color picker. They called it "native", but it's
our own `ColorPicker` (`src/views/ColorPicker.ts`, 569 lines: theme palette,
custom palette, hex input, hue/gradient). They want it replaced with an
open-source library: **[Pickr](https://github.com/simonwep/pickr)**
(`@simonwep/pickr`, MIT, 1.10.3, published 2026-11).

Pickr renders its own popup (themes `classic` / `monolith` / `nano`). Choose the
theme that fits a sidebar best (recommend `nano` or `monolith`), and say which
one and why in the batch notes, as a decision for Sawyer.

## Must keep

- **Theme palette** (colors from the active map theme, `extractThemeColors`) and the **custom palette** (saved in plugin settings) shown as Pickr `swatches`. Saving a custom color still persists.
- **Reopens on the current color.** Today it doesn't: every caller passes `swatch.style.backgroundColor`, which reads back as `rgb(r, g, b)`, while `ColorPicker` only accepts hex (`isValidHex`), so it falls back to its default. That bug is what "doesn't remember colors" means. Pickr parses rgb, but pass the stored hex value anyway, not a computed style.
- **Live preview while dragging, one undo step per picker session:** `openColorPicker` (`PropertiesSidebarView.ts:3141`) brackets the picker with `host.beginLiveEdit()` / `endLiveEdit()`. Keep `onChange` → live update and `onClose` → `endLiveEdit`.
- Only one picker open at a time (`closeAllPickers`), and pickers are destroyed when the sidebar closes (no leaked DOM/listeners).
- Works with touch on mobile, and the popup stays on screen in a narrow sidebar.
- Light and dark theme: style Pickr through Obsidian CSS variables in `styles.css`. Import Pickr's theme CSS in a way esbuild bundles (check `esbuild.config.mjs`). Obsidian plugins ship one `styles.css`, so the Pickr CSS must end up in it or be injected at load and removed at unload.

## Must not

- Add a dependency other than Pickr.
- Change what colors are written to the map (still hex strings, same keys).
- ESLint `obsidianmd` rules: no inline `style` assignments if the linter forbids them (it may flag Pickr glue). Run `npm run lint` early.

Remove the old `ColorPicker` class and its test once nothing uses it, but keep
`extractThemeColors` (move it if needed, with its tests).

## Acceptance criteria

- [ ] Every color swatch in the style sidebar opens Pickr, anchored to the swatch.
- [ ] Reopening a swatch shows its current color, after a pick, after reselecting the node, and after a reload.
- [ ] The theme and custom palettes appear and work. Saving a custom color persists across a reload.
- [ ] Dragging previews live, and one picker session is one undo step.
- [ ] No console errors; there is one Pickr instance at a time, and it's gone when the sidebar closes.
- [ ] lint, tests and build pass, and the bundle size growth is noted in the batch notes.

## Test plan

Manual (desktop and mobile): select a node and open the fill color. Pick a
color → it previews live, then close. Reopen → the same color is selected. Pick
from the theme palette, save a custom color, reload Obsidian → the custom color
is still there. Undo once → the whole pick reverts.

## Context budget (~25k tokens)

| Read | Range | ~Tokens |
|---|---|---|
| `src/views/ColorPicker.ts` | whole | 4.3k |
| `src/views/ColorPicker.test.ts` | whole | 0.4k |
| `src/views/PropertiesSidebarView.ts` | `grep -n openColorPicker` call sites (a few lines each), 3141–3170 | ~2k |
| `node_modules/@simonwep/pickr` | README + `types/pickr.d.ts` after `npm install` | ~5k |
| `esbuild.config.mjs` | whole | ~1k |
| `styles.css` | `grep -n "color-picker"` rules | ~1.5k |

Install with `npm install @simonwep/pickr` and commit `package.json` +
`package-lock.json` (by path).

## Batch implementation notes (awaiting manual test)

Code commit: `d55668e` on `batch/12-study-tab`.

### Cause of "doesn't remember colors"

Every swatch called `openColorPicker(swatch, swatch.style.backgroundColor || …)`.
`style.backgroundColor` reads back as `rgb(r, g, b)`, and the old `ColorPicker`
only accepted hex (`isValidHex`), so every reopen fell back to `#000000`.

### Approach

- `src/views/PickrColorPicker.ts` wraps one Pickr instance per picker session.
  It opens on construction, anchored to the swatch (`useAsButton`), and
  `close()` destroys it (`destroyAndRemove`). Pickr hiding itself (outside
  click or tap, Escape) also routes through `close()`, which calls `onClose`
  once. The view holds at most one (`activePicker`), and `closeAllPickers()`
  (run before every rebuild and on view close) destroys it.
- **Reopen fix:** a new `paintSwatch(el, color)` helper in
  `PropertiesSidebarView.ts` sets the swatch background *and* `data-color`
  to the value as written. All 11 swatch paints (refresh paths and the Map-tab
  live callbacks) go through it, and `openColorPicker` opens on
  `anchor.dataset.color`, with the old per-swatch default as the fallback.
- Live preview: Pickr `change` → `onChange(lowercase #rrggbb)`. The commit
  paths are unchanged (`writeNodeStyle` / Map save helpers). `beginLiveEdit`
  runs on open and `endLiveEdit` in `onClose`, so one session is still one
  undo step.
- Pure helpers moved to `src/color-palette.ts`: `extractThemeColors` (moved
  with its tests) and the new `rgbToHex`, which turns Pickr's float channels
  into the lowercase `#rrggbb` the map already stores. So the written values
  keep the same format and the same keys.

### Decisions for Sawyer

- **Theme: `nano`.** It is the narrowest Pickr theme (14.25em, capped at
  95vw) and stacks palette, hue bar, swatches and input vertically, which suits
  a sidebar. `monolith` is just as wide but spends more height on a
  full-width preview bar; `classic` is wider and puts the sliders side by side.
- **The Save button is relabeled "Add to palette".** Picks already apply
  live, so Pickr's Save would commit nothing. It now appends the current
  color to the custom palette, persists it (`saveSettings`) and adds the
  swatch at once. Right-clicking a custom swatch removes it, as before.
  The tooltip says so. On mobile this needs a long press, which fires
  `contextmenu` on Android but likely not on iOS. That limit is not new.
- **One swatch row, not two labeled sections.** Pickr has a single swatch
  grid, so theme colors come first and the custom palette starts on a new row
  (`.osmosis-pickr-custom-start { grid-column-start: 1 }`). The "Theme" and
  "Custom" headings are gone.
- **Clicking the open picker's own swatch closes it** (a toggle), instead of
  reopening it.
- **Opacity is locked** (`lockOpacity`, no opacity slider), because the map
  stores 6-digit hex.

### Decisions worth remembering (don't undo)

- **Pickr CSS is vendored into `styles.css`** (verbatim `nano.min.css`
  between a comment header and the Osmosis overrides). The lint rule
  `obsidianmd/no-forbidden-elements` forbids injecting `<style>`/`<link>`.
  A build-time concat would make the root `styles.css` differ from what ships,
  and both the `.build-targets.local` copies and any release take the root
  file. **When upgrading Pickr, re-copy that file.**
- **Never destroy a Pickr before its `init` event.** Pickr's setup loop
  re-requests animation frames until its popup has a width, and it stores
  only the first frame id. Destroying before init leaves a requestAnimationFrame
  loop spinning on a detached element. `close()` defers the destroy to
  `handleInit` when needed.
- The wrapper stops `mousedown`/`touchstart`/`pointerdown` from bubbling
  out of the popup (the old picker did the same on its canvas) so that
  document-level map handlers don't react to presses inside it. Pickr's own
  outside-click listener is a capture listener and is unaffected.
- The `package-lock.json` diff is hand-applied: only Pickr's root dependency
  and its one package entry (Pickr has no dependencies). `npm install`
  reformatted the whole lockfile (+7.7k/−7.7k lines), so it was restored and
  re-applied.

### Bundle size

- `main.js` (production): 1,753,715 → 1,771,658 bytes (**+17.9 KB**). The
  baseline is the previous production build in the dev vault, from T93.
- `styles.css`: 144,472 → 151,683 bytes (**+7.2 KB** net: +10.8 KB Pickr theme
  and overrides, −3.6 KB old picker rules).

### Surface map

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | Add `@simonwep/pickr` 1.10.3 (exact), lockfile entries only |
| `src/views/PickrColorPicker.ts` | New: Pickr wrapper, one session per instance, theme and custom swatches, add/remove custom, safe destroy |
| `src/views/ColorPicker.ts` | Deleted (old hand-rolled picker) |
| `src/color-palette.ts` | New: `extractThemeColors` (moved), `rgbToHex` |
| `src/color-palette.test.ts` | Moved from `src/views/ColorPicker.test.ts`, plus `rgbToHex` tests |
| `src/views/PropertiesSidebarView.ts` | `activePicker` (single), `openColorPicker` opens on `data-color` and toggles on reclick, `paintSwatch` helper at all swatch paints |
| `styles.css` | Old `.osmosis-color-picker`/`.osmosis-cp-*` rules replaced by vendored Pickr nano CSS and Obsidian-variable overrides |

### Fixture

Reuses `vault/tests/mindmap/map-style-undo.md` (Ocean theme, so there is a
theme palette; map-level hex colors to test reopening; built for undo
testing). It has no cards, so there was nothing to back-date. To reset after
testing, copy `e2e/fixtures/map-style-undo.md` over it and reload (Ctrl+R).

### Not verified (needs Obsidian)

- Everything visual and interactive: popup placement in a narrow right
  sidebar (`position: bottom-end`, nanopop flips when it doesn't fit), light
  and dark styling, and touch on mobile, including whether the popup sits above
  the mobile sidebar drawer (`z-index: var(--layer-popover)`, as the old
  picker used).
- That one session is one undo step (the live-edit bracketing is unchanged,
  but the change events now come from Pickr).
- Pickr's parsing of theme colors that aren't hex. Unparseable ones are
  silently skipped from the swatch row, and an unparseable stored color opens
  on the fallback.
- No console errors, and no `.pcr-app` left in the DOM after closing the
  sidebar (check with DevTools: `document.querySelectorAll('.pcr-app').length`
  should be 0 when no picker is open).
