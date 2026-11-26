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
status: Done
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-26T18:46:00.000Z
date_start_scheduled: 2026-11-24T00:33:25.000Z
date_start_actual: 2026-11-24T00:33:25.000Z
date_end_scheduled: 2026-11-26T18:46:00.000Z
date_end_actual: 2026-11-26T18:46:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/53
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

## What was implemented

Shipped in [PR #53](https://github.com/SawyerRensel/Osmosis/pull/53) → `release/0.0.6` (batch 15, commit `a5db51a`).

### The cause

`CosmosBoundaries.build` sized every wrapped plate from `n.shape`, the far-tier label plate. A near panel is centred on the same point but can be many times taller (a 30-line code block) or wider, so the cloud hugged the middle of the panel. Layout spacing already used the bigger of plate and panel (`CosmosScene.flatSize`), so the two disagreed.

### The fix

- New pure helper `nodeFootprint(plate, panelEm, emWorld)` in `src/cosmos/appearance.ts`, next to `nodeExtent`: the plate, grown per axis to the estimated panel (`panelBoxEm`).
- `EngineNode` stores `footprint`, set by `sizeNode` (which replaces `extentFor` and sets `extent` too) at the three points `extent` was set: node creation, data update, theme change.
- `flatSize` (flat branches and Planets `sizeOf`) returns `node.footprint`, and `BoundaryNode.shape` became `BoundaryNode.footprint`. Layout and boundaries now read one value, so they cannot drift apart.
- `hullMesh` (non-planet layouts): each ring's samples sit on 8 azimuths and the octagon's sides lie `cos(π/8)` inside them, so a wide footprint turned between two samples poked through. Each ring now reaches out to `max(r, (r − padding/2) / cos(π/8))`.
- The Planets patch needed no geometry change: it already rounds every corner by the padding.

### Decisions worth remembering

- **The estimate, not the live measured panel.** The boundary wraps `panelBoxEm`, not `CosmosNear.liveBoxWorld`. It matches the layout, stays steady as panels fade in and out with distance, and never needs DOM reads during a rebuild. Cost: the estimate leans large, so a cloud can be a little roomier than the drawn panel, and a far-away node's cloud already makes room for the panel it will open.
- **Small nodes unchanged.** Padding constants are untouched; the hull `reach` changes nothing while the half-width is at most about 5.5 × padding. A test pins a 20 × 5 plate's hull at exactly half-width + padding. A short line whose estimated panel is a little wider than its plate does get a slightly wider cloud, because the cloud now wraps what the layout reserves.
- Because layout and boundaries share the footprint, any spacing fix that honours it (T114) also keeps clouds off neighbours' panels.

### Surface map

| File | Change |
|---|---|
| `src/cosmos/appearance.ts` | `nodeFootprint` helper |
| `src/cosmos/appearance.test.ts` | `nodeFootprint` tests |
| `src/cosmos/boundary3d.ts` | `hullMesh` rings reach out for wide plates |
| `src/cosmos/boundary3d.test.ts` | Tall and wide hull corners inside at any turn; a small hull is unchanged; a tall plate's four corners are inside its patch, padding clear |
| `src/views/CosmosScene.ts` | `EngineNode.footprint`, `sizeNode` replaces `extentFor`, `flatSize` reads the footprint |
| `src/views/CosmosBoundaries.ts` | `BoundaryNode.footprint` wrapped instead of `shape` |
| `e2e/fixtures/graph3d/Boundary Big Plates.md` | New fixture (copy in `vault/tests/graph3d/`) |

### Test fixture

`vault/tests/graph3d/Boundary Big Plates.md` (master `e2e/fixtures/graph3d/`). "Bread day" has a default boundary, three one-word siblings and a 30-line code block; "Soup day" has a dashed orange boundary, two short lines and one long wrapped paragraph. No cards.

### Follow-ups

- Nobody measured how closely the cloud fits around live-measured panels, or how much a far-away tall code block's cloud now dominates the view. If the roomy estimate bothers Sawyer, the lever is preferring `liveBoxWorld` for loaded panels, at the cost of DOM reads and a boundary that changes as panels load.
