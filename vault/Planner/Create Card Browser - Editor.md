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
status: In-Progress
priority:
progress_current:
progress_total:
date_created: 2026-08-03T18:15:16.185Z
date_modified: 2026-08-06T21:01:49.772Z
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
parent: "[[Osmosis Dashboard]]"
children:
blocked_by:
cover:
color:
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