---
title: 3D Graph - Note spacing applies late and shrinks
summary: "The stored Note spacing is not applied when the 3D graph first loads (only after a Depth change reloads the data), and raising Note spacing shrinks the layout instead of spreading notes apart."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Spacing sliders]]"
status: Done
priority:
progress:
date_created: "2026-11-10T04:17:14.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-10T04:17:14.000Z"
date_start_actual: "2026-11-10T04:17:14.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Obsidian desktop |
| Operating System | Linux |

## What happened?

Sawyer (2026-11-09, testing [[3D Graph - Spacing sliders]]): "Note spacing kinda works, but only after I slide the Depth down to zero and back up again."

His three screenshots are all in the **Planets** layout, Node spacing ×1.15:

1. Opening the graph with Note spacing already at ×3: planets well apart, but the middle of the map is a tangle of overlapping planets. He called it wrong.
2. Sliding Note spacing down to ×1: everything draws in. That looks right.
3. Sliding back up to ×3: the map gets *smaller* than it was at ×1 (the outer planets end up closer to the middle), and keeps shrinking with each pass, when it should spread the notes farther apart.

## What should have happened?

The same Note spacing gives the same layout however you got there: on first load, after a Depth change, or after dragging the slider there. A larger Note spacing always spreads notes (and planets) farther apart. This applies to all three layouts.

## Where is this file located?

`vault/tests/graph3d/Sailing Basics.md`, `Anchor Balance.md`, `Anchor Radial.md`

## Steps to Reproduce

### 1. Start from

Open `Sailing Basics.md` in a 3D graph at depth 2 or more.

### 2. Prep/settings

Overlays → Layout: Planets. Node spacing ×1.15.

### 3. Do this

Drag Note spacing ×3 → ×1 → ×3.

### 4. Trigger

At the second ×3, the map is tighter than it was at ×1.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code in d23525b on `fix/3d-graph-note-spacing` (stacked on 3d1222f).

### Cause

There were two bugs. Neither was about *when* the spacing is applied. Both made the settled layout depend on where the settle started, so the same setting looked different depending on how you got there. That is why a Depth round trip (fresh seeds) could look right while the slider (re-settling from the current layout) looked wrong.

- **Planets: lanes overdriven.** A link between planets (a lane) was d3's link force on the *surface plate*. Its strength was "one over the fewer links at either end", counted per plate, so a plate with one lane pulled at up to full strength. `PlanetWorld.step` then added every plate's share to the planet's core. A planet with several lanes therefore took several times a node's pull in one tick. It overshot and swung, and the layout cooled wherever the swing left it. With a tag, or a few busy planets, it flew apart. Reheating the layout on every step of a slider drag made it worse. In an offline replay of this force setup (3 to 6 planets, 2 to 12 lanes each, a tag, leaf ghosts), it diverged to 1e20+ within 200 hot ticks and also during ordinary settles.
- **Organic and Flat slices: a pull between notes.** T28's charge split (`spaceCharges`) gives each note's core an extra (Note² − Node²) × strength. When Note spacing is below Node spacing (Note ×1 with Node ×1.15 is enough), that extra term is a *pull* from each core on whole other notes. It doesn't weaken as notes overlap, while the line-to-line repulsion between two overlapping notes cancels out. So notes that came close fell into one another and stayed there. In the replay, Note ×1 with Node ×1.15 from fresh seeds put every note core on the same point. After a ×3 settle it didn't.

### Suspects ruled out (from the ticket brief)

- **`PlanetWorld.spacing` and the link-distance callback are already live from the start.** `setOverlays` sets `world.spacing` unconditionally, and the constructor calls it with the stored overlays. `linkDistanceOf` reads `this.overlays` on every call. d3 re-reads all distances and strengths on every `graphData` (each `pushData`).
- **No initial-overlay ordering problem.** `world` is a field initialiser, and `linkForce` is assigned before the constructor's `setOverlays`.
- **Not cumulative.** `spaceCharges` scales a map that `chargeStrengths` builds fresh in every `pushData`, so it never multiplies the same strengths twice. A unit test runs ×1, ×3, ×1, ×3 and gets identical configs.

### Fix

- **Planets: `PlanetWorld.step` now pulls the lanes itself** (`pullLanes`). It uses d3's own law: the same rest length (`linkDistance`, so Note spacing scales it as before) and ends measured ahead by velocity. The difference is that the lanes are counted per *body*: a planet counts once, with all its lanes, the way d3 counts a node's links. Strength is the force-balance scale over the fewer lanes at either body, and each correction is split by lane count, so the busier body moves less. A plate's end is measured at its core plus its (eased) offset. `Graph3DScene.buildLanes` collects the pulling links that touch a planet and cross bodies, in `pushData` and `setTheme`. d3 gives those links strength 0.
- **Organic and Flat: only a push is owed.** `spaceCharges` owes `max(0, Note² − Node²)`. When Note spacing is tighter than Node spacing, notes still draw in through the link rest lengths, which Note spacing scales, and the lines' charge at Node² keeps them apart.

In the replay after the fix, every case was stable, including 200 ticks held at alpha 1. The ×3 / ×1 / ×3 / ×1 passes came back to the same separations (Planets ±2%, Organic ±10%), ×3 was always clearly wider than ×1, and nothing collapsed.

### Decisions worth remembering

- **Lanes live in `PlanetWorld.step`, not d3.** d3's link *bias* (how a correction is split between the two ends) uses its own per-node link counts and can't be overridden. Fixing only the strength (an earlier try: count degree per planet) left a planet with many lanes to leaf ghosts at 6× a node's pull. Don't hand lanes back to d3's link force.
- **The lane rest length is unchanged**: plate to far end, as before. I considered measuring lanes surface to surface (radius + radius + edge distance × Note spacing). It would make Note spacing much stronger for big planets, but it would change ×1, so I didn't. In the replay, with large planets (80 × 30 plates) ×3 was only about 10% wider than ×1, because the collision gap wins there. With planets the size of Sawyer's screenshots (small next to their lanes), the rest length dominates. If ×3 still looks too timid on big planets, that is the follow-up.
- **No pull is owed when Note < Node.** Below Node spacing, the force layouts tighten notes only through link rest lengths. That is monotonic and stable, but softer than Note² would be. A real "tighter between notes than within" would need a pair-aware many-body force, which d3's isn't.
- **×1 parity.** Organic and Flat at ×1/×1 are untouched. Planets at ×1 changes in dynamics only (same rest lengths, strengths now counted per planet). It was unstable before, so its old ×1 layout wasn't reproducible anyway.
- No changes to Node spacing, decluttering or settled-node pinning. Re-settles still happen only from the approved slider path.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/planets.ts` | `Lane`; `PlanetWorld.step` takes `lanes`; `pullLanes` (body-level d3 link law). |
| `src/graph3d/settle.ts` | `spaceCharges` never owes a pull (`max(0, …)`). |
| `src/views/Graph3DScene.ts` | `lanes`, `buildLanes` (in `pushData` and `setTheme`), passed to `world.step`; `linkStrength` is 0 for links touching a planet. |
| `src/graph3d/settle.test.ts` | Never a pull; an overlapping note is pushed out (fails on the old code); ×1/×3/×1/×3 identical; push non-decreasing in Note spacing; rest lengths strictly longer at ×3. |
| `src/graph3d/planets.test.ts` | "Lanes between planets": ×3 wider than ×1 and repeatable across passes and from a fresh start; stable while hot; pull split by lane counts; the old per-plate pull reproduced flying apart. |

### Test fixture

Reused `vault/tests/graph3d/`: `Sailing Basics.md` (links, `related`, a tag), `Anchor Balance.md`, `Anchor Radial.md`. No fixture was written. Reload Obsidian (Ctrl+R) to load the new build.

### Manual test

1. **Planets, the reported case.** Open `Sailing Basics.md` in a 3D graph at depth 2–3. Set Overlays → Layout: Planets, and Node spacing to ×1.15. Drag Note spacing ×3 → ×1 → ×3 → ×1 → ×3, letting it settle each time. Each ×3 should look the same, clearly wider than ×1, and no tighter on the second pass. Planets shouldn't swing or jitter while you drag.
2. **First load.** Leave Note spacing at ×3, close the graph and reopen it (or reload Obsidian). It should look like the ×3 you got by dragging, without a Depth round trip. The middle shouldn't be a tangle of overlapping planets.
3. **Depth round trip.** Depth 0 then back up should land on about the same layout as before.
4. **Organic and Flat slices**, at Node spacing ×1.15. Note spacing ×1 should show separate notes, not notes melted into one another. ×3 should spread them, and ×0.5 should draw them in without merging. Repeat ×1 ↔ ×3: the layouts should repeat.
5. Hierarchy ⟷ organic, Links pull, and the edge toggles still re-settle as before. Planets lanes still pull: linked planets sit near each other.

### Not verified

- I can't see Obsidian. The cause and the fix were found and checked in an offline replay of the scene's force setup on synthetic planets, not on the Sailing notes. If ×3 on the real map is stable but still feels too timid, see the surface-to-surface lane idea above.
- In Organic, a re-settle from a spread layout and one from fresh seeds can still differ by about 10% (ordinary force-layout local minima).
