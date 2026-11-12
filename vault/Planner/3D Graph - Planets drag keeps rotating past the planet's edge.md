---
title: "3D Graph - Planets drag keeps rotating past the planet's edge"
summary: "A drag that starts on a planet and leaves its disc snaps to a pole instead of rotating on; it should keep rotating continuously, trackball-style, like Blender's infinite viewport drag. Same for touchpad swipes."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets surface grab anywhere on the sphere]]"
  - "[[3D Graph - Touchpad swipe rotates]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-12T16:55:00.000Z"
date_start_scheduled: "2026-11-12T16:43:15.000Z"
date_start_actual: "2026-11-12T16:43:15.000Z"
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

# 3D Graph - Planets drag keeps rotating past the planet's edge (T73)

## Request (Sawyer, 2026-11-12, verbatim)
> When I click-drag with mouse on a planet and my mouse travels beyond the planet extent, it snaps to a pole instead of continuously rotating like I expect (Blender's mouse has infinite dragging when rotating in viewport). This also happens with two finger swip on touchpad.

## Not to re-decide
Round 7: Sawyer **declined a rim-snap** — a drag that *starts off* every sphere keeps orbiting about the clicked point. This ticket is different: a drag that *starts on* a planet.

## Design
- Today the grab follows the surface point under the pointer (`sphereOnRay` in `src/graph3d/globe.ts`, `aim(x,y,touch,grab)` in `Graph3DScene.ts`); off the disc it "holds at the rim" and the rotation snaps toward a pole. T59's note says a long touchpad swipe "still holds at the rim" (`SwipeFeed` in `src/graph3d/wheel-input.ts`, `SWIPE_GAIN` 0.3).
- Once the pointer leaves the disc (or as a whole, if cleaner), switch to **incremental** rotation: rotate by the pointer delta about the axis perpendicular to the motion (in view space), at the angular rate the surface had at the moment it left the disc (or the rate at the disc's centre), with no clamp, snap or discontinuity at the crossing. Moving back over the disc must not jump either.
- Touchpad uses the same path via `SwipeFeed`; make sure swipes get the same continuous behaviour.
- Diagnose first with numbers: log/compute the rotation at the rim crossing in a unit test to show the snap, then show it gone.

## Acceptance criteria
- Mouse: start a drag on a planet, keep moving far past its edge, even off the view: the planet keeps turning in the drag direction, smoothly, never snapping to a pole. Reverse direction: it turns back.
- Touchpad two-finger swipe on a planet: same.
- Drags that start off every sphere: unchanged (orbit).
- Unit tests in globe.test.ts for continuity at the rim.

## Context budget
Under ~130k. Opus. globe.ts, wheel-input.ts, planets.ts whole; Graph3DScene.ts by range around `aim`/grab.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.

## Batch implementation notes (awaiting manual test)

Code commit `448c195` on `fix/planets-infinite-drag`.

### The cause, with numbers
Simulated in a pinhole camera (fov 50°, 800 px tall, camera 40 from a radius-10 planet, 10 px steps from the disc's centre; the disc's edge is ~221 px out):
- On the disc, `stickyTurn` keeps the pressed point under the pointer. The surface turns faster and faster under the pointer toward the silhouette: 0.035 rad per 10 px at the centre, 0.19 rad per 10 px just inside the rim (going right), and **0.44 rad in a single 10 px step** on a diagonal, where the pitch solve swings the camera from a polar angle of 130° to 153°. That leap is the "snap to a pole".
- Past the silhouette, `grabPoint` holds the grabbed point at the rim, so **every further step turned the planet by 0**. That was 177 of 200 steps going right and 181 of 200 on the diagonal. A small, far planet (camera at 1000) leapt 1.56 rad in one step and then froze.
- The touchpad swipe moves the same `RotateDrag` through `rotate()`, so it froze the same way (T59's "holds at the rim").

### The fix
- `gripPoint` (new, `globe.ts`): the near hit of the ray, but only while the surface faces the ray within `GRIP_LIMIT` = 60°. Otherwise it returns null (a miss, past the limit, or from inside the sphere).
- `rotate()` in `Graph3DScene.ts`: while the ray holds, the drag is the same sticky grab as before. When it doesn't, the grab **slips**. `grab.point` becomes null, and the planet turns by the pointer delta (yaw −rate·dx, pitch −rate·dy, the same yaw/pitch rig as an orbit) at `slipRate`, the exact rate the surface had at the 60° edge. After each slipped step, the drag grabs again wherever the pointer now holds the surface, so coming back over the disc never jumps.
- `slipRate(distance, radius, perPx)` uses `perPx = tan(fov/2) / (height/2)`, read live from `camera.fov`, so the mobile fov (T66) applies. It is capped at the plain orbit rate (`ORBIT_RATE / height`).
- Swipe resume (`swipeBy`, state "resume") now re-grabs with `gripPoint`. Off the disc, that leaves the grab slipped instead of pinning it to the rim.
- After the fix, the same simulation turns the planet on every step. The largest step is the slip rate (0.076 rad per 10 px), with no leap at the crossing. Driving out 1000 px and back returns to within 0.5 world units of the start pose.

### Decisions worth remembering
- **The grab slips at 60° of surface tilt, not at the geometric rim.** Between 60° and the rim (the outer ~13% of the disc's radius at that distance), the surface rate climbs to infinity, and that is where the pole-ward leap happened. Slipping there removes the leap, and it keeps the rate continuous across the crossing. Do not move it back to the silhouette.
- **The slip rate is the rate at the slip point, not the centre rate.** The ticket preferred this rate because it leaves no change of speed at the crossing. At camera distance 40 and radius 10 it is about 2.2× the centre rate.
- **It is capped at the plain orbit rate** (2π per view height). Without the cap, a small, far planet would keep spinning at its sticky rate, about 2.3 rad per 10 px, off the disc. A close, large planet slips slowly (its surface rate is low), matching how it moved on the disc.
- Drags that start off every sphere are unchanged: still the orbit about the clicked point (round 7).
- `grabPoint`'s off-silhouette branch is no longer reached from the scene. Drag and swipe starts call it only on a hit. I left it in place and did not delete it.

### Not fixed: the pole clamp (possible follow-up)
The camera rig is yaw about world up plus a pitch clamped at `POLE_MARGIN` (`pivot.ts`), because OrbitControls has a fixed up and allows no roll. A long **vertical** slipped drag therefore still stops turning vertically once the camera is right over the planet's pole. In the simulation that happens about 90 px past the slip point. Horizontal motion keeps turning it about that pole. This is a gradual stop, not a snap, and every orbit in the view behaves the same way. A true trackball (going over the top) needs camera roll, which is a rig change outside this ticket. If Sawyer still reads this as "snapping to a pole", that is the follow-up.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/globe.ts` | `GRIP_LIMIT`, `gripPoint`, `slipRate` |
| `src/graph3d/globe.test.ts` | Tests for `gripPoint` and `slipRate` (checked against a numeric derivative), plus a drag simulator covering an even rate with no leap or stall over 2000 px (right, left, diagonal), reverse and re-grab with no jump, and the orbit-rate cap for a far, small planet |
| `src/views/Graph3DScene.ts` | `RotateDrag.grab.point` is nullable (null = slipped); `rotate()` handles slip and re-grab; swipe resume uses `gripPoint` |

### Fixture
Any planets fixture in `vault/tests/graph3d/` (Planets layout). No new fixture.

### Could not verify
- How it feels in Obsidian: mouse, touchpad or phone.
- Whether 60° feels right. The constant is `GRIP_LIMIT` in `globe.ts`.

### Manual retest
In `vault/tests/graph3d/`, open a note in the 3D graph with the Planets layout and Ctrl+R first.
1. **Mouse:** press on a planet and drag right, far past its edge and off the view. It should keep turning smoothly at a steady rate, with no jump near the edge. Drag back: it turns back, and once over the disc the surface point under the pointer stays under it. Drag diagonally past the edge: no sudden swing toward a pole. A long vertical drag stops over the pole gradually (known, see above).
2. **Touchpad:** two-finger swipe starting over a planet, a long way in one direction. It should turn continuously, never freezing at the rim. Pause and resume the swipe while off the disc: it carries on turning.
3. **Phone:** a finger drag from a planet out past its edge keeps turning it.
4. **Unchanged:** a drag starting on empty space still orbits the clicked point.
