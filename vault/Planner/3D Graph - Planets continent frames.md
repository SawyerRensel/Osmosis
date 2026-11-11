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
status: To-Do
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-10T12:00:00.000Z"
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
