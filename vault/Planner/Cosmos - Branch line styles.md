---
title: Cosmos - Branch line styles
summary: "T132. Cosmos hierarchy edges draw the mind map's branch line style (curved, straight, angular, rounded elbow), colour, thickness, pattern and taper, from the map defaults, the theme and each node."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Cosmos - Mind map theme as a colour mode]]"
  - "[[Cosmos - Every plate shape and dashed borders]]"
  - "[[Cosmos - Node text font size and weight]]"
status: Done
batch: 17
priority:
progress:
date_created: 2026-11-27T01:00:00.000Z
date_modified: 2026-11-27T01:00:00.000Z
date_start_scheduled: 2026-11-27T13:21:29.000Z
date_start_actual: 2026-11-27T13:21:29.000Z
date_end_scheduled: 2026-11-28T02:12:42Z
date_end_actual: 2026-11-28T02:12:42Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/55
---
# Cosmos - Branch line styles (T132)

Part 4 of 4 of *Cosmos 1:1 with mind map styles* (T129–T132). The scope is in T129 ([[Cosmos - Mind map theme as a colour mode]]).

## Today
- **Style keys:** `BranchStyle` is `{style, color, thickness, pattern, taper}` (`src/styles.ts` L59–65). Map-level `branchLineStyle`, `branchLineColor`, `branchLineThickness`, `branchLinePattern` and `branchLineTaper` live in `osmosis-styles` (L272, L293–302). The theme has `branchLine`. The global default `branchLineStyle` is a plugin setting (`settings.ts` L85).
- **Mind map:** `drawBranchLine` (`MindMapView` L10152), plus `applyPatternAttrs` L10351.
- **Cosmos:**
  - Edges are straight `LineSegments` (`CosmosScene.ts` L705–710, `writeEdges` L3146).
  - When the Overlays *taper* toggle is on, hierarchy edges are shader ribbons (`writeRibbon` L3233, `taperOf` L3251; `src/views/CosmosRibbons.ts`; `src/cosmos/taper.ts`, where `branchEnds` L61 already reads a node's thickness and taper, and `dashOf` L118 its pattern).
  - Planets edges are polylines from `planetEdge` L3354.
  - A node's `branchLine.color` is honoured (`linkColor` L3267). Thickness, pattern and taper apply only with the taper toggle on, and `style` never applies.

## Design
- **Resolution:** a pure `branchLook(child)` in `src/cosmos/` resolves, weakest first:
  1. the plugin default;
  2. the theme's `branchLine` (T129's mind map style mode only);
  3. the map's `branchLine*`;
  4. the child node's `branchLine`.

  It returns `{style, color, thickness, pattern, taper}`. Today's `branchEnds` and `dashOf` become consumers of it.
- **Geometry:** the edge between parent and child plates, built in a plane.
  - The plane: in Flat and Planets, use the continent plane or surface tangent. In Organic, use the plane holding the edge and the camera-facing up vector of the parent plate, so curves read as in 2D.
  - Shapes: `curved` is a cubic like the mind map's (the same control-point ratios). `angular` and `rounded-elbow` take the mind map's corner positions. `straight` is as today.
  - Sample to a polyline (8–16 segments for a curve), and feed it to the same ribbon path the Planets polylines use. In Planets, compose with `planetEdge` (apply the curve in the tangent plane, then project).
- **Ribbons whenever a style asks for them:** a hierarchy edge whose resolved look has a non-default thickness, pattern, taper or style draws as a ribbon even with the taper overlay off. The overlay keeps its meaning: depth-based taper for edges with no taper of their own. Plain edges stay `LineSegments`, so an unstyled vault costs nothing extra.
- **Hover and pick:** `edgeNear` (L2911) / `src/cosmos/edgepick.ts` must test against the polyline, not the chord.
- Non-hierarchy edges (links, embeds, tags) are unchanged.

## Context budget (~95k)
- `src/cosmos/taper.ts` (whole, 174 lines), `src/views/CosmosRibbons.ts` (whole, 129 lines), and `src/cosmos/edgepick.ts` (skim).
- `src/views/CosmosScene.ts`: L440–470, L700–715, L2905–2930, L3140–3380.
- `src/styles.ts` L59–65 and L259–310.
- `src/views/MindMapView.ts` (`grep -a`): `drawBranchLine` L10152 to its end, and `applyPatternAttrs` L10351 ±30 lines. **Only these.**
- `src/cosmos/node-style.ts` (whole).

## Acceptance criteria
- Each of curved, straight, angular and rounded elbow is recognisable in Cosmos, in Organic, Flat and Planets, set per node, per map, or by the theme in mind map style mode.
- Branch colour, thickness, dashed or dotted pattern, and fade or grow taper apply with the taper overlay off. The overlay still adds depth taper to unstyled edges.
- Hovering or clicking a curved edge picks it along the curve.
- An unstyled vault draws its edges as today, and frame time does not change. Report edge-pass ms on a large note before and after.
- Unit tests: `branchLook` precedence, and the curve, elbow and angular polyline builders (end points on the plate anchors, monotone where the mind map's is).
- lint, test and build pass.

## Test plan
1. The worker adds `vault/tests/graph3d/Branch Lines.md` (Ctrl+R after it is written): four branches with the four styles, one dashed, one thick, one tapered, and the map default set to curved.
2. Compare the mind map and Cosmos in Organic, then Flat, then Planets: the same shapes, colours and patterns.
3. Turn the taper overlay off: the styled edges keep their style, and unstyled ones go thin.
4. Hover a curved edge partway along: it highlights.

## What was implemented

**Where it shipped:** [PR #55](https://github.com/SawyerRensel/Osmosis/pull/55) (batch 17) into `release/0.0.6`, from `batch/17-sidecars-cosmos-styles`. Main commits 3d23dd0. Manual test: round 1.

The frame-time criterion was dropped by Sawyer at land (edge-pass ms unmeasured; only a Node micro-benchmark of the builders). Sawyer accepted the mind map's precedence, the plugin default `curved` being ignored in Cosmos, and curves bending against world up.

The cause, fix, decisions, surface map and fixtures are in *Implementation notes* below.

## Implementation notes

Code commit: `3d23dd0` on `batch/17-sidecars-cosmos-styles`.

**Approach.** A new pure module, `src/cosmos/branch-look.ts`, does two jobs:
- **Resolution:** `noteBranchLayers` reads a note's map-level layers: its `osmosis-styles` `branchLine*` keys, plus its theme's `branchLine` in Mind map style mode only. `resolveBranch` lays the child's own `branchLine` over those layers. `buildGraph` stores the result on `GraphNode.branch`, which is absent for an edge with no style.
- **Shapes:** `branchPath` builds the mind map's curved cubic, angular corners and rounded elbow in 3D, and `onSphere` lays a path onto a planet.

In `CosmosScene`, a new `edgePath` method gives the points for drawing (`writeEdges`), for picking (`edgeNear`) and for edge hints. So a curved edge is drawn, hovered, clicked and cut out of panels along its curve. With the Taper overlay off, a hierarchy edge whose branch line `needsRibbon` (a shape other than straight, a dashed or dotted pattern, a fade or grow taper, or a thickness of its own) is drawn as a ribbon (`styledEnds`). Every other edge stays a `LineSegments` line, as before. `CosmosRibbons` now grows its buffers mid-write, because curved and elbow edges have more segments than the scene's up-front guess.

**Decisions**
- **Precedence follows the mind map, not this note's list.** `drawBranchLine` layers the fields differently:
  - `style`, `pattern` and `taper`: node, then theme, then map.
  - `color` and `thickness`: node, then map, then theme.

  The two orders differ only when a custom theme and the map's keys set the same style, pattern or taper field. The built-in themes set only colour and thickness, where both orders agree. I chose 1:1 with the mind map.
- **The plugin's default line style (`curved`) is not a layer.** It is the default for every vault, so honouring it would curve every edge everywhere and break "an unstyled vault draws as today". An edge is shaped only by a style set on the node, the map or the theme.
- **A thickness of 1.5 (the mind map's default) counts as no thickness** (`ownThickness`). Every built-in theme sets `thickness: 1.5`, so without this rule, Mind map style mode would turn every themed edge into a ribbon. With the Taper overlay on, it would also wipe out the depth taper. This applies to `branchEnds` too.
- **With the Taper overlay off, a styled edge with no thickness of its own is a one-pixel hairline ribbon**, so it matches the line edges around it. Fade and grow start from the default 1.5 px when no thickness is set, because a tapered hairline would be invisible.
- **The cross axis is world up in Organic and Flat**, not the parent plate's camera-facing up as this note proposed. The camera's up would change every edge on every orbit frame, and the ribbons are built so that orbiting never rewrites them. In Flat, world up is exactly the slice's row axis (the rows run down the world), so Flat edges curve in their slice like the 2D map. In Planets, the axis is the parent's tangent frame: its `up`, or its `right` for top-down continents. The path is built there and then laid onto the shell (`onSphere`). Core-to-continent stalks are shaped with world up; lanes between planets are unchanged.
- **Ribbon width eases by distance along the path, not by point index.** Otherwise an elbow's short corner segments would take most of a taper.
- **`NodeLook.branchLine` was removed.** My change left it unused: the scene now reads `graph.branch`, which includes the map and theme layers.
- **No shader changes.** The existing ribbon shader draws everything.

**Surface map**

| File | Change |
|---|---|
| `src/cosmos/branch-look.ts` (new) | `noteBranchLayers`, `resolveBranch`, `needsRibbon`, `branchPath`, `onSphere` |
| `src/cosmos/branch-look.test.ts` (new) | precedence, ribbon rule, path end points and monotonicity, elbow corners, sphere projection |
| `src/cosmos/taper.ts` (+test) | `DEFAULT_BRANCH_THICKNESS`, `ownThickness`, `styledEnds`; `branchEnds` ignores the default thickness |
| `src/cosmos/model.ts` (+test) | `GraphNode.branch`, resolved per node in `buildGraph` |
| `src/cosmos/node-style.ts` (+test) | `NodeLook.branchLine` removed |
| `src/views/CosmosScene.ts` | `edgePath`; `taperOf` draws styled ribbons with the overlay off; `writeRibbon` eases width by length; picking and hints follow the path |
| `src/views/CosmosRibbons.ts` | buffers grow mid-write (`allocate`) |

**Fixture:** `vault/tests/graph3d/Branch Lines.md` (master copy in `e2e/fixtures/graph3d/`). The map default is `curved`, under two headings:
- *Shapes:* straight, angular and rounded elbow edges, each in its own colour, and an unstyled edge that takes the curved default.
- *Patterns:* dashed, dotted, thick, fade, and grow combined with angular.

It links to `Rigging.md`, whose edges have no style. It contains no cards.

**Could not verify**
- Nothing was checked visually in Obsidian.
- The edge-pass frame time was not measured. On an unstyled vault, the added per-edge cost is one `graph.branch` lookup. I measured the pure builders with a Node micro-benchmark over 5,000 edges: curved 5.7 ms (12.6 ms on a sphere), elbow 3.7 ms, angular 0.9 ms, straight 0.9 ms. That cost is paid only while edges are rewritten (while the layout settles) and on hover picks. Please read the edge pass from the perf gauge on a large note.
- Ribbon joints at angular corners can overlap or leave a hairline notch, because each segment faces the camera on its own.
- Theme-set shapes could not be shown in the fixture, because no built-in theme sets a line style. Theme precedence is covered by unit tests only.
