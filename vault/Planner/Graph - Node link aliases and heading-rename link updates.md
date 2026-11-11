---
title: Graph - Node link aliases and heading-rename link updates
summary: "Drag-to-link writes [[Note#^id|^N]] with a plain keyboard-safe marker, and renaming a heading in an Osmosis node editor rewrites [[Note#Old]] links vault-wide when Obsidian auto-updates links."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 7 - Editing]]"
  - "[[Heading Links suggestions not working in Mind Map View]]"
  - "[[3D Graph - Follow a link]]"
  - "[[Graph pointer gestures - orbit, pan, link, menu]]"
status: In-Review
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-10T12:00:00.000Z"
date_start_scheduled: "2026-11-11T15:20:52.000Z"
date_start_actual: "2026-11-11T15:20:52.000Z"
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

Two link problems.

1. Dragging from one node to another in 3D inserts a link with no readable text (`generateMarkdownLink`, no alias). Sawyer floated the footnote style `[[Note#^id|[^1]]]`, but that breaks: the `]]` inside ends the link early. So the settled marker is plain text `^N`.
2. Renaming a heading in an Osmosis node editor (2D or 3D) breaks every `[[Note#Old Heading]]` link elsewhere in the vault, because only the file's text is renamed (`renameInFile`) and no links are updated.

## What problem does this solve?

Node links read `[[Note#^id|^1]]`, `[[Note#^id|^2]]`, ... and renaming a heading in an Osmosis node editor updates the links that point at it, the way Obsidian's own editor does.

## What's your current workaround?

Hand-edit the link text, and fix broken heading links by hand after a rename.

## Batch and checkpoint

Round 7, Batch C (editing and styling). Checkpoint: checkpoint 2 (C) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Link alias: `[[Note#^id|^1]]`, plain keyboard text, next unused number in source note.
> Heading rename: vault-wide link rewrite for renames in Osmosis editors, honour Obsidian's auto-update setting, Notice with counts.

Details from the brief: drag-to-link (and any node-link insertion) writes `[[Note#^id|^N]]`; N = the next unused number in the **source note** (the note the link is written into); existing markers are never renumbered. Renaming a heading in an Osmosis node editor (2D or 3D) rewrites `[[Note#Old]]` to `[[Note#New]]` vault-wide **when Obsidian's "Automatically update internal links" setting is on**, and shows a Notice "Updated N links in M notes". Renames made in Obsidian's own editor are out of scope (Obsidian handles those itself).

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Links: 3D drag-to-link uses `generateMarkdownLink` with no alias (`src/graph3d/links.ts`, + test); 2D has no drag-to-link and no "copy link to node".
- Heading rename: `renameInFile` only; no link updates anywhere (see the node-editor save path in `src/views/MindMapView.ts` and `src/views/Graph3DView.ts`; 3D edit helpers in `src/graph3d/edit.ts`).
- Check the vault setting with `app.vault.getConfig("alwaysUpdateLinks")`; find links via `app.metadataCache.resolvedLinks` / each file's cache `links` and rewrite with `app.vault.process` (atomic), handling `[[Note#Old]]`, `[[Note#Old|alias]]`, `[[#Old]]` inside the same note, and block/embed forms `![[Note#Old]]`. Heading-link matching in Obsidian is case-insensitive and ignores some punctuation; reuse Obsidian's normalisation rather than a regex on the raw text where possible (the existing heading-links suggest code is in [[Heading Links suggestions not working in Mind Map View]]).
- `^N` marker: scan the source note's existing `|^N]]` aliases to find the next unused N.

## Acceptance criteria

- Drag-to-link and every node-link insertion write `[[Note#^id|^N]]` (the target gets a block id if it needs one, as today), N being the next unused number in the source note; existing markers are never renumbered; deleting a link leaves gaps.
- Renaming a heading in an Osmosis node editor (2D or 3D) rewrites `[[Note#Old]]` to `[[Note#New]]` (including aliased, same-note `[[#Old]]` and embed forms) vault-wide when 'Automatically update internal links' is on; nothing is rewritten when it is off.
- After a rewrite a Notice reads 'Updated N links in M notes' (singular/plural handled); no Notice when there were none.
- Only links that target the renamed heading in that note are touched; same-named headings in other notes are not.
- A rename that Obsidian itself performs (its own editor) is untouched by this code.
- Writes are atomic per file and survive notes open in editors (flush as the existing save paths do).

## Test plan

Unit tests first (pure modules): next-unused-N finder (none, gaps, mixed text, non-marker aliases); link-text rewriter given a file's text, target note and old/new heading (plain, aliased, same-note, embed, case differences, heading with special characters, a link to a different note with the same heading is untouched); Notice message builder.

Manual test (fixture: two or three notes in `e2e/fixtures/` that link to each other's headings with each link form; Ctrl+R; make sure 'Automatically update internal links' is on, then off):
1. 3D: drag from one node to another: the source note gains `[[Target#^id|^1]]`; drag again: `^2`; delete `^1`, drag again: `^3`.
2. Rename a heading in a 3D node editor: other notes' links update and a Notice reports the counts. Repeat in 2D.
3. Turn the setting off: rename; links unchanged.
4. Rename in Obsidian's own editor: not affected by this change.

## Out of scope

- Renaming in Obsidian's own editor.
- Renumbering existing markers.
- Block-id (`^id`) renames, note renames, and tag renames.
- Adding drag-to-link or 'copy link to node' to 2D beyond using the shared insertion helper if one already is shared.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.

## Batch implementation notes (awaiting manual test)

Code: `b569cc3` on `feature/graph-link-aliases-heading-rename` (stacked on T47).

**Approach.**
1. *Markers.* `nextLinkMarker(content)` (`src/graph3d/links.ts`) is one past the highest `|^N]]` (or markdown `[^N](`) in the **source note**; `linkMarker(n)` is `^N`. Both 3D insertion paths pass it as `generateMarkdownLink`'s alias: `linkLines` (one drag) and `planSelectionLink` (multi-select drop), which counts on per source note so several lines linked in one drop get `^3`, `^4`, ...
2. *Heading rename.* The pure `src/heading-links.ts` finds and rewrites links in one note's text. `src/heading-link-update.ts` holds the Obsidian glue: `planHeadingRename` (setting on, old and new lines both headings, text really changed, old heading not still present), `rewriteOwnLinks` (same-note links, folded into the rename's own write), and `rewriteVaultLinks` (every other `.md` note that `resolvedLinks` says links to the renamed note, each via the new `EditPipeline.process` = `vault.process`, recorded; then the Notice). Wired into `Graph3DView.saveEdit` and `MindMapView.renameNode`.

**Decisions worth remembering.**
- Marker = max+1, not the lowest free gap. Deleting `^1` and dragging again gives `^3`, matching the test plan. Markers inside code still count, which can only raise N and never collide.
- Heading matching ignores case, whitespace and the punctuation Obsidian drops from link subpaths (`headingMatches`). A block ref `#^id` never matches. Only the **last** segment of a nested `#A#B` link is renamed.
- Links in fenced code (``` and ~~~, also indented or quoted), inline code and `%%` comments are left alone, because Obsidian doesn't index them. Frontmatter property links **are** rewritten, as Obsidian does. Math blocks and HTML comments are not skipped (rare).
- Markdown links `[x](Note.md#Old%20H)` and `<...>` forms are rewritten too, with the new heading URL-encoded (parentheses as well). Characters a wikilink can't hold (`# | ^ [ ]`) become spaces in the new heading.
- **Conservative guards:** nothing happens when `alwaysUpdateLinks` is unset (Obsidian's default is off), when the rename is case- or punctuation-only (links still resolve), or when another heading in the note still matches the old text (its links now point at that one). A list item that becomes a heading, or the reverse, rewrites nothing.
- Undo: the rename and the same-note links are one write. Other notes' rewrites are one recorded group filed under the edited note, so **Ctrl+Z first reverts the other notes' links, then a second Ctrl+Z reverts the rename**. I kept these as two steps because `EditRecorder.beginGroup` restarts rather than nests, and the rename write happens deep in each view's save path.
- Notes whose links don't change aren't written at all (a `cachedRead` pre-check), so their mtime stays untouched.
- The Notice is prefixed `Osmosis: ` like every other plugin notice: "Osmosis: Updated 3 links in 2 notes".

| File | Change |
|---|---|
| `src/heading-links.ts` (+test) | New pure module: `rewriteHeadingLinks`, `headingOfLine`, `headingMatches`, `hasHeading`, `skippedRanges`, `lineAt`, `headingRenameNotice` |
| `src/heading-link-update.ts` | New Obsidian glue: `planHeadingRename`, `rewriteOwnLinks`, `rewriteVaultLinks` |
| `src/edit-pipeline.ts` | `process(file, fn)`: atomic `vault.process`, recorded, no `beforeWrite` |
| `src/graph3d/links.ts` (+test) | `nextLinkMarker`, `linkMarker` |
| `src/graph3d/selection-edit.ts` (+test) | `planSelectionLink`'s `linkText` gets an alias; per-note marker counter |
| `src/views/Graph3DView.ts` | Marker alias in `linkLines` and `linkSelection`; heading-link rewrite in `saveEdit` |
| `src/views/MindMapView.ts` | Heading-link rewrite in `renameNode` |

**Fixture.** `vault/tests/graph3d/Lighthouse Keeping.md` (the target, with a same-note `[[#Lamp Room]]`), `Lighthouse Log.md` (plain, aliased, case-different, markdown and embed links, plus links in inline code and a fence and a link to the other note's same-named heading, all of which must stay put) and `Lighthouse Rota.md` (has its own `## Lamp Room`). Masters are in `e2e/fixtures/graph3d/`.

**Not verified (no Obsidian here):**
- How `generateMarkdownLink` renders the alias in a vault set to markdown links (`[^1](...)`, which Obsidian may read as a footnote reference).
- Whether `getConfig("alwaysUpdateLinks")` is the exact key in the current Obsidian.
- Live editor refresh of the other notes when they are open.
- 2D has no link insertion, so markers are 3D-only, as scoped.
