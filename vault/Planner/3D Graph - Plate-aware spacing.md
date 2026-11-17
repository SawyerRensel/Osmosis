---
title: 3D Graph - Plate-aware spacing
summary: Space the 3D graph's layout for plates, not points. Link lengths grow with the plates at each end, so sibling plates around a parent stop piling up.
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Plates for every node]]"
  - "[[3D Graph - Focus dimming]]"
status: Done
priority:
progress:
date_created: "2026-10-31T11:19:43.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-10-31T12:00:00.000Z"
date_start_actual: "2026-10-31T12:00:00.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

Part of [[Develop Mind-Map Graph View]]. Make the force layout leave room for plates.

### Why the plates crowd today

**Node size doesn't affect the layout at all.** There is no collision force. Spacing comes only from:
- the many-body charge (`CHARGE = -30`, wrapped by `settle.ts`);
- link distances by edge kind (`edgeDistance()` in `src/graph3d/appearance.ts`: hierarchy 18, embed 45, tag and attachment 50, link and property 80).

A line plate is 5 world units tall (`LINE_PLATE_HEIGHT`) and up to about 50 wide. A note title is 10 tall (`CORE_PLATE_HEIGHT`). So a heading with dozens of lines 18 units away is a pile of overlapping plates (Sawyer's close-up screenshot, 2026-10-31). Spheres were small enough that this never showed.

### Design (start cheap, measure, escalate only if needed)

1. **Plate-sized link lengths:** `distance = edgeDistance(kind) + halfExtent(source) + halfExtent(target)`. A plate's half extent comes from its measured width and height. Plate layout from [[3D Graph - Plates for every node]] knows the plate size synchronously. Until then, estimate it from the text length. This adds almost nothing per tick.
2. **Only if (1) isn't enough:** a collision force (`forceCollide` from d3-force-3d) with each plate's bounding radius. It adds a calculation for every node on every tick. That is the part of the slow first load we suspect but haven't measured (first load ran at ~3 fps for 5–10 s on the stress web, with tick + render only ~36 ms of a 422 ms frame). **Time the simulation step before and after**, and don't add it unless the numbers allow.

- Pure logic (link distance from kind and plate extents) goes in `src/graph3d/appearance.ts` or `settle.ts`, test-first.
- Settled nodes are pinned (Phase 3), so the new spacing applies to areas loaded after the change. Each session settles afresh, so reopening the view shows it everywhere.

### Open question

Should siblings also spread apart, not just away from their parent? Link length pushes children outward, and the charge spreads them over a larger sphere. Check whether that's enough before reaching for collision.

## What problem does this solve?

Plates appear packed together compared with the spheres they replaced, which hurts readability as much as the depth cues do.

## What's your current workaround?

None. Zoom in further, which doesn't separate overlapping plates.

## Test plan

- **Unit:** link distance grows with each end's extent, and the kind's base distance is preserved.
- **Measure:** simulation step time and first-load time on the stress web, before and after.
- **Manual (Sawyer):** the busy node from the close-up screenshot has readable, mostly non-overlapping sibling plates. Walking several hops still never rearranges settled nodes.

## Conventions

- lint → test → build → manual-test instructions → stop for Sawyer before committing.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Built on `feature/3d-graph-plate-spacing`, stacked on `feature/3d-graph-plates` (which is itself not yet manually tested), commit `131434a`. Not pushed, no PR. Lint, unit tests (2075) and build pass. Nothing has been seen running in Obsidian.

### Approach

Step 1 of the design only: plate-sized link lengths. `linkDistance(kind, sourceExtent, targetExtent) = edgeDistance(kind) + sourceExtent + targetExtent`, with `plateExtent(plate) = hypot(width, height) / 2`. The scene passes it to d3's link force through `plateLinkDistance`, which reads `EngineNode.shape` at both ends. Plates are measured synchronously when a node enters the scene (`Graph3DPlates.shape()`), so no text-length estimate was needed.

Rough sizes, from `CORE_PLATE_HEIGHT` 10 and `LINE_PLATE_HEIGHT` 5 (1.75 em plate, so 1 em ≈ 2.9 units on a line plate, ≈ 5.7 on a note plate): a short line plate ("Fenders out") reaches about 10 units, a full 20 em line plate about 30, a note title capped at 30 em up to about 90. So a heading → line link that was 18 is now roughly 40–80, and a long note title pushes its headings out by up to ~90 more.

### Decisions worth remembering

- **Extent is half the diagonal, not half the width.** Plates face the camera and a link can leave in any direction, so the diagonal is the only radius that clears the plate from every angle. It overstates the vertical case (a 50 × 5 plate reaches 25 even straight up). If siblings now look too far apart, a softer extent (for example the plate's half width times ~0.7) is the knob; the base distances in `edgeDistance()` were left unchanged on purpose, so the kind's distance is now an edge-to-edge gap.
- **No collision force.** The open question (do siblings spread apart, not just outward?) is answered by geometry: n siblings at radius r share a sphere of area 4πr², so going from r = 18 to r ≈ 60 gives each about 11× the room, and the charge spreads them over it. Collision would add a per-node calculation every tick, which this batch couldn't time (no Obsidian here). It stays step 2, only if Sawyer still sees piles after this and the perf readout says the tick can afford it.
- **Per-tick cost is zero.** d3 computes each link's distance once, when the link force is initialised (every `graphData()` call, i.e. each `setData`). `setTheme` re-applies the distance function, because a theme change re-measures every plate without new graph data. That only affects nodes still free; pinned ones stay where they settled.
- **Charge, seeding and `settle.ts` were not touched.** New lines still seed 10 units from their parent (`SEED_SPREAD`) and expand to the longer rest length. If arrivals look explosive, `SEED_SPREAD` could follow the link distance; not done without seeing it.
- **Camera fly distances (160 for a note, 70 for a line) were not changed**, though clusters are now larger. Worth a look during manual testing.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/appearance.ts` | New `plateExtent` and `linkDistance` |
| `src/graph3d/appearance.test.ts` | 4 new tests: extent is the half-diagonal, base distance kept for point ends, each end's extent added, grows with either end |
| `src/views/Graph3DScene.ts` | Link force uses `plateLinkDistance`; stored as `linkForce` and re-applied in `setTheme` |
| `e2e/fixtures/graph3d/Deck Checklist.md` → `vault/tests/graph3d/` | New fixture |

### Fixture

`vault/tests/graph3d/Deck Checklist.md`: one heading ("Before casting off") with 24 sibling lines of mixed length, and links to `[[Knots]]` and `[[Rigging]]`. It is a new file, so no existing fixture was rewritten.

### Not verified (needs Sawyer)

- Everything visual: whether the busy heading's siblings are readable and mostly non-overlapping, and whether the whole graph now feels too spread out (note titles add the most).
- No measurements: simulation step time and first-load time on the stress web before/after. Expected unchanged per tick, since only rest lengths changed; settling may take a few more ticks because nodes travel farther from their seed.
- Walking hops never rearranging settled nodes: unchanged code path (pinning), but not seen.
