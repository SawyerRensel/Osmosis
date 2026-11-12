---
title: "3D Graph - New plates lay out without a frame stall"
summary: "Round 10 (T78). Showing new data plates all nodes at once (523 plates in 35 ms; 30,865 in 380 ms on the stress web). Make plating incremental and the simulating tick cheap, so loads and edits don't drop frames."
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
date_modified: "2026-11-13T00:40:00.000Z"
date_start_scheduled: "2026-11-12T23:45:41.000Z"
date_start_actual: "2026-11-12T23:45:41.000Z"
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

# 3D Graph - New plates lay out without a frame stall (T78)

## Problem
"Last plating 523 in 35.4 ms" (measured) is a stall of about two frames each time new data is shown: on open, after every edit's re-parse, and on refocus. On the stress web it was 30,865 plates in 380 ms. A simulating tick also rewrites every glyph (~700k on the stress web; see the related note).

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

## Directions
- **Plate only what changed.** Cache each node's plate layout (glyph runs, size) keyed by its text and style, so an edit re-plates one node, not 523. Plating happens in `Graph3DScene` setData (~720–786) and `Graph3DPlates`.
- **Time-slice the rest.** Spread the remaining plating over frames, within a per-frame budget of about 4 ms. A plate that isn't laid out yet stays hidden and appears from the background, which Sawyer accepted in "Plates for every node".
- **Cheaper simulating ticks:** store each glyph relative to its plate and read the plate's centre in the vertex shader, so a tick rewrites one centre per plate, not one per glyph. Branches already use 11 of 16 vertex attributes; check the glyph material's count before adding any.
- Keep the atlas upload incremental.

## Done when
An edit on the JS-objects note never drops a frame in the gauge. "Perf 10k" opens in 3D without a frame longer than about 50 ms. Record before and after.

## Context budget
Keep it under ~130k tokens. Read `Graph3DPlates.ts` whole and `src/graph3d/plates.ts`; read `Graph3DScene.ts` only at ~700–800 and ~2970–2990.

## Test plan (Sawyer)
1. Edit a line on the JS-objects note while the gauge is open, and check that "last plating" now shows a small count and time.
2. Open "Perf 10k" in 3D and the stress web hub at depth 2. Check that plates appear smoothly and that styles, colours, selection and focus dimming are unchanged.

## Batch implementation notes (awaiting manual test)

Code commit `77343b8` on `fix/3d-plating-stall` (stacked on T77). I can't run Obsidian: the numbers below are from a vitest micro-benchmark (`src/views/plating-bench.test.ts`, Node, this machine, canvas stubbed so `measureText`/`fillText` and GPU uploads cost nothing). Each is labelled **measured** (that benchmark) or **read from code**.

### Where plating time goes
- **read from code:** setData already re-plates only new and relabelled nodes. Line IDs come from type, depth, content and occurrence (`parser.generateId`), so an edit keeps the other lines' IDs and their plates. "Last plating N in X ms" times the **whole** `setData`, not just plating: for every existing node it also recomputes `extentFor` (`panelBoxEm`) and the relabel checks, and `pushData` rebuilds the flat layouts (cached per parse tree, so a re-parse misses), charges, lanes and calls `graphData` (whose engine digest runs a tick later and is not in the figure).
- **measured** (median of 5, warm JS):

| Step | 519 nodes (cold, first run) | 1,233 nodes (Perf 3k) | 4,135 nodes (Perf 10k) |
|---|---|---|---|
| `shape` before (layout + glyph objects) | 7.4 ms | 5.7–6.3 ms | 16.5–17.3 ms |
| of which `layoutPlate` (sizes) | | 3.7–4.3 ms | 11.6–11.8 ms |
| `panelBoxEm` / extent, every node | 2.8–3.4 ms | 2.5–3.0 ms | 5.4–5.6 ms |
| flat layout, cold (an edit's new tree) | | 3.4–4.7 ms | 13.0–13.1 ms |
| flat layout, warm | | 0.6–1.2 ms | 1.3–1.5 ms |
| `write(layout)` (28k / 94k glyphs) | 8.5 ms cold | 1.4–1.7 ms | 4.3–6.0 ms |
| `write(tick)` **before** | | 0.18–0.21 ms | 0.70–2.13 ms |
| `write(tick)` **after** | | 0.02 ms | 0.08 ms |
| building all queued glyphs (after) | | | ~3.1 ms, one write |

- So in JS a plate costs ~5 µs to lay out (~14 µs cold). That explains only ~3–7 ms of the measured "523 in 35.4 ms". The rest is what I can't measure here: Chromium's canvas text calls for each new character (`measureText` twice and `fillText`, open only), cold JIT, and the non-plating parts of `setData` above.
- **read from code, extrapolated from measured:** a simulating tick on the stress web used to write ~700k glyph centres and opacities (≈ 0.7 ms per 94k glyphs here → 5–15 ms of JS) and re-upload `aCenter` + `aOpacity` for every glyph at buffer capacity (16 B each, up to ~22 MB a tick). It now writes and uploads one texel per plate (30,865 × 16 B ≈ 0.5 MB).

### What changed
1. **Glyphs ride their plate.** A glyph stores its plate's index (`aPlate`) instead of `aCenter`/`aOpacity`. The glyph vertex shader reads the plate's centre and opacity from a float `DataTexture` (`uPlates`, 1,024 plates a row, `texelFetch`), which every write fills. A tick no longer touches a glyph attribute. The glyph material went from 8 to 7 vertex attributes (position, aPlate, aRect, aUv, aRight, aUp, aInk); plates unchanged at 10. The shader math after the fetch is unchanged, so focus dimming, fog, Planets frames (aRight/aUp), the back-face hiding and the ink colour read exactly as before.
2. **Layout cache.** `Graph3DPlates.shape` caches layouts by text, height and widths (`ShapeCache`, `shapeKey`). A hop back, a refocus, or a relabel back to an earlier text reuses the layout. The cache is cleared when the font changes and trimmed to the plates shown once it passes max(4,096, 2 × plates).
3. **Glyphs built in slices.** `shape` measures the plate at once (its size spaces the layout), but queues its glyphs. Each `write` builds queued glyphs for max(4 ms, its last layout write's time) (`drainWithin`) and the scene keeps writing while any wait. A plate waiting for its glyphs is written with opacity 0, so it appears from the background once built. New atlas characters are drawn (and the page uploaded) in those slices, not in `setData`.
4. **Gauge.** The last line now reads `last plating N in X ms  queued Q  ·  writes: layout L ms  tick T ms  glyphs G ms`.

### Decisions worth remembering
- **Plate sizes stay synchronous.** A node's extent (link distance, flat-slice footprint) comes from its plate size, and settled nodes never move, so a size measured late would leave a wrong gap forever. Only the glyphs are deferred. This means the biggest measured JS cost (`layoutPlate`, ~2/3 of `shape`) is still in `setData`.
- **Budget is max(4 ms, last layout write).** Each slice is followed by a full layout write (glyph counts changed). On the stress web that write is long, and a fixed 4 ms would mean ~100 frames each paying it. Matching the write keeps the total to about twice the work.
- **A relabelled plate's glyphs are also queued**, but `write` always builds at least one plate and runs before the frame renders, so an edit's plate shows its new text on the same frame as before. Only when hundreds of plates are queued can a relabel wait behind them.
- **A plate's fade starts at `setData`.** If its glyphs land a few frames later, it appears partway into its 500 ms fade. I didn't restart the fade.
- **The plate mesh keeps its own `aCenter`/`aOpacity`.** Only the glyphs read the texture: 16 B a plate a tick is cheap, and it keeps the plate shader unchanged.

### Not done (follow-ups for a later ticket)
- **Edit cost outside plating (measured above):** on Perf 10k an edit rebuilds the flat layouts from scratch (~13 ms, the cache is keyed by parse tree) and recomputes every node's `panelBoxEm` (~5 ms). Caching flat layouts by note content and extents by panel Markdown would cut most of an edit's `setData`. I didn't do it: both feed positions that never move again, so a stale cache entry would be a permanent layout bug, and this session had no budget left to prove the keys.
- **Time-slicing `layoutPlate` itself** needs the sizes earlier than the glyphs (see the first decision). A width-only pass could be cheaper, but I didn't measure one.
- The `graphData` engine digest (d3 force re-init) isn't timed by the gauge.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/plates.ts` | `shapeKey`, `ShapeCache`, `drainWithin`, `PLATE_TEXTURE_WIDTH`, `plateTextureRows` |
| `src/graph3d/plates.test.ts` | 4 tests for them |
| `src/views/Graph3DPlates.ts` | Layout cache, glyph queue built in `write`, pending plates hidden, plate-centre texture + glyph shader `texelFetch`, `aPlate` replaces glyph `aCenter`/`aOpacity`, `queued`, timings in `stats()` |
| `src/views/Graph3DPlates.test.ts` | New: cache reuse, pending → built, glyph plate index, tick moves a plate by its texel |
| `src/views/plating-bench.test.ts` | New: the benchmark above (reported via `console.debug`, not asserted) |
| `src/views/Graph3DScene.ts` | Keeps `dirty` while glyphs are queued |
| `src/views/Graph3DPerf.ts` | `queued` and write timings on the plating line |

### Fixture
No new fixture. Use the JS-objects note, `tests/perf/Perf 10k` / `Perf 3k` (`node e2e/generate-perf-notes.mjs`), the stress web, `tests/graph3d/Styled Mooring` (styles) and any Planets-mode note.

### Retest (desktop: Panel detail 1, Live panels 48; then phone)
1. Reload Obsidian (Ctrl+R). Open the JS-objects note in 3D with the gauge open. Record the `fps … frame avg / worst` and `last plating …` lines. Compare with the baseline `last plating 523 in 35.4 ms`.
2. **Edit** a line's text and commit. Expected: `last plating 1 in … ms`, `queued 0`, and the plate shows its new text with no blank frame. Record `frame worst`.
3. **Perf 10k** in 3D: plates should fade in from the background over a few frames, not all at once after a pause. Record `frame worst` while it loads and `writes: tick` while it settles.
4. **Stress web, depth 2:** compare the settling line with `fps 2 frame avg 367.0 … tick 24.93 ms` from the related note. `writes: tick` should be well under 1 ms.
5. **No regressions:** styled plates (fill, outline, corners, text colour), selection border, find matches, focus dimming of text with its plate, the mist, Planets mode (text on surface plates turns with them, and disappears from the back), the labels toggle in Overlays, a theme or font change (all plates re-lay out), and T75 line-group cover images.
6. **Phone:** steps 1–5 on `tests/perf/Perf 3k`. If plate text is missing everywhere on the phone, its GPU can't read float textures in the vertex shader: tell me (WebGL2 requires it, but this is the riskiest part).

### Could not verify
The new glyph shader has not been compiled on a real GPU (it can't be from Node), and no number from Obsidian. Everything rendering-related above is read from code.
