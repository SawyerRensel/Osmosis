---
title: 3D Graph - Pinch zooms toward the fingers in Planets
summary: "Batch 12 (T96). In the Planets layout, touchscreen pinch zoom pivots on the core node and is far too sensitive; zoom toward the point under the fingers instead."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:

status: Done
batch: 12
priority:
progress: 100
date_created: 2026-11-18T12:00:00.000Z
date_modified: 2026-11-20T18:00:00.000Z
date_start_scheduled: 2026-11-19T03:59:29.000Z
date_start_actual: 2026-11-19T03:59:29.000Z
date_end_scheduled: 2026-11-20T18:00:00.000Z
date_end_actual: 2026-11-20T18:00:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/50
---

# 3D Graph - Pinch zooms toward the fingers in Planets (T96)

## What happened?

On a touchscreen, pinch zoom in the 3D graph's **Planets** layout is far too
sensitive, because it zooms with the **core node** as the pivot (Sawyer). From
close to a plate far from the core, a small pinch moves the camera a long way.

## What should have happened?

**Zoom toward the point under the midpoint of the two fingers**, as the mouse
wheel zooms toward the cursor. The speed scales with the distance to that point,
so the same pinch near a plate moves a little and far away moves a lot. This was
Sawyer's chosen option.

## Leads

- The pinch is set up in `Graph3DScene.ts` around **2680–2760** (`this.pinch = { …, depth: this.viewDepth(this.aimPoint(x, y, true)) }`, `pinchShape`). It already computes an aimed point and depth, so find where Planets mode overrides that with the core (look for a Planets/globe branch in the pinch-move handler and in `src/graph3d/planets.ts` / `globe.ts` / `pivot.ts`).
- Compare with the **wheel** path in Planets (`src/graph3d/wheel-input.ts` and the wheel handler in the scene). If the wheel already zooms toward the cursor in Planets, reuse the same math for the pinch.
- If the aim misses (empty space under the fingers), fall back to the depth the wheel uses for a miss, not to the core.
- Keep pinch momentum (`graph3d/inertia.ts`) working.

Pull the zoom-step math into a pure function under `src/graph3d/` with tests
(e.g. "pinch ratio r at aimed depth d moves the camera by …; the core distance
doesn't enter").

## Acceptance criteria

- [ ] Planets: pinching over a plate zooms toward that plate. Over empty space it behaves like the wheel's miss.
- [ ] The sensitivity no longer depends on how far the camera is from the core.
- [ ] Other layouts behave exactly as before.
- [ ] Unit tests for the extracted math.

## Test plan

Manual (a touchscreen, phone or tablet): open the 3D graph in Planets layout.
Fly near a plate far from the core. Pinch out slowly → the plate under your
fingers grows toward you smoothly and stays under your fingers. Pinch in → it
recedes at a matching rate. Repeat over empty space and near the core.

## Context budget (~30k tokens)

| Read | Range | ~Tokens |
|---|---|---|
| `src/views/Graph3DScene.ts` | 520–580 (fields), 2000–2140 (pointer down/move dispatch), 2660–2780 (pinch) | ~8k |
| `src/graph3d/pivot.ts`, `wheel-input.ts`, `inertia.ts` | whole | ~3k |
| `src/graph3d/planets.ts` | `grep -n "zoom\|pivot\|core"` hits ± 20 lines | ~3k |
| `src/graph3d/globe.ts` | as above | ~2k |

`Graph3DScene.ts` is ~42k tokens; never read it whole.

## What was implemented

**Where it shipped:** [PR #50](https://github.com/SawyerRensel/Osmosis/pull/50) (batch 12, branch `batch/12-study-tab`), merged into `release/0.0.6`. Sawyer tested it by hand on 2026-11-20. It failed the first test and passed after the round-2 fix described in the *Round 2 fix* subsection below.

The batch worker wrote this record when the code was committed. It covers the cause, the fix, the decisions and the surface map.

Commit: 055044c `fix(T96): Planets pinch zooms toward the point under the fingers`.

### Cause

Two things made a Planets pinch too fast near a plate:

1. **Pivot.** The pinch aimed with `aim()`. In Planets that function swaps a picked surface plate for its planet's **core**, which is right for a drag because a drag turns the globe. A pinch therefore dollied toward the core, and `dollyDistance` sized the step from the core's distance, often several times the plate's.
2. **Floor.** `dollyDistance` never steps less than `MIN_DOLLY` (200) per unit of ln zoom. That is about 10 units a wheel notch. A pinch spread of ×1.5 (ln ≈ 0.41) then moves at least 81 units, so at a reading distance of about 70 the floor alone overshoots the plate. Anywhere nearer than about 200, the floor outweighs the proportional step.

### Fix

- `Graph3DScene.pinchPoint(x, y)` is used by pinch start, pinch move and pinch coast. In Planets it picks the node under the fingers (`nodeNear`, with touch slop). It does not swap in the planet core. The pivot is the point on the fingers' ray that lies in the plane facing the camera through that plate (`rayDistanceAtDepth`). Zooming along that ray keeps the exact content under the fingers fixed on screen, which matters for a large near-tier panel pinched near its edge. On a miss it uses the same Auto Depth fallback as the wheel (`missDepth()`, which was extracted from `aim()` unchanged).
- `pinchStep()` returns the step function. In Planets that is `pinchDollyDistance`, the proportional step d·(1 − 1/r) for spread ratio r, so the aimed point grows exactly r× on screen. Its floor is `PINCH_MIN_DOLLY` = 20, so the floor only takes over within about 20 units and a pinch can still pass through a plate. Other layouts keep `dollyDistance`.
- `dollyDistance` gained an optional `minDolly` parameter (default `MIN_DOLLY`, so every existing call behaves the same). `dolly()` gained an optional step function (default `dollyDistance`).

### Decisions

- **Only the pinch changed in Planets. The wheel still heads for the core.** (Changed in round 2, see below: the wheel now follows the pinch.) The ticket says the wheel zooms toward the cursor. In Planets it actually aims through the same `aim()` → core path. I left the wheel alone because the ticket is about the pinch and its scope is narrow. If Sawyer wants the wheel to match, the change is small: use `pinchPoint`/`pinchStep` in `stepWheelZoom` (around `this.dolly(this.aimPoint(wheel.x, wheel.y, false), step)`) with mouse slop.
- **Other layouts are untouched.** Both the new pivot and the smaller floor are gated on `overlays.layout === "planets"`, as the acceptance criteria require. Elsewhere the pinch still uses `MIN_DOLLY`.
- **The view-centre touch setting (`graph3dOneFingerDrag: center`) keeps the old behaviour.** (Round 2 also restores its old step floor, see below.) It still zooms toward the orbit target in Planets too, because that setting is an explicit choice to aim at the centre.
- **The pivot is the point under the fingers, not the plate's centre.** With the plate centre, content under the fingers would slide when the fingers are off-centre on a wide plate or panel. The ray point keeps it in place.
- **`PINCH_MIN_DOLLY = 20` is a tuning value.** Line plates are 5 units tall and `LINE_STAND_OFF` is 70. If passing through a plate feels sticky, raise it. If the last stretch toward a plate feels jumpy, lower it.
- Pinch momentum (`zoomCoast`) is created only by `endPinch`, so routing its per-frame dolly through `pinchPoint`/`pinchStep` affects nothing else.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/pinch-zoom.ts` | New pure module: `PINCH_MIN_DOLLY`, `pinchDollyDistance`, `rayDistanceAtDepth` |
| `src/graph3d/pinch-zoom.test.ts` | New: 10 tests (r-ratio growth, core distance doesn't enter, floor vs wheel floor, pass-through, symmetry, oblique ray) |
| `src/graph3d/depth.ts` | `dollyDistance(depth, logZoom, minDolly = MIN_DOLLY)` |
| `src/views/Graph3DScene.ts` | `pinchPoint`, `pinchStep`, `missDepth` (extracted from `aim`); `dolly` takes an optional step function; start/move/coast of the pinch use them |

### Fixture

Reuses `vault/tests/graph3d/Galley Handbook.md` (the largest graph3d fixture, at 146 lines, so its planet is big). Any note in `vault/tests/graph3d/` works.

### Not verified before the manual test

- There is no touchscreen here. Nothing was tried on a device, and Playwright was skipped per the batch rules. Lint, the full vitest suite (3402 tests) and the build are green.
- The feel of `PINCH_MIN_DOLLY` near a plate is untested.

### Round 2 fix

Code commit: `d807cac`. Sawyer's test: "Pinch zoom is better when I pinch zoom
over nodes in planet layout in 3d graph view, but it's still jarringly fast
when my fingers land in between nodes in empty space. Pinch zoom should behave
like rotating in responding to the sphere (or whatever the core layer is)
regardless of whether I'm over nodes or not." Settled with Sawyer as well: the
Planets mouse wheel zooms toward the cursor with the same rules.

**Cause.** A miss fell back to `missDepth()`, which is `lastDepth`, Auto Depth's
"depth last aimed at". The first finger of a pinch has already set that value
by the time the pinch starts. Its pointer-down runs `aim(x, y, touch, grab =
true)`. Over a gap on a planet, `sphereUnder` finds the planet's sphere, and
`aim` sets `lastDepth` to the distance to the sphere's **centre**, which is
the core. So a pinch between plates headed for a point at the core's distance
along the fingers' ray. That point lies behind the surface the user sees by a
whole planet radius, and the step is proportional to that distance.

The numbers come from arithmetic on the code's own rules, not from a device.
The camera is `s` from the surface, which is where a plate's flight stops
(`LINE_STAND_OFF` = 70). The planet has radius `R`, so the core is `s + R`
away. The step is `pinchDollyDistance`, d·(1 − 1/r) with a floor of 20 per
unit of ln r:

| R | s | Core | Pinch ×1.25: plate step | Gap step (round 1) | Surface grows | Pinch ×1.5: gap step |
|---|---|---|---|---|---|---|
| 40 | 70 | 110 | 14 (×1.25) | 22, 1.6× faster | ×1.46 | 37 (surface left at 33, ×2.1) |
| 100 | 70 | 170 | 14 (×1.25) | 34, 2.4× faster | ×1.94 | 57 (surface left at 13, ×5.3) |
| 150 | 70 | 220 | 14 (×1.25) | 44, 3.1× faster | ×2.7 | 73: passes through the surface |
| 100 | 30 | 130 | 6 (×1.25) | 26, 4.3× faster | ×7.5 | 43: passes through the surface |

The ratio is (s + R) / s, so the nearer you read and the bigger the note, the
worse it gets. A modest pinch from reading distance can carry the camera
through the surface, which is the lunge. Over a plate, round 1 replaced
`lastDepth` with the plate's depth, which is why that case felt right. A
pinch that started over a plate and drifted into a gap kept the plate's
depth, because `dolly` re-seats `lastDepth`. A pinch that started in a gap
and drifted onto a plate dropped its rate mid-gesture.

**Fix.**

- **Pivot between plates = the surface a drag grabs.** At the start of a
  pinch, `zoomDepth` aims in this order, through the pure `zoomPivotDistance`:
  1. The plate under the fingers, as in round 1.
  2. Otherwise, where the fingers' ray meets the planet sphere that a
     rotation there would grab. This is `sphereHit`, split out of
     `sphereUnder`. It uses `grabRadius`, so with core layers it is the
     outermost shell the camera is still outside of.
  3. Off every planet (sky), Auto Depth's miss as before.

  Plates sit on that sphere, so a gap now zooms at the rate of the plates
  around it. A ray 3° beside a plate that is 70 away meets the surface at
  70.15, which is 0.2% apart (unit test).
- **The depth is latched for the whole gesture.** The view depth picked at
  the start is kept in `pinch.depth`, which is already what the pan uses.
  Each move zooms toward the point on the current midpoint's ray at that
  depth (`zoomAt`). The depth then shrinks as the camera closes in. This
  means:
  - Crossing from a plate to a gap, or from a gap to a plate, never changes
    the rate mid-gesture.
  - Zooming through the surface never re-aims at the far wall, which is
    about 2R away and would be a lunge.
  - Past the latched plane, the zoom carries on at the 20-unit floor. Lift
    and pinch again to aim afresh.

  Over a single plate this matches round 1 exactly. Round 1 re-picked the
  same plate on every move, and the plate's view depth fell by the same
  step·cos.
- **Pinch momentum keeps the latch.** `zoomCoast` carries the pinch's
  depth, so the coast cannot re-aim either.
- **Mouse wheel.** In Planets, `easeWheel` now goes through the same
  `zoomAt`, with the same order of plate, surface, then miss, and the same
  `pinchDollyDistance` step. It no longer goes toward the core with the
  200-unit floor. The depth is latched while the wheel's glide runs:
  consecutive notches keep it, and a pause long enough for the glide to
  finish (about 0.2 s) re-aims. The mouse uses the mouse pick slop (16 px),
  not the touch slop.

**Decisions.**

- **The ribbon's Zoom in/out and the zoom gizmo follow the wheel's rule in
  Planets.** They feed the wheel's glide, aimed at the middle of the view. So
  in Planets they now head for the plate or surface at the centre of the
  view instead of its core. Keeping them on the core would have needed a
  separate path. Tell me if they should stay on the core.
- **The wheel's step near a plate is the pinch's.** That is 5% of the
  distance per notch, with a floor of about 1 unit per notch
  (`PINCH_MIN_DOLLY` 20 × ln(1/0.95)). It used to be at least about 10 units
  per notch. Closing the last 20 units to a plate now takes about 20 notches, where it used to take 2.
  If that feels sticky, raising `PINCH_MIN_DOLLY` tunes the pinch and the
  wheel together. This follows Sawyer's "same rules".
- **The view-centre settings (`touchDrag` / `desktopPivot` = `center`) keep
  the pre-T96 behaviour completely.** In Planets, round 1 had given the
  centre-setting pinch the 20-unit floor. It is back on `dollyDistance`, so
  that setting is untouched by T96, as round 1 meant it to be.
- **The latch, not per-move re-picking.** Latching is what makes a gap and a
  plate, and the moment of passing through the surface, all seamless. The
  cost: in one gesture you cannot zoom toward a plate and then on toward
  another plate far behind it. Lifting and pinching again does that.
- **Sky (off every planet) still uses Auto Depth's last depth.** After a
  rotation, that can be a core's distance. Pinching at bare sky has nothing
  under the fingers to size the zoom from, and the feedback was about the
  gaps between plates.

| File | Change |
|---|---|
| `src/graph3d/pinch-zoom.ts` | New `ZoomAim` and `zoomPivotDistance` (plate, then surface, then miss) |
| `src/graph3d/pinch-zoom.test.ts` | 5 new tests: a gap's step equals the step for a pivot on the surface (14, not the core's 34); a gap beside a plate is within 1%; the core-layer shell; plate first; miss only off every planet |
| `src/views/Graph3DScene.ts` | `zoomsUnderPointer`, `zoomDepth` and `zoomAt` replace `pinchPoint` and `pinchStep`. Pinch start, move and coast, and `easeWheel`, use them. `zoomCoast` and `wheelZoom` carry the latched `depth`. `sphereHit` is split out of `sphereUnder` |

Fixture: as round 1, `vault/tests/graph3d/Galley Handbook.md`.

**Not verified:** there is no touchscreen or mouse session here, so neither
the pinch nor the wheel has been felt on a device. Lint, the full vitest suite
(3408 tests) and the build are green.
