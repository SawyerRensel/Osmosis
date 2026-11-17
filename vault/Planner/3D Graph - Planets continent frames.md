---
title: 3D Graph - Planets continent frames
summary: "One up-frame per continent shared by all its plates, no polar caps, a radial overlap pass after wrapping, and a Continent spacing slider (x0.5 to x3) in Forces for Planets."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
  - "[[3D Graph - Plate-aware spacing]]"
  - "[[3D Graph - Spacing sliders]]"
  - "[[3D Graph - Planets ignores a note's 2D map settings]]"
status: Done
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-11T00:30:35.000Z"
date_start_actual: "2026-11-11T00:30:35.000Z"
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

# Feature Request

## What do you need built?

Planets has several problems that all come from how a continent is wrapped onto the sphere:

- Plates in one continent each get their own orientation, so near the poles plates rotate relative to the 2D map they came from.
- Continents avoid the poles (a polar cap). Sawyer: continents can sit anywhere.
- Nothing checks plate overlap after wrapping; the wrap squeezes sideways spacing outward, so neighbouring plates collide.
- There is no control over how far apart continents sit.

## What problem does this solve?

Each continent is laid out as one rigid map with one shared up-frame; the polar caps are gone; plates that overlap after wrapping are pushed apart radially from the continent centre; and Forces has a Continent spacing slider (Planets only).

## What's your current workaround?

Note spacing and Node spacing only. Continent spacing is fixed by `CONTINENT_MARGIN`.

## Batch and checkpoint

Round 7, Batch B (Planets). Checkpoint: checkpoint 1 (A + B) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Planets: one up-frame per continent (shared by its plates), no polar caps; radial overlap pass away from continent centre; "Continent spacing" slider ×0.5–×3 (re-settle exception, Planets only).

The slider re-settles live like the other spacing sliders (an approved re-settle exception to "settled nodes never move", see [[3D Graph - Spacing sliders]]). Planets spacing must stay panel-aware (the `flatSize` footprint, see [[3D Graph - Plate-aware spacing]]).

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- A continent is a root child laid out as the 2D map, wrapped onto the sphere by the azimuthal-equidistant `wrapPoint` (`src/graph3d/planets.ts:250`). Map y-down = south (frame.up = world +y projected).
- Continent centres follow a golden spiral that avoids polar caps: `CAP_ANGLE = 0.35` (`planets.ts:220`), cap logic near `:266-:287` (centres within the cap are nudged toward the equator).
- Plate orientation `tangentFrame` is computed per plate from its own offset (`planets.ts:365`), with world-up projected, so plates rotate relative to the rigid map near poles.
- There is no plate-plate overlap check after wrapping; the equidistant wrap squeezes sideways spacing outward.
- Continent push = tangential chord a-b; the cap push is toward the equator. Inter-continent margin is fixed: `CONTINENT_MARGIN = 6`, `SURFACE_FILL = 0.4`. Note spacing is between planets only, Node spacing is within a continent.
- Plates are single-sided (see [[3D Graph - Boundaries in 3D and far side dimmed]]).
- Slider plumbing to copy: `src/graph3d/overlays.ts` (`noteSpacing`, `nodeSpacing`, `SPACING_MIN/MAX`, `normalizeOverlays`, `spacingChanged`), `src/views/Graph3DOverlays.ts`, `Graph3DScene.setOverlays`; Planets re-layout is `world.clear()` + `reshape()` and the planet key includes spacing.
- Tests: `src/graph3d/planets.test.ts`.

## Acceptance criteria

- Each continent has exactly one up-frame (computed from the continent centre) shared by all its plates; plates keep the 2D map's relative orientation, including near the poles.
- `CAP_ANGLE` and the polar nudge are removed; continents may sit at any latitude, and continent placement still separates them (no overlap between continents).
- After wrapping, a radial overlap pass pushes overlapping plates outward from the continent centre until none overlap (panel-aware sizes), with a bounded iteration count.
- A Continent spacing slider, x0.5 to x3 (x1 = today's gap, step 0.05, per vault in `graph3dOverlays`, normalised and clamped like the others), appears in Forces only when the layout is Planets; dragging it re-lays out the planets live.
- At x1 the continent gap is exactly today's `CONTINENT_MARGIN`-based gap (a user who never touches it sees no spacing change).
- Planets spacing stays panel-aware: near-tier panels keep their room.

## Test plan

Unit tests first in `planets.test.ts`: (a) all plates of a continent share one frame (the frame depends only on the continent centre); (b) no continent centre is excluded by latitude (a continent can be placed at a pole); (c) the overlap pass leaves no overlapping plates for a dense continent, and does not move a non-overlapping layout; (d) continent gap at x1 equals today's value and grows monotonically with the slider; (e) normalisation/clamping of the new overlay value in `overlays.test.ts`.

Manual test (fixture: Anchor notes `Anchor Balance.md`, `Anchor Radial.md` in `vault/tests/graph3d/`, plus a note with many headings):
1. Planets layout: look at a continent near a pole; plates are oriented consistently, not splayed.
2. No empty polar cap; continents may be at the top and bottom.
3. Dense continent: no plates overlap.
4. Forces > Continent spacing: drag x3 and x0.5; continents move apart / together, plates keep their size. The slider is absent in Organic and Flat.

## Out of scope

- Plates that face the far side (see [[3D Graph - Boundaries in 3D and far side dimmed]]).
- Changing Note spacing or Node spacing semantics.
- Automatic continent clouds (decided against; boundaries are per node, see [[Mind Map - Boundary (cloud) style]]).

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Implemented on `feature/3d-planets-continent-frames` (stacked on `feature/3d-globe-drag-inertia`), commit 29b57fa. Not yet tested in Obsidian.

**Cause.** Every plate took its own `tangentFrame(offset)` (world +y projected at its own place), so near a pole plates round the continent centre each pointed "up" a different way and the continent splayed. Continent seeds were confined to a band between `CAP_ANGLE` caps and pushed out of them. The azimuthal-equidistant wrap keeps distance from the centre but shrinks sideways spacing by `sin(d/R)/(d/R)`, and nothing checked plate overlap afterwards. The continent margin was the constant `CONTINENT_MARGIN`.

**Approach.**
- One frame per continent: `tangentFrame(centre)` once, then `wrapPlate(frame, x, y, radius)` wraps the map point and *carries* the frame there (rotation about normal × map bearing by `d/R`), so each plate is tangent at its own place but keeps the continent's right/up, exactly as on the 2D map. `wrapPoint` now delegates to it.
- Caps removed: `CAP_ANGLE` and the cap push in `surfaceStep` are gone; `placeContinents` seeds a pole-to-pole Fibonacci sphere (even height steps). `CAP_FALLBACK` stays: it is still needed when a continent *centre* sits on a pole (world +y projection vanishes there; world −z is used).
- `spreadContinent(map, head, radius, clearance)`: runs before placement (overlaps don't depend on where the continent sits). Each round wraps every plate about a fixed centre, finds pairs closer than half-sizes + `clearance` on both axes of one plate's frame, and moves the outer plate (and its whole branch) straight out along its own bearing just far enough to clear. Bounded by `SPREAD_ROUNDS = 32`, no randomness, the head never moves, an overlap-free map is returned as the same object. Sizes are `flatSize` (full panel), so it is panel-aware. `layoutPlanet` spreads at the first radius and takes `max(first, planetRadius(spread maps))`, so a spread continent can grow the planet.
- Continent spacing: `continentSpacing` in `Graph3DOverlays` (default 1, clamped `SPACING_MIN`–`SPACING_MAX`, per vault like the others). `continentMap` uses `CONTINENT_MARGIN * continentSpacing`; it's in `planetKey` and `PlanetWorld.continentSpacing`. The slider sits under Node spacing in Forces, shown only for Planets (toggled by the Layout dropdown like Flatten). `spacingChanged` counts it only in Planets, so it takes the same path as Node spacing: `world.clear()` + `reshape()`.

**Decisions worth remembering.**
- Clearance in the spread is half the map's own sibling gap (`ROW_GAP * nodeSpacing / 2`): the flat map is never touched (its gaps are ≥ that), only plates the wrap squeezed.
- The spread pushes radially, not sideways, per the settled decision; it keeps bearings and the parent-before-child order, so the continent keeps its shape and just grows outward.
- Continent spacing re-lays out via `clear()` (fresh spiral seeds), like Node spacing, so ×3 then ×0.5 brings continents back together. Re-seeding from old centres would not: nothing pulls continents together.
- At ×1 the margin, reach and layout are byte-identical to before (unit-tested with `toEqual`).

| File | Change |
|---|---|
| `src/graph3d/planets.ts` | `wrapPlate` (shared continent frame), `spreadContinent` + `SPREAD_ROUNDS`, caps removed, whole-sphere seeding, `continentSpacing` through `continentMap`/`layoutPlanet`/`PlanetWorld`/`planetKey` |
| `src/graph3d/planets.test.ts` | Pole tests replace cap test; continent frames, spread (removes overlaps, deterministic, no-op when clear, laid-out planet has none), Continent spacing (×1 unchanged, margin scales, gaps grow, PlanetWorld re-lays out) |
| `src/graph3d/overlays.ts` | `continentSpacing` field/default/normalisation; `spacingChanged` includes it in Planets only |
| `src/graph3d/overlays.test.ts` | Normalisation/clamping and `spacingChanged` cases |
| `src/views/Graph3DOverlays.ts` | Continent spacing slider (Forces, Planets only) |
| `src/views/Graph3DScene.ts` | `setOverlays` hands `continentSpacing` to the `PlanetWorld` |

**Fixture.** No new fixture: `vault/tests/graph3d/Galley Handbook.md` (10 continents, some dense), `Anchor Balance.md`, `Anchor Radial.md`.

**Could not verify / known gaps.**
- Nothing seen in Obsidian.
- The spread can't help plates the wrap pushed past ~90° from their centre (there, moving outward narrows the room). `planetRadius` lets a long continent reach 0.6π, but in every realistic shape tried (tree, radial, both-sides; 1–3 continents, up to 60 plates each) no overlaps remained.
- Continent separation is still circle-packing by reach on a radius sized by bounding-box *area* (pre-existing). Many long, thin continents (reach large vs area) can't all fit and their reach circles overlap. That was true before; removing the caps gives a little more room. Fixing it would change planet sizes at ×1, so it was left alone.
- The spread costs O(n²) per round per continent and stops as soon as nothing overlaps. It runs only on re-layout, not per frame.
