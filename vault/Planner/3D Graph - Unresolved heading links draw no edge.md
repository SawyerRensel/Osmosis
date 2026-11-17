---
title: "3D Graph - Unresolved heading links draw no edge"
summary: "Round 11 (T81). A link to a heading or block that does not exist yet draws no edge (same note or cross-note) until it exists; a newly spawned plate never gets a stray edge to the root while being edited."
tags:
  - task
calendar:
  - Bug Report
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
status: Done
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-15T21:51:08.000Z"
date_start_actual: "2026-11-15T21:51:08.000Z"
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

# 3D Graph - Unresolved heading links draw no edge (T81)

## Problem (Sawyer, 2026-11-15, verbatim)
> If I create a node with a `[[#{headingName}]]` that doesn't exist yet, a blue link edge appears between that node and the root node. Then, whenever I create any new plate it automatically draws a blue edge between that new node and the root node and pulls that new node (if "Links Pull" is on) until I commit my edit to the node. This shouldn't happen. No edge should be drawn until I create a heading node with that name. And no edges should be drawn from a new spawned node to the root node because it throws off the force graph when the layout is set to "Organic"

## Decisions (Sawyer, 2026-11-15)
- **No edge for any unresolved subpath**, same-note `[[#Missing]]` *and* cross-note `[[Other#Missing]]` / `[[Other#^missing]]`. The edge appears once the heading/block exists (the model rebuilds on each parse).
- A plain `[[Other]]` (no subpath) still links to the note's core, as today.
- Nothing is drawn for an unresolved link (no ghost).

## Part 1: cause (read from code, near-certain)
`src/graph3d/model.ts` ~245, `resolveTarget`: `... ?? target.coreId` with the comment "An unmatched subpath falls back to the note, as following it in Obsidian does". Fix: an unmatched subpath returns `null` (no edge). Check every caller handles `null`; check 2D links/hints (`src/graph3d/links.ts`, edge hints) for the same fallback.

## Part 2: not root-caused
Every newly spawned plate gets an edge to the root until committed. Hypotheses:
- the new, still-empty node's links are resolved from draft/placeholder text;
- a link-cache entry is attributed to the wrong line while that line's range is stale (Obsidian's metadataCache lags the edit; the cached `[[#Missing]]` position may now fall inside the new line);
- a link/ghost edge keyed to a line ID is reused by the new node.
Reproduce in a unit test (`src/graph3d/model.test.ts`) **before** fixing. It may be Part 1 in disguise (stale cache position + core fallback); prove it either way and record which.

## Layout note
Links pull re-settles; Organic is the `forceBalance` slider (`src/graph3d/overlays.ts`, `linksPull`). Settled nodes never move except the approved re-settle exceptions (memory `3d-graph-view-feature`). Don't change those rules.

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Done when
- `[[#Missing]]` and `[[Other#Missing]]` draw nothing; adding the heading draws the edge.
- Spawning a plate (Enter/Tab in 3D edit) never draws an edge from it until its own text links somewhere.
- Unit tests cover both parts.

## Context budget
~130k tokens. Read `src/graph3d/model.ts` whole and its test; `links.ts` by grep; `Graph3DView.ts` by range around where the model is rebuilt and where spawn/edit happen (grep `buildModel`, `spawn`, `metadataCache`).

## Test plan (Sawyer)
1. In a note's 3D map, edit a plate to contain `[[#Nowhere]]`, commit. Expect no edge. Add a heading `# Nowhere`; expect the edge.
2. With the unresolved link present and Links pull on, Organic layout: press Enter to spawn a plate; while editing, no edge to the root, and the plate is not pulled.
3. `[[Some other note#Missing]]`: no edge. `[[Some other note]]`: edge to its core as before.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit: 3ebf0f1 on `fix/3d-unresolved-heading-edges`.

### Part 1: cause and fix
As the ticket said: `resolveTarget` in `src/graph3d/model.ts` returned the target note's root (`?? target.coreId`) when the heading or block was missing. Now it returns `null`, so no edge and no ghost, for same-note `[[#Missing]]` and cross-note `[[Other#Missing]]` / `[[Other#^missing]]`. This applies to links, embeds and frontmatter links, since they all go through `resolveTarget`. A plain `[[Other]]` still lands on the core. The model rebuilds on each parse, so the edge appears once the heading exists. `links.ts`, `edge-hints.ts` and `horizon.ts` have no fallback of their own.

### Part 2: cause (proved by a unit test)
**Mostly Part 1 in disguise, plus a second cause: the link cache lags the write.** `commitLines` writes the file and calls `reload()` at once. The tree is parsed from the new bytes, but `metadataCache.getFileCache()` still holds the old bytes' offsets. A structural edit inserts the new line in front of later lines, so a stale offset can fall inside the new, empty line. The `[[#Nowhere]]` reference was then put on the spawned plate, and the Part 1 fallback pointed it at the root. That gave the "new plate → root" edge. It lasted until the editor closed, because the reload from `resolve` waits for the editor and then uses the fresh cache. The test is `buildGraph: a link cache that lags an edit` in `model.test.ts`: Tab under "Alpha" through the real `planStructural`, a fresh tree and the old cache. Before the fix it fails on both the reported case and the resolved-link case. With the Part 1 fix alone, the reported case passes, but a stale *resolved* `[[Rigging]]` or `#tag` still lands on the spawned plate. So the second cause is real, just not visible as a root edge.
**Fix:** `sourceAt` now needs the reference's own text (`original` for links and embeds, `tag` for tags) to appear in the line it lands on (`raw ?? content`). If it doesn't, the reference is skipped until the cache catches up. A reference on no line still goes to the root, as before.

### Decisions worth remembering
- **When the cache is stale, the reference is skipped, not searched for by text.** Looking for the text in other lines would guess wrong when the same link appears twice. Skipping only lasts until the next rebuild after the cache catches up. While a plate is being edited, an edge from a shifted line can blink out and come back when the edit commits. That is better than drawing it from the wrong plate.
- **Depth 0: `![[Other#Missing]]` no longer loads Other** (`transcluded.ts`). It used to load the whole note, and with no edge it would have floated loose. "Nothing is drawn for an unresolved link." The old test that asserted the whole-note fallback was rewritten.
- **Navigation is unchanged:** `linkTargetNode`, used for clicking or following a link, still falls back to the root, like following the link in Obsidian. Its doc comment now says this differs from `buildGraph`.
- **Known gap, not changed:** at depth ≥ 1, `[[Other#Missing]]` still *loads* Other, because the horizon uses `resolvedLinks`, which has no subpaths. Other shows with no edge from this note (unless something else links it). Fixing this would need subpath-aware adjacency, which is a bigger change.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/model.ts` | `resolveTarget`: unmatched subpath → `null`; `sourceAt` checks that the line holds the reference's text; `lineAt` returns the line, not just its ID; `linkTargetNode` doc |
| `src/graph3d/model.test.ts` | Missing cross-note/same-note/embed subpaths draw nothing, and the edge appears once the heading exists; stale-cache spawn tests (Part 2) |
| `src/graph3d/transcluded.ts` | Embed with an unmatched subpath loads nothing |
| `src/graph3d/transcluded.test.ts` | Fallback test now expects nothing, then the section once it exists |
| `e2e/fixtures/graph3d/Unresolved Headings.md` (+ `vault/tests/graph3d/`) | New fixture |

### Not verified
I could not see Obsidian. The stale-cache cause matches the symptom and reproduces in a test with the real `planStructural`, but how long the cache actually lags in Obsidian was not measured.

### Manual test (desktop, then phone)
Fixture: `tests/graph3d/Unresolved Headings.md`. Reload Obsidian first (Ctrl+R).
1. Open its 3D graph (depth 0 or 1). "Forward to [[#Nowhere]]", "Cross to [[Rigging#No Such Heading]]" and "Block that is gone [[Rigging#^nope]]" have **no** link edge. "Plain [[Rigging]]" has its edge to Rigging's root, as before. At depth 1, Rigging is loaded; at depth 0 it is not.
2. Edit mode on, Overlays → Links pull on, Organic layout. Select "Alpha", press Enter (and Tab, and Shift+Enter on "Charlie"). While the new plate's editor is open, it has **no** edge to the root and is not pulled. Commit some plain text: still no edge.
3. Add a line `## Nowhere` (edit a plate to `## Nowhere`, or in the note). Once it is committed, "Forward to [[#Nowhere]]" gets an edge to the new heading plate.
4. Phone: repeat 1–2 with the toolbar's Add sibling / Add child.
