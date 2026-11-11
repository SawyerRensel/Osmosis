---
title: Graph - Find and replace
summary: "Ctrl+F in both views searches all loaded nodes (2D: the note plus its transclusions; 3D: the loaded graph), Enter and Shift+Enter fly or scroll between matches, and Replace edits only the focused note."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Graph - Edit keys]]"
  - "[[3D Graph - Focus changes only on purpose]]"
  - "[[3D Graph - Controls and help]]"
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

# Feature Request

## What do you need built?

Neither view has search. To find a word in a big mind map or a 3D graph you have to scan by eye or leave the view.

## What problem does this solve?

Ctrl+F opens a find bar in both views that searches all loaded nodes. Enter and Shift+Enter move to the next / previous match (the 3D camera flies there, the 2D map scrolls and centres). A Replace field replaces matches in the focused note only.

## What's your current workaround?

Use Obsidian's search or switch to Note view.

## Batch and checkpoint

Round 7, Batch C (editing and styling). Checkpoint: checkpoint 2 (C) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Find: Ctrl+F searches all loaded nodes, Enter/Shift+Enter flies; Replace focused note only.

Scope of 'all loaded nodes': in 2D, the note plus its transclusions; in 3D, the loaded graph (whatever depth is loaded). The camera move in 3D should use the existing fly path and obey the distance rule from [[3D Graph - Camera keeps your distance]] (arrive at the current distance).

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Find: none exists today in either view.
- 2D: `src/views/MindMapView.ts` (keys need the view Scope; global user hotkeys eat keys before `handleKeyDown`); transcluded notes are part of the 2D layout.
- 3D: `src/views/Graph3DView.ts`, `src/views/Graph3DScene.ts` (loaded graph data), `src/graph3d/model.ts` (node text); fly path in the scene (`flyTo`), see [[3D Graph - Camera keeps your distance]].
- Replace must go through the existing node-edit save path (flush the editor before `processFrontMatter`/file writes, as the Rapid Flashcard work established) so it is atomic and undoable per note.
- Keep the matcher a pure module (plain text, case-insensitive by default, optional case-sensitive toggle) so vitest can test it.

## Acceptance criteria

- Ctrl+F opens a find bar in 2D and in 3D (view Scope key, works with user hotkeys present); Escape closes it and clears highlights.
- Matches are found across all loaded nodes (2D: the note and its transclusions; 3D: all loaded nodes); the bar shows 'i of N'.
- Enter / Shift+Enter go to the next / previous match, wrapping; 3D flies the camera to the node (arrival rule per [[3D Graph - Camera keeps your distance]]), 2D scrolls to and selects it.
- Matching nodes are highlighted; the current match is distinct.
- Replace and Replace all edit only matches in the focused note (the note the focused match is in); other notes' matches are untouched and say so in the UI.
- Edits are saved like any node edit and can be undone.
- No match found is shown clearly; an empty query matches nothing.

## Test plan

Unit tests first (pure): matcher over a list of (note, node id, text) returns ordered matches with ranges; case toggle; special regex characters are literal; replace-in-note produces correct text and leaves other notes' matches alone; next/previous wrap.

Manual test (fixture: a note with a transclusion and 3D-linked notes, e.g. `vault/tests/graph3d/` Sailing notes, Ctrl+R):
1. 2D: Ctrl+F, type a word that appears in the note and its transcluded note; the counter shows both; Enter cycles and scrolls; Shift+Enter reverses.
2. 3D: same, the camera flies to each match without changing distance.
3. Replace: with a match focused in note A, Replace all changes only note A; check note B's file is untouched.
4. Escape closes; undo reverts a replace.

## Out of scope

- Regex or whole-word search, searching outside loaded nodes, vault-wide search.
- Replacing in notes other than the focused note.
- Search in Note view or reading mode.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.
