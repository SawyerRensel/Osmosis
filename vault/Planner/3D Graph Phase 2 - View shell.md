---
title: 3D Graph Phase 2 - View shell
summary: "The 3D Graph ItemView: 3d-force-graph mount, far and middle tiers, mist, theme following, hop navigation, depth control, desktop and mobile controls."
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
  - "[[3D Graph Phase 1 - Graph model]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

- **Dependencies:** add `3d-force-graph` and `three` (exact versions) and use the d3 force engine. Measure the size delta in `main.js` (542,138 bytes before this phase) and the startup cost, and record both here.
- **The view:** `src/views/Graph3DView.ts` (`VIEW_TYPE_GRAPH3D`), registered in `main.ts`. Open it with the command "Open 3D graph for current note" and from the file menu.
- **Tiers:** far (point or sphere) and middle (text sprite), plus the note core drawn larger and brighter with its title.
- **Mist:** `FogExp2`. Background and fog colours come from Obsidian's CSS variables and update on `css-change`.
- **Navigation:**
  - Click or tap to hop: the camera flies to the node and the horizon recentres.
  - Orbit controls plus WASD/QE flight, with keys through the view's `Scope`.
  - Mobile: orbit, pinch and tap.
  - A depth control in the header.
  - A follow-active-note toggle, off by default.

**Acceptance:**
- Opening the view on a fixture note shows its N-hop neighbourhood in 3D.
- Hopping recentres the view.
- Switching between light and dark themes changes the mist.
- Works on desktop, iOS and Android.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.
