---
title: Study all Osmosis flashcards in all modes
summary: Study and peek buttons  in Note view currently don't even show up unless there are line cards.  We need to make sure you can study any kind of flashcard in every view - in sequential, spatial, and contextual modes - and get the same experience.
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: In-Progress
priority:
progress_current:
progress_total:
date_created: "2026-08-03T15:38:58.397Z"
date_modified: "2026-08-13T11:32:06.000Z"
date_start_scheduled: "2026-08-13T02:42:45.000Z"
date_start_actual: "2026-08-13T02:42:45.000Z"
date_end_scheduled:
date_end_actual:
all_day: true
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
---

# Feature Request

## What do you need built?

Every card type must be studiable in all three modes — sequential, spatial,
contextual — and be asked **the same questions** in each. Today only sequential
plays the full deck correctly.

| Card type | Sequential | Spatial (map) | Contextual (note) |
|---|---|---|---|
| `explicit` (basic) | ✅ | ✅ | ✅ *(phase 1)* |
| `explicit_bidi` | ✅ both directions | ✅ both directions *(phase 4)* | ✅ both directions *(phase 3)* |
| `explicit_cloze` | ✅ one card per `cN` | ✅ one card per `cN` *(phase 4)* | ✅ one card per `cN` *(phase 3)* |
| `code_cloze` | ✅ one card per `cN` | ✅ *(phase 4, unverified — no fixture yet)* | ✅ *(phase 3, unverified — no fixture yet)* |
| `occlusion` | ✅ | ✅ per group | ✅ per group |
| `line` | ✅ | ✅ | ✅ |

`code_cloze` rides the same path every other fence type now takes — the note
plays whatever cards the store holds for a fence, and the generator fans a code
cloze out per `cN` exactly as it does a text one — so it is expected to work and
has simply never been put in front of a reader. Phase 5 is where that is proven.

Occlusion is the only non-trivial type that works everywhere, because per-group
stepping was built for it in both surfaces (`occlusion-steps.ts`,
`spatialStudyKeys`). Nothing else ever got the equivalent.

## What problem does this solve?

### Cause 1 — contextual re-derives instead of playing the store

`ContextualStudyProcessor` parses the fence source and builds its own front/back
(`buildClozeFrontBack`, `buildCodeClozeFrontBack`, `buildInlineClozeFrontBack`).
`SequentialStudyModal` instead plays `Card` records, which already carry
generator-rendered `front`/`back` (`database/types.ts`). Two renderers, and they
disagree:

- The generator mints **one card per cloze group** (`<fenceId>-c1`, `-c2`, …,
  `card-gen/explicit.ts`). Contextual blanks every group at once and calls that
  one question.
- Contextual mints its own ID — `extractIdFromSource(source) ?? hashContent("cloze|||…")`
  — which for a multi-cloze fence is the bare fence ID, never `<fenceId>-cN`. So
  `recordRating` hits its `Card not in store — skip rating` early return and
  **cloze reviews in Note view are silently discarded.** This is a live data
  bug, not just a UX gap.
- A bidi fence's reverse card (`<fenceId>-r`) is never rendered, so it can only
  ever be answered in sequential.

### Cause 2 — both in-place surfaces gate on the wrong signal

- `LineRevealProcessor.updateHeaderActions` computes
  `show = lineCardBlockIds(path).size > 0`. A note whose cards are all fences
  gets **no Study/Peek buttons at all** — e.g.
  `tests/flashcard/deck-hierarchy/Data Science/Visualization/chart-types.md`,
  which has two scheduled basic fences and `osmosis-cards: true`. This is the
  symptom that opened the task.
- `toggleStudy` builds targets from `dueOrNewBlockIds` only, `studyProgress`
  counts block IDs only (a fence-only session would read `0/0`), and
  `refreshChrome` skips notes with no line cards.
- `spatialStudyKeys` splits a node into steps only when *every* due card is an
  occlusion card — `if (due.some((card) => card.occlusion === undefined)) return [nodeKey]`.
  A multi-cloze or bidi node is therefore one unit of work where sequential asks N.

## Design decisions

Settled with the user before implementation. Each is a thing a future session
might otherwise "helpfully" undo.

1. **Contextual plays store `Card` records** — `card.front`, `card.back`,
   `card.id`. The source-derived path survives *only* as the fallback for a
   fence the store doesn't know yet (never synced, or just typed): render it
   visible, no rating row, not a session target. Chosen over extending the
   derivation because two renderers that must agree forever is precisely what
   caused this bug.
2. **Hiding belongs to peek and study alone.** Plain reading mode renders a
   fence exactly as live preview does — both sides, in order — because a note is
   a document first and a reader scrolling through it is not being asked
   anything. Reading view used to hide every back and make the reader click each
   one, which turned an ordinary read of a card-bearing note into a quiz nobody
   started.
   - A **cloze** card stacks its blanked half above its filled-in half. It
     collapses onto the filled-in text only after someone *answers* it, which is
     what keeps a reader's eye on one body of text mid-session.
   - A **multi-group cloze** blanks *every* group while reading, not the group
     whose card happens to be next. Settled with the user in phase 3, against
     the alternative of stacking one question-and-answer pair per group — which
     would print the same passage six times in a note someone is trying to read.
     The rule it produces is worth keeping whole: **stepping happens inside a
     session and nowhere else.**
   - An **occluded** card draws the masked diagram, then the unmasked one below
     it. The prose is *not* repeated with it: live preview does repeat it, and
     that is a wart of rendering an occluded fence as two independent sides, not
     something to carry over.
   - Reading mode takes no clicks and offers no rating — there is nothing to
     uncover and nothing being answered.

   This reverses an earlier decision in this task (reading mode keeps
   all-blanked → all-revealed, stepping only in study). Peek inherited the old
   reading-mode rendering, so the two were indistinguishable and the peek button
   did nothing visible on a fence-only note. Only *study* still steps through
   cloze groups and shape groups.
3. **Bidi is two steps in one spot** — forward, then reverse, only the due
   directions, each rated separately. Same stepping machinery as occlusion
   groups. A fence with one due side is one question.
4. **`spatialStudyKeys` splits on any derived card**, not just occlusion. Drop
   the `some(card.occlusion === undefined)` bailout so a node with N due cards is
   N steps whatever their type, including a mixed fence.
5. **Non-due fences render revealed and inert** during a session — visible as
   context, not a target, not counted in the pill.
6. **The button gate becomes "note has any card"**, not "note has line cards".
7. **Edit mode (live preview) is unchanged** — front and back both visible.

## Work plan

1. ✅ Button gate + contextual session targets → verify: Study/Peek appear on
   `chart-types.md`, session starts, pill counts fences.
2. ✅ Contextual plays store cards; source rendering demoted to fallback →
   verify: a cloze rating in Note view moves the schedule in the fence.
3. ✅ Cloze-group + bidi stepping in contextual → verify: a 3-cloze fence asks
   3 questions, a bidi fence asks 2.
4. ✅ Spatial: generalize `spatialStudyKeys`; ask bidi on the map → verify: node
   step count matches sequential's card count.
5. Fixtures + full type × mode verification matrix.

## Next session — Phase 5: fixtures and the full type × mode matrix

Phases 1–4 and the reading-mode change are **shipped** on
`feature/study-all-card-types` (see "Progress" below). Start here. **No PR is
open yet** — the branch carries four phases and the PR goes up when phase 5
lands.

### What is left

Every cell of the table at the top of this note is now either ✅ or ✅ with
*unverified* against it, and "unverified" is the whole of phase 5. Two things
have never been put in front of a reader in any surface:

1. **`code_cloze`.** It rides the same path every other fence type takes — the
   note and the map play whatever cards the store holds for a fence, and the
   generator fans a code cloze out per `cN` exactly as it does a text one — so
   it is *expected* to work. No fixture has ever proved it. `e2e/fixtures/
   code-cloze.md` exists but was written for live preview, not for study.
2. **The matrix itself.** Each of the six card types, in each of the three
   modes, asked the same questions and recording each answer. Nobody has sat
   down and walked all eighteen.

### What to build

1. **A `code_cloze` fixture with a real schedule**, in a note that renders as a
   mind map, covering both marker shapes: the single-line `// osmosis-cloze`
   trailing comment and the `osmosis-cloze-start` / `-end` block. Watch the
   node's rendering specifically — `parseOsmosisCodeCloze` blanks a whole line
   where the prose parser blanks a word, so a code cloze node's front and back
   differ in *height*, which is the case phase 4's per-step swap is most likely
   to clip. Check a long block.
2. **Walk the matrix** and record the result in a table in this note — type ×
   mode, with what was asked and whether the schedule moved. Where a cell is
   wrong, write the task note for it rather than fixing it inline; phase 5 is a
   verification pass, not a fifth round of implementation.
3. **Fold the reset hazard into the repo's conventions**, wherever fixtures are
   documented. See "the reset hazard" under phase 4 in Progress — a fixture
   rewritten while Obsidian holds the note open is silently reverted, and that
   cost most of an hour in phase 4.

### Where the seams are

- `vault/tests/flashcard/fence-card-types.md` covers the fanned-out types in
  both the note and the map, and `fence-only-study.md` the target/non-target
  split. Neither covers `code_cloze` or occlusion; `occlusion-surfaces.md` does
  the latter.
- The map renders a fence node from its **source**, and only swaps to the
  store's card while a step is on screen. So a source-parser gap shows up
  *outside* a session and disappears inside one — which is exactly how the
  `c1:` label leak survived until phase 4. When something looks wrong on a node,
  check whether it is wrong in both states before believing the card is at
  fault.
- MindMapView's fence parsers still do not recognise the `:::text:::` cloze
  form, which `PROSE_CLOZE_REGEX` in the generator does. A `:::`-only fence is
  therefore not a card node on the map at all. Pre-existing, out of scope for
  phase 4, and worth a line in the matrix.

### Verify

1. A `code_cloze` fence asks one question per group in all three modes, and each
   answer moves that group's schedule in the fence.
2. The matrix table in this note is filled in, every cell, with the surface
   actually exercised rather than reasoned about.
3. `npm run lint`, `npm test`, `npm run build` all clean.

### Then

Open the PR against `release/0.0.4`, close this note out, and merge when asked.

## Progress

- **Phase 1 — shipped** (`39d054b`). Study/Peek gate on any card, not just line
  cards; a contextual session knows its fence targets; the pill counts them; a
  fence the session is not asking renders inert. Fence tracking generalized from
  occluded fences to all of them.
- **Reading mode — shipped** (`80c8a71`). Hiding moved to peek and study alone;
  plain reading mode draws what live preview draws. Reverses part of decision 2,
  which is rewritten above.
- **Phase 2 — shipped** (`4d3e59e`). A fence plays the store's card —
  `card.front`, `card.back`, `card.id` — instead of re-deriving a pair from its
  source and rating an ID no card carries. Cloze reviews taken in a note now
  actually record. Source-derived rendering demoted to the fallback for a fence
  the store has no card for. Also fixed the pill on occluded fences.
- **Phase 3 — shipped** (`6715dab`). A fence asks every card it derived, one at
  a time: a plan of its due cards in ask order, pinned at first draw, an index
  that survives the re-render a schedule flush causes, and a reveal, a rating
  and an advance per card. The pill counts those questions instead of counting
  fences. Manual testing moved `c1`, `c2` and `c3` of the three-group fence on
  three separate timestamps, and both directions of the bidirectional pair — the
  first time a reverse card has been answerable outside sequential study.
- **Phase 4 — shipped** (`8a8d3c3`). A node asks every card it carries, one at a
  time, and shows the card being asked while it does. Ratings land on
  `<fence>-cN` and `<fence>-r` separately. Manual testing moved rivers `c1`,
  `c2` and `c3` on three timestamps a second apart and both directions of the
  bidirectional pair, and confirmed an occluded node still steps as it did and
  peek still reveals whole nodes in any order.
- **Phase 5 — not started.**

Four decisions taken during phase 4 that a later session should not undo
silently:

1. **The node swaps its markdown per step** — decision 3 of the phase-4 prompt,
   which left the choice open. The alternative (leave the whole passage up and
   make only the *rating* per card) collapses on a bidirectional node: its
   reverse card asks the other side, and there is no way to put that question
   without changing what the node shows. Once markdown swaps for bidi, doing it
   for cloze too is what makes the map ask literally the same questions as the
   note and sequential. The cost is accepted, not overlooked: a step's front is
   never longer than the fence's full text, which the node's box was already
   measured to hold, but a long answer revealed under a long question can clip
   against `.osmosis-node-content { overflow: hidden }`. Clipping beats
   re-measuring, which reflows the whole canvas under the reader's cursor
   mid-session.
2. **`spatialStudyKeys` splits on *any* due card, not just several.** A node
   carrying one card returns that card's own ID — which for an ordinary line or
   a basic fence is the node key itself, so nothing changed there — rather than
   falling back to the node key. Keeping the old "one due occlusion group still
   splits, one due anything-else does not" shape would have meant a fence with
   `c1` due and `c2` not taking one rating on both, which is the spreading this
   phase set out to end.
3. **`cardIdsForSpatialKey` checks `card.id === key` before either key-shaped
   lookup**, and no longer requires the card to be occluded. The unsuffixed
   forward card of a bidirectional fence is named after the fence, so falling
   through to `cardIdsForFenceKey` would have handed its rating to the reverse
   as well.
4. **Peek was left alone.** `enterSpatialPeek` still maps each node key to
   `[key]` instead of calling `spatialStudyKeys`. Peek reveals in any order and
   records nothing, so a target card has no meaning there.

Two rendering bugs surfaced by putting a scheduled fence on a node for the first
time. Both were in MindMapView's *source* parsers, not in the card path, which
is why phases 1–3 never hit them:

- **The fence header scan stopped at the first indented line.** It looked for
  consecutive `key: value` lines and a nested `c1:` or `r:` schedule block is
  not that, so a scheduled cloze or bidirectional node rendered its own `due:`
  and `stability:` fields as the card text. Only flat schedules ever came out
  right, which is why it survived — a basic fence writes its schedule flat. All
  three parsers now delegate to the generator's own `splitFenceHeader`.
- **The cloze parser handed the fence text back whole for the back half**, so
  `==c1:Danube==` printed a highlighted `c1:Danube` on the node. The front never
  showed it, being blanked over, so it took a node stepping through its groups
  to make it visible.

Also learned, the hard way — **the reset hazard**: a vault fixture rewritten
while Obsidian holds the note open is silently reverted. Obsidian keeps its own
in-memory copy; the next schedule flush serializes *that* copy plus whatever the
store staged, so the edit is lost. In phase 4 this restored `fct-rivers` and
`fct-capital` with their ratings while dropping the schedules from `fct-basic`
and `fct-indexes` entirely, which turned the not-due control into two new cards
and made the banner read `0/9` where the note reported `0/7`. The banner was
honest; the fixture had drifted. **Reload Obsidian (Ctrl+R) after resetting a
fixture, before testing it.** This is the same family as the phase-3 lesson
about `id:` stamping, and the more general rule is: the running plugin is
authoritative over a file it has open, so a fixture edit only counts once
Obsidian has re-read it.

Four decisions taken during phase 3 that a later session should not undo
silently:

1. **The sequence function landed in `spatial-study.ts`, not in
   `occlusion-steps.ts`.** The phase-3 prompt said to generalize `OcclusionStep`
   into "a card to ask". Doing so would have made `diagram` and `group` optional
   for the mask renderer, which genuinely needs them — so
   `dueCardsForFenceKey` sits beside `cardsForFenceKey` instead, where the ask
   order already lived, and `OcclusionStep` was left exactly as strong as it
   was. The stepping *machinery* was always in the processors, not in that
   module; only the sequence is shared.
2. **Reading mode blanks every cloze group, not the current card's.** Settled
   with the user — see decision 2. It is what makes "stepping happens inside a
   session and nowhere else" true, and it collapses phase 2's four fallback
   branches (unsynced, excluded, not-due, not-studying) into one.
3. **The step counter appears only above one question.** The occluded path shows
   `1/1`; a basic fence shows nothing, because "1/1" says nothing the card does
   not already show. A deliberate inconsistency between the two paths, not an
   oversight.
4. **The pill's fence totals are counted from the store at session start**
   (`planFenceSteps`), not reported by each fence as it draws. Reading view
   builds its sections lazily, so a fence below the fold would otherwise leave
   the total short until someone scrolled to it.

Also learned, the hard way: **a vault fixture cannot hold an unsynced fence.**
Sync stamps an `id:` onto any fence within a second of the file being written,
so the "no `id:`" section of `fence-card-types.md` had silently become an
ordinary card during phase 2 and did it again during phase 3. That section now
says what it actually demonstrates — a brand-new card — and the real fallback is
covered by `ContextualStudyProcessor.dom.test.ts`. `fence-only-study.md` had
likewise picked up a line card in the vault, which defeated its whole point, and
was restored from `e2e/fixtures/`.

Three decisions taken during phase 2 that a later session should not undo
silently:

1. **The divergent cloze builders were kept**, contrary to the surface map
   below. Live preview is unchanged by design (decision 7) and still parses the
   source, as does the unsynced-fence fallback. They are off every *rating*
   path, which is what caused the bug; deleting them would mean rewriting live
   preview, which this task deliberately does not touch.
2. **Peek still hides an unsynced fence's back.** The phase-2 prompt said the
   fallback "renders visible"; `shouldHideBack` was kept as the single gate
   instead, so the fallback is visible while reading and as context during a
   session, but peek — whose whole job is hiding, and which records nothing —
   still covers it.
3. ~~**A multi-cloze fence in plain reading mode now blanks one group, not all
   of them**, a direct consequence of playing store cards.~~ **Superseded in
   phase 3**: reading mode blanks every group again, and playing store cards is
   confined to a session. See decision 2.

Manual testing confirmed by the user for all four. Fixtures:
`vault/tests/flashcard/fence-only-study.md` (two due fences + one scheduled to
2027) covers the target/non-target split, and
`vault/tests/flashcard/fence-card-types.md` covers the fanned-out types — a
three-group cloze with all groups due, a bidi pair, a basic control, a
not-due cloze, and one card the store has only just met. Phase 4 gave the latter
deliberate back-dated schedules (seven due questions) and a paragraph on what the
map should do, so it now serves both the note and the map. Reset both after
testing, as the repo does for every fixture whose schedule a session moves —
and reload Obsidian afterwards, or the reset does not take. See "the reset
hazard" above.

## Surface map (expected)

| File | Change |
|---|---|
| `src/views/LineRevealProcessor.ts` | Button gate, session targets, progress pill, chrome refresh |
| `src/views/ContextualStudyProcessor.ts` | Play store cards; fallback path; card ID and fence key kept apart |
| `src/study/spatial-study.ts` | `cardsForFenceKey` (ask order), `dueCardsForFenceKey` (the sequence); `spatialStudyKeys` splits on any derived card |
| `src/views/MindMapView.ts` | Bidi and cloze targets on the map |

The "delete divergent cloze builders" entry was dropped in phase 2 — see the
decisions under "Progress" for why. The `occlusion-steps.ts` entry was dropped
in phase 3, for the reason given there. Phase 4 held to this map, with one
addition nobody predicted: MindMapView's *source* parsers, which had to be fixed
before a scheduled fence could be read on a node at all.

Shipped so far, by file:

| File | Phase | Change |
|---|---|---|
| `src/views/LineRevealProcessor.ts` | 1, 3 | Button gate, fence targets; pill counts fence *questions* (`planFenceSteps`, `ratedFences` as a counter) |
| `src/views/ContextualStudyProcessor.ts` | 1–3 | Plays store cards; steps a fence through them (`fencePlan`, `stepAt`, shared with the occluded path); source rendering outside a session |
| `src/study/spatial-study.ts` | 2–4 | `cardsForFenceKey`, `dueCardsForFenceKey`; `spatialStudyKeys` splits on any due card, ordered by `askRank`; `cardIdsForSpatialKey` resolves a split key to that card alone |
| `src/views/MindMapView.ts` | 4 | `spatialStepCards`; per-step markdown swap (`updateNodeProse`, seeded by `renderOsmosisCardInto`); all three fence parsers routed through `splitFenceHeader`; cloze `cN:` labels stripped from the back |

## What's your current workaround?

None needed in any surface. All three ask every card a fence derived, one at a
time, and each answer records against the card that was asked.

Two sets of old reviews are still worth redoing, because those ratings never
landed where they should have: cloze cards reviewed **in Note view before phase
2**, whose ratings never reached the store at all, and cloze or bidirectional
nodes rated **on the map before phase 4**, where one rating was spread across
every card the node carried.

## Reference Attachments/Screenshots

Fixture with basic fences and no line cards (reproduces the missing buttons):
`vault/tests/flashcard/deck-hierarchy/Data Science/Visualization/chart-types.md`