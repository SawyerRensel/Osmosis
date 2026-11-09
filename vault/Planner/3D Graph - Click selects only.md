---
title: 3D Graph - Click selects only
summary: "3D Overlays toggle, per device: a plain plate click only selects the plate (accent border, becomes primary), with no flight and no back/forward step. Off by default, where a click flies and selects as before."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Arrow-key navigation]]"
  - "[[3D Graph - Multi-select]]"
status: In-Review
priority:
progress:
date_created: "2026-11-09T12:58:35.000Z"
date_modified: "2026-11-09T13:10:00.000Z"
date_start_scheduled: "2026-11-09T12:58:35.000Z"
date_start_actual: "2026-11-09T12:58:35.000Z"
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

An Overlays toggle in the 3D graph, "Click selects only" (settled by Sawyer, 2026-11-09).

- **Off (default):** a plate click flies and selects, as today.
- **On:** a plain plate click only selects the plate (accent border, becomes primary). No camera move, no flight, and no back/forward history step, because the camera did not move.
- Arrow keys (glide), F, search jumps, edge rides and back/forward still move the camera.
- Shift+click, Alt+drag, double-click to edit, the right-click menu, panel links and checkboxes are unchanged.
- Stored per device, applying to every 3D view.

## What problem does this solve?

Clicking a plate to select it for multi-select actions or arrow navigation also throws the camera at it.

## What's your current workaround?

Shift+click selects without flying, but only adds to the selection.

## Batch implementation notes (awaiting manual test)

**Approach.** The toggle lives in the Overlays menu under Camera. It is stored in Obsidian's vault-scoped localStorage (`osmosis-graph3d-click-selects-only`), the same way the joysticks and the hide-toolbar setting are, not in the synced `graph3dOverlays` settings. The scene reads it through an option callback at every click, so every open 3D view follows a change at once and the menu needs no cross-view sync. In `Graph3DScene.click`, the plain-click plate branches (a panel's non-firing area, or the plate itself) still call `select`; with the toggle on they set `focusId` to the plate (primary) and skip `onNodeClick`, which is what starts the flight and the history step (`clickNode` to `visit` to `navigate`).

**Decisions.**
- Per device is localStorage, not settings: the existing pattern for per-device toggles.
- The toggle sits in the Overlays menu (the menu does not store it; the view passes a get/set pair).
- `onNodeClick` still fires on a select-only click, now with a `selectOnly` flag: the view's `clickNode` runs `study.clicked` (reveal/advance) either way and skips only `visit` (flight and history step) when the flag is set. The toggle is about the camera alone.
- Plain click on empty space and on an edge (ride) is unchanged; the ride still moves the camera.
- No unit test: the decision is a single boolean branch inside the Three.js scene's click handler (not importable under vitest), with no pure logic to extract.

| File | Change |
|---|---|
| `src/views/Graph3DScene.ts` | `clickSelectsOnly` option; select-only branch in `click` |
| `src/views/Graph3DView.ts` | storage key, option and menu get/set wiring |
| `src/views/Graph3DOverlays.ts` | `DeviceToggle`, "Click selects only" toggle |

**Fixture.** Reuses `vault/tests/graph3d/` fixtures; none new.

**Not verified.** Everything in Obsidian; I cannot see it.
