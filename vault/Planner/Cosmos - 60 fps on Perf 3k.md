---
title: Cosmos - 60 fps on Perf 3k
summary: "T141. Cosmos holds 60 fps (frame avg ≤ 16.7 ms) on Perf 3k at Labels 'Plates and panels', Panel detail 1.00, Live panels 48. Diagnose first, then fix the largest cost."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - 60 fps on Perf 3k]]"
  - "[[3D Graph - Live panels hold 60 fps while the camera moves]]"
  - "[[Perf - Full frame timing readout in 3D and 2D]]"
status: In-Review
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
date_start_scheduled: 2026-11-28T09:07:04Z
date_start_actual: 2026-11-28T09:07:04Z
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
# Cosmos - 60 fps on Perf 3k (T141)

## Target
**60 fps: frame average ≤ 16.7 ms** in Cosmos on `vault/tests/perf/Perf 3k.md` (3,002 lines, ~52 code blocks, 6 images; the master copy is `e2e/fixtures/perf/Perf 3k.md`). Measure at Sawyer's settings: Labels "Plates and panels", Panel detail 1.00, Live panels 48.

## Baseline (Sawyer, on their own ~2,000-line note)
fps 28; frame avg 36.3 ms, worst 50 ms; cpu tick 8.44 ms; render 0.51 ms; panels render 5.00 ms, place 3.83 ms; live panels 54 (15 code, 0 image, 39 plain); **untimed 22.4 ms/frame** (browser style, layout and paint); plates 600; glyphs 10,614.

The untimed share is the biggest. It points at the DOM near-tier panels (CSS2DObject transforms, mask-image holes, veil opacity), not WebGL.

## Settled at intake (don't re-ask)
- **Diagnose first.** Establish where the frame goes before changing anything. The sandbox has no GPU, so you cannot see real frames. Do the following:
  1. Reason from the overlay's breakdown (`src/views/CosmosPerf.ts`, `src/perf-stats.ts`; untimed = frame − tick − WebGL − panel render − engine).
  2. Add any missing timer you need to the perf overlay as a permanent, cheap readout.
  3. Write down exactly which numbers Sawyer should read, under which camera motion, in your test steps.
- Then fix the largest cost, and ship whatever gets closest. More than one test round is expected: say in your report what the next round should measure.
- **Prior rules** (`.claude/batch/archive-rounds-2-11/handoff-2d-perf.md` and memory justify-work-with-measurements): text always crisp, no level-of-detail tricks, and measure before proposing. Don't lower Sawyer's settings and don't cap the panel count below their slider.

## Where to look (intake facts)
- Near panels: `src/views/CosmosNear.ts` (1,068 lines; its design header is L1–46). Each panel is a DOM tree in a CSS2DObject (CSS3DObject, tilted, in Planets). Each panel gets a full `MarkdownRenderer.render`. Bodies are cached in an LRU of 64 and cloned on reuse; media and embeds are not cached. `chooseNear` budgets 24 desktop / 12 mobile (`cosmos/lod.ts:17`), but Sawyer's slider is at 48.
- Per frame: `update()` :293, `placeOne()` :771-805 (renderOrder, re-raster on leaving the band, lens transform, mask-image holes from plates and edges via `cutHoles` :926, veil opacity).
- Candidates to *measure*, not assume: writing transform / mask / opacity styles every frame even when they haven't changed, mask-image re-rasterisation, layout thrash from reads after writes, and compositor layer count.
- Prior work: [[3D Graph - Live panels hold 60 fps while the camera moves]] (T77, ~36 fps at 48 panels) and [[Perf - Full frame timing readout in 3D and 2D]].

## Context budget (~90k)
- `src/views/CosmosNear.ts`: L1–120, L280–420, L760–960.
- `src/views/CosmosPerf.ts` (whole, 151 lines); `src/perf-stats.ts` (whole, 126 lines); `src/cosmos/lod.ts` (whole).
- `.claude/batch/archive-rounds-2-11/handoff-2d-perf.md` (whole).
- The two prior Planner notes above: their *What was implemented* sections only.
- `src/views/CosmosScene.ts`: only the frame loop. Find it with `grep -n "requestAnimationFrame\|tick(" src/views/CosmosScene.ts`, then read ±40 lines.

## Acceptance criteria
- Your report names where the frame goes, with numbers (unit or Node micro-benchmarks where possible, and the overlay numbers for Sawyer to read).
- One or more fixes land for the largest measured cost, with no visible change in text or panels.
- Sawyer's overlay on Perf 3k reads frame avg ≤ 16.7 ms while orbiting, or the ticket reports the remaining gap and the next cost to attack.
- lint, test and build pass.

## Test plan
1. Copy the Perf 3k fixture to `vault/tests/perf/` if it is missing, then Ctrl+R.
2. Open it in Cosmos (Layout Organic). Set Labels "Plates and panels", Panel detail 1.00, Live panels 48. Open the perf overlay.
3. Orbit slowly for 5 s, then fast for 5 s. Read: fps, frame avg / worst, cpu tick, render, panels render / place, untimed, and any new rows the worker added.
4. Check that panel text is crisp at rest and while moving.

## Batch implementation notes (awaiting manual test)

Code commit `c5cf030` on `batch/18-one-map-layouts`. **This round is mostly diagnosis.** The sandbox has no GPU and no Obsidian, so no frame was measured. Each finding below is labelled **measured** (Node on this machine, or Obsidian's own code) or **read from code**.

### Where the frame goes (Sawyer's baseline: 36.3 ms)
- **Timed JS + WebGL is ~14 ms:** tick 8.44 + WebGL render 0.51 + panel renders 5.00 (place 3.83 is inside the 5.00). That fits in one 16.7 ms vsync by itself. The frame lands at ~33–50 ms because the browser's own work on top pushes it past a vsync.
- **The 22.4 ms "untimed" is three things the old overlay couldn't tell apart:** main-thread style/layout/paint, work off the main thread (raster, GPU, compositing of ~50 masked panel layers), and idle time waiting for the next vsync after a miss. The new `untimed split` line separates the first from the other two.
- **Near-tier JS is small (measured, Node, `src/cosmos/near-bench.test.ts`).** On Perf 3k (1,237 nodes): `nearMarkdown` takes 1.0 µs a node, so at most 1.2 ms a frame even if every node were close. `panelBoxEm` takes 2.9 µs a node and runs only for off-screen candidates. Building mask strings for 48 panels × 8 holes takes 0.58 ms, at 4,100 chars and 49 gradient layers a panel. So `near.update` doesn't explain the 8.44 ms tick. The new tick split will show what does.
- **A forced synchronous layout every frame (measured from Obsidian's code, effect read from code).** `HTMLElement.isShown()` is `!!this.offsetParent` (in `ref/obsidian-core/enhance.js`). Reading `offsetParent` forces style and layout. The engine's rAF loop was registered first (its constructor runs a cycle synchronously), so every frame went: engine render, where the CSS2D renderer and `place` write ~5 styles × 48 panels; then our `tick`, whose first line `isShown()` forced a style recalc and layout over all of those; then the tick's own writes; then the browser recalculated again at frame end. `placeHints` also read `canvas.clientWidth/Height` mid-tick, which forced another layout whenever `near.update` had dirtied anything (new panels, fades).
- **Masks are the prime suspect for what's left (read from code, not measured).** Each panel's mask is 1 + 6 gradient layers per nearer rounded plate + 1 per nearer edge stroke. While orbiting, parallax moves every hole, so each masked panel's mask is re-parsed, re-styled and repainted every frame, and each masked panel is a separate render surface in the compositor. The new Shift+click A/B gives this a number.

### What changed
1. **One ordered frame.** `tick` now ends with `renderNow()` (`graph.pauseAnimation(); graph.resumeAnimation()`). That cancels the engine's pending frame and runs its cycle at once: simulation step, WebGL render, then the CSS2D/CSS3D panel renders. Every DOM read in the frame now comes before the frame's writes, so the browser does style and layout once, at the end. As a side effect, panels and plates are drawn with the camera the tick just moved, one frame sooner.
2. **The hints read the stage size from the engine** (`graph.width()/height()`, set in `resize`), not from `canvas.clientWidth/Height`.
3. **New perf readout rows (permanent, recorded only while the readout is shown):**
   - `cpu: tick X ms (near Y, writes Z)`: the near-tier update, and the plate, edge and shell writes after a change.
   - `untimed split: after rAF X ms (max) main thread · left Y ms off it or idle`. The after-rAF figure runs from the end of our frame callback until a `MessageChannel` message posted from it is handled. That is the browser's main-thread rendering of the frame: style, layout, paint, ResizeObserver and commit. `left` is what remains of the frame: raster, GPU, compositing and vsync waiting.
   - `masks N (L layers)`: the gradient layers in the masks written per frame.
   - **Shift+click the readout** turns off the plate/edge holes in panels (`CosmosNear.masksOff`). The row then reads `masks off`. A plain click still hides the plates.

### Decisions worth remembering
- **Pause + resume, not a fork of the engine loop.** These are 3d-force-graph's public methods. `resumeAnimation` runs `_animationCycle` synchronously and books one rAF, which the next tick cancels, so the engine still runs exactly once a frame. The old "shown again → resumeAnimation" branch was removed, because `renderNow` at the end of the same tick resumes it.
- **`tickMs` is taken before `renderNow`**, so `tick` keeps its old meaning and the render and panel timers aren't counted twice.
- **The masks A/B lives in the readout, like the plates toggle.** It is a measuring tool, so it's hidden behind Shift. Settings are untouched (no lowering, no panel cap, no LOD).
- **No mask rewrite this round.** It isn't measured, and the likely replacement is a big change (see Next round). Per `justify-work-with-measurements`, the A/B number comes first.

### Expected effect (not measured)
Removing the forced layout saves one main-thread style+layout pass a frame. That pass mostly duplicated work the frame-end pass also did, so the gain is probably a few ms, not the whole gap. **I don't expect this round alone to reach 16.7 ms.** Its job is to make the next fix a measured one.

### Surface map
| File | Change |
|---|---|
| `src/views/CosmosScene.ts` | `tick` ends with `renderNow()` (the engine cycle after our updates); `tickMs` before it; near/writes timers; the hints use `graph.width()/height()` |
| `src/views/CosmosPerf.ts` | Tick split, after-rAF `MessageChannel` timer (closed on hide/destroy), `left` remainder, mask layers, Shift+click masks A/B, `lists()`/`resetFrame()` |
| `src/views/CosmosNear.ts` | `masksOff` flag in `cutHoles`; `NearStats.maskLayers` |
| `src/views/PerfGauge.ts` | The readout click handler gets the `MouseEvent` |
| `src/cosmos/near-bench.test.ts` | New: reported (not asserted) Node benchmarks of the near tier's per-frame JS on Perf 3k |

### Fixture
`vault/tests/perf/Perf 3k.md` (present; gitignored; regenerate with `node e2e/generate-perf-notes.mjs`).

### Retest: the numbers to read
Reload Obsidian (Ctrl+R). Open Perf 3k in Cosmos, Layout Organic, Labels "Plates and panels", Panel detail 1.00, Live panels 48, and open the readout. For each motion, wait 2 s for the 1 s window to fill, then read every row:
1. **Orbit slowly for 5 s:** `fps`, `frame avg / worst`, `cpu: tick (near, writes)`, `render`, `panels: render / place / masks (layers)`, `untimed`, and **`untimed split: after rAF … · left …`**.
2. **Orbit fast for 5 s:** the same rows.
3. **Shift+click the readout (masks off) and repeat the slow orbit.** Plates now hide behind panels; that's expected. The difference in `frame avg`, `after rAF` and `left` is the masks' cost. Shift+click again to restore.
4. **Plain click (plates hidden), slow orbit:** the plates' share, for completeness.
5. **Behaviour:** panel text crisp at rest and while moving; nearer plates and edges still cut through panels; hover cursor, clicks on plates and panel links, edit-in-place and fly-to all behave as before; switch tabs away and back, and Cosmos resumes drawing.

### Next round (what to attack, by what the numbers say)
- **`after rAF` large (≳ 8 ms):** main-thread style/paint. If masks-off removes most of it, replace the CSS gradient masks. The candidate is a second, transparent WebGL canvas above the panels that draws only the plates and edges nearer than each panel, using the panels as depth/stencil quads (a real z-buffer, with no DOM writes and no masks). The own-plate exclusion, panel shapes and tilted panels are the hard parts. If masks-off doesn't help, take a performance trace to split style from paint.
- **`left` large and masks-off cuts it:** GPU/compositor cost of ~50 masked render surfaces. Same remedy.
- **`left` large and masks-off doesn't help:** layer count or fill rate. Get the Layers panel count and a trace, as in the 2D work (`handoff-2d-perf.md`).
- **`tick` still ≳ 5 ms:** the split shows whether it is `near`, `writes` or the rest (hints, boundaries, flight).

### Could not verify
Every rendering number above. Also: that Chromium runs the posted message right after the frame's rendering (input tasks queued ahead of it would be counted too, so treat `after rAF` as approximate); that pause + resume causes no visible hitch on the first frame or when the tab is shown again; and that Blink skips invalidation when the CSS2D renderer re-sets an unchanged style value.
