---
title: 3D Graph - Note title and H1 plates draw in a fixed order
summary: "Some plates always draw in front of, or always behind, others regardless of depth — most visibly the note-title plate and its H1 heading plate."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Plates for every node]]"
  - "[[3D Graph Phase 4 - Near tier]]"
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

Found in Sawyer's Batch 1 manual test, 2026-10-31 (test 1.2). Overlap works correctly for the most part.

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Desktop (Obsidian) |
| Operating System | Linux |

## What happened?

On `tests/graph3d/Knot Names Abroad.md`, some plates persistently render in front or behind whatever the camera angle. Sawyer suspects the note title plate and the H1 plate (both "Knot Names Abroad"), which sit almost on top of each other. In the screenshot, the faint "Reef knot ⚓ 8 — symbols and emoji" line plate draws across the big title plate.

![[2026-10-31 3D graph title plate order.png]]

## What should have happened?

A nearer plate covers a farther one (no decluttering), consistently, from any angle.

## Notes for the implementer

Things to check:
- Whether one of the plates is a near-tier **DOM panel**: DOM always draws over WebGL (a known Phase 4 limit). If so, that is the cause, and the fix belongs to how panels and plates interact (e.g. hide the plate under a panel, or leave a panel off when a nearer WebGL plate overlaps it).
- Depth precision / `PLATE_PULL` (0.97) / glyph depth offset, and differing plate sizes (title 10 vs line 5).
- Whether the title and H1 plates are seeded at nearly the same spot and have too short a link between them.

**Related minor issue (only if cheap):** when flying very slowly, the *borders* of distant plates (just before they become far plates) flicker slightly. Likely the SDF outline aliasing at sub-pixel width. Sawyer says it can be ignored if it isn't cheap.
