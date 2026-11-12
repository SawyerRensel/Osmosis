---
title: Study - Note view study menu
summary: "The note view's Study button opens a menu: Study here (in-note), This note (popup), Deck… (popup, submenu if several decks). Adds a single-note scope to the sequential study popup."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Header - Note header gateway and overflow menu]]"
  - "[[Sequential study as a view instead of a modal]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T12:00:00.000Z"
date_modified: "2026-11-12T12:00:00.000Z"
date_start_scheduled: "2026-11-12T05:20:31.000Z"
date_start_actual: "2026-11-12T05:20:31.000Z"
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

# Feature Request

## What do you need built?

When Sawyer taps Study in a note's header, a menu lets them choose how to study:

1. **Study here** — contextual, in-note study (today's behaviour).
2. **This note (popup)** — the sequential study popup, scoped to this note's cards only.
3. **Deck… (popup)** — the sequential popup on the deck this note's cards belong to. One deck → start it directly; several → a submenu lists them.

## What problem does this solve?

From a note, the only option is in-note study. Popup (sequential) study is reachable only from the dashboard, Stats, or the "Study all decks" command, and can't be scoped to one note.

## What's your current workaround?

Open the dashboard and pick the deck.

## Decisions (settled with Sawyer, 2026-11-12 UI feedback grilling; not to be re-decided)

- **Note view only.** The 2D (spatial) and 3D (relational) Study buttons keep starting their mode directly.
- One flat menu, **no remembered default** — Sawyer picks every time.
- While an in-note session is running, tapping Study **stops it directly** (no menu), as today's toggle does.
- If the note has no cards the Study button is already hidden — keep that.
- Popup stays a **modal** for now; [[Sequential study as a view instead of a modal]] is separate.
- "Deck…" studies the deck exactly (`{type:"single"}`), not its sub-decks.

## Code facts (scout, 2026-11-12 — spot-check line numbers)

- Study button: `LineRevealProcessor.updateHeaderActions` (`src/views/LineRevealProcessor.ts:727-799`); click → `toggleStudy(notePath)` (~`:577`).
- Popup: `plugin.openStudySession(scope: DeckScope)` (`main.ts:1237`) → `SequentialStudyModal` (`src/views/SequentialStudyModal.ts`) with a `StudySessionManager` (`src/study/StudySessionManager.ts`).
- `DeckScope` (`src/study/types.ts:11`) = `single | parent | all`. Due/new queries switch on it in `StudySessionManager` (~`:321-334`) and counts at ~`:258`. `DeckScope` is also used in `src/stats/aggregate.ts`, `DashboardSidebarView.ts`, `StatsView.ts` — exhaustive switches there will need the new case.
- `CardStore.getCardsByNote(notePath)` exists (`src/store/CardStore.ts:48`); `Card` has `notePath` and `deck` (`src/database/types.ts:112`).
- Suggested scope: add `{ type: "note"; notePath: string }` to `DeckScope`; filter due/new by `notePath`. Daily new/review limits still apply.
- Menu: Obsidian `Menu` with `showAtMouseEvent`; submenu via `item.setSubmenu()` (works on desktop; on mobile verify — fall back to listing decks inline if submenus misbehave).

## Context budget

Medium: `StudySessionManager.ts`, `SequentialStudyModal.ts`, `LineRevealProcessor.ts` ranges, `main.ts` range. Don't open `MindMapView.ts`.

## Acceptance criteria

- Study (not running) opens the 3-item menu; each item does what it says.
- "This note (popup)" shows only this note's due and new cards; respects daily limits; the modal title/breadcrumb names the note.
- "Deck…" starts directly with one deck, shows a submenu with several.
- Study while an in-note session runs stops it.
- Dashboard / Stats / "Study all decks" unchanged.

## Test plan

Unit: `StudySessionManager` with a `note` scope returns only that note's due/new cards (and counts); deck list for a note is de-duplicated and sorted.

Manual: fixture in `e2e/fixtures/` copied to `vault/tests/` — two notes, one with cards in two decks (back-dated per fixture convention; neutral topic). Ctrl+R after copying.
1. Open the two-deck note → Study → menu shows three items; Deck… shows a submenu of both decks.
2. This note (popup) → only this note's cards appear.
3. Study here → in-note study; tap Study again → stops.
4. Open the one-deck note → Deck… starts directly.

## Batch implementation notes (awaiting manual test)

**Approach.**
- *Scope.* Added `StudyScope = DeckScope | { type: "note"; notePath }` in `src/study/types.ts` instead of widening `DeckScope`. Stats, the dashboard and the deck pickers only deal in decks, so widening `DeckScope` would have forced a meaningless `note` case into `deckInScope`, `scopeToValue` and friends. `StudySessionManager.buildQueue/getCounts`, `SequentialStudyModal` and `plugin.openStudySession` take `StudyScope`.
- *Queries.* Pure helpers in `src/study/note-scope.ts` (`dueCardsInNote`, `newCardsInNote`, `decksOfNote`) apply the same rules as the `CardStore` deck queries (opted-out and disabled cards skipped, no `due` is new, due oldest first). The manager feeds them `store.getCardsByNote`. Daily limits apply as before because they are applied in `buildQueue` after the query.
- *Modal.* A note-scope session shows a muted `.osmosis-study-scope` line with the note's basename above the progress bar. The deck breadcrumb is untouched (opt-in, names the card's deck).
- *Button.* `createHeaderAction` now passes the click event to its callback and takes an optional `switchToPreview(path)` predicate (default true, so Peek-era callers are unchanged). The Study button passes `state.mode === "study"`: while a session runs, a tap stops it directly (reading view is already on); otherwise it opens `showStudyMenu` without switching the note to reading view. Only the "Study here" item switches to reading view (`ensurePreview`, extracted from the old inline code) and then calls `toggleStudy`.
- *Menu.* Study here, This note (popup), then the deck entry: one deck gives a single item `Deck: <name> (popup)` that opens `{type:"single"}` directly; several decks give `Deck… (popup)` with a submenu. Order [brain][Study][Edit][⋯] and the 2D/3D Study buttons are untouched.

**Decisions worth remembering**
- `setSubmenu` is not in the published Obsidian typings, so it is feature-detected via a cast and only tried on desktop (`!Platform.isMobile`). On mobile, or if it is absent, the menu falls back to a disabled `Deck… (popup)` label followed by one `Deck: <name> (popup)` item per deck. This is the fallback the ticket allowed; it was not seen on screen.
- A note with cards that are all opted out of decks has no deck item (nothing to start); the other two items remain.
- Single-deck label includes the deck name (`Deck: tea (popup)`) rather than a bare `Deck…`, so Sawyer can see which deck will open. Studies the exact deck, not sub-decks, per the settled decision.
- An empty note-scoped session shows the existing "No cards due" screen.
- Commit trailer uses the model named in this session's attribution reminder (Sonnet 5.5), not the brief's Opus line.

| File | Change |
|---|---|
| `src/study/types.ts` | New `StudyScope` |
| `src/study/note-scope.ts` (+test) | New pure note queries and `decksOfNote` |
| `src/study/StudySessionManager.ts` | `StudyScope`; `note` case in due/new queries |
| `src/views/SequentialStudyModal.ts` | `StudyScope`; note title line |
| `src/main.ts` | `openStudySession(scope: StudyScope)` |
| `src/views/LineRevealProcessor.ts` | Study click: stop directly or `showStudyMenu`; `ensurePreview`; `createHeaderAction` passes the event and takes `switchToPreview` |
| `styles.css` | `.osmosis-study-scope` |
| `docs/studying/study-modes.md`, `docs/reference/commands.md` | Study menu wording |

**Fixture.** `e2e/fixtures/study-menu/` copied to `vault/tests/study-menu/`: `two-decks.md` (decks `coffee` and `tea`, one back-dated due and one new card in each) and `one-deck.md` (deck `tea`, one due and one new). All schedules are dated before 2026-11-12. Press Ctrl+R after the copy.

**Not verified (cannot see Obsidian).** That `setSubmenu` renders and works on desktop; the inline fallback on mobile; the menu position when opened from the header on a phone; the note title line layout in the modal.
