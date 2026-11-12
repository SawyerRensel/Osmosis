---
title: 3D Graph - Planets surface grab anywhere on the sphere
summary: "In Planets, a drag that starts anywhere over a planet's sphere (plate, gap, or non-plate node) grabs the surface; only drags starting in open space keep the orbit-about-clicked-point behaviour."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[3D Graph - Globe drag and inertia]]"
  - "[[3D Graph - Planets mode]]"
  - "[[Graph pointer gestures - orbit, pan, link, menu]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T12:00:00.000Z"
date_modified: "2026-11-12T12:00:00.000Z"
date_start_scheduled: "2026-11-12T05:23:54.000Z"
date_start_actual: "2026-11-12T05:23:54.000Z"
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

# Optimization

## What tool or process needs improvement?

Drag-to-rotate in the 3D graph's Planets layout.

## What's slow or frustrating about it?

Dragging from a plate rotates "from the surface" (the grabbed point stays under the finger). Dragging from empty space *inside* the planet's outline — between plates — instead orbits about a point at the last depth, which feels like a different control. Sawyer: "I want to rotate from planet surface regardless of clicking on a node or empty planet space."

## What would "better" look like?

Any drag whose pointer ray hits a planet's sphere uses the surface grab.

## Decisions (settled with Sawyer, 2026-11-12 UI feedback grilling; not to be re-decided)

- **On the sphere** (plate, gap between plates, or a node that isn't a plate but lies over the sphere): surface grab, pivot = planet core.
- **Off every sphere** (open black space): **keep today's behaviour** — orbit about the point under the pointer at the last depth. Sawyer explicitly declined a rim-snapping arcball here.
- Linking, menu and look-drag gestures are unchanged ([[Graph pointer gestures - orbit, pan, link, menu]]); `look` drags still never grab.
- Pivot setting "center" (`touchDrag` / `desktopPivot`) still overrides everything, as today.
- When several planets overlap along the ray, the nearest sphere hit wins.

## Code facts (scout, 2026-11-12 — spot-check line numbers)

All in `src/views/Graph3DScene.ts` (~37k tokens; read ranges):
- `onPointerDown` (~`:1884`) calls `aim()` (~`:2495`) and builds `RotateDrag { pivot, look, grab }`; `grab` is non-null only when `aim.globe !== null && !look`.
- `aim()`: `nodeNear()` → if the hit node is a planet surface plate, pivot = planet core and `globe` = core-to-plate distance. **No node hit → pivot on the ray at last depth, `globe = null`** — this is the branch to extend with a ray–sphere test against each planet (core + radius).
- `rotate()` (~`:2317`): grab path uses `grabPoint` + `stickyTurn` (`src/graph3d/globe.ts:71`) and `rotateAboutPivot`; silhouette fallback when the ray misses during the drag already exists.
- Inertia via `turnSamples` / `orbitCoast` — should work unchanged.
- You'll need where planet cores and radii are kept (Planets layout); find via `globe` / plate data in `aim()`.

## Context budget

Small-to-medium: `Graph3DScene.ts` ranges + `globe.ts`. Put the ray–sphere pick in `src/graph3d/globe.ts` (pure, testable).

## Acceptance criteria

- In Planets, dragging from a gap between plates rotates the planet exactly like dragging from a plate (grabbed point stays under the pointer, inertia on release).
- Dragging from a non-plate node lying over a planet does the same.
- Dragging from open space behaves as before.
- Non-Planets layouts unchanged.

## Test plan

Unit (`globe.test.ts`): ray–sphere pick returns the nearest hit planet and the hit point; misses return null; nearest wins with two spheres on the ray.

Manual (Ctrl+R after build), 3D view, Planets layout, desktop and phone:
1. Drag from a plate → surface rotation (regression check).
2. Drag from an empty patch inside a planet's outline → same surface rotation (was orbit).
3. Drag from black space between planets → orbit about clicked point, as before.
4. Flick → inertia still coasts.

## Batch implementation notes (awaiting manual test)

Code commit `3447f7a` on `fix/3d-planets-sphere-grab`. Not pushed, no PR.

### Cause

`aim()` only knew a planet through its plates: `nodeNear()` had to pick a surface plate for the drag to pivot on the core and grab (`globe` = the plate's distance from the core). A press in a gap between plates picked nothing and fell through to the Blender-style fallback (a point on the ray at the last depth, `globe = null`), and a press on a core or a star picked that node and orbited it, so neither grabbed.

### What was built

- **`sphereOnRay` (`src/graph3d/globe.ts`)**: the nearest sphere a ray meets, with the hit point and distance along the ray; spheres behind the origin don't count, and from inside a sphere its exit hit counts. Generic over the sphere type.
- **`aim(x, y, touch, grab)`**: with `grab`, when the press is not on a surface plate, the scene's new `sphereUnder()` casts the pointer's ray against every placed planet (core position + `PlanetWorld.radius`, the radius plates sit at) and, on a hit, pivots on that core with `globe` = its radius. `onPointerDown` then builds the grab exactly as for a plate (`grabPoint` on that sphere), so `rotate()`'s sticky turn, the rim fallback and the spin coast are reused unchanged.
- **`PlanetWorld.cores()`**: lists core IDs so the scene can enumerate planets.

### Decisions worth remembering

- **A plate pick still comes first**, as before (regression-safe; its planet is the one shown under the pointer). The sphere test runs only when the press is not on a surface plate: a gap, a core, a star, or nothing.
- **A star or core over a sphere grabs the planet** (the ticket's "node that isn't a plate but lies over the sphere"). A star off every sphere still orbits the star, as before.
- **Only drags ask for the sphere** (`grab` flag). Wheel and pinch zoom also go through `aim()` via `aimPoint`, and keep aiming at the point on the ray at the last depth in a gap, as today: the ticket is about drag, and zooming at a gap shouldn't suddenly head for the core.
- **Look drags never grab**: touch "look" passes `grab = false`; the "center" pivot setting returns before any picking, as today.
- **Mist reach**: a sphere hit farther than `2 / fog.density` (the same reach `nodeNear` uses) is ignored, so an invisible planet in the fog can't be grabbed.
- **`lastDepth`** is set to the core's distance on a sphere grab, as a plate grab already did, so a following off-sphere orbit or zoom uses that depth.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/globe.ts` | `Sphere`, `sphereOnRay` (nearest ray–sphere hit) |
| `src/graph3d/globe.test.ts` | Hit point and distance, off-centre hit, misses, sphere behind origin, nearest of two in either order, inside a sphere, agrees with `grabPoint` |
| `src/graph3d/planets.ts` | `PlanetWorld.cores()` |
| `src/views/Graph3DScene.ts` | `aim()` takes `grab`; new `sphereUnder()`; `onPointerDown` passes `!look` |

### Fixture

No new fixture: `vault/tests/graph3d/Anchor Radial.md` / `Anchor Balance.md` (and the other sailing notes) in the Planets layout.

### Not verified

Nothing was run in Obsidian. Unverified: how a grab from a gap feels next to one from a plate (same code path after the press, so it should be identical), and pressing on a star in front of a planet now turning the planet instead of orbiting the star (deliberate per the ticket, but worth a look).
