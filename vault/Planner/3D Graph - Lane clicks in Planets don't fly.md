---
title: 3D Graph - Lane clicks in Planets don't fly
summary: "In Planets mode, clicking a lane (the bowed arc between two notes' planets) doesn't start the fly-along ride. P1 says a lane click rides the lane's arc and lands in the hover view."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
  - "[[3D Graph - Smooth hover arrival in Planets]]"
status: Done
priority:
progress:
date_created: "2026-11-10T04:34:27.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-10T04:34:27.000Z"
date_start_actual: "2026-11-10T04:34:27.000Z"
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

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Obsidian desktop |
| Operating System | Linux |

## What happened?

Sawyer: "Click the edges/arcs between notes in planets view isn't triggering the fly-to animation"

## What should have happened?

As P1 of [[3D Graph - Planets mode]] specifies: clicking a lane rides the lane's arc and lands in the hover view over the plate at the far end (the arrival blend from [[3D Graph - Smooth hover arrival in Planets]]). A click anywhere along the drawn arc, within the same pixel tolerance as a straight edge, should start the ride. Organic and Flat slices edge clicks are unchanged.

## Where is this file located?

`vault/tests/graph3d/Sailing Basics.md`, `Anchor Balance.md`, `Anchor Radial.md`

## Steps to Reproduce

### 1. Start from

Open `tests/graph3d/Sailing Basics.md` in the 3D graph at depth 2.

### 2. Prep/settings

Overlays → Layout: Planets.

### 3. Do this

Orbit until a bright lane between two planets is in view.

### 4. Trigger

Click the middle of the lane's arc. Nothing happens (the selection clears, the camera stays).

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit: 66f66ff on `fix/3d-graph-planets-lane-click` (stacked on 3b3ad35).

### The cause

The click was not swallowed. It reached `edgeNear` in `Graph3DScene.ts` as it does in Organic (no plate under it, no panel, so empty-space click → edge pick). But `edgeNear` gave `pickEdge` each edge as the **straight segment between its two ends**, while `writeEdges` draws a Planets lane through `planetEdge(...).points`, which is `laneArc`: bowed out of both planets by a quarter of the lane's length. At the middle of a lane the drawn arc and the chord the picker tested are a quarter-span apart, far outside the 16 px (mouse) / 32 px (touch) slop. Near the plates the two nearly meet, so only a click close to an end ever hit. The ends themselves were right: lanes are drawn and picked between the same two surface plates, not between planet cores, and both iterate the same `this.links` (item 5's `buildLanes` list only drives the pull). Surface arcs (hierarchy and embed edges within one planet) had the same mismatch.

Organic edge clicks fly because there the drawn edge is the straight segment.

### The fix

- `src/graph3d/edgepick.ts`: `DrawnEdge` is now a polyline, `{ points }`. `pickEdge` measures each segment exactly as before (clipped to the near plane and the mist, distance on screen, depth tie-break) and an edge's distance is its nearest segment's.
- `edgeNear` passes the points the edge is drawn through: `planetEdge(kind, source, target).points` when a Planets world exists (lane: `LANE_SEGMENTS` 12, surface arc: `ARC_SEGMENTS` 6, tunnel and stalk: straight), otherwise the two ends. The same function draws them, so picking can't drift from drawing.
- The ride itself needed nothing: once picked, `rideAlong` already starts the bowed ride, and item 4's second-half blend lands it in the hover pose.

### Decisions worth remembering

- **Picking reuses `planetEdge`, not a copy of its sampling.** If the drawing changes, picking follows.
- **Slop is unchanged** (`PICK_SLOP_PX`, the same for straight edges and arcs), as the ticket asked.
- **Plates still win over edges.** A lane that crosses a plate on screen gives the click to the plate, as in Organic. I didn't change the click order.
- **Organic / Flat slices are unchanged.** A two-point polyline is the old segment, and all the old `pickEdge` tests pass unchanged apart from the edge literal's shape.

### Surface map

| File | Change |
| --- | --- |
| `src/graph3d/edgepick.ts` | `DrawnEdge` is a polyline; `pickEdge` tests each segment |
| `src/graph3d/edgepick.test.ts` | Literals moved to `{ points }`; new Planets-lane tests (built with `laneArc`): bowed middle hits, chord midpoint misses, nearer of two lanes wins |
| `src/views/Graph3DScene.ts` | `edgeNear` picks on `planetEdge(...).points` in Planets mode |

### Fixture

No new fixture. Use `vault/tests/graph3d/Sailing Basics.md` (depth 2), plus `Anchor Balance.md` / `Anchor Radial.md`.

### Manual test

1. Open `tests/graph3d/Sailing Basics.md` in the 3D graph at depth 2. Overlays → Layout: Planets.
2. Orbit until a bright lane between two planets is in view. Click the **middle** of its arc, where it bows farthest from the straight line between its plates. Expected: the camera rides along the bow and lands hovering over the far plate, text upright.
3. Click empty space where the straight line between the two plates would run (inside the bow). Expected: nothing rides (the selection clears).
4. Click a surface arc (a hierarchy edge curving over one planet) at its middle. Expected: it rides to its far end.
5. Switch Layout to Organic, then Flat slices, and click an edge in each. Expected: it rides as before.

### Not verified

I can't see Obsidian, so I didn't watch a real lane click or the ride's look. The fix is checked by the unit tests and by reading the code.
