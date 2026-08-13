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
date_modified: "2026-08-12T22:15:03.441Z"
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
| `explicit` (basic) | ✅ | ✅ | ❌ no buttons on a fence-only note |
| `explicit_bidi` | ✅ both directions | ❌ forward only | ❌ forward only |
| `explicit_cloze` | ✅ one card per `cN` | ❌ node = 1 unit | ❌ all blanks at once, **rating dropped** |
| `code_cloze` | ✅ one card per `cN` | ❌ node = 1 unit | ❌ all blanks at once, **rating dropped** |
| `occlusion` | ✅ | ✅ per group | ✅ per group |
| `line` | ✅ | ✅ | ✅ |

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

1. Button gate + contextual session targets → verify: Study/Peek appear on
   `chart-types.md`, session starts, pill counts fences.
2. Contextual plays store cards; source rendering demoted to fallback →
   verify: a cloze rating in Note view moves the schedule in the fence.
3. Cloze-group + bidi stepping in contextual (generalize `occlusion-steps.ts`)
   → verify: a 3-cloze fence asks 3 questions, a bidi fence asks 2.
4. Spatial: generalize `spatialStudyKeys`; ask bidi on the map → verify: node
   step count matches sequential's card count.
5. Fixtures + full type × mode verification matrix.

## Next session — Phase 2: contextual plays store cards

Phases 1 and the reading-mode change are **shipped** on
`feature/study-all-card-types` (see "Progress" below). Start here.

### The bug you are fixing

`ContextualStudyProcessor.parseFenceContent` re-derives a fence's front and back
from its source text. The generator has already done that work and put the
result in the store, and the two disagree on every card type that fans out:

| Fence | Store holds | Contextual renders |
|---|---|---|
| 3-group cloze | `<id>-c1`, `-c2`, `-c3` — each `front` blanks *one* group, `back` is the full passage | one card, every group blanked at once |
| bidirectional | `<id>` (front→back) **and** `<id>-r` (back→front) | forward only |
| basic | `<id>` | matches ✅ |

Card construction is in `src/card-gen/explicit.ts` — cloze at ~line 847, the
bidi pair at ~line 880. Both carry fully rendered `front`/`back` strings.

The rating consequence is the urgent half. `renderCard` mints its ID as
`extractIdFromSource(source) ?? hashContent("cloze|||…")`, which for a
multi-cloze fence is the *bare fence ID*. No such card exists in the store, so
`recordRating` hits its `Card not in store — skip rating` guard and the review
is silently discarded. Confirm this first with a failing test — it is the
acceptance criterion.

### What to build

Contextual looks the note's cards up in the store (`cardStore.getCardsByNote`)
and renders `card.front` / `card.back`, rating against `card.id`. Source-derived
rendering survives **only** as the fallback for a fence the store does not know
yet — never synced, or just typed. That fallback renders visible, takes no
rating, and is never a session target. Decision 1 in this note explains why this
is the shape rather than teaching the derivation about `-cN`.

Note that Phase 2 is only the *plumbing* — one store card per fence still asks
one question. Phase 3 is what makes a 3-cloze fence ask three.

### Where the seams are

- `parseFenceContent` also feeds `renderPreviewCard` (live preview) and the
  exclude toggle, which are **not** study surfaces. Don't rip it out; change who
  decides what a *card* shows.
- `ParsedFence.occlusions` has no equivalent on `Card` beyond `card.occlusion`
  (one group per card). `renderOcclusionCard` already plays store cards through
  `stepPlan`/`occlusionSteps` — leave that path alone, it is the model.
- Reading mode now shows both sides (see decision 2). A store-card renderer has
  to keep that: `shouldHideBack` stays the single gate.
- Matching a fence in the DOM to its store cards means the fence's own `id:` —
  `fenceKeyFromNode` / `fenceKey` in `src/study/spatial-study.ts` already do
  this stripping. Reuse them rather than writing a third ID parser.

### Verify

1. A failing test first: rating a multi-cloze fence in contextual mode records
   nothing. Then make it pass.
2. `npm run lint`, `npm test`, `npm run build` all clean.
3. Manual: rate a cloze card in Note view, press Stop, confirm the fence's
   `c1:`/`c2:` nested schedule actually moved in the note's text.
4. Reading mode still stacks both sides for every type (the 6 tests in
   `ContextualStudyProcessor.dom.test.ts` → "a fence in plain reading mode").

### Then

Phase 3 (cloze-group + bidi stepping, generalizing `occlusion-steps.ts`),
Phase 4 (`spatialStudyKeys` splits on any derived card), Phase 5 (fixtures +
the full type × mode matrix).

## Progress

- **Phase 1 — shipped** (`39d054b`). Study/Peek gate on any card, not just line
  cards; a contextual session knows its fence targets; the pill counts them; a
  fence the session is not asking renders inert. Fence tracking generalized from
  occluded fences to all of them.
- **Reading mode — shipped** (`80c8a71`). Hiding moved to peek and study alone;
  plain reading mode draws what live preview draws. Reverses part of decision 2,
  which is rewritten above.
- **Phases 2–5 — not started.**

Manual testing confirmed by the user for both. Fixture
`vault/tests/flashcard/fence-only-study.md` (two due fences + one scheduled to
2027) covers the target/non-target split; reset it after testing, as the repo
does for every fixture whose schedule a session moves.

## Surface map (expected)

| File | Change |
|---|---|
| `src/views/LineRevealProcessor.ts` | Button gate, session targets, progress pill, chrome refresh |
| `src/views/ContextualStudyProcessor.ts` | Play store cards; delete divergent cloze builders; fallback path |
| `src/study/occlusion-steps.ts` | Generalize stepping beyond occlusion groups |
| `src/study/spatial-study.ts` | `spatialStudyKeys` splits on any derived card |
| `src/views/MindMapView.ts` | Bidi targets on the map |

## What's your current workaround?

Study those cards in sequential mode, which is the only surface that asks every
card. Cloze cards reviewed in Note view need re-reviewing in sequential, since
those ratings never reached the store.

## Reference Attachments/Screenshots

Fixture with basic fences and no line cards (reproduces the missing buttons):
`vault/tests/flashcard/deck-hierarchy/Data Science/Visualization/chart-types.md`