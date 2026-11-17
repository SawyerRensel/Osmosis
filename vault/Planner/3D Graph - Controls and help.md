---
title: 3D Graph - Controls and help
summary: "The 3D corner cluster moves bottom-left, a ? button opens an in-view controls list, and the controls are documented on a new docs page."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[Graph pointer gestures - orbit, pan, link, menu]]"
status: Done
priority:
progress:
date_created: "2026-11-09T13:14:30.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-09T13:14:30.000Z"
date_start_actual: "2026-11-09T13:14:30.000Z"
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

# Optimization

Settled with Sawyer; do not re-decide. Keep today's trackpad/mouse scheme (Blender's was rejected). Docs only for controls, no input changes.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Approach.** `.osmosis-graph3d-corner` moved from bottom-right (under Obsidian's status bar) to bottom-left, with `flex-direction: row-reverse` so the DOM order (speed readout, joystick toggle, help button) reads help, joysticks, speed left to right. A new `?` button (`Graph3DHelp.ts`) sits in that cluster and opens a panel above it, rendered from the pure list in `src/graph3d/controls-help.ts`. Esc (the view scope's Escape handler, after a link drag and before the Overlays menu) or a click elsewhere closes it. The docs page is `docs/mind-mapping/graph-3d.md`, in the Mind Mapping nav of `mkdocs.yml`.

**The docs page is hand-written Markdown and must be updated alongside `controls-help.ts`.** The unit test only guards that each group has entries.

**Collisions checked.** Top-left holds the perf toggle; bottom-centre the study panel; the joysticks sit at least 56 px above the corner (left stick at left 16 px), so they clear it. On mobile the Obsidian-toolbar toggle already owns bottom-left, so `.is-mobile` shifts the cluster 40 px right. The phone study panel spans the full width at the bottom (as it did over the old corner); not changed.

**Corrections to the ticket's control list**
- There is no "Focus this note" command or hotkey. The only keyboard route is F (and the plate menu item). The docs say so.
- F does not frame or refocus the camera: it makes the selected plate's note the focus note (loads its surroundings), and does nothing for a plate already in the focus note.
- Long-press does not link. A held finger on a line or note plate opens the plate context menu (any mode); linking from touch is a drag from a line in edit mode.
- Alt+left/right: in edit mode with a line (or several plates) selected it re-levels; otherwise the view passes it on and Obsidian's back/forward runs.
- Tab adds a child, Ctrl/Cmd+Enter adds a parent (while not editing), Delete and Backspace delete.

## Surface map

| File | Change |
|---|---|
| `src/graph3d/controls-help.ts` | New: the controls as data |
| `src/graph3d/controls-help.test.ts` | New: each group present and non-empty |
| `src/views/Graph3DHelp.ts` | New: `?` button and panel |
| `src/views/Graph3DScene.ts` | Builds the help in the corner, `closeHelp()`, destroy |
| `src/views/Graph3DView.ts` | Escape closes the help |
| `styles.css` | Corner moved and reversed, mobile offset, help panel styles |
| `docs/mind-mapping/graph-3d.md`, `mkdocs.yml` | New docs page and nav entry |

## Test fixture

None; use any `vault/tests/graph3d/` fixture.

## Manual test steps

1. Open a note in the 3D graph (desktop): the `?` (and, on a touch screen, the joystick button) sits bottom-left, clear of the status bar. Hold W and scroll while dragging: the speed readout appears to the right of the buttons.
2. Click `?`: the controls panel opens above it. Esc closes it; so does a click on the canvas. Check it in light and dark themes. Esc with the panel open should not also clear the selection.
3. On a touch device: show the joysticks; they clear the corner buttons. On mobile the cluster sits right of the toolbar toggle.
4. Docs: read `docs/mind-mapping/graph-3d.md` (not rendered here).

## Could not verify

Anything visual (I cannot see Obsidian); the exact 40 px mobile offset; the docs build (no preview run).
