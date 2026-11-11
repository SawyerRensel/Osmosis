---
title: 3D Graph - Planets plates face up
summary: In the Planets layout continent plates (far plates, live panels, editor panels) look tilted unless the camera sits just right; keep each plate flat on the globe but spin it about its normal so its text reads upright on screen, and keep plates from overlapping at any spin.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets continent frames]]"
status: In-Review
priority:
progress:
date_created: 2026-11-11T21:00:00
date_modified: 2026-11-11T21:40:00
date_start_scheduled: 2026-11-11T21:00:00
date_start_actual: 2026-11-11T21:00:00
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

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Obsidian desktop |
| Operating System | Linux |

## What happened?

In the 3D graph's Planets layout, continent plates (far plates, near-tier live panels, and the code-block/editor panels) look tilted: text runs at odd in-plane angles and is skewed, unless the camera is positioned just right. Each continent shares one up-frame (T42, `wrapPlate`), so the text only reads upright when the camera's roll happens to match that frame.

Sawyer (2026-11-11, with a screenshot): "Can we make sure that the nodes always face up and don't overlap?"

## What should have happened?

**Chosen design: lie flat, upright.** Plates stay tangent to the globe (lying flat on the surface, as now), but each plate spins in place about its own surface normal so its text points up on screen, updated as the camera orbits and rolls. Slant near the planet's limb remains (accepted). Rejected: full billboarding to face the camera; facing the camera only when near.

1. Far plates, glyphs, near live panels, the edit box and everything drawn in the plate's frame (occlusion holes, width handle, selection border) agree. The spin is cheap (shader / per-frame transform, no per-frame geometry rebuild). Looking at a plate from a degenerate angle must not jitter or flip.
2. Plates must not overlap at any spin: the T42 overlap pass must be rotation-invariant, deterministic, and the layout must not depend on the camera (settled nodes never move as the camera moves).
3. Organic and Flat-slices layouts unchanged.
4. Unit-test the spin (incl. the degenerate case) and the overlap guarantee.

## Where is this file located?

`vault/tests/graph3d/Galley Handbook.md`, `vault/tests/graph3d/Anchor Radial.md` (Layout: Planets).

## Steps to Reproduce

### 1. Start from

Open `Galley Handbook.md` in the 3D graph, Layout: Planets.

### 4. Trigger

Orbit the camera round a continent, or roll it: plate text turns with the continent, not with the screen.

## Batch implementation notes (awaiting manual test)

Implemented on `fix/3d-planets-plates-upright` (stacked on `feature/3d-boundaries-far-side-dim`, T51), commit 8e3a1cf. Not yet tested in Obsidian.

**Cause.** A surface plate's `right`/`up` were its continent's frame carried to its place (`wrapPlate`, T42): fixed in the world, so whether text read upright depended entirely on the camera's roll relative to that frame.

**Approach.**
- New pure module `src/graph3d/upright.ts`. `uprightSpin(p, r, u)` (view space) returns the in-plane turn (cos, sin) whose text-right and text-up best fit the screen's right and up *at the plate*: the 2D Procrustes fit of the perspective projection's Jacobian there (rows (−p.z, 0, p.x) and (0, −p.z, p.y)). Face-on that is exactly the camera's up laid into the plate; toward the limb it leans as little as a flat plate can. `uprightFrame(frame, centre, view)` is the world-space wrapper; `UPRIGHT_GLSL` is the same function for the shaders, line for line.
- Plate and glyph shaders: `placeOnPlate` (Graph3DPlates `ORIENT_GLSL`) spins `aRight`/`aUp` per vertex before use. Glyphs share their plate's `aCenter`, so text and plate (incl. selection border, fill, outline) spin together. No CPU work per frame, no attribute rewrites; `plateBack` is unchanged (the normal doesn't change).
- Near tier: `Graph3DNear.plateFrame(node)` = `uprightFrame(node.frame, …, this.view)` (view basis set with `cameraFrame` each `update`) feeds `tilt` (the CSS3D panel matrix, so the width handle and in-panel editor follow), `placeTilted` (the panel's own frame for holes) and `worldPlate` (occluding plates' corners). The floating editor was already screen-aligned.
- No overlap at any spin: `continentMap` lays each plate out as the square it stays inside at any spin (`spinFootprint` = its diagonal, of `flatSize`, so live panels included). Squares that don't overlap hold circles that don't, so the tree/radial layouts, `plateReach`, the area rule and `spreadContinent` (unchanged code, now on squares) are all rotation-invariant and still camera-independent and deterministic.
- Boundaries: a planet plate's boundary patch wraps the same square (`Graph3DBoundaries`), so the patch never needs a camera-driven rebuild and always covers the spun plate.

**Decisions worth remembering.**
- Best-fit spin, not "camera up projected into the plane": identical face-on, but the projection becomes degenerate when screen-up lies along the plate's normal (edge-on at the top/bottom limb) and leans one axis more. The fit can't vanish for a front-facing plate (its conformal part is ≥ the Jacobian's determinant), so it turns smoothly however the camera moves, a pass straight over a plate included (unit-tested at 0.5° steps). No "last good angle" state needed.
- Seen from behind (far side: dimmed, no text) the fit matches right to right and up to *down*: the same rectangle on screen, and it keeps that fit from vanishing too (a plate seen exactly from behind would otherwise spin chaotically). The switch happens edge-on, where the plate has no area.
- Per-plate spin (not one angle per continent): each plate is upright for its own view. Neighbouring plates' spins differ, which is why the footprint is per-plate circle-safe rather than relying on a shared angle (a shared angle would save almost nothing: two stacked wide plates need a width between them once turned 90° either way).
- Squares rather than a disk-aware layout: the 2D `computeLayout` and `radialMap` place boxes; along the axes a box layout's square spacing is exactly the circle bound. Radial pays up to √2 on diagonals.
- **Trade-off (measured, Continent spacing ×1, 10 synthetic continents with 20–70 × 5–10 plates):** planet radius left-right 182 → 706 (×3.9), top-down 354 → 706 (×2.0), radial 346 → 518 (×1.5); one continent of 10 siblings 103 → 194. The left-right tree pays most because siblings stacked in a column now need a plate's width between them (at a 90° camera roll they stand side by side). This is inherent to "upright + never overlap + layout doesn't follow the camera", not to the method. Radial is the most compact Direction now. `CONTINENT_MARGIN` and the Continent/Node spacing sliders are unchanged.
- Organic and Flat slices: untouched (billboards have `aRight` = 0 and skip the spin; `continentMap` is Planets-only; boundary hulls off planets use the plate size as before).

| File | Change |
|---|---|
| `src/graph3d/upright.ts` | New: `uprightSpin`, `uprightFrame`, `ViewBasis`, `UPRIGHT_GLSL`, `spinFootprint` |
| `src/graph3d/upright.test.ts` | New: face-on roll, in-plane only, upright across a globe, smooth over a pole + edge-on with screen-up along the normal, seen from behind, footprint holds every spin |
| `src/graph3d/planets.ts` | `continentMap` lays out at `spinFootprint` squares (tree + radial); `MapPlate` sizes are footprints |
| `src/graph3d/planets.test.ts` | Spacing tests updated to footprints; new "plates spun upright": circles never meet (3 directions, mixed sizes), no overlap once spun from 4 cameras (SAT) |
| `src/views/Graph3DPlates.ts` | `ORIENT_GLSL` spins plate/glyph axes with `uprightSpin` |
| `src/views/Graph3DNear.ts` | `view` basis, `plateFrame()` used by `tilt`, `placeTilted`, `worldPlate` |
| `src/views/Graph3DBoundaries.ts` | Planet plates' patch footprint = `spinFootprint` square |

**Fixture.** No new fixture: `vault/tests/graph3d/Galley Handbook.md` (10 continents), `vault/tests/graph3d/Anchor Radial.md`.

**Could not verify / known gaps.**
- Nothing seen in Obsidian; the GLSL compiles only in Obsidian (it mirrors the unit-tested TS line for line).
- Planets are much bigger at ×1 (above). If that feels too sparse, the levers are the Direction (radial is tightest) or a later disk-packing layout; shrinking the footprint would bring overlaps back at some camera roll.
- Bigger planets push more of a note into the mist at the same zoom; fog/fit were not retuned.
- Near panels spin from the camera as of `Graph3DNear.update`; the shader uses the render-time camera. Same tick, so they should agree, as panel positions already did.
- Near-tier occluder prefilter (`platesOnScreen`) is still a screen-aligned box of the unspun size (only a prefilter; the exact hole uses the spun corners).
