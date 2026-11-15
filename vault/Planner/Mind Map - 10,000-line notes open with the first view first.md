---
title: "Mind Map - 10,000-line notes open with the first view first"
summary: "Round 11 (T84). 2D Mind Map on 10,000+ line notes: draw the first viewport before MarkdownRenderer has measured every node, and trim the per-edit cost. Continues T79/T80."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - 10,000-line notes pan and zoom at 60 fps]]"
  - "[[Mind Map - 10,000-line notes edit without a stall]]"
status: In-Review
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-15T23:30:00.000Z"
date_start_scheduled: "2026-11-15T22:04:46.000Z"
date_start_actual: "2026-11-15T22:04:46.000Z"
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

# Mind Map - 10,000-line notes open with the first view first (T84)

## Request (Sawyer, 2026-11-15)
> Let's strive to make 2D mind mapping more performant.

Sawyer has **no 2D gauge numbers yet** (T79/T80 untested) and said go anyway, targeting the known hot spots. **No zoomed-out level of detail** (not approved; visuals unchanged).

## Constraints (round 10, unchanged)
60 fps desktop *and* phone; 10,000+ lines = very large; text crisp at all times (no upscaled rasters); no regressions. Measure before/after where you can (vitest benchmarks over the pure stages, timing logs routed to the T76 gauge) and label each finding **measured** or **read from code** (memory `justify-work-with-measurements`).

## Known open items (from T79/T80 notes; read their "Batch implementation notes")
1. **Opening** awaits `MarkdownRenderer` for all ~4,136 nodes on Perf 10k before the first frame. Direction: measure/render the nodes in (and near) the first fitted viewport first and draw; measure the rest in time-sliced batches (idle/rAF chunks) and relayout once sizes settle — without a visible jump of what is already on screen (estimated sizes for unmeasured nodes; check how T79 batched size reads). This is the priority.
2. **Edit path** ~27 ms pure on Perf 10k (normalise 6.8 ms, parse 12 ms, layout 5–6 ms) plus **two full-file `vault.read`s per edit**. Remove the redundant read(s) if safe (the file is authoritative — see CLAUDE.md "reset hazard"; don't break external-edit detection). Do this second, only if budget allows.
3. Fitted-zoom repaint of ~320 `<foreignObject>` nodes on every pan: **out of scope** unless a crisp-preserving fix is cheap; record findings.

## Benchmark notes
`node e2e/generate-perf-notes.mjs` → `tests/perf/Perf 10k`, `Perf 3k` (check whether they already exist under `vault/tests/perf/`).

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Done when
Perf 10k shows its first fitted view before all nodes are measured, with no visible jump; open-to-first-frame recorded (gauge line) for Sawyer to compare. Edit-path item done or recorded as remaining.

## Context budget
~130k. T79/T80 notes' implementation sections; `MindMapView.ts` by range around render/measure (grep `MarkdownRenderer`, `measure`, `render (measure`), `src/layout.ts` whole, gauge code by grep.

## Test plan (Sawyer)
Open Perf 10k (desktop) and Perf 3k (phone): note the gauge's `render (measure …)` / first-frame line; the view appears quickly and nothing already visible jumps when the rest is measured. Pan/zoom, fold, edit; regressions on a normal note (code, tables, images, checkboxes, resized nodes, callouts, transclusions, boundaries, find, study modes).

## Batch implementation notes (awaiting manual test)

Code commit `92493d1` on `perf/mindmap-open-first-view`. Item 1 (opening) is done. Item 2 (edit path's full-file reads) and item 3 (fit-zoom repaint) are **not done**; see "Remaining".

### Cause (read from code)
`renderPass` awaited `measureNodeSizes` for **every** node in the tree, one `MarkdownRenderer.render` after another, before it laid anything out or drew a frame. The fitted first view at MIN_ZOOM shows ~320 of 4,135 nodes on Perf 10k (T79, measured).

### Why "measure the view first" is not simple
A node's place depends on nodes it never touches. A parent is centred on its whole subtree, and a node sits below every earlier sibling's subtree. On Perf 10k the note's H1 is centred on the whole map, so it sits in the middle of the fitted view, and its exact place needs every node measured. With estimated sizes for the rest, whatever is drawn early would jump when the real sizes land.

### The fix (`src/mindmap-progressive.ts`, pure)
- **Settled nodes only.** A node is *settled* when its place relative to an **anchor** node cannot change, whatever the unmeasured nodes measure. This is tested, not derived. The map is laid out again with every unmeasured node at a huge and at a tiny probe size (slightly different per node). The nodes that move exactly with the anchor in both probes are settled. Only settled nodes and the branches between them are drawn: `isNodeInViewport` / `isBranchInViewport` return false for `unsettledIds`, which gates the first draw, cull passes and in-place redraws.
- **First view** (`planFirstView`, up to 3 rounds): lay out with estimates and fit. Measure the nodes in view (+ the 200 px cull margin) and their ancestors (their widths place them). Re-fit. Then measure the whole subtree of each part-visible, unsettled node when it has at most 2× (nodes in view) unmeasured nodes. That covers a heading's section, but not the H1. The anchor is the node nearest the view centre from the largest in-view group that moves together.
- **The rest** (`measureRest`): batches of 200, nearest the view first. Rendering yields the frame every 8 ms (`MEASURE_SLICE_MS`), using its own `Component`. A batch relays out only if the view moved and has then been still for 250 ms. The last batch always relays out, which draws the H1 and ends the open. Each relayout is a `render(true, token)` pass, so it is queued with edits and keeps drawn groups (T80's `redrawInPlace`). `renderPass` shifts the viewBox so the anchor stays at the same screen spot, which keeps every drawn node still.
- **Any other pass** (edit, fold, settings, file reload) ends the open. It measures everything left, as before, and the anchor shift still applies. A size-cache clear (`SizeCache.epoch`) stops the background measure and runs a full pass.
- **Gauge:** a new line, `open: first view X ms  all measured Y ms`. It is recorded even while the gauge is hidden.

### Measured (vitest, `src/mindmap-progressive.test.ts`; stand-in node sizes that differ from the layout estimate, because MarkdownRenderer cannot run here)
| | Perf 10k (1600×1000) | Perf 3k (390×760) |
|---|---|---|
| nodes measured before the first view | **323 of 4,135** | **249 of 1,237** |
| in view / drawn at first view | 146 / 145 (the H1 waits) | 103 / 102 (the H1 waits) |
| drift of any drawn node vs the anchor once all are measured | **0.0000** (asserted) | **0.0000** (asserted) |
| planning (layouts) before the first view | ~90–130 ms | ~7–60 ms |
| one relayout + settle test during the rest | median ~39 ms | median ~4 ms |

The test also asserts that a node settled at one step is still settled at every later step.

### Decisions worth remembering
- **The H1 (and its branch lines) appears only when everything is measured.** It cannot be placed exactly any earlier, and drawing it at an estimate breaks "no jump". This pop-in is the visible trade. The same applies to any part-visible heading whose section is larger than the subtree cap.
- **The opening view is centred on the *estimated* map centre**, not the exact one. With the zoom clamped at 0.1 on a map ~13× taller than the view, the difference is not noticeable. After that, the view holds the anchor rather than re-fitting, because re-fitting would be the jump.
- **Probe sizes vary per node.** With a single probe size, the H1 (centred on its subtree) and a node halfway down moved by the same amount, and the H1 was wrongly called settled. The test caught it (drift 724 units).
- **No relayout per batch while the view is still.** On Perf 10k one relayout + settle test is ~40 ms (measured), which would be a hitch every batch. Regions you pan into stay blank until the view is still for 250 ms (a relayout then draws what has settled) or until measuring finishes.
- **When it applies:** only the view's first render, with ≥ 400 unmeasured nodes, a fit clamped at MIN_ZOOM, and no `styles`/`variants` frontmatter (boundaries hug whole subtrees). File switches inside an open view, small notes and styled notes take the old path unchanged.
- **Placing on a node during the open** (heading link/subpath, find "go to", 3D landing, a restored viewport) first runs a full pass, so the target lands at its final place.

### Surface map
| File | Change |
|---|---|
| `src/mindmap-progressive.ts` | New: `probeSizes`, `settledWith`, `chooseAnchor`, `unsettledOf`, `measureOrder`, `planFirstView` (pure) |
| `src/mindmap-progressive.test.ts` | New: unit tests, plus the Perf 10k / 3k first-view bench with the no-drift assertion |
| `src/views/MindMapView.ts` | `measureNodeSizes` split into `collectMeasureWork` + `measureEntries` (sliced/cancellable). `SizeCache` with `epoch`. `planOpening`, `measureRest`, `layoutMap`, `svgPositionOf`. `renderPass(keepDrawn, step)` with the anchor shift. `unsettledIds` gate in the viewport tests. `revealSubpath`/`land`/`goToFound`/`setEphemeralState` finish the open first |
| `src/views/MindMapPerf.ts` | `openFirstView`, `openSettled`, and the `open:` gauge line |

### Fixture
`vault/tests/perf/Perf 10k.md`, `Perf 3k.md` (gitignored; `node e2e/generate-perf-notes.mjs`). For regressions, any normal note under 400 nodes takes the old path.

### Retest
1. Desktop: reload Obsidian (Ctrl+R) and close any open Mind Map tab of Perf 10k. Open the gauge, then open `tests/perf/Perf 10k` in a **new** Mind Map tab. Expected: the fitted view appears with everything but the H1 "Perf 10k" and its branches, and the H1 appears a little later. **Nothing already on screen moves** when it does. Record the `open: first view … all measured …` line and the `render (measure …)` line.
2. Pan right after opening, then hold still: blank regions fill in after ~¼ s or when measuring ends, and nothing already drawn moves. Pan/zoom fps as in T79.
3. During the first seconds after opening: fold a branch, edit a node, Ctrl+F and go to a match, and click a heading link into the note. Each should behave as on a normal open (it measures the rest first, so expect the old pause).
4. Phone: repeat 1–2 on `tests/perf/Perf 3k`.
5. Regressions on a normal note (under 400 nodes, unchanged path): sizes of code blocks, tables, images, checkboxes and resized nodes; callouts, transclusions, boundaries, find, study modes, reading mode; switching notes in an existing Mind Map tab.

### Not verified / remaining
- No Obsidian numbers. I could not see it, so the real first-view and all-measured times, and whether the H1 pop-in looks acceptable, are for Sawyer's gauge.
- **Item 2, edit path** (not done; read from code): two full-file `vault.read`s plus one `vault.modify` per edit, and ~27 ms of pure work (T80, measured). Left for a later ticket for lack of budget, given the reset-hazard risk.
- **Item 3, fit-zoom repaint** (not done): no crisp-preserving fix found cheaply. Findings are unchanged from T79.
- Keyboard navigation or rubber-band selection onto a not-yet-settled node selects a node that is not drawn yet. It appears once settled.
