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
status: To-Do
priority:
progress:
date_created: "2026-11-16T00:30:00.000Z"
date_modified: "2026-11-16T00:30:00.000Z"
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
