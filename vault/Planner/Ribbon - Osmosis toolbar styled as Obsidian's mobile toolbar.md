---
title: Ribbon - Osmosis toolbar styled as Obsidian's mobile toolbar
summary: "Rebuild the Osmosis bar (the 2D/3D ribbon) as a proper Obsidian-style mobile editing toolbar: one look on phone and desktop, bottom-centre floating on desktop in both modes, in the navbar's slot on phones in edit mode only, with 3D's help button as its last button."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Ribbon - Osmosis bar takes the mobile navbar slot in edit mode]]"
  - "[[3D Graph - Shared toolbar ribbon]]"
  - "[[3D Graph - Mobile walk and fly joysticks]]"
status: Done
priority:
progress:
date_created: "2026-11-12T06:30:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T10:40:38.000Z"
date_start_actual: "2026-11-12T10:40:38.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

Sawyer's test of [[Ribbon - Osmosis bar takes the mobile navbar slot in edit mode]] (T58), 2026-11-12:

> The ribbon in 2d/3d mind map view shouldn't "replace" the navigation toolbar — the ribbon items should become the mobile toolbar just like Obsidian's edit mode mobile toolbar displays when editing a note. Let's port our buttons over from our original ribbon and make a proper obsidian mobile toolbar for 2d/3d mind map view. Let's move the help button from the bottom left to our new mobile toolbar.

T58 moved the *old ribbon* (its own look, its own sizing) into the navbar slot. What Sawyer wants is the bar to **be** an Obsidian mobile toolbar, in the look of Obsidian's editing toolbar (`.mobile-toolbar`), which appears in the navbar's place when you edit a note on a phone: one rounded strip of plain icon buttons. The buttons are the ones we already have (`TOOLBAR_GROUPS`, minus 3D's hidden ones, plus the bar toggles).

Reference screenshot (the annotated original request, `vault/media/osmosis-bar-navbar-request.png`): ![[osmosis-bar-navbar-request.png]] — the lower-left phone in it shows Obsidian's editing toolbar (`>≡ <≡ ↰ ↱ [] ↶ ⧉ ⊤`).

## Decisions (settled with Sawyer, 2026-11-12 grill; do not re-decide)

- **One bar, one look, every platform.** Style it after Obsidian's own mobile toolbar: read the real rules from `ref/obsidian-core/app.css` (a single minified line, so use `grep -o '\.mobile-toolbar[^}]*}'` and similar; never print the file) and reuse Obsidian's CSS variables, so themes restyle it the way they restyle Obsidian's toolbar. Ideally reuse Obsidian's class names/DOM (`mobile-toolbar`, `mobile-toolbar-options-container`, `mobile-toolbar-option`) only if they do not drag in unwanted Obsidian behaviour; otherwise copy the look onto our own `osmosis-toolbar*` classes. Record which, and why.
- **Desktop:** the bar floats at the **bottom centre** of the map view, shown in **both** reading and edit mode (today it is elsewhere; move it).
- **Phone:** the bar exists **in edit mode only**, sitting in the navbar's slot with the navbar hidden (T58's behaviour, kept). In **reading mode there is no bar at all**; the navbar shows as normal. Sawyer accepted the consequence: on a phone in reading mode, fit/zoom/node menu, 🎮 and help are not reachable (joysticks keep their last state).
- **Navbar toggle** stays in the bar (phones, edit mode) so the user can bring the navbar back. Reading mode no longer has a bar, so T58's reading-mode navbar preference (`osmosis-hide-navbar-reading`) is moot: reading mode always shows the navbar. Simplify `navbarHidden` accordingly and drop the dead key.
- **🎮 joystick toggle** stays in the bar (3D, touch only, as T58).
- **Help (?) button: 3D only, the LAST button on the bar.** Remove it from the bottom-left corner (the flight-speed readout stays there). 2D gets no help button (it has no help panel). The help panel itself is unchanged; anchor/position it sensibly now that its button is in the bar.
- Everything else from T58 stands: the bar is hidden while a node is being edited and during a relational study session; navbar hiding is the body class `osmosis-hide-navbar`, synced on `active-leaf-change`, mode change and close.

## Open questions for the implementer (decide, record)

- Tablets: Obsidian hides `.mobile-navbar` on tablets already. Treat tablets like desktop (bottom-centre, both modes) or like phones? Suggested: like phones only where `Platform.isPhone`; tablets like desktop. Record the call.
- Overflow: on a narrow phone the bar has more buttons than fit. Obsidian's toolbar scrolls horizontally; do the same.
- Dividers between groups: Obsidian's toolbar has none. Keep a subtle gap or drop the dividers; match the Obsidian look.

## Code facts

- Bar: `src/views/ToolRibbon.ts` (`TOOLBAR_GROUPS`, `ToolRibbon` class with `toggles` option and `setPressed`, `barToggles`, `navbarHidden`, `syncNavbar`). See T58's "Batch implementation notes" for the full map.
- Placement CSS: `styles.css`, search `osmosis-toolbar`, `osmosis-hide-navbar`, `--osmosis-graph3d-lift`, `--navbar-bottom-offset`. Read by range.
- 2D host: `src/views/MindMapView.ts` (`setReadingMode`, `navbarEditMode`, `showNavbar`). 3D host: `src/views/Graph3DView.ts` (`setEditMode`, ribbon construction, `toggleSticks`).
- Help: `src/views/Graph3DHelp.ts` (constructor takes `(container, corner)` and creates `.osmosis-graph3d-help-toggle` in the corner); constructed in `src/views/Graph3DScene.ts` ~`:609-620`, bottom-left corner with the speed readout.
- T60's gizmos sit at the 3D view's top right (desktop, no touch screen); don't collide with them.

## Context budget

Keep under ~140k tokens. `MindMapView.ts` is ~84k tokens and contains NUL bytes: never read it whole, use `grep -a -n` and read small ranges. `styles.css` (~33k), `Graph3DScene.ts` (~37k) and `Graph3DView.ts` (~30k): read by range. `ref/obsidian-core/app.css` is one huge line: only `grep -o` targeted rules.

## Acceptance criteria

- Desktop, 2D and 3D, reading and edit: the bar floats bottom-centre and looks like Obsidian's mobile toolbar (rounded strip, plain icons, theme variables). Edit-only buttons still hide in reading mode.
- Phone, edit mode: navbar hidden, bar in its slot, same look; navbar toggle brings the navbar back.
- Phone, reading mode: no bar, navbar shown.
- 3D: help (?) is the bar's last button and opens the same help panel; no help button in the bottom-left corner. 2D has no help button.
- 🎮 still in the 3D bar on touch devices.
- Switching to a plain note or closing the map always restores the navbar.

## Test plan

Unit: updated `navbarHidden` (reading always shown), bar visibility per platform/mode, button order (help last in 3D).

Manual (Ctrl+R after build): desktop 2D + 3D in both modes; phone 2D + 3D in both modes; help opens from the bar; navbar toggle; plain-note tab restores navbar.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code: commit `2d76c24` on `feature/osmosis-mobile-toolbar` (stacked on `fix/round-8-feedback`). The whole ticket shipped; nothing split off.

### Approach
- **Look.** The bar copies Obsidian's editing toolbar from `ref/obsidian-core/app.css`: an outer pill (`.osmosis-toolbar`, like `.mobile-toolbar-options-list-container`: radius `--touch-size-m`, `overflow: hidden`) around a scrolling strip (`.osmosis-toolbar-list`, like `.mobile-toolbar-options-list`: height `--touch-size-m` (44 px), padding `0 --size-4-1`, horizontal scroll with no scrollbar). Buttons (like `.mobile-toolbar-option`) are `--toolbar-option-width` wide (40 px phone, 50 px tablet, 40 px fallback on desktop), full height, with `--icon-l` icons in `--text-normal`. The background, blur and shadow are Obsidian's raised-surface variables (`--raised-background`, `--raised-blur`, `--raised-shadow`), and the pill also carries Obsidian's own `mod-raised` class, which the real toolbar and navigation bar use. On phones that adds the floating-nav blur, shadow and iOS edge mask, so themes restyle the bar the way they restyle Obsidian's.
- **Visibility.** `barShown(state, isPhone)` in `ToolRibbon.ts` (pure, tested): hidden while a node is being edited, and on a phone in reading mode. `updateState` applies it.
- **Navbar.** One preference only, `osmosis-hide-navbar-edit` (`NAVBAR_STORAGE_KEY`, default on). `navbarHidden(isPhone, editMode, hideInEdit)` is now `isPhone && editMode && hideInEdit`, and reading mode always shows the navbar. `toggleNavbarPref(app)` takes no mode.
- **Help.** `BarToggle` gains `"help"`, and `barToggles("3d", …)` always puts it last (order: navbar, sticks, help). `Graph3DHelp` moved from the scene to the view (`Graph3DView.help`). It takes the bar's help button, from the new `ToolRibbon.toggleButton(id)`, marks it `is-active`/`aria-pressed`, and ignores clicks on it in its outside-click handler. Escape now asks `this.help.close()`. The scene's corner keeps only the speed readout, and `closeHelp` is gone from the scene.
- **3D layout.** `.osmosis-graph3d` defines `--osmosis-graph3d-bar-bottom` (`--size-4-2` + lift, or `--navbar-bottom-offset` under `osmosis-hide-navbar`) and `--osmosis-graph3d-above-bar` (bar bottom + `--touch-size-m` + `--size-4-2`). The joysticks, the speed readout and the help panel all sit at the above-bar line, so the bar never covers them. The speed readout also rises above the left joystick when the sticks are up. On a phone with no bar (reading mode, or while a line is edited), above-bar falls back to `--size-4-2` + lift, which keeps the joysticks where they were before.

### Decisions (the ticket's open questions)
- **Tablets work like desktop.** The bar shows in both modes, at the bottom centre, and has no navbar toggle. Everything keys off `Platform.isPhone` (bar visibility, navbar hiding, the toggle) and the CSS `body.is-phone` (the 80/84 px lift), because Obsidian already hides `.mobile-navbar` on tablets (`body.is-tablet .mobile-navbar{display:none}`). The 🎮 gate is unchanged: `Platform.isMobile || navigator.maxTouchPoints > 0`.
- **Overflow scrolls horizontally**, as Obsidian's toolbar does. The wheel scrolls it on desktop.
- **Dividers became a plain 8 px gap** (`--size-4-2`, no rule). Obsidian's toolbar has no dividers, but the gap keeps our groups readable. The divider elements stay, so the reading-mode collapse logic is untouched.
- **Our own classes, not Obsidian's.** `.mobile-toolbar-option` sets a monospace font, its `--toolbar-option-width` is unset on desktop, and `.mobile-toolbar` is an app-region drag area pinned above the keyboard. Theme snippets aimed at the editor's toolbar would also leak in. So the rules are copied onto `osmosis-toolbar*`, and only `mod-raised` (a pure surface style) is shared.
- **The help panel opens centred above the bar** (bottom = the above-bar line, z-index above the bar).
- **The old key is not deleted.** `osmosis-hide-navbar-reading` is simply no longer read or written.
- The 3D bar keeps its 56 px side margins: Obsidian's status bar sits bottom right on desktop.

### Overlap check (styles.css bottoms)
- The speed readout is moved above the bar's line, so a wide bar cannot cover it.
- The joysticks are above the bar. On touch desktops: bar 8–52 px, sticks from 60 px. On a phone in edit mode they clear the bar in the navbar slot.
- The relational study panel hides the bar, unchanged. With sticks up, the study panel sits above the sticks (rule updated to the new variable).
- The Find bar and T60's gizmos are at the top right: no conflict.
- 2D: the only other bottom item is `.osmosis-contextual-progress`, fixed at the bottom right. It can touch the bar only in a very narrow window, as before.

### Surface map
| File | Change |
|---|---|
| `src/views/ToolRibbon.ts` | `help` toggle; `barToggles` takes `isPhone`; `barShown`; single `NAVBAR_STORAGE_KEY`/`readNavbarPref`; `navbarHidden` simplified; `toggleNavbarPref(app)`; outer pill + `listEl`; `toggleButton(id)` |
| `src/views/ToolRibbon.test.ts` | toggle order (help last in 3D, none in 2D), `barShown` per platform/mode, new navbar rule |
| `src/views/Graph3DView.ts` | owns `Graph3DHelp`, wired to the bar's last button; Escape closes it; `isPhone` gate |
| `src/views/Graph3DScene.ts` | help removed; corner holds only the speed readout |
| `src/views/Graph3DHelp.ts` | no own button; takes the bar's button |
| `src/views/MindMapView.ts` | `isPhone` gate; `toggleNavbarPref(app)` |
| `styles.css` | toolbar restyled after Obsidian's; `is-phone` lift; 3D bar/above-bar variables; sticks, readout and help panel above the bar |
| `docs/mind-mapping/editing.md`, `graph-3d.md` | new bar behaviour; help button location |

### Fixture
None new. Use `vault/tests/graph3d/Sailing Basics.md` for 3D and any mind map note for 2D.

### Could not verify
- Everything visual. Whether `--raised-background` reads well on desktop over the 2D canvas and the 3D scene in light and dark themes (on desktop it is 65 % `--background-primary` plus blur, where the old bar was opaque `--background-secondary`).
- How the bar looks on a real phone with `mod-raised`, including whether Android leaves a strip where the navbar was.
- The icon size on desktop: `--icon-l` is 18 px there, in a 44 px tall bar.

