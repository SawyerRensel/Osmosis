---
title: Decks page tab and the Flashcard study toggle
summary: "T103. A Decks page in the main area, identical to the sidebar dashboard; the ribbon opens it in a new tab, and the Flashcard study tab's cap action toggles back to it."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
batch: 14
priority:
progress: 100
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-21T06:37:55.000Z
date_start_scheduled: 2026-11-20T17:32:57.000Z
date_start_actual: 2026-11-20T17:32:57.000Z
date_end_scheduled: 2026-11-21T06:37:55.000Z
date_end_actual: 2026-11-21T06:37:55.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/52
---

# Decks page tab and the Flashcard study toggle (T103)

## What Sawyer asked
> In Flashcard study mode, we need a study icon button in the header like other study modes have it. Toggling it off takes you back to a new Decks main page area. It's identical to the Decks dashboard in the sidebar. Clicking the Osmosis `brain-circuit` button in the Obsidian ribbon opens this Decks page in a new Obsidian tab.

## Settled with Sawyer
- The sidebar dashboard stays, opened by the existing `open-dashboard` command. The ribbon now opens the Decks page in a **new tab**.

## Current state
- `src/views/DashboardSidebarView.ts` (175 lines): `render()` 49–100 builds into `contentEl` (Browse/Stats bar, column headers, "Study all", deck tree via `renderDeckTree` 117–158, `renderCounts` 160–168); 60 s refresh at :36. Nothing sidebar-specific except the view type.
- `main.ts`: `registerView` ~294; ribbon ~312–314 → `activateDashboard` (~1225–1245, `getLeftLeaf`); `refreshDashboard` ~1215–1223 (must refresh both views); `activateMainView` ~1251; `openStudySession` ~1305–1312.
- `SequentialStudyView.ts`: header actions ~176–178 (Exclude, Open note, Undo); `updateHeaderActions` ~349; its own deck picker `renderPicker` ~364–420 duplicates the dashboard's tree/counts.

## Design
- Extract the dashboard's rendering into one shared renderer (e.g. `src/views/deck-dashboard.ts`, `renderDecksDashboard(containerEl, plugin)`), used by the sidebar view and a new main-area `DecksView` (`VIEW_TYPE_DECKS`, icon `brain-circuit`, title "Decks").
- Ribbon → open `DecksView` in a new tab (`getLeaf("tab")`).
- Flashcard study tab: add a `graduation-cap` header action with the shared study-cap class from T100, `is-active` while a session runs. Toggling it off ends the session (`endSession()`, which flushes) and turns **this same tab** into the Decks page (`leaf.setViewState({type: VIEW_TYPE_DECKS})`). Starting a deck from the Decks page reuses the tab (`openStudySession`).
- Replace the study tab's own deck picker (`renderPicker`) with the Decks page: wherever it showed the picker (empty state, restart with no session, "Choose a deck"), switch the leaf to the Decks view. Remove the then-dead picker code.
- Dashboard refresh must reach every open Decks tab as well as the sidebar.

## Acceptance criteria
- The ribbon opens a Decks tab identical in content and behaviour to the sidebar dashboard.
- In the Flashcard study tab, the cap is accent-coloured while studying; clicking it ends the session (ratings saved) and shows the Decks page in that tab.
- Studying from the Decks page opens/reuses the study tab; counts on both dashboards update after a session.

## Test plan
Ribbon → Decks tab; study a deck; cap off mid-session → Decks page, counts updated; restart Obsidian with a study tab open → Decks page; sidebar dashboard still opens via command; phone.

## Context budget (~55k tokens)
- `DashboardSidebarView.ts` whole (175); `main.ts` 285–320, 380–395, 1210–1320; `SequentialStudyView.ts` 160–260, 340–430, 1020–1100.

## Conventions
- Batch 14 ticket: commit `feat(T103): …`/`fix(T103): …` plus one `docs(T103)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.

## What was implemented

**Where it shipped:** [PR #52](https://github.com/SawyerRensel/Osmosis/pull/52) (batch 14, branch `batch/14-study-polish-renames`), merged into `release/0.0.6`. Sawyer tested it by hand and passed it on the first test, on 2026-11-20. Round 2 added two fixes: d21024f (title-case tab titles, phone navbar clearance) and F1 (study returns to the tab it was launched from). Both passed Sawyer's second test.

The batch worker wrote this record when the code was committed.

Code commit: `7ea31e1` on `batch/14-study-polish-renames`.

### Approach
- The sidebar dashboard's whole body (operators, column headers, Study all, deck tree, counts) moved verbatim into `renderDecksDashboard(containerEl, plugin, openStudy)` in `src/views/DecksDashboard.ts`. The sidebar view and the new `DecksView` both call it; they differ only in what a deck click does.
- `DecksView` (`VIEW_TYPE_DECKS = "osmosis-decks"`, icon `brain-circuit`, title "Decks") renders into an `.osmosis-decks-column` inside `.osmosis-decks-view`, with the same 60 s refresh as the sidebar. `refreshDashboard()` now redraws the sidebar and every loaded Decks tab, so counts move after a session and after the startup sync.
- Ribbon (tooltip "Osmosis decks") calls the new `activateDecksTab()`. The `open-dashboard` command still opens the left-sidebar dashboard.
- Study tab: a `graduation-cap` header action "Flashcard study" with class `osmosis-study-cap`, `is-active` while `studyScope !== null`. Clicking it runs `showDecks()`: `endSession()` (flushes ratings and the review log, refreshes dashboards), then `leaf.setViewState({ type: VIEW_TYPE_DECKS })` on the same leaf.
- The study tab's own deck picker (`renderPicker`, `renderPickerRow`, the `active-leaf-change` and `cardStoreReady` re-renders, and the `.osmosis-study-picker*` CSS) is gone. "Choose a deck" on the empty screen now goes to the Decks page.
- `openStudySession(scope, fromLeaf?)`: if a loaded study tab exists, start there and reveal it (unchanged). Otherwise the opening leaf is the restored-but-deferred study tab, else `fromLeaf` (a Decks tab), else a new tab. The scope travels through `plugin.pendingStudyScope`: the view takes it in `onOpen` via `takePendingStudyScope()`.

### Decisions
- **The ribbon reuses an open Decks tab instead of stacking another one.** It uses `activateMainView`, as Stats does, and redraws the tab. Sawyer's wording was "opens in a new tab". The ribbon still gives a main-area tab rather than the sidebar, but a second click reveals the first Decks tab. To always open a fresh tab, change `activateDecksTab` to `getLeaf("tab").setViewState(...)`.
- **What a deck click on a Decks tab does.** If a study tab is already open, that tab is used, so the "only one study tab" rule holds and the Decks tab stays. Otherwise the Decks tab itself becomes the study tab, so toggling the cap off and then picking a deck stays in one tab. A deck click in the sidebar keeps its old behaviour: it uses the study tab, or opens a new one.
- **The cap stays lit on the "Session complete" and "No cards due" screens.** It is lit whenever the tab holds a scope, which is always the case once a study tab exists. Clicking it always leads to the Decks page, so lit means the tab is in study mode. Because the flush runs in `endSession`, ratings are saved before the switch.
- **A bare study tab becomes the Decks page.** This covers a tab restored after a restart and the `open-study` command. `onOpen` runs inside the `setViewState` that is opening the view, so the switch is deferred with `setTimeout(0)`, guarded by `studyScope === null && leaf.view === this`. Passing the scope through a plugin field rather than view state is deliberate. `getState` stays empty, so a restored tab never resumes a stale queue, and `onOpen` runs before `setState`. As a result, `onOpen` could not tell a new session from a bare open any other way.
- **The Decks tab content uses a 700 px centred column.** That is the study tab's column width, and it keeps the counts near the deck names in a wide tab. The content and classes are otherwise identical to the sidebar. The count colours come from the existing `.osmosis-dashboard` rule, because the column div carries that class.
- **No identifiers or stored values were renamed** (T105's job). The new user-facing label is "Flashcard study".
- No new pure logic, so no new unit tests. The change is view wiring only.

### Surface map
| File | Change |
|---|---|
| `src/views/DecksDashboard.ts` | New. The shared dashboard renderer, moved from the sidebar view |
| `src/views/DecksView.ts` | New. Main-area Decks tab (`osmosis-decks`) |
| `src/views/DashboardSidebarView.ts` | `render()` delegates to the shared renderer |
| `src/views/SequentialStudyView.ts` | Cap action and `showDecks()`; picker removed; `onOpen` takes the pending scope or turns into the Decks page |
| `src/main.ts` | Registers `DecksView`; ribbon calls `activateDecksTab()`; `refreshDashboard` covers Decks tabs; `openStudySession(scope, fromLeaf?)` with `pendingStudyScope` / `takePendingStudyScope()` |
| `styles.css` | `.osmosis-decks-column`; dead `.osmosis-study-picker*` rules removed |

### Fixture
Reused `vault/tests/flashcard/study-tab.md` (deck Testing › Study Tab, 6 waiting) and `vault/tests/flashcard/deck-hierarchy/` (nested decks, for collapse in the tab). No new fixture.

### Not verified
- Not run in Obsidian: the deferred redirect of a bare or restored study tab, the header order of the new cap action, and phone layout of the Decks tab.
- Not tested: dragging a Decks tab into a sidebar and studying from it. That would turn the sidebar leaf into the study view.

### Round-2 fix F1: study returns to where it was launched (`5cf0758`)
- **Approach.** The note Study menu's two flashcard-view items now call `openStudySession(scope, { leaf: view.leaf, takeOver: true })`, so study takes over the note's own tab. `openStudySession` captures the launching leaf's `getViewState()` + `getEphemeralState()` as a `StudyOrigin` (`src/study/study-origin.ts`, pure, unit-tested) and hands it to the view with the scope (`pendingStudy` / `takePendingStudy()`). The cap's `showDecks()` became `leaveStudy()`: it ends the session, then `setViewState(origin, origin.eState)`. The fallback is the Decks page when there is no origin (sidebar, command) or the note is gone. A Decks-tab launch records the Decks page as its origin, so it behaves as before.
- **History.** Obsidian's `leaf.setViewState` records the previous view in the leaf's back history whenever the view type changes (read in `ref/obsidian-core/app.js`), so the takeover is a real history entry and Back lands on the note for free. A bare study tab (restart, or Back/Forward onto a study entry) steps back with `popstate: true`, Obsidian's own flag for not recording. Without it, Back after the cap would loop on the note (or on the Decks page, which already happened before this fix).
- **Persistence.** This supersedes the earlier "getState stays empty" decision: `getState` now holds `{ origin }` and nothing about the session. A study tab restored after a restart, or reached through history, steps back to its note instead of becoming the Decks page. `setState` ignores an empty state, so the takeover's own `setViewState` does not wipe the origin `onOpen` took.
- **Choose a deck.** On the "No cards due" screen of a note-launched session, the button reads "Back to note" and returns to the note. Otherwise it stays "Choose a deck" (Decks page). "Close" still closes the tab, and on a taken-over tab that also closes the note. "Session complete" is unchanged (Study again, Close); the cap is the way back there.
- **Only one study tab.** On a note takeover, an open study tab elsewhere steps back as its cap would (to its own note or the Decks page) without stealing focus. A launch from Decks or the sidebar still reuses an open study tab, which keeps its origin.
- **Surface:** `src/study/study-origin.ts` (+ test) new; `src/main.ts` `openStudySession(scope, from?)`; `src/views/SequentialStudyView.ts` origin field, `getState`/`setState`, `leaveStudy`, empty-screen label; `src/views/LineRevealProcessor.ts` passes the note leaf; `src/views/DecksView.ts` call signature.
- **Not verified in Obsidian:** whether Back from the note after a restore behaves cleanly, and the phone header. The mind map has no "flashcard view" launcher (its cap is spatial study), so the mind-map origin path is generic but unreachable today.

