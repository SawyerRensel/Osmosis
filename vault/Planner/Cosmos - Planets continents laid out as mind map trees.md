---
title: Cosmos - Planets continents laid out as mind map trees
summary: "T124. Planets continents keep the mind map's tidy-tree shape (children stacked and centred on their parent, spaced by subtree height) instead of being pushed out radially."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: Done
batch: 16
priority:
progress:
date_created: 2026-11-24T23:17:08.000Z
date_modified: 2026-11-26T18:47:06.000Z
date_start_scheduled: 2026-11-25T00:12:19.000Z
date_start_actual: 2026-11-25T08:24:47.000Z
date_end_scheduled: 2026-11-26T18:47:06.000Z
date_end_actual: 2026-11-26T18:47:06.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/54
---

# Cosmos - Planets continents laid out as mind map trees (T124)

## What Sawyer asked
> I don't like how children are pushed so far away and obliquely from their parents. We should mimic mindmap view, where parent nodes are spaced according to the collective height of their children so that children always appear vertically centered with their parent node. Right now, in cosmos planet layout, the branches are appearing more radially instead of the desired manner I described.

Screenshot: `ref/screenshots/Pasted image 20261124083541.png`. It shows a "Javascript & DOM" continent whose branches fan out obliquely in all directions, with code plates far from their parents.

Settled at intake: lay out each continent with the mind map's tidy-tree algorithm, respecting the Continent direction and balance settings, then lay that flat tree onto the planet surface.

Related: T114 (batch 15) tuned `spreadContinent` and `UPRIGHT_ROLL`, and Sawyer said the density after the T114 fix "feels better". Keep that density.

## Current state (from a code read)
- `src/cosmos/planets.ts` (1056 lines, pure). `treeMap` L147–175 **already** calls `computeLayout` (`src/layout.ts`), passing the direction, balance, a fixed side and the plate sizes. So the flat map is already a tidy tree for `left-right` and `top-down`; only `radial` uses `radialMap`.
- The radial look most likely comes from two things after that:
  1. `spreadContinent` L388–461 pushes squeezed plates outward along their bearing from the continent centre, whole branches at a time, for up to 32 rounds.
  2. `wrapPoint` L328 (azimuthal equidistant) wraps the map onto the sphere around its bounding-box centre (L198–202).
- Confirm this by measurement before changing anything. Lay out the screenshot's shape (a head with about 6 subtrees, some with tall code plates) with and without `spreadContinent`, and report the parent-to-child angle and offset.

## Design (worker's call within these bounds)
- **Goal:** on the planet, each child group sits beside its parent along the tree axis (to the right for left-right, both sides for Both sides, below for top-down). The group is vertically centred on its parent, and parent spacing follows the subtree height, exactly as in the mind map view.
- **Overlaps:** resolve them inside the tree, not by radial pushes. Feed `computeLayout` the real footprints (`nodeFootprint`) and the spacing settings so the tree has no overlaps before it is wrapped. Keep `spreadContinent` only for collisions the wrap causes, and push along the tree axis rather than outward from the centre, or drop it if the measurement shows it isn't needed.
- The Node spacing and Note spacing settings still scale the result.
- The `radial` direction is unchanged.
- Keep T114's roll clearance (`UPRIGHT_ROLL` 15°) working. Plates spin upright with the camera (`src/cosmos/upright.ts`).

## Context budget (~80k)
- `src/cosmos/planets.ts`. Read: L1–55 (header and types), L130–240 (constants, `treeMap`, `continentMap`, roll), L310–470 (wrap and spread), L500–667 (`placeContinents`, `layoutPlanet`).
- `src/layout.ts` (656 lines). Read: `computeLayout` L105–254, `computeSubtreeSpans`/`positionNodes` L568–624. Skim `swapDimensions` L425.
- `src/views/CosmosScene.ts`: `sizeOf` L944–949, `flatSize` L971–974 only.
- `src/cosmos/appearance.ts` `nodeFootprint` L115–129.
- Existing tests: `src/cosmos/planets.test.ts` (grep the T114 cases).
- Add a unit test: for a fixture tree, each parent's children have their centroid on the parent's row (within a tolerance), sit on the tree-axis side, and don't overlap.

## Acceptance criteria
- In Planets with left-right or Both sides, children appear beside their parent, vertically centred on it, like the mind map, not fanned obliquely.
- Top-down is analogous.
- No plate overlaps within a continent at T114's fixture roll angles, and density stays close to the T114 fix's (report the diameter and nearest-neighbour gap against 4ef46b9).
- Radial is unchanged.
- Unit tests pass.

## Test plan
Open Cosmos → Planets on the note from the screenshot (Javascript & DOM) and on `vault/tests/graph3d/Long Code Plates.md`. Check that branches read like a mind map turned onto the globe. Switch Continent direction: left-right, top-down, radial. Change Node spacing and Note spacing and check that it still scales. Orbit around and check that plates don't overlap.

## What was implemented

Shipped in [PR #54](https://github.com/SawyerRensel/Osmosis/pull/54) → `release/0.0.6` (batch 16, commit `7b11eb3`).

### The cause

`treeMap` already produced a correct tidy tree; two later steps broke it.

1. **The wrap.** `wrapPoint` is an azimuthal equidistant map about the continent's centre. On the code-heavy both-sides fixture (the T114 `codeNote` shape) the big continent reaches 1.44 rad, so plates near the rim are squeezed sideways to about 0.69× their width.
2. **The spread.** `spreadContinent` then pushed the squeezed plates and their branches outward along their bearings from the centre. At Node spacing ×0.65, 13 of 30 plates moved because of the squeeze and 10 because of the roll clearance, and the reach grew from 230 to 341. Each parent's children ended 11.3 off the parent's row (6.5 in the 2D map) and 21.8 out along the axis (11.4 in the 2D map): the radial fan in Sawyer's screenshot.

### The fix

Each continent is laid out with the mind map's tidy-tree algorithm (respecting Continent direction and balance), then laid onto the planet.

- **`treeWrap`** replaces the wrap for left-right and top-down maps: an equirectangular map about the continent's centre. The map's **shorter side** becomes latitude and the longer side runs round the equator. A row or column along the latitude axis keeps its exact 2D spacing; gaps along the other axis narrow by cos(latitude). Each plate's frame is its local parallel and meridian, so the tree reads level.
- **`spreadTree`** replaces the spread for tree maps. For each overlapping pair (closer than the clearance, or at any roll up to `UPRIGHT_ROLL`) it does whichever move is shorter: *stack* (the lowest common ancestor parts its children at the pair's middle, so the ancestor stays centred on them) or *depth* (the plate slides with its branch along the depth axis, staying on its parent's row). Moves along the narrowed axis are divided by cos(latitude). The math shared with `spreadContinent` is now `pushToClear`.
- Top-down maps are centred on their box like left-right ones, which keeps the latitude axis clear of the poles.
- Radial is unchanged: it still uses `wrapPlate` and `spreadContinent`.

Result on the code-heavy both-sides fixture at ×0.65 (before is T114's `4ef46b9`): diameter 356.8 → 290.8, nearest gap 6.13 → 4.14, children's middle off the parent's row 11.3 → 7.7 (2D map 6.5), parent-child gap 21.8 → 8.1 (2D map 11.4); planet radius 180.9 → 159.7. Top-down ×0.65 diameter 643.1 → 564.3, middle off row 28.4 → 13.3.

### Decisions worth remembering

- **Denser than T114's fix, on purpose.** The old gap came mostly from the radial pushes this ticket removes; ×0.65 is now the 2D map's own spacing, and Node spacing ×1 gives 6.34, about where T114 left ×0.65. If it feels too tight, raise Node spacing rather than bring the pushes back.
- **The shorter side is latitude**, not always the stack axis. The stack axis came first (it keeps sibling columns exactly straight) but wide top-down maps crossed a pole that way (planet radius went to 1182). The shorter side keeps every map clear of the poles with no new constant and measured better on the one-side fixture (8.9 / 6.1 against 11.8 / 3.4).
- **Tall columns bow.** When a map's depth axis is the latitude, a long sibling column runs along a parallel, so on a small planet it curves round the globe. Sphere geometry; the only alternative was shearing the columns.
- **Overlaps past 15° of roll rise** (both-sides ×0.65: 10 → 18 pairs at 30°), because plates no longer get the radial pushes' extra room. 15° is the limit T114 agreed.
- Four existing tests were changed on purpose: top-down `continentMap` tests read offsets from the head (the map is now centred); the deep-continent roll test skips pairs farther apart than their half-diagonals (a wide top-down map's ends sit on opposite sides of the planet); the 10-sibling fan test asserts "between the clearance and the 2D gap" (the column narrows by 12% on that tiny planet); the core-layers test allows 1e-2 rad of continent drift (surface forces creep about 1e-3 per re-layout when two continents nearly fill opposite halves of that tiny planet).

### Surface map

| File | Change |
|---|---|
| `src/cosmos/planets.ts` | `treeWrap`, `spreadTree`, `pushToClear` (extracted from `spreadContinent`), `ContinentMap.latitude`, top-down centring, `layoutPlanet` dispatch by direction, header doc |
| `src/cosmos/planets.test.ts` | New tree-shape test (centring under 0.75× the pre-T124 value, parent-child gap ≤ 1.05 column gaps, three styles); four tests adjusted as above |

### Test fixture

No new fixture. Reuses `vault/tests/graph3d/Long Code Plates.md` and `vault/tests/graph3d/Galley Scripts.md` (masters in `e2e/fixtures/graph3d/`).

### Follow-ups

- Nothing was checked against real panel sizes or on a real globe by the worker; the numbers use `panelBoxEm`-style estimates. Sawyer's manual test passed.
- Overlaps at 30° of roll rose (see above); 15° of roll remains the supported limit, as in [[Cosmos - Planets layout overlaps deep continents]].
- The continent boundary patch (`boundary3d.ts`) projects the plates' real positions, so it should follow the new layout; nobody looked at it specifically.
