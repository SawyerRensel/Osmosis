---
title: 3D Graph - Mouse-look easing
summary: Mouse-look (mouse drag while flying with WASD) felt too sensitive; lower the rate and ease the turn.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[Graph pointer gestures - orbit, pan, link, menu]]"
status: Done
priority:
progress:
date_created: 2026-11-09T12:50:00Z
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: 2026-11-09T12:50:00Z
date_start_actual: 2026-11-09T12:51:00Z
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         |       |
| Operating System |       |

## What happened?

Holding the mouse button while flying with WASD turns the drag into mouse-look, which Sawyer finds "super sensitive". The touch joysticks feel great and are unchanged.

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

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Approach.** Mouse-look drag deltas (`drag.look && !drag.touch`) no longer rotate in `rotate()`; they add to `lookPending` (px). Each `tick()`, `easeLookPending()` takes an exponential share of it (`easeLook`, tau 0.1 s, frame-rate independent) and rotates the camera in place by `LOOK_RATE`-scaled pixels. After release the rest keeps easing out, so the camera glides to a stop.

**Decisions.**
- `LOOK_RATE` lowered from PI to 0.6 PI: a modest cut, since easing itself also takes the edge off; easy to retune.
- Pending is dropped on a new pointer down and at the two sites that start a flight to a node (`pendingFlight = null`), not in `cancelFlight()`: `fly()` calls `cancelFlight()` every frame while WASD is held, which would kill the glide.
- Touch look, orbit, pan, the look stick (`lookAround`) and the wheel's flight-speed behaviour are untouched.

| File | Change |
| --- | --- |
| `src/graph3d/look-ease.ts` | New pure `easeLook(pending, seconds)` |
| `src/graph3d/look-ease.test.ts` | Frame-rate independence, convergence, stop |
| `src/views/Graph3DScene.ts` | `LOOK_RATE`, `lookPending`, `rotate()` accumulates, `easeLookPending()` in `tick()` |

**Fixture.** Any note in `vault/tests/graph3d/` (no new fixture).

**Not verified.** Feel of 0.6 PI / 0.1 s in Obsidian (cannot run it).
