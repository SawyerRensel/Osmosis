---
title: Heading links - Insert with a pipe alias that hides the block id
summary: "T115. Heading [[# links picked from Obsidian's suggest carry the heading's ^os- id in the visible text. Write them as [[#Heading os-id|Heading]] in the note editor, mind map and Cosmos edit boxes."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: Done
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-26T18:46:00.000Z
date_start_scheduled: 2026-11-24T00:51:04.000Z
date_start_actual: 2026-11-24T00:51:04.000Z
date_end_scheduled: 2026-11-26T18:46:00.000Z
date_end_actual: 2026-11-26T18:46:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/53
---

# Heading links - Insert with a pipe alias that hides the block id (T115)

## What Sawyer asked
> It should render a heading without an `^os-dsjkld` by using the `|` pipe.

Screenshots: `ref/screenshots/Pasted image 20261123084327.png` (edit box: ``[[#`defer` os-8vmwam]]``) and `…084356.png` (rendered: the link reads "`defer` os-8vmwam").

## Settled with Sawyer
- **Write the alias only.** When a heading link is inserted, write `[[#<heading text with id>|<heading text without id>]]`, e.g. ``[[#`defer` os-8vmwam|`defer`]]``. Existing links in the vault are **not** rewritten, and rendering does not strip the id.
- It applies in **the note view (Obsidian's markdown editor), the mind map edit box, and the Cosmos edit box.** Cross-note links (`[[Note#Heading ^os-…]]`) count too if the same suggest produces them.
- Headings without an `^os-` id are unchanged: no alias is added.

## Current state
- `src/card-gen/generate-ids.ts` 146–148 appends ` ^os-xxxxxx` to headings, bullets and ordered items. Prefix in `src/block-id.ts` 19; `extractTrailingBlockId` 35–49.
- Osmosis has no suggester of its own. The `[[#` popup is Obsidian's native link suggest; it works inside Osmosis edit boxes because `src/editor/EmbeddableMarkdownEditor.ts` hands a duck-typed `owner` with `file` (26, 77, 101–104, 186–215; PR #46) and becomes `workspace.activeEditor`. Obsidian builds the link from the heading cache text including the id, drops the `^`, and adds no alias.
- Heading link rename handling: `src/heading-links.ts` (209 lines) and `heading-link-update.ts`. Make sure the aliased form still updates on rename.
- **Open design for the worker:** how to hook the insert. Candidates:
  - post-process the editor transaction (`editor-change` or a CM6 update listener) when a `[[#… os-xxxxxx]]` link without `|` has just been completed at the cursor;
  - wrap the native suggest's `selectSuggestion`.

  Prefer the narrowest hook that covers all three editors and never touches text the user typed by hand elsewhere. Verify how Obsidian resolves the link (does ``[[#`defer` os-8vmwam]]`` land on the heading?) and keep the target part exactly as Obsidian wrote it. If the extracted Obsidian source is available under `ref/`, read how the suggest inserts.
- Pure rewrite logic (link text in → aliased link out) goes in a non-view module with unit tests.

## Acceptance criteria
- Picking a heading with an `^os-` id from the `[[#` suggest in each of the three editors writes `[[#… os-id|Heading]]`, and the cursor ends after `]]`.
- The rendered link shows only the heading text and still navigates to the heading.
- Headings without ids, block links (`[[#^id]]`), typed-by-hand links and existing links are untouched.
- Renaming the heading still updates the aliased link.

## Test plan
Fixture note with headings carrying `^os-` ids and one heading without. In the note editor, the mind map edit box and the Cosmos edit box, insert `[[#` and pick each heading → check the source text and the rendered link. Click the link → lands on the heading. Rename the heading → the link updates.

## Context budget (~55k tokens)
- `src/editor/EmbeddableMarkdownEditor.ts` 1–230; `src/block-id.ts` whole; `src/heading-links.ts` whole; `src/heading-link-update.ts` whole; `src/main.ts` registration area only (grep `registerEvent`/`registerEditorExtension`).

## Conventions
- Batch 15 ticket: commit `feat(T115): …`/`fix(T115): …` plus one `docs(T115)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section (approach, decisions, surface map, fixture, test steps, what was not verified). Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes outside `src/views/` (vitest cannot import obsidian) and gets unit tests.
- Fixtures: master copy in `e2e/fixtures/`, copied to `vault/tests/`; back-date every fixture card; neutral subject domains (no biology).

## What was implemented

Shipped in [PR #53](https://github.com/SawyerRensel/Osmosis/pull/53) → `release/0.0.6` (batch 15, commit `0a96df8`).

### The cause

Obsidian's link suggest (`selectSuggestion` in `ref/obsidian-core/app.js`) builds a heading link with the subpath `"#" + zi(heading)`, where `zi` turns `: # | ^ \ %% [[ ]]` into spaces. The heading's `^os-` id therefore showed up as ` os-xxxxxx` in the link text, and no alias is added unless one is already after the cursor. A second, quieter problem: in the Osmosis node editors, `planHeadingRename` compared links against the heading with the id stripped, so a link carrying the id (`[[#Old os-x]]`, which the suggest has always written) never matched on rename.

### The fix

- A CM6 `EditorState.transactionFilter` (`headingLinkAliasFilter`, `src/heading-link-alias.ts`), registered once with `registerEditorExtension` in `main.ts`. Obsidian puts `workspace.editorExtensions` in its base markdown editor, which the mind map and Cosmos `EmbeddableMarkdownEditor` inherit, so one registration covers the note editor, the mind map edit box and the Cosmos edit box.
- It only acts on an `input.autocomplete` transaction with exactly one change that inserts a whole `[[target]]` with no `|`, whose last `#` segment ends in ` os-…`. It appends `|alias` in the same transaction, so pick and alias undo as one step. The target is left as Obsidian wrote it.
- The alias is the heading's cached text (`metadataCache.getFileCache(dest).headings`, resolved from `editorInfoField.file`) with the trailing id stripped, which keeps characters `zi` dropped: `Step 1: sweat ^os-…` aliases as `Step 1: sweat`. If the cache cannot be reached the alias falls back to the subpath minus its id.
- Rename: `HeadingRename` carries the old and new block ids; `rewriteHeadingLinks` also matches `Old os-x` and writes `New os-x`, and a wikilink alias that equals the old heading text exactly becomes the new text.

### Decisions worth remembering

- **Transaction filter rather than wrapping `selectSuggestion`.** It uses public CM6 and Obsidian API instead of reaching into `workspace.editorSuggest.suggests`, and it only ever sees text the suggest just inserted, so hand-typed links and links already in the vault cannot be touched. Existing links are not rewritten; rendering does not strip the id (settled with Sawyer).
- **The alias comes from the heading cache, not the subpath**, so punctuation survives.
- **Only `^os-` ids are aliased.** A foreign id (`^my-id`), or text that ends in "os-abc123" with no caret, gets no alias; headings without an id are unchanged.
- **Embeds (`![[#H os-x]]`) are skipped**: an alias does not change how a section embed renders.
- **Tab pick:** Obsidian leaves the cursor before `]]`; the filter then selects the alias so it can be typed over, as Obsidian does for a link that already has one.
- **Markdown-link mode is not handled.** With "Use [[Wikilinks]]" off the suggest writes `[text ^os-x](#…)`, which is not a pipe link and was outside the settled scope.
- **The alias follows a rename only when it equals the old heading text exactly**, so hand-written display text is kept. This applies only to renames in Osmosis node editors; Obsidian's own "Rename heading" command keeps aliases as they are.

### Surface map

| File | Change |
|---|---|
| `src/heading-link-alias.ts` | New. `aliasHeadingLink` (pure) and `headingLinkAliasFilter` (CM6 transaction filter) |
| `src/heading-link-alias.test.ts` | New. Pure cases plus the filter driven through a real `EditorState` (Enter and Tab cursor placement, typed input, embeds, id-less headings) |
| `src/main.ts` | Registers the filter with a heading lookup through `editorInfoField` and `metadataCache` |
| `src/heading-links.ts` | `HeadingIds`; `renamedSubpath` and `rewriteHeadingLinks` match the id-carrying form, and an alias equal to the old heading follows the rename |
| `src/heading-links.test.ts` | Rename cases for id-carrying links and the alias |
| `src/heading-link-update.ts` | `HeadingRename.ids` filled from the old and new lines and passed to every rewrite |
| `e2e/fixtures/heading-link-alias/` | New fixtures (copies in `vault/tests/mindmap/heading-link-alias/`) |

### Test fixture

`vault/tests/mindmap/heading-link-alias/` (master `e2e/fixtures/heading-link-alias/`): `Alias Galley.md` (headings with ids, one in backticks, one with a colon; the id-less "Plating"; a "Try it here" list with empty bullets, a block link and a hand-typed link) and `Alias Pantry.md` (a cross-note target with an id). The cards carry no seeded schedules.

### Follow-ups

- Markdown-link mode and Obsidian's own heading-rename command are untouched, as noted above.
- The claims that the embedded editors pick up workspace editor extensions, and that `editorInfoField` there returns the owner with a `file`, came from reading the Obsidian 1.15 source (`buildLocalExtensions`, `Sv.init(() => this.owner)`). That the heading cache text includes the `^os-` id is inferred from the suggest's own output; if it does not, the fallback alias still applies but would lose a colon. Sawyer's manual test passed.
