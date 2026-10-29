---
title: 3D Graph Phase 3 - Streaming and stability
summary: "Make the loaded area stream as you move: fade in/out, prefetch ring, pin-on-settle so the world never rearranges, and saved positions in plugin data."
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

- **Fading:** departing nodes fade out, leave the graph data and free their objects; arriving nodes fade in.
- **Prefetch:** the N + 1 ring reads only the link cache, so the next hop is instant.
- **Stability:**
  - Settled nodes are pinned (`fx/fy/fz`).
  - Only new arrivals are simulated, and they're pinned once they cool.
  - A new note is seeded next to the neighbour that pulled it in.
- **Saved positions** in plugin data, using cluster plus offsets:
  - The note cluster is keyed by path, updated on rename and pruned on delete.
  - Line offsets are keyed by `blockId`, falling back to `OsmosisNode.id`. A mismatched line re-settles near its parent.
- **Every line, always.** Use instanced far-tier meshes and a sprite atlas, and simulate only unpinned nodes. Measure on the vault's largest note.

**Acceptance:**
- Walking several hops never rearranges nodes that have already settled.
- Reopening the view (and restarting Obsidian) restores the same shape.
- Editing a line moves only that line.
- Unit tests cover position keying and pruning.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.
