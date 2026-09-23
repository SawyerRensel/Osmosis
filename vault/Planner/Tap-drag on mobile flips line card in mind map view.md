---
title: Tap-drag on mobile flips line card in mind map view
summary: A tap drag movement intended to pan the map will flip a line card or fence card in mind map view study mode
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
date_created: 2026-08-19T16:36:04.157Z
date_modified: 2026-09-23T01:42:44.116Z
date_start_scheduled: 2026-08-24T16:00:00.000Z
date_start_actual: 2026-09-09T02:13:34.421Z
date_end_scheduled: 2026-09-23T01:42:44.116Z
date_end_actual: 2026-09-23T01:42:44.116Z
pull_request: https://github.com/SawyerRensel/Osmosis/pull/39
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

| Field            | Value          |
| ---------------- | -------------- |
| Platform         | Obsidian mobile |
| Operating System | Android/iOS WebView |

## What happened?

In mind map study mode, a tap-drag meant to pan the map flipped the line card
or fence card the finger came to rest on.

## What should have happened?

The map pans. Nothing is revealed, and no rating bubble opens.

## Where is this file located?

`vault/tests/mindmap/tap-drag-pan.md`

## Steps to Reproduce

### 1. Start from

A map with due or new cards, opened in mind map view.

### 2. Prep/settings

Study mode, started from the graduation cap in the view header. Every target
node hides.

### 3. Do this

Press on a hidden node, or on empty background, and drag to pan.

### 4. Trigger

Lift the finger while it rests over a hidden node. That node reveals and opens
its rating bubble.

## What was implemented

### Where it shipped

[PR #39](https://github.com/SawyerRensel/Osmosis/pull/39), branch
`fix/mindmap-pan-tap-flip`, merged into `release/0.0.6`.

### The cause

`handlePointerUp` synthesized a tap without ever asking whether the gesture had
panned. A finger that starts on a node becomes a drag candidate; crossing the
drag threshold clears `dragNodeId` and promotes the gesture to a pan. On
release, `wasDragCandidate` is therefore false, so the handler fell into its
`!wasDragCandidate` branch and tapped whatever `getClickedNodeId` resolved from
the pointerup target — the node under the finger at the end of the pan. In peek
and study that tap is a reveal.

A pan that starts on the background reaches the same branch and ends the same
way, so both reported paths were one defect.

The mouse has the identical hole in a different handler. `handleClick` guards
with `if (this.isPanning || this.isDragging) return`, but a click is dispatched
*after* pointerup has already cleared `isPanning`, so the guard never fires. It
only bites when press and release land inside one node, because a click
spanning two elements is dispatched on their common ancestor, which belongs to
no node.

### The fix

A gesture that clears its slop and moves the map sets `panCommitted`. That flag
deliberately survives `handlePointerUp` and is cleared by the next pointerdown,
which is what lets the click handler see it. A committed pan ends the gesture
outright: no tap is synthesized and no click is acted on.

Four further gesture problems surfaced while testing, and were fixed in the
same branch since they share the pointer handlers:

- **The collapse toggle could not pan.** A press on it returned early from
  `handlePointerDown`, so the finger could not pan at all and the release
  always folded. It now starts a pan and folds on release, only if the map
  never moved. The toggle's geometry was already honest: a 14px circle
  hit-testing that exact circle, with no padded hit area.
- **The resize handle was invisible but live.** It renders at `opacity: 0`
  until `:hover`, which a phone never fires, leaving an 8px target on the right
  edge of every node. Touch now has to select the node first, and selection
  reveals the handle. The mouse is unchanged: hover reveals it before you can
  grab it.
- **A long press opened the context menu**, which swallowed the press on its
  way to becoming a node drag — the hold is the only way to move a node with a
  finger. `handleContextMenu` now returns on touch, and the menu is reachable
  from the ribbon's "More actions" button.
- **A long press toggled the held node out of the selection**, so a multi-node
  drag moved that node alone. `executeDrop` already moves every selected
  sibling; the hold was destroying the selection before the drag began.

### Decisions worth remembering

- **A committed pan suppresses the whole tap, in every mode.** This was
  deliberately narrowed to peek/study first, then widened at the user's
  request: a pan that ends on the background must not clear a selection built
  up before it, and one that ends on a node must not select it.
- **`panCommitted` is not cleared in `handlePointerUp`.** It has to outlive the
  handler so the click that follows can read it. Clearing it there is the
  obvious-looking simplification that would silently restore the mouse bug.
- **Touch slop is 10px, mouse and pen 5px.** A finger rolls as it presses and
  again as it lifts, and 5px of that wobble is not an attempt to move anything.
- **Peek and study always pan a node drag**, even after a long press, so a
  review can neither flip a card nor rearrange the note. This mirrors the rule
  reading mode already had.
- **Touch needs the long press to drag a node; the mouse does not.** A phone
  has no second button, so the hold is what distinguishes moving the map from
  moving a node. Making a bare tap-drag move nodes was considered and rejected:
  it would leave panning with nowhere to start on a dense map.
- **The mouse keeps hover-to-resize without selecting first.** Hover already
  reveals the handle, which is deliberate enough; a visible but inert handle
  would be worse.
- After a hold-then-drag the map stays in touch selection mode until a
  background tap. That predates this work and was left alone.

### Surface map

| File | Change |
| --- | --- |
| `src/mindmap-gesture.ts` | New. Drag thresholds per pointer type, and the rule deciding whether a node drag pans or moves the node. |
| `src/mindmap-gesture.test.ts` | New. Unit tests for both. |
| `src/views/MindMapView.ts` | `panCommitted` state; pan guards in `handlePointerUp` and `handleClick`; toggle press starts a pan; resize handle gated on selection for touch; `handleContextMenu` returns on touch; context menu extracted to `showNodeMenu`; long press preserves an existing selection; the two drag-threshold branches unified. |
| `src/views/ToolRibbon.ts` | "More actions" button, and button actions now receive their own element so a menu can anchor to it. |
| `styles.css` | A selected node shows its resize handle. |

### Test fixture

`e2e/fixtures/tap-drag-pan.md`, copied to `vault/tests/mindmap/`. A rail
signalling map, wide enough to need panning, with nine line cards, four
collapsible branches and one fence card, all new so study hides every one.
`vault/tests/mindmap/move-nodes.md` covered the multi-select reparent.

### Follow-ups

None opened. Two adjacent observations, both pre-existing: a multi-node drop
only carries selected nodes that share the dragged node's parent, matching the
keyboard move commands; and a hold-then-drag leaves the map in touch selection
mode.
