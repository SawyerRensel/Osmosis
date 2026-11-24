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
status: In-Review
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
date_start_scheduled: 2026-11-24T00:51:04.000Z
date_start_actual: 2026-11-24T00:51:04.000Z
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

## Batch implementation notes (awaiting manual test)

Code commit: `0a96df8` on `batch/15-plates-study-polish`.

### Approach
Obsidian's link suggest (`selectSuggestion` in `ref/obsidian-core/app.js`) builds the link with `AH(...)`. For a heading pick it writes the subpath as `"#" + zi(heading)`, where `zi` turns `: # | ^ \ %% [[ ]]` into spaces. The id therefore shows up as ` os-xxxxxx`, and no alias is added unless the text after the cursor already held one. The link goes in through `editor.transaction(..., "input.autocomplete")`.

So the hook is a CM6 `EditorState.transactionFilter` (`headingLinkAliasFilter` in `src/heading-link-alias.ts`) registered once with `registerEditorExtension` in `main.ts`. Obsidian appends `workspace.editorExtensions` in its base markdown editor's extensions, which the mind map and Cosmos `EmbeddableMarkdownEditor` inherit, so the single registration covers all three editors. The filter only acts on an `input.autocomplete` transaction with exactly one change whose inserted text is a whole `[[target]]` with no `|`, whose last `#` segment ends in ` os-…`. It appends `|alias` in the same transaction, so the pick and the alias undo as one step. The target is left exactly as Obsidian wrote it, and Obsidian resolves it to the heading by normalised comparison.

The alias is the target heading's cached text (`metadataCache.getFileCache(dest).headings`, resolved from `editorInfoField.file`) with the trailing id stripped. That keeps the characters `zi` dropped, so the alias of "Step 1: sweat ^os-…" reads "Step 1: sweat", colon included. If the cache cannot be reached, the alias falls back to the subpath minus its id.

Rename: in the Osmosis node editors, `planHeadingRename` compared links against the heading with the id stripped. A link that carried the id (`[[#Old os-x]]`, which is what the suggest has always written) therefore never matched, aliased or not. `HeadingRename` now carries the old and new block ids, `rewriteHeadingLinks` also matches `Old os-x` and writes `New os-x`, and a wikilink alias that equals the old heading text exactly becomes the new text.

### Decisions
- **Transaction filter rather than wrapping `selectSuggestion`.** It uses public CM6 and Obsidian API (`editorInfoField`, `registerEditorExtension`, the `input.autocomplete` user event) rather than reaching into `workspace.editorSuggest.suggests`. It only ever sees text the suggest has just inserted, so links typed by hand and links already in the vault cannot be touched.
- **The alias comes from the heading cache, not the subpath,** so punctuation survives (see above).
- **Only `^os-` ids are aliased**, as the ticket says. A heading with a foreign id (`^my-id`), or one whose text merely ends in "os-abc123" with no caret, gets no alias.
- **Embeds (`![[#H os-x]]`) are skipped,** because an alias does not change how a section embed renders.
- **Tab pick:** Obsidian leaves the cursor before `]]`. The filter then selects the alias so it can be typed over, which is what Obsidian does for a link that already has an alias. Enter or click leaves the cursor after `]]`.
- **Markdown-link mode is not handled.** With "Use [[Wikilinks]]" off, the suggest writes `[text ^os-x](#…)`. That is not a pipe link and is out of the settled scope.
- **The alias follows a rename only when it equals the old heading text exactly,** so hand-written display text is kept. This applies only to renames in Osmosis node editors. Obsidian's own "Rename heading" command keeps aliases as they are, which is Obsidian's behaviour and is not changed here.

### Surface map
| File | Change |
|---|---|
| `src/heading-link-alias.ts` | New. `aliasHeadingLink` (pure link → aliased link) and `headingLinkAliasFilter` (the CM6 transaction filter) |
| `src/heading-link-alias.test.ts` | New. Pure cases plus the filter driven through a real `EditorState` (Enter and Tab cursor placement, typed input, embeds, id-less headings) |
| `src/main.ts` | Registers the filter with a heading lookup through `editorInfoField` and `metadataCache` |
| `src/heading-links.ts` | `HeadingIds`. `renamedSubpath` and `rewriteHeadingLinks` match the id-carrying form, and an alias equal to the old heading follows the rename |
| `src/heading-links.test.ts` | Rename cases for id-carrying links and the alias |
| `src/heading-link-update.ts` | `HeadingRename.ids` is filled from the old and new lines and passed to every rewrite |

### Fixture
`e2e/fixtures/heading-link-alias/` is the master copy, copied to `vault/tests/mindmap/heading-link-alias/`. It has two notes:
- `Alias Galley.md`: headings with ids (one in backticks, one with a colon), the heading "Plating" with no id, and a "Try it here" list with empty bullets, a block link and a typed-by-hand link.
- `Alias Pantry.md`: a cross-note target heading with an id.

The cards are new and carry no seeded schedules, so no dates needed back-dating.

### Test steps
1. Reload Obsidian (Ctrl+R), then open `tests/mindmap/heading-link-alias/Alias Galley.md`.
2. **Note editor.** On "Same note:", type `[[#` and pick "`defer` the garnish". Expect ``[[#`defer` the garnish os-t115aa|`defer` the garnish]]`` with the cursor after `]]`. Pick "Step 1: sweat the onions" and expect the alias `Step 1: sweat the onions`, colon included. Pick "Plating" and expect `[[#Plating]]` with no alias. On "Other note:", type `[[Alias Pantry#` and pick "Dry goods…". Expect `[[Alias Pantry#Dry goods rice and lentils os-t115cc|Dry goods: rice and lentils]]`. Also try Tab instead of Enter: the alias should end up selected.
3. In reading or Live Preview, each link should show only the heading text. Clicking it should land on the heading.
4. The block link and the typed-by-hand link must be unchanged.
5. **Mind map and Cosmos.** Open the note as a mind map, edit a "Try it here" bullet node, and repeat step 2. Do the same in a Cosmos edit box.
6. **Rename.** With Settings, then Files and links, then "Automatically update internal links" on, edit the "`defer` the garnish" heading node in the mind map and rename it to "`defer` the herbs". The aliased link should become ``[[#`defer` the herbs os-t115aa|`defer` the herbs]]``, and a Notice should report the update.

### Not verified
- Nothing was tested in Obsidian. The claims that the embedded editors pick up workspace editor extensions and that `editorInfoField` there returns the owner with `file` come from reading the Obsidian 1.15 source (`buildLocalExtensions` and `Sv.init(() => this.owner)`), not from a run.
- That the heading cache text includes the `^os-` id is inferred from the suggest's own output (`zi(heading)` contained `os-…`). If it does not, the fallback alias (the subpath minus the id) still applies, but it would lose a colon.
- A heading rename made in Obsidian's own editor or through its "Rename heading" command is Obsidian's code and keeps the old alias.
