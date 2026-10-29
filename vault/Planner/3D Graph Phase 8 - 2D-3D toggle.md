---
title: 3D Graph Phase 8 - 2D-3D toggle
summary: "A 2D/3D toggle in the Mind Map view with a lift-off transition: the 2D layout seeds positions at z = 0, then the forces are released."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: To-Do
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-10-29T01:03:06.000Z"
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
  - "[[3D Graph Phase 3 - Streaming and stability]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

- **The toggle:** a 2D/3D toggle in the Mind Map view toolbar, also registered as a command (toolbar groups drive both).
- **Lift-off transition:** the 2D `computeLayout` positions seed the 3D nodes at z = 0, then the forces are released. If the note already has saved 3D positions, the nodes animate to those instead.
- **Handover:** the focused node and camera carry across in both directions. **Proposed:** the toggle swaps the leaf's view type.

**Acceptance:**
- Toggling in either direction keeps the same note and focused node.
- The transition is smooth on desktop and mobile.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.
