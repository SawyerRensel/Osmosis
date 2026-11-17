---
title: "Mind Map - Nothing in a node is positioned so code blocks stop making layers"
summary: "Round 11 (T89). Measured: after T88, positioned code blocks still seed ~170 compositor layers at a non-100% Obsidian zoom (Sawyer: 204 in fullscreen). Code blocks and their language label in 2D nodes are no longer positioned."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - Code blocks never scroll so the map stays a few layers]]"
  - "[[Mind Map - Pan and zoom at 60 fps on a large map]]"
status: Done
priority:
progress:
date_created: "2026-11-16T23:55:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-16T23:55:00.000Z"
date_start_actual: "2026-11-16T23:55:00.000Z"
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

# Mind Map - Nothing in a node is positioned so code blocks stop making layers (T89)

## Measured (Sawyer's trace, 2026-11-16, real 524-node JS note, build 7621264 / T88)
Trace: `ref/perf-traces/Trace-20261116T185202.json` (92 MB, gitignored; stream line by line, the `LayerTreeHostImpl:snapshot` lines start with `{"args":{"snapshot":{"active_tiles"`).
- Sawyer's Layers panel: **204 layers in fullscreen**. The 22 snapshots in the trace (smaller window) show **156–196 cc layers**.
- T88 worked: only **2** layers are now scrollers (both the document itself; there were 51).
- Every map layer but the will-change layer has the reason **"Overlaps other composited content"**, so something still seeds the overlap.
- The seeds are the layers on their own transform node: **`PRE class='language-js'` (relative positioned) ×29, `.osmosis-code-lang-label` (absolute) ×16, and code-block `.osmosis-node-content` ×16** (frame at line 7048 of the trace).
- All seeds draw at screen scale **0.0955**; the SVG and everything else draws at **0.1047**. The ratio is 1/1.09545, and **1.2^0.5 = 1.09545**: Electron's zoom factor one Ctrl+= step above 100%. (Inference: Sawyer runs Obsidian one step zoomed in. Not asked yet.)

## Cause
Chromium lays out `<foreignObject>` content at the page zoom and draws a positioned element inside it (anything with its own PaintLayer) under an extra scale of 1/zoom. That transform is not a plain translation, so the compositor can't fold it into the map's layer. Each positioned code block therefore gets its own layer, and every node rect, collapse circle and label painted above it in paint order gets one too ("Overlaps other composited content"). The positioned elements were:
- Obsidian's `.markdown-rendered pre { position: relative }` (for the copy button, which nodes hide);
- our `.osmosis-node-group-codeblock .osmosis-node-content { position: relative }`;
- the label's `position: absolute`.

At 100% zoom the extra scale is the identity and may merge. Not verified, so the fix doesn't rely on it.

## Fix (CSS only, `styles.css`)
- `.osmosis-node-content pre` gets `position: static`.
- The code-block node content is a one-cell grid: `grid-template: minmax(0,1fr) / minmax(0,1fr)` with `align-items: center`, matching the old flex `justify-content: center`. All children sit in `grid-area: 1 / 1`.
- The label (`.osmosis-node-content > .osmosis-code-lang-label`) is static: `align-self: start; justify-self: end; margin: -2px -6px 0 0`. That puts it in the same spot as `top: 2px; right: 2px` on the 4px 8px padding box. A grid item paints atomically after the `pre`, so it still draws over the code.
- `pre.osmosis-code-block { position: relative }` (study cards and notes through `codeBlockLabels.ts`) is unchanged; only the map selector was dropped from that rule.
- The measure cell is not inside a node group and is `display: block`, so measurement is unchanged.

## Not done (next seeds, read from code, not measured)
Obsidian also positions `.markdown-embed`/`.file-embed` (relative, with an absolute `.markdown-embed-link`), `ul>li`/`ol>li` (relative), `.list-bullet`, and the indentation guides. In a node these will seed layers the same way at a non-100% zoom. The likely case is the **transcluding parent** (28 fps, 419/1,229 drawn). Fix them only when a trace shows them as seeds. The embed link is a visible control, so removing its positioning is a UI decision for Sawyer.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes
Code commit `45f3225` on `perf/mindmap-no-positioned-node-content` (stacked on T88). No push, no PR. Lint clean, 3,346 tests pass, built.

Retest (desktop, then phone):
1. Ctrl+R. `tests/code-blocks-no-scroll.md`: the language label sits at the top-right of each code node as before, over the code's top padding, not pushing it down. Code is vertically centred in a node made taller by resizing. No scrollbars; long lines and tokens wrap.
2. Real 524-node JS note, fullscreen, same Obsidian zoom as the 204 count: Layers panel count, expected about 8 (document, map layer, toolbar, gauge, viewport). Gauge `fps`/`frame`/`untimed`/`view` while panning at fitted, mid and zoomed-in. Zoom out, then check that text is sharp.
3. Also note the Obsidian zoom level (Settings → Appearance → Zoom level), to confirm the 1.0954 inference.
4. Transcluding parent: gauge numbers and the Layers count. If it is still high, a trace names the next seeds (see "Not done").
5. Regressions: study card code blocks still have their label top-right; callouts, tables and math look the same.

## Context budget
~60k. `styles.css` by grep around `osmosis-code-lang-label`; trace via the streaming scripts described above.
