---
title: "3D Graph - Planet core layers"
summary: "Round 11 (T85). Planets layout: a Core layers slider sets N concentric shells evenly spaced between the core and the surface; plates sit on the shell of their outline depth (deeper clamped to the surface)."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
  - "[[3D Graph - Planet core layer shells drawn]]"
status: Done
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-15T22:20:27.000Z"
date_start_actual: "2026-11-15T22:20:27.000Z"
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

# 3D Graph - Planet core layers (T85)

## Request (Sawyer, 2026-11-15)
> What if we had planet core layers? A slider that controlled the number of layers/headings of concentric spheres evenly spaced along the radius of the planet?

## Spec (grilled with Sawyer, 2026-11-15)
- **Slider "Core layers"** in the **Planets** section of Overlays, next to Continent spacing / Direction / Balance (`src/graph3d/overlays.ts`). Integer N; **1 = today's single surface** (default, so nothing changes until moved). Pick a sensible max (e.g. 6) and record it.
- **Shells evenly spaced along the radius** between core and surface: shell k of N at radius `R·k/N` (k = 1…N, shell N = today's surface), or another even spacing that keeps the innermost shell clear of the core — record the call.
- **Placement: outline depth, clamped.** Depth 1 (continents, the root's children) on shell 1 (innermost), depth 2 on shell 2, … depth ≥ N on the surface. Works for heading-less notes.
- **Orbit/direction preserved:** each plate keeps the direction from the planet centre it gets today (its spot in its continent's 2D map); only its radius changes. (Orchestrator's reading of "concentric spheres"; record if this breaks spacing — inner shells have less area, so check plate overlap on inner shells and scale per-shell spacing if needed, staying panel-aware via `flatSize`.)
- **Live re-settle while dragging the slider**: plates glide to their new shells. This is a **new approved re-settle exception** (Sawyer, 2026-11-15) — add it to the list in memory-facing notes; settled nodes otherwise never move.
- **Drawing the shells and fading outer shells is T86**, not this ticket. This ticket is layout + slider + live re-settle only. Branches/edges must still connect correctly between shells.

## Where the code is
`src/graph3d/planets.ts` (core at centre, continents on the surface: `radius`, `places`, `centres` ~450–490), `overlays.ts` (Planets options; `continentSpacing`; change-detection helpers ~136–146 decide re-settle vs fresh layout), `globe.ts` (grab/drag assumes the surface — grabbing must still work; note if inner-shell plates are hard to reach, T86 handles visibility).

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Done when
Slider exists in Planets section; N=1 is pixel-identical to today; N>1 places plates by depth on even shells; live re-settle; unit tests for the shell radius/placement pure function.

## Context budget
~130k. `planets.ts` and `overlays.ts` whole; settings UI for Planets section and re-settle path in `Graph3DView.ts`/`Graph3DScene.ts` by grep (`continentSpacing`).

## Test plan (Sawyer)
Planets layout on a multi-level note: Core layers 1 = as before. Drag to 3, 4: plates glide inward by depth, continents innermost, leaves on the surface. Grab-rotate still works. Phone too.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit: `287279c` on `feature/planet-core-layers`.

### Approach
The planet is laid out exactly as before (continent maps, spread, radius, centres, wrap onto the surface). Then, with more than one layer, each plate is moved straight in towards the centre onto the shell of its outline depth: `offset = normal · growth · shellRadius(...)`. Its direction from the centre, its `normal`, `right` and `up` are untouched, so continents keep their 2D-map shape as seen from outside and the hover pose, far-side dimming and upright spin keep working. The layer count is part of `planetKey`, so a slider change re-lays out each planet through the normal `PlanetWorld.update` path: continent centres are seeded from the previous layout (unchanged), and plates ease to their shells over `RELAYOUT_MS` from wherever they are mid-ease. That is the live re-settle.

### Decisions worth remembering
- **Shell radius formula:** `shellRadius(R, core, depth, N) = core + (R − core)·k/N`, `k = clamp(depth, 1, N)`, where `core = coreClearance(rootWidth, R) = min(R, rootWidth/2 + CONTINENT_MARGIN)`, the clearance `planetRadius` already keeps round the root plate. So shells are evenly spaced between the root plate's clearance and the surface, not `R·k/N`: at N = 6 `R/6` could sit inside the root plate. Shell N is the surface; N = 1 puts everything on the surface.
- **Max 6 layers** (`MAX_CORE_LAYERS`), integer slider, default 1. Stored with the other overlays (`coreLayers`, rounded and clamped by `normalizeOverlays`).
- **Depth** is the plate's level in its `PlanetTree` (`branchDepths`): a continent head (the root's child) is 1. Heading-less notes count list nesting the same way. An embedded note's lines continue counting from the embedding line, since they hang inline on the host's planet.
- **Inner-shell overlap: the whole planet grows.** On a shell of radius r, neighbours are r/R as far apart as on the surface, so siblings on inner shells collide. `shellGrowth` finds the smallest uniform factor (applied to every shell *and* the surface, so the shells stay evenly spaced) at which no two plates sharing an inner shell overlap, using the same test as `spreadContinent` (both axes of the first plate's frame plus `ROW_GAP·nodeSpacing/2` clearance, and pairs farther apart than their diagonal never count). No pair is asked for more room than it has on the surface, so the surface shell never grows anything and N = 1 is never grown. Consequence Sawyer may notice: at high N a planet can get noticeably bigger (up to about R/r₁) and its surface continents spread out by the same factor; a grown planet wakes the space forces only if it now overlaps a neighbour (the existing `collisions` path). The alternative, keeping the surface fixed and pushing crowded shells outward, breaks even spacing and lets shells bunch onto the surface. Sizes come from `flatSize` (panel-aware), as before. The check is O(n²) per inner shell, but inner shells hold only shallow depths; the surface (all deeper lines) is never checked.
- **Re-settle path:** `coreLayersChanged` (Planets only) → `setOverlays` sets `world.coreLayers` and calls `pushData()` (not `reshape`, not `world.clear()`), like an edit's planet re-layout. Nothing outside Planets moves. **New approved re-settle exception (Sawyer, 2026-11-15): dragging Core layers moves plates live.** Add to the memory list.
- **Boundary patches:** `surfaceOf` now reports each plate's own shell radius (the length of its offset). A boundary group is draped as a patch only when all its plates share one planet *and* one shell; a group spanning shells falls back to a hull. At N = 1 this is the old behaviour (offset length = surface radius, to float precision).
- **Grab (globe.ts) is unchanged:** it grabs the planet's outer sphere (`world.radius`, the surface). Inner-shell plates are still clickable through `nodeNear` (screen-space), but they sit under the outer shell's plates; T86 handles visibility.
- Edges: hierarchy/embed arcs (`surfaceArc`) already ease the distance from the centre between their two ends, so branches run correctly from shell to shell.

### Facts for T86 (shell drawing + fade)
- Shell radii: `shellRadius(radius, core, depth, layers)` in `src/graph3d/planets.ts`, with `core = coreClearance(rootWidth, surfaceRadius)`. Note that `PlanetLayout.radius` is already the *grown* surface; the shells of a laid-out planet are `growth·shellRadius(surface, core, k, N)` for k = 1…N, i.e. evenly spaced from `layout.radius·core/surface` to `layout.radius`. Easiest for T86: store the shell radii (or `core` and `growth`) on `PlanetLayout` when drawing; today only `radius`, `places` and `centres` are kept.
- Planet centres: the core node's live position (`this.live.get(coreId)` in `Graph3DScene`, see `coreOf` / `sphereUnder`); radii via `PlanetWorld.radius(core)`; cores via `PlanetWorld.cores()`; a plate's shell radius = `|world.place(id).offset|`.
- Slider flow: `Graph3DOverlays.ts` case `"coreLayers"` (instant slider, 1…`MAX_CORE_LAYERS`) → `this.change({ coreLayers })` → saved overlays → `Graph3DScene.setOverlays` → `world.coreLayers` + `pushData()` → `updatePlanets` → `PlanetWorld.update` (key includes layers) → eased `placeAll` in `tick`.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/planets.ts` | `MAX_CORE_LAYERS`, `coreClearance`, `shellRadius`, `shellGrowth`, `branchDepths`; `layoutPlanet(…, layers)` moves plates onto shells and grows the planet if needed; `PlanetWorld.coreLayers`, in `planetKey` |
| `src/graph3d/overlays.ts` | `coreLayers` overlay (default 1, normalized), `coreLayersChanged` |
| `src/graph3d/settings-sections.ts` | Core layers in Layout & spacing after Continent balance, shown in Planets only |
| `src/views/Graph3DOverlays.ts` | Core layers slider (1–6, instant) and its description |
| `src/views/Graph3DScene.ts` | `setOverlays` passes the layers and re-lays out planets live; `surfaceOf` reports the plate's shell radius |
| `src/views/Graph3DBoundaries.ts` | Patch only when a group's plates share one shell, else hull |
| `src/graph3d/planets.test.ts`, `overlays.test.ts` | Shell radius, depth, N = 1 identity, direction kept, growth, eased world re-layout; normalize and change detection |

### Fixture
None new: `vault/tests/graph3d/Tapered Branches.md` (sole H1 root, three H2 continents, lists up to four levels deep). `Galley Handbook.md` for a bigger planet.

### Manual test (Sawyer)
Desktop:
1. Open `tests/graph3d/Tapered Branches.md` in the 3D graph, depth 0. Settings → Layout & spacing → Layout: Planets. A **Core layers** slider appears under Continent balance at 1. The planet looks exactly as before.
2. Drag Core layers to 3, then 4, then 6, slowly. Plates glide inward as you drag: the H2s (Standing rigging, Running rigging, Deck hardware) innermost, their bullets on the next shell, deeper bullets further out, the deepest on the surface. Each plate stays above the same spot it had on the surface (same direction from the centre); hierarchy edges run between shells. The planet may grow a little at high values; no two plates on one shell should overlap.
3. Drag back to 1: everything returns to the surface, same as step 1.
4. At 4, grab-rotate the planet (drag on it): it still turns. Click an inner plate you can see between surface plates: it selects/hovers as usual.
5. Switch Layout to Flat slices and back: the slider is hidden in Flat, and Planets comes back with the saved layer count. Reload Obsidian: the value persists.
6. Try `Galley Handbook.md` at 6 for a larger planet; watch for any sluggishness while dragging.
Phone: steps 1–4 in the settings sidebar; the slider should step through 1–6 with a finger drag, plates gliding; one-finger planet grab still turns it.

### Could not verify
Anything visual: I cannot see Obsidian. Not measured: drag smoothness on very large planets (each slider step re-lays out every planet, as Continent spacing already does). Inner shells are hidden behind surface plates until T86 adds fading.
