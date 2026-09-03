---
title: Sequential study as a view instead of a modal
summary: Move sequential review into a main-area tab like Stats and the Card Browser, so review fills the window instead of an 85vh box
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
status: Ideas
priority:
progress_current:
progress_total:
date_created: "2026-09-03T01:47:54.000Z"
date_modified: "2026-09-03T01:47:54.000Z"
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
parent:
children:
blocked_by:
cover:
color:
---

# Feature Request

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
