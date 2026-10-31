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
status: In-Review
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-10-31T15:55:00.000Z"
date_start_scheduled: "2026-10-31T15:35:40.000Z"
date_start_actual: "2026-10-31T15:35:40.000Z"
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

## Batch implementation notes (awaiting manual test)

Built 2026-10-31 on `fix/3d-graph-batch-1`, commit 7d0aaa6. Not pushed, no PR, and not yet run in Obsidian.

### Cause

The cause is DOM over WebGL. It is not depth precision, and it is not the seeding.

- **What the screenshot shows.** The faint "• Reef knot ⚓ … — symbols and emoji" over the big title is a **near-tier DOM panel**: it has the Markdown list bullet, and its siblings wrap onto two lines, which plates never do. It is faint because its veil mixes it toward the background, and the behind-focus dim (up to 0.7) is stronger than the in-front dim (up to 0.3). So that line sits *behind* the focus, and the focus is around the title. The small bold "Knot Names Abroad" is the H1 line's panel. The big outlined title is the **note core**, and note cores never get a panel (`nearMarkdown` returns `null` for them). It is always a WebGL plate. A DOM panel always composites over the canvas, so the farther line drew over the nearer title from every angle. That matches "fixed order".
- **Depth precision is ruled out by the numbers.** The near plane is 1 and the far plane is `skyRadius × 2.5` = 125,000. With a 24-bit depth buffer, depth resolution is about z² / (near · 2²⁴): ≈ 0.0006 units at z = 100 and ≈ 0.015 at z = 500. Linked plates are at least `edgeDistance` (18 for hierarchy) plus both extents apart, so the gap is thousands of depth steps. `PLATE_PULL` (0.97) scales every view-space vertex by the same factor, so it keeps depth order and screen size. The glyph polygon offset (−1, −4 units) moves a glyph by only a few depth steps.
- **Seeding is ruled out.** The title and H1 are a hierarchy link apart (18 + extents). Plate-on-plate overlap between them is ordinary WebGL depth testing, which already worked ("overlap works correctly for the most part").

### Fix

Each panel now masks out every plate that is nearer than it and overlaps it on screen. The WebGL plate shows through the hole, exactly as the depth buffer would draw it.

- `platesOnScreen` (in `Graph3DNear`) projects every drawn plate once per frame, using the render's camera. A plate counts if it is placed and its opacity is above 0, even when mist or the focus dim has faded it: a faded plate is still opaque and still writes depth. Plates off the viewport are skipped.
- `panelHoles` (pure) keeps the plates that are nearer than the panel's view depth and overlap its scaled box. It converts them into the panel's own layout px. All of a camera-facing plate sits at its centre's view depth, so comparing view depths matches the depth buffer exactly.
- `holeMask` (pure) builds CSS mask layers. The top layer is a full fill with `mask-composite: subtract`, and the holes under it are combined with `add`. So overlapping plates stay one hole. Each rounded hole is two crossed rectangles plus four radial-gradient corner discs, matching the plate's `PLATE_RADIUS` corners.
- The panel box's size comes from a `ResizeObserver`, so there are no layout reads in the render loop. The mask is written only when it changes.

**Border flicker (optional part, cheap, done):** the plate shader's outline band was sub-pixel on distant plates, so it aliased as the plates moved. It is now drawn at least one pixel wide and faded in proportion (`stroke / band`), so its average brightness is unchanged.

### Decisions worth remembering

| Decision | Why |
|---|---|
| Mask the farther panel rather than hide it, or drop it from the tier | Hiding or dropping removes a whole panel when a small plate covers one corner. An image panel would lose its image because a title overlaps its edge. The mask shows exactly what a depth-tested panel would show. Nothing moves and nothing nearer is hidden, so it is not decluttering. |
| CSS mask layers, not `clip-path` | A `clip-path` with holes uses evenodd or nonzero winding, so where two holes overlap, the overlap becomes visible again. Mask compositing (`subtract` over an `add` union) handles overlaps correctly. Gradients render synchronously, unlike an SVG data URL. |
| Nearer nodes that have their own panel still cut holes | Their panel already covers that area (it stacks higher and is at least plate-sized). The hole only matters while their panel cross-fades, and then their plate really is showing. |
| Edges still draw under panels | This ticket covers plates. An edge nearer than a panel is a thin line, and a mask per edge segment would cost far more. This is a known remaining limitation. |

### Surface map

| File | Change |
|---|---|
| `src/graph3d/occlusion.ts` | New, pure: `panelHoles`, `holeMask` |
| `src/graph3d/occlusion.test.ts` | New: 8 tests |
| `src/views/Graph3DNear.ts` | Per-frame screen plates, a mask per panel in `place()`, a `ResizeObserver` for box sizes (disconnected on destroy, unobserved on removal) |
| `src/views/Graph3DPlates.ts` | The outline band is at least one pixel wide, faded proportionally |
| `styles.css` | `mask-repeat: no-repeat` on `.osmosis-graph3d-near-panel` |

### Fixture

`tests/graph3d/Knot Names Abroad.md` (existing, unchanged).

### Could not verify

- Not run in Obsidian. Needs Chromium 120+ for unprefixed `mask-composite` (current Obsidian desktop has it; iOS Safari 15.4+ supports it too).
- CSS masks don't change hit-testing. A video's controls under a nearer plate's hole still take the click.
- The border-flicker change is untested visually.
