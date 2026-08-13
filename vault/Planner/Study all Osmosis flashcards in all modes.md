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
date_modified: "2026-08-13T11:05:00.000Z"
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
| `explicit_bidi` | ✅ both directions | ❌ forward only | ✅ both directions *(phase 3)* |
| `explicit_cloze` | ✅ one card per `cN` | ❌ node = 1 unit | ✅ one card per `cN` *(phase 3)* |
| `code_cloze` | ✅ one card per `cN` | ❌ node = 1 unit | ✅ *(phase 3, unverified — no fixture yet)* |
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
4. Spatial: generalize `spatialStudyKeys`; ask bidi on the map → verify: node
   step count matches sequential's card count.
5. Fixtures + full type × mode verification matrix.

## Next session — Phase 4: cloze-group and bidi stepping on the map

Phases 1–3 and the reading-mode change are **shipped** on
`feature/study-all-card-types` (see "Progress" below). Start here.

### What is left

Spatial study is now the only surface that asks fewer questions than sequential.
`spatialStudyKeys` (`src/study/spatial-study.ts`) splits a node into steps only
when *every* due card on it is an occlusion card:

```ts
if (due.length === 0 || due.some((card) => card.occlusion === undefined)) return [nodeKey];
```

So a three-group cloze node is one unit of work where sequential asks three, a
bidirectional node never asks its reverse, and the single rating the node takes
is spread across every card it carries by `cardIdsForSpatialKey`. Decision 4
settled that this bailout goes.

The machinery to step a node already exists and was built for occlusion:
`setSpatialTargets` expands each node key into the keys it asks
(`spatialNodeTargets`), `spatialNodeStep` holds the position, `handleSpatialClick`
reveals `keys.find((k) => !revealed.has(k))`, and the banner counts keys. Phase 4
widens what may be a key, it does not invent the stepping.

### What to build

1. **`spatialStudyKeys` splits on any derived card.** Drop the
   `some(card.occlusion === undefined)` bailout. Order the split keys the way
   `cardsForFenceKey` does — the fence's own card, then `-cN` by number, then
   `-r` — rather than by `occlusion.target`, which a cloze card does not have.
   `askRank` is already exported-adjacent in that file; reuse it rather than
   sorting on the occlusion target. An occluded line's cards sort identically
   under it, so the existing behaviour is preserved.
2. **`cardIdsForSpatialKey` must resolve a split non-occluded key.** It
   currently special-cases `card.id === key && card.occlusion !== undefined`; a
   key like `rivers-c2` therefore falls through to `cardIdsForFenceKey`, which
   strips the `-c2` and matches nothing — the review is dropped exactly as it
   was in the note before phase 2. Widen that branch to any card whose ID *is*
   the key. Do it in the same commit as (1); on its own, (1) silently loses
   every cloze rating taken on the map.
3. **Decide what the node shows per step, and write the decision down.** This
   is the real design work, and it is not the same shape as phase 3. The map
   renders a fence node from its **source** — `getOsmosisCardContent` →
   `parseOsmosisCloze` / `parseOsmosisFence` — and hides the back half
   (`applyFenceHidden`), so a cloze node asks "every group blanked → all filled
   in" no matter which card is being rated. Putting `card.front` on the node per
   step is what the note does, but `applyFenceHidden`'s own comment is explicit
   that **a node must not change size when tapped**: the map lays out at a fixed
   size and re-measuring reflows the whole canvas under the cursor. The two
   honest options are:
   - swap the front's markdown per step and keep the laid-out height (a blank
     and its word are close in width, but not equal — check a long answer); or
   - leave the node showing the whole passage and make only the *rating* per
     card, so the map asks N times about one picture of the text.

   The second is cheaper and matches what an occluded node already does with its
   siblings' groups; the first matches sequential. Either is defensible. Say
   which, and why, in this note.
4. **Peek must keep asking nothing.** `enterSpatialPeek` deliberately maps each
   node key to `[key]` rather than calling `spatialStudyKeys` — peek reveals in
   any order and records nothing, so a target group has no meaning there. Leave
   it alone.

### Where the seams are

- `spatialGroupOcclusions` holds a diagram only for occlusion targets. A cloze
  or bidi step has none, and `applySpatialState` passes `null` for it — which is
  already the "hide or reveal the node whole" path, so a split cloze node will
  fall into it without a crash. That is convenient, not correct: it is exactly
  the behaviour item 3 has to decide about.
- A note transcluded twice shares one card key across two nodes, and both must
  reveal together — that is why `applySpatialState` re-applies to every node
  rather than touching the clicked one.
- The pill in the note counts questions from the store at session start
  (`planFenceSteps`, `LineRevealProcessor`). The map's banner counts keys from
  `spatialStudyKeys`, so widening the split moves its total for free.
- `dueCardsForFenceKey` (phase 3) is the note's sequence function. If the map
  ends up wanting the same list, use it rather than a second filter.

### Verify

1. A three-group cloze node asks three questions on the map and a bidirectional
   node two; the banner total matches what sequential reports for the same note.
2. Ratings land on `<fence>-c2` and `<fence>-r` — check the fence's own text in
   the file after Stop, as phase 3 did, not just the banner.
3. An occluded node still steps exactly as it did, and peek still reveals whole
   nodes in any order.
4. `npm run lint`, `npm test`, `npm run build` all clean.

### Then

Phase 5: fixtures and the full type × mode matrix — including `code_cloze`,
which no fixture has ever put in front of a reader in any surface.

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
- **Phases 4–5 — not started.**

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

Manual testing confirmed by the user for all three. Fixtures:
`vault/tests/flashcard/fence-only-study.md` (two due fences + one scheduled to
2027) covers the target/non-target split, and
`vault/tests/flashcard/fence-card-types.md` covers the fanned-out types — a
three-group cloze with all groups due, a bidi pair, a basic control, a
not-due cloze, and one card the store has only just met. Reset both after
testing, as the repo does for every fixture whose schedule a session moves —
both were reset at the end of phase 3.

## Surface map (expected)

| File | Change |
|---|---|
| `src/views/LineRevealProcessor.ts` | Button gate, session targets, progress pill, chrome refresh |
| `src/views/ContextualStudyProcessor.ts` | Play store cards; fallback path; card ID and fence key kept apart |
| `src/study/spatial-study.ts` | `cardsForFenceKey` (ask order), `dueCardsForFenceKey` (the sequence); `spatialStudyKeys` splits on any derived card |
| `src/views/MindMapView.ts` | Bidi and cloze targets on the map |

The "delete divergent cloze builders" entry was dropped in phase 2 — see the
decisions under "Progress" for why. The `occlusion-steps.ts` entry was dropped
in phase 3, for the reason given there.

Shipped so far, by file:

| File | Phase | Change |
|---|---|---|
| `src/views/LineRevealProcessor.ts` | 1, 3 | Button gate, fence targets; pill counts fence *questions* (`planFenceSteps`, `ratedFences` as a counter) |
| `src/views/ContextualStudyProcessor.ts` | 1–3 | Plays store cards; steps a fence through them (`fencePlan`, `stepAt`, shared with the occluded path); source rendering outside a session |
| `src/study/spatial-study.ts` | 2, 3 | `cardsForFenceKey`, `dueCardsForFenceKey` |

## What's your current workaround?

None needed in Note view any more — it asks every card a fence derived, and each
answer records. **The Mind Map remains the workaround case**: a cloze or
bidirectional node there is still one question and one rating spread across
every card it carries, so those cards should be studied in sequential or in the
note until phase 4 lands. Cloze cards reviewed in Note view **before phase 2**
still need re-reviewing, since those ratings never reached the store at all.

## Reference Attachments/Screenshots

Fixture with basic fences and no line cards (reproduces the missing buttons):
`vault/tests/flashcard/deck-hierarchy/Data Science/Visualization/chart-types.md`