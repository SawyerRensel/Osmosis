---
title: "Perf - Full frame timing readout in 3D and 2D"
summary: "Round 10 (T76). The 3D gauge times only ~2.3 ms of a 28 ms frame. Time everything (panel renderers, layout ticks, browser style/layout/paint), give the 2D map the same gauge, and add a 10,000-line benchmark note."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[3D Graph - Stress web first settle runs at 2 fps]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T18:30:00.000Z"
date_modified: "2026-11-12T18:40:00.000Z"
date_start_scheduled: "2026-11-12T18:28:59.000Z"
date_start_actual: "2026-11-12T18:28:59.000Z"
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

# Perf - Full frame timing readout in 3D and 2D (T76)

## Why
Sawyer wants the 2D and 3D Mind Map views to run at a smooth 60 fps on very large notes. The 3D gauge (`src/views/Graph3DPerf.ts`) times only the scene's `tick()` and `WebGLRenderer.render`, and those cover about a tenth of the frame (see the baseline). The fix tickets that follow (T77–T80) need numbers for the other nine-tenths.

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

## What to build
1. **3D gauge: time what is untimed today, behind the existing toggle.** Record nothing while hidden, as now. Add:
   - The near tier's CSS2D and CSS3D renderers. They are registered as `extraRenderers` (`Graph3DScene.ts` ~597) and their render calls `Graph3DNear.place` per panel. Wrap their `render` the way the WebGL render is wrapped.
   - Within that, the time spent in `place` / `placeTilted`, and counts per frame of mask writes (`cutHoles` writes that weren't skipped) and transform writes.
   - The force-engine tick, if the engine is still ticking (`onEngineTick`, ~682).
   - **The browser's own work:** use the Long Animation Frames API (`PerformanceObserver`, type `long-animation-frame`; check that Obsidian's Electron supports it). Report style and layout time (`styleAndLayoutStart`) and the render-phase time (`renderStart`). Where it is unsupported, show the untimed remainder as frame avg minus the timed parts.
   - The number of live panels, and the count of each kind (code block, image, plain).
2. **2D gauge:** the same gauge in the 2D Mind Map, with the toggle in the same place and hidden by default. Show:
   - fps and frame avg/worst while panning and zooming;
   - the cull pass time (`runCullUpdate`) and the number of nodes drawn and kept in the DOM;
   - the time of the last parse, layout and full render, and the last edit's commit time (from the keystroke or op to the redrawn map);
   - the same LoAF style/layout/render numbers.

   Keep the gauge code small and shared with the 3D one where it can be (a pure frame-stats module that vitest can test).
3. **Benchmark notes:** extend `e2e/generate-graph3d-stress.mjs`, or add a sibling generator following its pattern (deterministic output; the master copy in `e2e/fixtures/…` is gitignored, as is the copy in `vault/tests/…`).
   - **"Perf 10k"**: one note of about 10,000 lines. Mix headings at depths 1–5, nested lists, prose, adjacent-line groups (T75), code blocks, callouts, tables, a few images from `vault/media`, block refs and wikilinks. Use neutral domains (no biology).
   - **"Perf 3k"**: a smaller one for phones.
4. **Vitest benchmarks** for the pure 2D pipeline on the 10k note: `OsmosisParser.parse` and `computeLayout` (`src/layout.ts`). Report the numbers rather than assert them; wall-clock asserts are flaky here (memory `flaky-parser-perf-test`).

## Out of scope
Fixing anything. Record the vitest numbers and the obvious suspects for T77–T80 in the implementation notes.

## Context budget
Keep it under ~130k tokens. Read `Graph3DPerf.ts` and `Graph3DNear.ts` whole (they are small). Read `Graph3DScene.ts` only at ~590–720 and ~2940–3000. For `MindMapView.ts`, read only the cull, render and edit-commit paths by grep (`runCullUpdate` ~3411, `computeLayout` ~8501).

## Test plan (Sawyer)
Run the generator. Open "Perf 10k" in 2D and in 3D, open the gauge, and pan, orbit and edit. Report the numbers. These numbers are the baseline T77–T80 are judged against.

## Batch implementation notes (awaiting manual test)

Code commit `d8fb864` on `feature/perf-frame-readout`. Measuring only: no behaviour changes, and nothing is recorded while a gauge is hidden (every hook checks the toggle first; the 2D gauge's frame clock and the LoAF observer only exist while shown).

### Approach
- **Shared pieces.** `src/perf-stats.ts` (pure, tested): a sliding-window `Rolling`, the LoAF phase split (`loafPhases`: script = `renderStart − startTime`, rAF/ResizeObserver = `styleAndLayoutStart − renderStart`, style+layout = end − `styleAndLayoutStart`), `untimedMs` (frame avg minus the timed parts) and the readout's browser line. `src/views/PerfGauge.ts`: the top-left toggle + readout and the `long-animation-frame` `PerformanceObserver`, used by both views.
- **3D (`Graph3DPerf`).** As before, plus: the near tier's CSS2D and CSS3D `render` wrapped like the WebGL one (summed per frame as "panels: render"); `Graph3DNear.stats` (null while hidden) sums the time in `place`/`placeTilted`, the transform writes (one per panel placed) and the mask writes that were not skipped; the force-engine tick; live panels by kind (code = has a `pre`, image = `img`/`video`/embed, else plain).
- **2D (`MindMapPerf`).** fps and frame avg/worst from its own rAF clock (only while shown); cull pass time (`runCullUpdate`, per pass, wall time incl. its awaited node draws); nodes in the layout, drawn (`renderedNodeIds`) and node groups in the DOM; last parse, last full render split into measure (`measureNodeSizes`) and `computeLayout`; last edit commit; the same LoAF line.

### Readout lines
3D: `panels: render … place … transforms … masks … /frame`, `live panels N (code, image, plain)`, `engine: idle | x ms/tick, n ticks/s`, `browser (…)` / untimed. 2D: `fps`, `cull: passes/s avg (max)`, `nodes / drawn / in DOM`, `last parse … render … (measure …, layout …)`, `last edit commit`, browser line.

### Decisions worth remembering
- **LoAF only reports frames longer than 50 ms.** At ~28 ms frames the browser line will say "no frame over 50 ms"; the always-shown `untimed … ms/frame` (frame avg minus everything timed) is then the number for style/layout/paint/composite. Support is detected at runtime (`PerformanceObserver.supportedEntryTypes`); I could not check Obsidian's Electron version from here. Chrome shipped LoAF in 123.
- **Engine tick is timed from the charge force to the next WebGL render.** three-forcegraph does not expose its d3 simulation, and replacing the link force to time it would reorder the forces. So the link force (first in the order) is untimed; the charge, notes, flatten and planets forces, d3's integration and the engine's node-position copy are in. Shown per tick and as ticks/s; the untimed remainder subtracts its per-frame share.
- **Transform writes = panels placed.** Each `place` writes the box transform once; the CSS2D/CSS3D renderer writes the anchor's too (not counted separately: always one per visible panel object).
- **Parse time is a cache miss.** The view parses through `ParseCache.get`; the gauge wraps it and records only calls that returned a tree it had not seen (a hit is the content hash, 0.4 ms on 10k). A tree first parsed while the gauge was hidden counts once when it is next fetched.
- **Edit commit** runs from `assertEditableFresh` (every map mutation passes it) to the end of the next full render pass. An op refused after the guard leaves the mark until the next render; the next op overwrites it.
- **2D placement:** the top-left corner of the map was free (toolbar is bottom-centre, find bar top-right). The gauge stops pointer/wheel events so clicking it does not pan or deselect, and is re-attached after every render pass (which empties the container), like the toolbar.
- **CSS classes renamed** `osmosis-graph3d-perf*` → `osmosis-perf*` (shared). The 3D readout keeps its click-to-hide-plates (`.is-clickable`); the 2D one has no click.

### Benchmark notes
`node e2e/generate-perf-notes.mjs` writes `e2e/fixtures/perf/Perf 10k.md` (10,002 lines, 4,136 nodes) and `Perf 3k.md` (3,002 lines) and copies them to `vault/tests/perf/`. Both directories are gitignored (`.gitignore`). Headings H1–H5, nested lists to depth 4, prose, adjacent-line groups of 2–4 lines, code blocks (ts/python/text), tip callouts, tables, three images from `vault/media`, `^bN` block IDs with `[[#^bN]]` refs, and cross-links between the two notes. Sailing/workshop/bookkeeping/painting words.

### Vitest benchmarks (measured, this machine, `src/perf-bench.test.ts`, median of 5 after 2 warm-ups)
| Step on Perf 10k | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| `OsmosisParser.parse` (4,136 nodes) | 11.8 ms | 12.6 ms | 13.7 ms |
| content hash (cache hit cost) | 0.4 ms | 0.4 ms | 0.4 ms |
| `computeLayout` (default sizes) | 2.7 ms | 3.3 ms | 1.8 ms |

Reported via `console.debug`, not asserted.

### Suspects for T77–T80
- **measured** (Sawyer's baseline): ~90% of the 3D frame (≈25 of 28 ms) is outside tick + WebGL render. The new gauge splits this into panel renders, place, engine and the untimed browser remainder.
- **measured**: on 10k lines, parse (~12 ms) and `computeLayout` (~2–3 ms) are small. A slow 2D full render or edit commit is therefore elsewhere.
- **read from code**: `measureNodeSizes` renders every node's Markdown into a detached div on every render pass (4,136 nodes), and each edit commit runs a full pass. Likely the bulk of 2D render/commit time; the gauge's `measure` field will show it.
- **read from code**: each cull pass walks all layout nodes twice and runs one `querySelectorAll` per node leaving the view.
- **read from code**: every 3D frame, every panel gets unconditional style writes: the anchor's opacity in `update`, the box transform and the veil opacity in `place`, and the renderer's anchor transform. In motion the masks change too, and each mask write re-rasterises a `mask-image`. With 48 live panels this is a strong candidate for the untimed style/layout/paint time.
- **read from code**: the CSS2DRenderer sorts its objects by distance every render and writes `zIndex` per object.

### Surface map
| File | Change |
|---|---|
| `src/perf-stats.ts` | New: pure frame stats (`Rolling`, `LoafStats`, `loafPhases`, `untimedMs`, `loafLine`) |
| `src/perf-stats.test.ts` | New: 7 tests |
| `src/perf-bench.test.ts` | New: parse / hash / computeLayout benchmarks on Perf 10k (reported) |
| `src/views/PerfGauge.ts` | New: shared toggle + readout + LoAF observer |
| `src/views/Graph3DPerf.ts` | Rebuilt on PerfGauge; panel renders, place, transforms, masks, engine, panel kinds, browser line |
| `src/views/Graph3DNear.ts` | `NearStats` / `stats` (null while hidden), `place` timing wrapper, mask-write count, `panelKinds()` |
| `src/views/Graph3DScene.ts` | Passes `near` to the perf; `perf.engineTick()` at the start of the charge force |
| `src/views/MindMapPerf.ts` | New: the 2D gauge |
| `src/views/MindMapView.ts` | Creates/attaches/destroys the gauge; hooks in `runCullUpdate`, `renderPass`, `assertEditableFresh` |
| `styles.css` | `osmosis-graph3d-perf*` → `osmosis-perf*`; pointer cursor only on a clickable readout |
| `e2e/generate-perf-notes.mjs` | New: Perf 10k / Perf 3k generator (exports `buildPerfNote`) |
| `.gitignore` | `/e2e/fixtures/perf/`, `/vault/tests/perf/` |

### Retest (desktop and phone)
1. Run `node e2e/generate-perf-notes.mjs`, then reload Obsidian (Ctrl+R).
2. **2D, desktop:** open `tests/perf/Perf 10k`, Mind Map view. There is a gauge icon at the top left. Click it: the readout opens under it. Clicking it must not pan the map or deselect. Pan and zoom: fps, frame avg/worst and cull passes update twice a second. Edit a node's text and commit: `last edit commit` and `render (measure, layout)` fill in. Click the icon again: the readout hides.
3. **3D, desktop:** open the 3D graph on Perf 10k with Panel detail 1 and Live panels 48. Open the gauge, then orbit and fly: check the `panels`, `live panels`, `engine` and `browser`/`untimed` lines. Clicking the readout still hides or shows the plates.
4. **Phone:** repeat 2 and 3 on `tests/perf/Perf 3k`.
5. Record the numbers here. They are the baseline T77–T80 are judged against.

### Not verified
I can't see Obsidian, so none of the following is checked: the gauge layout in 2D, LoAF support in Obsidian's Electron, the numbers themselves, and whether the 2D gauge overlaps anything in study modes (spatial study pill, rating bubble).
