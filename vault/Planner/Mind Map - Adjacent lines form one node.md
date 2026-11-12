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
status: In-Progress
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-12T17:00:00.000Z"
date_start_scheduled: "2026-11-12T17:07:56.000Z"
date_start_actual: "2026-11-12T17:07:56.000Z"
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

## Spec (session 1, 2026-11-12)

### What the code does today (findings)
- **The parser is strictly one line = one node.** `OsmosisParser.buildTree` (`src/parser.ts` ~L39–345) emits a node per non-blank line; only code fences, tables (`|` + separator row) and `>` runs accumulate into one node. Two adjacent prose lines are two `paragraph` nodes today. (The batch brief's "adjacent lines already parse as one paragraph" is true of *Obsidian*, not of Osmosis.)
- **Every mind-map save splits runs apart.** `writeMarkdown` / `writeTranscludedMarkdown` / `writeFileTracked` (`MindMapView.ts` ~L7787, 7816, 7887) call `normalizeBlockSpacing` (`src/markdown-spacing.ts`), which puts a blank line around every heading and between adjacent top-level paragraphs. "Generate flashcards from note" (`planIdGeneration`, `src/card-gen/generate-ids.ts`) runs the same normalizer first. That is why the vault has so few runs, and why the feature cannot ship without changing it: today the first map edit anywhere in a note dissolves every group in it.
- **Block IDs:** inline `text ^os-x` on single-line nodes, a standalone `^os-x` line after code/table/quote (`blockIdLineEnd`). Line cards are `notePath#^blockId` (`src/card-gen/line-cards.ts`); schedules live in frontmatter `osmosis-schedule` keyed by block ID (`src/store/ScheduleStore.ts`). A card whose ID disappears from the parse is dropped from the store by `CardSyncService` (~L165), but its frontmatter schedule entry is **not** deleted (only `browse/mutate.ts` and `StudySessionManager` call `removeSchedule`), so an ID that comes back gets its history back.
- **Rendering:** 2D draws `getNodeDisplayContent(node)` → `node.content` through `MarkdownRenderer` (`MindMapView.ts` ~L8829, 9284); heading size comes from the node's CSS class. 3D plates use `label: child.content` (`src/graph3d/model.ts` L202); near panels render `node.source.raw` through `unembed`, which turns *every* `![[…]]` (media too) into a link (`src/graph3d/near.ts` L48, 69).
- **Editor:** inline edit opens `nodeEditText(node)` = `raw` minus indent and works on `range`; `restoreEditedLine` re-appends ` ^id` at the very end of the text, i.e. on the last line (`src/mindmap-edit.ts` L103–149).
- **Reading-view reveal** hides Obsidian's metadata-cache block span for each line-card ID (`src/study/line-reveal.ts`, `LineRevealProcessor.ts` L246). Obsidian always makes a heading its own block, so for `## Title` + `![[cover.png]] ^os-x` its block covers only the image line.

### Measurements
- **Review history at risk: zero.** Script over all 245 notes in `vault/` (excl. `Planner/`, `templates/`, `.obsidian/`) with the run rules below: 26 notes have runs, 130 runs (129 segments of ≥2 lines after heading-splitting); **0 segments carry more than one `^os-` ID, 0 carry a single ID on a non-last line**. 239 `^os-` IDs in 53 notes, all safe. `e2e/fixtures/` (226 notes): same, 0 at risk. The two runs that carry an ID already have it on the last line (`tests/flashcard/generate-flashcards-test.md` was built that way on purpose).
- **Parser baseline:** largest fixtures `vault/tests/graph3d-stress/Music Theory.md` / `Telescopes.md` (3,002 lines, 116 KB): **7.2 / 7.1 ms per full parse** (vitest, 200 iterations after warm-up). Phase 1 must stay within noise of this; grouping is a single pass buffer, O(lines).

### Rules
1. **Run** = maximal sequence of directly adjacent *groupable* lines. Groupable = a line the parser reads as `heading` or `paragraph` (media embeds such as `![[cover.png]]` are paragraphs, so they qualify), indented or not, except the breakers below.
2. **Breakers** (stay exactly as today and end a run): blank lines; list items (bullet, ordered, checkbox, any indent); table rows; `>` quote/callout lines; code fences and everything inside them; note embeds (`![[Note]]` / `![](note.md)`, non-media; they must stay transclusion nodes or the permeable-embed expansion is lost); a standalone `^id` line; a line that is only an HTML comment (keeps `<!-- osmosis-exclude -->` guarding the element below it); horizontal rules (`---`, `***`, `___`). Front matter is skipped before any of this. Math (`$$`), HTML and `%%` comment lines are ordinary groupable lines, so a `$$…$$` block written without blank lines finally becomes one node (improvement), and a `%%…%%` run becomes one (invisible) node instead of several.
3. **Two headings in one run → split before every heading after the first.** Lines before the run's first heading belong to that heading's group (cover image above); lines after a heading belong to it until the next heading (caption below). So `![[c.png]]` / `# A` / `text` / `## B` / `more` → groups `[c.png, # A, text]` and `[## B, more]`. Reason: a node has one place in the tree and Obsidian sees two headings; first-heading-wins would swallow a heading and its subtree.
4. **Hierarchy:** a group containing a heading **is** that heading: `type: "heading"`, its level, its children, pushed on the heading stack. `content` stays the heading's text, so the node ID (`type:depth:content` hash), breadcrumbs, `[[#Heading]]` links, heading link suggest and style keys are unchanged when a cover image is added. A group with no heading is a `paragraph` whose `content` is its lines' trimmed text joined with `\n`, placed where a paragraph goes today (child of the open list item, else of the heading).
5. **Node shape:** `range` = first line start → last line end; `raw` = the run's lines verbatim, joined with `\n`, ID stripped. No new node field: a group is "heading/paragraph whose `raw` contains `\n`" (`isLineGroup(node)` helper). A single-line run produces exactly today's node.
6. **Block ID:** the group's ID is the one `^os-` (or any `^id`) found on any of its lines; it is written on the **last** line. A single ID on an earlier line (e.g. user typed a caption under `## Title ^os-b`) is still adopted as the group's ID and is moved to the last line the next time the group is written (inline edit, move, generate-IDs), never by a background rewrite. **A segment with two or more IDs is not grouped** (grandfathered: its lines stay separate nodes/cards, exactly as today), so no review history can be lost; measured count is 0, and the user can merge by deleting an ID.
7. **Rendering (2D + 3D near panel):** `groupDisplayMarkdown(node)` (pure): lines before the heading, the heading text (no `#`; the node is already styled as that heading level), lines after it, as three blocks separated by blank lines; consecutive non-heading lines joined with `\n` as Obsidian joins them. So the image draws above the title. 3D far-tier plates keep `content` (heading text; a glyph plate can't draw an image); the near panel renders the group and must keep **media** embeds as embeds (today `unembed` turns them into links; change it for media only).
8. **Editor:** inline edit opens the whole `raw` (multi-line), saves over `range`, `restoreEditedLine` already re-appends the ID on the last line. A newline typed inside keeps the group; a blank line typed inside splits it on re-parse (that is the user's explicit gesture). Structural edit ops must stop relying on the normalizer: every splice that puts a groupable line next to another must insert the blank line itself (`insertSibling` after a paragraph already does; heading siblings, moves, drops, indent/outdent, `insertParent`, cross-file moves, 3D `selection-edit`/`appendInsertion`, paste do not).
9. **Normalizer:** `normalizeBlockSpacing` stops inserting blank lines *between two groupable lines* unless both are headings (heading after heading still gets its blank, harmless). Everything else (fences, tables, quotes, collapse 2+ blanks, list/heading separation) unchanged. `planIdGeneration` uses the group's range, so the ID lands on the run's last line; its "paragraph continues" special case goes away.
10. **Cards:** one group = one line card, ID `notePath#^lastLineId`. `back` = `groupDisplayMarkdown`; breadcrumb segment = `content` (heading text, not the image); `contextBefore` uses `content`. Reveal: the reveal processor must hide the group's *Osmosis* line span (from the parse) rather than Obsidian's block span, or the heading stays visible while its image is hidden (or vice versa).
11. **Parser cost:** one pending buffer flushed on every breaker; no look-ahead beyond what the table check already does. Benchmark before/after on `Music Theory.md`.

### Build plan (one ~130k session each)
- **Phase 1 – Parser + normalizer + card IDs.** New pure `src/line-groups.ts` (`isLineGroup`, `groupDisplayMarkdown`, breaker predicate shared by parser and normalizer). `parser.ts` (read L39–345): factor the per-line "place node" block into a helper, add the pending-run buffer, heading segmentation, single-ID adoption, multi-ID grandfathering. `markdown-spacing.ts` (whole, 190 lines): rule 9. `card-gen/generate-ids.ts` L60–200: drop the `continues` check. `card-gen/line-cards.ts` (whole): group `back`. Tests: `parser.test.ts` (every rule + breaker + the 24 existing adjacent-heading test strings in 9 files that may now group; fix by adding blank lines where the test is about something else), `markdown-spacing.test.ts`, `generate-ids.test.ts`, `line-cards.test.ts`. Re-measure parse time. Fixture: `e2e/fixtures/mindmap/adjacent-lines.md` → `vault/tests/mindmap/` (cover above/below heading, two headings in a run, every breaker, a hard-wrapped paragraph, a carded group). Without phase 2 the 2D view still shows only the heading text of a heading group, so ship phases 1+2 to Sawyer together.
- **Phase 2 – 2D render + editor + edit ops.** `MindMapView.ts` `getNodeDisplayContent` (grep `getNodeDisplayContent`, ~L8829) → `groupDisplayMarkdown`; node HTML cache key. `mindmap-edit.ts` (`grep -a`): `nodeEditText`/`restoreEditedLine` with multi-line raw, `serializeLine`/`retypeSubtree`/`retypeInFile` for groups (retype a heading group = retype its heading line only), and a `separateRun(text, offset)` helper applied by `insertSibling(Before)`, `moveSiblings`, `moveWithinFile`, `indent/outdentSiblings`, `insertParent`, `edit-moves.ts`. Check the inline editor overlay copes with multi-line text (`editOverlayGeometry`). Tests in `mindmap-edit.test.ts`, `edit-moves.test.ts`.
- **Phase 3 – 3D + reveal + study.** `graph3d/near.ts` (media embeds stay embeds), `graph3d/model.ts` L190–215 (label), `graph3d/selection-edit.ts` + `graph3d/edit.ts` (same `separateRun`), `LineRevealProcessor.ts` L230–260 + `line-reveal.ts` (group span), `SequentialStudyModal.ts` (back renders as Markdown, check image size). Manual pass on phone + desktop.

### Questions for Sawyer
- **Decided by me (change if you disagree):** split a run before its second heading (rule 3); lines above the first heading join it as cover, lines below join the heading above; `---` and comment-only lines break a run; note embeds break a run; a segment carrying two or more card IDs stays ungrouped rather than dropping a card's history (none exist in the vault today); a single ID on a non-last line is adopted and moved to the last line on the next write.
- **Hard-wrapped prose changes shape:** notes such as `tests/mindmap/ios-node-ghosting.md` wrap one paragraph over several lines; today each wrapped line is a node, after this they become one node (matching Obsidian). Intended?
- **`Title` + `---`** is a setext heading in Obsidian. Osmosis has never read setext headings; with `---` as a breaker this stays as today (two nodes). OK?
- **Should a group with an image show the image on the far-tier 3D plate?** Spec says no (plates are text glyphs; the near panel shows it).

## Batch implementation notes (session 1)
Session 1 was research and spec only; no code changed. Phase 1 was not started: budget was at the ~70k threshold, and the findings show that phase 1 without phase 2 would show heading groups without their image in 2D, so phases 1 and 2 should go to manual test together. Next session: Phase 1 above.

## Sawyer's answers (grill, 2026-11-12) — override the draft spec where they differ
- **Hard-wrapped prose:** yes, one node (adjacent prose lines group).
- **Two headings in one run:** ONE node for the whole run — "Headings are no different than any other line. A user can follow common Markdown formatting conventions that include a blank line between headings." The first heading in the run sets the node's level/place in the tree. Drop the "split before the 2nd heading" rule.
- **Run breakers:** only **note embeds** `![[Note]]` (permeable embeds) break a run, on top of the decided exceptions (lists, tables, callouts/`>`, code fences) and blank lines. **Horizontal rules do NOT break a run**, and neither does a run with 2+ `^os-` IDs: group it, keep the ID on the last line, and do not lose review history (0 such runs exist in the vault today; schedule entries are not deleted when an ID disappears — document exactly what happens to the earlier IDs). Standalone `^id` lines and comment-only lines (`osmosis-exclude`) — keep as the draft decided unless that conflicts with the above; record why.
- **3D image:** near panel only; far plates show text.
