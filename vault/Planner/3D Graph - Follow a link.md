---
title: 3D Graph - Follow a link
summary: "Click an edge to ride slowly along it to the plate at its far end, so following a connection doesn't need manual zooming. Plus an Overlays travel-speed slider that scales every camera flight."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[3D Graph Phase 6 - Relational study mode]]"
status: In-Review
priority:
progress: 90
date_created: "2026-11-03T17:35:29.000Z"
date_modified: "2026-11-03T17:35:29.000Z"
date_start_scheduled: "2026-11-04T02:38:25.000Z"
date_start_actual: "2026-11-04T02:38:25.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
cover:
color:
pull_request:
---

# Feature Request

Sawyer, 2026-11-03: "I wish I could click on a link connecting one plate to another, and it could animate slowly, not fast, and take me along that link, so I don't have to zoom in and out myself." Settled in a grilling session the same day; the decisions below are Sawyer's. Terms as in `GLOSSARY.md` (edge, follow a link, hop, travel speed).

## What do you need built?

**Follow a link:**
- **Trigger:** a click or tap on any *visible* edge, hierarchy edges included. Plates win when both are under the pointer. Hit tolerance as for plates (16 px mouse, 32 px touch; see `pickNode`/`nodeNear` in `src/graph3d/depth.ts` and the scene). Edges aren't clickable at all today, so this needs an edge picker: a pure function (screen-space distance from point to projected segment, skipping segments behind the camera or past the fog) in `src/graph3d/`, unit-tested.
- **Which end:** the end that isn't the focused node; if neither end is focused, the end farther from the camera.
- **The ride:** the camera travels *along the edge*, looking ahead toward the far plate, eased, at a slow pace scaled by distance (about 1.5–4 s at default speed), and stops at the usual viewing distance from the plate. Any input (pointer, wheel, key, joystick, touch) stops it where it is. Reuse `flight.ts` (it already tracks a moving target) rather than a second animation system.
- **Arrival:** the same as arriving by clicking that plate: a hop, re-centring the loaded area if the plate is in another note, so trips chain note to note.
- **Relational study:** a trip takes you *to* the plate but does **not** reveal or count as arriving at its card. The card is revealed only by clicking the plate (`study.clicked` is not called on arrival).
- **Edit mode:** edge clicks follow there too; drag-to-link starts on plates, so they don't collide.

**Travel speed slider** in the Overlays menu:
- Scales **every** camera flight: following a link, plate-click hops, search/goto flights. Default 1× keeps today's plate-click speed and the slow follow-a-link pace above. Suggested range 0.25×–4× (log scale).
- Stored with the other overlay settings (`src/graph3d/overlays.ts` normaliser, clamped).
- Not to be confused with the flight-mode `flightScale` (walk/fly under the user's own control), which is unchanged.

**Acceptance:**
- Clicking an edge between two plates rides the camera along it to the far plate, slowly; clicking a plate still flies quickly.
- A trip to a plate in another note re-centres on that note.
- Any input mid-trip stops it.
- In a study session the trip ends at a still-hidden card.
- The speed slider changes both trip and hop pace, and persists.

## Every phase

- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.

## Batch implementation notes (awaiting manual test)

Built on `feature/3d-graph-follow-link` (stacked on `fix/3d-graph-edit-box-view`). Code commit: see `git log` ("feat: Follow a link ...").

### Approach

- **Picking an edge** (`src/graph3d/edgepick.ts`, pure, 11 tests): `pickEdge` clips each segment to the depth range 1..mist reach (depth is linear along a segment, so the clip is a closed form), projects the two clipped ends, and measures the pointer's distance to that 2D segment. Within the slop (16 px mouse / 32 px touch, `PICK_SLOP_PX`), the nearest wins; a tie goes to the nearer to the camera. The scene (`Graph3DScene.edgeNear`) supplies the camera as two closures and only offers edges that are drawn now: kind shown in the Overlays menu, neither end departing, both ends placed, fade opacity above 0.
- **Plates win**: in `click()` the edge is tried only after `nodeNear` (plate within slop) finds nothing, and not at all when a near-tier panel is under the pointer (`near.nodeAt`) or a modifier (Shift/Ctrl/Cmd, the pan keys) is held. A link inside a panel still follows as before.
- **Which end** (`farEnd`): the end that isn't `focusId`; with neither focused, the end farther from the camera.
- **The ride** (`tripPose` in `src/graph3d/flight.ts`, 9 tests): the camera's position is split into a coordinate along the edge's line and a sideways offset from it. Along the line it eases (smoothstep, so it starts and ends gently) from where the camera is to `standOff` short of the far end (160 for a note core, 70 otherwise: the same numbers as a plate-click flight). The sideways offset decays to zero by 60% of the way, so most of the ride is on the line. The gaze moves from the old orbit target to the point `standOff` ahead on the line (done by 40%), which at the end is the plate itself. Both ends are re-read from the nodes every frame, so an unsettled edge's ends can drift and the ride still lands on the plate. Duration is `clamp(1200 + 12 ms/unit x distance, 1500, 4000) / travelSpeed`, using the camera's distance to the end pose.
- **Reuse**: the ride is a third branch in `steerFlight` beside `glide` and `flight` (same camera/controls write), cleared by `cancelFlight`, so every input that already cancels a flight (pointer, wheel, key, joystick, touch) cancels a ride. `flyTo`, `startPendingFlight` and `setData` (an end leaving the graph) clear it too.
- **Arrival**: `onNodeArrived` -> `Graph3DView.hop(node)`, the same function a plate click uses minus `study.clicked`. So in a relational study session the trip lands at a still-hidden card, and a click on the plate is what reveals it. `hop` calls `flyTo`, which starts a flight that is a no-op (the camera is already at the stand-off, same viewing direction) but sets `follow` so the camera keeps up with a node still settling, and `setFocus` re-centres the loaded area when the plate is in another note.
- **Travel speed**: `Graph3DOverlays.travelSpeed` (default 1, clamped to 0.25..4 by `normalizeOverlays`), log2 slider -2..2 in a new "Camera" section of the Overlays menu. It scales the plate-click flight (`FLIGHT_MS / travelSpeed`, so it covers hops, search and goto, trail steps, relational study's flights, all of which go through `flyTo`) and the ride. The duration is fixed when a flight starts, so dragging the slider mid-flight doesn't make the camera jump.

### Decisions worth remembering

- **Edit-time glide is not scaled** (`GLIDE_MS`): it isn't a flight to a plate, the spec lists following a link, plate-click hops and search/goto, and the framing code was to be left alone. Say so if Sawyer wants it scaled too.
- **The ride is a swing-on-then-along path, not a fly-to with a different duration**, because "travels along the edge" is the point of the feature; a plain flight to the far plate would approach from the camera's own side.
- **Re-clicking the same edge mid-ride**: the press cancels the ride, then the click starts a new one. If neither end was focused, "farther end from the camera" is judged from where the camera is now, so after passing the edge's midpoint the click would turn it round. With a focused node (the usual case, since a hop or any flight sets focus) the answer never changes until arrival.
- **A short edge** (shorter than the stand-off) ends with the camera on the line extended behind the near end: it backs away to the usual distance rather than cutting the stand-off.
- **No edge hover cursor.** Not asked for; picking runs only on a click, so it costs nothing per frame.
- **No separate arrival bookkeeping**: arrival is `hop`, as the spec says, rather than a variant.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/edgepick.ts` (new) | `pickEdge`, `farEnd` |
| `src/graph3d/edgepick.test.ts` (new) | 11 tests |
| `src/graph3d/flight.ts` | `Trip`, `startTrip`, `tripPose`, `tripEnd`, `tripDuration` |
| `src/graph3d/flight.test.ts` | 9 trip tests |
| `src/graph3d/overlays.ts`, `.test.ts` | `travelSpeed` field, default, clamp, slider mapping |
| `src/views/Graph3DOverlays.ts` | "Camera" section with the Travel speed slider |
| `src/views/Graph3DScene.ts` | `ride` state and its `steerFlight` branch, `rideAlong`, `edgeNear`, edge fallback in `click()`, `onNodeArrived`, flight duration from the travel speed, `NOTE_STAND_OFF` / `LINE_STAND_OFF` constants (the old 160 / 70 literals) |
| `src/views/Graph3DView.ts` | `onNodeArrived` -> `hop` |

### Fixture

Reused, none new: `vault/tests/graph3d/Sailing Basics.md` (open its 3D graph: Knots and Points of Sail at hop 1, Rigging at 2), `Crew Drills.md` (cards, for study), `Harbour Links.md`. No fixture file was written or edited, so no reload is needed for the reset hazard; reload Obsidian (Ctrl+R) once to load the new build.

### Manual test (for Sawyer)

1. Open the 3D graph for `Sailing Basics`. Click a line edge (a hierarchy edge between two bullets) in the middle of its length, not on a plate. Expect the camera to swing onto the edge and ride along it slowly (about 1.5-4 s) to the plate at the end away from the focus, stopping at the usual distance, looking at it.
2. Click an edge between two different notes' cores (for example Sailing Basics to Knots). Expect the same ride; on arrival the loaded area re-centres on Knots (header shows Knots as the focus, other notes load/unload).
3. Click an edge when the focus is at its far end: expect the ride to the other end. Then zoom out so neither end is the focus, and check it goes to the end farther from the camera.
4. Plates win: click right on a plate that an edge crosses; expect the quick flight, not a ride. Click a plate and compare the speeds: plate flight about 1 s, ride clearly slower.
5. Mid-ride, do each of: press the mouse, scroll the wheel, press a flight key (WASD), touch the joysticks (mobile). Each should stop the camera where it is.
6. Relational study: start a session (graduation-cap), ride along an edge to a plate whose card is hidden. Expect arrival without revealing the card; clicking the plate reveals it.
7. Edit mode (pencil): click an edge; it rides. Drag from a line plate to another plate still makes a link (drag-to-link is unchanged).
8. Overlays > Camera > Travel speed: at x4 both the plate flight and the ride are fast; at x0.25 both are slow. Reload Obsidian: the setting persists. Open a second 3D graph tab: it shows the same value.
9. Hide the Links edges in Overlays: those edges can no longer be clicked. Edges that are mist-faded (far away) can't be clicked.
10. Regression: plate-click hops, search/go-to flights, the Overlays other sliders and toggles, the walk/fly speed readout (wheel while flying, unchanged), edit-time camera behaviour (no fly-to on edit, Enter, Tab).

### Not verified (no Obsidian here)

Everything on screen: whether the swing-on feels smooth (the sideways decay length of 60% and gaze lead of 40% are guesses), the 1.5-4 s range at real graph scales, edge hit tolerance with many crossing edges, touch behaviour, and the arrival's no-op flight causing any visible jitter. Unit tests, lint and the production build pass.
