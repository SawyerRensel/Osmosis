---
title: "Mind Map - Pan and zoom at 60 fps on a large map"
summary: "Round 11 (T87). 2D pan/zoom at 60 fps minimum on large maps at any zoom: move the map by a composited CSS transform during the gesture and redraw once when it pauses; never show text upscaled."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - 10,000-line notes pan and zoom at 60 fps]]"
  - "[[Mind Map - 10,000-line notes open with the first view first]]"
  - "[[Fix issues on iOS]]"
status: Done
priority:
progress:
date_created: "2026-11-16T00:30:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-16T22:28:42.000Z"
date_start_actual: "2026-11-16T22:28:42.000Z"
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
# Mind Map - Pan and zoom at 60 fps on a large map (T87)

## Request (Sawyer, 2026-11-16)
> Continue working on the 2D performance. We're shooting for 60fps minimum on a large map.

## Measured baseline (Sawyer, 2026-11-16, desktop, gauge while panning, build 1eca3d3)
| Note, zoom | Nodes drawn | fps | Frame avg / worst | cull (JS) avg (max) | untimed / frame |
|---|---|---|---|---|---|
| Real 524-node note, fitted | 523 | 36 | 28.2 / 50.0 ms | 0.15 (0.2) ms | 28.1 ms |
| Same, mid zoom | 378 | 44 | 23.1 / 33.4 ms | 2.09 (5.5) ms | 21.3 ms |
| Same, zoomed in | 54 | 61 | 16.7 / 16.8 ms | 0.51 (1.2) ms | 16.2 ms |
| Parent note transcluding it, fitted | 419 of 1,229 | 28 | 36.9 / 50.1 ms | 3.67 (7.7) ms | 33.4 ms |

Parent note also: `open: first view 1020 ms  all measured 1032 ms` (T84's progressive path did not apply).

![[T87 fitted 523 nodes 36fps.png]]
![[T87 transcluding parent 28fps.png]]

**Reading (measured):** our JS is ≤ 4 ms/frame everywhere; the frame is the browser's style/layout/paint of the drawn `<foreignObject>` nodes, roughly linear in nodes drawn (~0.05–0.08 ms/node). Every viewBox change repaints them all. Faster JS or tighter culling cannot reach 60 fps; **removing the per-frame repaint during gestures** can.

## Approach (orchestrator, from the numbers; Sawyer asked for 60 fps minimum)
- **Pan:** during a gesture (drag, touchpad/wheel pan, fling, touch pan), apply a CSS `translate` to a composited layer holding the SVG instead of rewriting the viewBox each frame. Translation re-uses the existing raster → no repaint, text stays crisp (integer-pixel or subpixel translate of a layer drawn at scale 1).
- **Commit:** when the gesture pauses (~100–150 ms idle) or the transform would expose undrawn area beyond the drawn margin, fold the transform into the viewBox and run the existing cull/redraw once. Pick the margin (drawn area beyond the viewport) by measurement trade-off: larger margin = fewer commits but more paint per commit; record the call.
- **Zoom out:** may also be transform-only (`scale < 1` of the drawn raster is minification → stays sharp), committing on pause.
- **Zoom in:** **never show a raster upscaled past its drawn size** (Sawyer's hard rule, round 10). Zoom-in commits each step as today (cost falls quickly as fewer nodes are drawn), or another crisp scheme you can justify; record it.
- **iOS already pans by CSS transform** (`src/mindmap-viewport.ts`, `viewportHost`; memory `mindmap-ios-transform-pan`, PR #25): read it first and build on it — likely generalise that path to all platforms with a commit-on-idle step. Do NOT undo its three protected details (full `viewBoxFit`, `will-change` on `.osmosis-spatial-rating`, no `osmosis-webkit` suppressions).
- Everything hit-tested during a transform (clicks, hover, drag-to-move, rubber band, edit overlay positions, the rating bubble, link-pick, find highlight, minimap/gauge if any) must map through the live transform or wait for the commit.
- Secondary, only if budget allows: why T84's first-view path didn't apply to the transcluding parent (1,229 nodes, open 1,020 ms) — record the cause even if you don't fix it.

## Constraints (unchanged from round 10)
60 fps desktop and phone; text crisp at all times (never upscaled; Sawyer rejected "soft while moving, sharp on stop"); no LOD / visual changes; no regressions. Add gauge fields if useful (e.g. commits/s, transform vs viewBox frames) so Sawyer's next numbers show the effect. Label findings measured vs read from code.

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the checked-out branch, commit code by path and the note separately, `status: In-Review`, "Batch implementation notes (awaiting manual test)" with desktop + phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it.
- Pure logic outside `src/views/` (Vitest cannot import `obsidian`). Vitest `--maxWorkers=2`.
- `src/views/MindMapView.ts` (~84k tokens, NUL bytes): `grep -a -n` and range reads only. `styles.css` by range.

## Done when
On the real note at fitted zoom (~520 nodes drawn) and the transcluding parent, panning shows `fps` ≥ 60 on the gauge with no blurry text at any moment; zoom-out likewise; zoom-in no worse than today; all interactions correct after and during gestures.

## Context budget
~130k. `src/mindmap-viewport.ts`, `src/mindmap-cull.ts` whole; `vault/Planner/Fix issues on iOS.md` (implementation section) and T79's note "Batch implementation notes"; MindMapView by grep (`viewportHost`, `viewBox`, `updateVisibleNodes`, `fitViewBox`, wheel/pointer pan handlers, gauge).

## Test plan (Sawyer)
Gauge on. Real note and its transcluding parent: pan fast at fitted zoom, mid, zoomed in; Ctrl+wheel zoom out and in; touchpad pan; phone pinch/fling (Android and iOS). Record fps / frame / untimed. Check text is never soft, nodes never missing after a pause, and clicks/hover/drag/rubber-band/edit/rating bubble/find land on the right node right after a pan.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes
Code: `b5eb540` on `perf/mindmap-transform-gesture`. Lint, the full vitest suite (138 files, 3,346 tests) and `npm run build` pass. Nothing below has been measured in Obsidian yet.

### Approach
Every platform now builds `host > layer > svg`. `.osmosis-mindmap-host` clips (as on iOS already); `.osmosis-mindmap-layer` is a `will-change: transform` layer; the SVG inside paints for `paintedViewBox` (Chromium: the `viewBox` attribute, now with `overflow: visible` so its cull margin is painted outside its box; iOS: its own CSS transform, unchanged). `this.viewBox` stays the live view everything else reasons in. `updateViewBox()` computes `layerTransform(painted, live)` (`src/mindmap-viewport.ts`) and:
- **pan** (scale exactly 1): sets `translate(tx, ty)` on the layer, rounded to whole device pixels. No repaint, and **never a commit**: the SVG is not repainted for a pan at all, however far it goes.
- **zoom out** (scale < 1): sets `translate scale(s)` on the layer; repaints 1:1 150 ms after the last move.
- **zoom in** (scale > 1) or a resize: repaints at once (`paintViewBox()`), as today. Never upscaled.

Culling is unchanged and still follows the live viewBox each frame, so a pan draws entering nodes (time-boxed, 200-unit margin) into the moved layer. Those inserts should paint only the new nodes, not the whole map.

### Decisions worth remembering
- **No margin-exhaustion commit for pans.** The ticket proposed folding the transform into the viewBox when the drawn margin runs out. That isn't needed: the cull keeps drawing against the live view inside the moved layer, and a viewBox rewrite is the expensive thing being avoided. So the margin stays at `CULL_MARGIN` (200) and no trade-off measurement was needed. *Reasoned from the measured "viewBox change repaints all drawn nodes"; that inserting nodes into the layer is incremental is read from how Chromium invalidates, not measured.*
- **Zoom in repaints every step**, the same cost as today. It falls as fewer nodes are drawn, and it is the only scheme that guarantees no upscaled raster.
- **Translation is snapped to device pixels**, because a fractional offset on a composited layer resamples the text. Hit-testing (`screenToSvg` → `clientToUser(viewBox, hostRect)` on every platform now) uses the unsnapped live view, which is off by less than half a device pixel.
- **The layer is permanently `will-change`**, created at the identity, so its raster scale is 1. Toggling it per gesture would cost a promotion raster at every gesture start.
- **Resize forces a repaint** (`updateViewBox(true)`). The iOS SVG transform was measured against the old size.
- iOS's three protected details are untouched (full `viewBoxFit`, `will-change` on `.osmosis-spatial-rating`, no `osmosis-webkit`). iOS now also pans by layer instead of rewriting the SVG's own transform every frame.

### Gauge
New line: `view: N layer moves/s  M repaints/s (last <reason>)`. Reasons are `zoom in`, `zoom-out pause` and `resize`. While panning, expect about 60 layer moves/s and 0 repaints/s.

### Expected effect (estimate, not measured)
Pan at fitted zoom (real note, 523 drawn): the frame should drop from about 28 ms to roughly the cull JS plus compositing, so 60 fps is plausible. Transcluding parent (419 of 1,229): panning brings in new nodes, so expect more frames, each paying only for the nodes entering (≤ 8 ms draw budget plus their paint). Zoom out: smooth, plus one full repaint about 150 ms after stopping. Zoom in: unchanged.

### Risks to check
1. **Soft text after a zoom out.** If Chromium lowers the layer's raster scale while it is shrunk, text would stay soft after the 1:1 repaint. The fallback would be to drop and re-add `will-change` on that repaint.
2. Content far outside the SVG box (after a long pan) must still paint and hit-test. `overflow: visible` on an outer `<svg>` should allow both; iOS already relies on the same thing.

### Secondary: why T84's progressive open didn't apply to the parent (read from code, not verified)
`planOpening` returns null when the note's `osmosis-styles` frontmatter has `styles` or `variants`, or when fewer than 400 nodes still need measuring. The second can happen if the transcluded child's nodes were already in `nodeSizeCache`. I couldn't see the note, so check which one applies. Not fixed.

### Surface map
| File | Change |
|---|---|
| `src/mindmap-viewport.ts` | `layerTransform`, `layerTransformCss`, `moveKind` |
| `src/mindmap-viewport.test.ts` | pan/zoom-out/meet/snap/epsilon cases |
| `src/views/MindMapView.ts` | host+layer on all platforms, `paintedViewBox`, `paintViewBox()`, idle repaint timer, `updateViewBox(repaint)`, resize forces repaint |
| `src/views/MindMapPerf.ts` | layer moves/s, repaints/s, last reason |
| `styles.css` | `.osmosis-mindmap-layer`, SVG `overflow: visible` inside it |

Fixture: none new. Use the real 524-node note and its transcluding parent.

### Retest (Sawyer)
Gauge on. Use the real note at fitted, mid and zoomed-in zoom, then the transcluding parent.
1. **Desktop:** drag-pan fast, touchpad pan, and fling. Expect fps ≥ 60, `repaints/s 0`, and nodes appearing at the edges as you go. Then Ctrl+wheel zoom out: smooth, then one repaint (`last zoom-out pause`), with text sharp afterwards. Zoom in: no softer than today.
2. **Right after a pan, without pausing:** click a node, hover, drag a node, rubber-band select, double-click to edit (the overlay must sit on the node), open the rating bubble, and use find. Each should land on the right node.
3. **Android:** pinch out and in, fling. Same checks.
4. **iOS:** pan and fling. Check that no node bodies are stranded, the Again button doesn't smear, and text stays sharp after a pinch-out pause.
