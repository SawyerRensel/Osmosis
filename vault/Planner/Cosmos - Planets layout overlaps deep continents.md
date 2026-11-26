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
status: Done
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-26T18:46:00.000Z
date_start_scheduled: 2026-11-24T00:38:36.000Z
date_start_actual: 2026-11-24T00:38:36.000Z
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

## What was implemented

Shipped in [PR #53](https://github.com/SawyerRensel/Osmosis/pull/53) → `release/0.0.6` (batch 15, commits `86c344a` and the fix round `9f1dd01`).

### The cause

Not any of the four causes the ticket suspected. A unit measurement on a CSS-shaped continent (47 lines, 5 deep, panels 1 to 2 rows, one 13-row code block) found **0 overlapping pairs at a camera roll of 0** in every Continent direction. The overlap comes from the **upright spin** (`upright.ts`): the map lays plates out as unturned rectangles in the continent's frame, but each plate is drawn turned about its own centre so it reads upright on screen. Two plates a row gap apart and offset sideways swing into each other after a few degrees of roll. Any continent seen off its frame's up gets rolled (one near a pole seen from above, or near the limb). The old doc comment called this "an unusual roll"; it happens at small rolls.

Before: left-right / one-side had 8 overlapping pairs at ±15°, 12 at ±30°, 22 at ±45°; both-sides 7 / 15 / 16; radial 0 at every roll (it spaces by diagonals).

### The fix

Round 0 stretched the whole map (`uprightSpread`) to clear rolls up to 30°. Sawyer then said "now there's way too much space between nodes even when Node spacing is minimal" (Both sides, Node spacing 0.65, JavaScript notes with many code blocks). Measured cause: clearing a roll ρ between stacked, sideways-offset plates costs about `(h + offset·sin ρ) / cos ρ`, which at 30° is several plate heights for code blocks; the wrap then squeezed the stretch away and the roll-aware spread won it back by pushing whole branches out. The final design:

- `uprightSpread` (the whole-map stretch) is **removed**.
- `UPRIGHT_ROLL` is **15°**.
- `spreadContinent` clears the plates at rolls up to `UPRIGHT_ROLL`, measured along each plate's outward bearing. Of an overlapping pair, **the plate that needs the shorter push moves** (the outer one on a tie), and an ancestor of the other plate never moves.
- Left-right maps are **wrapped about the middle of their box**, not their head, which halves how far out the wrap squeezes (one-side diameters were +14 to 19% without it).
- Top-down now clears the roll too, since the cheaper spread makes it affordable (+0.6% diameter on the CSS fixture, 0 pairs within 15°, was 1 to 7).

Numbers on the code-heavy both-sides fixture (`codeNote` in `planets.test.ts`), Node spacing 0.65: widest continent 321.7 pre-T114, 376.3 round 0, 356.8 final; mean nearest gap 4.69, 9.90, 6.13; pairs at 0° / ≤15° / ≤30°: 0/12/18, 0/0/0, 0/0/10. Node spacing now moves the result (widest continent 347 / 357 / 376 at ×0.5 / ×0.65 / ×1), where round 0 ignored it.

### Decisions worth remembering

- **15° is the roll limit; `UPRIGHT_ROLL` is the one knob.** Past it wide neighbours can touch again, about as often as before T114. Sawyer's original phone screenshot looks rolled about 45°, which nothing short of diagonal spacing (about 5× taller columns) clears. Clearing to 30° with the new spread rule kept diameters within +15% but raised the nearest gap +29 to +87%, which is why it was rejected.
- **An inner plate may now be pushed past an outer one**, so "the order out from the centre keeps" no longer holds. Bearings still keep and plates still only move out.
- **Left-right maps no longer have the head at (0, 0)**; `ContinentMap` docs are updated. Only the `centres` seeds and placement read the centre.
- The frame-overlap test now skips pairs farther apart than their half-diagonals: on a small planet a both-sides continent wraps almost all the way round, so plates on opposite sides projected onto each other's plane (a false positive).

### Surface map

| File | Change |
|---|---|
| `src/cosmos/planets.ts` | `UPRIGHT_ROLL` (15°), `rollClearance`; `continentMap` centres left-right maps; `spreadContinent` takes `maxRoll`, checks spun overlaps, moves the plate with the shorter push, never pushes an ancestor; docs. (`uprightSpread` was added in round 0 and removed in round 1.) |
| `src/cosmos/planets.test.ts` | Roll tests at 15°; shorter-push test; deep-continent bound 1.15× including top-down; code-heavy both-sides test (0 pairs within 15°, diameter < 1.15× and gap < 1.4× pre-T114, Node spacing tightens it); frame-overlap test skips far pairs |
| `e2e/fixtures/graph3d/Deep Continents.md` | New fixture, CSS selectors note (copy in `vault/tests/graph3d/`) |
| `e2e/fixtures/graph3d/Galley Scripts.md` | New fixture, code-heavy note (copy in `vault/tests/graph3d/`) |

### Test fixture

`vault/tests/graph3d/Deep Continents.md`: 7 continents, "Specificity determines…" has 50+ lines 5 deep with inline code and a tall CSS block. `vault/tests/graph3d/Galley Scripts.md`: three continents, 16 code blocks beside headings with children. Masters in `e2e/fixtures/graph3d/`. Neither has cards.

### Follow-ups

- **Overlaps remain past 15° of roll.** Wide neighbours can still touch at steep rolls, including the ~45° of Sawyer's original screenshot. Fixing that needs diagonal spacing, or a different way of keeping plates upright.
- Both-sides at Node spacing ×0.5 still has 2 pairs at 30°, and at ×2 one pair at 15° and 30°; the cause was not found within budget.
- Continents overlapping *each other* on crowded both-sides planets is untouched and predates T114 (6 pairs at 0° on a 7-continent fixture before, 3 to 4 now).
- Real code-block panel sizes were never compared with the `panelBoxEm` estimates the measurements used.
