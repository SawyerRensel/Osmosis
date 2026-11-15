---
title: "3D Graph - Planet core layer shells drawn"
summary: "Round 11 (T86). With Core layers > 1, each shell draws as a faint translucent sphere, and outer shells fade as the camera zooms in past them so inner plates become readable and reachable."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Planet core layers]]"
status: In-Review
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-15T22:50:00.000Z"
date_start_scheduled: "2026-11-15T22:28:01.000Z"
date_start_actual: "2026-11-15T22:28:01.000Z"
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
parent:
children:
blocked_by:
cover:
color:
pull_request:
---

# 3D Graph - Planet core layer shells drawn (T86)

## Spec (grilled with Sawyer, 2026-11-15)
Follows T85 (layout + slider). **Translucent + fade**: each shell (1…N−1, and the surface as today) draws as a faint translucent sphere; shells **fade out as the camera goes inside / close to them**, so plates on inner shells become readable. Plates on a faded shell must not be hidden or block picking of inner plates (check raycast/pick order; a faded outer plate should not steal clicks meant for an inner one only if that's how "nearer covers farther" already works — memory `3d-graph-view-feature`: no decluttering, a nearer thing covers a farther one; record what you do).

## Where the code is
`Graph3DBoundaries` (planet boundary patches, `PATCH_PUSH`), `src/graph3d/planets.ts`, `globe.ts` (grab/orbit assume one surface: grabbing should pick the outermost *visible* shell or keep the surface; record the call). Depth: plates draw at real depth; branches use 11 of 16 vertex attribute slots.

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Done when
Shells visible as faint spheres at N>1, fade by camera distance, inner plates readable and selectable when zoomed in, N=1 unchanged, phone frame rate not hurt (one sphere mesh per shell, shared material params).

## Context budget
~130k. T85's implementation notes first; `planets.ts`, `globe.ts` whole; boundaries file whole if small; scene by grep.

## Test plan (Sawyer)
Planets, Core layers 3: faint shells visible; zoom toward the planet — outer shell fades, inner continent plates readable; click them; rotate-grab still works; Core layers 1 looks as before.

## Batch implementation notes (awaiting manual test)

Code commit: `2e84377` on `feature/planet-core-shells` (stacked on T85's `feature/planet-core-layers`).

### Approach
`layoutPlanet` now keeps the inner shells' radii on `PlanetLayout.shells` (k = 1…N−1, `growth·shellRadius(surface, core, k, N)`, innermost first; empty at N = 1), exposed as `PlanetWorld.shells(core)`. A new `Graph3DShells` draws every inner shell of every planet as one instance of one shared sphere (`SphereGeometry` 40×20, one `InstancedMesh`, one `ShaderMaterial`): a single draw call for all shells. Each instance is scaled to its radius, centred on the core's live position and coloured with the core's colour, with the core's opacity (fading in/out). The fade is done in the vertex shader from `cameraPosition`, so moving the camera costs no CPU work; instances are rewritten only on the scene's existing `dirty` frames (when positions change).

### Decisions worth remembering
- **The surface (shell N) is not drawn**, only shells 1…N−1. The planet had no drawn surface before, and "the surface as today" means it stays as it is. That is what keeps N = 1 unchanged: there are no inner shells, so the mesh is hidden.
- **Look:** translucent, brightest at the rim (fresnel-style). Opacity is `SHELL_ALPHA` 0.16 at the rim, falling to 20% of that (`SHELL_FACE_SHARE`) where the shell faces the camera, so plates inside it are only faintly veiled. The fog applies to the shells. They don't dim with focus, since they are already faint. Constants are in `src/graph3d/shells.ts`.
- **Fade rule (`shellFade`, mirrored in `SHELL_FADE_GLSL`):** a smoothstep on camera distance from the planet centre, measured in that shell's radii. The shell is fully shown at 1.6 r or more, and gone at 1.05 r and everywhere inside it. Outer shells therefore fade first as you zoom in, and each fades just before the camera reaches it.
- **Plates are never faded or hidden** (no decluttering). The shell mesh writes no depth and plays no part in picking (picking is screen-space `nodeNear`), so it can't steal clicks. Faded-shell plates and picking: once the camera is inside a shell, that shell's plates are seen from behind. The existing far-side rule already draws a plate seen from behind dimmed, with no text and no near panel, and `nodeNear` already skips it. So outer plates don't block clicks on inner plates once you are inside them. While the camera is still outside the surface, a nearer surface plate covers a farther inner one, as everywhere else. Nothing in picking changed.
- **Grab (`grabRadius`):** from outside the surface, the grab holds the surface exactly as before. From inside the surface, it holds the outermost inner shell the camera is still outside of: the shell whose plates face the camera, so they stay under the finger. From inside the innermost shell it falls back to the surface (the old behaviour from inside). This applies in `sphereUnder` (grab on a gap between plates). A grab that starts on a plate already used that plate's own distance from the centre (T85).
- **Shells don't ease.** When Core layers changes, plates ease to their shells over `RELAYOUT_MS`, but the spheres jump to their new radii at once. That was simpler, and the jump is faint.
- The mesh grows by doubling and never shrinks. Growing it disposes the old geometry and instance buffers, and `dispose()` releases everything.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/planets.ts` | `PlanetLayout.shells` (inner shell radii), `PlanetWorld.shells(core)` |
| `src/graph3d/shells.ts` | New: `shellFade` + `SHELL_FADE_GLSL`, `grabRadius`, look constants |
| `src/views/Graph3DShells.ts` | New: instanced translucent shell spheres, one draw call |
| `src/views/Graph3DScene.ts` | Adds the shells group, `writeShells()` on dirty frames, dispose; `sphereUnder` grabs via `grabRadius` |
| `src/graph3d/shells.test.ts`, `planets.test.ts` | Fade bounds/monotonicity/order, grab radius cases, shell radii match plate depths, empty at N = 1 |

### Fixture
None new: `vault/tests/graph3d/Tapered Branches.md` (three H2 continents, lists four levels deep) and `Galley Handbook.md` for a bigger planet.

### Manual test (Sawyer)
Desktop:
1. Open `tests/graph3d/Tapered Branches.md` in the 3D graph, depth 0, Layout: Planets, Core layers 1. Expected: it looks exactly as before, with no spheres.
2. Set Core layers to 3. Expected: two faint spheres in the planet's colour appear inside it, brightest at their rims.
3. Zoom slowly toward the planet. Expected: as you near the surface and pass through it, the outer inner sphere fades out first, then the next. Once you are past the surface plates, the surface plates behind you or around you show dimmed with no text, and the H2/bullet plates on the inner shells read clearly.
4. While inside the surface, click an inner plate. Expected: it selects/hovers. Drag on a gap: the planet turns, and the inner plates stay under the cursor.
5. Zoom back out, then grab-rotate from outside. Expected: it works as before.
6. Try `Galley Handbook.md` at 6 and watch the frame rate (gauge, bottom left).

Phone: steps 1–5 with pinch zoom and a one-finger grab. Expected: frame rate unchanged from Core layers 1.

### Could not verify
Anything visual: I can't see Obsidian, and the shader is unverified at runtime. It compiled through esbuild, but GLSL is only compiled by the GPU. If the shells don't appear, check the console for a shader error. Also unverified: whether 0.16/0.2 are faint enough on light themes, and phone frame rate.
