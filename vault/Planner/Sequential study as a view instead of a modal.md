---
title: Sequential study as a view instead of a modal
summary: "Batch 12 (T91). Move sequential review into a main-area tab like Stats and the Card Browser, so review fills the window instead of an 85vh box"
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Larger zoomable images during review]]"
  - "[[Anchor rating buttons under the revealed occlusion shape]]"
  - "[[Support zoom in sequential mode]]"
status: In-Review
batch: 12
priority:
progress_current:
progress_total:
date_created: 2026-09-03T01:47:54.000Z
date_modified: 2026-11-19T03:55:00.000Z
date_start_scheduled: 2026-11-19T03:22:06.000Z
date_start_actual: 2026-11-19T03:22:06.000Z
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

# Sequential study as a view instead of a modal (T91)

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

Sequential study should open as a **main-area view (a tab)**, the way Stats and
the Card Browser do, rather than as a modal over the current note.

`SequentialStudyModal` becomes `SequentialStudyView extends ItemView`, registered
under a `VIEW_TYPE_STUDY` and opened through the existing
`OsmosisPlugin.activateMainView` helper (`src/main.ts:1015`). **The modal is
retired, not kept alongside** — one review surface, one code path, no
desktop/mobile divergence and no dual CSS to keep in sync.

Scope of this note is the *container*. Image sizing and zoom inside the card ride
in [[Larger zoomable images during review]]; rating-button placement on
occlusion cards rides in
[[Anchor rating buttons under the revealed occlusion shape]]. Both get
substantially easier once there is real estate to work with, but neither blocks
this one.

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

From [issue #34](https://github.com/SawyerRensel/Osmosis/issues/34) (@adals): a
page of 17 lines of text, occluded, is unreadable on an iPhone because it renders
"in a small box". They asked for Anki-style near-full-screen review.

The box is real and it is ours: `.osmosis-study-modal` is `width: 600px;
max-width: 90vw; max-height: 85vh` (`styles.css:1235`), and inside it
`.osmosis-study-card img` is capped at `max-height: 50vh`
(`styles.css:1308`). On a phone a tall image therefore gets roughly half the
screen height minus chrome, then letterboxes down to fit the width. Raising the
caps alone does not fix it — a modal cannot exceed the viewport, and the flip and
rating rows have to stay reachable at every card length, which is what the
current caps are protecting.

A view instead of a modal:

- uses the full leaf, and on mobile a leaf *is* the screen
- gets Obsidian's own tab behavior for free — split panes, "Open in new window"
  on desktop, back/forward, and a review session that survives switching to
  another tab to check something
- stops competing with other modals (the occlusion editor, prompts) for the
  z-stack

Beyond #34, this is the shape the review surface should have had: reviewing is a
place you go, not a dialog you dismiss.

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*

None. On mobile you squint, or you leave the image occlusion card unreviewed.

## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

The reporter's fixture — an Arabic-grammar poem masked in Excalidraw, 1191×3401 —
is attached to
[issue #34's first comment](https://github.com/SawyerRensel/Osmosis/issues/34#issuecomment-5484691941).
An image that tall is the worst case worth designing against.

---

## Design

### The pattern to copy

`StatsView` (`src/views/StatsView.ts:169`) is the closest sibling: `ItemView`
subclass, `getViewType`/`getDisplayText`/`getIcon`, built in `onOpen`, torn down
in `onClose`, registered in `main.ts:254`, revealed by `activateMainView`.
`activateMainView` already reuses an open leaf rather than stacking duplicate
tabs — which is exactly the "don't start a second session on top of the first"
behavior this needs.

### The three things a modal gave us for free

1. **Keyboard scope.** The modal registers `1`–`4`, `e`, `g`, `Ctrl+Z` and the
   flip key on `Modal`'s own `Scope`
   (`SequentialStudyModal.registerKeyboard`, ~`src/views/SequentialStudyModal.ts:810`).
   `View` has `scope: Scope | null`, documented for precisely this
   (`ref/obsidian-api/obsidian.d.ts:7633`): assign `this.scope = new Scope(this.app.scope)`
   in the constructor and the same registrations keep working while the leaf is
   focused. Verify the bindings do **not** fire while another leaf is active, and
   that `g` / `e` don't shadow anything the user has bound globally.
2. **A close event.** `onClose` clears learning timers and unloads the
   `Component` used for markdown rendering. In a view, `onClose` still fires when
   the leaf closes — but a leaf can also be *detached by workspace layout
   changes* and can be restored on restart. Decide what happens to
   `onSessionEnd` (schedule + review-log flush) in each case; flushing twice is
   safe, never flushing is not.
3. **Exclusivity.** A modal cannot be opened twice over itself. Two study tabs
   are possible. `activateMainView` prevents the accidental case; decide whether
   a *second, differently-scoped* session is allowed at all (recommend: no —
   reveal and rebuild the existing leaf with the new `DeckScope`).

### Session state on reopen

An `ItemView` gets `getState`/`setState` and is serialized into the workspace.
A half-finished queue is not meaningfully restorable — schedules are already
written per rating, so the honest behavior is: **a restored study leaf rebuilds
its queue from the deck scope**, or shows the deck picker if it has none. Do not
try to persist `queue`/`undoStack`/`deferredCards`; the undo stack in particular
is only valid against schedules that have not moved since.

### Open questions

- **Where does a session start from now?** Today both entry points pass a
  `DeckScope` in (`main.ts:1066`, `DashboardSidebarView.ts:191`). Does the view
  always require a scope, or does a scope-less "Study" tab show a deck picker as
  its empty state? A picker inside the view would make the tab meaningful to pin.
- **Mobile chrome.** Obsidian's own view header eats vertical space on a phone.
  Does the study view hide it (`this.leaf.setViewState` / CSS on the header) to
  reclaim the pixels #34 is asking for?
- **Does completion close the tab or offer "study again"?** A modal
  self-dismisses; a tab lingering on the completion screen may be better.

### Surface map (expected)

| File | Change |
|---|---|
| `src/views/SequentialStudyModal.ts` | Becomes `SequentialStudyView extends ItemView`; `onOpen`/`onClose` keep their bodies, `this.modalEl`/`this.contentEl` become `this.containerEl.children[1]`, `Scope` constructed explicitly |
| `src/main.ts` | Register `VIEW_TYPE_STUDY`; `openStudySession` calls `activateMainView` and hands the scope to the view instead of constructing a modal (~line 1066) |
| `src/views/DashboardSidebarView.ts` | `openStudy` (~line 191) routes through the plugin's session opener rather than constructing the modal itself |
| `styles.css` | `.osmosis-study-modal` rules (~1225–1330, 1642–1700) re-based onto the view's container; the `600px`/`85vh`/`50vh` caps are what this task exists to remove |
| `src/views/SequentialStudyModal.test.ts` | Rename + adjust for the view harness |

### Test plan

- Unit: the existing `SequentialStudyModal.test.ts` cases must survive the port —
  queue building, deferred learning cards, undo, type-in.
- Manual: start from both entry points (command palette, dashboard deck row);
  rate a card and confirm the schedule lands; switch tabs mid-session and come
  back; close the tab mid-session and confirm timers are cleared and pending
  writes flushed; restart Obsidian with the study tab open and confirm it does
  not resurrect a stale queue; on mobile confirm the card fills the screen.
- Regression: the occlusion **editor** modal and the study surface must still be
  usable together — opening the editor from a study card, if that path exists,
  now layers a modal over a view rather than a modal over a modal.

---

## Batch 12 decisions (grilled 2026-11-18)

These settle the open questions above, and they take precedence over them.

- **Layout model: AnkiDroid** (Sawyer's screenshots: a header bar, then a slim
  counts strip, then the card filling the screen, with Show answer / rating
  buttons at the bottom).
- **Header bar holds the actions.** "Open note", "Exclude card" and "Undo" leave
  the in-card top bar and become view-header actions (`ItemView.addAction`), on
  desktop and mobile. Undo stays hidden or disabled while the stack is empty.
- **Mobile bottom buttons are full width.** "Show answer" is one full-width bar
  pinned to the bottom of the leaf. The four ratings are four equal cells
  spanning the width, each showing its interval above its label (`<10m` /
  `Again`). Colours follow Again/Hard/Good/Easy. **Desktop is not full width.**
- **Desktop layout: a centered column.** Card text sits in a readable centered
  column (~700px max). Images may use the full tab width. The buttons are a
  centered row pinned to the bottom of the tab.
- **Mobile navigation bar hidden while the study tab is active.** It is hidden
  so the bottom buttons are never under it, and it comes back through either of:
  - a **swipe up** on the study view (the opposite gesture of the swipe down that
    opens the command palette), which toggles it;
  - a **"Show navigation bar" toggle** in the view header's ⋯ menu
    (`onPaneMenu`).
  Leaving the study tab (switching leaves, closing it) always restores the bar.
  The hidden state must never leak into other views.
- **Lifecycle:** a study tab without a deck (restored after restart, or opened
  scope-less) shows a **deck picker** as its empty state. Finishing a session
  leaves a **completion screen** with "Study again" and "Close" buttons. The tab
  does not close itself.
- **One study tab.** Starting a session while one is open reveals that leaf and
  rebuilds it with the new `DeckScope`.
- **The modal is retired**, as the design above says.
- The new|learn|due counts strip is **T92**, not this ticket. Leave room for a
  slim strip between the header and the card, but don't build it.

## Acceptance criteria

- [ ] Both entry points (command palette, dashboard deck row) open the study tab; no modal remains in the code.
- [ ] Header actions: Open note, Exclude card, Undo work and keep their keyboard shortcuts (`1`–`4`, flip key, `e`, `g`, `Ctrl+Z`), which fire only while the study leaf is focused.
- [ ] Mobile: the card fills the leaf, the buttons span the bottom, the nav bar is hidden, a swipe up and the ⋯ menu both toggle it, and leaving the tab restores it.
- [ ] Desktop: the card sits in a centered column, the button row is centered at the bottom, and no `600px` / `85vh` / `50vh` caps remain.
- [ ] Closing the tab mid-session clears the timers and flushes the schedule and review log. A restart with the tab open shows the deck picker, not a stale queue.
- [ ] A finished session shows Study again / Close.
- [ ] The existing unit tests survive the port. Pure logic (e.g. swipe classification) that moves out of `src/views/` gets a test (see memory `vitest-cannot-import-obsidian`).

## Context budget (~35k tokens of reading)

| Read | Range | ~Tokens |
|---|---|---|
| `src/views/SequentialStudyModal.ts` | whole (land T90's undo fix first, it's already on the branch) | 7.2k |
| `src/views/SequentialStudyModal.test.ts` | whole | 0.3k |
| `src/views/StatsView.ts` | 160–260 (the ItemView pattern only) | 1.2k |
| `src/main.ts` | 240–290 (view registration), 1000–1080 (`activateMainView`, `openStudySession`) | 2k |
| `src/views/DashboardSidebarView.ts` | 170–215 | 0.5k |
| `styles.css` | `grep -n osmosis-study` → roughly 1356–2045 (study rules only) | ~6k |
| `ref/obsidian-api/obsidian.d.ts` | `View`, `ItemView` (`addAction`, `onPaneMenu`, `scope`), `Platform` | ~3k |

Don't read `src/study/occlusion-*` or the renderers. The card renders through
existing calls, and only its container changes.

## Batch implementation notes (awaiting manual test)

Code commit: `c99c266` on `batch/12-study-tab`.

### Approach

`SequentialStudyModal` was renamed (git mv, history kept) to
`SequentialStudyView extends ItemView` under `VIEW_TYPE_STUDY = "osmosis-study"`,
registered in `main.ts` with the plugin passed in. The card rendering, flip,
type-in, rate, exclude, deferred learning cards and T90's `stepBack()` undo are
the modal's bodies, unchanged in behaviour. What changed is the container and
the session lifecycle:

- **One opener.** `plugin.openStudySession(scope)` calls
  `activateMainView(VIEW_TYPE_STUDY)`, `loadIfDeferred()`s the leaf and calls
  `view.startSession(scope)`. The dashboard and the note-header Study menu both go
  through it. A running session is ended (flushed) before the new scope rebuilds.
- **Session end = `endSession()`**: clears learning timers and the waiting
  countdown, releases the card's render `Component`, and — only if a session was
  active — calls `plugin.flushStudySession()` (schedule store + review log flush,
  then `refreshDashboard()`). It runs from `onClose` (tab closed or detached by a
  layout change), from `startSession`, and from the picker. The completion
  screen also flushes, without ending the session, so undo still works there;
  flushing twice is harmless.
- **No persisted state.** `getState` is the default empty one, so a restored tab
  has no scope and shows the deck picker.
- **Keys** (`Space`, `Enter`, `1`–`4`, `e`, `g`, `Ctrl+Z`) are registered on
  `this.scope = new Scope(this.app.scope)` in the constructor, so they fire only
  while the study leaf is active. With no card on screen they return without
  `preventDefault`, so Space/Enter still press a focused picker button.
- **Header actions** (`addAction`): Exclude, Open note, Undo. Open note and
  Exclude hide when no card is on screen; Undo hides while the stack is empty.
- **Phone navigation bar.** The view implements `NavbarHost`, so the existing
  `syncNavbar` / `HIDE_NAVBAR_CLASS` machinery (run on every
  `active-leaf-change`, and on close with `except`) hides it while the tab is
  active and restores it everywhere else. A swipe up (`isNavbarSwipe`) or
  **Show navigation bar** in the ⋯ menu flips `navbarShown`.

### Decisions worth remembering

- **Open note opens a new tab**, not the current leaf. Opening in the study leaf
  would replace the view and end the session; the modal could close itself
  first, a tab should not.
- **A swipe that scrolled the card is not a swipe.** The tall-image case needs
  upward drags to read; `isNavbarSwipe` rejects any touch during which the
  scroll surface under the finger moved, plus slow (>600ms), short (<60px) or
  mostly sideways drags, and two-finger touches.
- **Phone-only full-width buttons and navbar handling** (`body.is-phone`, not
  `.is-mobile`): tablets get the desktop centered column. "Mobile" in the
  decisions read as phone; tablets have no navigation bar anyway.
- **Intervals above the rating labels on every platform**, not only phone, from
  a new `StudySessionManager.previewIntervals(cardId)` that runs exactly the
  FSRS step `recordReview` would (a test pins preview == recorded interval).
- **One render `Component` per card** (was one per session) so a long session in
  a long-lived tab does not retain every card's rendered children.
- **`.osmosis-study-back.is-revealed` is `max-height: none`** (was 5000px): with
  the 50vh image cap gone, a tall answer could exceed any fixed ceiling and be
  clipped. The reveal no longer animates its height; opacity still fades.
- **Column rule targets the children of the card sides** (`> *`), so the
  occluded diagram (`.osmosis-study-media`) and an image-only paragraph
  (`p:has(> .image-embed:only-child)`) can use the full tab width.
- **Deck picker reuses the dashboard's tree**: its pruning logic moved to
  `visibleDeckTree` / `deckScopeOf` in `DeckTreeBuilder.ts` and the dashboard now
  calls them too. The picker shows one "waiting" count per deck (new+learn+due),
  leaving the split counts to T92. It redraws when the tab is re-activated and
  once `cardStoreReady` resolves (a restored tab opens before the first sync).
- **No-cards-due screen** offers **Choose a deck** and **Close** (Study again
  would just land on it again).
- **Added an "Open study tab" command** (`open-study`), the scope-less entry the
  decisions mention; it reveals the existing tab if there is one.
- Small fix carried along: the type-in suggested-rating outline is now cleared
  for the next card (it used to linger onto the next flip).
- Settings label "Show deck breadcrumb in study modal" → "… in study tab".

### For T92 (counts strip)

The header/progress area is `statusEl` (`.osmosis-study-status`), built in
`buildLayout()`: optional note name, progress bar, optional breadcrumb, then the
card. Its state is refreshed in `updateProgress()` (called from `renderCard`
and `renderWaiting`; `renderComplete` writes the final text). Remaining =
`queue.length - currentIndex + deferredCards.length`. The column width is
`--osmosis-study-column` on `.osmosis-study-view`.

### Surface map

| File | Change |
|---|---|
| `src/views/SequentialStudyModal.ts` → `src/views/SequentialStudyView.ts` | `ItemView`, `VIEW_TYPE_STUDY`, `startSession`/`endSession`, deck picker, completion screen, header actions, view `Scope`, phone navbar (`NavbarHost`, swipe, pane menu), per-card render `Component`, interval labels |
| `src/views/SequentialStudyModal.test.ts` → `src/study/match.test.ts` | Moved next to the `isCloseMatch` it tests |
| `src/study/study-view.ts` (+ test) | New pure `formatInterval`, `isNavbarSwipe` |
| `src/study/StudySessionManager.ts` (+ test) | `previewIntervals`; `currentSchedule` extracted from `recordReview` |
| `src/study/DeckTreeBuilder.ts` (+ test) | `visibleDeckTree`, `deckScopeOf` |
| `src/main.ts` | Register the view; `openStudySession` reveals/rebuilds the tab; `flushStudySession`; `open-study` command |
| `src/views/DashboardSidebarView.ts` | Uses the shared tree helpers; `openStudy` routes to `openStudySession` |
| `src/views/ToolRibbon.ts` | `NavbarHost` doc covers the study tab |
| `src/settings.ts` | Breadcrumb setting label |
| `styles.css` | Modal rules replaced by the tab layout (column, pinned buttons, phone full-width bar and cells, picker); 50vh image cap, top bar and icon-button rules removed |
| `docs/studying/study-modes.md`, `docs/reference/commands.md`, `docs/reference/settings.md` | Describe the tab |

### Fixture

`vault/tests/flashcard/study-tab.md` (master `e2e/fixtures/study-tab.md`), deck
**Testing › Study Tab**, 6 cards: two back-dated due review cards (basic, and a
600×1800 image `study-tab-tall-chart.svg`, copied to `vault/media/`), and four
new ones (long answer, type-in, cloze, a card to rate Again for the waiting
screen). Occlusion on a full-width image: use the existing
`vault/tests/flashcard/occlusion-image-width.md`.

### Not verified (no Obsidian here)

- Everything visual and on-device: the layout, the phone full-width buttons,
  the 84px navbar clearance (copied from the 3D graph's lift) and
  `--navbar-bottom-offset` once the bar is hidden.
- Whether Obsidian mobile claims a swipe-up gesture of its own that competes.
- That `addAction` order reads well in the header (Obsidian decides placement).
- That `g` / `e` don't collide with a user's global hotkeys (the view scope
  should win while the tab is focused).
