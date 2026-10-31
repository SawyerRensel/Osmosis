---
title: 3D Graph - Near-tier panels overlap and hide their edges
summary: "In dense clusters the near-tier panels (images, code blocks, callouts) are much larger than their plates, so they pile on top of each other and cover the edges, and you can't see what connects to what."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph Phase 4 - Near tier]]"
  - "[[3D Graph - Plate-aware spacing]]"
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

Found in Sawyer's Batch 1 manual test, 2026-10-31, on Sawyer's own notes (a CSS/flexbox note with many image and code panels).

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Desktop (Obsidian) |
| Operating System | Linux |

## What happened?

Near-tier panels overlap one another heavily, and because DOM panels always draw over the WebGL canvas, they also hide the edges. "Can't see where these plates connect to."

![[2026-10-31 3D graph panels overlap 1.png]]
![[2026-10-31 3D graph panels overlap 2.png]]

## What should have happened?

Panels near each other should still read as separate nodes, and the edges between them should stay traceable.

## Notes for the implementer

The cause is very likely a size mismatch: plate-aware spacing sizes link lengths from the **plate** (`plateExtent(shape)`), but a near-tier panel for an image, an embed, a code block or a table is many times larger than the plate under it. Constraints and options:
- **Settled nodes never move** (Phase 3, confirmed by Sawyer). Don't push settled nodes apart when a panel appears.
- **No decluttering** (Sawyer): a nearer thing simply covers a farther one. So the panel stacking order must follow depth (check CSS2DRenderer z-index ordering is really applied), and the result must stay honest rather than hiding things.
- Options worth weighing: size an attachment/image node's *plate* (and therefore its spacing) from the media's aspect and a nominal size known before layout; cap panel size relative to plate spacing; show the edge endpoints over the panels (e.g. a thin edge overlay or connection markers on the panel border). Pick the one that best keeps connections visible without breaking the two constraints above, and record why.
