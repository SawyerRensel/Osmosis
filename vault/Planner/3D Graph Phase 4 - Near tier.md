---
title: 3D Graph Phase 4 - Near tier
summary: "Live Obsidian DOM for the nearest nodes: MarkdownRenderer in CSS2D billboards, media lifecycle, budgets, hysteresis, and a matched DOM fade into the mist."
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

- **Rendering:** `MarkdownRenderer.render()` into `CSS2DObject` billboards that face the camera. Reuse the mind map's rendered-HTML caching approach and its themes, shapes and per-node styles.
- **Budget:** the nearest nodes win (**Proposed:** 24 on desktop, 12 on mobile).
- **Tier selection:** pure logic in `src/graph3d/lod.ts`, with hysteresis at every boundary.
- **Media:** video and audio play only in the near tier, and pause when their node leaves it.
- **DOM fade:** a distance-based opacity fade tuned to match the WebGL fog, so the two read as one mist.

**Acceptance:**
- Callouts, code blocks, images, video and audio render live up close.
- Nothing flickers at tier boundaries.
- The node budget holds while flying through a dense area.
- Unit tests cover tier choice.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.
