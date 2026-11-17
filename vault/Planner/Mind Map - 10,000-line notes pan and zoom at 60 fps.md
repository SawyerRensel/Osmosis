---
title: "Mind Map - 10,000-line notes pan and zoom at 60 fps"
summary: "Round 10 (T79). 2D Mind Map on a 10,000+ line note: opening, panning and zooming hold 60 fps on desktop and phone. Measure first with the T76 gauge and vitest benchmarks."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Perf - Full frame timing readout in 3D and 2D]]"
status: Done
priority:
progress:
date_created: "2026-11-12T18:30:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T23:54:47.000Z"
date_start_actual: "2026-11-12T23:54:47.000Z"
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

# Mind Map - 10,000-line notes pan and zoom at 60 fps (T79)

## Problem
Sawyer wants the 2D Mind Map to open, pan and zoom a note of 10,000+ lines at 60 fps on desktop and phone. Nothing in 2D has been measured yet; T76 adds the gauge and the "Perf 10k" note.

## Constraints (Sawyer, 2026-11-12 grill)
- **Target:** 60 fps on **desktop and phone**. On desktop, test with Panel detail 1 and Live panels 48 (the setup in the screenshot).
- **No regressions.** Keep every existing behaviour, and keep the design decisions in memory `3d-graph-view-feature` (no decluttering, no saved positions, settled nodes never move, a nearer thing covers a farther one).
- **Panel text stays crisp at all times**, in motion too. Sawyer rejected "soft while moving, sharp on stop". Never show a raster upscaled past its drawn size.
- **2D "very large" means 10,000+ lines.**
- **Measure before and after.** Record the numbers in this note. Label each finding **measured** or **read from code** (memory `justify-work-with-measurements`).

## Baseline (measured by Sawyer, 2026-11-12, desktop, JS-objects note, Panel detail 1, Live panels 48)
`fps 36  frame avg 28.2 / worst 50.1 ms · cpu: tick 1.46 ms  render 0.85 ms (max 1.2) · draw calls 6  triangles 33980  textures 1 · plates 523  glyphs 9050 · atlas 1 page ~5.3 MB · instances ~0.8 MB GPU · last plating 523 in 35.4 ms`

The JS tick plus the WebGL render explain about 2.3 ms of a 28 ms frame. **About 90% of each frame is untimed.**

## Conventions
- This is a round 10 batch ticket. Follow `batch/subagent-brief.md`: work on your own branch stacked on the previous ticket, commit the code by path and the note separately, set `status: In-Review`, and add a "Batch implementation notes (awaiting manual test)" section with retest steps for phone and desktop. No push, no PR.
- Pure logic goes outside `src/views/`, because Vitest cannot import `obsidian`. Run vitest with `--maxWorkers=2`.
- Never read these files whole; read them by range or with grep:
  - `src/views/MindMapView.ts` (~84k tokens, contains NUL bytes, so use `grep -a -n`)
  - `Graph3DScene.ts` (~37k tokens)
  - `Graph3DView.ts` (~30k tokens)
  - `styles.css` (~33k tokens)

## What the code does today (read from code)
- Nodes are SVG `<foreignObject>` elements holding rendered Markdown. The view keeps a rendered-HTML cache (`nodeHtmlCache`, ~346).
- Viewport culling with a 200 px margin (`CULL_MARGIN`, ~148). Cull passes are serialised (`runCullUpdate`, ~3411) and `drawNode` awaits `MarkdownRenderer`.
- Pan on iOS uses a CSS transform, not the viewBox (memory `mindmap-ios-transform-pan`; there are three things not to "simplify"). Idea note: "Fold every platform onto the mind map's transform pan path".

## Directions (pick by the measured cost)
- If cull passes during a pan are the cost: render newly visible nodes in batches across frames, and skip the cull while the viewport moved less than the margin.
- If the DOM size is the cost: drop offscreen nodes, recycling them through the cache.
- If style/layout is the cost: use `contain` on node boxes.
- Consider the transform-pan path on every platform, if measurement shows viewBox pans repaint. Read that Idea note and the memory first.
- Opening: run parse and layout once, then draw the first viewport before the rest.

## Done when
Panning and zooming "Perf 10k" holds a frame avg of at most 16.7 ms on desktop. "Perf 3k" holds it on a phone. Opening shows the first viewport quickly (record the time).

## Context budget
Keep it under ~130k tokens. `MindMapView.ts` by range only: cull ~3290–3430, `drawNode` ~1700–1800, layout call ~8490–8620. Read `src/mindmap-viewport.ts` and `src/layout.ts` whole.

## Test plan (Sawyer)
Open "Perf 10k" in 2D with the gauge on. Pan fast, pinch or wheel zoom, and fold and unfold a big branch. Then check a normal note for regressions: rendering, links, images, code and callouts, fold, and selection.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `450102f` on `fix/mindmap-large-pan-zoom` (stacked on T78). This is a first slice: the costs I could find and bound without seeing Obsidian. The pan/zoom paint path is unchanged (see "Not done").

### What the code did (read from code unless marked)
- **Opening measured every node with its own forced layout.** `measureNodeSizes` rendered a cell, read its size (Range rect, and a second `getBoundingClientRect` for wrapped nodes), then rendered the next one. Each read after a DOM write forces a layout: about 4,136 to 8,000 forced layouts when Perf 10k opens. Measuring is **already cached by content** (`nodeSizeCache`), so later render passes (fold, edit) only measure new or changed text. T76's note that it "renders every node on every pass" is wrong.
- **The first frame drew the wrong viewport.** `renderSvg` drew the container's top-left at zoom 1, then `fitToView` moved to the fitted view and a cull pass drew it again. **Measured** (vitest, `src/mindmap-cull.test.ts`, default node sizes): on Perf 10k at 1600×1000 the old first pass drew 32 nodes and the fit threw away all 32. The fit is clamped to MIN_ZOOM 0.1 (map 2,369 × 135,424), so **320 of 4,135 nodes are in view at open**. On Perf 3k at 390×760: 246 of 1,237.
- **Panning at fit zoom brings in up to 16 nodes per frame** (**measured**, same bench, 40 px/frame pan; 3 at zoom 1). The first time each is drawn it is a `MarkdownRenderer` call, all started in one frame.
- **Each node leaving the view ran its own `querySelectorAll`** over the whole node group, and the same for branches.

### The fix
1. `measureNodeSizes`: render all uncached cells, then read all natural widths, then narrow the cells that need it, then read their heights. That is 2 forced layouts instead of one or two per node. The sizes are the same: a cell's box does not depend on its siblings, and the cells already stayed in the measurer until the end.
2. First render: `renderSvg` starts from `fitViewBox(...)`, the same fit `fitToView` applies right after. The first pass draws the fitted view, and the `fitToView` call that follows is a no-op cull.
3. Cull pass: the leaving nodes and branches are removed in one walk of each group. Entering nodes are drawn in this order: edited, selected or strictly on screen first, then the 200 px margin. Drawing stops after **8 ms** (`CULL_DRAW_BUDGET_MS`). The rest stay out of `renderedNodeIds`, and a follow-up pass is scheduled for the next frame. Each pass always draws at least one node.

### Decisions worth remembering
- **8 ms budget**: about half a 60 fps frame, which leaves the rest for style, layout and paint. It only limits passes that are drawing a lot (uncached nodes at low zoom). Warm-cache draws are clones and fit easily.
- **Branch lines are not time-boxed.** They are plain paths and cheap. A branch can appear one frame before its node.
- **Draw order across a pass changed.** Nodes on screen are appended before margin nodes. Before this, async draws already landed out of layout order, and tree nodes don't overlap, so this should not show.
- **No CSS `contain`, no LOD, no transform-pan for desktop.** `contain: paint` would clip anything that overflows a node box (the rating bubble lives in the foreignObject). Switching desktop to transform pan needs `will-change` to be compositor-only, and Chromium does not re-raster a `will-change: transform` layer on zoom, so text would go soft. That breaks Sawyer's "crisp at all times" rule. Both need gauge numbers first.
- Chromium and WebKit align wheel/pointer events to rAF, so the one `getScreenCTM` read per wheel zoom does not cause repeated forced layouts. Left alone.

### Surface map
| File | Change |
|---|---|
| `src/mindmap-cull.ts` | New: `rectInView`, `fitViewBox`, `drawWithinBudget` (pure) |
| `src/mindmap-cull.test.ts` | New: 9 unit tests, plus the Perf 10k / 3k cull-workload report |
| `src/views/MindMapView.ts` | `fitToView` and the first-render viewBox use `fitViewBox`. `isNodeInViewport` takes a margin. `updateVisibleNodes`: one-walk removal, time-boxed draws, follow-up pass. `measureNodeSizes`: batched reads |

### Fixture
`vault/tests/perf/Perf 10k.md` and `Perf 3k.md` (run `node e2e/generate-perf-notes.mjs`). For regressions, use any normal note with links, images, code, callouts, tables, transclusions and checkboxes.

### Retest (desktop and phone)
1. Reload Obsidian (Ctrl+R). Open `tests/perf/Perf 10k` in the Mind Map with the gauge on. Note how long it takes until nodes show, and the `render (measure …, layout …)` line. Measure should be much lower than before this commit.
2. The map opens fitted, as before, with no jump from top-left to fitted. Pan fast at the opening zoom: record `fps`, `frame avg/worst`, `cull: … avg (max)`. `cull max` should stay near or under ~10 ms. `drawn` may lag `in DOM` by a few nodes for a frame. Nodes may appear one frame late at the edges, but never stay missing.
3. Ctrl+wheel zoom in and out, then fold and unfold a big H1 branch: record the same lines.
4. Phone: repeat on `tests/perf/Perf 3k` (pinch, fling).
5. Regression: on a normal note, check that node sizes look the same as before (no clipped or over-wide nodes, especially code blocks, tables, images, checkboxes and drag-resized nodes), plus links, callouts, transclusions, fold, selection, rubber-band, editing, find, styles/boundaries, reading mode, study modes with the rating bubble, and iOS pan.

### Not done / not verified
- None of the frame numbers are measured in Obsidian. I could not see it. The "before" numbers need Sawyer's gauge on the T78 build.
- **If panning at the fitted zoom is still slow**, the next suspect (read from code) is paint: about 320 foreignObjects are repainted on every viewBox change, and relaid out on every zoom step. Options then: a zoomed-out LOD, which is a visual change and needs Sawyer's OK, or transform pan with a re-raster on zoom end. The second conflicts with the crisp rule.
- The measure cells and the drawn nodes still each run `MarkdownRenderer` once per node. Seeding `nodeHtmlCache` from the measure cells would halve the opening render, but the two paths differ (XHTML namespace, code language label, live video embeds), so I left it.
