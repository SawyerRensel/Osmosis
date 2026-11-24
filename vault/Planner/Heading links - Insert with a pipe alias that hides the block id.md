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
status: To-Do
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
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
