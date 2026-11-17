---
title: "Mind Map - 10,000-line notes edit without a stall"
summary: "Round 10 (T80). 2D Mind Map on a 10,000+ line note: typing in a node, Enter/Tab and moves commit without a visible stall. Parse, layout and redraw only what changed."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - 10,000-line notes pan and zoom at 60 fps]]"
status: Done
priority:
progress:
date_created: "2026-11-12T18:30:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T23:20:00.000Z"
date_start_actual: "2026-11-12T23:20:00.000Z"
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

# Mind Map - 10,000-line notes edit without a stall (T80)

## Problem
On a 10,000-line note, each commit (typing a node's text, Enter, Tab, moves, delete) probably re-parses the whole note, re-lays it all out and redraws (read from code: `parser.parse` ~8197, `computeLayout` ~8501). Sawyer wants edits without a visible stall.

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

## Directions (by the T76 numbers and the vitest benchmarks)
- Find the cost per stage for one edit on "Perf 10k": file write, parse, style lookup (`buildTreePathMap` is called several times, ~8607/8780/8807), layout, and redraw.
- Fix the biggest stage first:
  - for parse and layout: an incremental update of the changed subtree;
  - for redraw: reuse the culled DOM and the HTML cache for unchanged nodes (keyed so that a moved node keeps its render).
- Edit behaviour must not change at all. `mindmap-edit.test.ts`, `edit-*.test.ts` and `select-after-delete.test.ts` must stay green.

## Done when
On "Perf 10k", an edit commits in under about 50 ms on desktop, and under about 100 ms on a phone with "Perf 3k". Record before and after.

## Context budget
Keep it under ~130k tokens. Read `src/parser.ts` and `src/layout.ts` whole, `src/edit-pipeline.ts` and `src/styles.ts` by grep, and `MindMapView.ts` by range only.

## Test plan (Sawyer)
On "Perf 10k":
1. Type in a node and press Enter, Tab, Shift+Tab and Shift+Enter.
2. Move a branch with Alt+arrows, delete a node, then undo and redo.
3. Watch the gauge's "last edit" time.
4. Then repeat the usual edits on a normal note to check for regressions.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `7813cba` on `fix/mindmap-large-edit` (stacked on T79). Note: the "Baseline" section above is the 3D graph's (copied from T77/T78); there is no measured 2D edit baseline yet.

### Cost of one edit commit on Perf 10k (4,136 nodes)
**Measured** (vitest, `src/edit-commit-bench.test.ts`, median of 5, this machine, rename of a bullet halfway down):

| Stage | ms |
|---|---|
| splice (`renameInFile`) | 0.0 |
| `renumberOrderedLists` + `normalizeBlockSpacing` | 6.8 |
| content hash | 0.4 |
| parse | 12.1 |
| `buildTreePathMap` (x1; the pass calls it up to 3x) | 0.45 |
| measure pass's per-node cache-key loop (no styles) | 0.9 |
| `computeLayout` | 5.0–6.4 |
| **pure total** | **~27** |

A CPU profile of parse + layout + normalise shows no single hot spot (largest: GC 12%, `normalizeBlockSpacing` 11%, `buildTree` 7%, `hash` 6%, `renumberOrderedLists` 6%). An incremental parser would win at most ~12 ms, at real risk to ranges, IDs and line groups.

**Read from code** (not measurable in vitest): two `vault.read` + one `vault.modify` of a 340 KB file (the op's read, `EditPipeline.write`'s `before` read, the write); measuring only the new or changed node (one `MarkdownRenderer` call); then `renderPass` **emptied the container and built a new SVG**: every visible node was re-created (cloned from `nodeHtmlCache`) and the browser re-ran style and layout on every node's Markdown. That is ~31 nodes at zoom 1 and ~304 at the fitted zoom (**measured**, same bench). This browser cost was not timed at all: the gauge stopped at the end of the JS pass.

### The fix: an edit's pass keeps the drawing
- `render(true)` (only from `writeMarkdown`, `writeTranscludedMarkdown` → `resyncFromParent(true)` and undo/redo's `applySnapshot`) runs `redrawInPlace` instead of `renderSvg`: the live SVG and node group stay. Boundaries and branch lines are redrawn (cheap). For each visible node, `planReuse` (`src/mindmap-reuse.ts`, pure) keeps the existing group when its **draw signature** matches and gives it `transform="translate(dx, dy)"` from where it was first drawn; everything else is drawn exactly as before, off-document, and appended together.
- **Measured** (bench): after a rename or an Enter on Perf 10k, **30 of 31** visible nodes at zoom 1 and **303 of 304** at the fitted zoom keep their group (node IDs and sizes are stable across the edit). Only the edited/new node is drawn.
- Gauge: `last edit commit X ms (before render Y ms) + paint Z ms  kept K/N`. "+ paint" is the time from the end of the pass to the end of the next frame (rAF, then a task), which is where the browser's re-layout landed. Text commits now start the clock at the commit (it used to start when the editor opened, so it included typing time), and undo/redo start it too.

### Decisions worth remembering
- **Only edit passes keep groups.** Folds, file loads, settings and style writes still rebuild the SVG. Folding uses `.osmosis-animating` (`transition: transform`): a kept group's new translate would animate. In-place is also refused while a study session runs (it rewrites groups in place; `applySpatialState` drops every record), while the node editor is open, or during a drag.
- **What counts as "would draw the same"** (`drawSignature`): group classes, id, type, depth, source file, content, display content, cyclic, resolved style (LCVRT), map/theme shape, width, height, has-toggle, collapsed, side, direction. Also: the group's class attribute is unchanged since drawing, its `foreignObject` has no class (e.g. `osmosis-fo-hidden`), and `nodeHtmlCache` still holds the same entry it was cloned from (a cache clear invalidates every group).
- **Only cache clones are kept.** A group drawn by a fresh `MarkdownRenderer` call belongs to the old render `Component`, which the next pass unloads; it is redrawn once as a clone and kept from then on. Checkbox nodes are never kept (their click handler and checked state are bound at draw time).
- **Cull passes now draw into a staging group** and commit only if no full pass replaced the layout since they started (`drawGeneration`). With the node group kept, the old `nodesGroup !== nodesGroup` check could no longer detect an overtaking pass.
- **Kept groups are not re-ordered** (moving a node in the DOM would make the browser lay it out again). New nodes are appended after them. Tree nodes don't overlap, so this is invisible.
- **No incremental parser.** Parse is ~12 ms of a ~27 ms pure path, below the 50 ms target on desktop. Not worth the risk to ranges, IDs and line groups without a gauge reading that says otherwise.

### Surface map
| File | Change |
|---|---|
| `src/mindmap-reuse.ts` | New: `planReuse`, `translateAttr` (pure) |
| `src/mindmap-reuse.test.ts` | New: 6 tests |
| `src/edit-commit-bench.test.ts` | New: per-stage edit commit timings and the kept-group count on Perf 10k (reported) |
| `src/views/MindMapView.ts` | `render(keepDrawn)`/`renderPass(keepDrawn)`; `canRedrawInPlace`, `redrawInPlace`; `nodeGroupClass` (extracted from `drawNode`), `drawSignature`, `drawRecords`; `drawNode` records cache-cloned groups; `drawGeneration`; cull pass draws into a staging group; edit writes and undo render with `true`; gauge `editStarted` in `renameNode` and `forwardUndoRedo` |
| `src/views/MindMapPerf.ts` | Edit commit split (before render, + paint) and `kept K/N` |

### Fixture
`vault/tests/perf/Perf 10k.md` and `Perf 3k.md` (gitignored; run `node e2e/generate-perf-notes.mjs`, then reload Obsidian). For regressions, any normal note with links, images, code, callouts, tables, transclusions, checkboxes, styles and boundaries.

### Retest (desktop and phone)
1. Reload Obsidian (Ctrl+R). Open `tests/perf/Perf 10k` in the Mind Map, open the gauge. Zoom to a readable level.
2. Type in a node and commit, then Enter, Tab, Shift+Tab, Shift+Enter, Alt+arrows, Delete, Ctrl+Z, Ctrl+Y. After each, record the `last edit commit … (before render …) + paint …  kept K/N` line. Expect `kept` to be all visible nodes but one or two, and the map to update with no blank frame.
3. Check after each edit: nodes below the edit line up with their branch lines; selection lands where it did before (select-after-delete, new node selected after Enter); the edited node shows its new text; fold toggles still work on moved nodes; clicking, dragging, rubber-band and double-click-to-edit on a moved node hit the right node.
4. Fold and unfold a branch: still animates as before (that pass is a full rebuild).
5. Phone: repeat 2–3 on `tests/perf/Perf 3k`.
6. Regression on a normal note: checkbox toggling after an edit; a styled node (colour, shape, boundary) next to an edit keeps its style; a find (Ctrl+F) highlight survives an edit; edit a transcluded node; spatial study session start, rate, exit, then edit; reading mode still blocks edits.

### Not verified
I could not see Obsidian, so: no real edit-commit numbers before or after, how much "+ paint" drops, and the visual checks above. If `before render` dominates on phone, the next step is the pure path (normalise + parse + layout, ~27 ms here), and on iOS the two full-file `vault.read`s per edit.

