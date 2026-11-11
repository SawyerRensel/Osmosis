---
title: Graph - Ctrl+Enter on a multi-selection and heading re-levelling
summary: "3D Ctrl+Enter should wrap the selected sibling span like 2D does, and reindentSubtree must re-level descendant headings by the moved heading's depth change (shared code, so 2D benefits)."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Graph - Edit keys]]"
  - "[[3D Graph - Multi-select]]"
  - "[[Correct indentation when converting list item to heading in mind map view]]"
  - "[[3D Graph Phase 7 - Editing]]"
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

# Bug Report

## What happened?

Two fixes sharing one area of the editing code.

1. Ctrl+Enter in the 3D graph acts on the focused node only. In 2D it wraps the span from the first to the last selected sibling of the primary node. Sawyer wants 3D to match 2D.
2. Rearranging headings does not re-level the headings underneath. When a heading moves to a different depth, its sub-headings should shift by the same amount, keeping their relative depth. Today heading-to-heading has a depth delta of 0, so sub-headings do not re-level.

## What should have happened?

3D Ctrl+Enter with several nodes selected wraps the selected sibling span under a new parent exactly as 2D does. Moving a heading from H2 to H3 turns its H3 children into H4 and its H4 grandchildren into H5, and so on, never going deeper than H6.

## Steps to Reproduce

Heading re-levelling: in either view, indent a heading (Tab) that has sub-headings; the sub-headings stay at their old level.
Ctrl+Enter: in 3D, multi-select two siblings and press Ctrl+Enter; only the focused node is wrapped.

## Batch and checkpoint

Round 7, Batch A (fixes). Checkpoint: checkpoint 1 (A + B) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Ctrl+Enter 3D = match 2D (wrap selected sibling span).

Sawyer's brief for heading re-levelling: `reindentSubtree` must re-level descendant headings by the moved heading's depth change, keeping relative depth and capping at H6. It is shared code, so 2D benefits too. **Write the tests first** (there is no test for this today).

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Ctrl+Enter: 2D wraps the span first..last selected sibling of the primary node. 3D `structuralKey("parent")` uses `focusedNode` only (`src/views/Graph3DView.ts:253-275`).
- Heading depth: both views use `reindentSubtree` (`src/mindmap-edit.ts:540-640`, signature at `:540`; callers at `:1064` and `:1116`). For heading to heading the delta is 0, so sub-headings do not re-level. It is a bug in shared code and affects 2D. No test exists.
- `src/mindmap-edit.ts` contains NUL bytes: use `grep -a`.
- 3D editing helpers: `src/graph3d/edit.ts` (+ `edit.test.ts`); multi-select: `src/graph3d/` selection code from [[3D Graph - Multi-select]].

## Acceptance criteria

- 3D Ctrl+Enter with a multi-selection of siblings wraps the span from the first to the last selected sibling of the primary (same rule and result as 2D), as one undoable edit.
- Ctrl+Enter with a single selection behaves as today in both views.
- `reindentSubtree`: when a heading's depth changes by d, every descendant heading's depth changes by d, preserving relative depth; any heading that would exceed H6 is capped at H6.
- Moving a heading to a shallower depth (negative d) re-levels descendants up, not below H1 (or the existing floor rule used for the root).
- List items and non-heading descendants behave as before.
- Unit tests written first, covering the cases above, pass in both views' shared code path.

## Test plan

Unit tests first (`src/mindmap-edit.test.ts` or the existing test file for it): H2 with H3/H4 children moved to H3 → H4/H5; moved to H5 → H6/H6 (cap); moved up H3 → H2 → children shift up one; mixed headings and list items; delta 0 unchanged. For the 3D span-wrap, extract the "which nodes does the wrap cover" decision as a pure function shared with 2D if one is not already, and test it.

Manual test (fixture in `e2e/fixtures/`, copy to `vault/tests/`, Ctrl+R):
1. 2D: indent and outdent a heading that has sub-headings; sub-headings follow.
2. 3D: multi-select two sibling nodes (Shift/Ctrl-click), press Ctrl+Enter; both are wrapped under a new parent, as 2D does. Check the source file.
3. Undo restores the original in one step.

## Out of scope

- Changing which keys do what, or adding new structural keys.
- Heading re-levelling when text is pasted (only moves/indent/outdent that go through `reindentSubtree`).
- Fold/unfold.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
