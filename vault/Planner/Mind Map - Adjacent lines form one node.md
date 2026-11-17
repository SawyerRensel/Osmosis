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
status: Done
priority:
progress: 100
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T17:07:56.000Z"
date_start_actual: "2026-11-12T17:07:56.000Z"
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
1. **Run** = maximal sequence of directly adjacent *groupable* lines. Groupable = a line the parser reads as `heading` or `paragraph` (media embeds such as `![[cover.png]]` are paragraphs, so they qualify; so are horizontal rules, `$$` math, HTML and `%%` comment lines), indented or not, except the breakers below. The shared predicate lives in `src/line-groups.ts` (`isGroupableLine`), used by both the parser and the normalizer.
2. **Breakers** (stay exactly as today and end a run): blank lines; list items (bullet, ordered, checkbox, any indent); table rows (any line starting with `|`); `>` quote/callout lines; code fences and everything inside them; note embeds (`![[Note]]` / `![](note.md)`, non-media; they must stay transclusion nodes or the permeable-embed expansion is lost). Two more are kept from the draft because neither conflicts with Sawyer's answers: a **standalone `^id` line** (it is the after-block reference of a code block/table/callout and the normalizer keeps it glued to that block; after prose it stays its own node, as today) and a **comment-only line** `<!-- … -->` (`<!-- osmosis-exclude -->` guards the element *below* it, and "Generate flashcards" looks for it on the line above a node's first line; absorbed into a run it would guard nothing). **Horizontal rules do not break a run.** Front matter is skipped before any of this. A `$$…$$` block written without blank lines becomes one node (improvement); a `%%…%%` run becomes one (invisible) node.
3. **Headings in a run:** a run is ONE node however many headings it contains (Sawyer: "Headings are no different than any other line"; a user who wants two nodes writes the conventional blank line between headings). The run's **first heading** sets the node's type, level and place in the tree; later heading lines are ordinary lines of the group. Lines above the first heading are its cover, lines below it (including later headings) its body. One exception keeps list structure intact: a heading line arriving while a list is open (lines directly after a list item belong to that item, Markdown's lazy continuation) ends the pending run first, because a heading closes the list.
4. **Hierarchy:** a group containing a heading **is** its first heading: `type: "heading"`, its level, its children, pushed on the heading stack. `content` stays that heading's text, so the node ID (`type:depth:content` hash), breadcrumbs, `[[#Heading]]` links, heading link suggest and style keys are unchanged when a cover image is added. Later headings inside the group get no node of their own, so `[[#Later heading]]` has no node to land on in the map (it still works in Obsidian). A group with no heading is a `paragraph` whose `content` is its lines' trimmed text (IDs stripped) joined with `\n`, placed where a paragraph goes today (child of the open list item, else of the heading).
5. **Node shape:** `range` = first line start → last line end; `raw` = the run's lines verbatim, joined with `\n`, with only the *group's* ID stripped. No new node field: a group is "heading/paragraph whose `raw` contains `\n`" (`isLineGroup(node)`). A single-line run produces exactly today's node.
6. **Block ID:** the group's ID is the **last** `^id` found in the run; it belongs on the last line. A single ID on an earlier line (e.g. a caption typed under `## Title ^os-b`) is adopted as the group's ID and moved to the last line the next time the group is written (inline edit, move), never by a background rewrite. **A run with two or more IDs is grouped too** (Sawyer). The last ID is the group's card. The earlier IDs stay in the file, inline on their lines, and in `raw` (so an inline edit round-trips them, never deletes them). While grouped, their cards are not in the parse, so `CardSyncService` drops them from the in-memory card store; their `osmosis-schedule` frontmatter entries are **not** deleted (only browse "delete card" and the study session call `removeSchedule`), so splitting the run again (a blank line) brings each card back with its full review history. Measured count of such runs in the vault: 0.
7. **Rendering (2D + 3D near panel):** `groupDisplayMarkdown(node)` (pure): for a heading group, the lines before the first heading, the heading text (no `#`; the node is already styled as that heading level), and the lines after it, as three blocks separated by blank lines; trailing `^id`s stripped from every line; other lines joined with `\n` as Obsidian joins them (so later headings still render as headings). The image draws above the title. For a paragraph group it is `content`. 3D far-tier plates keep `content` (heading text; a glyph plate can't draw an image); the near panel renders the group and must keep **media** embeds as embeds (today `unembed` turns them into links; change it for media only).
8. **Editor:** inline edit opens the whole `raw` (multi-line), saves over `range`, `restoreEditedLine` already re-appends the ID on the last line. A newline typed inside keeps the group; a blank line typed inside splits it on re-parse (that is the user's explicit gesture). Structural edit ops must stop relying on the normalizer: every splice that puts a groupable line next to another must insert the blank line itself (`insertSibling` after a paragraph already does; heading siblings, moves, drops, indent/outdent, `insertParent`, cross-file moves, 3D `selection-edit`/`appendInsertion`, paste do not).
9. **Normalizer:** `normalizeBlockSpacing` no longer inserts a blank line between two adjacent *top-level* groupable lines, headings included (otherwise every write would split a two-heading run). Everything else (fences, tables, quotes, note embeds, collapse 2+ blanks, list/heading separation, indented lines) is unchanged. `planIdGeneration` uses the group's range, so the ID lands on the run's last line; its "paragraph continues" special case goes away.
10. **Cards:** one group = one line card, ID `notePath#^groupId`. `back` = `groupDisplayMarkdown`; breadcrumb segment = `content` (heading text, not the image); `contextBefore` uses `content`. Reveal: the reveal processor must hide the group's *Osmosis* line span (from the parse) rather than Obsidian's block span, or the heading stays visible while its image is hidden (or vice versa).
11. **Parser cost:** one pending buffer flushed on every breaker; no look-ahead beyond what the table check already does. Benchmark before/after on `Music Theory.md`.

### Build plan (one ~130k session each)
- **Phase 1 – Parser + normalizer + card IDs.** New pure `src/line-groups.ts` (`isLineGroup`, `groupDisplayMarkdown`, breaker predicate shared by parser and normalizer). `parser.ts` (read L39–345): factor the per-line "place node" block into a helper, add the pending-run buffer, heading segmentation, single-ID adoption, multi-ID grandfathering. `markdown-spacing.ts` (whole, 190 lines): rule 9. `card-gen/generate-ids.ts` L60–200: drop the `continues` check. `card-gen/line-cards.ts` (whole): group `back`. Tests: `parser.test.ts` (every rule + breaker + the 24 existing adjacent-heading test strings in 9 files that may now group; fix by adding blank lines where the test is about something else), `markdown-spacing.test.ts`, `generate-ids.test.ts`, `line-cards.test.ts`. Re-measure parse time. Fixture: `e2e/fixtures/mindmap/adjacent-lines.md` → `vault/tests/mindmap/` (cover above/below heading, two headings in a run, every breaker, a hard-wrapped paragraph, a carded group). Without phase 2 the 2D view still shows only the heading text of a heading group, so ship phases 1+2 to Sawyer together.
- **Phase 2 – 2D render + editor + edit ops.** `MindMapView.ts` `getNodeDisplayContent` (grep `getNodeDisplayContent`, ~L8829) → `groupDisplayMarkdown`; node HTML cache key. `mindmap-edit.ts` (`grep -a`): `nodeEditText`/`restoreEditedLine` with multi-line raw, `serializeLine`/`retypeSubtree`/`retypeInFile` for groups (retype a heading group = retype its heading line only), and a `separateRun(text, offset)` helper applied by `insertSibling(Before)`, `moveSiblings`, `moveWithinFile`, `indent/outdentSiblings`, `insertParent`, `edit-moves.ts`. Check the inline editor overlay copes with multi-line text (`editOverlayGeometry`). Tests in `mindmap-edit.test.ts`, `edit-moves.test.ts`.
- **Phase 3 – 3D + reveal + study.** `graph3d/near.ts` (media embeds stay embeds), `graph3d/model.ts` L190–215 (label), `graph3d/selection-edit.ts` + `graph3d/edit.ts` (same `separateRun`), `LineRevealProcessor.ts` L230–260 + `line-reveal.ts` (group span), `SequentialStudyModal.ts` (back renders as Markdown, check image size). Manual pass on phone + desktop.

### Questions for Sawyer (answered 2026-11-12, folded into the rules above)
- Hard-wrapped prose: one node. Two headings in a run: one node, first heading wins (rule 3). Horizontal rules: groupable, not breakers (rule 2). 2+ IDs: grouped, history kept (rule 6). Note embeds: breakers (rule 2). 3D image: near panel only (rule 7).
- `Title` + `---` is a setext heading in Obsidian. Osmosis has never read setext headings; now the two lines form one paragraph group, and its display Markdown renders it the way Obsidian does.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes (session 1)
Session 1 was research and spec only; no code changed. Phase 1 was not started: budget was at the ~70k threshold, and the findings show that phase 1 without phase 2 would show heading groups without their image in 2D, so phases 1 and 2 should go to manual test together. Next session: Phase 1 above.

## Sawyer's answers (grill, 2026-11-12) — override the draft spec where they differ
- **Hard-wrapped prose:** yes, one node (adjacent prose lines group).
- **Two headings in one run:** ONE node for the whole run — "Headings are no different than any other line. A user can follow common Markdown formatting conventions that include a blank line between headings." The first heading in the run sets the node's level/place in the tree. Drop the "split before the 2nd heading" rule.
- **Run breakers:** only **note embeds** `![[Note]]` (permeable embeds) break a run, on top of the decided exceptions (lists, tables, callouts/`>`, code fences) and blank lines. **Horizontal rules do NOT break a run**, and neither does a run with 2+ `^os-` IDs: group it, keep the ID on the last line, and do not lose review history (0 such runs exist in the vault today; schedule entries are not deleted when an ID disappears — document exactly what happens to the earlier IDs). Standalone `^id` lines and comment-only lines (`osmosis-exclude`) — keep as the draft decided unless that conflicts with the above; record why.
- **3D image:** near panel only; far plates show text.

## Batch implementation notes (session 2, Phase 1, not yet testable)
Phase 1 is built and green (code commit `c8c4065`). Phases 2 and 3 are not started, so **status stays In-Progress**: without Phase 2 the 2D map shows a heading group as its heading text only and edit ops can leave runs glued together. Nothing to manually test yet.

### What was built
- **`src/line-groups.ts`** (new, pure): `isGroupableLine` (the shared run predicate, used by the parser *and* the normalizer so they never disagree), `isLineGroup(node)`, `groupDisplayMarkdown(node)`, and `isMediaEmbed` (moved here from the parser so the normalizer can tell a note embed from an image).
- **Parser:** the per-line "create + place node" block became an `emit(parsed, range)` closure; groupable lines go into a pending `run` buffer, flushed on every non-groupable line and at EOF; `mergeRun` builds the group's parse (rules 3–6). A run of one line goes through exactly the old path.
- **Normalizer:** no blank line between two adjacent *top-level* groupable lines, headings included (rule 9). Indented lines keep the old rules.
- **Generate flashcards:** the "paragraph continues" check is gone; a run is one node, tagged on its last line. `STRUCTURAL_LINE_REGEX` stays exported (3D `canStamp` uses it).
- **Line cards:** `back = groupDisplayMarkdown(node)`; breadcrumbs/context still use `content` (heading text).

### Decisions worth remembering
- **Heading inside an open list:** a heading line that arrives while a list is open flushes the pending run first, so lines directly under a list item (lazy continuation) stay that item's child instead of becoming the heading's cover. A heading closes the list in Markdown anyway.
- **Multi-ID runs:** the group's ID is the *last* ID in the run. Only that one is stripped from `raw`; earlier IDs stay inline in `raw` and in the file, so an inline edit (Phase 2) round-trips them. Their cards drop out of the in-memory store while grouped, but their `osmosis-schedule` entries are not deleted, so a blank line that splits the run brings them back with history.
- **Standalone `^id` and comment-only lines still break a run** (rule 2, with reasons). Any line starting with `|` breaks a run too, even without a separator row (the normalizer always treated it as a table line; keeping both in step was more important than grouping a stray pipe line).
- **Normalizer only joins column-0 lines**, so `- item` + indented continuation + `## H` still gets its blank before the heading as before.
- **Edit-op regressions are visible, not hidden:** five existing tests now fail for a real reason that Phases 2/3 fix (an op leaves two groupable lines adjacent and used to rely on the normalizer to split them). They are marked `it.fails` with a "T75 Phase N: flip back to it()" comment, so they start *failing* the moment the op is fixed and force the flip:
  - `mindmap-edit.test.ts`: "re-levels through the real parser when a heading is indented (Alt+Right)" (`indentSiblings`), "parents grandchildren under a sub-heading made from a former child" (`retypeSubtree`/rename). Phase 2.
  - `graph3d/edit.test.ts`: "siblingBefore selects a new empty line directly above the line, at its level", "up, down, indent and outdent keep the line selected where it went". `graph3d/selection-edit.test.ts`: "moves headings and a list line to the end of a note…". Phase 3.

### Tests changed because they assumed one node per line
| Test | Change | Why |
|---|---|---|
| `parser.test.ts`: heading levels 1–6, sibling headings, back-tracking, paragraphs under headings, mixed content, range tracking, findNodeAtPosition, code block under a heading | blank lines added between the lines (range offsets +1) | they test hierarchy/ranges, not grouping; adjacent headings are now one node |
| `markdown-spacing.test.ts`: "separates a soft-wrapped prose run", line-map test | rewritten: a run stays together; line map tested across a spaced-off note embed | rule 9 |
| `generate-ids.test.ts`: soft-wrapped run, two range tests | rewritten: one ID on the run's last line | rule 6/9 |
| `graph3d/edit.test.ts` "refuses … a paragraph line that runs on", `mindmap-style-key.test.ts` "_n: fallback for a paragraph line that runs on" | the run-on is now prose + a comment-only line | two prose lines are one node and *can* take an ID now; prose + comment line is the remaining run-on case |
| `graph3d/transcluded.test.ts` "does not follow an embed outside the part shown" | blank line between `# B` and `## One` | `#One` subpath must find its heading |
| `mindmap-edit.test.ts` "insertSiblingBefore: a paragraph straight under a heading…" | blank line between heading and paragraph | otherwise there is no separate paragraph to insert before |

New tests: `src/line-groups.test.ts`; a "line groups (T75)" block in `parser.test.ts` (every rule and breaker, ID adoption, multi-ID, list/heading case, single-line identity); new cases in `markdown-spacing.test.ts`, `generate-ids.test.ts`, `line-cards.test.ts`.

### Parse time (`vault/tests/graph3d-stress/Music Theory.md`, 3,002 lines)
Old and new parser interleaved in one process (10 × 40 parses each, 3 runs): old 7.10 / 8.18 / 8.59 ms, new 7.51 / 8.50 / 8.42 ms per full parse. Within noise (≈ +2 % on average); the session-1 baseline was 7.2 ms.

### Surface map
| File | Change |
|---|---|
| `src/line-groups.ts` (+ test) | new: run predicate, `isLineGroup`, `groupDisplayMarkdown`, `isMediaEmbed` |
| `src/parser.ts` | `emit` closure, pending run, `mergeRun`; media check delegates to `line-groups` |
| `src/markdown-spacing.ts` | keeps adjacent top-level groupable lines together |
| `src/card-gen/generate-ids.ts` | drop "continues" check |
| `src/card-gen/line-cards.ts` | group `back` |
| tests listed above | see table |
| `e2e/fixtures/adjacent-lines.md` → `vault/tests/mindmap/adjacent-lines.md` | fixture: cover above, caption below, blank-line control, two headings, hard wrap, `***` in a run, every breaker, exclude comment, carded run (`^os-adjl01`), two-ID run (`^os-adjl02`/`03`) |

Note on the fixture: the breaker cases ("Prose right above a list", etc.) are written without blank lines on purpose; the first map write spaces them off, as it always has.

## Batch implementation notes
Session 3 built Phase 2 and the Phase 3 *edit-op* fixes (code commit `bec4e09`). Status is **In-Review** so the 2D side can be tested; the 3D near panel and reading-view reveal are still Phase 3 (see "Next session").

### What was built
- **2D rendering:** `getNodeDisplayContent` ends in `groupDisplayMarkdown(node)`, so a heading group draws its cover image above the title and its caption below. Both node caches key on the display text, so no cache-key change was needed: a group's key differs from its bare heading's.
- **Inline editor:** `nodeEditText` opens every line of `raw`, each with the first line's indentation stripped; `restoreEditedLine` puts the indentation back on every non-blank line and the group's ID on the **last** line. `reattachBlockId` now looks only at the last line, so an ID the user typed there is not doubled. IDs on earlier lines (multi-ID runs) are inside `raw` and round-trip as text. Shift+Enter already gave a new line, and `editOverlayGeometry` already grows with the text, as for code blocks. An unchanged save is byte-identical (tested).
- **Retype:** `retypeSubtree` reads the first line of the edited text, so retyping a group from the editor follows whatever its first line now is. The *placement* fix is the separation below.
- **`separateRuns(text, seams)`** (pure, `src/line-groups.ts`): at each seam (an offset where an edit joined lines that were not adjacent before) that starts a line, it adds a blank line when the line before and the line at the seam are both groupable, and returns an offset mapper. It is applied by `insertChild`, `insertSibling`, `insertSiblingBefore`, `deleteSubtree`, `moveSiblings`, `indentSiblings`, `outdentSiblings`, `insertParent`, `moveWithinFile` and `retypeInFile`. Two new wrappers, `insertBlock` / `cutBlock` (`mindmap-edit.ts`), cover cross-file moves (`edit-moves.ts`) and paste (`node-clipboard.ts`). The 3D selection splice (`graph3d/selection-edit.ts` `splice`) tracks its cut and insert seams and runs it too.
- **3D link append** (`appendInsertion`): a group takes the link text at the end of its last line, before its block ID. Before this fix it was appended after the ID, which would have broken the ID.
- **Tests:** all five T75 `it.fails` are back to `it()`, including the three Phase 3 ones in `graph3d/edit` and `selection-edit`. New tests: `separateRuns` in `line-groups.test.ts`, and a "line groups survive edits (T75)" block in `mindmap-edit.test.ts` (edit text, indentation, byte-identical save, group move, sibling-before, paragraph move, `cutBlock`/`insertBlock`).

### Decisions worth remembering
- **Seams, not a global pass.** Each node is a whole run, so two adjacent groupable lines that belong to *different* nodes can only exist where an edit just put them together. Separating at the edit's own seams can therefore never split a user's run. The alternative, "split any adjacency that wasn't there before", would also have split a moved group's own lines after a re-level changed their text.
- **Only a column-0 seam line is separated.** In Osmosis's parser a blank line ends a list (`- a\n\tp1\n\n\tp2` puts `p2` at the root), so a blank line can't separate two indented continuation lines without re-parenting the second. Two indented paragraphs brought together under one list item by an edit therefore merge into one group. This is rare (it needs a move between list-item continuation paragraphs). Fixing it would need a parser change, so it is left alone.
- **Test expectations that changed:** "structural edits give the bytes…" `down heading Moorings`, `up heading Fuel` and `parent heading Fuel` now carry the blank line the op adds (previously only the normalizer added it). The Phase-1 guessed expectation for "re-levels … Alt+Right" was corrected to the op's real output (a trailing `\n` left by the cut, which the normalizer removes), and the test now also checks the parse. The `retypeSubtree` test helper splices with `separateRuns` the way `retypeInFile` does.
- **Heading-group styling:** the whole node uses the heading's CSS class, so a caption under the title renders at the heading's font size in 2D. Not changed. Look at it in the manual test.

### Surface map (session 3)
| File | Change |
|---|---|
| `src/line-groups.ts` (+ test) | `separateRuns` + `Separated` |
| `src/mindmap-edit.ts` (+ test) | multi-line `nodeEditText`/`restoreEditedLine`, last-line `reattachBlockId`; `insertBlock`, `cutBlock`, `separated`; seams in every structural op and `retypeInFile` |
| `src/views/MindMapView.ts` | `getNodeDisplayContent` → `groupDisplayMarkdown` |
| `src/edit-moves.ts` | cross-file move uses `insertBlock` / `cutBlock` |
| `src/node-clipboard.ts` | paste uses `insertBlock` |
| `src/graph3d/selection-edit.ts` (+ test) | `splice` separates its seams |
| `src/graph3d/edit.ts` (+ test) | `appendInsertion` on a group's last line |

### Manual retest (2D, desktop and phone)
Fixture: `vault/tests/mindmap/adjacent-lines.md`. **Reload Obsidian (Ctrl+R) first.** Open the note's mind map.
1. **Cover above a heading:** "Rigging" is one node with the image drawn *above* the title, and "Check the halyard" / "Coil the sheets" are its children.
2. **Caption below:** "Mooring" is one node, with the sentence under the title.
3. **Blank line control:** the image and "Anchoring" are two nodes.
4. **Two headings in one run:** "Tides" is one node showing "Spring and neap" and the sentence below it. "Spring and neap" has no node of its own.
5. **Hard wrap / rule:** the reach paragraph is one node, and "Above the rule / *** / Below the rule" is one node.
6. **Breakers:** each "Prose right above …" is its own node, apart from the list, table, callout, code block and note embed. The guarded run under `osmosis-exclude` is one node.
7. **Inline edit:** double-click "Rigging". The editor shows both lines (`![[…]]` then `### Rigging`). Press Shift+Enter at the end, type a caption, then press Enter. The node now shows image, title and caption, and the source has the three lines with no blank line between them. Double-click "A carded run" and save without changes: the source is unchanged and `^os-adjl01` is still on the last line. Edit its first line and save: `^os-adjl01` stays at the end of the last line.
8. **Edit ops keep nodes apart:** select "Mooring" (a heading group) and press Alt+Up / Alt+Down. It moves as one block, a blank line stays on each side, and no node merges with its new neighbour. With "Rigging" selected, press Shift+Enter (sibling before): the new empty heading is its own node above it. Drag "Anchoring" under another section, then indent/outdent a heading with Alt+Right/Left. The node count stays right and no two nodes merge.
9. **Cards:** "A carded run" still studies as one card. After all the above, check `osmosis-schedule` in the frontmatter: `os-adjl01`, `02` and `03` are all still present.

Undo with Ctrl+Z, or restore the fixture from `e2e/fixtures/adjacent-lines.md` (and reload) when done.

## Batch implementation notes, Phase 3
Session 4 built Phase 3 (code commit `27922ad`). All three phases are built, so status is **In-Review** at progress 100.

### What was built
- **3D near panel** (`src/graph3d/near.ts`): a line group (`isLineGroup`) renders its lines with every trailing `^id` stripped. A heading group renders as three blocks: the lines above the heading, the heading line (with its `#` kept, as every panel keeps markers), and the lines below. So the cover image draws above the title, as in 2D. In a group, image, audio and video embeds stay embeds; note embeds and PDFs still become links. The panel size estimate (`IMAGE`) now counts a kept `![[…]]` embed as a media row, so spacing reserves room for the image.
- **Reading-view reveal**: `lineGroupSpans(markdown, path)` (pure, `src/study/line-reveal.ts`) parses the note and returns each carded group's line span. `withGroupSpans` puts that span in place of Obsidian's block span. `LineRevealProcessor` parses `getSectionInfo().text` once per render (cached by note and text, not once per section). The section that holds the ID line stays the tracked line, with the placeholder and the rating bubble. Every other section of the group (for example the cover image over its heading, or the heading over its caption) is a "group part": its content is wrapped in `.osmosis-line-back`, and it hides while the card is unrevealed. Parts that an edit moved out of the span are pruned when the primary section re-renders.
- **Study:** I checked this and changed no code. `SequentialStudyModal` renders `card.back` through `MarkdownRenderer` with the note as the source path, so `![[cover.png]]` resolves. `.osmosis-study-card img` is capped at `max-width: 100%; max-height: 50vh`. The title shows as plain bold-less text on the back (the `#` is stripped by `groupDisplayMarkdown`), the same as a single heading card's back.

### Decisions worth remembering
- **Only groups keep media embeds in the near panel.** A single-line `![[image.png]]` node is still a link, as before: the image is its own attachment node, and showing it twice was the reason `unembed` exists. For a group, the image is the point (a cover), so it shows in the panel *and* stays an attachment node. Far plates are text only (Sawyer's call). `graph3d/model.ts` is unchanged: a heading group's label is its heading text.
- **The panel keeps `#` on a heading group's heading**, unlike 2D's `groupDisplayMarkdown`. The 2D node is already styled at its level, but a panel styles nothing itself.
- **The group span comes from Osmosis's parse, not the metadata cache.** Only carded *groups* get a parsed span. Single lines, code blocks and tables keep Obsidian's block span, so a standalone `^id` after a code block works as before. The placeholder sits in the section holding the ID (the last line), so for cover + heading it replaces the heading and the image disappears.
- **Group parts hide on `hidden` only**, never on the occlusion "painted" state, so an occluded line in a group shows its other sections once revealed.

### Surface map (session 4)
| File | Change |
|---|---|
| `src/graph3d/near.ts` (+ test) | group Markdown, media embeds kept in groups, embed counted in `IMAGE` |
| `src/study/line-reveal.ts` (+ test) | `lineGroupSpans`, `withGroupSpans` |
| `src/views/LineRevealProcessor.ts` | per-render group spans, `groupParts`, `trackGroupPart`, `pruneGroupParts`, parts toggled in `applyAll` |
| `e2e/fixtures/adjacent-lines.md` → `vault/tests/mindmap/adjacent-lines.md` | new section "Carded heading groups": cover + `### Reefing ^os-adjl04`, `### Trimming` + caption `^os-adjl05` |

### Not verified
I cannot see Obsidian. Not checked: how the near panel looks on a phone (`camera.fov` differs there, but panel content does not depend on it), and whether Obsidian ever renders a group's lines as one section (then there are no parts and the section is simply the primary).

### Manual retest (3D, reveal, study), desktop and phone
Fixture: `vault/tests/mindmap/adjacent-lines.md`, which was updated. **Reload Obsidian (Ctrl+R) first.**
10. **3D near panel:** open the note's 3D graph and fly close to "Rigging". Its panel shows the cover image *above* the "Rigging" heading. Far away, the plate shows only "Rigging". "Mooring" shows its heading with the sentence below it. "Reefing" shows the image above the title, with no `^os-adjl04` text.
11. **3D edit ops:** in 3D, select "Mooring". Insert a sibling before it, move it with Alt+Up/Down, select some lines and move them to the end of the note, and add a link to a group. After each step, nodes stay separate (a blank line between them), and the link text lands before `^os-adjl0x`, never after it.
12. **Reading-view reveal:** switch the note to reading view and click Peek (dashed eye). For "Reefing", the image *and* the heading are hidden, and one placeholder sits where the heading was. For "Trimming", both the heading and the caption are hidden. Click the placeholder: both lines come back together. "A carded run" hides both of its lines. Then try Study (graduation cap): reveal top-down and rate each card. The group reveals as one unit.
13. **Study modal:** study the note's deck in the sequential modal. Flip the "Reefing" card: the back shows the image (no larger than half the screen height, inside the card) and "Reefing" below it. Flip "Trimming": the back shows "Trimming" and the caption.

Restore the fixture from `e2e/fixtures/adjacent-lines.md` (and reload) when done.
