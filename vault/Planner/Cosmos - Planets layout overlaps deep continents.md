---
title: Cosmos - Planets layout overlaps deep continents
summary: "T114. In the Planets layout, continents with many deeply branching nodes overlap their plates. Improve placement so plates don't overlap, without spreading nodes far apart."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Cosmos - Boundaries wrap the full plate of big nodes]]"
status: In-Review
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
date_start_scheduled: 2026-11-24T00:38:36.000Z
date_start_actual: 2026-11-24T00:38:36.000Z
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

# Cosmos - Planets layout overlaps deep continents (T114)

## What Sawyer asked
> Nodes are still overlapping in Planet layout of the Cosmos view, especially for continents with many nodes that branch deeply. Let's improve node placement without needing to make them very far apart.

Screenshot `ref/screenshots/Screenshot_20261123-054448.png` (phone). Plates such as `like href o…`, `type[attribute*=value]`, `.author-class { color: pink; }`, `like :active or :focused` / `like #header` and `author-id { col…` / `meant to ove…` sit on top of each other inside one continent.

## Current state
- `src/cosmos/planets.ts` (978 lines):
  - `planetTrees` 74–105: one planet per note root, and each child of the root is a continent.
  - `continentMap` 179–195 lays each continent out with the 2D map's `computeLayout` (`treeMap` 141–177) or `radialMap`, then measures reach and area.
  - `planetRadius` 217, `wrapPlate` 286, `spreadContinent` 322, `placeContinents` 428, `layoutPlanet` 548–589 (wraps the flat maps onto a sphere, with optional shells).
  - `PlanetWorld` 719–965 (`update` 787, `placeAll` 828, `step` 857).
- Called from `CosmosScene.updatePlanets` 930–950; sizes come from `flatSize` 960–966 (the larger of the far plate and the near panel, `panelBoxEm`).
- **Diagnose first.** Possible causes:
  - The flat map uses sizes that don't match the drawn plates.
  - The sphere wrap (`wrapPlate`) compresses distances away from the continent centre.
  - Continents overlap each other.
  - Sizes change after near-panel measurement without a re-layout.
- Find which one applies, and measure it: write a unit test on a deep fixture tree that counts overlapping plate pairs after `layoutPlanet` before you change anything. That count is the success metric.
- T113 (just before this ticket) changes boundaries to wrap panel sizes; read its notes in `vault/Planner/Cosmos - Boundaries wrap the full plate of big nodes.md`.

## Acceptance criteria
- On a deep, wide fixture continent (≥40 nodes, depth ≥5, mixed plate sizes including code), the overlapping plate pairs after layout are 0, or name the remaining count and the reason.
- Overall continent spread grows by no more than ~25%. Report the measured before and after reach.
- Other layouts are unaffected; existing `planets.test.ts` tests pass.

## Test plan
Fixture: a note shaped like the screenshot's (CSS selectors): a root, ~6 continents, one with 40+ nodes branching 5 deep, including short code lines and a tall code block. In Cosmos Planets, zoom over the big continent on desktop and phone: no plates overlap, and the continent isn't spread far.

## Context budget (~70k tokens)
- `src/cosmos/planets.ts` 60–600 (read 600–978 only if `PlanetWorld` is implicated); `src/views/CosmosScene.ts` 925–970; `src/cosmos/planets.test.ts` skim; the 2D `computeLayout` signature only.

## Conventions
- Batch 15 ticket: commit `feat(T114): …`/`fix(T114): …` plus one `docs(T114)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section (approach, decisions, surface map, fixture, test steps, what was not verified). Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes outside `src/views/` (vitest cannot import obsidian) and gets unit tests.
- Fixtures: master copy in `e2e/fixtures/`, copied to `vault/tests/`; back-date every fixture card; neutral subject domains (no biology).

## Batch implementation notes (awaiting manual test)

Code commit: 86c344a on `batch/15-plates-study-polish`.

### Cause (measured)
None of the four suspected causes. A unit measurement on a CSS-shaped continent (47 lines, 5 deep, panels 1 to 2 rows, one 13-row code block) found **0 overlapping pairs at a camera roll of 0** in every Continent direction. In-frame sizes, the wrap squeeze (already handled by `spreadContinent`), continent-to-continent spacing and stale sizes all came out clean. The overlap comes from the **upright spin** (`upright.ts`). The map lays plates out as unturned rectangles in the continent's frame, but each plate is drawn turned about its own centre so it reads upright on screen. Two plates a row gap apart and offset sideways (cousins of different widths or depths) swing into each other after a few degrees of roll. Any continent viewed off its frame's up gets rolled: one near a pole seen from above, or one near the limb. The old doc comment said "at an unusual roll wide neighbours can touch (accepted for compactness)", but that happens at small rolls, not only unusual ones.

Before (left-right / one-side, the default): 8 pairs at ±15°, 12 at ±30°, 22 at ±45°; diameter 257.2. Both-sides: 7 / 15 / 16; diameter 361.2. Radial: 0 at every roll, because it spaces plates by their diagonals.

### Approach
- `uprightSpread` (left-right maps): a monotone stretch along y. In order down the map, each plate moves just far enough to clear every plate above it at every roll up to `UPRIGHT_ROLL` (30° either way, from `rollClearance`, sampled every 2.5°), and everything below moves with it. Order is kept, no gap shrinks, and a clear map is returned unchanged.
- A left-right map is now **wrapped about the middle of its box**, not about its head (which sits at one end). That halves how far out the wrap squeezes, so the planet came out smaller (R 167 → 153) and the stretch survives the wrap.
- `spreadContinent` also clears the plates at rolls up to `UPRIGHT_ROLL`, measured along each plate's outward bearing. It **never pushes an ancestor of the other plate**: with the centred wrap the head is far out, and pushing it swelled the whole continent (at Node spacing ×0.5 the diameter went from 282 to 466).

After: left-right / one-side has **0 pairs at every roll within ±30°**, diameter 289.7 (**+12.6%**). Both-sides: 0 within ±30°, diameter 380.1 (+5.2%). Radial is unchanged (0, diameter 448.9). Past ±30° wide neighbours can still touch (left-right / one-side: 14 pairs at 45°, 27 at 90°). Clearing every roll would need diagonal spacing, about 5× taller columns.

### Decisions
- **The roll limit is 30°.** Going higher costs spacing fast, and 30° covers most face-on and limb views. It is the constant `UPRIGHT_ROLL` if Sawyer wants it tuned.
- **Top-down is left exactly as before.** Measured, stretching it and making its spread roll-aware took its diameter from 574 to about 950 (+65%), past the 25% budget. Centring it made things worse. So top-down still overlaps at small rolls (1 pair at 15°, 7 at 30°). This is a follow-up if Sawyer uses top-down.
- Left-right maps no longer have the head at (0, 0); `ContinentMap` docs updated. Only the `centres` seeds and placement read the centre, so nothing else depended on it.
- The test "packs a continent of siblings as tightly as the 2D map" still holds: a sibling column is already clear to 42°, so it isn't stretched.

### Surface map
| File | Change |
|---|---|
| `src/cosmos/planets.ts` | `UPRIGHT_ROLL`, `rollClearance`, `uprightSpread`; `continentMap` stretches and centres left-right maps; `spreadContinent` takes `maxRoll` (top-down passes 0), checks spun overlaps, never pushes an ancestor; docs |
| `src/cosmos/planets.test.ts` | Roll tests and the deep-continent metric (0 pairs within ±30°, diameter < 1.25× pre-T114); two tests updated for the centred head |
| `e2e/fixtures/graph3d/Deep Continents.md` → `vault/tests/graph3d/Deep Continents.md` | CSS selectors note: 7 continents, "Specificity…" has 50+ lines 5 deep with inline code and a tall CSS block (no cards, so nothing to back-date) |

### Manual test
1. Reload Obsidian (Ctrl+R). Open `tests/graph3d/Deep Continents.md` in Cosmos, Planets layout, Continent direction left-right / one-side.
2. Zoom over the "Specificity determines…" continent and orbit so its plates turn moderately (look at it from somewhat above or beside). Expected: no plates overlap. At a steep roll (about 45° or more) wide neighbours may touch again, which is expected.
3. Compare its size to the other continents. Expected: it isn't spread far, and the planet is about the same size as before or smaller.
4. Repeat on a phone. Try both-sides and radial. Top-down is unchanged, so its overlaps remain.

### Not verified
- In Obsidian on desktop or phone: Sawyer tests.
- Real panel sizes against the `panelBoxEm` estimates. The measurement used estimated footprints.
- At Node spacing ×0.5 with both-sides, 2 pairs remain at 30°. At ×2 both-sides, 1 pair remains at 15° and 30°. The cause was not found within budget (more spread rounds didn't help).
