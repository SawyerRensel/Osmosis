---
title: 3D Graph - Smooth hover arrival in Planets
summary: "In Planets mode the camera arrives smoothly, then whips round the plate to face it. Arriving and pivoting round to face the front of the plate should be one eased flight: position, look direction and up together."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
status: Done
priority:
progress:
date_created: "2026-11-10T04:04:40.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-10T04:04:40.000Z"
date_start_actual: "2026-11-10T04:04:40.000Z"
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

Sawyer: "It's smooth up until we arrive at the node, but then the camera suddenly rotates around the node so fast it feels jarring. Arriving and pivoting around to face the front of the node should be one smooth animation."

## What should have happened?

Position, look direction and up move as one eased flight, with the same easing and duration (scaled by the travel-speed overlay), ending exactly in the hover pose: on the plate's outward normal, looking down at it, global up at the top of the screen. Nothing moves the camera on its own after arrival. Applies to plate clicks, arrow-key moves and the end of a lane ride (which blends into the hover pose over the ride). Organic and Flat slices are unchanged.

## Where is this file located?

`vault/tests/graph3d/Sailing Basics.md`, `Anchor Balance.md`, `Anchor Radial.md`

## Steps to Reproduce

### 1. Start from

Open `tests/graph3d/Sailing Basics.md` in the 3D graph at depth 2.

### 2. Prep/settings

Overlays → Layout: Planets.

### 3. Do this

Click a plate seen at a slant, or click a lane between two planets.

### 4. Trigger

The camera arrives, then swings round the plate to its normal in a fraction of a second.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Cause.** Planets' hover view (`Graph3DScene.hoverOver`, from P1 of [[3D Graph - Planets mode]]) was not a flight. It was an edit-style glide: a fixed `GLIDE_MS` of 400 ms, ignoring the travel-speed overlay, that moved the camera and its orbit target each in a straight line. Two things made that jarring:

- **Plate clicks and arrow keys.** The look direction is target − position, which under that glide is a straight blend of the start and end look vectors. When the camera starts much farther from its target than the hover distance, the blend keeps pointing the old way until near the end. From 10 times the hover distance, half the turn only arrives 91% of the way along (10/11). So the camera closes in, then whips round in the last few frames, all inside 0.4 s.
- **Lane rides.** The ride ran its 1.5 to 4 s along the arc and stopped at the stand-off, looking along the lane. Only then did `steerFlight` call `hoverOver`, starting that 400 ms glide, which swung the camera round the plate onto its normal. The arrival's `onNodeArrived` → `visit` → `flyTo` → `hoverOver` then restarted the glide a moment later, at full ease-out speed again.

The camera's up was never animated. It stayed world +y throughout, and `lookAt` derived the orientation from the two points.

**Fix.** There is a new pure module, `src/graph3d/hover.ts`.

- **One flight.** A hover flight (`startHover` / `hoverFlightPose`) runs position, orientation and the distance to the orbit target on one ease-out curve over `FLIGHT_MS / travelSpeed`. That is the same time and the same ease-out a plate click takes in Organic.
- **Orientation.** The start orientation is the camera's own quaternion, so it is exactly what is on screen. The end is `lookRotation(plate − hover position, plate up)`. Between them the quaternion is slerped the short way round. The scene writes the slerped up into `camera.up` and puts the orbit target straight ahead, so OrbitControls' `lookAt` reproduces the slerped orientation exactly.
- **Moving plates.** The end pose is re-read each frame from where the plate is now (`hoverEnd`).
- **Lane rides.** A ride whose far end is a surface plate (`ride.lands`) rides the arc alone for its first half. Over the second half it blends into the hover pose (`blendPose`, weight `rideBlend` = smoothstep from t 0.5 to 1). Position, orientation and distance blend together, and it lands in the pose at rest.
- **Arrival (`restOver`).** `camera.up` goes back to world +y, which shows exactly the same view (`restingUp`), and nothing turns the camera after that. The arrival's second `hoverOver` sees the camera already in the pose (`atPose`) and does nothing. A second `hoverOver` for the hover already under way also does nothing, so a double call never restarts it.
- **Organic and Flat slices.** They have no plate frames, so `hoverOver` returns false there, rides never land, and `camera.up` stays +y. Those code paths are unchanged.

**Decisions worth remembering**
- **Quaternion slerp, not a blend of target and up.** A look direction taken from blended points crams the turn into the end, which is this bug. Slerp also cannot flip when the two ups are nearly opposite (tested above a pole).
- **Ease-out for hover flights, as every other flight uses.** It brings the camera to rest on arrival, and a restarted flight (fast arrow presses) keeps moving instead of stopping. At 60 fps a 90° turn over 1 s peaks at 3° a frame, in the first frame. Lane rides use smoothstep for the blend, to match the ride's own smoothstep.
- **Arrow keys now take the flight time too** (1 s at ×1, scaled by travel speed), not the 400 ms glide. In Planets an arrow move pivots round onto a new normal, so it is a flight. Organic and Flat arrow glides keep 400 ms.
- **`camera.up` is world +y at rest, except over a pole cap plate.** Within `CAP_FALLBACK` of a pole the plate's up is world −z projected, which world +y cannot show, so the camera keeps the plate's up there (`capRest`). This also fixes P1's unstable cap hover. That up is kept while the user orbits from there, and dropped (levelled to +y) when the next flight, glide or ride starts.
- **A hover cut short mid-turn is levelled at once.** The user grabs the camera, or a flight goes elsewhere, and on the next frame `levelUp` sets `camera.up` back to +y. Every orbit and look control turns about `camera.up`, so leaving it tilted would skew every later drag. The cost: the roll the slerp had built up so far snaps away on that user input. It is usually a few degrees, more when the turn starts near vertical. An arrow press or plate click mid-flight is not levelled: the new hover flight starts from the camera's actual quaternion.

**Surface map**

| File | Change |
|---|---|
| `src/graph3d/hover.ts` | New: `startHover`, `hoverFlightPose`, `blendPose`, `rideBlend`, `restingUp`, `atPose`, `lookRotation`, `slerp`, quaternion helpers |
| `src/graph3d/hover.test.ts` | New, 15 tests: the start pose is the camera, the end pose is the hover pose (normal, target, plate up), the per-frame turn is bounded and dies away in the last frames, the turn is spread (half the turn at half the eased time), the up stays continuous with nearly opposite ups, the flight tracks a moving plate, slerp takes the short way, a ride blends in and lands at rest, `restingUp` (+y vs cap), `atPose` |
| `src/views/Graph3DScene.ts` | `hoverFlight` state; `hoverOver` starts a hover flight instead of a glide; `hoverEnd`, `setCamera`, `restOver`, `levelUp`, `capRest`; the ride gets `lands`/`up` and blends into the hover pose; `cancelFlight`, `rideAlong`, `startPendingFlight`, data updates and the Planets edit track clear or respect `hoverFlight` |

**Fixture.** Reused, unchanged: `vault/tests/graph3d/Sailing Basics.md`, `Anchor Balance.md` and `Anchor Radial.md`. They link to each other, so at depth 2 there are three planets and lanes between them.

**Manual test**
1. Open `tests/graph3d/Sailing Basics.md` in the 3D graph at depth 2, Overlays → Layout: Planets.
2. Zoom out until all three planets are small. Click a plate seen at a slant, on the planet's limb. The camera flies in and turns at the same time, settling onto the plate's normal with its text upright. There is no whip at the end, and nothing moves once it stops. It takes about 1 s.
3. Overlays → travel speed ×0.5, then ×2. The same click takes about 2 s, then about 0.5 s, still one move.
4. Press the arrow keys. Each hop flies smoothly onto the next plate's normal. Hold an arrow key: the camera keeps gliding without stalls or jumps.
5. Click a lane between two planets. The ride follows the bowed arc, and in its second half it swings round onto the far plate's normal. It lands at rest in the hover view and does not turn again after landing.
6. During a click flight, drag to orbit halfway through. The flight stops where it is, possibly with a small roll that levels at once, and the orbit then behaves normally (horizontal drag turns about world vertical).
7. Switch Layout to Organic, then Flat slices. Plate clicks, arrows and edge rides behave as before (no hover).

**Not verified.** Everything in Obsidian: how the slerped turn feels, whether 1 s is right for arrow hops, the roll snap on a mid-flight grab, and a hover over a cap plate (rare, since continents are kept out of the caps). The scene wiring was type-checked and read, not run.
