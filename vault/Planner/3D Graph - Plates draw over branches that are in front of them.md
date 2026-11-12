---
title: "3D Graph - Plates draw over branches that are in front of them"
summary: "Plates such as git status and Commands are drawn over branch lines that are nearer the camera. The nearer thing must cover the farther, by real depth."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets surface grab anywhere on the sphere]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-12T17:00:00.000Z"
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

# 3D Graph - Plates draw over branches that are in front of them (T74)

## Request (Sawyer, 2026-11-12, verbatim)
> Plates tend to appear in front of branches even when the branches should be in front.

Screenshot: `vault/media/r9-plates-over-branches.png` (gitignored; on this machine only). Plates such as "git status" and "Commands" are drawn over branch lines that should pass in front of them.

## Rule (memory: never declutter)
The nearer thing must cover the farther, by real depth. Do not fix this by hiding, fading or thinning anything.

## Hypothesis to test, with numbers
- Plates are drawn with `PLATE_PULL` 0.97 (`src/views/Graph3DPlates.ts:56`, applied in the vertex shader at `:201`: `mvPosition.xyz *= 0.97`) with depth write, so every plate is pulled 3% toward the camera. An edge segment that is in front of the plate by less than 3% of the camera distance loses the depth test. Also check: do edges write/test depth, and in which render order relative to plates? Does `Graph3DNear.ts` (~:698) rely on the pull?
- Quantify: for the screenshot's geometry (typical camera distance and plate–edge separations), how many cases flip. Then pick a fix that keeps whatever the pull was introduced for (probably plates not being cut by their own node's edges / z-fighting with their sphere/connector) — e.g. a much smaller constant-world-unit pull, polygon offset, or excluding only the plate's own incident edges — and show with numbers it no longer inverts real ordering.
- Read the history of `PLATE_PULL` (`git log -S PLATE_PULL`) to learn why it exists before changing it.

## Acceptance criteria
- A branch that is nearer the camera than a plate draws over that plate; a plate nearer than a branch covers it.
- Whatever the pull was for still works (record what that is and how you verified it).
- Unit test on any pure depth helper.

## Context budget
Under ~130k. Opus. Graph3DPlates.ts and src/graph3d/depth.ts whole; Graph3DScene.ts / Graph3DNear.ts by range.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.
