---
title: 3D Graph - Read node styles
summary: "3D reads the osmosis-styles frontmatter (fill, border, text, width, branchLine, shape where meaningful), keyed the same way as 2D, so one styling system serves both views."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Mind Map - Styles survive text edits]]"
  - "[[3D Graph Phase 7 - Editing]]"
  - "[[Graph - Node width in 3D and code blocks fit their lines]]"
  - "[[3D Graph - Settings in the style sidebar]]"
  - "[[3D Graph - Shared toolbar ribbon]]"
  - "[[Mind Map - Boundary (cloud) style]]"
  - "[[3D Graph - Tapered hierarchy edges]]"
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

The 3D graph ignores per-node styles. A node styled in the 2D mind map (colour, border, text colour, width, branch line) looks unstyled in 3D. 2D and 3D should share one styling system as much as possible, and this ticket is the read side, the foundation for width, the 3D style sidebar, boundaries and tapered edges.

## What problem does this solve?

3D plates and panels honour each node's `osmosis-styles` entry: fill, border, text colour, width (consumed by the width ticket), branchLine (consumed by the taper ticket), and shape where it is meaningful in 3D. Keys resolve exactly as in 2D.

## What's your current workaround?

3D draws every plate in the theme colours; to see a node's style you must switch back to 2D.

## Batch and checkpoint

Round 7, Batch C (editing and styling). Checkpoint: checkpoint 2 (C) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> PRINCIPLE: 2D and 3D share one styling system as much as possible.

This is the foundation for [[Graph - Node width in 3D and code blocks fit their lines]], [[3D Graph - Settings in the style sidebar]], [[3D Graph - Tapered hierarchy edges]], [[Mind Map - Boundary (cloud) style]] and [[3D Graph - Shared toolbar ribbon]] (style copy/paste). Reuse 2D's resolution code; do not fork a 3D-only style format.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Styles live in `osmosis-styles` frontmatter keyed by `^id` or a stamped `^os-` key (`planStyleKeys`, `src/mindmap-style-key.ts`).
- `NodeStyle` already has `width` (2D has a drag handle for it). 3D reads NO per-node styles today.
- Where 3D draws: plate instancing `src/graph3d/` plates + `src/views/Graph3DPlates.ts`; near-tier panels `src/graph3d/near.ts`; the scene is `src/views/Graph3DScene.ts`; colours come from `appearance.ts` (colour-by modes).
- vitest cannot import `obsidian`: keep style resolution in a pure module (e.g. next to `mindmap-style-key.ts`) and test it there.
- 2D style application: look at how `MindMapView.ts` resolves a node's style and feeds the renderer.

## Acceptance criteria

- A pure function maps (note's styles map, node's key info) to a resolved `NodeStyle` for a 3D node, using the same key rules as 2D (`planStyleKeys` / `^os-`), with unit tests.
- Plates (instanced) honour fill and border colours and text colour; near-tier panels honour fill, border and text colour.
- `shape` is honoured only where meaningful in 3D (document which shapes are drawn; unsupported shapes fall back to the default plate without error).
- `width` and `branchLine` are read and exposed to the renderer (stored on the node's render data) for the tickets that consume them, even if not yet drawn.
- Styles update live when the note's frontmatter changes (no stale cache) and survive text edits as in [[Mind Map - Styles survive text edits]].
- A node with no style looks exactly as today.
- Plates stay instanced (no per-plate draw calls added).

## Test plan

Unit tests first: style-key resolution for `^id` and `^os-` nodes in the 3D node model; missing/partial styles; unknown shape fallback; a note with no `osmosis-styles` yields defaults.

Manual test (fixture: a note with styled nodes made in 2D, in `e2e/fixtures/`, copied to `vault/tests/`, Ctrl+R):
1. In 2D, style three nodes (fill, border, text colour); open the same note in 3D (toggle): the plates carry the same colours.
2. Fly close: the near panels carry them too.
3. Edit a node's text in 3D: the style persists.
4. Change a style in 2D, toggle to 3D: updated.

## Out of scope

- Writing styles from 3D (see [[3D Graph - Settings in the style sidebar]], [[Graph - Node width in 3D and code blocks fit their lines]]).
- Boundaries and taper rendering (they consume what is read here).
- Changing the style file format.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
