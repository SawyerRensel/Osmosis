---
title: 3D Graph - Hop to another note lands on a stale position
summary: "Clicking a plate that belongs to another note rebuilds the graph, and the camera flies to where that plate was before the rebuild instead of where it is now."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph Phase 3 - Streaming and stability]]"
  - "[[3D Graph - Plates for every node]]"
status: Done
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-10-31T18:00:00.000Z"
date_start_actual: "2026-10-31T18:00:00.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Bug Report

Found in Sawyer's Batch 1 manual test, 2026-10-31 (test 1.4).

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Desktop (Obsidian) |
| Operating System | Linux |

## What happened?

Clicking a plate always hops. A hop within the same note centres correctly. But clicking a plate that belongs to **another file** rebuilds the graph (new hop set), and the view is then often not centred on that node: the camera goes to the plate's *previous* location, from before the rebuild, where it no longer is.

![[2026-10-31 3D graph hop stale target.png]]

(Orange boxes: the clicked plate is at top left, and the camera centred on the empty spot at right.)

## What should have happened?

After any hop, including one that changes the loaded set, the camera ends up centred on the clicked node at its current position, and stays on it while the new arrivals settle.

## Steps to Reproduce

1. Open `tests/graph3d/Sailing Basics.md` → "Open 3D graph for current note", depth 2.
2. Click a plate that belongs to a different note (e.g. the `Weather` title from a `Navigation` line).
3. The graph rebuilds; the camera centres on empty space near where the plate used to be.

## Notes for the implementer

Likely cause to check first: the flight target is captured from the node's position before `setData`/the loaded-set diff runs, or the clicked node is re-seeded (new object or new position) by the rebuild. Fix by resolving the target after the rebuild, or by following the node (by id) during the flight until it settles. Positions are never persisted (Sawyer's decision); don't add persistence to fix this.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Commit 89f65f8 on `fix/3d-graph-batch-1`.

### The cause

Two things combined:

1. **The flight target was frozen at click time.** `Graph3DView.hop()` calls `scene.flyTo(node.id)` *before* `setFocus()` → `reload()` → `setData()`. `startPendingFlight` read the node's position right then and handed it to 3d-force-graph's `cameraPosition(position, target, 1000)`, a fixed tween that never looks at the node again.
2. **The clicked node can still move after the click.** Nodes are pinned only in `settle()`, which runs on the engine's `onEngineStop`, and three-forcegraph stops only after its `cooldownTime` (15 s by default) since the last `graphData()`. So for 15 s after any load, every node that arrived with it is free. A hop to another note calls `setData` → `graphData()`, which re-heats the simulation (`alpha(1)`) and seeds the new note's neighbours (`NOTE_SEED_DISTANCE` 120 from it) with links pulling on its lines. The clicked node, if still free, is dragged away while the camera flies to where it used to be.

That explains "often": a hop made more than 15 s after the previous load hits a pinned node and lands correctly. A hop within the same note doesn't call `setData`, so nothing re-heats.

Node ids are stable across reloads and `setData` keeps the same engine object for a surviving id, so the node is *not* re-seeded. Only its simulated position moves.

### The fix

The flight is now driven from the scene's own `tick()` instead of a 3d-force-graph tween. Each frame, `flightPose()` (pure, `src/graph3d/flight.ts`) eases the camera toward the node's **current** position plus a fixed offset. The offset keeps the viewing direction and the 160/70 distance from before, and uses the same easing (quadratic out, 1 s, facing the node within the first third). When the flight ends on a node that isn't pinned yet, the camera **follows** it: it is translated by the node's per-frame movement until `settle()` pins the node.

### Decisions worth remembering

- **Follow by translation, not re-aim.** After the flight, the camera and orbit target move by the node's delta, so the user's framing is kept and nothing snaps.
- **User input cancels the flight and the follow.** Any canvas pointerdown, a wheel event, or a held flight key cancels them. The old tween ran its full second even while the user dragged, and with per-frame steering that would fight the user harder. This is the one behaviour change outside the bug itself.
- **Pinned nodes need no follow.** A hop to a settled node ends exactly as before.
- `flyTo(id, afterLayout)` (open/follow-active-note flights to the focus core) still waits `SETTLE_TICKS` first, then gets the same tracking flight.
- No positions are persisted (Sawyer's rule).

### Surface map

| File | Change |
| --- | --- |
| `src/graph3d/flight.ts` | New. `startFlight()` and `flightPose()`: a flight that aims at the node's current position. |
| `src/graph3d/flight.test.ts` | New. Covers landing on a node that moved mid-flight (the bug), facing it by one third of the flight, ease-out, and the zero-length direction. |
| `src/views/Graph3DScene.ts` | `startPendingFlight` starts a tracked flight instead of `cameraPosition()`. Adds `steerFlight` (called each tick) and `cancelFlight` (on pointerdown, wheel and flight keys). `setData` drops a flight or follow whose node left. |

### Fixture

Reuses `vault/tests/graph3d/` (sailing web). No new fixture.

### Not verified

I can't see Obsidian. The pure flight maths is unit-tested, but the in-app tracking, its feel, and its interplay with OrbitControls' `update()` are not. In particular, the scene's rAF and 3d-force-graph's render loop are separate, so check that the camera doesn't jitter while following.

### Manual test

1. Open `tests/graph3d/Sailing Basics.md` → "Open 3D graph for current note", depth 2.
2. Within a few seconds of the graph appearing, click a plate from another note (e.g. `Weather`). Expected: the camera ends centred on that plate and stays on it while the new notes fan out.
3. Wait over 15 s, then click a plate in another note. Expected: it lands centred, as before.
4. Click a plate, then drag or scroll during the flight. Expected: the flight stops and the camera stays where you put it.
