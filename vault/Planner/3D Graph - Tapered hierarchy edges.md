---
title: 3D Graph - Tapered hierarchy edges
summary: "Hierarchy edges in 3D get thickness from outline depth (thick roots, delicate stems), each tapering from parent end to child end, on by default, overridable with 2D's branch-style settings; other edges stay thin."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Edge direction and taper]]"
  - "[[3D Graph - Read node styles]]"
  - "[[3D Graph - Settings in the style sidebar]]"
  - "[[3D Graph - Overlay toggles hide plates and re-settle]]"
status: To-Do
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-10T12:00:00.000Z"
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
  - "[[3D Graph - Read node styles]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

3D edges are all one-pixel lines, so the graph has no sense of hierarchy or direction. The 2D mind map tapers its branches (thick near the root, thin at the leaves), which reads like a tree. Sawyer wants that in 3D. This ticket supersedes the Ideas note [[3D Graph - Edge direction and taper]]; leave that note's file alone and rely on this one.

## What problem does this solve?

Hierarchy edges get a thickness from outline depth (thick near roots, delicate stems at the leaves), each edge tapering from its parent end to its child end. On by default, exposed in the styles panel, and overridable with the same branch-style settings 2D has (`BranchLineTaper` and friends). Link, embed and tag edges stay thin.

## What's your current workaround?

All edges look the same: 1px lines.

## Batch and checkpoint

Round 7, Batch D (look). Checkpoint: checkpoint 3 (D) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

Blocked by: [[3D Graph - Read node styles]]. Do not start until that ticket is built (stacked branch is fine).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Taper: hierarchy edges in 3D by outline depth, default on, exposed in styles panel, overridable with the same branch-style settings 2D has.

Link/embed/tag edges stay thin. Perf matters: plates are instanced, so edges drawn as ribbons / instanced quads must stay cheap. Branch style overrides come from the shared `osmosis-styles` (read by [[3D Graph - Read node styles]]).

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Edges are one `LineSegments`, 1px, colour + alpha only; taper exists only in 2D (`BranchLineTaper` in the 2D branch rendering). The Ideas note is [[3D Graph - Edge direction and taper]].
- A 1px LineSegments cannot be thick: use camera-facing ribbons or instanced quads (one instance per hierarchy edge, a tapered quad from parent to child, width at each end from outline depth), keeping the other edge kinds on the existing line path.
- Outline depth: `src/graph3d/outline.ts` (+ test), depth rules in `depth.ts`.
- Edge toggles and kinds: `src/graph3d/appearance.ts` (`edgeDistance(kind)` etc.), overlays `src/graph3d/overlays.ts` and `src/views/Graph3DOverlays.ts`; edge picking `src/graph3d/edgepick.ts` must still work for thick edges.
- Pure width-from-depth function goes in a new testable module (vitest cannot import `obsidian`).

## Acceptance criteria

- Hierarchy edges render as tapered ribbons whose width at each end derives from outline depth (thickest at roots, thinning with depth) and tapers from the parent end to the child end.
- Default on; a toggle and a taper-strength control appear in the styles panel (Settings), stored per vault.
- Per-node branch-style settings from `osmosis-styles` (the same ones 2D uses: BranchLineTaper etc.) override the defaults for that node's branch.
- Link, embed, property, tag and attachment edges remain thin lines, as today.
- Edge picking, hover, hiding and focus dimming keep working on the new geometry.
- Performance: drawn with instancing or one merged mesh; no per-edge draw calls; state frame-time measurement on the stress web before and after in the close-out.

## Test plan

Unit tests first (pure): width-from-outline-depth function (monotonic decreasing, clamps, root vs leaf, a depth beyond the max), the taper ends (parent width >= child width), override precedence (node style beats global setting), quad vertices facing the camera for a given edge and eye.

Manual test (fixture: a deep note such as the Sailing notes at depth 3, Ctrl+R):
1. Open 3D: hierarchy edges are thick near the root and thin at leaves, each tapering toward the child; link edges stay thin.
2. Toggle taper off in the panel: all thin lines again.
3. Set a branch style override on a node (via the 2D style panel): its branch follows it in 3D.
4. Orbit the camera: ribbons stay readable from every angle; click an edge still rides it; check frame rate on a large graph.

## Out of scope

- Arrowheads for edge direction on non-hierarchy edges.
- Taper on link/embed/tag edges.
- Edge labels (see [[3D Graph - Edge hints]]).
- Editing the Ideas note [[3D Graph - Edge direction and taper]].

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
