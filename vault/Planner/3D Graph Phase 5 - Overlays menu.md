---
title: 3D Graph Phase 5 - Overlays menu
summary: "Blender-style Overlays menu in the 3D viewport: colour mode, edge-kind visibility, hierarchy-organic force slider, and lookdev options."
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
  - "[[3D Graph Phase 2 - View shell]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

A viewport header menu in the spirit of Blender's Overlays and Shading menus:

- **Colour by:** note (default), memory strength (FSRS retrievability), tag, node type.
- **Edges:** show or hide each kind (hierarchy, link, embed, property, tag, attachment, unresolved).
- **Forces:** a hierarchy ⟷ organic slider that scales hierarchy edge strength against cross-note edge strength.
- **Lookdev:** mist density, bloom, link particles, label visibility.
- **Persistence:** overlay state saved per view in plugin data (**Proposed**).

**Acceptance:**
- Every option changes the scene live.
- Settings survive a reload.
- The menu works with touch on mobile.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.
