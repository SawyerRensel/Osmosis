---
title: "Mind Map - Code blocks never scroll so the map stays a few layers"
summary: "Round 11 (T88). Measured: 48 scrollable code blocks make the 2D map 263 compositor layers (~28 ms frames). Code blocks (and any other scroll container) in 2D nodes never scroll: they show their full content."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Mind Map - Pan and zoom at 60 fps on a large map]]"
status: In-Review
priority:
progress:
date_created: "2026-11-16T23:40:00.000Z"
date_modified: "2026-11-16T23:50:00.000Z"
date_start_scheduled: "2026-11-16T23:34:06.000Z"
date_start_actual: "2026-11-16T23:34:06.000Z"
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

# Mind Map - Code blocks never scroll so the map stays a few layers (T88)

## Measured (Sawyer's DevTools trace, 2026-11-16, real 524-node JS note at fitted zoom, panning, build 8c6ceea)
Trace: `ref/perf-traces/Trace-20261116T182249.json` (216 MB, gitignored; parse line by line, never `json.load` whole — 7 GB RAM).
- T87's layer translate works (`37 layer moves/s, 0 repaints/s`) but the frame stayed ~28 ms (27.9 vs 28.2 before). Sawyer's Layers panel: **246 layers**.
- `LayerTreeHostImpl:snapshot`: **263 cc layers**. Compositing reasons: **208 "Overlaps other composited content"**, **51 "scrollable overflow element using accelerated scrolling"** — 48 of those are `PRE class='language-js'` (code blocks), plus **49 `LayoutCustomScrollbarPart`** layers. The overlap layers are node rects, collapse circles and other PREs painted above a composited scroller (layer explosion).
- So every frame re-layerizes/overlap-tests/commits ~260 layers; cost scales with code blocks on screen (zoomed in, 54 nodes → 61 fps). Main-thread Commit/UpdateLayer times in that trace are inflated by "advanced paint instrumentation"; don't read them as real.

## Decision (Sawyer, 2026-11-16)
**Code blocks never scroll; show it all.** A code block in a 2D map node grows to its full content: no clipping, no scrollbar. Long code makes larger nodes and changes layout — accepted.

## Work
1. Find what makes node code blocks scroll (Obsidian's `pre { overflow-x: auto }`, any max-width/max-height on code nodes in `styles.css` or the measurer). Make every scroll container inside 2D node content non-scrolling (`overflow: visible`, or `clip` only where something must not spill) — check tables, callouts, embeds, math, too, not only `pre`. The measurer (`measureNodeSizes` / `collectMeasureWork` / `measureEntries`) must measure the same full size the drawn node shows; no clipped or over-wide nodes.
2. Keep the 2D look otherwise. Don't touch the 3D near panels or study cards unless they share the rule (record it).
3. Verify the layer count drop without Obsidian as far as possible (e.g. by reasoning on which elements remain composited: the layer, toolbar backdrop-filter, rating bubble, perf gauge); Sawyer will confirm with the Layers panel and gauge.
4. Keep T87's composited-layer pan; it becomes effective once the layer explosion is gone.

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the checked-out branch, commit code by path and the note separately, `status: In-Review`, "Batch implementation notes (awaiting manual test)" with desktop + phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it.
- `src/views/MindMapView.ts` (~84k tokens, NUL bytes): `grep -a -n` and range reads only. `styles.css` by grep/range.

## Done when
No element inside 2D node content can scroll; code nodes show all their code at the correct measured size; Sawyer's Layers panel shows roughly a dozen layers on the same note and the gauge shows ≥ 60 fps panning at fitted zoom.

## Context budget
~80k. `styles.css` by grep (`pre`, `overflow`, `max-height`, `max-width`, `osmosis-code`), measurer in MindMapView by grep.

## Test plan (Sawyer)
Same real JS note: code nodes show full code, no scrollbars, nothing clipped or overflowing its box; Layers panel count; gauge fps panning at fitted/mid/zoomed-in; zoom-out text sharp. Regressions: tables, callouts, images, math, transclusions, resized nodes, study modes.

## Batch implementation notes (awaiting manual test)

Code commit `0feeccc` on `perf/mindmap-code-blocks-no-scroll` (stacked on T87). No push, no PR.

### Cause
Obsidian's `app.css` has `.markdown-rendered pre { … white-space: var(--code-white-space) /* pre-wrap */; overflow-x: auto }`. A non-visible `overflow-x` forces `overflow-y` to `auto` too, so every code block in a node is a scroll container. Chromium composites a scroller onto its own layer as soon as its content overflows it, which in a node happens easily: a token longer than the line (pre-wrap never breaks inside a word, and JS has long strings/identifiers), or a sub-pixel difference between the measured and drawn width. Every node rect, collapse circle and code block painted above such a layer then needs a layer too ("Overlaps other composited content"), hence 263 layers. The code-fit width (`codeFitLimitPx`, 100 columns) was never the problem: pre already wraps.

### Fix (CSS only, `styles.css`)
Inside `.osmosis-node-content` these never scroll: `pre`, `.callout-content` (Obsidian: `overflow-x: auto`), `.markdown-embed-content` (inline embeds: `max-height: var(--embed-max-height)` 4000px + `overflow: auto`), `.markdown-preview-view` (`overflow-y: auto`), `.bases-view` (`overflow: auto`), `.table-wrapper`, `mjx-container`: all get `overflow: visible; max-height: none`. `pre` additionally gets `overflow-wrap: anywhere`, so an unbreakable token wraps inside the node instead of spilling.

### Decisions worth remembering
- **Wrap, not widen.** Code blocks keep the existing code-fit rule (as wide as the longest line up to 100 columns, then wrap), so the 3D near panels (same rule in ems) stay consistent. Long code makes taller nodes, not 2000 px wide ones. Only the unbreakable-token case changed visibly: it now breaks mid-token.
- **Resized (custom width) code node:** wraps at the user's width and grows taller; no scroll, no clipping. The measurer already re-measures height at the custom width.
- **`overflow-wrap: anywhere` only on `pre`.** On tables/callouts it would let cells squash words, changing the 2D look.
- **Measurer untouched.** The measure cell carries `.osmosis-node-content`, so the same rules apply to it; the height it reads is the full height the drawn node shows. `nodeSizeCache` (`SizeCache`) and `nodeHtmlCache` are per-view in-memory fields, never persisted; the Ctrl+R that loads the new CSS clears them, so no stale size survives.
- **Scoped to the 2D map.** Only `MindMapView.ts` uses `.osmosis-node-content`; 3D near panels and study cards are not affected. The edit-mode textarea (`overflow: auto`) is left alone: one node, only while editing.
- `.osmosis-node-content` keeps its own `overflow: hidden`: hidden is not user-scrollable, so it is not composited.

### Expected layers (estimate, by reasoning)
Composited after the change: root, `.osmosis-mindmap-layer` (will-change: transform, T87), the toolbar (backdrop-filter) and its scrolling strip, the perf gauge, rating bubble/overlays when shown, video iframes if any. Roughly 5–15, versus 263. If the Layers panel still shows a big number, look at its compositing reasons: any remaining "scrollable overflow" element names the selector this list missed.

### Surface map
| File | Change |
|---|---|
| `styles.css` | New rule: scroll containers inside `.osmosis-node-content` → `overflow: visible; max-height: none`; `pre` → `overflow-wrap: anywhere` |
| `e2e/fixtures/code-blocks-no-scroll.md`, `vault/tests/code-blocks-no-scroll.md` | New fixture: short, >100-column, unbreakable-token, tall code blocks, code in a callout, table, display math |

### Manual test (desktop, then phone)
1. Reload Obsidian (Ctrl+R). Open `tests/code-blocks-no-scroll.md` as a mind map. Every code block shows all of its code: no scrollbar, nothing cut off at the node edge or bottom; the >100-column block wraps at about 100 columns; the `harbour…` token wraps mid-word inside its node; the language label sits top-right. Drag-resize a code node narrower: it wraps and grows taller, no scrollbar.
2. Callout, table and math look as before.
3. Real 524-node JS note: DevTools → Layers panel, count roughly a dozen; perf gauge ≥ 60 fps panning at fitted, mid and zoomed-in; zoom out, text still sharp.
4. Regressions: images, transclusions (a long embedded note now shows in full, no 4000px scroll box), study modes, edit mode on a code node.
5. Phone: same note, pan/zoom smoothness and no scrollbars in code nodes.

### Not verified
No Obsidian here: the layer count and fps are reasoned, not measured. The exact class names for embed/Bases/MathJax scrollers come from Obsidian's `ref/obsidian-core/app.css`; community plugins that render their own scrollers inside a node (Dataview etc.) are not covered.
