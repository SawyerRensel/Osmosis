---
title: Branches are disappearing when zooming or panning beyond parent node
summary: A branch should always be visible when it's in the viewport bounds
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
date_created: 2026-08-04T13:09:54.437Z
date_modified: 2026-08-14T01:51:59.685Z
date_start_scheduled: 2026-08-14T02:06:58.000Z
date_start_actual: 2026-08-14T02:06:58.000Z
date_end_scheduled: 2026-08-14T02:16:00.000Z
date_end_actual: 2026-08-14T02:16:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/27
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

​![](Pasted%20image%2020260813215510.png)

Can see all branches from far out.

![](Pasted%20image%2020260813215547.png)

but zooming in some branches are culled/disappear

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

[PR #27](https://github.com/SawyerRensel/Osmosis/pull/27), branch
`fix/branches-culled-with-child-node` → `release/0.0.4`.

### The cause

Branch lines had no visibility test of their own during pan/zoom. Their lifetime
was welded to the **child node's**.

`MindMapView` culls in two places. The initial render (`render()`) already tested
a branch on its own geometry through `isBranchInViewport` — a bbox over the two
connection points, which is a sound bound because every `computeLinePath` style
keeps its control points inside that bbox. The *live* path did not.
`updateVisibleNodes`, which every pan and zoom reaches via `updateViewBox` →
`scheduleCullUpdate`, drew a branch only when its child node **newly entered**
the viewport, and deleted the branch when that child **left**.

A branch spans the gap between two nodes, so it is still on screen long after
either end has gone. That produces the reported symptom from both directions:

- Zoom in on a parent and its children pass outside the viewport first. Every
  branch reaching them is deleted and the parent is left bare.
- Pan past a parent and the parent goes first, with the same result seen from the
  children's end.
- A branch whose two nodes were *both* outside the viewport while it crossed the
  middle could never be drawn at all — no code path existed to create it.

The screenshot in this note is the second case: **Section 25** keeps its whole
fan, but the connectors from **Large Mind Map** up to Sections 24 and 26 are gone
because those two section nodes are off-screen.

Two further defects lived in the same code:

- The initial render added a node to `renderedNodeIds` even when its branch
  failed the branch test. Since the incremental pass only acts on nodes that are
  *newly* visible, it never went back and drew the missing line — it stayed
  missing until the node left the viewport and re-entered.
- Removal used `querySelector` (singular). A branch that is both tapered **and**
  patterned appends *two* paths under one `data-child-id` (`drawBranchLine`
  overlays a dashed centre-line on the taper fill), so the overlay was orphaned
  on screen.

### The fix

Branch lines get their own culling state — `renderedBranchIds`, keyed by child
node id — computed from `isBranchInViewport` over every node in the layout,
independent of whether either node it joins is rendered. Both the initial render
and `updateVisibleNodes` seed and maintain it, and removal takes every matching
path.

The node loop and the branch loop in `updateVisibleNodes` share one traversal, so
the extra work is a bbox test per node against the existing per-node visibility
test — no measurable cost on the large-map fixture.

### Decisions worth remembering

- **A branch is culled on its own geometry, never on its child's.** This is the
  whole fix. Re-coupling branch lifetime to node lifetime, for any reason
  (looks tidier, "the line has no node to attach to"), reintroduces the bug.
- **Branch lines are drawn for nodes that are not rendered.** Intentional, and
  the case that was previously undrawable. A long connector crossing the viewport
  with both endpoints outside it must still paint.
- **`isBranchInViewport` bbox-tests only the two connection points.** Verified
  sound against all four `computeLinePath` styles — `straight`, `angular`,
  `rounded-elbow`, `curved` all keep their control points within the endpoint
  bbox (the elbow radius is capped at a quarter of the span). If a branch style
  with outward-bowing control points is ever added, this bound has to widen.
- **A node pinned open for editing no longer pins its branch.** `editingNodeId`
  is force-kept in `nowVisible` because removing the DOM node would destroy live
  editor state. A path element carries no such state, so the geometry test
  governs it — which is also the more correct answer.
- **The `querySelectorAll` in the removal loop is load-bearing**, not defensive
  tidying. Tapered + patterned branches are genuinely two elements.

### Surface map

| File | Change |
| --- | --- |
| `src/views/MindMapView.ts` | Added `renderedBranchIds` culling state; cleared it alongside `renderedNodeIds` on teardown and on full render; split node and branch visibility in `updateVisibleNodes` and in `render()`'s draw loop; removal now takes every path matching a child id |

### Test fixture

`vault/tests/mindmap/large-map.md` (already present, unchanged) — 26 sections of
20 items each. Large enough that a zoom level showing one section's fan puts both
the neighbouring sections and the root outside the viewport, which is what
exercises every branch of the fix.

Verified manually: branches survive zooming past a parent's children, panning
past a parent, and the both-nodes-off-screen crossing case; no orphaned lines
after brisk pan/zoom; tapered + dashed branches leave nothing behind.

### Follow-ups

None. The connection-point maths is still duplicated between
`isBranchInViewport` and `drawBranchLine` — pre-existing, left alone, and worth
extracting to a pure module only if a third caller appears (it would also make
the culling predicates unit-testable, which they are not today because
`MindMapView` imports `obsidian`).