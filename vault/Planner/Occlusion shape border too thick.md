---
title: Occlusion shape border too thick
summary: Occlusion shapes have reasonable thickness in the occlusion editor, but study and peek modes show shape border thickness as very thick.  The thick borders can cover up part of the answer when the card is flipped, which defeats the purpose of revealing a card.
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
progress_current:
progress_total:
date_created: 2026-09-22T21:51:58.965Z
date_modified: 2026-09-23T01:52:04.775Z
date_start_scheduled: 2026-09-23T01:55:27.000Z
date_start_actual: 2026-09-23T01:55:27.000Z
date_end_scheduled: 2026-09-23T02:02:56.000Z
date_end_actual: 2026-09-23T02:02:56.000Z
pull_request: https://github.com/SawyerRensel/Osmosis/pull/40
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
# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         |       |
| Operating System |       |

## What happened?

*What actually happened? Describe what went wrong.*

​

## What should have happened?

*What did you expect to happen instead?*

​

## Where is this file located?

*Paste the filepath location  (if the bug occurred in a test file)*



## Steps to Reproduce

### 1. Start from

(e.g. new scene / open file link)  *Attach a screenshot for this step*



### 2. Prep/settings

(e.g. setting/value changes)  *Attach a screenshot for this step* 



### 3. Do this

(e.g. click this button)  *Attach a screenshot for this step*

​

### 4. Trigger

Describe the last action you took before the problem  *Attach a screenshot for this step*

​
## What was implemented

### Where it shipped

[PR #40](https://github.com/SawyerRensel/Osmosis/pull/40), branch `fix/occlusion-stroke-thickness` → `release/0.0.6`.

### The cause

`04a09da` made every *shown* occlusion stroke a fraction of the picture — `0.75cqmin` for masks, `1.5cqmin` for the revealed ring — so an outline in a thumbnail-sized mind-map node would not be blown up into a heavy border by the map's zoom. The fraction had no ceiling, so it also grew with the picture. The editor kept fixed 1.5px strokes, which is why it looked right there and nowhere else. Measured in Chromium:

| Picture on screen | Before (mask / ring) | After |
|---|---|---|
| 380×600 (phone) | 2.85px / 5.7px | 1.5px / 2px |
| 1000×700 (study modal) | 5.25px / 10.5px | 1.5px / 2px |
| 120×80 (small mind-map node) | 0.6px / 1.2px | 0.6px / 0.8px |

A stroke straddles the shape's edge, so half the revealed ring lay *over the answer* — 5px of it on a large diagram. Peek (`all-revealed`) rings every group at once, which made it the worst case.

### The fix

CSS only. The fraction now only ever thins a stroke: masks are `min(0.75cqmin, 1.5px)`, the revealed ring `min(1cqmin, 2px)`. The `@supports not (container-type: size)` fallback uses the same caps (ring 3 → 2).

### Decisions worth remembering

- **Capped, not reverted to fixed pixels.** Fixed pixels would bring back the heavy border in small mind-map nodes that `04a09da` fixed. `min()` keeps both: proportional below the cap, the editor's weight above it.
- **The ring is 2px, not the old 3px.** The amber colour draws the eye; the weight only hides the answer. At 2px at most 1px falls inside the shape.
- **The editor is untouched.** Its fixed strokes are the reference the user called "reasonable", and its constant-on-screen rationale (`04a09da`) still holds.

### Surface map

| File | Change |
|---|---|
| `styles.css` | `.osmosis-occlusion-mask` and `.is-revealed` stroke widths capped with `min()`; fallback ring 3 → 2; comments updated |

### Test fixture

No new fixture — `vault/tests/flashcard/occlusion-surfaces.md` already exercises reading view, peek, contextual/sequential study and the mind map. Manually confirmed on those surfaces, on phone, and that the editor is unchanged.

### Follow-ups

None.
