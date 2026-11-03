---
title: 3D Graph - Flatten branches
summary: "A flatten slider in the Overlays menu: below a chosen outline depth, a note's branches lie flat as the 2D mind map lays them out (children in document order, top to bottom) in planes facing outward from the note's core, while the note's top and the links between notes stay 3D."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[3D Graph Phase 8 - 2D-3D toggle]]"
  - "[[3D Graph - Editor anchoring and overlays fixes]]"
status: To-Do
priority:
progress:
date_created: "2026-11-03T17:35:29.000Z"
date_modified: "2026-11-03T17:35:29.000Z"
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

## Why

Sawyer, 2026-11-03, paraphrased: a 2D mind map is compact and easy to read, but it's arbitrarily hierarchical; knowledge is "connections within connections", and the 3D graph shows that blend. The Hierarchy⟷organic slider leaning toward hierarchy helps, but traversing branches they still sprawl in 3D. Like a hand: the palm can curve so the fingers radiate, or lie flat. Wanted: nodes near a note's root stay 3D, and branches get flatter as they extend, to be as readable and editable as 2D while keeping 3D's connections. Also: **order matters**. An ordered list of 10 items lands in random places today, with no sense of 1, 2, 3; even unordered lists usually have a logical top-to-bottom order.

Settled in a grilling session the same day; the decisions below are Sawyer's. Terms as in `GLOSSARY.md` (outline depth, flat branch, flat depth).

## What do you need built?

- **Depth is outline depth**, counted within each note's own outline (title → headings → list items). Not hops from the focus note. Cross-note edges keep the 3D blend.
- **Flatten slider**, a *separate* slider in the Overlays menu (not folded into Hierarchy⟷organic). Its ends: far left nothing flattens (today's look); moving right, flattening starts higher in each outline; far right, everything under a note's title is flat. A gradual ramp over a depth or two, not a hard cut.
- **Default: moderate** (list items and deep headings flat out of the box), for new and existing users.
- **Live re-settle:** moving the slider unpins and re-settles the loaded nodes live, like the Hierarchy⟷organic slider (`Graph3DScene.reshape`). This is a **second deliberate exception** to "settled nodes never move", approved by Sawyer 2026-11-03. Don't extend it to any other path.
- **Shape and order:** a flat branch takes the **2D mind map's shape**: children stacked top to bottom in document order beside their parent, so a numbered list reads 1, 2, 3 down the page. Reuse the 2D `computeLayout` for the subtree rather than inventing a layout (Phase 8's lift-off also seeds 3D from `computeLayout`; share that path if it exists by then).
- **Facing:** each flat branch lies in a plane **facing outward from its note's core** (normal along core → branch root), so a note reads like a flower of flat petals from any side. Pick "up" within the plane consistently (e.g. world up projected onto the plane) so text and order read top to bottom.
- Fixed at settle time; plates still billboard to the camera as now.

## Open (for the implementing session to decide and report)

- How to impose the plane and order with d3-force-3d: a custom force pulling flat-branch nodes toward their 2D-layout targets in the branch plane (strength ramped by depth), versus pinning flat branches outright once their branch root settles. Measure tick time on the stress web either way (`settle.ts` limits charge to free nodes; keep that cheap).
- How cross-note edges from a flat branch pull without bending it out of its plane.
- Plate-aware spacing (`linkDistance`, plate extents) inside a flat branch: the 2D layout's spacing is in its own units; scale it to plate sizes.

**Acceptance:**
- At default, a note with a 10-item ordered list shows the list flat, items 1–10 top to bottom beside their parent; the note title and top headings still spread in 3D; links between notes still pull in 3D.
- Slider far left reproduces today's layout; far right flattens everything under each title.
- Dragging the slider re-settles live; nothing else moves settled nodes.
- Stress web tick time is reported before and after.

## Every phase

- Add or extend the fixture web in `e2e/fixtures/graph3d/` (include an ordered list of 10, a nested list 4 deep, and a cross-note link out of a deep item), copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
