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
status: To-Do
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-15T21:50:00.000Z"
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
