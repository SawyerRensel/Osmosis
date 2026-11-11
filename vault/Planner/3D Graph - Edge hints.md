---
title: 3D Graph - Edge hints
summary: "When close to a node, each link or embed edge leaving it shows a small label just off this end naming its target, fading in by distance with the nearest 8 shown; hierarchy edges get no label."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Follow a link]]"
  - "[[3D Graph - Clickable links in panels]]"
  - "[[3D Graph - Tapered hierarchy edges]]"
  - "[[3D Graph - Focus dimming]]"
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
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

In an organic layout it is hard to tell where an edge goes without flying along it. Sawyer wants to navigate such a layout: when near a node, its outgoing link and embed edges should say where they lead.

## What problem does this solve?

When the camera is close to a node, each link or embed edge leaving it shows a small label just off this end of the edge, naming its target ("Note > Heading" or the target node's text). Labels fade in by distance, and only the nearest 8 show. Hierarchy edges get no label.

## What's your current workaround?

Click the edge to ride it and see where you land.

## Batch and checkpoint

Round 7, Batch D (look). Checkpoint: checkpoint 3 (D) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Edge hints: link/embed edges only, target name label near this end, fade by distance, nearest 8.

Purpose: make navigating an organic layout possible. Hierarchy edges (and tag edges) get no label.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Edges are drawn as one LineSegments (`src/views/Graph3DScene.ts`); edge data and kinds are in `src/graph3d/model.ts` and `appearance.ts`; picking in `src/graph3d/edgepick.ts`.
- Labels: the scene already draws plate text and near panels (`src/graph3d/near.ts`, `lod.ts` chooses near nodes by budget); an edge-hint tier would pick the nearest 8 edge ends by distance with a similar probe-and-choose pure function.
- Link targets: edge target node (note + heading, or node text) is derivable from the model; label text rule: 'Note > Heading' for cross-note targets, the node text for same-note targets.
- Labels must be cheap: pool 8 sprites/DOM labels, not one per edge.

## Acceptance criteria

- Within a distance threshold of a node, each link and embed edge leaving that node shows a label near this end, reading 'Note > Heading' (cross-note) or the target node's text (same note), truncated sensibly.
- Labels fade in by distance (opacity from far threshold to near threshold) and at most the nearest 8 are shown at once, with hysteresis so they do not flicker.
- Hierarchy (and tag) edges show no label.
- Labels face the camera, do not block clicks on plates or edges, and respect focus dimming / hidden edge kinds (a hidden edge has no hint).
- Both ends of an edge can have their own label when the camera is near both nodes (each names its own target).

## Test plan

Unit tests first (pure module with probes, like `chooseNear`): selecting the nearest 8 from many candidates; fade factor by distance (0 beyond far, 1 within near, monotonic); hysteresis; label-text builder for cross-note heading, cross-note root, same-note target; kind filter excludes hierarchy and tags.

Manual test (fixture: `vault/tests/graph3d/` Sailing notes which link to each other, Organic layout, depth 2 or 3; Ctrl+R):
1. Fly close to a node with links: labels appear near the start of each link edge naming the target.
2. Back away: they fade out; with a node of many links only the nearest 8 show.
3. Hierarchy edges never have labels. Hide the link edge kind: the labels go.
4. Use the labels to navigate: ride an edge to the named target.

## Out of scope

- Arrowheads and direction cues ([[3D Graph - Tapered hierarchy edges]]).
- Clickable labels (labels are non-interactive).
- Labels for hierarchy, tag or attachment edges, and labels mid-edge.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
