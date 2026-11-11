---
title: Graph - Node width in 3D and code blocks fit their lines
summary: "A drag handle on the 3D near panel writes the same width style as 2D; far plates honour the width; code-block nodes in both views auto-fit their longest line up to about 100 characters, then wrap."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Read node styles]]"
  - "[[3D Graph - Edit box width and trusting the view]]"
  - "[[3D Graph - Near-tier sliders]]"
  - "[[Mind Map - Styles survive text edits]]"
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

Two related width problems.

1. In 3D a node's width cannot be set. 2D has a drag handle that writes a `width` style; 3D plates are a fixed 20em with an ellipsis, and the edit box auto-fits but cannot be resized.
2. Code blocks are narrow. In 2D the natural width is capped by `maxNodeWidth` (default 230 px); in 3D the panel is chars x 0.55em capped at 20em. Long lines wrap or get cut even when there is room.

## What problem does this solve?

A custom width set in either view applies in both. Code-block nodes size to their longest line (to about 100 characters) in both views; beyond that they wrap. A custom width always overrides the auto-fit.

## What's your current workaround?

In 2D, raise `maxNodeWidth` or drag the width handle per node; in 3D there is no workaround.

## Batch and checkpoint

Round 7, Batch C (editing and styling). Checkpoint: checkpoint 2 (C) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

Blocked by: [[3D Graph - Read node styles]]. Do not start until that ticket is built (stacked branch is fine).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> 3D width: drag handle on near panel writes same `width` style; far plate honours width.

Sawyer's decisions for this ticket: the 3D handle writes the same `width` style (stamping `^os-` as 2D does); far plates honour the width instead of the 20em ellipsis; code-block nodes in both views auto-fit their longest line up to about 100 characters (ignoring the 230 px default `maxNodeWidth`), then wrap. A custom width always overrides this.

> PRINCIPLE: 2D and 3D share one styling system as much as possible.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Styles are in `osmosis-styles` keyed by `^id` / stamped `^os-` (`planStyleKeys`, `src/mindmap-style-key.ts`). `NodeStyle` has `width`; 2D has the drag handle (`src/views/MindMapView.ts`).
- 3D width: plates are 20em with an ellipsis, the edit box auto-fits, no resize. Near-tier panels: cap 30em tall, 20em wide (`src/graph3d/near.ts:72`).
- Code width: 2D generic natural width capped by `maxNodeWidth` (default 230); 3D panel = chars x 0.55em, cap 20em.
- Depends on [[3D Graph - Read node styles]] for reading `width` in 3D.

## Acceptance criteria

- A drag handle on the 3D near panel resizes its width and writes the `width` style, stamping an `^os-` key when the node has no id, exactly as 2D does; the change is one undoable edit and visible in 2D.
- Far plates (the instanced tier) honour a node's `width` instead of the fixed 20em ellipsis.
- A code-block node with no custom width auto-fits its longest line, up to about 100 characters (one named constant), in both 2D and 3D, ignoring the 230 px default `maxNodeWidth` for code blocks only; longer lines then wrap.
- A custom `width` always overrides the auto-fit.
- Non-code nodes are unchanged in 2D (still capped by `maxNodeWidth`).
- Edit box width in 3D follows the node's width when set.

## Test plan

Unit tests first (pure module, e.g. `src/graph3d/near.test.ts` and the 2D width helper): code-block width = min(longest line, 100 chars) in the right unit for each view; custom width beats it; empty and single-line blocks; wide characters do not break the maths; handle drag maps pixels to a width style value consistently with 2D.

Manual test (fixture: a note with a code block that has lines of 40, 80 and 140 characters, plus a normal paragraph node):
1. 2D: the code node is as wide as its 80-character line (about); the 140-character line wraps at about 100.
2. 3D: same (both tiers).
3. 3D: fly close, drag the width handle on a panel narrower; the file gains a `width` entry (and `^os-` stamp) in `osmosis-styles`; toggle to 2D: same width. Far plate also uses that width.
4. Remove the custom width (reset in the style sidebar/2D): auto-fit returns.

## Out of scope

- Height resizing.
- Changing the default `maxNodeWidth` setting.
- Auto-fitting non-code node types (tables, images) beyond what exists.
- The 3D style sidebar UI ([[3D Graph - Settings in the style sidebar]]).

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
