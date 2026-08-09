---
title: Card browser mutations
summary: Suspend, reset, delete and change deck from the card browser, applied to a multi-selection
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Create Card Browser - Editor]]"
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-08T17:30:00.000Z
date_modified: 2026-08-09T02:35:00.000Z
date_start_scheduled: 2026-08-08T21:59:13.000Z
date_start_actual: 2026-08-08T21:59:13.000Z
date_end_scheduled: 2026-08-09T02:35:00.000Z
date_end_actual: 2026-08-09T02:35:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/19
---
# Feature Request

## What do you need built?

The four mutations the card browser was specified with but did not ship:
**suspend / unsuspend**, **reset scheduling**, **delete card**, and **change
deck** — each applying to a multi-selection, with the dashboard's deck counts
refreshing afterwards.

## What problem does this solve?

[[Create Card Browser - Editor]] shipped the browsing surface
(PR [#18](https://github.com/SawyerRensel/Osmosis/pull/18)) and deferred every
mutation. The browser can currently find any card in the vault and open it, but
cannot act on one. Suspending a card still means opening its note and using the
reading-view toggle or the editor context menu.

## What's your current workaround?

Reading view's eye toggle on a fence card; "Exclude from study" in the editor
context menu for line cards; deleting a card by hand; editing `osmosis-deck`
frontmatter directly.

---

# PRD

## Read first

[[Create Card Browser - Editor]]'s **"What was implemented"** section. It carries
the constraint that shapes this whole feature (Bases owns notes, Osmosis owns
cards, and the toolbar cannot be extended to cards) plus the decisions already
settled. Do not re-derive them.

The browsing surface is `src/views/CardBrowserView.ts`; all pure logic is
`src/browse/cards.ts`.

## Two decisions already made with the user

Both were settled during the parent task and should not be reopened:

1. **Delete a line card by stripping its block ID, not its line.** For a fence
   card, remove the whole fence — the fence *is* the card. For a line card,
   removing the line would destroy the user's prose, which contradicts the
   browser's governing principle that it mutates scheduling, not content.
   `removeBlockIdsInRange` in `src/card-gen/generate-ids.ts` already does the
   line-card half and already warns about user-authored IDs.
2. **Change deck writes `osmosis-deck` frontmatter and warns rather than
   rewriting fences.** Fence cards can carry their own `deck:` key. Stripping
   those would edit fence bodies — user content — and silently discard a
   per-card choice. Instead, report it: *"Moved 5 cards. 2 cards set their own
   deck in the fence and were left alone."*

## The three mutations are deliberately separate

They have very different consequences and must not be confusable in the UI.

| Operation | Effect | Reversible? | Touches note content? |
|---|---|---|---|
| **Suspend / unsuspend** | Out of study; FSRS state preserved | Yes, fully | No |
| **Reset scheduling** | Card returns to new; FSRS state cleared | No — but review log survives | No |
| **Delete card** | Card ceases to exist | No | **Yes** |

Delete goes through `ConfirmModal` naming every affected file, and must be
visually separated from the other two in the toolbar.

## Persistence: the part that will cost you time

`CardStore` is **in-memory only**. Every mutation has to write through to the
markdown as well, and the path differs by card kind:

| | Suspend | Reset |
|---|---|---|
| **Line card** | `cardStore.setDisabled(id, bool)` + `scheduleStore.setDisabled(notePath, blockId, bool)` + `scheduleStore.flushPath(notePath)` | `cardStore.clearSchedule(id)` + `scheduleStore.removeSchedule(notePath, blockId)` + flush |
| **Fence card** | `cardStore.setDisabled(id, bool)` + `fenceWriter.writeExclude(file, cardId, bool)` | `cardStore.clearSchedule(id)` + `fenceWriter.removeSchedule(file, cardId)` |

`src/main.ts:setLineCardsDisabled` is a working example of the line-card path.

### ⚠️ Fence metadata is per-fence, not per-card

A bidi fence produces two cards (`id`, `id-r`) and a cloze fence produces one per
group (`id-c1`, `id-c2`, …), but the fence carries **one** `exclude:` key. So:

- **`writeExclude` suspends every card from that fence**, not just the selected
  one. `parseCardIdParts` maps `id-c1` back to `id` to find the fence.
- **`removeFenceSchedule` is worse** — it strips *all* schedule keys from the
  fence, including the `r-` and `cN-` prefixed ones belonging to sibling cards.
  So resetting one cloze group resets them all. See `isScheduleKey`, which
  matches prefixed variants by design.

Decide how to handle this and say which in the close-out note. Options:

- Scope `removeFenceSchedule` to a prefix — a small, contained change to
  `FenceWriter` that makes reset genuinely per-card. **Recommended**, since
  reset is irreversible and silently resetting siblings is a data-loss bug.
- For suspend, `exclude:` is per-fence in the file format itself, so per-card
  suspend would need a format change. Simpler to surface it: when the selection
  contains a derived card, say the whole fence will be suspended.

Note the parent task changed `exclude: true` fences to generate `disabled` cards
rather than skipping them, so a suspended fence card now stays visible in the
browser and can be unsuspended — that is what makes suspend round-trip at all.

### Delete has no existing helper for fences

Line cards: `removeBlockIdsInRange(content, { start: sourceLine, end: sourceLine })`.
Fence cards: needs a new pure function to remove a whole fence by card ID.
`findFenceForId` in `src/store/FenceWriter.ts` locates it; the deletion itself is
new. Put it beside `findFenceForId` and unit-test it there. Deleting one card of
a multi-card fence deletes the fence and all its siblings — confirm that
explicitly.

## Undo/redo

Added to scope after the note was written. Obsidian's own undo cannot carry
these: Ctrl+Z is CodeMirror's per-editor history, plugin writes through
`Vault.process` / `processFrontMatter` do not enter it usefully, and a note that
is not open in an editor has no history at all — the normal case for the browser.
So the plugin keeps its own stack.

- **Snapshot-based, not inverse operations.** One record per mutation holding
  each touched note's content before and after, plus each touched card's store
  state before and after. Four inversions would otherwise be needed, and
  delete's — re-inserting a stripped block ID or a whole fence at position — is
  the most breakable of them.
- **Restoring checks first.** A whole-file restore would overwrite anything
  written to the note since, so every file is compared against the snapshot the
  mutation left and any disagreement aborts the *whole* undo, before any write.
- **Session-only.** Plugin-level so it survives closing the browser, but never
  persisted: restoring a week-old snapshot after a restart is a data-loss trap.
- **No Ctrl+Z binding.** Two commands, left unbound; taking Ctrl+Z would break
  editor undo. Both are also buttons in the browser toolbar, which therefore
  shows whenever the selection *or* the undo stack is non-empty — the selection
  clears after each mutation, which would otherwise hide Undo exactly when it
  became useful.

This makes delete session-reversible, which the table above calls irreversible.
The table is about the card lifecycle; undo is a session safety net, not a
lifecycle property. The confirmation modal stays.

Scope boundary: browser mutations only. The editor context-menu paths
(`setLineCardsDisabled`, `removeLineCards`) are not retrofitted.

## Re-rendering after a mutation

Two things need to happen, neither automatic:

- **The view.** `onDataUpdated` only fires when *Bases* data changes. A mutation
  changes the card store, so the view must re-render itself.
- **The sidebar.** Call `plugin.refreshDashboard()` (`src/main.ts`), which is
  public, iterates dashboard leaves and already guards deferred ones.

Also note `CardSyncService` re-syncs the file on a 2s debounce after any write,
which will re-read the markdown and rebuild those cards. Make sure the immediate
in-memory update and the eventual re-sync agree, or the row will flicker back.

## Multi-select

**Click selects, double-click opens** — the file-manager convention, chosen over
checkboxes after the first pass shipped them: a checkbox column is busy, and it
makes the common case (act on a few cards) cost a precise click on a small target
in every row.

| Gesture | Effect |
|---|---|
| Click | Replace the selection with this card |
| Ctrl/Cmd+click | Toggle this card |
| Shift+click | Take the run from the anchor to here |
| Ctrl+Shift+click | Add that run to the selection |
| Double-click | Open the card in its note |
| Ctrl+A / Esc | Select all rendered cards / clear |

The anchor is the last row clicked *without* Shift, and Shift leaves it alone so a
range can be re-stretched from the same start. Ranges run over the rendered visual
order, which is neither the store's nor Bases'.

A note header is the same contract over every card under it: click selects the
note, Ctrl+click on a fully selected note clears it, double-click opens the note.
It shows all-selected and some-selected states, which is what the checkbox's
indeterminate state used to say.

Selection changes repaint rows in place rather than re-rendering: a render resets
the scroll position and discards every markdown render already paid for.

## The toolbar

Always standing, above `.osmosis-browse-scroll` in the flex column, holding the
search box and every action as a lucide icon button on one line.

- **Icons, not labels.** Text buttons took most of the bar on a phone. The
  tooltip (`aria-label`, which is also what Obsidian's tooltip reads) is the only
  label, so it names the action rather than describing it.
- **Dimmed, not hidden.** Every action is always present and `disabled` when it
  does not apply. A toolbar that changes shape moves the button you were reaching
  for, and a dimmed button still says the browser can do the thing.
- **Suspend and unsuspend are one toggle**, swapping icon on whether the whole
  selection is already suspended. Two buttons cost a slot that mobile does not
  have, and a mixed selection has to pick a direction anyway — it suspends.
- **The count is a number in a pill**, not "3 selected"; the words cost more room
  than the whole action set. The noun is in its tooltip.
- Delete keeps its flexible gap and now also `--text-error`, since a dimmed
  button separated by a gap is a weaker signal than a labelled one was.

### Search moved out of the Bases config panel

It is the control reached most often and it was three clicks deep, behind a panel
that covers the cards it filters. It now sits in the toolbar, shrinking to give
the buttons room. It still persists under the same `search` config key — only the
way in moved, so a saved base opens with its query — which is why the key stays in
`readBrowseOptions` while its entry is gone from `BasesViewRegistration.options`.

Three things this forces:

- **`render` splits into `render` and `renderList`.** Filtering as you type must
  not rebuild the box holding the caret, so search rebuilds the list alone. The
  toolbar bar survives; only `actionsEl` inside it is rebuilt per selection change.
- **The query is view state, not config state.** ⚠️ The first attempt wrote
  `config.set("search", …)` on each debounced keystroke, and the box lost focus
  after every character — `config.set` writes the `.base` file, which makes Bases
  re-render the whole view and destroy the input. So `searchQuery` holds it while
  the view is open, typing only ever filters, and the config is written on blur or
  Enter. `searchFocused` restores the caret if Bases re-renders for its own
  reasons anyway. **Do not move the write back into the input handler.**
- **The box swallows its keystrokes.** Ctrl+A selects the query, not every card,
  and Escape clears the query, not the selection.

The box also carries a clear button, shown only when there is a query — mostly
for mobile, where selecting text to delete it is a chore. Its padding needs two
classes of specificity (`.osmosis-browse-search .osmosis-browse-search-input`) to
outrank Obsidian's own `input[type="text"]`, or the icon sits on the placeholder.

## Resizable table columns

Drag a grip on any header cell's trailing edge; double-click one to reset them
all. Widths persist per view under a `columnWidths` config key (`key → pixels`),
read back through `readColumnWidths`.

The first drag **freezes every column** to its currently rendered width and makes
the table's width their sum. Until then most columns take their width from the
stylesheet while Front and Back split the remainder, so dragging one would
otherwise mean "the others reflow around it" rather than "this column becomes this
wide". `is-sized` drops the table's default `min-width` once that happens, or the
table would stretch the other columns to make up whatever a narrowed one gave up.

The grip sits *inside* the cell rather than straddling the boundary: `th` clips
its overflow to ellipsize long labels and would cut an overhanging grip in half.
Pointer events with capture, so a drag survives leaving the 8px target and a touch
drag resizes instead of scrolling. The grip stops its own `click`, or the end of a
drag would also sort the column it was resizing.

## Table column sorting

Click a header to sort ascending, again for descending, a third time to stop
sorting by it. A click on a *different* column **appends** a level rather than
replacing — that is what makes "by deck, then by due" reachable — and the third
click unwinds one level at a time. `cycleSortColumns` is that whole rule as a pure
function, which is where its tests are.

- Persisted per view under `sortColumns` (`[{key, dir}]`), read by
  `readSortColumns`, which drops unsortable and duplicated columns.
- **Applied in `buildFlat` only**, so it is table-only. The other layouts have no
  headers to click, and honouring it there would impose an order the user cannot
  see or undo from that layout.
- **It outranks the `Sort cards by` dropdown** whenever it is non-empty. The
  dropdown stays for the layouts with no headers, which is why both exist; the
  header tooltip says so, since nothing else could.
- **Ascending means ascending.** The dropdown's entries each bake in the direction
  that makes them useful (most lapses first, hardest first), which is right for a
  named sort and wrong for an arrow. `sortByColumns` has its own comparator for
  that reason rather than reusing `compare`.
- Missing values sink in **both** directions. Naively negating the comparator for
  descending floats every new card to the top of a Stability sort — a bug the
  tests caught.
- The sort mark is positioned absolutely against the header's trailing edge with
  the header's own background. In normal flow the cell's `overflow: hidden` makes
  the mark the first thing to vanish as a column narrows, which is backwards.

## Touch multi-select

Mobile has no modifier keys, so the gestures stand in for them:

| Gesture | Stands in for |
|---|---|
| Long press (450ms) | Ctrl+click — toggles that card and enters selection mode |
| Drag out of the press | Shift+click — the run from the anchor to the finger |
| Drag near the top/bottom edge | Scrolls, faster the closer it gets |
| Tap, while in selection mode | Ctrl+click — toggles |
| Selection empty | Leaves selection mode; a tap opens again |

- The drag holds a **baseline** — the selection as it stood when the press
  landed — and each move applies "baseline plus the run from the anchor", not an
  accumulation of everything the finger has crossed. Otherwise dragging back the
  way you came could not shrink the range.
- Rows carry `data-osmosis-card`, because `elementFromPoint` lands on whatever
  markdown was rendered there, not on the row.
- **`touchmove` is preventDefault-ed from a non-passive listener** while a drag is
  live. `touch-action` on the rows cannot do this: the browser has committed to a
  scroll long before the press lands, and the point is to allow scrolling right up
  until it does.
- The tap that ends a long press is suppressed (`suppressClick`), or it would
  immediately undo what the press just selected.
- `contextmenu` is suppressed during the gesture — a long press is the platform's
  own "show me a menu".

## The dead band at the bottom of the leaf

`.bases-view` pads its container and reserves a scrollbar gutter, on the
assumption that the view inside scrolls the container. This one does not — it owns
its own scroller under a fixed toolbar — so that padding showed as an empty strip
along the bottom. Cleared with `.bases-view.osmosis-browse { padding: 0;
scrollbar-gutter: auto; }`, the same fix `ref/Planner` uses for its Kanban view,
scoped by the view's own class so no other Bases view is affected.

**Change deck is offered on note rows and disabled on card rows** — line cards
inherit their deck from frontmatter or folder, so there is no per-card deck to
set. In the table layout, which has no note rows, offer it only when the whole
selection falls inside one note.

## Surface map

| File | Change |
|---|---|
| `src/browse/mutate.ts` | New — the four mutations, taking explicit deps (store, scheduleStore, fenceWriter, vault) rather than the plugin |
| `src/browse/mutate.test.ts` | New — the pure parts, especially fence removal and the per-fence sibling cases |
| `src/store/FenceWriter.ts` | Prefix-scoped `removeFenceSchedule`; new fence-removal function |
| `src/browse/cards.ts` | `readColumnWidths` and `COLUMN_MIN_WIDTH` |
| `src/browse/cards.test.ts` | Column-width parsing, including the values a hand-edited base can hold |
| `src/views/CardBrowserView.ts` | Click selection, icon toolbar, in-toolbar search, column resizing, re-render after mutation |
| `src/views/ConfirmModal.ts` | Reuse as-is for delete |
| `styles.css` | Toolbar and selected-row styling, in the existing "Card browser" section |

## Acceptance criteria

Carried from [[Create Card Browser - Editor]], where they were left unmet:

- [x] Suspend, reset, and delete are three separate actions and apply to a multi-selection
- [x] Suspend is reversible and preserves FSRS state
- [x] Reset clears FSRS state but leaves review log entries intact
- [x] Reset does not clear sibling cards' schedules from the same fence
- [x] Delete confirms first, names affected files, and is visually separated from the other two
- [x] Deleting a line card strips its block ID and leaves the prose
- [x] Change deck is offered on note rows and disabled on card rows
- [x] Change deck reports fence cards that override the note's deck
- [x] Deck counts in the sidebar update after a mutation
- [x] `npm run lint` and `npm test` clean

Added with the click-selection revision:

- [x] Click selects a card; double-click opens it in its note
- [x] Ctrl+click, Shift+click and Ctrl+Shift+click extend a selection
- [x] Select all is reachable in all three layouts, by button and by Ctrl+A
- [x] Deselect clears the whole selection, as does Esc
- [x] No checkboxes remain in any layout
- [x] Every action is visible at all times, dimmed when it does not apply
- [x] The toolbar fits one line on mobile, search box included
- [x] Card search is in the toolbar, not the Bases config panel, and still persists
- [x] Table columns resize by dragging, reset by double-clicking a grip, and persist
- [x] Typing in the search box never costs it focus
- [x] The search box clears from a button as well as from Escape
- [x] Clicking a table header cycles ascending → descending → unsorted
- [x] A second column adds a "then by" level, and levels unwind one at a time
- [x] A long press starts a selection on mobile, and a drag out of it extends one
- [x] A drag near the top or bottom edge scrolls the list
- [x] Once a selection exists on mobile, a tap adds to it rather than opening
- [x] No dead space between the last card and the bottom of the leaf

Added with the undo/redo scope:

- [x] All four mutations can be undone and redone
- [x] Undo restores both the markdown and the in-memory card state
- [x] Undo refuses, with a reason, when the note changed after the mutation
- [x] Undo and redo are reachable from the toolbar and the command palette

## Test plan

Unit: fence removal, prefix-scoped schedule removal, and the per-fence sibling
cases — all pure over strings. `src/store/FenceWriter.test.ts` is the pattern.

Manual: `vault/tests/flashcard/browser-mixed.md` already holds a bidi card, a
two-group cloze, a code cloze, a suspended fence and four line cards — every
per-fence edge case in one note. `browser-second-deck.md` has a fence with its
own `deck:` for the change-deck warning.

## Follow-ups

- Inline front/back editing remains deliberately out of scope
- [[Clicking dashboard graph opens filtered card browser]]

---

# What was implemented

## Where it shipped

PR [#19](https://github.com/SawyerRensel/Osmosis/pull/19), branch
`feature/card-browser-mutations` into `release/0.0.4`.

## The cause

The browser could find any card in the vault and open it, but not act on one,
because `CardStore` is in-memory only and every mutation needs a second write
into the markdown whose shape depends on the card's kind. That second write is
the whole of this task; the toolbar was the easy half.

The trap the PRD warned about turned out to be the real one: **fence metadata is
per-fence, not per-card**. A bidi fence produces two cards and a cloze fence one
per group, but the fence carries one `exclude:` key and one schedule block, so
the naive write acts on cards the user never selected.

## The two per-fence questions, answered

The PRD left these open and asked for the answer here.

1. **Reset is prefix-scoped, and this was a data-loss bug.**
   `removeFenceSchedule` stripped every schedule key from a fence, including the
   `r-` and `cN-` prefixed ones belonging to siblings — so resetting one cloze
   group silently reset the others, irreversibly. It now removes only the keys
   carrying the selected card's own prefix. `planByNote` keeps `selected` and
   `siblings` apart precisely so this write can see the difference.
2. **Suspend takes the siblings deliberately, and says so.** `exclude:` is
   per-fence *in the file format*, so per-card suspend would need a format
   change. Rather than pretend, the outcome message reports how many cards came
   along. This is the one place a mutation touches cards outside the selection on
   purpose.

## Decisions worth remembering

- **The search query is view state, not config state.** The first attempt wrote
  it to the config on each debounced keystroke; the box lost focus after every
  character, because `config.set` writes the `.base` file and Bases re-renders
  the view. It is written on blur or Enter instead. Do not move it back.
- **Selection repaints, it does not re-render.** `applySelection` toggles classes;
  a render resets scroll and discards every deferred markdown render already
  paid for. The same reason `render` and `renderList` are separate.
- **Every action stays visible and dims.** A toolbar that changes shape moves the
  button being reached for, and mobile has no room for text labels.
- **Column sort has its own comparator.** The `sortBy` dropdown bakes the useful
  direction into each entry (most lapses first); an arrow the user pointed at
  must mean what it says. Missing values sink in both directions — negating the
  comparator floats every new card to the top of a reversed Stability sort.
- **Touch `touchmove` is preventDefault-ed from a non-passive listener**, not
  handled with `touch-action`. The browser commits to a scroll long before the
  450ms press lands, and scrolling has to keep working until it does.
- **Undo is snapshot-based and session-only**, and refuses wholesale if any file
  changed after the mutation. Delete is therefore session-reversible; the
  confirmation modal stays regardless.

## Surface map

| File | Change |
|---|---|
| `src/browse/mutate.ts` | New — the four mutations over explicit deps, `planByNote` splitting selected from sibling cards, delete planning |
| `src/browse/mutate.test.ts` | New — fence removal, the per-fence sibling cases, delete planning |
| `src/browse/history.ts` | New — the session snapshot stack behind undo/redo |
| `src/browse/cards.ts` | `readColumnWidths`, `readSortColumns`, `cycleSortColumns`, `sortByColumns`, `sortColumns` in `BrowseOptions` |
| `src/browse/cards.test.ts` | Column-width and sort-column parsing, the sort cycle, the missing-value sink |
| `src/store/FenceWriter.ts` | Prefix-scoped `removeFenceSchedule`; fence removal by card ID |
| `src/store/FenceWriter.test.ts` | Both, including the sibling cases |
| `src/views/CardBrowserView.ts` | Click and touch selection, icon toolbar, in-toolbar search, column resize and sort, re-render after mutation |
| `src/views/PromptModal.ts` | New — deck entry for Change deck |
| `src/main.ts` | `cardMutations` deps, `mutationHistory`, undo/redo commands, browser registry |
| `styles.css` | Toolbar, selected rows, resize grips, sort marks, and the `.bases-view` padding reset |

## Test fixture

`vault/tests/flashcard/browser-mixed.md` — a bidi card, a two-group cloze, a code
cloze, a suspended fence and four line cards, which is every per-fence edge case
in one note. `browser-second-deck.md` carries a fence with its own `deck:` for the
change-deck warning. Note that manual testing *mutates* these: a reset run against
the fixture strips the schedule keys it was seeding. Restore them from git before
using them as a baseline again.

## Verification

`npm run lint` clean, 1198 unit tests passing, build clean, and every acceptance
criterion above manually confirmed by the user in Obsidian across all three
layouts — the four mutations, undo/redo, click and touch selection, the icon
toolbar, search, column resizing and column sorting.

The touch gestures are the part to re-check by hand after any change here. They
have no automated coverage and are impractical to give any: they depend on real
pointer events, a live scroller with `elementFromPoint` under it, and the timing
of a press against a scroll the browser has already begun.

## Deliberately not done

- Inline front/back editing — still out of scope.
- Per-card `exclude:`, which would need a fence format change. See
  [[Support per-card deck]] for the neighbouring question about `deck:`.
- Sorting in the list and cards layouts. They have no headers to click, and an
  ordering set elsewhere would be invisible and un-undoable from those layouts.
- The editor context-menu paths (`setLineCardsDisabled`, `removeLineCards`) were
  not retrofitted onto the undo stack.
