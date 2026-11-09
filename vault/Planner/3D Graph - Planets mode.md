---
title: 3D Graph - Planets mode
summary: "A third Overlays Layout, Planets: each note is a planet with its root plate at the core and every other line on the surface, continents laid out as 2D maps, plates tangent with world up, edges as stalks, surface arcs, tunnels and lanes, and a hover camera."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Flatten branches]]"
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[3D Graph - One H1 is the note's root]]"
  - "[[3D Graph - Re-settle after structural edits]]"
  - "[[3D Graph - Follow a link]]"
  - "[[3D Graph Phase 4 - Near tier]]"
  - "[[3D Graph - Plates for every node]]"
  - "[[3D Graph - Arrow-key navigation]]"
status: In-Review
priority:
progress:
date_created: "2026-11-09T17:43:33.000Z"
date_modified: "2026-11-09T20:15:00.000Z"
date_start_scheduled: "2026-11-09T17:43:33.000Z"
date_start_actual: "2026-11-09T17:43:33.000Z"
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

## What do you need built?

A third layout mode for the 3D graph where **each note is a planet**. You read a note from outside its surface, never from inside a tangle. Settled with Sawyer in the round-4 grill (2026-11-09); the decisions below are not to be re-opened.

### Mode

- Overlays gets a **Layout** choice: Organic / Flat slices / Planets. The Flatten slider is hidden in Planets mode.

### A planet is one note

- The root plate (the H1 if the note has exactly one, otherwise the file-name plate, as in round 2's H1-root rule, [[3D Graph - One H1 is the note's root]]) floats at the planet's **core**. **Every other node lies on the surface.**
- There is no globe body. Plates lie **tangent** to the surface and are **front-face only**: invisible from behind, never turning to face the camera.
- Mist provides depth.
- The planet may look faceted (it is a collection of flat plates). That's fine.

### Continents

- The **continents** are the direct children of the root (the H2s under an H1 root; loose lines directly under the root become small continents too).
- Each continent is laid out like a 2D mind map: Direction left-right / top-down / **radial (new)**, plus Balance (one-side / both-sides / alternating).
- Global defaults live in Overlays; a note's own 2D map settings override them.
- Continents sit **anywhere**, like on a lacrosse ball with no special places. **Surface forces** keep them from colliding. Gaps are fine.

### Global up

- Every plate's text-up is world +y projected onto its tangent plane.
- **Plates and their content are never distorted.** Plates are rigid flat rectangles; only their positions wrap.
- Projected up is undefined at each planet's top and bottom (the hairy-ball theorem), so: **gentle cap avoidance**. Surface forces softly keep continents out of small top and bottom caps. A plate that still lands in a cap falls back to world −z for up.

### Size

- The surface area fits the plates at today's spacing, so the radius grows and shrinks as nodes are added or deleted.

### Edges

- **Stalks:** thin straight lines from the core to each continent's top node (the dandelion).
- Parent→child edges: short **surface arcs**.
- **Tunnels:** same-note wikilinks, drawn as dim straight chords through the interior.
- **Lanes:** links to other notes, drawn as bright arcs between planets.

### Space

- Planets are **rigid bodies placed by today's force sim**. Only the centres move: links attract, and radii collide.
- Internal layout is geometric, never per-node forces.
- **Embeds lie inline on the host's surface**; the host grows to fit.
- **Tags stay free-floating star plates**, as today.
- Frontmatter links (e.g. `related`) become normal planets when depth > 0, like body links.

### Settling

- Continents and planets settle once and freeze ("settled nodes never move").
- A structural edit re-lays out **only that planet**, with animation. This is B1's re-settle ([[3D Graph - Re-settle after structural edits]]) scoped to the planet.
- Space forces wake only if the radius change causes a collision.
- Mode or layout-option changes re-lay out everything.

### Editing

- Everything works (edit mode, add, move, indent, delete, Alt+drag link). The camera keeps tracking the edited node.

### Camera

- A plate click or arrow move glides to **hover above the plate on its outward normal**, looking straight down with the global up at the top of the screen.
- Orbit pivots on the planet's centre, so a drag turns the globe under you.
- Follow a link **rides the lane's arc** and lands in the hover view. No hyperspace FX in v1 (a possible later idea ticket).

## Phases

Each is testable alone (Opus/high for P1 and P3, Sonnet/high for P2).

- **P1** `feature/3d-graph-planets`: the Layout mode, rigid planets under space forces, continents with left-right / top-down layout and surface forces, cap avoidance, the radius rule, tangent front-only plates, global up, stalks/arcs/tunnels/lanes, hover camera, re-layout on edit. Perf budget on the stress web (`e2e/measure-graph3d-ticks.ts`, at most 3 runs): Planets must not make the space sim slower per tick than Organic.
- **P2** `feature/3d-graph-planets-continents`: the radial Direction, Balance, and per-note overrides from the note's 2D map settings (global defaults in Overlays).
- **P3** `feature/3d-graph-planets-panels`: near-tier live panels **tilted with their plate** (CSS3D, tangent, hidden when facing away). Measure the cost.

## What problem does this solve?

In Organic and Flat slices a note's lines tangle in 3D, and you read them from inside the tangle. On a planet every line faces outward, upright, so a note reads like a map from orbit, and the space between notes stays clear.

## What's your current workaround?

Flat slices (the flatten slider).

## Batch implementation notes (awaiting manual test)

P1 shipped on `feature/3d-graph-planets` in b30dfee (stacked on the round 3+4 work). P2 is on `feature/3d-graph-planets-continents` in 120b83b (see `### P2` at the end of these notes). P3 is not started.

### Approach

- **Pure geometry in `src/graph3d/planets.ts`** (unit-tested in `planets.test.ts`):
  - `planetTrees`: one planet per note root that no line embeds. Lines hang from their hierarchy parent, and an embedded note (or an embedded part's roots) hangs from the line that embeds it, so it lies inline on its host. Tags, files and ghosts are on no planet (stars).
  - `continentMap`: each continent is laid out by the 2D map's own `computeLayout`, over stand-in parse nodes keyed by graph ID, at plate sizes and the flat slices' gaps.
  - `planetRadius`: the radius rule. The continents' footprints cover `SURFACE_FILL` (40%) of the sphere. No continent spreads past `MAX_CONTINENT_ANGLE` (0.6π) from its centre, and the radius clears half the root plate.
  - `placeContinents` / `surfaceStep`: continents are seeded on a golden-angle spiral between the caps, the first facing the note's ring phase. Then 120 steps of surface repulsion run, plus a gentle push out of the `CAP_ANGLE` (0.35 rad) caps.
  - `wrapPoint`: an azimuthal equidistant wrap about each continent's centre.
  - `tangentFrame`: up is world +y projected onto the tangent plane, or world −z within `CAP_FALLBACK` (0.05 rad) of a pole. right = up × normal.
  - `surfaceArc`, `laneBow` / `laneArc` and `hoverPose`.
  - `PlanetWorld` holds the layouts between data updates. It re-lays out a planet only when its tree or plate sizes change. It eases the plates of a changed planet over `RELAYOUT_MS` (600 ms) and seeds its continents where they were. It reports which planets grew, and which of those now collide.
- **Space sim:** in Planets mode only planet cores and stars get many-body charge. Surface plates are always pinned to their core plus their offset. The last d3 force (`planets`) hands each surface plate's link pull to its core, pushes planets apart at radius + radius + `PLANET_GAP` (20), pushes free stars out of planets, and re-places the plates. Links inside one planet pull nothing.
- **Plates:** `Graph3DPlates` has new `aRight` / `aUp` instance attributes, written with the layout. A non-zero frame lays the quad and its glyphs along those axes, and `plateBack` collapses it when seen from behind. A zero frame is the old billboard. `nodeNear` skips back-facing planet plates.
- **Edges (`writeEdges`):**
  - Core to continent head: a straight stalk.
  - Hierarchy or embed edge inside a planet: a 6-segment surface arc.
  - Link inside one planet: a straight tunnel at 0.2 opacity.
  - Edge between two planets: a 12-segment lane at 0.8 opacity, bowed out of both planets by a quarter of its length.
  - Anything that touches a star: straight.
- **Camera:**
  - `hoverOver` turns a flight (plate click) or an arrow glide onto a surface plate into a glide to the hover pose (on the plate's normal, looking down). The camera keeps world +y as up, and looking down a normal that puts the plate's up at the top of the screen. A click flight hovers at the usual stand-off distance; an arrow glide keeps the current distance.
  - The orbit pivot (`aimPoint`) is the picked plate's planet centre.
  - A lane ride adds the lane's bow, by how far along the target is, and lands in the hover pose.
- **Edits:** the new data's `pushData` re-lays out only the changed planet, eased. Only cores whose grown radius now overlaps another planet are unpinned (the sim reheats on `graphData`). `reshape(…, edit)` in Planets mode does no global unpin; it only tracks the edited line. `settled()` makes follows wait for the core to be pinned and the planet to finish easing, since surface plates are always pinned.
- **Mode changes:** switching Layout clears the planets and re-settles everything (`reshape`).

### Decisions worth remembering

- **Organic vs Flat slices.** The flatten slider is shown in Flat slices only, not just hidden in Planets. Organic means nothing flat; the slider's position is kept. `normalizeOverlays` migrates old data: a saved flatten of 0 becomes `organic`, anything else (and new installs) `flat`, so nobody's view changes. `effectiveFlatten()` is the flatten value the scene uses.
- **Near-tier panels are off in Planets mode** (`near.setEnabled(labels === "all" && layout !== "planets")`). A flat CSS2D panel over a tilted plate would cover it. P3 brings tilted panels.
- **Hover keeps world +y as the camera up.** No camera-roll code. In a cap the plates use −z for up but the camera can't look straight down the pole axis with +y up, so the hover there may be rolled or unstable. Not handled in P1.
- **Any change to a planet eases** (a structural edit, or a reworded line whose plate width changed). That's simpler than telling the two apart, and a rewording changes the plate size anyway.
- **Particles** still run straight from end to end, not along arcs.
- **The surface-force step count is fixed at 120**, and the work is O(k²) in continents. That's cheap at stress-web sizes (at most 53 continents).

### Perf (measured 2026-11-09)

- Stress web (`e2e/measure-graph3d-ticks.ts`, 30,824 nodes, 41 notes): **Organic mean 611 ms per tick** (median 603 ms, worst 807 ms) against **Planets mean 15.6 ms per tick over the same 120 ticks**. Planets mode only simulates 41 cores and the stars. The script now takes a `planets` argument and stops before the flat-slice shape checks: on planets, plates packed on each surface make its clash grid quadratic, and the first run never finished that stage.
- Layout (geometric, once per planet change): all 41 stress planets take 260 ms in total, the worst one 39 ms (2,087 lines, 53 continents). The unit micro-benchmark is about 11 ms for 300 lines in 20 continents.
- Organic mode pays almost nothing extra: two more instance attributes, written only on layout passes, and a no-op `planets` force.

### Surface map

| File | Change |
| --- | --- |
| `src/graph3d/planets.ts` | New: planet trees, continent maps, radius rule, surface forces, tangent frames, arcs and lanes, hover pose, `PlanetWorld` |
| `src/graph3d/planets.test.ts` | New: 22 tests |
| `src/graph3d/overlays.ts` (+test) | `layout: LayoutMode`, its migration, and `effectiveFlatten` |
| `src/views/Graph3DOverlays.ts` | Layout dropdown; flatten slider shown in Flat slices only |
| `src/views/Graph3DPlates.ts` | `frame` on `PlateSource`; `aRight` / `aUp` attributes; tangent, front-face-only quads |
| `src/views/Graph3DScene.ts` | `PlanetWorld` wiring: `planets` force, `updatePlanets`, charge, link strength, edges, `hoverOver`, `settled`, pivot, lane ride, edit re-layout, panels off |
| `e2e/measure-graph3d-ticks.ts` | `planets` argument |

### Fixture

None new. Use `vault/tests/graph3d/`: `Sailing Basics.md` (sole H1 root, links, `related` property, a tag) and `Galley Handbook.md` / `Navigation.md` (more continents, embeds).

### Manual test (Sawyer)

1. Open `tests/graph3d/Sailing Basics.md` in the 3D graph at depth 2. In Overlays → Forces, set Layout to Planets.
   - The flatten slider disappears.
   - Each note becomes a ball of plates around its title plate, with thin stalks from the title to each continent.
   - The `#seamanship` tag stays a free plate.
   - Links between notes are bright bowed lanes.
2. Orbit round a planet.
   - Plates are flat on the surface, text upright (world up).
   - Plates on the far side vanish (no mirrored text).
   - Nothing is stretched.
3. Click a plate on a surface. The camera glides to hover straight above it, text upright at the top of the screen. Press the arrow keys: each hop hovers over the next plate.
4. Drag to orbit. The globe turns about its centre.
5. Click a lane between two planets. The ride bows along the arc and lands hovering over the far plate.
6. Edit: add a line under a heading (Enter), indent one (Tab), delete one.
   - Only that planet re-lays out, easing over about half a second.
   - The camera stays on the edited line.
   - Neighbouring planets stay put unless the planet grew into one.
7. Switch Layout back to Flat slices, then Organic. Everything re-settles as before. Flat slices shows the slider, at its old position.

### Not verified (no Obsidian here)

- Anything visual: shader compile, the front-face test, glyph orientation, how arcs and lanes look, the hover pose in a cap, how planets settle in a live view.
- Edit and Alt+drag link in Planets mode, beyond the code paths reviewed.

### What remains for P1 polish / P2 / P3

- **P2 seam (done, see `### P2`):** `ContinentStyle` in `planets.ts` has only `direction`. Add `radial` (the 2D `computeLayout` has no radial direction yet), Balance (pass `balance` through `continentMap`, which hard-codes `"one-side"`) and per-note overrides. The scene passes `DEFAULT_CONTINENT_STYLE` in `Graph3DScene.updatePlanets`. A style change must call `world.clear()` and `reshape()`, as the Layout change does in `setOverlays`.
- **P3:** panels are suppressed in `setOverlays`. Each plate's frame is on `EngineNode.frame` (`normal`, `right`, `up`) for a CSS3D panel to copy.
- Not done: particles along arcs, and a camera roll for hovering in a cap.

### P2 (radial Direction, Balance, per-note overrides)

Shipped on `feature/3d-graph-planets-continents` (cut from `feature/3d-graph-planets`) in 120b83b. Unit tests only: nothing here has been seen in Obsidian.

#### What the 2D map already had

- **Balance** (`one-side` / `both-sides` / `alternating`) and a **side** (`right` / `left` / `down` / `up`) already exist in 2D's `computeLayout`, so continents reuse them unchanged: `continentMap` now passes `style.balance` and `style.side` through. `findBalancePivot` makes the continent's head the pivot when it has two or more children.
- **Radial** exists in 2D only as a name. `MapLayout = "classic" | "radial"` is a stored setting (`mapLayout`), but `computeLayout` ignores it and the properties sidebar offers only "Classic". So radial is new pure code in `src/graph3d/radial.ts`; 2D behaviour is untouched.

#### Where a note's own settings live, and what maps

They live in the note's frontmatter, in the `osmosis-styles:` block (`OsmosisStyleFrontmatter` in `src/styles.ts`; the 2D map and its properties sidebar read and write it). No new store. `noteMapSettings(frontmatter)` in `planets.ts` reads it through the existing `parseOsmosisStyleFrontmatter` + `buildMapSettingsFromFrontmatter`.

| 2D setting | On a planet |
| --- | --- |
| `direction` (`left-right` / `top-down`) | Continent direction |
| `mapLayout: radial` | Continent direction `radial`, and wins over `direction`. `mapLayout: classic` makes the note a tree even when the Overlays default is radial |
| `balance` | Continent balance (ignored by radial) |
| `layoutSide` | One-side's side, kept only when it suits the direction (left/right for left-right, up/down for top-down) |
| `horizontalSpacing`, `verticalSpacing`, `maxNodeWidth`, `topicShape`, branch line settings, theme, background, `collapseDepth` | No equivalent: a planet's plates are the graph's own, spaced at the flat slices' gaps. Ignored |
| Per-node `side` (in `styles:`) | Not mapped. Possible follow-up: it needs the per-line selector lookup the 2D map does (`buildNodeSidesMap`) |

#### Resolution and storage

- `resolveContinentStyle(defaults, noteSettings)`: the note's setting where it has one, else the Overlays default, field by field. The defaults carry no side.
- Global defaults are two new overlay settings, `continentDirection` (left-right / top-down / radial) and `continentBalance`, normalised in `normalizeOverlays` like the others. They sit in the Overlays menu under Layout and the flatten slider, shown only in Planets mode. The Balance dropdown is hidden while Direction is radial.
- A default change calls `world.clear()` then `reshape()`, as the Layout change does (`continentStyleChanged`, true only in Planets). It re-lays out every planet, including ones with their own settings, because it is simpler than diffing.
- A per-note change: `Graph3DScene` gets a `noteMapSettings(path)` option that the view answers from `metadataCache.getCache(path).frontmatter`. `updatePlanets` resolves each planet's style on every data push, and `planetKey` now includes the style, so a changed planet (and only that one) re-lays out, eased over `RELAYOUT_MS` like a structural edit. The view's existing `resolve` handler reloads the model after a note is edited (frontmatter included), which is what triggers the push. Not verified live: that Obsidian's `resolve` fires for a frontmatter-only edit.

#### The radial layout (`radialMap`)

- Head at (0, 0). Each line gets an angular wedge proportional to its weight (the larger of its own diagonal and the sum of its children's weights), the head's children sharing the full circle and every other line fanning its children over at most `MAX_FAN` (π) about its own direction, so a lone child's children don't curl behind it.
- Rings: a line sits at the middle of its wedge on the ring for its depth. A ring is one step out from the last by the largest plate extents along each line's own direction plus the column gap, then widened until every plate fits across its own wedge. No overlaps (tested on a lopsided tree).
- Angles run clockwise from the left seam, so a lone child lies to the right, like left-right.
- Plates stay rigid; only centres are placed, and the existing `wrapPoint` puts them on the sphere. The continent's `reach` and footprint come from the plates as before, so `planetRadius` sizes the planet from them.
- **Balance is ignored in radial**: the circle is always filled. The 2D Balance modes split a left-right tree into two sides, which has no meaning round a centre. The alternative (one-side as a half-circle fan) was not built.

#### Decisions worth remembering

- A radial continent's bounding box is larger than a left-right one's for the same lines (measured on a 9-line toy: reach 85 vs 98, footprint area about 4x). The radius rule uses the footprint, so radial planets come out bigger. That is honest for a round map, but may look airy; not tuned, because it cannot be judged without seeing it.
- Global-default changes are not animated (clear, then reshape); per-note changes are.

#### Surface map

| File | Change |
| --- | --- |
| `src/graph3d/radial.ts` (+ `radial.test.ts`, 8 tests) | New: the radial map |
| `src/graph3d/planets.ts` | `ContinentStyle` gains `balance` and `side`, `direction` gains `radial`; `resolveContinentStyle`, `noteMapSettings`, `treeMap` (split out of `continentMap`); `PlanetWorld.update` takes `styleOf(core)`; the planet key includes the style |
| `src/graph3d/planets.test.ts` | Balance modes, override resolution, frontmatter reading, per-planet re-layout |
| `src/graph3d/overlays.ts` (+test) | `continentDirection`, `continentBalance`, `continentStyleChanged` |
| `src/views/Graph3DOverlays.ts` | Continent direction and balance dropdowns, Planets only |
| `src/views/Graph3DScene.ts` | `noteMapSettings` option, per-planet `styleOf`, default change re-lays out |
| `src/views/Graph3DView.ts` | `noteMapSettings(path)` from the metadata cache |

#### Fixture

`vault/tests/graph3d/Anchor Radial.md` (own `mapLayout: radial`, links to Anchor Balance) and `Anchor Balance.md` (own `direction: left-right`, `balance: alternating`, links back and to `Sailing Basics.md`, which has no settings of its own). Masters in `e2e/fixtures/graph3d/`.

#### Manual test (Sawyer)

1. Open `tests/graph3d/Anchor Radial.md` in the 3D graph at depth 2, Layout Planets. Three planets: Anchor Radial's continents fan round their headings (radial), Anchor Balance's deal out left and right (alternating), Sailing Basics follows the defaults (left to right, one side).
2. Overlays, Planets only: "Continent direction" and "Continent balance" appear under Layout. Set Direction to Radial: Sailing Basics turns radial, the Balance dropdown hides, and the two Anchor notes do not change (their own settings win). Set it to Top down, Balance to Both sides: Sailing Basics changes; Anchor Radial stays radial.
3. Switch Layout to Flat slices or Organic: the two dropdowns disappear.
4. In Anchor Balance's properties, change `balance` to `both-sides` (or edit the frontmatter): only that planet re-lays out, eased; the others stay put.
5. Plates stay flat, upright and undistorted on every continent.

#### Not verified

Anything visual (how radial continents look on a sphere, planet sizes), the frontmatter-edit trigger, and the menu layout.

#### Facts for P3

- Panels are still off in Planets mode. Nothing P3 needs changed: each plate's frame is still `EngineNode.frame`. Radial continents change where plates lie but not their frames (up is still world +y projected), so tilted panels need no radial special case.
