---
title: Deleting nodes in Mind Map view focuses on root node
summary: Viewport position should instead be unchanged.  Viewport can also jump around when moving /reparenting nodes.
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
date_created: "2026-10-20T07:52:48.888Z"
date_modified: "2026-10-20T08:24:21.326Z"
date_start_scheduled: "2026-10-20T12:46:40.000Z"
date_start_actual: "2026-10-20T12:46:40.000Z"
date_end_scheduled: "2026-10-28T01:02:34.000Z"
date_end_actual: "2026-10-28T01:02:34.000Z"
pull_request: https://github.com/SawyerRensel/Osmosis/pull/43
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

**Where it shipped:** [PR #43](https://github.com/SawyerRensel/Osmosis/pull/43), branch `fix/mindmap-edits-occlusion-width-startup` → `release/0.0.6`.

### The cause

Two separate things moved the view after a delete:

1. **An explicit pan.** `deleteNode` selected the deleted node's parent, but when the parent was the virtual root (a top-level node) it fell back to `selectFirstNode()` — the keyboard-nav entry point, which calls `scrollToSelectedNode()` and pans to the first node in the map. `deleteSelectedNodes` (multi-select) called `selectFirstNode()` unconditionally, so every multi-node delete jumped.
2. **A drawing shift.** The SVG draws layout space shifted by `-bounds.x1/y1 + LAYOUT_PADDING` (`getOffsetX/Y`). Any edit that moved the map's top-left bound — deleting the widest node on a left-side map, say — slid the whole drawing under an unchanged viewBox.

### The fix

- Both delete paths select a surviving parent of what was deleted, else the first node, via `selectNode()` — which never scrolls. `selectFirstNode()` itself is unchanged; keyboard nav still wants its pan.
- `renderPass` records the old offsets before swapping in the new layout and moves the viewBox by the difference, so layout-space content stays where it was on screen.

### Decisions worth remembering

- **"Nothing moves at all" was chosen over anchoring on a node.** The viewBox is kept numerically fixed (plus the offset correction), rather than holding the deleted node's parent at a fixed screen position. Siblings re-centering around their parent is the layout's job, not a viewport jump.
- **The offset correction applies to every re-render**, not only deletes — it is an artefact of how layout space is drawn, so adds, moves and renames stop sliding the map too. This also covers the "viewport jumps when moving/reparenting" half of the summary.

### Surface map

| File | Change |
|---|---|
| `src/views/MindMapView.ts` | `deleteNode` / `deleteSelectedNodes` select without panning; `renderPass` compensates the viewBox for offset changes |

### Test fixture

- `e2e/fixtures/delete-keeps-viewport.md` — a wide right-side map: delete a top-level node, a leaf, and a multi-selection; the view must not move.
- `e2e/fixtures/delete-keeps-viewport-left.md` — the same map on the left side with one very long node, so deleting it moves the bounds and exercises the offset correction.

### Follow-ups

None. No unit test covers the viewport: it lives in `MindMapView`, which imports `obsidian` and so cannot load under Vitest.
