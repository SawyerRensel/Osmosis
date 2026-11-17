---
title: Mind Map - Balance both sides by area
summary: "Both sides" split the root's branches by child count, so one side ran far longer than the other. Balance by laid-out extent instead (2D map and Planets continents).
tags:
  - task
calendar:
  - Bug
context:
people:
location: e2e/fixtures/mindmap-balance-by-area.md
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Planets mode]]"
status: Done
priority:
progress:
date_created: "2026-11-10T03:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-10T03:00:00.000Z"
date_start_actual: "2026-11-10T03:00:00.000Z"
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

# Bug Report

## What happened?

With Balance set to "Both sides", the 2D mind map and the 3D Planets continents split the root's branches by **child count**, not by the space they take up. One side ends up much longer than the other (Sawyer, 2026-11-09; screenshots: zoomed-out 2D JavaScript map, left side far longer than the right; 3D "Arrays" continent).

## What should have happened?

Spec (settled, do not re-decide):

- Only "Both sides" changes. Weigh each root branch by its laid-out extent across the layout axis: subtree height in a left-right map, subtree width in a top-down map. Use the real measured node sizes (images, cards) and the gaps the layout already uses. Collapsed or folded branches count by their visible size.
- Keep document order: pick one cut point in the branch list. The first run goes to the side that gets the first run today (the primary side: right / down), the rest to the other side. Choose the cut that makes the two sides' total extents most nearly equal; on a tie, prefer today's behaviour.
- "Alternating" stays strict (one each way). "One side" is unchanged.
- Explicit per-node side overrides keep winning. Balance only the branches without an override.
- 2D and the 3D continents share the code, so the fix covers both. Continents balance by their `flatSize` plate sizes.
- Change nothing else in the layout (spacing, ordering within a side, centring).

## Where is this file located?

`e2e/fixtures/mindmap-balance-by-area.md` (copied to `vault/tests/mindmap/`).

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Cause.** `splitChildrenBySide` in `src/layout.ts` cut the pivot's children at `ceil(n / 2)`, whatever their sizes.

**Approach.** In the "both-sides" branch, each child's subtree span (`computeSubtreeSpans`, the same measure the layout positions with, so it includes measured sizes, vertical spacing, and only the visible children of collapsed nodes) is computed first. New exported pure helper `chooseBalanceCut(freeSpans, fixedPrimary, fixedSecondary, gap, preferred)` returns how many of the free branches go to the primary side. A side's extent is the sum of its spans plus `verticalSpacing` between siblings. The tie rule starts from the count-based cut and only moves to a cut that is better by more than 1e-9. In top-down the layout has already swapped width and height, so the span is the width, as required.

**Decisions worth remembering.**

- Overrides: the only per-node override is `nodeSides` (from the per-node `side` style, `buildNodeSidesMap`). The global `layoutSide` setting is ignored in both-sides mode, as before. Overridden branches are not balanced: their spans count as fixed load on their pinned side while the free branches are cut. They are still moved by the original override loop, which I left untouched, so the existing ordering quirk (a moved branch lands at the end of its side) is unchanged.
- The cut may in principle be 0 or n (all on one side); it only wins if it is strictly more balanced, which for 2+ unpinned branches it never is.
- The "preferred" cut for ties is the count-based one over the free branches, derived from the all-children `ceil(n/2)` index rule, so a note without overrides and with equal-sized branches lays out exactly as before.
- Because the cut is contiguous, a very tall branch in the middle can't be moved out of the way; the result is the best contiguous cut, not a perfect balance (that would reorder branches, which the spec forbids).
- Continents: `continentMap` -> `treeMap` -> `computeLayout` with `balance: style.balance` and `sizes` from `flatSize`, so continents pick the fix up with no change to `planets.ts`. Radial continents don't use `computeLayout` and are unaffected. A continent test confirms it.

**Surface map.**

| File | Change |
|---|---|
| `src/layout.ts` | `chooseBalanceCut` (new, exported), `overrideSide` helper, both-sides branch of `splitChildrenBySide` now cuts by span; takes `cfg` |
| `src/layout.test.ts` | New describe blocks: balance by extent (equal sizes, huge branch, last branch, subtree weight, overrides, top-down width, alternating, one-side) and `chooseBalanceCut` |
| `src/graph3d/planets.test.ts` | Continent both-sides balances by extent |
| `e2e/fixtures/mindmap-balance-by-area.md`, `vault/tests/mindmap/mindmap-balance-by-area.md` | Fixture |

All existing layout tests pass unchanged.

**Fixture.** `vault/tests/mindmap/mindmap-balance-by-area.md`: three tiny branches (Flags, Fenders, Mooring), a tall Provisioning, a tiny Radio, a tall deep Rigging (expected cut: first four right, last two left); `balance: both-sides`. A count-based split gave one side the three tiny branches and the other both tall ones.

**Manual test.**

1. Reload Obsidian (Ctrl+R). Open the fixture and switch to the Mind Map view. Expect Flags, Fenders, Mooring and Provisioning on the right and Radio and Rigging on the left, the two sides similar in height (before: only the three tiny branches on the right, Provisioning, Radio and Rigging all on the left).
2. Change `direction` to `top-down` in the note's properties: the cut now follows widths and the map splits above and below the root.
3. Planets: Overlays -> Layout: Planets, open the note's planet; its continent (note property `balance: both-sides`, or Overlays default) should show the same split, the same grouping.
4. Set `balance: alternating`: strictly one each way. `one-side`: all on one side.

**Not verified.** Obsidian rendering (cannot run it); visual look of the continents.

**Results.** Lint clean, 2776 vitest tests pass, build passes.
