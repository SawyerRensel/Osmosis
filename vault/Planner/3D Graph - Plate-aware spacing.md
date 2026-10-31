---
title: 3D Graph - Plate-aware spacing
summary: Space the 3D graph's layout for plates, not points. Link lengths grow with the plates at each end, so sibling plates around a parent stop piling up.
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Plates for every node]]"
  - "[[3D Graph - Focus dimming]]"
status: To-Do
priority:
progress:
date_created: "2026-10-31T11:19:43.000Z"
date_modified: "2026-10-31T11:19:43.000Z"
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

## What do you need built?

Part of [[Develop Mind-Map Graph View]]. Make the force layout leave room for plates.

### Why the plates crowd today

**Node size doesn't affect the layout at all.** There is no collision force. Spacing comes only from:
- the many-body charge (`CHARGE = -30`, wrapped by `settle.ts`);
- link distances by edge kind (`edgeDistance()` in `src/graph3d/appearance.ts`: hierarchy 18, embed 45, tag and attachment 50, link and property 80).

A line plate is 5 world units tall (`LINE_PLATE_HEIGHT`) and up to about 50 wide. A note title is 10 tall (`CORE_PLATE_HEIGHT`). So a heading with dozens of lines 18 units away is a pile of overlapping plates (Sawyer's close-up screenshot, 2026-10-31). Spheres were small enough that this never showed.

### Design (start cheap, measure, escalate only if needed)

1. **Plate-sized link lengths:** `distance = edgeDistance(kind) + halfExtent(source) + halfExtent(target)`. A plate's half extent comes from its measured width and height. Plate layout from [[3D Graph - Plates for every node]] knows the plate size synchronously. Until then, estimate it from the text length. This adds almost nothing per tick.
2. **Only if (1) isn't enough:** a collision force (`forceCollide` from d3-force-3d) with each plate's bounding radius. It adds a calculation for every node on every tick. That is the part of the slow first load we suspect but haven't measured (first load ran at ~3 fps for 5–10 s on the stress web, with tick + render only ~36 ms of a 422 ms frame). **Time the simulation step before and after**, and don't add it unless the numbers allow.

- Pure logic (link distance from kind and plate extents) goes in `src/graph3d/appearance.ts` or `settle.ts`, test-first.
- Settled nodes are pinned (Phase 3), so the new spacing applies to areas loaded after the change. Each session settles afresh, so reopening the view shows it everywhere.

### Open question

Should siblings also spread apart, not just away from their parent? Link length pushes children outward, and the charge spreads them over a larger sphere. Check whether that's enough before reaching for collision.

## What problem does this solve?

Plates appear packed together compared with the spheres they replaced, which hurts readability as much as the depth cues do.

## What's your current workaround?

None. Zoom in further, which doesn't separate overlapping plates.

## Test plan

- **Unit:** link distance grows with each end's extent, and the kind's base distance is preserved.
- **Measure:** simulation step time and first-load time on the stress web, before and after.
- **Manual (Sawyer):** the busy node from the close-up screenshot has readable, mostly non-overlapping sibling plates. Walking several hops still never rearranges settled nodes.

## Conventions

- lint → test → build → manual-test instructions → stop for Sawyer before committing.
