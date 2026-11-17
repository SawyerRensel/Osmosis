---
title: 3D Graph - Wider near-tier slider ranges
summary: "Live panels now goes up to 128 on desktop and mobile, and Panel detail up to x4 (x1/4 to x4), so panels can open from farther away."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[3D Graph - Near-tier sliders]]"
status: Done
priority:
progress:
date_created: "2026-11-10T04:00:26.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-10T04:00:26.000Z"
date_start_actual: "2026-11-10T04:00:26.000Z"
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

# Optimization

## What tool or process needs improvement?

The Overlays menu's "Live panels" and "Panel detail" sliders (see [[3D Graph - Near-tier sliders]]).

## What's slow or frustrating about it?

Sawyer: "increase the max number of nodes that can be fully rendered from 48 to 128 on the slider. Also increase the max distance that they can render on the other slider."

## What would "better" look like?

- Live panels: 4 to 128 on desktop and mobile (was 4 to 48 / 4 to 24). Sawyer: up to the user's discretion; modern phones have plenty of RAM/VRAM.
- Panel detail: x1/4 to x4 (was x1/2 to x2), so the enter scale runs 0.15 to 2.4 (was 0.3 to 1.2).
- Defaults (`NEAR_BUDGET` 24 / 12, detail 1) and the minimums are unchanged.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Approach.** Two constants in `src/graph3d/lod.ts`: `NEAR_BUDGET_RANGE` max 128 for both devices, `DETAIL_LIMIT` 4. Everything else derives from them: `cleanNearTier` clamps to them, and the Overlays sliders read them (`setLimits(-log2(DETAIL_LIMIT), +log2(DETAIL_LIMIT), 0.25)`, so the detail slider now has 33 steps; the budget slider step stays 1). Labels needed no change (`x4.0`, `at 0.15x`).

**Audit.** Nothing assumes a budget of 48 or less: the panel pool is a `Map` in `Graph3DNear`, `chooseNear` sorts whatever qualifies and truncates to the budget, there are no fixed-size arrays. The culling pass is O(nodes) with an early `scale < exitScale` skip, so a lower exit scale (x4: 0.15 x 0.75 = 0.11) lets more nodes through to `nearMarkdown` and `plateVisibility`, but only as probes, and the chosen set is still capped by the budget. Doc comment "0.3 to 1.2" in `lod.ts` updated; docs table in `docs/mind-mapping/graph-3d.md` now states the ranges.

**Decision / risk to eyeball: x4 detail.** There is no minimum on-screen text size anywhere in the near tier: a panel opens as soon as its scale passes the enter scale. At x4 that is 0.15, so a one-line panel (about 32 px laid out) opens about 5 px tall, and its text is unreadable at that size. It is the plate (glyph atlas) that is readable-ish there, so the panel mostly just replaces it at a sub-legible size. I did not add a floor because Sawyer asked for the range and said the user decides; if it looks wrong at x4, a floor belongs in `chooseNear`'s `canEnter`.

**Measurement** (`e2e/measure-near-panels.ts`, Node only, real `Graph3DNear` plus three's CSS2D/CSS3D renderers over a fake DOM; 800-plate planet, 1600x900, 2000 frames, mean of 3 rounds, the "panels" delta over the same frame with the tier off). The script now takes a budget loop (24, 48, 128) and hovers at 240 and 400 so each budget fills:

| Budget | Mode | Live panels | Script cost per frame |
|---|---|---|---|
| 24 | CSS2D flat | 24 | 0.45 ms |
| 24 | CSS3D tilted | 24 | 0.25 ms |
| 48 | CSS2D flat | 48 | 0.50 ms |
| 48 | CSS3D tilted | 48 | 0.34 ms |
| 128 | CSS2D flat | 128 | 0.75-0.80 ms |
| 128 | CSS3D tilted | 128 (hover 400; only 85 qualified at 240 because of back-facing plates) | 0.68 ms |

Per panel, the script cost falls as the count rises (about 19 to 6 us/panel in CSS2D) because there is a fixed per-frame part. Nothing is alarming: 128 panels costs under 1 ms of script per frame.

**Not measured.** The browser's own share, style recalc of the written transforms, masks and opacity, layout, and compositing/rasterising up to 128 live DOM layers (each with rendered Markdown, images, maybe diagrams and media), is NOT covered by this script and is likely far larger than the script cost. Memory for 128 rendered panels is also unmeasured. Check both with the in-Obsidian perf gauge (`Graph3DPerf.ts`), at Live panels 128 in Organic and Planets modes, ideally on a phone.

| File | Change |
|---|---|
| `src/graph3d/lod.ts` | `NEAR_BUDGET_RANGE` max 128/128, `DETAIL_LIMIT` 4, doc comment |
| `src/graph3d/lod.test.ts` | Range and limit pinned, budget-128 `chooseNear` case |
| `e2e/measure-near-panels.ts` | Budget parameter, loop over 24/48/128, hovers 240/400 |
| `docs/mind-mapping/graph-3d.md` | States the new ranges |

**Fixture.** Reuse the existing 3D graph fixtures in `vault/tests/graph3d/`; none added. Manual test: open a 3D graph of a big vault, Overlays menu, drag Live panels to 128 and Panel detail to x4.0 and check the labels, that panels open from far away, and that the frame rate holds (perf gauge). Reload, confirm the values persist.
