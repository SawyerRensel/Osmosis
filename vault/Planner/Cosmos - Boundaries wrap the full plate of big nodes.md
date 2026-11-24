---
title: Cosmos - Boundaries wrap the full plate of big nodes
summary: "T113. Planet clouds/boundaries wrap the small far-tier plate, so big near panels (tall code blocks) poke out of their cloud. Wrap the panel size the layout already uses."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Cosmos - Planets layout overlaps deep continents]]"
status: To-Do
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
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

# Cosmos - Boundaries wrap the full plate of big nodes (T113)

## What Sawyer asked
> Clouds/boundaries should also wrap around the perimeters of children. I'm noticing that clouds don't properly wrap around the perimeter of big nodes like tall code blocks; instead, clouds wrap around near the center of such nodes as if they are small.

Screenshot `ref/screenshots/Screenshot_20261123-054448.png`.

## Current state
- `src/views/CosmosBoundaries.ts` (248 lines). `build` 174–219 builds each plate from `n.shape.width/height` at line 195. That is the **far-tier plate**, not the near panel's measured or estimated size.
- `src/cosmos/boundary3d.ts` (287 lines):
  - `boundaryGroups` 62.
  - `hullMesh` 120–186 builds a rounded cylinder around each plate's half-width and half-height plus padding.
  - `patchMesh` 188+ projects each plate's four corners onto the sphere's tangent plane, rounds them by padding and takes `convexHull`.
- The layout already spaces nodes by the larger of the far plate and the near panel: `CosmosScene.flatSize` 960–966 uses `panelBoxEm`. The boundary should use that same size, ideally through one shared helper so the two can't drift apart.
- Cosmos code was renamed from Graph3D in batch 14 (T108).

## Acceptance criteria
- In Planets and in the other layouts that draw boundaries, every child's full near-panel rectangle lies inside its cloud, including tall code blocks and wide paragraphs.
- Boundary padding is unchanged for small nodes.
- Unit test: a boundary built for a tall plate contains all four of its corners.

## Test plan
Fixture: a heading with a 30-line code block child and a few short siblings. In Cosmos Planets and in a non-planet layout, the cloud encloses the whole code block. Check on the phone.

## Context budget (~35k tokens)
- `src/views/CosmosBoundaries.ts` whole; `src/cosmos/boundary3d.ts` whole; `src/views/CosmosScene.ts` 925–970; `src/cosmos/near.ts` 280–310; `src/cosmos/boundary3d.test.ts` skim.

## Conventions
- Batch 15 ticket: commit `feat(T113): …`/`fix(T113): …` plus one `docs(T113)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section (approach, decisions, surface map, fixture, test steps, what was not verified). Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes outside `src/views/` (vitest cannot import obsidian) and gets unit tests.
- Fixtures: master copy in `e2e/fixtures/`, copied to `vault/tests/`; back-date every fixture card; neutral subject domains (no biology).
