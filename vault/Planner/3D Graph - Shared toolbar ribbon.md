---
title: 3D Graph - Shared toolbar ribbon
summary: "3D gets the same TOOLBAR_GROUPS ribbon as 2D, building the gaps: cut/paste on the shared internal clipboard, style copy/paste, undo/redo, fit/zoom/center, refresh, properties, node menu."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Read node styles]]"
  - "[[Graph - Shared header for 2D and 3D]]"
  - "[[3D Graph - Fold and unfold branches]]"
  - "[[Command palette items for mind map view toolbar operators]]"
  - "[[Graph - Edit keys]]"
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

The 2D view has a ribbon of 11 button groups; the 3D view has only header actions. 3D lacks fit/zoom/center, fold, cut, paste, style copy/paste, refresh, properties, node menu, and undo in the menu, and copy is copy-as-Markdown only.

## What problem does this solve?

3D shows the same ribbon, driven by the same `TOOLBAR_GROUPS`, with each button doing its 3D equivalent. Cut and paste share 2D's internal clipboard: copy in one view and paste in the other.

## What's your current workaround?

Use keyboard shortcuts (where they exist) or switch to 2D.

## Batch and checkpoint

Round 7, Batch C (editing and styling). Checkpoint: checkpoint 2 (C) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

Blocked by: [[3D Graph - Read node styles]]. Do not start until that ticket is built (stacked branch is fine).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> 3D ribbon = same TOOLBAR_GROUPS, build gaps (cut/paste, style copy/paste, undo/redo, fit/zoom/center, refresh, properties, node menu); fold hidden until Fold idea built.

Also: cut/paste uses the same internal clipboard as 2D (copy in one view, paste in the other). Fold/unfold stays hidden in 3D until [[3D Graph - Fold and unfold branches]] is built.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- `TOOLBAR_GROUPS` is `src/views/ToolRibbon.ts:55-115`, 11 groups; it drives both buttons and commands (global user hotkeys eat keys before `handleKeyDown`, so keys need the view Scope).
- Copy/cut/paste: 2D is full (`copySelectedNodes` / `pasteNodes`, internal clipboard) in `src/views/MindMapView.ts`; 3D has copy-as-Markdown only.
- 3D header actions and key handling: `src/views/Graph3DView.ts`; selection and edits: `src/graph3d/edit.ts`, [[3D Graph - Multi-select]].
- Style copy/paste depends on [[3D Graph - Read node styles]] and the style write path from [[3D Graph - Settings in the style sidebar]] (or a shared write helper).

## Acceptance criteria

- The 3D view renders a ribbon from the same `TOOLBAR_GROUPS` definition as 2D (not a copy); buttons without a 3D implementation are hidden, and fold/unfold is hidden.
- Cut and paste in 3D use the same internal clipboard as 2D: copy a subtree in 2D, paste in 3D (and the reverse), preserving structure and styles.
- Copy/paste style, undo/redo, fit/zoom/center, refresh, properties and node menu all work in 3D, each acting on the 3D selection.
- Command palette entries (generated from `TOOLBAR_GROUPS`) work in 3D with the view Scope.
- Existing 2D ribbon behaviour is unchanged.

## Test plan

Unit tests: a pure availability table (which `TOOLBAR_GROUPS` buttons are enabled in 3D) tested for the fold-hidden rule; clipboard round-trip between 2D and 3D payloads (extract the clipboard module if it is in a view file so it is importable by vitest).

Manual test (fixture: a styled note, Ctrl+R):
1. Open 3D: the ribbon shows the same groups; fold/unfold absent.
2. Copy a subtree in 2D, paste into a node in 3D (and reverse): same result; check the source file.
3. Cut + paste in 3D moves the subtree; undo/redo reverts each.
4. Copy style from one node, paste on another in 3D; fit/zoom/centre, refresh, properties and node menu each work.

## Out of scope

- Fold/unfold in 3D ([[3D Graph - Fold and unfold branches]]).
- The header (see [[Graph - Shared header for 2D and 3D]]).
- New ribbon buttons or groups.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
