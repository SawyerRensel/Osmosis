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
status: To-Do
priority:
progress:
date_created: "2026-11-12T12:00:00.000Z"
date_modified: "2026-11-12T12:00:00.000Z"
date_start_scheduled:
date_start_actual:
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
