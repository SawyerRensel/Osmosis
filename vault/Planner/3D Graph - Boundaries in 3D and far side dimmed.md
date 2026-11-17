---
title: 3D Graph - Boundaries in 3D and far side dimmed
summary: "Render boundaries in 3D (a soft patch hugging the sphere in Planets, a soft hull elsewhere), and in Planets draw the whole far hemisphere dimmed through the planet with no text on plate backs."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Mind Map - Boundary (cloud) style]]"
  - "[[3D Graph - Read node styles]]"
  - "[[3D Graph - Planets mode]]"
  - "[[3D Graph - Planets continent frames]]"
status: Done
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-11T15:51:10.000Z"
date_start_actual: "2026-11-11T15:51:10.000Z"
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
  - "[[Mind Map - Boundary (cloud) style]]"
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

Two 3D look features.

1. Boundaries (clouds) set up in 2D should also appear in 3D around their subtree.
2. In Planets, plates on the far side of the planet currently collapse off screen (single-sided plates). Sawyer wants to see the whole far hemisphere, dimmed, through the planet (plates, edges and clouds), but with no text on the backs of plates.

## What problem does this solve?

3D draws boundaries from the shared `osmosis-styles`: in Planets a soft patch hugging the sphere surface under the subtree; in the other layouts a soft hull around the subtree. In Planets, the far hemisphere is drawn dimmed through the planet with no text on plate backs.

## What's your current workaround?

Boundaries show only in 2D; far-side plates simply disappear.

## Batch and checkpoint

Round 7, Batch D (look). Checkpoint: checkpoint 3 (D) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

Blocked by: [[Mind Map - Boundary (cloud) style]]. Do not start until that ticket is built (stacked branch is fine).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> 3D: far side whole hemisphere dimmed, no text on plate backs.

Details from the brief: boundaries are rendered in 3D (a soft patch hugging the sphere in Planets, a soft hull in other layouts); in Planets the whole far hemisphere (plates, edges, clouds) is drawn dimmed through the planet, with no text on plate backs. Boundaries are per node only; no automatic continent clouds.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Plates are single-sided: back faces are collapsed in `src/views/Graph3DPlates.ts:184-206` (`facesEye`), and panels use `facesEye` too, so back-facing plates collapse off screen today.
- Planets: `src/graph3d/planets.ts` (sphere wrap, `wrapPoint` at `:250`); a boundary patch must follow the sphere surface under the subtree's wrapped plates.
- Edges: one LineSegments in the scene (colour+alpha only), see [[3D Graph - Tapered hierarchy edges]]; the dimmed far side must apply to edges too.
- Boundary data comes from [[Mind Map - Boundary (cloud) style]] via [[3D Graph - Read node styles]].
- Text: the near-tier panels and plate labels must not render on back faces.

## Acceptance criteria

- Boundaries on nodes render in 3D in every layout: Planets as a soft translucent patch hugging the sphere under the subtree, Organic/Flat as a soft hull around the subtree's plates; tint, opacity, border follow the style settings.
- In Planets, back-facing plates, edges and boundaries are drawn dimmed (a single named dim factor) instead of collapsed, visible through the planet.
- Back-facing plates show no text (no labels, no near panels) on their backs.
- Front-facing rendering is unchanged; far-side nodes remain non-interactive or selectable per existing rules (state what you chose in the note).
- Plates stay instanced; no large frame-time regression on the stress web.

## Test plan

Unit tests first (pure): the far-side classification (given camera and plate normal, dim vs front) including the threshold; hull/patch geometry generation from plate positions; the rule that text is suppressed when not `facesEye`.

Manual test (fixture: a styled note with a boundary on one branch, plus the Anchor notes for Planets; Ctrl+R):
1. Organic and Flat: the boundary appears as a soft hull around its branch.
2. Planets: the boundary hugs the sphere under the branch; rotate the planet: it follows.
3. Planets: the far hemisphere is visible, dimmed, through the planet; edges are dimmed too; plate backs show no text.
4. Check frame rate on a larger graph.

## Out of scope

- Creating or editing boundaries (see [[Mind Map - Boundary (cloud) style]]).
- Automatic continent clouds.
- Making far-side plates readable or editable.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `fd22dd5` on `feature/3d-boundaries-far-side-dim` (stacked on [[Mind Map - Boundary (cloud) style]]).

### Approach

- **Far side.** Planet plates used to be collapsed off screen when seen from behind (`plateBack` in `Graph3DPlates`). Now the plate background is drawn with its colour mixed `FAR_SIDE_DIM` (0.7, same sense as `FOCUS_DIM_BEHIND`) of the way to the background, while its glyphs keep collapsing: no text on a plate's back. Edges get a per-vertex `aCore` attribute (the vertex's planet core, w = 1 on a planet) and the edge shader dims a vertex whose outward direction from its core faces away from the camera, so edges dim per vertex as the camera orbits, with no CPU rewrite. Pure rule and GLSL twin in `src/graph3d/far-side.ts` (`onFarSide`, `farSideKeep`, `showsText`, `FAR_SIDE_GLSL`).
- **Boundaries.** `NodeLook.boundary` (from T50) is drawn by `Graph3DBoundaries`: every boundary in ONE indexed mesh and one draw call, outer boundaries first so inner ones lie on top. Members = the node plus every loaded node under it via hierarchy edges (`boundaryGroups`). Geometry in pure `src/graph3d/boundary3d.ts`:
  - **Hull** (Organic, Flat, and any boundary whose members are not all surface plates of one planet, e.g. on a planet's core): 3D convex hull (three's `ConvexHull`) of each plate grown into a rounded cylinder about world vertical (billboard plates turn about it as you orbit). Smooth normals. Only its back faces are drawn, so it sits *behind* the plates it wraps like the 2D cloud; the outline is a screen-px rim where the hull turns edge-on.
  - **Patch** (Planets, all members on one planet): 2D hull of the plates' corners in an azimuthal equidistant map about the subtree's mean direction (the inverse of `wrapPoint`), rounded by the padding, wrapped back onto the sphere in rings so it hugs the surface. The plate pull draws plates over it. The outline is drawn from a per-vertex distance-from-edge; dashed / dotted follow the 2D pattern (4 on 3 off / a dot every 2.5 widths) by arc length. Far-side patches dim by the same rule.
  - Padding = the 2D `BOUNDARY_PADDING` (12 px) in em via `STYLE_PX_PER_EM`, × (1 + levels of boundary nested inside), so nested boundaries never touch.
- Rebuilt only when the scene is dirty (positions/styles changed), throttled to ≥ 66 ms and ≥ 10× the last build's time. Measured: 50 plates ≈ 2–4 ms, 300 ≈ 5 ms, 1,000 ≈ 18 ms (hull). Graphs with no boundary pay nothing (mesh hidden, no build).

### Decisions worth remembering

- **Far-side nodes stay non-interactive** (existing rule: a back-facing planet plate is not picked; no near panel). Least change; the ticket's out-of-scope says far side isn't meant to be readable.
- **Far-side plates now cut holes in nearer-than-them panels** (the occlusion skip for back plates was removed in `Graph3DNear.place`), since they are drawn and "a nearer thing simply covers a farther one".
- **Unset boundary colour = the node's own 3D colour** (`EngineNode.color`, the colour-by colour), not the theme accent: matches "tinted by the node's colour" and what you see on the plate outline.
- **Hull outline is always solid** in Organic/Flat (a rim on a 3D surface has no path to dash along); `none` / width 0 still removes it. Patches honour dashed/dotted.
- **Subtree = outline (hierarchy edges) only**; embedded notes (embed edges) are not wrapped, so a boundary never spans planets.
- **Hull drawn back faces only**: when the camera flies inside a hull, the whole view behind is tinted at the fill opacity (no special case).
- No decluttering, no position changes; front-facing rendering untouched (only the `plateBack` branch changed).

### Surface map

| File | Change |
|---|---|
| `src/graph3d/far-side.ts` | New: `FAR_SIDE_DIM`, `onFarSide`, `farSideKeep`, `showsText`, `FAR_SIDE_GLSL`. |
| `src/graph3d/boundary3d.ts` (+ test) | New: `boundaryGroups`, `hullMesh`, `patchMesh`. |
| `src/views/Graph3DBoundaries.ts` | New: single-mesh boundary renderer (shader, throttled rebuild, GPU buffer release). |
| `src/views/Graph3DPlates.ts` | `fogVertex(hideBack)`: back plates dimmed, glyphs still collapsed. |
| `src/views/Graph3DScene.ts` | Edge `aCore` attribute + far-side edge shader patch (`dimWithFocus(..., farSide)`), `coreOf`, `surfaceOf`, `hierarchyEnds`, boundaries mesh wired into tick/dispose. |
| `src/views/Graph3DNear.ts` | Panels use `showsText`; back plates now count as occluders. |
| `e2e/fixtures/graph3d/Boundary Clouds 3D.md` → `vault/tests/graph3d/` | Fixture. |

### Fixture

`vault/tests/graph3d/Boundary Clouds 3D.md`: "Moorings" (default tinted by its blue fill) with a nested dashed orange boundary on "Visitor berths"; "Boatyard" dotted, tinted by its green border; a leaf boundary on "Shackles" (purple, no outline); "Chandlery" otherwise plain.

### Not verified

I could not see Obsidian: the shaders compile only at runtime (typecheck/lint/build pass), the look of the hull rim (fwidth on smooth normals) and of the patch on a strongly curved small planet, and frame rate on the stress web are unchecked.
