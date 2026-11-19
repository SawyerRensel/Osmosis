---
title: Style sidebar - Sliders snap back after release
summary: "Batch 12 (T93). Style sidebar sliders (e.g. branch width) change the value while dragged but the knob snaps back to its old spot on release."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Style sidebar - Replace the color picker with Pickr]]"
status: In-Review
batch: 12
priority:
progress:
date_created: 2026-11-18T12:00:00.000Z
date_modified: 2026-11-19T04:10:00.000Z
date_start_scheduled: 2026-11-19T03:39:28.000Z
date_start_actual: 2026-11-19T03:39:28.000Z
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

# Style sidebar - Sliders snap back after release (T93)

## What happened?

In the style sidebar (`PropertiesSidebarView`), sliders such as **branch
width** behave like this (Sawyer):

> I'll drag it and the number will change and the color bar will stay put, but
> after releasing the mouse the knob/circle will snap back to its original
> position on the slider.

So the value applies and the displayed number updates, but the slider control's
visual position doesn't stay where it was dropped.

## What should have happened?

The knob stays where it is released. Reopening the sidebar or selecting the same
node shows the knob at the stored value.

## Leads (not verified)

- The sidebar re-renders on style change (a `refresh()` path around
  `PropertiesSidebarView.ts:497`), and a re-render may rebuild the slider from a
  **stale** value (read before the write landed, or from the theme default
  instead of the node override). That would explain the snap back after
  release, when the live-edit session ends (`endLiveEdit`).
- Or the slider is rebuilt, and `setValue` runs before `setLimits`, so the value
  is clamped.
- "Color bar stays put": check whether the filled track is a CSS
  custom-property gradient that isn't updated.

Diagnose with a reproduction first (skill `diagnosing-bugs`), then fix. If one
cause covers every slider, fix it once and don't patch each slider.

## Scope

All sliders in the style sidebar: node style (~1874–2216) and branch/edge style
(~2843–2934). The 3D Overlays menu sliders are **not** in scope unless they
share the cause.

## Acceptance criteria

- [ ] Every style-sidebar slider keeps its knob where released, for a node override and for a theme-level value.
- [ ] Reselecting the node, or closing and reopening the sidebar, shows the stored value.
- [ ] Undo of the slider change (map undo) moves the knob back too.
- [ ] No extra re-renders were added to the drag path. Drags stay one undo step (`beginLiveEdit`/`endLiveEdit`).

## Test plan

Manual: open a mind map, select a node, open the style sidebar. Drag Branch
width from its value to another and release → the knob stays, and the branch
redraws. Click another node and come back → it's still there. Repeat for border
width and font size, and for one map-level slider (horizontal spacing).

## Context budget (~25k tokens)

| Read | Range | ~Tokens |
|---|---|---|
| `src/views/PropertiesSidebarView.ts` | 1–200 (fields, lifecycle), 480–520 (refresh), 1860–1910, 2020–2230, 2830–2940 (sliders), 3141–3170 (live edit) | ~9k |
| `src/views/sidebar-setting.ts` | whole | 0.3k |
| `src/views/style-host.ts` | `beginLiveEdit`/`endLiveEdit`/refresh | ~1k |
| `styles.css` | `grep -n "slider"` hits in the sidebar | ~1k |

Don't open `MindMapView.ts` whole (~84k tokens). Grep it for the style-host
methods only.

## Batch implementation notes (awaiting manual test)

Code commit: `fix(T93): Style sidebar sliders keep their knob where released` on
`batch/12-study-tab`.

### The cause

Two faults stacked.

1. **The refresh bypassed the slider component.** Both refreshers
   (`refreshFormatControls` for the Node tab, `refreshMapStyleControls` for the
   Map tab) wrote stored values straight into `sliderEl.value`. In Obsidian
   1.13 (`ref/obsidian-core/app.js`, class `og`), the inline number and the
   filled track ("color bar") are drawn by `SliderComponent.updateDisplay()`,
   which sets the `--slider-fill-ratio` CSS property (`app.css`:
   `input[type=range].slider` paints its gradient from it). `updateDisplay` runs
   on `input` events, `setLimits` and `setValue`, never on a bare `.value =`. So
   any refresh that wrote a value that differed from the drag moved **the knob
   alone**, and the number and fill stayed at the dragged value. That is
   exactly Sawyer's report.
2. **The value the refresh wrote was stale on map-level sliders.**
   - `saveSetting`, `saveBaseStyleProp` and `saveMapScalarSetting` update the
     view's in-memory style cache with
     `mindMap.getOsmosisStyleFrontmatter() ?? {}`. On a note with no
     `osmosis-styles` yet the cache is `undefined`, so the write went into a
     throwaway `{}` that was never stored. The file and the render were right,
     but the next refresh read the old cache and wrote the theme default into
     the knob. (The theme dropdown path already called
     `setOsmosisStyleFrontmatter`, so it was fine.) A second write on the same
     fresh note also rebuilt map settings from that throwaway object only, so
     earlier map-level changes dropped out of the live render until a reload.
   - Map **Branch → Thickness** did `void this.saveMapScalarSetting(...)` and
     then refreshed synchronously, so it always refreshed before the write
     landed, on every note.

   Node-tab sliders read fresh values. `writeNodeStyleOverrides` stores the
   cache properly, and `writeNodeStyle` awaits the write before refreshing. So
   from code reading, node sliders only showed the knob/number split when a
   refresh legitimately changed the value. Undo is one example: undo did not
   notify the sidebar at all, so after an undo the knob, number and fill all
   kept the undone value.

There was no runnable reproduction: views can't load in Vitest, and the batch
skips Playwright. The diagnosis comes from reading Obsidian's shipped
`SliderComponent` and CSS together with the sidebar's write and refresh paths.

### The fix

- `src/slider-sync.ts` → `bindSlider(slider, onUserChange)`. It wires the
  slider's `onChange` and returns a setter, `ShowSliderValue`. The setter calls
  `SliderComponent.setValue` (knob, number and fill move together) behind a
  guard that swallows the change callback `setValue` fires. Without the guard,
  every refresh would become a write. All 12 style-sidebar sliders use it
  (7 Map tab, 5 Node tab). The fields now hold the setter instead of the
  `HTMLInputElement`, and refreshers call `this.x?.(value)`.
- The three map-level save helpers call `mindMap.setOsmosisStyleFrontmatter(...)`
  before `applyMapSettings`.
- Map Branch Thickness now `await`s its save before refreshing.
- `MindMapView.onHistoryApply` / `offHistoryApply` fire at the end of
  `applySnapshot` (undo and redo). The sidebar subscribes next to its selection
  listener (`setupSelectionListener`, cleaned up with it) and re-reads both
  tabs.

### Decisions worth remembering

- **Do not "simplify" back to `sliderEl.value = …`.** That is the bug. Also do
  not call `slider.setValue` without the guard: Obsidian's `setValue` fires the
  change callback whenever the value differs, so a refresh would write to the
  file and push an undo step.
- **Do not dispatch a synthetic `input` event** to repaint the display.
  Obsidian's `input` handler calls `navigator.vibrate(100)`, so phones would
  buzz on every refresh.
- **No drag-path re-renders were added.** Sliders keep Obsidian's default
  `instant = false`, so the write still happens once, on release (`change`),
  as one undo step. Sliders never used `beginLiveEdit`/`endLiveEdit`: one write
  per release is already one step. Only the colour picker brackets with them.
- **The undo hook is MindMapView-only.** 3D-graph style undo was out of scope.
  The hook refreshes slider, dropdown and swatch values, but it does not rebuild
  the theme dropdown or the variant list. Undoing a theme switch still shows
  the old theme name until the sidebar re-renders (existing behaviour,
  untouched).

### Facts for T94 (Pickr in the same file)

- **Re-render triggers.** Calling `updateContext()` empties and rebuilds the
  whole sidebar. It runs on workspace `active-leaf-change` and `layout-change`,
  and on the mind map's `onFileLoad` (one-shot, via `listenForFileLoad` →
  `forceUpdateContext`). It returns early when the same map and file are
  already shown. `closeAllPickers()` runs before every rebuild.
- **Value refreshes (no rebuild).** `updateFormatTabState()` → `refreshFormatControls()`
  runs on the host's `onSelectionChange`, on switching to the Node tab, and on
  undo/redo (`onHistoryApply`, new here). `refreshMapStyleControls()` runs
  after most Map-tab control writes and on undo/redo.
- **Commit paths.** Node tab: `writeNodeStyle(update)` →
  `host.applyNodeStyleOverrides` (one edit group, then `render()`), then
  `refreshFormatControls()`. Map tab: `saveBaseStyleProp` (baseStyle fill,
  border, text), `saveMapScalarSetting` (`background`, `branchLineColor`,
  `branchLineThickness`) and `saveSetting` (layout keys). All three go through
  `writeMapFrontMatter` → `processFrontMatterTracked`, then update the cache and
  call `applyMapSettings` (re-render).
- **Colour picker today.** `openColorPicker(anchor, initial, onChange)`
  (≈ line 3119) calls `host.beginLiveEdit()` on open and `endLiveEdit()` in
  `onClose`. Every drag tick's `onChange` writes, and the session collapses
  them into one undo step. The vault `modify` reload is suppressed while
  `recorder.live`. The swatch call sites set `swatch.style.backgroundColor`
  themselves and fire the save with `void` (no await). Two map-level ones, at
  ≈ 1951 (background) and ≈ 2206 (branch colour), never refresh. Now that the
  cache is stored back, a later `refreshMapStyleControls` reads the right
  colour.

### Surface map

| File | Change |
|---|---|
| `src/slider-sync.ts` | New: `bindSlider` and `ShowSliderValue`, the guarded slider setter |
| `src/slider-sync.test.ts` | New: user change passes through, refresh does not write, guard re-arms after a throw |
| `src/views/PropertiesSidebarView.ts` | All 12 sliders bound through `bindSlider`; refreshers use the setter; map save helpers store the cache; Branch Thickness awaits; subscribes to `onHistoryApply` |
| `src/views/MindMapView.ts` | `onHistoryApply` / `offHistoryApply`, fired after `applySnapshot` renders |
| `e2e/fixtures/slider-snap-back.md`, `vault/tests/mindmap/slider-snap-back.md` | New fixture: a sailing map with **no** `osmosis-styles` frontmatter |

### Test fixture

`vault/tests/mindmap/slider-snap-back.md` (master: `e2e/fixtures/slider-snap-back.md`).
It has no cards, so there are no dates to back-date. It holds no frontmatter on
purpose, because the first map-level slider write on such a note is the case
that used to drop. After one drag the note gains `osmosis-styles`. To re-test
the fresh case, copy the master over it and press Ctrl+R before testing.
`vault/tests/mindmap/map-style-undo.md` covers a note that already has
frontmatter.

### Not verified

- Nothing was run in Obsidian. The whole UI path, including the knob, number
  and fill staying together, is for Sawyer's manual test.
- Whether Node-tab sliders visibly snapped before the fix is inferred from code,
  not observed. If one still snaps, its refresh value is wrong somewhere in
  `resolveNodeStyle` (for example, an active variant's style shadowing the
  `styles` entry the write went to). That would be a separate cause.
