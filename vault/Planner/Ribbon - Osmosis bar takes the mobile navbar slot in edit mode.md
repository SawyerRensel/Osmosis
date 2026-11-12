---
title: Ribbon - Osmosis bar takes the mobile navbar slot in edit mode
summary: "On mobile, entering edit mode in a 2D or 3D map hides Obsidian's navbar and drops the Osmosis ribbon into its slot; reading mode restores it. The navbar toggle and the joystick toggle move into the ribbon."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Shared toolbar ribbon]]"
  - "[[3D Graph - Mobile viewport layout and study panel polish]]"
  - "[[3D Graph - Mobile walk and fly joysticks]]"
  - "[[Header - Map header order and overflow menu]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T12:00:00.000Z"
date_modified: "2026-11-12T12:00:00.000Z"
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

The existing bottom ribbon (`TOOLBAR_GROUPS`) becomes "the Osmosis bar", behaving the way Obsidian turns its navbar into the editing toolbar while typing:

- **Mobile, edit mode (2D and 3D):** Obsidian's navbar auto-hides and the ribbon drops into the navbar's slot.
- **Mobile, reading mode:** the navbar comes back; the ribbon sits above it (today's layout).
- **Navbar toggle moves into the ribbon** and works in 2D too (today it's a 3D-only bottom-left button) — a manual override in either mode.
- **Joystick toggle moves into the ribbon:** 3D only, touch devices only (same `Platform.isMobile || maxTouchPoints > 0` gate); the bottom-right corner button goes.
- **Desktop:** unchanged — ribbon always shown in both modes.

## What problem does this solve?

On a phone, the ribbon floats above Obsidian's navbar, eating vertical space while editing, and Osmosis' editing buttons are lower priority than Obsidian's back/forward/tabs. The navbar and joystick toggles are stray corner buttons.

## What's your current workaround?

In 3D, the bottom-left panel button hides the navbar manually; 2D has nothing.

## Decisions (settled with Sawyer, 2026-11-12 UI feedback grilling; not to be re-decided)

- The Osmosis bar **is** the existing ribbon — no second toolbar.
- Auto-hide on edit, restore on reading; the in-ribbon toggle overrides for the current mode. Decide and document whether the override persists (today's 3D setting is per-device localStorage `osmosis-graph3d-hide-toolbar`, default off) — keep it simple: suggested is one per-device "navbar hidden in edit mode" preference, default on.
- Navbar hiding stays a **body class + CSS** (Obsidian has no API). It must apply only while an Osmosis map view is the active leaf; re-sync on `active-leaf-change` and on unload so the navbar is never left hidden.
- Joystick toggle: moved, not duplicated; still 3D + touch only; keeps its localStorage state `osmosis-graph3d-sticks`.
- Style is **not** in the ribbon (removed by [[Header - Map header order and overflow menu]]).

## Code facts (scout, 2026-11-12 — spot-check line numbers)

- Ribbon: `src/views/ToolRibbon.ts` (`TOOLBAR_GROUPS` ~`:56`); same ribbon in 3D minus `GRAPH3D_HIDDEN_BUTTONS` (`Graph3DView.ts:447`); entries with `command` become `mindmap-<id>` commands (`main.ts:335`). Hidden during node editing; `editOnly` buttons hidden in reading mode; hidden during a relational study session.
- Navbar hiding today (3D only): `syncMobileToolbar()` (`Graph3DView.ts:94`) toggles body class `osmosis-graph3d-hide-toolbar`; CSS `body.osmosis-graph3d-hide-toolbar .mobile-navbar { display:none }` (`styles.css:4056`); toggle button `.osmosis-graph3d-toolbar-toggle` (`Graph3DView.ts:414-422`, `toggleToolbar` ~`:658`); re-synced on `active-leaf-change`. Generalise the class name (e.g. `osmosis-hide-navbar`) since 2D will use it.
- Ribbon placement: 2D mobile `.is-mobile .osmosis-toolbar { bottom: 80px }` (`styles.css:569`); 3D `bottom: calc(size-4-2 + --osmosis-graph3d-lift)`, lift 84px on mobile unless the navbar is hidden (`styles.css:4048, 4314`). When the navbar is hidden the ribbon should sit at the navbar's position (respect safe-area inset).
- 2D reading/edit: `setReadingMode` (`MindMapView.ts` ~`:789-807`). 3D edit toggle: `showEditAction` (`Graph3DView.ts` ~`:680`).
- Joysticks: `src/views/Graph3DSticks.ts` (`gamepad-2` toggle), state at `Graph3DView.ts:68, 480`.
- Ribbon buttons are view-agnostic today; the joystick button needs a "3D + touch only" visibility rule (like `GRAPH3D_HIDDEN_BUTTONS`, inverted).

## Context budget

This is the largest of the batch. Keep it under ~140k tokens: `MindMapView.ts` (~84k tokens, NUL bytes) must be grepped with `grep -a` and read only around `setReadingMode`; read `styles.css` (~33k tokens) by range around the lines above. If the session runs long, split the joystick move into its own follow-up rather than pushing on.

## Acceptance criteria

- Phone, 2D and 3D: toggling to edit hides Obsidian's navbar and the ribbon occupies its slot; toggling to reading restores the navbar with the ribbon above it.
- Switching to a non-Osmosis leaf (or closing the view) always restores the navbar.
- The ribbon has a navbar toggle on mobile (2D and 3D); the old bottom-left 3D button is gone.
- 3D on a touch device: ribbon has the 🎮 toggle; the corner button is gone; state persists. 2D never shows it.
- Desktop: no visible change apart from the joystick button on touch-screen desktops.

## Test plan

Unit: pure helper deciding `navbarHidden(isMobile, editMode, override)` and ribbon button visibility per view/platform.

Manual (Ctrl+R after build), phone:
1. 2D map, reading mode → navbar visible, ribbon above it. Switch to edit → navbar gone, ribbon at the bottom edge.
2. Same in 3D.
3. Ribbon navbar toggle → brings the navbar back / hides it.
4. Open a plain note in another tab and switch to it → navbar visible.
5. 3D: 🎮 in ribbon toggles joysticks; no corner button; 2D ribbon has no 🎮.
Desktop: ribbon looks as before in 2D and 3D.
