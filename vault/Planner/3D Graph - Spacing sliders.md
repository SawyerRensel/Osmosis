---
title: 3D Graph - Spacing sliders
summary: "Two Overlays → Forces sliders, Note spacing and Node spacing (×0.5 to ×3, ×1 is today), that scale the 3D graph's distances in all three layouts while Hierarchy ⟷ organic keeps setting the shape."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
  - "[[3D Graph - Flatten branches]]"
  - "[[3D Graph - Plate-aware spacing]]"
status: Done
priority:
progress:
date_created: "2026-11-10T03:10:25.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-10T03:10:25.000Z"
date_start_actual: "2026-11-10T03:10:25.000Z"
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

# Feature Request

## What do you need built?

Two sliders in Overlays → **Forces**, next to Hierarchy ⟷ organic. Settled with Sawyer (2026-11-09); not to be re-decided.

- Hierarchy ⟷ organic is **kept unchanged**: it sets the *shape* (the balance of forces). The new sliders set the *scale*.
- **Note spacing**: the distance between notes and tags.
- **Node spacing**: the distance between nodes within a note.
- **Range** ×0.5 to ×3. **×1 is exactly today's spacing**; a user who never touches the sliders sees no change. The value shows in the description, as the other sliders do.
- **Storage:** per vault, with the other overlay settings (`src/graph3d/overlays.ts`, normalised like the rest). Not per device.
- **Live re-settle:** dragging either slider re-settles the loaded nodes as you drag (`Graph3DScene.reshape` from `setOverlays`), as Hierarchy ⟷ organic does. In Planets mode the planets re-lay out instead (`world.clear()` + `reshape()`). This is a newly approved exception to "settled nodes never move" (the fifth, after the force slider, the flatten slider, the edge toggles and structural edits).
- **All three layouts:**
  - Organic: Note spacing scales between-note rest lengths (link, embed, property, tag, attachment edges) plus what keeps note clusters apart (charge). Node spacing scales the hierarchy rest length and within-note spacing.
  - Flat slices: Note spacing scales the between-note forces. Node spacing scales the gaps between plates in a slice.
  - Planets: Note spacing scales the gap between planet surfaces and the distances to tags and stars. Node spacing scales the gap between plates on a continent, so the radius grows with it. The panel-aware footprint (`flatSize`) stays.
- **Scale the gap, not the plate:** plates and panels never change size.

## What problem does this solve?

The layout's distances are fixed. A dense vault wants looser notes, a sparse one tighter, and nothing but the shape slider is there to move them.

## What's your current workaround?

None.

## Reference Attachments/Screenshots

Fixture: `vault/tests/graph3d/` (the Sailing notes and the Anchor notes).

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code in b661119 on `feature/3d-graph-spacing-sliders` (cut from `fix/3d-graph-planets-panel-spacing`, 94cea9e).

### What each slider scales

`Spacing = { note, node }` (`appearance.ts`, `UNIT_SPACING` is ×1/×1). Both are multiples of today's distances, so at x1 every expression is multiplied by exactly 1 and nothing changes.

| Layout | Note spacing | Node spacing |
|---|---|---|
| Organic | Rest length of link, embed, property, tag and attachment edges (`linkDistance` scales `edgeDistance(kind)`, not the plate extents). Many-body charge of pathless nodes (tags, files, ghosts), and the push that keeps note clusters apart (`spaceCharges`, below). | Hierarchy rest length (`edgeDistance("hierarchy")` 18, also the seed distance in `seedClear`), and the charge of a note's own lines. |
| Flat slices | The same link lengths and cluster push; it is the notes' cores that push other notes (`notePush`). | The 2D layout's gaps inside a slice: `FLAT_COLUMN_GAP` (parent to child, 18) and `FLAT_ROW_GAP` (siblings, 1.5) in `FlatLayouts`. The cache is cut afresh when the value changes. Also the hierarchy rest length of free ramp lines. |
| Planets | `PLANET_GAP` (20) between planet surfaces, in the collision (`PlanetWorld.step`) and in `collisions`; half of it clears stars out of a planet; the tag/link/embed rest lengths; charge of cores and stars. | `COLUMN_GAP` and `ROW_GAP` of each continent's map (2D maps and radial), so the radius grows through `planetRadius`'s area and reach. `CONTINENT_MARGIN` (clear space round a continent) is not scaled. |

Plates and panels never change size: only gaps scale. Planets still size lines with `flatSize` (plate or near-tier panel, whichever is larger).

### Decisions worth remembering

- **Charge.** d3's many-body strength sets a distance by its square root, so a strength is multiplied by the square of the spacing it should scale. One strength per node cannot serve both "within a note" and "between notes", so `spaceCharges` (`settle.ts`) scales a note's lines by Node spacing squared (keeping the note's shape in step with its hierarchy rest length), tags and other pathless nodes by Note spacing squared, and returns the difference (Note squared minus Node squared, times the note's strength) as an extra push from the note as a whole, added to each core's share in `notePush`. Net push between two notes is then Note spacing squared of today's, whatever Node spacing is. A looser note spacing than node spacing is a repulsion, a tighter one a partial attraction that cancels some of the lines' repulsion. In Planets only cores and stars are charged, all by Note spacing squared.
- **No collision force exists in Organic or Flat**, so there is none to scale; separation there is rest lengths plus charge.
- **Planets re-lay out via `world.clear()` + `reshape()`**, as the spec says, even for Note spacing alone, which only changes runtime gaps: it keeps the two sliders on one path. `PlanetWorld.spacing` is set in `setOverlays` before the layout, and the planet key includes Node spacing, so a changed value is a changed layout.
- **Slider UI**: linear, step 0.05, `setInstant(true)`, description `×1.00. The distance between ...`. They sit directly under Hierarchy ⟷ organic, which is untouched.
- **Fifth approved re-settle exception** to "settled nodes never move" (Sawyer, 2026-11-09): dragging either slider re-settles the loaded nodes; Planets lay out afresh. Recorded in the `reshape` doc comment (the list now says five).
- **Stored per vault** in `graph3dOverlays` (`noteSpacing`, `nodeSpacing`), normalised and clamped to ×0.5 to ×3 by `normalizeOverlays`; a non-number takes x1.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/appearance.ts` | `Spacing`, `UNIT_SPACING`; `linkDistance` takes a spacing (default x1). |
| `src/graph3d/overlays.ts` | `noteSpacing`, `nodeSpacing`, `SPACING_MIN/MAX`, normalisation, `spacingOf`, `spacingChanged`. |
| `src/graph3d/settle.ts` | `spaceCharges`. |
| `src/graph3d/flatten.ts` | `FlatLayouts.branches` takes `nodeSpacing`; scales the column and row gaps. |
| `src/graph3d/planets.ts` | `continentMap` / `layoutPlanet` take `nodeSpacing`; `PlanetWorld.spacing` scales the planet and star gaps; planet key includes it. |
| `src/views/Graph3DScene.ts` | `linkDistanceOf`, `setOverlays` re-settle on spacing, `pushData` scales charge and passes node spacing to flat layouts, `seedClear` uses it. |
| `src/views/Graph3DOverlays.ts` | The two sliders and their label. |
| `*.test.ts` (appearance, overlays, settle, flatten, planets) | Normalisation and clamping; x1 identical to today (link distance, flat slice gaps, continent gaps, planet gap, radius); monotonic growth with each slider. |

### Test fixture

`vault/tests/graph3d/` (reused): Sailing notes (`Sailing Basics.md`, `Rigging.md`, `Navigation.md`, `Passage Plan.md`) and `Anchor Balance.md` / `Anchor Radial.md`. No fixture was written, so Obsidian does not need a reload for fixture reasons; reload (Ctrl+R) to load the new build.

### Manual test

Open `Sailing Basics.md` in a 3D graph with depth 2 or 3, open Overlays and scroll to Forces. The new sliders sit under Hierarchy ⟷ organic.

- **Organic** (Layout: Organic): drag Note spacing to x3, then x0.5. Linked notes and tags move apart / together as you drag; the lines inside each note keep their spacing. Drag Node spacing: the lines inside each note spread / tighten, notes stay put in relation. At ×1/×1 the graph looks as before.
- **Flat slices** (Layout: Flat slices, Flatten about 0.75): Node spacing at x3 opens the gaps between plates in each slice (columns and rows) while plates stay the same size; at x0.5 they sit nearly shoulder to shoulder. Note spacing moves the notes apart.
- **Planets** (Layout: Planets, open `Anchor Balance.md` and `Anchor Radial.md`): Node spacing at x3 grows each planet and spaces the plates on every continent; plates stay the same size. Note spacing at x3 widens the gap between planet surfaces and moves tags (stars) out; at x0.5 planets nearly touch. Near-tier panels still keep their room.
- Close and reopen Obsidian: both sliders keep their positions (stored per vault). Hierarchy ⟷ organic still works as before.

### Not verified

- I cannot see Obsidian, so none of the visual feel is checked: especially whether the charge split (above) looks right at extreme and mismatched settings (for example Note x3, Node x0.5), and whether x0.5 packs notes tight enough to overlap plates (no collision force protects them in Organic or Flat).
- Planets' Note spacing at x0.5 puts the gap at 10; links between planets are held only by the rest lengths, not tested on a large web.
