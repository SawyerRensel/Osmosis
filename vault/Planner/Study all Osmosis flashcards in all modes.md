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
date_modified: "2026-08-12T23:35:00.000Z"
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
| `explicit_bidi` | ✅ both directions | ❌ forward only | ❌ forward only |
| `explicit_cloze` | ✅ one card per `cN` | ❌ node = 1 unit | ❌ first `cN` only *(rating fixed, phase 2)* |
| `code_cloze` | ✅ one card per `cN` | ❌ node = 1 unit | ❌ first `cN` only *(rating fixed, phase 2)* |
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

## Next session — Phase 3: cloze-group and bidi stepping in contextual

Phases 1 and 2 and the reading-mode change are **shipped** on
`feature/study-all-card-types` (see "Progress" below). Start here.

### What is left

A fence now plays a store card, so its ratings land. But it plays **one** card —
the first of its cards the scheduler would ask — so a three-group cloze fence
asks one question where sequential asks three, and a bidirectional fence's
reverse is still reachable only in sequential. Phase 3 makes a fence ask all of
its due cards in place, one at a time.

The machinery already exists and is the model to copy: `renderOcclusionCard`
steps an occluded fence through its shape groups via `stepPlan` /
`occlusionSteps`, with `occlusionStepAt` holding the position and `occlusionPlan`
pinning the sequence at session start. Phase 3 is generalizing that from "shape
groups of a diagram" to "the cards a fence derived", and pointing `renderCard` at
it.

`cardsForFenceKey` (added in phase 2, `src/study/spatial-study.ts`) already
returns a fence's cards in ask order — `<id>`, then `-c1`…`-cN` by number, then
`-r`. That ordering *is* the step sequence; it needs the due filter
`occlusionSteps` applies and the same "pin it at session start" treatment.

### What to build

1. Generalize `src/study/occlusion-steps.ts` so a step is "a card to ask" rather
   than "a group on a diagram". An occluded step keeps its `diagram`/`group`
   fields — the mask renderer needs them — but a cloze or bidi step carries only
   a card ID.
2. `renderCard` steps: reveal → rate → advance → next card's front, with a
   `n/N` counter, exactly as the occluded path shows. `fenceCardAt` (the phase-2
   single-card pin) becomes the step index.
3. `studyProgress` in `LineRevealProcessor` currently counts **one question per
   fence** — there is a comment there saying so and naming this phase. Make it
   count steps, the way it already does for occluded lines via `studySteps`.
4. Decide what plain reading mode shows for a multi-cloze fence. Phase 2 left it
   showing the *first* card's blanking, which diverges from live preview (all
   groups blanked at once). Stacking every group's question-and-answer pair is
   the option that matches decision 2's "a cloze card stacks its blanked half
   above its filled-in half" read per card. Whatever you choose, say so here.

### Where the seams are

- `markFenceRated` takes a **fence key**, not a card ID — phase 2 fixed a bug
  where the pill sat still through a whole occluded diagram because it was given
  `<fence>-c1`. `showRating` now takes both, separately. Keep them apart.
- `isFenceTarget` / `fenceTargets` are keyed on fence keys and fixed at session
  start. A fence stays one *target* however many steps it asks; the pill is what
  counts questions.
- Live preview stays on `parseFenceContent` (decision 7). The divergent cloze
  builders therefore still exist and are still correct for that surface — they
  are simply off every rating path now.
- The unsynced-fence fallback (no store card) must stay a single unstepped
  render with no rating.

### Verify

1. A 3-cloze fence asks 3 questions in Note view and a bidi fence asks 2, each
   rated separately; the pill totals match.
2. Manual: study `tests/flashcard/fence-card-types.md`, press Stop, confirm
   `c1:`, `c2:` and `c3:` all moved — phase 2's fixture deliberately has all
   three due, and today only `c1` moves.
3. `npm run lint`, `npm test`, `npm run build` all clean.

### Then

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
- **Phase 2 — shipped** (`4d3e59e`). A fence plays the store's card —
  `card.front`, `card.back`, `card.id` — instead of re-deriving a pair from its
  source and rating an ID no card carries. Cloze reviews taken in a note now
  actually record. Source-derived rendering demoted to the fallback for a fence
  the store has no card for. Also fixed the pill on occluded fences.
- **Phases 3–5 — not started.**

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
3. **A multi-cloze fence in plain reading mode now blanks one group, not all of
   them**, a direct consequence of playing store cards. This diverges from live
   preview. Phase 3 decides whether to stack every group instead.

Manual testing confirmed by the user for all three. Fixtures:
`vault/tests/flashcard/fence-only-study.md` (two due fences + one scheduled to
2027) covers the target/non-target split, and
`vault/tests/flashcard/fence-card-types.md` covers the fanned-out types — a
three-group cloze with all groups due, a bidi pair, a basic control, a
not-due cloze, and an unsynced fence. Reset both after testing, as the repo
does for every fixture whose schedule a session moves.

## Surface map (expected)

| File | Change |
|---|---|
| `src/views/LineRevealProcessor.ts` | Button gate, session targets, progress pill, chrome refresh |
| `src/views/ContextualStudyProcessor.ts` | Play store cards; fallback path; card ID and fence key kept apart |
| `src/study/occlusion-steps.ts` | Generalize stepping beyond occlusion groups |
| `src/study/spatial-study.ts` | `cardsForFenceKey` (ask order); `spatialStudyKeys` splits on any derived card |
| `src/views/MindMapView.ts` | Bidi targets on the map |

The "delete divergent cloze builders" entry was dropped in phase 2 — see the
decisions under "Progress" for why.

## What's your current workaround?

Study those cards in sequential mode, which is the only surface that asks every
card. Cloze cards reviewed in Note view **before phase 2** need re-reviewing
there, since those ratings never reached the store; reviews taken since do
record, but a fence still only asks its first due card until phase 3.

## Reference Attachments/Screenshots

Fixture with basic fences and no line cards (reproduces the missing buttons):
`vault/tests/flashcard/deck-hierarchy/Data Science/Visualization/chart-types.md`