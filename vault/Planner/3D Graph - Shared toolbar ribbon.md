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
status: In-Review
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-11T11:32:00.000Z"
date_start_scheduled: "2026-11-11T11:32:00.000Z"
date_start_actual: "2026-11-11T11:32:00.000Z"
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

## Batch implementation notes (awaiting manual test)

Code: commit `ed8e0dc` on `feature/3d-shared-toolbar-ribbon` (stacked on T46).

**Approach.** The 3D view builds the same `ToolRibbon` class as 2D from the same `TOOLBAR_GROUPS` (no copy). `ToolRibbon` gained an options argument (`hidden`, `cls`); `GRAPH3D_HIDDEN_BUTTONS` = fold-all/unfold-all, and `visibleGroups()` drops them and the group they leave empty (so no stray divider). Each action is a 3D equivalent acting on the 3D selection (`Graph3DView.ribbonActions`). Commands: `main.ts` registers each `mindmap-<id>` command against the active MindMapView **or** Graph3DView (`runToolbarCommand`), so the palette works in 3D with the same enable rules (`canRunToolbarAction`).

**Shared clipboard.** The internal clipboard lived as private fields on each `MindMapView`, so it was not shared even between two maps. It is now the module `src/node-clipboard.ts` (`nodeClipboard` singleton: items, cut flag, source path, block IDs, captured schedules, plus the copy-style clipboard), with the paste splice (`pasteInto`) and the style-paste overrides (`stylePasteOverrides`) extracted from `MindMapView.pasteNodes` / `pasteNodeStyle` so 2D and 3D run the same code. 2D behaviour is unchanged except that its clipboard is now shared across views.

**3D actions.**
| Button | 3D action |
|---|---|
| fit / zoom in / zoom out | `Graph3DScene.fitAll` (glide along the line of sight until all loaded plates fit: `graph3d/fit.ts`), `zoomStep` (the wheel's eased zoom, aimed at the view centre) |
| center | fly to the focus note's core (2D's "root") |
| insert parent / add sibling / add child / move up,down / move left,right / delete | `structuralOnSelection` (extracted from the structural keys, so keys and buttons are one path): up/down/outdent/indent/parent/sibling/child/delete, multi-select aware as the keys are |
| copy | existing copy-as-Markdown (system clipboard unchanged), now also fills the internal clipboard |
| cut | copy (as a cut) then `deleteSelection`; schedules captured after the delete |
| paste | `pasteSelection`: last children of the focused line; a cut into another note migrates block-ID review history in one undo group |
| copy / paste style | primary's local style via `getNodeStyleContext`; paste through `applyNodeStyleOverrides` |
| undo / redo | `step` (the shared history, as Ctrl+Z) |
| refresh | clear parse/prefetch/style caches, `reload()` |
| properties | `activatePropertiesSidebar()` |
| node menu | `showNodeMenu` for the focused plate, anchored at the button |

Keys on the view Scope (edit mode only, pass through in text boxes / with text selected / when nothing to do): Ctrl+X, Ctrl+V, Ctrl+Shift+C, Ctrl+Shift+V (same keys as 2D). Ctrl+C is unchanged.

**Decisions worth remembering.**
- Ribbon visibility follows 2D's rule: 3D "reading mode" = edit mode off, so by default the 3D ribbon shows fit/zoom/center, copy, refresh, properties and node menu; the editing buttons appear when the header's Editing is on. Hidden while a line is being edited (as in 2D) and while a relational study session is active (its panel owns the bottom centre).
- Ctrl+C keeps producing Markdown on the system clipboard (the existing 3D contract) and now additionally fills the internal clipboard; internal items use `topmostLines`, so selecting a parent and its child copies the subtree once. Lines from more than one note paste as plain text (no single origin), as in 2D.
- Cut skips a sole H1 root (it is not deletable either). `deleteSelection` now returns a boolean so a refused/failed delete doesn't leave a "cut" clipboard that would later move review history.
- Paste only under a line (not a note/tag plate): Notice otherwise.
- The node menu itself is unchanged (no cut/paste/style items added; out of scope).
- Fold/unfold are `nothing` no-ops in the actions table purely to satisfy `ToolbarActions`; they are never rendered.

| File | Change |
|---|---|
| `src/node-clipboard.ts` (+test) | shared internal + style clipboard, `pasteInto`, `stylePasteOverrides` |
| `src/graph3d/fit.ts` (+test) | `enclosingSphere`, `fitDistance` |
| `src/views/ToolRibbon.ts` (+test) | `GRAPH3D_HIDDEN_BUTTONS`, `visibleGroups`, constructor options |
| `src/views/MindMapView.ts` | uses the shared clipboard module (fields removed) |
| `src/views/Graph3DView.ts` | ribbon, state, actions, cut/paste, style copy/paste, keys, `structuralOnSelection`, `deleteSelection` returns boolean |
| `src/views/Graph3DScene.ts` | `fitAll`, `zoomStep` |
| `src/main.ts` | toolbar commands also run in 3D |
| `styles.css` | 3D ribbon placement; hidden during study |

Fixture: `vault/tests/graph3d/Ribbon Clipboard.md` (embeds `Ribbon Clipboard Target.md`); `Styled Mooring.md` for style copy/paste.

**Could not verify** (no Obsidian): everything visual and interactive: ribbon placement against the mobile toolbar and corner controls, fit/zoom feel, cross-note cut/paste through an embed, and the command-palette entries. Unit tests cover the availability table, the clipboard round trip and the fit geometry only.
