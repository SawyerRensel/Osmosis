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
  - "[[Cloze markers leak into the revealed half outside a session]]"
status: Done
priority:
progress_current:
progress_total:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/22
date_created: 2026-08-03T15:38:58.397Z
date_modified: 2026-08-14T02:30:16.189Z
date_start_scheduled: 2026-08-13T06:12:45-04:00
date_start_actual: 2026-08-13T02:42:45.000Z
date_end_scheduled: 2026-08-13T09:14:57-04:00
date_end_actual: 2026-08-13T12:14:57.000Z
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
| `explicit` (basic) | ✅ | ✅ | ✅ |
| `explicit_bidi` | ✅ both directions | ✅ both directions | ✅ both directions |
| `explicit_cloze` | ✅ one card per `cN` | ✅ one card per `cN` | ✅ one card per `cN` |
| `code_cloze` | ✅ one card per `cN` | ✅ one card per `cN` | ✅ one card per `cN` |
| `occlusion` | ✅ | ✅ per group | ✅ per group |
| `line` | ✅ | ✅ | ✅ |

Every cell was walked in Obsidian in phase 5 — see the matrix under "Progress".
`code_cloze` had never been put in front of a reader before then: it rides the
same path every other fence type takes, so it was expected to work, and the
fixture that proves it is `code-cloze-study.md`.

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
5. ✅ Fixtures + full type × mode verification matrix → verify: all
   eighteen cells walked in Obsidian, each asking the same questions and
   recording each answer.

## What was implemented

### Where it shipped

[PR #22](https://github.com/SawyerRensel/Osmosis/pull/22), branch
`feature/study-all-card-types` → `release/0.0.4`. Six commits, one per phase
plus the reading-mode reversal; the per-phase record and the decisions taken
inside each are under "Progress" below.

### The cause

Three surfaces played cards and only one of them played the *store's* cards.

`SequentialStudyModal` plays `Card` records, which carry generator-rendered
`front`/`back` and a real ID. `ContextualStudyProcessor` instead re-derived a
front and a back from the fence source and rated an ID it hashed itself — which
for a multi-cloze fence is the bare fence ID, never `<fenceId>-cN`. No card in
the store answers to that, so `recordRating` took its "card not in store" early
return and **every cloze review taken in a note was silently discarded**. The
same re-derivation had no notion of a reverse card, so `<fenceId>-r` could only
ever be answered in sequential study.

The two in-place surfaces then gated their chrome on the wrong signal.
`LineRevealProcessor` computed `show = lineCardBlockIds(path).size > 0`, so a
note whose cards are all fences got no Study or Peek button at all — the symptom
that opened this task. `spatialStudyKeys` split a node into steps only when
*every* due card was an occlusion card, so a node carrying a three-group cloze
was one unit of work where sequential asked three questions and took one rating
on all three.

Underneath both: per-group stepping had been built once, for occlusion, in both
surfaces. Nothing else ever got the equivalent.

### The fix

Contextual and spatial both stop deriving and start **playing the store**. A
fence node or a fence section builds a plan of its due cards in ask order,
pinned at first draw so a re-render from a schedule flush cannot shuffle it, and
asks them one at a time — a reveal, a rating and an advance per card, with the
rating landing on the ID that was asked. The pill and the banner count questions
rather than fences. `spatialStudyKeys` splits on any due card, so a node with N
due cards is N steps whatever their type.

Source-derived rendering survives in exactly two places, both off every rating
path: live preview, which this task deliberately does not touch, and the
fallback for a fence the store has no card for.

### Decisions worth remembering

Each phase's own decisions are recorded under "Progress" — those are the ones a
future session might undo while working in that code. The four that shape the
feature as a whole:

1. **Contextual plays store `Card` records**, chosen over extending the
   derivation. Two renderers that must agree forever is precisely what caused
   the bug.
2. **Hiding belongs to peek and study alone.** Plain reading mode renders a
   fence as live preview does. Reading view used to hide every back and make the
   reader click each one, which turned an ordinary read of a card-bearing note
   into a quiz nobody started. The rule that falls out is worth keeping whole:
   **stepping happens inside a session and nowhere else** — a multi-group cloze
   blanks *every* group while reading, not the group whose card happens to be
   next.
3. **A cloze reveals in place; everything else stacks.** Its two halves are one
   passage, blanked and filled in, so the answer replaces the question and the
   reader's eye stays on one body of text. A basic or bidirectional fence keeps
   both halves, because there the answer does not contain the question. Note
   view has read this way since phase 3 and the map since phase 5.
4. **Non-due fences render revealed and inert** during a session — visible as
   context, not a target, not counted.

### Test fixture

| Fixture | Covers |
|---|---|
| `vault/tests/flashcard/fence-card-types.md` | The fanned-out types: a three-group cloze, a bidi pair, a basic control, a not-due cloze, a card the store has only just met. Seven due questions in each of the three modes. |
| `vault/tests/flashcard/fence-only-study.md` | The target/non-target split — two due fences and one scheduled to 2027, in a note with no line cards. |
| `vault/tests/flashcard/occlusion-surfaces.md` | Occlusion in both in-place surfaces, plus an occluded and a plain line card. |
| `vault/tests/flashcard/code-cloze-study.md` | **New in phase 5.** Both code-cloze marker shapes with real schedules, in a note shaped for the map. Four due questions. |

Every one of them moves schedules when studied. Reset from `e2e/fixtures/`
after testing **and reload Obsidian** — see "The reset hazard" in `CLAUDE.md`,
which this task added after losing most of an hour to it in phase 4.

### Follow-ups

- [[Cloze markers leak into the revealed half outside a session]] — two
  source-parser gaps found while walking the matrix, both pre-existing: a
  labelled `# osmosis-cloze-cN` marker prints on the answer outside a session,
  and a `:::text:::` fence is not a card node on the map at all.

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
- **Phase 5 — shipped** (`a22d71c`, `9d176c9`). `code-cloze-study.md` covers
  both marker shapes with real schedules, in a note shaped for the map; the
  reset hazard is folded into `CLAUDE.md` under "The reset hazard", linked from
  Step 4.5. All eighteen matrix cells walked. The walk turned up one parity gap
  and it was fixed here rather than deferred — the map revealed a cloze node by
  stacking its answer under its question, so a cloze node carried its passage
  twice and was twice as tall as it needed to be. `applyFenceHidden` now drops
  the blanked front and the divider on reveal, gated on being inside a session,
  because `exitSpatialMode` restores every node through that same method with
  `hidden: false` after clearing the mode and a collapse that outlived the
  session would leave the fence showing its answer and nothing else.

### The type × mode matrix

Walked cell by cell in Obsidian — the count is the questions the surface put on
screen, *recorded* means the schedule in the source file moved for the card that
was answered.

| Card type | Fixture | Sequential | Spatial (map) | Contextual (note) |
|---|---|---|---|---|
| `explicit` | `fence-card-types.md` · `fct-basic` | ✅ 1, recorded | ✅ 1, recorded | ✅ 1, recorded |
| `explicit_bidi` | `fence-card-types.md` · `fct-capital` | ✅ 2, recorded | ✅ 2, recorded | ✅ 2, recorded |
| `explicit_cloze` | `fence-card-types.md` · `fct-rivers` | ✅ 3, recorded | ✅ 3, recorded | ✅ 3, recorded |
| `code_cloze` | `code-cloze-study.md` · all three fences | ✅ 4, recorded | ✅ 4, recorded | ✅ 4, recorded |
| `occlusion` | `occlusion-surfaces.md` · fence + `os-elevat1` | ✅ per group | ✅ per group | ✅ per group |
| `line` | `occlusion-surfaces.md` · `os-plainl1` | ✅ 1, recorded | ✅ 1, recorded | ✅ 1, recorded |

**Every cell asks the same questions and records each answer** — which is what
this task set out to fix, and the matrix is what proves it. `code_cloze` was
walked for the first time here: both marker shapes fan out per `cN`, the map
steps `0/4` → `4/4`, and the tall start/end region revealed under a one-line
blank without clipping.

The two cloze rows were re-walked after the map's reveal was fixed; the counts
above are the ones the fixed build produced. Phase 5's rule was to record a
wrong cell rather than fix it, and the other two gaps the walk found were left
alone accordingly — both are source-parser drift rather than anything this task
built. See [[Cloze markers leak into the revealed half outside a session]].

Known seams to record rather than fix (phase 5 is a verification pass):

- **A labelled `# osmosis-cloze-cN` marker leaks into the revealed half outside
  a session.** Both view-side source parsers strip a bare marker and neither
  strips a labelled one —
  `MindMapView.STRIP_CLOZE_COMMENT` and `ContextualStudyProcessor.MARKER_COMMENT`
  are the same regex, and both end at `osmosis-cloze\s*(?:\*\/|-->)?\s*$`, which
  a `-c1` suffix defeats. The generator strips it correctly, so the marker
  disappears the moment a session asks the card and comes back when it ends —
  the same "wrong outside a session, right inside one" shape as the `c1:` label
  leak phase 4 fixed. `code-cloze-study.md`'s third fence exercises it.
- **`:::text:::` is not a card node on the map.** MindMapView's fence parsers
  still do not recognise the form `PROSE_CLOZE_REGEX` accepts. Pre-existing.

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
| `src/views/MindMapView.ts` | 4, 5 | `spatialStepCards`; per-step markdown swap (`updateNodeProse`, seeded by `renderOsmosisCardInto`); all three fence parsers routed through `splitFenceHeader`; cloze `cN:` labels stripped from the back; `isCloze` on the source parse and the in-place reveal in `applyFenceHidden` |
| `CLAUDE.md` | 5 | "The reset hazard" under manual testing, linked from Step 4.5 |
| `e2e/fixtures/code-cloze-study.md` → `vault/tests/flashcard/` | 5 | The `code_cloze` fixture: both marker shapes, four due questions |

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