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
status: Done
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-11T15:27:36.000Z"
date_start_actual: "2026-11-11T15:27:36.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
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

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Branch `feature/graph-find-replace` (stacked on T48), code commit 72ad24d.

### Approach

One shared find bar (`src/views/FindBar.ts`) sits top right in both views. The matching and replace planning live in the pure module `src/find-replace.ts`. Each view implements a small `FindHost`: its loaded nodes as `FindItem`s, how to go to a match, how to mark matches, and how to write a replace.
- **2D items**: every node of `currentTree` in document order, collapsed ones included. Each is matched on `content`, and a transcluded node is filed under its `sourceFile`. Going to a match expands any collapsed ancestors (as `land` does), then `selectNode` and `centerOnNode` (zoom kept). Matches get the `osmosis-node-find-match` class, a yellow stroke.
- **3D items**: every node of `this.model`, matched on `label`. Going to a match is the arrow-key path, `scene.select` + `navigate(..., glide = true)`, so `glideTo` keeps the current viewing distance and the move is a back/forward step. Marks go through `Graph3DScene.setFound`. The plate's `aSelected` attribute now carries 2 for a find match (a yellow border as thick as the selection's, new uniform `uFound` from `--color-yellow` via the theme probe), and panels get `.is-found`.
- **Replace**: `planReplace` takes the current match's note only. `rewriteLines` splices each changed line's content into its edit text (`nodeEditText`) and puts back the indentation and block ID (`restoreEditedLine`), all in one string. So a Replace all is one write and one undo step. The 3D view writes through `commitLines`, with `edited` starts so replaced lines keep their place. The 2D view writes through `writeNodeFile` (current or transcluded file). Before writing, each line's bytes are checked against its parse. If any line changed, nothing is written and a Notice says "that note changed; search again".

### Decisions worth remembering
- **Typing does not move the view.** Only Enter / Shift+Enter (or the arrows) go to a match. Until then the counter reads "N matches". This follows the "focus changes only on purpose" principle; a flight per keystroke would be dizzying. Enter from that state goes to the first match and Shift+Enter to the last.
- **Replace (or Replace all) with no current match goes to the first match instead of replacing.** The note that gets edited is the current match's note, so it has to be on screen first.
- **The current match is the selection.** It gets the accent border, and the other matches get yellow. This is the same in 2D and 3D. Clicking another node removes that distinction, which is the trade-off.
- **After a single Replace, the next match is gone to** (`indexAfterReplace`). If the replacement itself contains the query (for example "sail" → "Sail" with case ignored), those occurrences are stepped over so Replace doesn't loop.
- **These can be found but not replaced:** note titles (3D cores), tags, ghosts, attachments, `![[embed]]` lines (their text is a link target) and ```osmosis fences (card data). The scope line says so. In 2D, fences are also left out of the search.
- **Renamed headings take their links along**, as a node edit does (T48's `planHeadingRename` / `rewriteOwnLinks` / `rewriteVaultLinks`, honouring Obsidian's auto-update setting). Those link rewrites in other notes are link maintenance, not matches; other notes' matches are never touched.
- **Replace needs edit mode.** It is off in 2D reading mode, in 3D when editing is off, and during a study session. During a study session, find also returns no matches, because the session hides answers in place.
- **Keys:** Ctrl/Cmd+F is on each view's Scope (not taken while a node editor is open). In 2D, the Mod/Mod+Shift/Alt+arrow/F2 scope handlers now pass keys typed in the find bar through to the text box. Without that, Ctrl+V in the box would paste nodes. The bar stops pointer, wheel and key events from reaching the view's own handlers. Enter in the Replace box replaces; Ctrl/Cmd+Enter replaces all. Escape (in the bar, or on the view) closes the bar and clears the marks.
- The 2D bar survives `renderPass`'s `container.empty()` by detach/attach, like the ribbon, and keeps input focus across it.

### Surface map
| File | Change |
|---|---|
| `src/find-replace.ts` (new) | Pure: `findMatches`, `stepMatch`, `findCounter`, `planReplace`, `indexAfterReplace`, `spliceContent`, `rewriteLines`, `replaceableLine` |
| `src/find-replace.test.ts` (new) | 24 tests: ordering and ranges, case toggle, literal regex chars, wrap, replace scope, every line kind against the real parser, stale-note refusal |
| `src/views/FindBar.ts` (new) | Shared bar DOM and flow (`FindHost`) |
| `src/views/MindMapView.ts` | Bar creation/teardown, Mod+F, in-bar key guards, Escape, `findItems`/`goToFound`/`markFound`/`replaceFound`, render detach/attach/refresh |
| `src/views/Graph3DView.ts` | Bar creation/teardown, Mod+F, Escape closes it, `findHost`/`replaceFound`, refresh after reload and edit-mode change, theme probe `found` |
| `src/views/Graph3DScene.ts` | `setFound`, `EngineNode.found`, `SceneTheme.found` |
| `src/views/Graph3DPlates.ts` | `aSelected` = 2 for a find match, `uFound` uniform |
| `src/views/Graph3DNear.ts` | `setFound`, `.is-found` panels |
| `styles.css` | Bar, 2D match stroke, 3D panel find border, probe colour |

### Fixture
`vault/tests/graph3d/Find Harbour.md` (embeds `Find Rigging`, links `Find Weather`). Masters are in `e2e/fixtures/graph3d/`. "sail" appears 5 times in Find Harbour, 2 in Find Rigging and 1 in Find Weather.

### Not verified (no Obsidian here)
Everything visual: the bar layout, the plate and panel find border colour, focus staying in the box across 2D re-renders and 3D reloads, and the glide on Enter. Also not checked: the Lucide icons `case-sensitive`, `replace` and `replace-all` exist in Obsidian's bundled set, and the scope's Mod+F beats Obsidian's own "Search current file" in Sawyer's vault.

### Known gaps
- There is no ribbon button or command for find, so it has no mobile entry point.
- The match index is kept across reloads. After an outside edit it may point at a different match.
- In 3D, the counter doesn't re-check "Replace blocked" when a study session starts until the next reload.
