---
title: "3D Graph - Plates draw over branches that are in front of them"
summary: "Plates such as git status and Commands are drawn over branch lines that are nearer the camera. The nearer thing must cover the farther, by real depth."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets surface grab anywhere on the sphere]]"
status: Done
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T16:53:20.000Z"
date_start_actual: "2026-11-12T16:53:20.000Z"
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

# 3D Graph - Plates draw over branches that are in front of them (T74)

## Request (Sawyer, 2026-11-12, verbatim)
> Plates tend to appear in front of branches even when the branches should be in front.

Screenshot: `vault/media/r9-plates-over-branches.png` (gitignored; on this machine only). Plates such as "git status" and "Commands" are drawn over branch lines that should pass in front of them.

## Rule (memory: never declutter)
The nearer thing must cover the farther, by real depth. Do not fix this by hiding, fading or thinning anything.

## Hypothesis to test, with numbers
- Plates are drawn with `PLATE_PULL` 0.97 (`src/views/Graph3DPlates.ts:56`, applied in the vertex shader at `:201`: `mvPosition.xyz *= 0.97`) with depth write, so every plate is pulled 3% toward the camera. An edge segment that is in front of the plate by less than 3% of the camera distance loses the depth test. Also check: do edges write/test depth, and in which render order relative to plates? Does `Graph3DNear.ts` (~:698) rely on the pull?
- Quantify: for the screenshot's geometry (typical camera distance and plate–edge separations), how many cases flip. Then pick a fix that keeps whatever the pull was introduced for (probably plates not being cut by their own node's edges / z-fighting with their sphere/connector) — e.g. a much smaller constant-world-unit pull, polygon offset, or excluding only the plate's own incident edges — and show with numbers it no longer inverts real ordering.
- Read the history of `PLATE_PULL` (`git log -S PLATE_PULL`) to learn why it exists before changing it.

## Acceptance criteria
- A branch that is nearer the camera than a plate draws over that plate; a plate nearer than a branch covers it.
- Whatever the pull was for still works (record what that is and how you verified it).
- Unit test on any pure depth helper.

## Context budget
Under ~130k. Opus. Graph3DPlates.ts and src/graph3d/depth.ts whole; Graph3DScene.ts / Graph3DNear.ts by range.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `471cf24` on `fix/plates-over-branches-depth`.

### Cause, with numbers
- Plates (and their glyphs) were drawn at `mvPosition *= 0.97` (`PLATE_PULL`, added in `2ff3422`). Plates write depth. Line edges and tapered ribbons are transparent, use `depthTest` and don't write depth, so they lose to any plate whose pulled depth is nearer.
- The pull is 3% of the camera distance: 2.1 world units at the 70-unit line stand-off, 3 at 100 and 4.5 at 150. A line plate is 5 units tall and roughly 30 wide.
- Inside a flat branch, lines and plates share one plane. A crossing's true depth gap is (screen distance × sin(tilt)). For example, a branch crossing a plate 20 units from its own nodes in a slice tilted 10° is 3.5 units in front, which is less than the 4.5-unit pull at a distance of 150, so the order flipped. In a flat slice, almost every crossing has a gap under 3%·D. That is the screenshot ("git status" and "Commands" over their slice-mates' branches).
- What the pull was for: an edge leaving its own node toward the camera should not run across that node's text (plate note, "Plates for every node"). Even for that it only partly worked. An edge exits a plate of half-width w after gaining w·cot θ in depth, so a 3-unit pull with w = 15 covered only edges within about 11° of the screen plane.

### Fix
- `PLATE_PULL` is removed. Plates draw at their real depth, so the depth buffer decides every pair of things with no fixed margin.
- The pull's purpose is now handled per incidence (`src/graph3d/own-plate.ts`). Each edge vertex carries both end plates (centre, half sizes, a planet plate's axes). The vertex shader takes them to view space and spins a planet plate upright as the plate shader does. The fragment shader casts the camera ray through the fragment onto each end plate, and discards the fragment only if it is in front of that plate and inside its rectangle. This applies to line edges (including planet arcs) and tapered ribbons. A branch over any *other* plate is never touched: no hiding, fading or thinning.
- How the original purpose was verified (unit tests in `own-plate.test.ts`): an own edge leaving at 45° and one leaving nearly straight at the camera (40 units nearer) are both hidden over their plate. The old pull hid neither of these. The same edge draws again once it leaves the plate on screen. The same crossing point that a node's own plate hides is not hidden for an unrelated plate.
- Planet boundary patches lie on the sphere, which touches each plate at its centre, and relied on the pull to sit under the plates. A patch is now drawn at `1/0.97` of its depth (`PATCH_PUSH`), so it keeps exactly the old margin under its plates. Surface edges now also draw over it.

### Decisions worth remembering
- Per-incidence exclusion, not a smaller constant pull. Any pull P flips every crossing whose gap is under P, and a flat slice has gaps near 0, so no value of P works.
- The discard is exact (ray against the plate's plane and rectangle, with the upright spin). It is not a screen-space box, so tilted planet plates are handled too.
- Not done: the study thread (orange) line and flowing particles don't get the per-incidence test. Where they leave a node toward the camera they can now cross its own text, because they are genuinely nearer. They could reuse `PLATE_END_ATTRIBUTES` and `patchOwnPlate` if Sawyer wants that.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/own-plate.ts` | New: end-plate attributes and writer, the view-space plate and ray test (TS mirror plus GLSL), and the shader patch |
| `src/graph3d/own-plate.test.ts` | New: unit tests |
| `src/views/Graph3DPlates.ts` | Removed `PLATE_PULL`; updated the doc |
| `src/views/Graph3DScene.ts` | Edge geometry gets end-plate attributes; `underOwnPlates` patches edge and ribbon materials |
| `src/views/Graph3DRibbons.ts` | End-plate attributes; `ends(a, b)` before each edge's segments |
| `src/views/Graph3DBoundaries.ts` | `PATCH_PUSH` for planet patches |
| `src/views/Graph3DNear.ts` | Comment only (plates are at their real depth) |

### Fixture
Reuse `vault/tests/graph3d/` (any note with a flat branch), or the Git note from the screenshot.

### Could not verify
I couldn't see Obsidian, so the shader compile at runtime (WebGL varyings and attributes) and the visual result are unchecked. Lint, 3214 unit tests and the build pass.

### Manual retest (desktop and phone)
1. Open the 3D graph on the Git note, with flat branches on (as in `r9-plates-over-branches.png`). Orbit so that branches cross "git status" and "Commands". A branch nearer than a plate now draws over it, and a plate nearer than a branch covers it.
2. Tilt the view so a node's own edges leave toward the camera. They should stop at the node's plate rather than crossing its text, including edges that point nearly straight at you.
3. Planets mode: surface plates should still sit on top of boundary patches, and branch arcs should still pass under their own plates.
4. Phone: repeat step 1. The fov differs there, and nothing in the fix depends on it.
