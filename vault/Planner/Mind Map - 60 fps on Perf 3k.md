---
title: Mind Map - 60 fps on Perf 3k
summary: "T142. The 2D mind map holds 60 fps (frame avg ≤ 16.7 ms) on Perf 3k while panning and zooming. Diagnose first, then fix the largest cost."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Cosmos - 60 fps on Perf 3k]]"
  - "[[Perf - Full frame timing readout in 3D and 2D]]"
status: In-Review
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
date_start_scheduled: 2026-11-28T09:17:11.000Z
date_start_actual: 2026-11-28T09:17:11.000Z
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
# Mind Map - 60 fps on Perf 3k (T142)

## Target
**60 fps: frame average ≤ 16.7 ms** in the 2D mind map on `vault/tests/perf/Perf 3k.md` (3,002 lines, ~52 code blocks, 6 images), while panning and zooming. This is the last ticket of the batch, so it measures the final code.

## Settled at intake (don't re-ask)
- **Diagnose first**, as in T141 ([[Cosmos - 60 fps on Perf 3k]]): reason from the 2D perf readout ([[Perf - Full frame timing readout in 3D and 2D]], `src/perf-stats.ts`). Add any timer you need as a permanent cheap readout, and give Sawyer exact numbers to read under exact motions.
- Fix the largest measured cost, and ship what gets closest. More than one test round is expected.
- **Prior rules** (`.claude/batch/archive-rounds-2-11/handoff-2d-perf.md`; memories justify-work-with-measurements and mindmap-ios-transform-pan): 60 fps is the minimum, text is always crisp, no level-of-detail tricks, and measure first. Panning uses a CSS transform, not the viewBox. Don't "simplify" the three things that memory lists.
- `MindMapView.ts` is ~84k tokens: **never read it whole**. Use `grep -an` (NUL bytes; memory mindmap-edit-grep-blind-spot) and read targeted ranges.

## Where to look
- The archive handoff lists the previous 2D perf findings and what was already tried. Start there to avoid repeating it.
- The frame path: culling against the live viewBox (`MindMapView.ts` ~L3451), the pan / zoom transform, foreignObject bodies (code blocks, images), and the perf readout hooks (`grep -an "perf\|frameStats\|PerfGauge" src/views/MindMapView.ts`).

## Context budget (~90k)
- `.claude/batch/archive-rounds-2-11/handoff-2d-perf.md` (whole).
- `src/perf-stats.ts` (whole); `src/views/PerfGauge.ts` (whole).
- `src/views/MindMapView.ts`: the grep hits above, ±40 lines each, to a cap of ~40k tokens of this file.
- The *What was implemented* section of [[Perf - Full frame timing readout in 3D and 2D]], and any "Mind Map … 60fps" Planner note (`ls vault/Planner | grep -i "60\|fps\|perf"`).

## Acceptance criteria
- Your report names where the 2D frame goes, with numbers.
- Fixes land for the largest measured cost, with no visible change in text.
- Sawyer's readout on Perf 3k reads frame avg ≤ 16.7 ms while panning and zooming, or the report gives the remaining gap and the next cost.
- lint, test and build pass. (The parser perf test is flaky under load: re-run it before investigating.)

## Test plan
1. Open `vault/tests/perf/Perf 3k.md` in the mind map (Layout Mindmap). Open the perf readout.
2. Pan steadily for 5 s, zoom in and out for 5 s, then fling-pan. Read fps, frame avg / worst, and the rows the worker names.
3. Check that the text is crisp at rest and while moving, and that code blocks and images render.

## Batch implementation notes (awaiting manual test)

Code commit `be19262` on `batch/18-one-map-layouts`. **This round is mostly diagnosis, as T141 was.** The sandbox has no GPU and no Obsidian, so no frame was measured. Each finding is labelled **measured** (Sawyer's earlier gauge numbers and traces, or a count on this machine) or **read from code**.

### Where the 2D frame goes (what is known)
- **Our JS is small (measured, T87 baseline).** Cull ≤ 3.7 ms a frame everywhere, 0.15 ms at fitted zoom. The rest of the frame is the browser's work, and it grows with the nodes drawn.
- **T87 showed the viewBox repaint was not the pan cost (measured).** Panning by moving the layer read 37 fps, the same as repainting every frame (36 fps). The trace then showed the cost tracks the number of composited layers (263, from scrolling code blocks). T88 and T89 removed those seeds. **Nobody has measured the map since T89**, and nobody has ever measured Perf 3k in 2D. So the current split is unknown, and this round's first job is to make it readable.
- **The JS frame path has no forced layout like T141's (read from code).** The pan handler reads the host rect (`screenToSvg` ×2, `updateViewBox`) before its only write, the layer transform. The cull pass in rAF writes and never reads layout. No `offsetParent`/`isShown()` anywhere in the 2D path. The only read-after-write is `positionEditOverlay`, and only while a node is being edited. One possible hidden cost: a node draw whose `MarkdownRenderer` resolves between frames dirties the DOM, and the next pan event's rect read then forces that layout early. The new `gesture` timer shows it if it happens.
- **Perf 3k carries 52 callouts, 51 tables, 52 code blocks and 6 images (measured, counted in the file).** Code blocks were handled by T88/T89. Lists render as plain text, not `li` (read from code, `getNodeDisplayContent`), so the `li` seed T89 listed doesn't apply here. Tables and images aren't positioned and have no compositing properties in Obsidian's CSS (read from `ref/obsidian-core/app.css`).
- **Callouts are the remaining seed candidate (read from code, not measured).** Obsidian gives every `.callout` `mix-blend-mode: var(--callout-blend-mode)` (lighten in dark themes, darken in light ones). Chromium can fold a blend into the layer under it only in limited cases. Otherwise the blend becomes its own composited layer and render surface, as T89's positioned seeds did. Every blend also costs an offscreen pass when the node rasters. Obsidian's own Canvas, which also pans and zooms by CSS transform, overrides it to `mix-blend-mode: normal` for callouts in its nodes.
- **Zoom in still repaints every step (read from code).** This is by design since T87, because the raster must never be shown upscaled. Its cost on Perf 3k is unmeasured. The `view … repaints/s` row, together with the new split, will price it.

### What changed
1. **Callouts in 2D nodes don't blend** (`styles.css`): `.osmosis-node-content .callout { mix-blend-mode: normal }`, the same as Obsidian's Canvas. It is scoped to the 2D map container.
2. **New readout rows (permanent, recorded only while the readout is shown):**
   - `main: gesture X ms (N events/frame, max M)  cull Y ms/frame`. `gesture` is our pan and zoom JS: the pointer-move handler (pan, pinch, drag), the wheel handler, and each fling step's `updateViewBox`. It includes any layout their rect reads force. `events/frame` checks that input is coalesced to one event a frame.
   - `untimed split: after rAF X ms (max) main thread · left Y ms off it or idle`. This is the T141 `MessageChannel` timer. It is posted from the readout's frame callback and handled once the browser's rendering of that frame is done (style, layout, paint, commit). Any cull or fling JS that ran between the post and the handler is subtracted from it. `left` = frame − gesture − cull − after rAF: raster, GPU, compositing, or vsync wait.
   - `callout blend off|on (Obsidian's)`. **Clicking the readout** puts Obsidian's blend back (class `osmosis-perf-callout-blend` on the map container), so the blend's cost reads as an A/B in one session. Hiding the readout keeps the state, and closing the view clears it.
   - The `browser … untimed` row now subtracts `gesture` as well as `cull`.

### Decisions worth remembering
- **The blend change ships on and the A/B is behind the readout**, as T141's masks were. It is unmeasured, so the A/B is how it earns its place. If it proves to cost nothing, it can stay anyway: it matches Canvas and costs no visible change in text.
- **Visible effect of the blend change (read from code):** none if Chromium isolates each `foreignObject`. A callout then blends against a transparent group, which is identical to `normal`. If it isn't isolated, the 10% callout tint composites normally over the node fill instead of lighten/darken. That is a shift of a few levels in one channel of the tint, and text is unaffected.
- **No paint-ahead for zoom in this round.** One option: repaint at a higher zoom than shown and shrink the layer, so the next zoom-in steps need no repaint. Whether that stays sharp depends on how Chromium picks the raster scale of a scaled `will-change` layer, which is the same unknown T87 flagged for zoom-out. It also costs about H² more raster per repaint, as a spike. So it waits until the split shows the zoom-in repaint is the cost.
- **Host rect not cached.** Caching it would move a forced layout out of the pan handler but not remove it. `gesture` shows whether it happens at all.
- **No hit-testing change.** The instrumented trace's `HitTest` (~1.7 ms × 102) is a candidate, but paint instrumentation inflated that trace. It needs a clean trace first.

### Surface map
| File | Change |
|---|---|
| `styles.css` | `.osmosis-mindmap-container:not(.osmosis-perf-callout-blend) .osmosis-node-content .callout { mix-blend-mode: normal }` |
| `src/views/MindMapPerf.ts` | `gesture()` hook, `main:` row, after-rAF `MessageChannel` (opened on show, closed on hide/destroy), `left`, readout click → callout blend A/B, `lists()` |
| `src/views/MindMapView.ts` | `timedGesture()` wraps the `pointermove` and `wheel` handlers; `stepInertia` times its `updateViewBox` |

### Fixture
`vault/tests/perf/Perf 3k.md` (present; gitignored; regenerate with `node e2e/generate-perf-notes.mjs`). No new fixture.

### Retest: the numbers to read
Reload Obsidian (Ctrl+R). Open `tests/perf/Perf 3k` in the mind map (Layout Mindmap) and open the perf readout (gauge icon, top left). For each motion, keep moving for 5 s, read after the first 2 s (the window is 1 s), and copy **every row**: `fps / frame avg / worst`, `cull`, `view`, `nodes / drawn`, `main: gesture … cull …`, `browser … untimed`, `untimed split: after rAF … · left …`.
1. **Fitted (Fit to view), drag-pan steadily.**
2. **Mid zoom (about a quarter of the map on screen), drag-pan.**
3. **Zoomed in (a dozen nodes on screen), drag-pan.**
4. **Ctrl+wheel zoom in only**, from fitted. `view` should show repaints/s at about the fps.
5. **Ctrl+wheel zoom out only.** Expect `repaints/s` near 0 while moving.
6. **Fling-pan** (touchpad or touch) at mid zoom.
7. **A/B:** click the readout (the row reads `callout blend on (Obsidian's)`), repeat 1 and 2, then click again to switch it off. The difference in `frame avg`, `after rAF` and `left` is what the blend costs.
8. **If you can:** DevTools → Layers panel at fitted zoom, with blend off and with it on. Give the layer count and the top compositing reasons.
9. **Look:** callouts look as before (tint, border, title, text). Text is crisp at rest and moving. Code blocks and images render.

### Next round (by what the numbers say)
- **`left` large:** raster, GPU or compositing. If the A/B moves it, the callout blend was a seed. If not, the Layers count and reasons name the next seed, as in T88/T89.
- **`after rAF` large while panning, with ≈ 0 repaints/s:** main-thread style/paint per frame for a layer translate. Get a clean trace (no advanced paint instrumentation) and split pre-paint, paint and commit. Hit-testing (`HitTest`) is the code-read candidate.
- **Zoom-in rows high only:** the zoom-in repaint is the cost. Paint-ahead (above) is the candidate, after a check that a shrunk `will-change` layer keeps its raster scale (zoom out, then compare text sharpness in a screenshot).
- **`gesture` ≳ 2 ms or `events/frame` > 1:** a forced layout in the handlers, or uncoalesced input. Cache the host rect from the `ResizeObserver`, or coalesce to one `updateViewBox` a frame.

### Could not verify
Every rendering number above. Also unverified: that Chromium isolates each `foreignObject` (the "no visible change" argument rests on it); that a callout blend is really a layer seed; and that the posted message runs right after the frame's rendering (queued input tasks ahead of it would be counted too, so treat `after rAF` as approximate). Cosmos panels (`.osmosis-cosmos-near-body`) still blend their callouts. That was out of scope, and the same A/B there would tell whether it matters for T141.
