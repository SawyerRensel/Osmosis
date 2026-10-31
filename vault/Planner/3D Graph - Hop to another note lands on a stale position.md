---
title: 3D Graph - Hop to another note lands on a stale position
summary: "Clicking a plate that belongs to another note rebuilds the graph, and the camera flies to where that plate was before the rebuild instead of where it is now."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph Phase 3 - Streaming and stability]]"
  - "[[3D Graph - Plates for every node]]"
status: To-Do
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-10-31T16:00:00.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
cover:
color:
pull_request:
---

# Bug Report

Found in Sawyer's Batch 1 manual test, 2026-10-31 (test 1.4).

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Desktop (Obsidian) |
| Operating System | Linux |

## What happened?

Clicking a plate always hops. A hop within the same note centres correctly. But clicking a plate that belongs to **another file** rebuilds the graph (new hop set), and the view is then often not centred on that node: the camera goes to the plate's *previous* location, from before the rebuild, where it no longer is.

![[2026-10-31 3D graph hop stale target.png]]

(Orange boxes: the clicked plate is at top left, and the camera centred on the empty spot at right.)

## What should have happened?

After any hop, including one that changes the loaded set, the camera ends up centred on the clicked node at its current position, and stays on it while the new arrivals settle.

## Steps to Reproduce

1. Open `tests/graph3d/Sailing Basics.md` → "Open 3D graph for current note", depth 2.
2. Click a plate that belongs to a different note (e.g. the `Weather` title from a `Navigation` line).
3. The graph rebuilds; the camera centres on empty space near where the plate used to be.

## Notes for the implementer

Likely cause to check first: the flight target is captured from the node's position before `setData`/the loaded-set diff runs, or the clicked node is re-seeded (new object or new position) by the rebuild. Fix by resolving the target after the rebuild, or by following the node (by id) during the flight until it settles. Positions are never persisted (Sawyer's decision); don't add persistence to fix this.
