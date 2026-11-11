---
title: Graph - Shared header for 2D and 3D
summary: "2D and 3D get the same header buttons in the same order: a 2D | 3D pill, Note view, Reading/Editing, Style sidebar, Study, then view-specific extras; the 2D toolbar's planet button goes."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[3D Graph Phase 8 - 2D-3D toggle]]"
  - "[[3D Graph - Settings in the style sidebar]]"
  - "[[3D Graph - Shared toolbar ribbon]]"
  - "[[Activate reading mode in Mind Map View when study mode is activated]]"
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

# Optimization

## What tool or process needs improvement?

The 2D and 3D headers differ: the 2D/3D switch is a 2D toolbar `orbit` icon in one view and a `brain-circuit` header action in the other, and the 3D header has a pencil where 2D has the Reading/Editing toggle. Sawyer wants one header, learnt once.

## What's slow or frustrating about it?

Both views show, in this order: a "2D | 3D" pill, Note view, Reading/Editing, Style sidebar, Study; then view-specific extras after (Pin/Peek in 2D, Follow in 3D).

## What would "better" look like?

The two views' headers use different icons and order for the same actions.

## Batch and checkpoint

Round 7, Batch C (editing and styling). Checkpoint: checkpoint 2 (C) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Header: shared across 2D/3D: 2D|3D pill, Note view, Reading/Editing (same as 2D/Note view; replaces 3D pencil), Style sidebar, Study; extras after. Remove 2D toolbar planet button.

Details from the brief: the Reading/Editing button has the same icon and behaviour as in 2D/Note view and replaces the 3D pencil. The 2D toolbar's planet/toggle button is removed (the pill replaces it). Selection is still carried both ways when switching (`liftoff.ts`).

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- 2D/3D toggle exists: the 2D toolbar `orbit` icon in the first group; 3D header action `brain-circuit`; a command also toggles; selection is carried both ways (`src/graph3d/liftoff.ts`).
- 2D toolbar groups are `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts:55-115`; 3D has no ribbon, only header actions (`src/views/Graph3DView.ts`).
- 2D view: `src/views/MindMapView.ts`. Mind map reading mode: see the Reading/Editing toggle there (`assertEditable` guard architecture, mindmap reading mode feature).
- Header actions use Obsidian `addAction`; a pill needs custom DOM in the view header.

## Acceptance criteria

- Both views' headers contain, in order: 2D | 3D pill (active side highlighted, click the other side to switch with selection carried), Note view, Reading/Editing, Style sidebar, Study.
- Reading/Editing in 3D uses the same icon and behaviour as in 2D / Note view; the 3D pencil is gone.
- View-specific extras follow the shared set: Pin/Peek in 2D, Follow in 3D.
- The 2D toolbar's planet/toggle button is removed; the toggle command still works.
- Style sidebar and Study buttons exist in both headers (the 3D Style sidebar content is delivered by [[3D Graph - Settings in the style sidebar]]; until then the button may open the existing Overlays panel).
- Mobile header still fits (icons only, no overflow).

## Test plan

Unit tests: put the header definition in a pure module (ordered list of shared actions + extras per view) and test the order and that both views share the same ids.

Manual test (any note; Ctrl+R after build):
1. Open a note in 2D, then 3D: the headers show the same buttons in the same order; the pill switches views and keeps the selected node.
2. Reading/Editing: toggles in both; the 3D pencil is gone.
3. 2D toolbar no longer has the planet button.
4. Pin/Peek only in 2D, Follow only in 3D.
5. Check the header on a narrow window / mobile layout.

## Out of scope

- The ribbon (see [[3D Graph - Shared toolbar ribbon]]).
- Moving Overlays into the sidebar (see [[3D Graph - Settings in the style sidebar]]).
- New commands or hotkeys.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
