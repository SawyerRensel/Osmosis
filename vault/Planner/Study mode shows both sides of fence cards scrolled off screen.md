---
title: Study mode shows both sides of fence cards scrolled off screen
summary: On Android, starting contextual study in a long note left many fence cards with their backs showing instead of hidden.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: Done
priority:
progress:
date_created: 2026-09-29T16:20:00.000Z
date_modified: 2026-09-30T01:34:44.000Z
date_start_scheduled: 2026-09-29T16:20:00.000Z
date_start_actual: 2026-09-29T16:20:00.000Z
date_end_scheduled: 2026-09-30T01:34:44.000Z
date_end_actual: 2026-09-30T01:34:44.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/42
---

# Bug Report

## Environment

| Field            | Value                                      |
| ---------------- | ------------------------------------------ |
| Platform         | Mobile (Android); desktop (Ubuntu) correct |
| Operating System | Android, Ubuntu                            |

## What happened?

In Note view contextual study of `HTML Elements Reference` (117 inline-code cloze fences), some fence cards showed both their blanked front and their filled-in back. The card for `<figure>` showed its answer, while the `<figcaption>` card right above it was hidden correctly. The same note on Ubuntu hid every back.

## What should have happened?

Every fence the session is asking should show the `░░░░░░` placeholder in place of its back until it's revealed.

## Where is this file located?

`vault/tests/HTML Elements Reference` (a copy of the note from the main vault; it has no `.md` extension).

## Steps to Reproduce

### 1. Start from

Open a long note with many fence cards in reading view, with neither Peek nor Study on.

### 2. Prep/settings

None.

### 3. Do this

Scroll far enough that the cards at the top leave the screen (on a phone, a short scroll is enough).

### 4. Trigger

Press **Study**, then scroll back to the cards that were off screen. They show both sides.

## What was implemented

Shipped in [PR #42](https://github.com/SawyerRensel/Osmosis/pull/42) → `release/0.0.6`.

### The cause

Obsidian's reading view keeps only the sections near the viewport attached to the document. It detaches a section that scrolls far enough away and re-attaches the same element later, without re-running the code block processor. Starting or stopping Study or Peek doesn't re-run the processor either, so `ContextualStudyProcessor` keeps a list of drawn fences (`trackedFences`) and redraws them from `refresh`. But `trackFence` pruned every detached entry each time any fence rendered, and `refresh` skipped detached entries too. Fences off screen when Study started were therefore never redrawn. When the reader scrolled back, they came back drawn for plain reading, with both sides showing.

It showed on Android because a narrow screen makes every fence tall, so most of a 117-fence note is detached at any moment. On the wide desktop window, the fences near the reader were still attached. It wasn't a scheduling difference between devices: the `<figure>` and `<figcaption>` fences were both unscheduled (new), so both were session targets.

### The fix

- **Detached is not gone.** `trackFence` now drops an entry only when it's superseded: the same fence (`sourcePath` + fence ID) rendered again while the old element is detached. An attached duplicate is kept, because it's the same note open in a second pane. This is the rule `LineRevealProcessor.trackLine` already followed for line cards.
- **`refresh` restarts detached fences too**, so they're correct by the time they're re-attached. Drawing into a detached element is safe.

### Decisions worth remembering

- **Don't bring back "prune if not `isConnected`".** It looks like harmless housekeeping, and it's exactly what caused this bug. `isConnected` can't tell a fence that was scrolled away from one that was thrown away.
- **Entries for closed notes are kept** until that fence renders again or the plugin unloads. `LineRevealProcessor.states` holds line cards the same way. Pruning by open notes would need a workspace scan on every fence render, and the retention is bounded by the fences actually viewed.
- **The fix is in tracking, not in a "redraw on re-attach" hook.** Obsidian gives no event when a section re-attaches. An IntersectionObserver or MutationObserver per fence would be more machinery than keeping the list correct.

### Surface map

| File | Change |
|---|---|
| `src/views/ContextualStudyProcessor.ts` | `trackedFences` entries carry `fenceId`; `trackFence` prunes only superseded detached entries; `refresh` no longer skips detached ones |
| `src/views/ContextualStudyProcessor.dom.test.ts` | Test: a fence detached before study starts shows its placeholder once re-attached |

### Test fixture

`vault/tests/HTML Elements Reference`: open it in reading view, scroll to the bottom and back, press Study, and scroll through it. Every back should be hidden. It's untracked and has no `.md` extension, so rename it before opening it in Obsidian.

### Follow-ups

None.
