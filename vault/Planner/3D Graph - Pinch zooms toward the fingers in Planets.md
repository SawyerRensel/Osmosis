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

status: In-Review
batch: 12
priority:
progress:
date_created: 2026-11-18T12:00:00.000Z
date_modified: 2026-11-18T12:00:00.000Z
date_start_scheduled: 2026-11-19T03:59:29.000Z
date_start_actual: 2026-11-19T03:59:29.000Z
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

## Batch implementation notes (awaiting manual test)

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

- **Only the pinch changed in Planets. The wheel still heads for the core.** The ticket says the wheel zooms toward the cursor. In Planets it actually aims through the same `aim()` → core path. I left the wheel alone because the ticket is about the pinch and its scope is narrow. If Sawyer wants the wheel to match, the change is small: use `pinchPoint`/`pinchStep` in `stepWheelZoom` (around `this.dolly(this.aimPoint(wheel.x, wheel.y, false), step)`) with mouse slop.
- **Other layouts are untouched.** Both the new pivot and the smaller floor are gated on `overlays.layout === "planets"`, as the acceptance criteria require. Elsewhere the pinch still uses `MIN_DOLLY`.
- **The view-centre touch setting (`graph3dOneFingerDrag: center`) keeps the old behaviour.** It still zooms toward the orbit target in Planets too, because that setting is an explicit choice to aim at the centre.
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

### Not verified

- There is no touchscreen here. Nothing was tried on a device, and Playwright was skipped per the batch rules. Lint, the full vitest suite (3402 tests) and the build are green.
- The feel of `PINCH_MIN_DOLLY` near a plate is untested.
