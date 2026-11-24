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
