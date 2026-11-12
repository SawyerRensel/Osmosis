---
title: "Mind Map - Adjacent lines form one node"
summary: "Any run of two or more directly adjacent lines (no blank line between) becomes one node and one line card in 2D/3D, like code blocks and callouts already do. Lists, tables, callouts and code fences are exceptions. Research + spec + build."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Support indented callouts and blocks in mind map view and note view]]"
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

# Mind Map - Adjacent lines form one node (T75)

## Request (Sawyer, 2026-11-12, verbatim)
> What if any two or more lines directly adjacent to each other (no line break) were considered one node in 2d/3d mind map views? … I often want to have an image as a cover for a title of a heading, but … I have to add that image link on the same line, which … forces the image to render beside the title. If I could have it directly above or below the heading I could control that image's placement relative to the heading. I imagine there would be exceptions to this rule, such as lists. Do you think this could work?

## Decided (grill, 2026-11-12)
- **Any** run of two or more directly adjacent lines becomes one node, with the `^os-…` block ID on the **last** line of the run — the same model code blocks and callouts already use for styling and studying the block.
- **Headings are lines like any other.** Obsidian still renders a heading as a heading with a line directly above or below it; Osmosis only *groups* them for nodes and line cards. So `![[cover.png]]` directly above `## Title` forms one node with it.
- **Exceptions** (stay as they are today, don't absorb neighbours): list items, tables, callouts, code fences.
- Scope this run: research + spec + build.

## Open questions the spec must answer (write them down, decide, record why)
1. **Hierarchy:** a group containing a heading — Sawyer: "a heading is a line like any other line". Working assumption: the group takes the heading's place in the tree (its level, its children), since Obsidian still sees a heading. A group with two headings? Decide (likely: split before the second heading, or the first heading wins) and record.
2. **Node text / rendering** in 2D and 3D plates: render the group's lines as Markdown in order (image above title shows above).
3. **Node editor:** editing a group edits all its lines; the block ID stays on the last line; adding a line inside keeps the group.
4. **Block IDs and existing notes:** notes that today have one `^os-` ID per line in an adjacent run — what happens on first load (sync stamps IDs: memory "vault is live in Obsidian")? Does the grouping orphan IDs/cards on the earlier lines (scheduling history!)? Migration rule must not lose review history; quantify on the test vault how many notes would be affected.
5. **Line cards / line-reveal flashcards:** one group = one card; how reveal works for a group.
6. **Parser cost and embeds:** `src/parser`, the permeable embed boundaries memory; measure parse time on a large note before/after.
7. Interaction with front matter, embeds (`![[note]]` transclusion lines), HTML blocks, horizontal rules, math blocks — which break a run.

## Plan
- Session 1 (Opus): research the parser and card model, write the spec into this note ("Spec" section) with the answers above and a phased build plan sized to ~130k per session. If the build fits in the remainder of the session, start phase 1; otherwise stop after the spec with the note at In-Progress and say what's next.
- Later sessions: one per phase.

## Acceptance criteria (feature)
- In 2D and 3D, `![[cover.png]]` directly above `## Title` shows as one node with the image above the title; a blank line between them gives two nodes as today.
- Lists, tables, callouts, code fences behave as today.
- No review history lost on existing notes.
- Parser unit tests for every grouping rule and exception; perf benchmark not regressed beyond noise.

## Context budget
Under ~130k per session. `src/parser` by range; card/sync modules by grep; never MindMapView.ts whole.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.
