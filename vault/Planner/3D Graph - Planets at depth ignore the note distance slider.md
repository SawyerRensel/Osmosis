---
title: 3D Graph - Planets at depth ignore the note distance slider
summary: In the Planets layout at Depth > 0 the neighbouring notes' planets sit almost touching, and the Note spacing slider barely moves them apart; keep every pair of planets their radii plus a clear, slider-scaled gap apart.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
  - "[[3D Graph - Spacing sliders]]"
  - "[[3D Graph - Note spacing applies late and shrinks]]"
  - "[[3D Graph - Planets continent frames]]"
  - "[[3D Graph - Planets plates face up]]"
status: Done
priority:
progress:
date_created: 2026-11-12T05:35:00
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: 2026-11-12T05:35:00
date_start_actual: 2026-11-12T05:35:00
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
| Platform         | Obsidian, 3D graph view |
| Operating System |       |

## What happened?

Sawyer's report (2026-11-12):

> "When Planet layout is selected and Depth > 0, the additional planets aren't respecting the note distance slider. They're spaced way too close by default, touching each other."

## What should have happened?

Every planet stands clear of the planets it links to: its centre is at least the sum of the two radii plus a gap away, the gap clearly visible at the default slider value, and the Note spacing slider (Overlays → Forces) visibly spreads or tightens all planets at any depth.

## Where is this file located?

Any note with links, e.g. `vault/tests/graph3d/Hint Harbour.md` (13 linked notes) or `vault/tests/graph3d/Anchor Balance.md`.

## Steps to Reproduce

### 1. Start from

Open a note with links in the 3D graph.

### 2. Prep/settings

Overlays → Forces → Layout: Planets. Depth 1 or 2.

### 3. Do this

Look at the neighbouring planets; drag Note spacing.

### 4. Trigger

The planets sit touching, and the slider barely changes that.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `ca06e59` on `fix/round-8-feedback`. Unit tests only; not seen in Obsidian.

### The cause

The planets force (`PlanetWorld.step` in `src/graph3d/planets.ts`) already applied the Note spacing slider to every planet, at any depth: planets closer than `rA + rB + PLANET_GAP × note` push apart. But `PLANET_GAP` was **20 world units**. The lanes between linked notes pull the planets together until that collision holds them, so linked planets always settled exactly 20 units apart, surface to surface. A planet's radius is commonly in the hundreds, so 20 units read as touching. The slider (×0.5–×3) only moved the gap between 10 and 60 units, which barely shows next to the spheres. A d3-style settle with four planets measured gaps of 9 / 19 / ~85 units at ×0.5 / ×1 / ×3 before the fix. Depth 0 shows a single planet, which is why the bug only showed at depth > 0. The slider wasn't limited to depth 0, and no per-node `linkDistance` override was involved.

### The fix

- New pure rule in `planets.ts`: `planetGap(ra, rb, note) = note × (PLANET_GAP + PLANET_GAP_SHARE × (ra + rb))` and `planetClearance(ra, rb, note) = ra + rb + planetGap(...)`.
- `PLANET_GAP` is now 80, the same as `edgeDistance("link")`, which is the gap between linked notes in the other layouts. `PLANET_GAP_SHARE` is 0.25.
- `step` (the planet-to-planet push), `collisions` (which unpins cores when a grown planet now overlaps another) and the star push (a star is held half a gap off the surface) all use the new rule.
- After the fix, the same settle measures gaps of about 64 / 128 / 388 at ×0.5 / ×1 / ×3 between radius-100 planets. The intended gaps are 65 / 130 / 390.

### Decisions worth remembering

- **The gap grows with the planets' radii.** A fixed gap that is clear between small planets still looks like touching between two large ones. The share term keeps the look in proportion.
- **The whole gap is multiplied by the slider**, so ×3 gives three times the clear space between every pair, not just a fixed addition.
- **The collision force stays soft** (it is a velocity nudge, as before). The lanes' pull leaves a sliver under the clearance, about 1–2%. The settle test allows 3%. A hard positional projection would need the velocity decay inside `step` and could disturb the swing fix from [[3D Graph - Note spacing applies late and shrinks]], so I didn't add one.
- Nothing is hidden or decluttered. Settled planets still never move: a depth change only pushes the newly arrived (free) planets. A slider drag re-settles all of them, as before (the approved exception).
- Stars (tags, files, ghosts) are now held further off planets too, at half a gap. That gap is larger than before because it also scales with the planet's radius.

### Surface map

| File | Change |
| --- | --- |
| `src/graph3d/planets.ts` | `PLANET_GAP` 20 → 80, new `PLANET_GAP_SHARE`, `planetGap`, `planetClearance`. `step` and `collisions` use them |
| `src/graph3d/planets.test.ts` | The gap test now checks against `planetGap`. New `planet clearance` block: the rule for different radii, the slider scaling, a ×1 floor, and a settle of four different-size planets pulled together by lanes (every pair ≥ clearance, and every pair spreads with the slider) |

### Fixture

None new. `vault/tests/graph3d/Hint Harbour.md` links to 13 notes (depth 1). `Anchor Balance.md` → `Sailing Basics.md` → its neighbours (depth 2).

### Not verified (no Obsidian here)

- How the new gap looks live, and whether 80 + 25% of the radii is the right amount. Both constants are one-line changes in `planets.ts`.
- Real planets are not perfectly at the clearance after a settle, because the collision is soft (see above).
