---
title: Create Card Browser - Editor
summary: What if you could view and manage all of your flashcards via Obsidian Bases?
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-03T18:15:16.185Z
date_modified: 2026-08-06T21:01:49.772Z
date_start_scheduled: 2026-08-08T15:01:06.000Z
date_start_actual: 2026-08-08T15:01:06.000Z
date_end_scheduled: 2026-08-08T17:16:01.000Z
date_end_actual: 2026-08-08T17:16:01.000Z
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
parent: "[[Osmosis Dashboard]]"
children:
blocked_by:
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/18
---
# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

A card browsing system powered by Obsidian Bases.  What if you could browse, sort, filter every card using Bases' native system?  What if you could view them as a table, list, or cards?  What if you could save your configuration as a `.base` file?  Anything that has scheduling data is included, from flashcards in Osmosis code fences to generated line cards from a note.  

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

There's no way to conveniently browse, sort, filter, and view all cards across all decks in Obsidian. 

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*

Traversing across multiple notes in Obsidian to find their cards, or studying a deck's flashcards and clicking the reveal card in note button in the sequential study dialog window. 

## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

---

# PRD

## The constraint that shapes everything

**Bases rows are files. A plugin cannot supply rows.** Verified against
`ref/obsidian-api/obsidian.d.ts`:

- `BasesEntry` — *"Represent a single row or file in a base"* — carries a
  required `file: TFile` (line 685)
- `BasesPropertyType = 'note' | 'formula' | 'file'` (line 961) — values come
  from frontmatter, file metadata, or formulas. There is no plugin source.
- `QueryController` (line 5315) is an empty opaque class — no injection point

A note routinely holds many cards, and explicit cards live in ```osmosis fences
that Bases cannot see at all, since fence bodies are not frontmatter. So
one-row-per-card is not achievable through Bases, at any amount of effort.

## The split

**Bases owns which notes appear. Osmosis owns the cards inside them.**

Register a custom view with `registerBasesView("osmosis-cards")`. Bases handles
the note-level query, filtering, sorting, and `.base` file persistence — the
native system the task asks for. The Osmosis view expands each returned note
into its cards and supplies per-card controls itself.

```
Bases query  →  notes matching filter
                        ↓
Osmosis view renders per note:

  ▾ Geography/Rivers.md              deck: geography   4 cards
      os-wcfb3w  line      review     due Aug 12
      os-qsckj3  line      learning   due today
  ▾ Languages/Spanish.md             deck: es          3 cards
      es-greeting  explicit_bidi  learning   due today
      es-food-c1   explicit_cloze new        —
```

Be honest about what this costs: a `.base` filter cannot express "cards due
today", only "notes that have cards". Note-level filtering is still genuinely
useful — `osmosis-cards`, `osmosis-deck`, folder, and tags are all real
properties — but every per-card predicate is Osmosis code.

## Per-card controls persist in the `.base` file

Expose them through `BasesViewRegistration.options`, which Bases stores in the
`.base` file. That is what satisfies *"save your configuration as a `.base`
file"* for card-level settings, not just note-level ones.

| Option | Values |
|---|---|
| `layout` | `table` / `list` / `cards` — covers the three requested view shapes in one registered view |
| `cardState` | all / new / learning / review / relearning |
| `dueWindow` | any / overdue / today / next 7 days / next 30 days |
| `cardType` | all / explicit / bidi / cloze / code cloze / line / occlusion |
| `sortBy` | due / state / stability / difficulty / reps / lapses / note / deck |
| `showDisabled` | include cards excluded from decks |

## Columns

Card ID, type, deck, state, due, stability, difficulty, reps, lapses, source
note, and a front-text preview. Read from `CardStore`, which already exposes
`getAllCards()`, `getCardsByNote()`, and `getCardCountsByDeck()`.

## Operations

Content editing stays in Obsidian — the same reasoning that cancelled
[[Flashcard creator wizard]]. The browser mutates *scheduling*, not text.

- **Click a row** → open the source note at that card's line. `Card.sourceLine`
  already exists.

Three distinct mutations, deliberately kept separate rather than collapsed —
they have very different consequences and must not be confusable:

| Operation | Effect | Reversible? | Touches note content? |
|---|---|---|---|
| **Suspend / unsuspend** | Out of study; FSRS state preserved | Yes, fully | No |
| **Reset scheduling** | Card returns to new; FSRS state cleared | No — but review log survives | No |
| **Delete card** | Card ceases to exist | No | **Yes** |

- **Suspend** → `CardStore.setDisabled()`, already implemented
- **Reset** → `CardStore.clearSchedule()`, already implemented. Log entries are
  retained; see [[Review log storage]] and [[Reset card scheduling data]]
- **Delete** → removes the source line or fence from the note. This is the only
  one that edits user content, so it goes through `ConfirmModal` naming every
  affected file, and it must be visually separated from the other two in the
  toolbar.
- **Change deck** → ⚠️ per-*note* only. Line cards inherit their deck from
  `osmosis-deck` frontmatter or the folder, so there is no per-card deck to set.
  The UI must reflect this: offer it on the note row, disable it on card rows.

Multi-select with checkboxes; operations apply to the selection.

## Entry point

The hub's Browse button (see [[Osmosis Dashboard]]) opens `Osmosis/Cards.base`,
creating it preconfigured with the `osmosis-cards` view if absent. One
implementation serves both surfaces — the hub button is a shortcut to a `.base`
file, not a second browser. Users can then edit it, or add the Osmosis Cards
view to any `.base` of their own.

## Surface map

| File | Change |
|---|---|
| `src/views/CardBrowserView.ts` | New — the `BasesView` subclass |
| `src/main.ts` | `registerBasesView("osmosis-cards", …)`; Browse command |
| `src/store/CardStore.ts` | Query helpers for per-card filter/sort if needed |
| `src/styles.ts` | Browser table/list/card layouts |

## Acceptance criteria

- [ ] "Osmosis Cards" appears in the Bases view-type picker
- [ ] Every card in a returned note is listed, from both fences and lines
- [ ] Explicit, bidi, cloze, code-cloze, and line cards all appear correctly typed
- [ ] All three layouts render; the choice persists in the `.base` file
- [ ] Every per-card option persists in the `.base` file and survives reopening
- [ ] Clicking a row opens the note scrolled to that card's line
- [ ] Suspend, reset, and delete are three separate actions and apply to a multi-selection
- [ ] Suspend is reversible and preserves FSRS state
- [ ] Reset clears FSRS state but leaves review log entries intact
- [ ] Delete confirms first, names affected files, and is visually separated from the other two
- [ ] Change deck is offered on note rows and disabled on card rows
- [ ] Deck counts in the sidebar update after a mutation
- [ ] `npm run lint` and `npm test` clean

## Test plan

Unit: per-card filter and sort predicates, card→row projection, the
note-grouping transform. These are pure functions over `Card[]`.

Manual fixture — `e2e/fixtures/flashcard/browser-mixed.md`, copied to `vault/`:
one note holding an explicit card, a bidi card, a cloze card with two groups,
and several line cards, so one note demonstrably expands into many rows.
Plus a second note in another deck to exercise grouping.

## Follow-ups

- Note-level rollup properties (card count, due count, next due) written to
  frontmatter, which would let users build genuine note-level Bases filters
  without the custom view — separate task if wanted
- Inline front/back editing, deliberately excluded here

---

# What was implemented

## Where it shipped

PR [#18](https://github.com/SawyerRensel/Osmosis/pull/18), branch
`feature/card-browser-editor` → `release/0.0.4`. Fourth of the milestone's five
tasks, after [[Review log storage]], [[Osmosis Dashboard]] and [[Osmosis stats
dashboard]].

**The four mutations did not ship.** Suspend/unsuspend, reset, delete and change
deck, plus multi-select and the sidebar count refresh, are all deferred. The
browsing surface turned out to be the whole of a task on its own. See Follow-ups.

## The premise held, and its second half was the surprise

The PRD's constraint — Bases rows are files, so one row per card is unreachable
— was re-verified and is still true. What the PRD did not anticipate is how far
that constraint reaches: **it also rules out the toolbar.**

Sort, Filter, Properties and Search all operate on `BasesPropertyId` values, and
Bases applies the resulting config to *entries* before `onDataUpdated` fires. By
the time the view has `data`, filtering and sorting have already happened at note
level. `BasesPropertyType` is a closed union (`'note' | 'formula' | 'file'`),
there is no property-registration API, and `registerBasesView` is the only Bases
method on `Plugin`. So there is nowhere to inject a card, and no amount of
effort makes "filter to cards due today" a toolbar operation.

This is the single most useful thing to know before touching this view again.
The answer is not to keep looking for the hook — it is that **every card-level
control belongs in `BasesViewRegistration.options`**, which Bases still persists
into the `.base` file. That is where search, the type toggles, the sort key and
the height slider all live.

What the toolbar *can* still do, the view honours: `groupedData` renders as an
outer level above the note grouping, and the `base` sort value defers to the
note ordering Bases produced instead of overwriting it. Both were bugs first —
the view read `data` and ignored `groupedData`, and the table re-sorted globally
over the top of Bases' order, so both menus looked broken.

## The parser change, which was not in the plan

`exclude: true` on a fence used to `continue` at generation, so the card was
never created. That made "suspend" unreachable for fence cards: the card left
the store, and the browser cannot list what does not exist, so nothing could
unsuspend it. Line cards did not have this problem — their `disabled` flag lives
in `osmosis-schedule` frontmatter and the card stays in the store.

Fixed by generating the card and carrying `disabled` onto it. This is
behaviour-preserving everywhere outside the browser, and the reason is worth
recording because it is what made the change safe to make:

- Every store query that decides study or counts already skips disabled cards —
  `getDueCards`, `getNewCards`, both deck-prefix queries,
  `getCardCountsByDeck`, `getAllDecks`. A disabled card and an absent one are
  already indistinguishable to all of them.
- Reading view never consulted the store for this. `ContextualStudyProcessor`
  reads `exclude` straight out of the fence text and renders the greyed card
  with its eye-off toggle, so an excluded fence looked the same before and after.

`CardStore` had **no test coverage of `disabled` at all**, which is why that
argument was unverified when it was made. It has five tests now.

## Decisions worth remembering

- **Task 2's `ItemView` was deleted, partially reversing PR #16.** A `BasesView`
  is built by Bases through a `QueryController` a plugin cannot fabricate, so an
  `ItemView` cannot host one — keeping both meant two browsers. What survived is
  both *entry points*, repointed at the `.base` file: the `open-card-browser`
  command kept its id so bound hotkeys still work, and the sidebar button kept
  its place. PR #16's criteria "sidebar shows a Browse button" and "reachable
  from the command palette" both still hold. A saved workspace holding an
  `osmosis-card-browser` leaf shows Obsidian's "no view of type" placeholder
  once.
- **Delete a line card by stripping its block ID, not its line.** The PRD said
  "removes the source line or fence". For a fence that is right — the fence *is*
  the card. For a line card it would destroy the user's prose, which contradicts
  the PRD's own governing principle that the browser mutates scheduling, not
  content. Decided before the mutations were deferred; it still stands for
  whoever builds them.
- **Change deck writes `osmosis-deck` and warns rather than rewriting fences.**
  Fence cards can carry their own `deck:` key, which the PRD's "per-note only"
  design missed. Stripping those would edit fence bodies — user content — and
  discard a per-card choice made deliberately. Also decided ahead of the
  deferral.
- **`occlusion` is absent from the type filter.** A filter value that can never
  match reads as a broken control. It arrives with the card type in
  [[Develop Image Occlusion System for Flaschards]].
- **An empty card-type selection means "no constraint", not "nothing".**
  Unchecking all five toggles shows everything rather than a blank panel, which
  would read as a bug. Absent keys count as on, so a base file written before a
  card type existed does not hide it.
- **Card columns are fixed, not `config.getOrder()`.** That order lists *note*
  properties; the view's columns are card fields. Same reason Bases' Properties
  menu does nothing here.
- **Markdown rendering is deferred, not eager.** `MarkdownRenderer.render` with
  `sourcePath` set to the card's own note, so relative images and embeds resolve
  as they do in the note. An `IntersectionObserver` with 200px of lead-in
  renders each element once; the plain-text preview goes in first so rows have
  their height before the render lands.
- **The table needs both `table-layout: fixed` *and* `min-width`.** Fixed layout
  is what lets Front and Back absorb leftover width, but below the sum of the
  fixed columns those two collapse to zero — which is exactly what a split pane
  or two open side panels does. `min-width: 1240px` makes it scroll sideways
  instead. Cells also need `overflow: hidden`; without it a long deck path
  paints straight over the State badge.
- **Card state colours are the dashboard's deck-count palette, duplicated
  deliberately.** New is `--interactive-accent`, learning and relearning are
  `hsl(30, 75%, 50%)`, review is `hsl(140, 50%, 42%)`, each on a 12% tint.
  Changing one means changing both; both sides carry a comment saying so.
- **The sticky group header's 30px height is a shared CSS variable.** The table
  header sticks to exactly that offset, and only inside a Bases group — ungrouped
  there is no group header and it sticks to the top. If a theme reflows that
  header the two will misalign; that is the place to look.
- **The generated base is gitignored** (`vault/Osmosis/`). It is created on first
  Browse and then edited by whoever uses the vault, so it churns on every layout
  or filter change.

## Surface map

| File | Change |
|---|---|
| `src/browse/cards.ts` | New — all pure logic: option narrowing, filter predicates, search, sort comparators, note grouping, row projection |
| `src/browse/cards.test.ts` | New — 68 tests, the bulk of the task's coverage |
| `src/views/CardBrowserView.ts` | Rewritten from `ItemView` to `BasesView`; three layouts, deferred markdown, `createCardBrowserRegistration` |
| `src/main.ts` | `registerBasesView`; dropped `registerView(VIEW_TYPE_CARD_BROWSER)`; `openCardBrowser()` creates/opens the base; command repointed; `basesAvailable` |
| `src/views/DashboardSidebarView.ts` | `renderOperator` takes a callback instead of a view type; Browse opens the base |
| `src/card-gen/explicit.ts` | `exclude: true` generates a `disabled` card instead of skipping |
| `src/card-gen/types.ts` | `GeneratedCard.disabled` |
| `src/card-gen/CardSyncService.ts` | Fence cards source `disabled` from the generated card |
| `src/card-gen/explicit.test.ts`, `note-processor.test.ts` | Six tests rewritten from the old skip contract, plus bidi and schedule-preservation cases |
| `src/store/CardStore.test.ts` | Five tests covering `disabled`, previously uncovered |
| `styles.css` | New "Card browser" section; removed `.osmosis-operator-view` / `-placeholder`, orphaned by the `ItemView` deletion |
| `.gitignore` | `vault/Osmosis/` |

## Test fixtures

`e2e/fixtures/browser-mixed.md` — one note holding a basic card, a bidi card, a
two-group cloze, a code cloze, a suspended fence and four line cards, so one
note demonstrably expands into ten rows. `e2e/fixtures/browser-second-deck.md`
adds a second deck and a fence carrying its own `deck:`, for the change-deck
case. Both copied to `vault/tests/flashcard/`.

No jsdom smoke test. The view renders no SVG, so the `charts.dom.test.ts`
polyfill has nothing to catch here, and every branch worth testing was extracted
into `browse/cards.ts` as a pure function instead.

## Follow-ups

- **The four mutations** — suspend/unsuspend, reset, delete, change deck — with
  multi-select checkboxes, a `ConfirmModal` for delete naming affected files,
  and `plugin.refreshDashboard()` after each. The two design decisions above
  (block-ID delete, deck-change warning) are already settled.
- [[Clicking dashboard graph opens filtered card browser]]
- [[Develop Image Occlusion System for Flaschards]] adds `occlusion` to the card
  type toggles.
- Bases' Properties menu is inert in this view. Note-level rollup properties
  (card count, due count, next due) written to frontmatter would give it
  something real to act on — see the PRD's follow-up above.