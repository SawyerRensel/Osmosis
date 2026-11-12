---
title: "Links - Use an arrow label instead of a footnote-like marker"
summary: "Node links are written with the label `-->` instead of `^N`, so Markdown-link vaults no longer render them as footnotes."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Toolbar - Add link button for touch]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-12T17:00:00.000Z"
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

# Links - Use an arrow label instead of a footnote-like marker (T70)

## Request (Sawyer, 2026-11-12, verbatim)
> Our syntax for linking is rendering in Note view as a footnote instead of a link (e.g. `[^1](#^os-wqejwk)`). Let's just use plain arrows instead, like this: `[-->](#^os-wqejwk)`

## Decided (grill, 2026-11-12)
- New links use the label `-->` in both forms: wikilinks `[[Note#^id|-->]]`, Markdown links `[-->](#^id)` / `[-->](Note.md#^id)` (whichever form the vault's link setting produces today).
- **No migration and no back-compat for `^N`**: the plugin is unreleased and only Sawyer's test notes have `^N` links. Drop the numbering (`nextLinkMarker`/`linkMarker` in `src/graph3d/links.ts:186-205`) rather than keep both, unless something else depends on it; record what you remove.

## Surface map (start here)
- Writers: `src/graph3d/edit.ts`, `planSelectionLink` in `src/graph3d/selection-edit.ts` (shared by 2D and 3D), 2D `linkNodes` (MindMapView, grep -a), T65's `src/link-pick.ts`.
- Readers that recognise our links: 2D's `^N` display, 3D link lines and hints, `textLinks` in `src/graph3d/links.ts` (the ⋮ "Open link" items). Check every regex that matches `\^\d+` labels. Make sure `-->` renders sensibly in the 2D node text and 3D plates (it's plain text, not an HTML comment end in a Markdown render context — verify the Markdown renderer doesn't mangle `-->` inside link text).
- Tests: update `links.test.ts`, `edit.test.ts`, `selection-edit.test.ts` and any fixture under `e2e/fixtures/` that contains `^N` links.

## Acceptance criteria
- Linking two nodes (2D drag/Alt-drag, 3D, toolbar Add link) writes `-->` labels; Note view (reading and live preview) shows a normal link, not a footnote, in a Markdown-link vault and a wikilink vault.
- 2D, 3D lines/hints and ⋮ Open link still recognise new links.

## Context budget
Under ~130k. links.ts, edit.ts, selection-edit.ts, link-pick.ts by range; MindMapView.ts grep -a only.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.
