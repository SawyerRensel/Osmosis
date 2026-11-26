---
title: Study - Smooth zoom-out pan zoom-in when centering on study nodes
summary: "Smooth study-centering animation: slight zoom out for context, pan, then slight zoom in on the node to study. Cosmos and the 2D mind map. Parked by Sawyer on 2026-11-23."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Ideas
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
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
parent:
children:
blocked_by:
cover:
color:
pull_request:
---

# Study - Smooth zoom-out pan zoom-in when centering on study nodes

## What Sawyer asked
> Smooth animation for centering on nodes to study. Slight zoom out for context, then pan, then slight zoom in centered on node to study.

Raised as a batch 15 item; Sawyer said "let's not do this yet" during intake (2026-11-23), leaning toward Cosmos **and** the 2D mind map.

## Current state (survey, 2026-11-23)
- Cosmos centers the camera on study nodes:
  - `CosmosStudy.ts` `next` 254–279 calls the host's `goTo`/`visit`.
  - In `CosmosView.ts`, `goTo` is at 2307–2320 and `travel` at 2395–2412.
  - `CosmosScene.flyTo` is at 1199, `glideTo` at 1216 and `steerFlight` at 1586–1680.
  - The pure math is in `src/cosmos/flight.ts`: `flightPose` 53–66 eases with easeOutQuad, keeping the view direction.
- The 2D mind map study mode does not pan at all. `centerOnNode` 3494–3503 is an instant viewBox jump.
