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
status: To-Do
priority:
progress:
date_created: "2026-11-12T06:30:00.000Z"
date_modified: "2026-11-12T06:30:00.000Z"
date_start_scheduled:
date_start_actual:
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
