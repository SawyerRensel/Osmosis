---
title: Mind Map - Convert branch to note
summary: "A \"Convert branch to note\" context-menu item in the 2D mind map and the 3D graph: the branch moves into a new note (root text → file name + H1, children re-levelled), the source gets an ![[embed]] in its place, and vault-wide links into the branch are rewritten."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph Phase 7 - Editing]]"
  - "[[3D Graph - Planets mode]]"
status: Done
priority:
progress:
date_created: "2026-11-09T22:51:11.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-09T22:51:11.000Z"
date_start_actual: "2026-11-09T22:51:11.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

Spec settled by Sawyer on 2026-11-08 (do not re-decide):

- A **"Convert branch to note"** item in **both the 2D mind map and the 3D graph context menus**, on a line node. Not on the root, the file-name plate, tags or attachments.
- The branch (the node and all its descendants) moves into a new note. In the source it is replaced by an `![[New Note]]` embed line at the same position and indent.
- The branch root's text becomes the **file name** (illegal filename characters stripped) and the new note's `# H1`. Its children are **re-levelled** under that H1: headings shift so the top child level is H2, list items keep their relative nesting, and paragraphs etc. are unchanged.
- **Incoming links into the branch are rewritten.** Vault-wide `[[Src#Heading]]` and `[[Src#^id]]` links (and their alias and embed forms) that point at a heading or block now inside the moved branch are pointed at the new note (`[[New Note#Heading]]`, `[[New Note#^id]]`). A link to the branch root's heading becomes `[[New Note]]`. Found through Obsidian's metadataCache / resolved links, written with `app.fileManager` / `vault.process`.
- `osmosis` card fences and their schedules travel **unchanged**: byte-identical, ids preserved. Check that card identity doesn't depend on the file path, and record what we find.
- New plugin settings: **folder for new notes** (default empty = the source note's folder) and **template file** (its frontmatter and optional body are merged into the new note; default none). In the settings tab near the related mind-map settings.
- **Name clash** → Obsidian-style " 1" suffix (" 2", …).
- Works in the 3D graph's **Planets mode** too: after conversion the source planet re-lays out, and the new note appears as its own planet / embedded content per the depth rules.
- One undo step in the 2D map if the 2D undo groups edits. Creating the new file can't be undone by editor undo; record the behaviour.
- Node styles in the source's `osmosis-styles` frontmatter for moved lines move to the new note's frontmatter (by `^id` key where present).

## What problem does this solve?

A branch of a mind map often grows into a topic of its own. Today splitting it out means cutting the lines by hand, re-levelling the headings, creating the note, pasting an embed back, and fixing every link that pointed at a heading or block in it.

## What's your current workaround?

Manual cut/paste in the Markdown editor and hand-editing incoming links.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `3e78bad` on `feature/convert-branch-to-note` (stacked on `feature/coloured-clozes`).

### Approach

- **Pure transform, `src/branch-to-note.ts`** (unit-tested in `src/branch-to-note.test.ts`): `convertBranch(content, start, end)` takes a line's `range.start` and `subtreeEnd`, and returns the title, sanitised file name, the new note's body, the embed prefix and the moved link targets (`MovedTargets`: heading keys, root heading, block IDs). `replaceBranch` swaps the branch for the embed line. `retargetLinks` / `anchorToSource` / `movedTarget` rewrite wikilinks; `uniqueNotePath` resolves a name clash; `applyTemplate` merges the template; `stableSelectorPairs` / `splitStyles` move styles.
- **Orchestrator, `src/convert-branch.ts`** (imports `obsidian`): `convertBranchToNote(ctx: MoveContext, settings, source, lineId)`. Both views pass the `MoveContext` they already build for cross-note moves, so writes go through each view's own edit pipeline and normalisation.
- **Order** (as in `moveAcrossFiles`): flush the source's staged ratings → read and parse fresh → open one edit group → create the new note → write the source (embed + its own `[[#Heading]]` links retargeted) → copy card keys → move styles → migrate line-card schedules (`readMovedScheduleEntries` + `migrateBlockIdentity`, reused) → retarget incoming links in other notes → close the group → the view re-syncs.
- **2D**: a "Convert branch to note" item in the node menu's Structure group (editing mode only; not the root, embed lines, code blocks, tables, quotes, or transcluded nodes). **3D**: the same item in the edit-mode line menu after "Insert parent" (not the note root / sole H1, nor non-line plates). The 3D reload selects the embed line; the view's existing `metadataCache` `resolve` handler re-reads the horizon, so the new note appears as embedded content or (in Planets) its own planet per the depth rules. No Planets-specific code was needed.

### Decisions worth remembering

- **Re-levelling.** A heading root's child headings shift so the shallowest is H2. A list root's children lose their shared indent, so they become top-level items and keep their relative nesting. A paragraph root's following lines are left as they are. Lines inside code fences are never re-levelled. Trailing blank lines stay in the source.
- **The embed keeps the root's list marker.** A list item becomes `  - ![[New]]` at its indent, an ordered one `1. ![[New]]`. A bare `![[New]]` there would read as a continuation line of the item above. A heading root's embed has no prefix.
- **The root's block ID stays on the H1** (`# Title ^id`), so its line card, style and `[[Src#^id]]` links keep working (`→ [[New#^id]]`). A link to the root heading becomes `[[New]]`, per the spec.
- **Heading links match the way Obsidian matches them.** Case is folded and `# ^ | [ ] : \ %` count as spaces. The last `#` segment decides. A heading counts as moved only if its **first** occurrence in the source was inside the branch (links resolve to the first match).
- **Self links.** In the source, `[[#Moved heading]]` becomes `[[New#Moved heading]]`. In the moved text, `[[#Heading that stayed]]` becomes `[[Src#Heading that stayed]]`.
- **Incoming links** are found from `metadataCache.resolvedLinks` (notes that link to the source). Each is rewritten with `vault.process` (atomic against an open editor), using `getFirstLinkpathDest` to decide whether a link path means the source, and `fileToLinktext` for the new note's link text. Each rewrite is recorded into the undo group. Only wikilinks/embeds are rewritten: Markdown `[text](Src.md#h)` links are not. Links inside fenced code are skipped; inline code is not.
- **Card identity (checked).** Fence-card IDs are the fence's `id:` and fence schedules live inside the fence, so neither depends on the path, and fences travel byte-identical (a fence nested in a list item loses only the list indent, with the rest of its lines). Line-card IDs *do* embed the note path (`lineCardId(path, blockId)`) and their schedules live in the source's `osmosis-schedule` frontmatter, so they're migrated with the existing cross-note move helpers.
- **Card opt-in is copied.** Card generation is gated per note, so the new note inherits the source's `osmosis-cards`, `osmosis-deck` and `osmosis-line-cards` (unless the template sets them). Without that, the branch's cards would silently stop generating. Not handled: a source included only via an include *folder* or *tag* setting. Its new note is included only if it lands in an included folder. The deck can also change when the new-note folder differs and the source has no explicit `osmosis-deck`, because the deck derives from the folder.
- **Styles.** `^id` keys move unchanged. `_n:` keys hash type + depth + text, and re-levelling changes the depth, so they're re-keyed by pairing the branch's lines with the new note's lines in document order. If the counts differ, no `_n:` key moves (it's left behind rather than guessed). Tree-path and class selectors stay in the source.
- **Template.** The template's frontmatter block goes first, verbatim. Its body goes after the branch, following a blank line. No `{{title}}`/`{{date}}` substitution (not asked for). A missing template shows a notice and creates the note without it.
- **Name clash** → `Name 1`, `Name 2`, …. File names drop `\ / : * ? " < > | # ^ [ ]` and control characters, trim leading/trailing dots, cap at 120 characters, and fall back to `Untitled`. An empty folder setting means the source note's folder. A configured folder that doesn't exist is created.
- **Undo.** The whole conversion is one undo step (one edit group) in both views. It reverts the source, the moved frontmatter and the rewritten links. **The new note is not deleted** (editor/pipeline undo can't delete a file), so after Ctrl+Z it remains as a copy of the branch. Redo re-applies the source and links.

### Surface map

| File | Change |
|---|---|
| `src/branch-to-note.ts` | New. Pure transform, link retargeting, name-clash resolver, template merge, style split |
| `src/branch-to-note.test.ts` | New. 22 unit tests |
| `src/convert-branch.ts` | New. Orchestrator shared by both views (writes, styles, schedules, card keys, incoming links) |
| `src/edit-moves.ts` | `frontmatterValue` exported |
| `src/settings.ts` | `branchNoteFolder`, `branchNoteTemplate` settings. "Convert branch to note" group after "Undo history". `NoteSuggest` |
| `src/views/MindMapView.ts` | Node-menu item + `convertBranch` |
| `src/views/Graph3DView.ts` | Edit-mode line-menu item + `convertBranch` (reload selects the embed line) |

### Fixture

`e2e/fixtures/convert-branch/` → `vault/tests/convert-branch/`:
- `Seamanship.md`: an `osmosis-cards` note. Its "Rigging" H2 branch has H3s, list items, a styled line card `^os-shr001` (back-dated schedule) and an `osmosis` fence (`cb-sheet1`, back-dated). "Navigation" has a nested list with `^cb-depth`, and the note ends with a self link `[[#Running rigging]]`.
- `Harbour Log.md` links into it: `[[Seamanship#Standing rigging]]`, `[[Seamanship#Rigging|rigging notes]]`, `[[Seamanship#^cb-depth]]`, `![[Seamanship#^os-shr001]]`, and `[[Seamanship#Navigation]]` (must not change).

### Not verified

Nothing was run inside Obsidian: the menus, `metadataCache` link resolution, `vault.process` on an open note, the Planets re-layout and the undo behaviour all need the manual test. Unit tests cover the pure transform only.
