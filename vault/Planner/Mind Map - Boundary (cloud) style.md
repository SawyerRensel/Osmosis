---
title: Mind Map - Boundary (cloud) style
summary: "A per-node boundary style stored in osmosis-styles that wraps a node and its subtree; default a soft translucent blob tinted by the node colour, with full cloud style settings in the style sidebar; 2D rendering."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Read node styles]]"
  - "[[3D Graph - Settings in the style sidebar]]"
  - "[[3D Graph - Boundaries in 3D and far side dimmed]]"
  - "[[Mind Map - Styles survive text edits]]"
  - "[[Mind Map Permeable Embed Boundaries]]"
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
  - "[[3D Graph - Settings in the style sidebar]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

Sawyer wants to draw a cloud around a group of nodes, as in Xmind's boundary: a visual wrapper for a node and everything beneath it, so a branch reads as a group. There is no such thing today. Note that 'cloud' already exists in `src/shapes.ts` as a node *shape*; a boundary is a different feature (a wrapper around a subtree, not the shape of one node).

## What problem does this solve?

Any node can have a boundary. It wraps that node and its subtree, and is stored in `osmosis-styles` with the node's other style. Default look: a soft translucent blob tinted by the node's colour. The style sidebar exposes full cloud settings, like node styling (colour, border thickness, edge style, transparency, and so on). This ticket is the 2D rendering; 3D is [[3D Graph - Boundaries in 3D and far side dimmed]].

## What's your current workaround?

Draw a shape node or a coloured background node by hand.

## Batch and checkpoint

Round 7, Batch D (look). Checkpoint: checkpoint 3 (D) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

Blocked by: [[3D Graph - Read node styles]], [[3D Graph - Settings in the style sidebar]]. Do not start until that ticket is built (stacked branch is fine).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Clouds = boundary style per node (no auto continent clouds), default soft translucent blob tinted by node colour; full cloud style settings (colour, border thickness, edge style, transparency…) like node styling.

No automatic continent clouds anywhere. The style lives in the same `osmosis-styles` system as node styles (PRINCIPLE: 2D and 3D share one styling system as much as possible), so [[3D Graph - Read node styles]] reads it in 3D.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Boundaries: none exist. 'cloud' is only a node *shape* (`src/shapes.ts`).
- Styles live in `osmosis-styles` frontmatter keyed by `^id` / stamped `^os-` (`planStyleKeys`, `src/mindmap-style-key.ts`); `NodeStyle` gets a `boundary` sub-object (enabled, fill colour, border colour and thickness, border style, opacity, ...). Keep it optional so old files are unaffected.
- 2D rendering: `src/views/MindMapView.ts` and the layout/render modules; a subtree's bounding geometry comes from the layout (child positions), drawn behind the nodes as a smooth hull (e.g. padded convex/rounded hull or metaball-style blob) in the SVG layer.
- Style sidebar for 2D: the mind map's style panel (extend it with a Boundary section). Depends on [[3D Graph - Read node styles]] (shared schema) and [[3D Graph - Settings in the style sidebar]] (the shared sidebar).
- Permeable embed boundaries are a different concept ([[Mind Map Permeable Embed Boundaries]]).

## Acceptance criteria

- A node can have a boundary toggled on and off from the style sidebar/menu; it is stored in `osmosis-styles` with the node (stamping an `^os-` key if needed) and survives text edits.
- The boundary wraps the node and all its visible descendants, with padding, drawn behind the nodes; it follows layout changes, folding and node edits.
- Default look: soft translucent blob tinted by the node's colour (when no explicit colour is set).
- Style sidebar controls: fill colour, opacity/transparency, border colour, border thickness, edge/border style (solid, dashed, none, ...); same UI patterns as node styling.
- Nested and overlapping boundaries render sensibly (outer behind inner).
- No boundary is ever created automatically.
- Existing files render identically; the schema addition is optional and backwards compatible.

## Test plan

Unit tests first (pure): the boundary hull geometry from a set of node boxes (padding, contains all boxes, stable for one box, handles a single leaf), schema normalisation of the `boundary` style (defaults, clamping of opacity and thickness, unknown values dropped), key resolution with `^os-`.

Manual test (fixture: a branchy mind map note in `e2e/fixtures/`, copied to `vault/tests/`, Ctrl+R):
1. Select a branch root, turn on Boundary: a soft translucent blob wraps the branch in the node's colour.
2. Change colour, opacity, border thickness and style in the sidebar; the file's `osmosis-styles` shows the settings.
3. Add, delete and fold children: the blob follows. Nest a second boundary inside.
4. Reopen the note: boundaries persist; a note with no boundaries looks the same as before.

## Out of scope

- 3D rendering of boundaries ([[3D Graph - Boundaries in 3D and far side dimmed]]).
- Automatic continent clouds.
- Labels or titles on boundaries, and boundaries around non-subtree selections.
- Changing the existing node shape named 'cloud'.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
