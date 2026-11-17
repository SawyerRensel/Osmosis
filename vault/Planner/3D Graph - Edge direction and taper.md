---
title: 3D Graph - Edge direction and taper
summary: "Show which way an edge flows (parent to child, source to target), e.g. with thickness that tapers from thick to thin like the 2D mind map's branch taper, or with arrows."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[Develop Mind-Map Graph View]]"
status: Ideas
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

# Feature Request

An idea Sawyer raised in the Batch 1 test, 2026-10-31, to consider during theming/styling work (possibly the Phase 5 Overlays menu).

## What do you need built?

Edges are thin 1-px lines today. They work, but they don't show the direction of flow. Options:
- Thickness that tapers from thick at the source to thin at the target, mirroring the 2D mind map's taper setting.
- Arrows or markers at line ends.

## Notes

`LineSegments` can't vary width; tapered edges need instanced quads/ribbons (screen-space width). Weigh the draw-call and memory cost against the stress web (~30k plates) before choosing.
