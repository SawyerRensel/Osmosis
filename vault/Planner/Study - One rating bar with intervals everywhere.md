---
title: Study - One rating bar with intervals everywhere
summary: "T136. Mind map, Cosmos and note line-card study use the flashcard rating bar (interval above each button, dark rounded container), from one shared component."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: In-Review
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
date_start_scheduled: 2026-11-28T03:48:26.000Z
date_start_actual: 2026-11-28T03:48:26.000Z
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
# Study - One rating bar with intervals everywhere (T136)

## Why
Five surfaces each draw their own rating bar, with five copies of `RATINGS`. Only flashcard study and note fence cards show the next interval above each button. Sawyer wants one bar everywhere: the flashcard one.

## Settled at intake (don't re-ask)
- **The bar:** mind map study, Cosmos study and note line-card study use the flashcard / fence bar. Each button has its interval label above it (for example "10m" over "Again"), inside the dark rounded container. Build **one shared component** (none exists today). Flashcard study and note fence cards switch to it too, so there is a single source.
- **Positions stay per surface:** next to the card in the mind map and in note line cards; in the bottom panel in Cosmos.
- **Cosmos** keeps its "N reviewed · N hidden here" line and drops "Rate it: keys 1–4." (the flashcard bar has no hint).
- **Several cards per item** (cloze, reversed): show the intervals of the card the next rating applies to, which is the first card due.
- Keyboard 1–4 rating is unchanged everywhere.

## Today (intake facts)
| Surface | Where | Intervals | Container |
|---|---|---|---|
| Flashcard study | `FlashcardStudyView.ts:53` RATINGS; bar :477 `osmosis-rating osmosis-study-rating-bar`; spans `osmosis-rate-interval` / `osmosis-rate-label` :481-484; filled :489-496 via `sessionManager.previewIntervals` | yes | `.osmosis-study-actions` (styles.css:1832-1846) |
| Note fence card | `NoteStudyProcessor.ts:1070` `showRating()`, in `.osmosis-note-actions` (:400, :668) | yes, `previewIntervals(cardId, revealedAt)` :1086/:1097 | not dark (styles.css:2322-2340) |
| Note line card | `LineRevealProcessor.ts:547` `showRatingBubble()`; may mount in an occlusion anchor (`mountRatingAnchor`) | no | none (styles.css:2494) |
| Mind map study | `MindMapView.ts:1942` `ensureRatingBubble()`, SVG foreignObject `.osmosis-mindmap-study-rating-fo` (CSS 2579-2596) | no | none |
| Cosmos study | `CosmosStudy.ts:79` RATINGS; `renderPanel()` :454; the hint | no | `.osmosis-cosmos-study` (styles.css:4306-4326) |

- `StudySessionManager.previewIntervals(cardId, now?)` is at `src/study/StudySessionManager.ts:99`; `formatInterval(ms)` is at `src/study/study-view.ts:20`.
- **Trap:** the session managers for line cards, the mind map and Cosmos are created lazily on the first rating (LineRevealProcessor.ts:603 "note", MindMapView.ts:2003 "mindmap", CosmosStudy.ts:251 "cosmos"). They must exist before the bar shows, or there is nothing to preview from. Create them when the bar is built, keeping the same session kind.
- One line, node or key can map to several cards (`cardIdsForLineKey`, `cardsForKey`, `cardIdsForMindmapKey`).
- The mind map bar sits in a foreignObject whose size is fixed in SVG units. The taller bar (interval row) needs its height re-fitted.

## Design
- Put a DOM-only `renderRatingBar(parent, {onRate, intervals?})` (plus the one `RATINGS` table) in a new `src/study/rating-bar.ts`. It must not import `obsidian`, so the button and label assembly can be unit-tested (see memory vitest-cannot-import-obsidian). Use jsdom if the repo's vitest is already set up for it; otherwise test the pure "pick the due card and its intervals" helper.
- The CSS consolidates on `.osmosis-rating` plus one container class. Remove the per-surface rules your change makes dead.

## Context budget (~80k)
- `src/views/FlashcardStudyView.ts` L45–60, L465–500, L1190–1210.
- `src/views/NoteStudyProcessor.ts` L395–405, L660–672, L1060–1110.
- `src/views/LineRevealProcessor.ts` L540–620.
- `src/views/MindMapView.ts` (`grep -a`): L1675–1690, L1940–2015, L6905–6930. **Only these.**
- `src/views/CosmosStudy.ts` (whole, 484 lines).
- `src/study/StudySessionManager.ts` L1–130; `src/study/study-view.ts` (whole, 112 lines).
- `styles.css` L1825–1850, L1955–1990, L2320–2380, L2490–2500, L2575–2600, L4300–4330.

## Acceptance criteria
- All five surfaces draw the bar from one component, with intervals above Again / Hard / Good / Easy.
- The first rating on a line card, a mind map node or a Cosmos node shows intervals before any rating has been made in that session.
- For a cloze line with several cards, the intervals are those of the first card due.
- Cosmos shows "N reviewed · N hidden here" and no key hint.
- Keys 1–4 still rate on every surface. Positions are unchanged.
- Unit test for the shared component or helper. lint, test and build pass.

## Test plan
Use cards in `vault/tests/` (back-date the fixture cards if you add any: memory manual-test-fixture-dates).
1. Flashcard study (deck → Study): the bar looks as before.
2. A note with fence cards in reading view: the bar has the dark container now, with intervals.
3. A note with line cards (`::`): reveal one. The bubble next to the line shows intervals in the dark container. Try a cloze line with two blanks.
4. Mind map study mode: reveal a node. The bar beside it shows intervals and isn't clipped.
5. Cosmos study: the bottom panel shows the same bar plus the reviewed line, and no "Rate it" hint.

## Batch implementation notes (awaiting manual test)

Code commit: `df8fc48` on `batch/18-one-map-layouts`.

### Approach
- `src/study/rating-bar.ts` holds the one `RATINGS` table and `renderRatingBar(parent, { onRate, intervals?, cls?, panel? })`, which returns `{ el, buttons, setIntervals }`. Each button is `span.osmosis-rate-interval` over `span.osmosis-rate-label`, with `aria-label` "Again (1)" and so on. A click calls `onRate` and stops propagation. The module has no `obsidian` import. It uses Obsidian's global `createDiv` / `createEl` helpers, as lint asks, and the test installs them through `src/test/obsidian-stub.ts`.
- `previewCardId(cards, ids, now)` picks which card's intervals to show when one item carries several cards. The rule is study-queue order: the overdue card that has waited longest, else the first new card in the item's order, else the card due soonest.
- All five surfaces call it. Flashcard study keeps `setIntervals` on flip. The fence card passes `intervals` up front. Line cards, mind map and Cosmos now create their session manager when the bar is built, keeping the same kind ("note", "mindmap", "cosmos"). The old lazy `??=` in each rate path is left as a harmless no-op.
- Cosmos renders no hint row while a card is revealed. The "N reviewed · N hidden here" progress line is unchanged.

### Decisions
- **Panel ownership.** `panel: true` adds `.osmosis-rating-panel`, which uses the study tab's `.osmosis-study-actions` look. The two now share one rule for background, radius, blur and shadow. The panel is on for fence cards, line cards and the mind map. It is off for flashcard study and Cosmos, whose existing panels already contain the bar. A second dark box nested inside would look doubled.
- **Fence card after rating.** The bar empties to "Rated: Good" and drops its panel class, so the verdict reads as plain text and not as a dark pill.
- **Button sizing.** Every `.osmosis-rating button` is now the two-row column: `flex: 1 1 0`, `min-width: max-content`, `height: auto`, padding `4px 6px`. `max-content` keeps Cosmos's content-sized row from squeezing labels. `height: auto` overrides Obsidian's one-line button height. Flashcard and fence cards keep their fixed `--osmosis-study-button-height`, through the existing higher-specificity rules.
- **Widths.** Line bubble and mind map bubble are 260px wide, with `max-width: 100%`. The mind map foreignObject is at least 260 wide (was 240) and 56 tall (was 40). The occlusion anchor stays 240px, and the bar fills it.
- **Cloze on line cards.** Line cards have no cloze generator. A line key carries several cards only when the line is occluded. In study, an occluded line is stepped one group at a time, so the bar shows that group's card. The "first due" rule therefore matters mainly for mind map and Cosmos keys that were not split, and for a line rated outside stepping. The cloze case is covered by unit tests.

### Surface map
| File | Change |
|---|---|
| `src/study/rating-bar.ts` | New: `RATINGS`, `renderRatingBar`, `previewCardId` |
| `src/study/rating-bar.dom.test.ts` | New: bar assembly, classes, click and propagation, `setIntervals`, preview-card rule |
| `src/views/FlashcardStudyView.ts` | Uses the shared bar; drops its `RATINGS` and `intervalEls` |
| `src/views/NoteStudyProcessor.ts` | `showRating` uses the shared bar with panel; drops the panel after rating |
| `src/views/LineRevealProcessor.ts` | `showRatingBubble` uses the shared bar with intervals; new `ratingCardIds` shared with `rate()` |
| `src/views/MindMapView.ts` | `ensureRatingBubble` uses the shared bar with intervals; foreignObject 260×56 minimum |
| `src/views/CosmosStudy.ts` | Uses the shared bar with intervals; no hint while revealed; drops `RATINGS` |
| `src/views/CosmosStudy.dom.test.ts` | Mock `previewIntervals`; new "rating bar" test (intervals before any rating, progress line, no hint) |
| `src/views/NoteStudyProcessor.dom.test.ts` | Fence bar asserts `.osmosis-rating-panel` |
| `styles.css` | Shared panel rule; button column rules moved from `.osmosis-study-rating-bar` to `.osmosis-rating`; line and mind map widths; dead anchor background and button rules removed |
| `e2e/fixtures/study-rating-bar.md`, `vault/tests/flashcard/study-rating-bar.md` | New fixture |

### Fixture
`vault/tests/flashcard/study-rating-bar.md`, deck **Testing › Rating Bar**, should read 2 | 0 | 4. It has 3 line cards (1 due through `osmosis-schedule`, 2 new), a due basic fence and a two-group cloze fence (both groups due, with different stabilities, so their Good intervals differ: about 1.5mo vs 13d). Every card is new or back-dated.

### Not verified
- Nothing was checked visually in Obsidian. That includes the panel look in light and dark themes, the bubble fitting inside the mind map foreignObject, Cosmos on tablet and phone, and the occlusion anchor.
- Keys 1–4 are untouched in code: the mind map, Cosmos and flashcard handlers call the rate functions directly. They have not been exercised by hand.
