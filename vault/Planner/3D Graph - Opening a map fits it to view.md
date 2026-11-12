---
title: "3D Graph - Opening a map fits it to view"
summary: "Opening a 3D mind map should frame the whole map (the toolbar's Fit) instead of zooming to the root note."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Navigation gizmos]]"
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

# 3D Graph - Opening a map fits it to view (T67)

## Request (Sawyer, 2026-11-12, verbatim)
> Opening a 3D mind map should zoom to fit, not zoom to root note

## Design
- The initial camera framing when a 3D map opens (first load of the view, and re-opening a note in the view) uses the same framing as the toolbar's Fit (`fitToView` → `this.scene?.fitAll()`, `src/views/Graph3DView.ts:746`; pure framing in `src/graph3d/fit.ts` / `framing.ts`).
- Don't change hop-to-another-note flights (following a link, history back/forward) unless they share the exact same code path as "open". If they do, keep their current behaviour and only change the open case; record which path you found.
- A restored view state (e.g. Obsidian restoring a workspace) that carries a camera, if any exists, may keep it; record what you find.

## Acceptance criteria
- Opening any note in 3D (from the note header's 3D pill, the command, or the file menu) shows the whole map framed exactly as pressing Fit would.
- Link hops and back/forward behave as before.
- Unit test for any pure helper you add or change.

## Context budget
Under ~130k. Read Graph3DView.ts by range around `onOpen`/`setState`/`loadFile` and the first-frame camera code in Graph3DScene.ts (grep `fitAll`, `focus`, `frame`). fit.ts/framing.ts whole.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.
