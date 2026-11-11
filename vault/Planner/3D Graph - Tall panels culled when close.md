---
title: 3D Graph - Tall panels culled when close
summary: "A tall code-block panel vanishes when the camera is close because chooseNear tests only the node centre; test the panel's projected box instead."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Near-tier panels overlap and hide their edges]]"
  - "[[3D Graph Phase 4 - Near tier]]"
  - "[[3D Graph - Near-tier sliders]]"
status: In-Review
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-11T00:25:00.000Z"
date_start_scheduled: "2026-11-11T00:11:43.000Z"
date_start_actual: "2026-11-11T00:11:43.000Z"
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

# Bug Report

## What happened?

Sawyer's screenshots: a tall code-block panel vanishes when the camera is close to it, even though most of the panel is still on screen. The near tier decides which nodes get a full panel by looking only at the node's centre, so a tall panel whose centre has left the screen is dropped while its body is still visible.

## What should have happened?

A panel stays in the near tier for as long as any part of its projected box is on screen (within the same margins the centre test uses today).

## Steps to Reproduce

1. Open a note with a long code block in the 3D graph.
2. Fly close to the code-block panel so its centre is off the top or bottom of the screen but part of the panel is still visible.
3. The panel fades back to a plate.

## Batch and checkpoint

Round 7, Batch A (fixes). Checkpoint: checkpoint 1 (A + B) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Culling: no frustum culling of plates; near-tier `chooseNear` (lod.ts:96-124) tests only node CENTRE (NDC ±1/±1.3, depth, facesEye) → tall panel fades when centre leaves screen. Panel cap 30em height, 20em width (near.ts:72).

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- `chooseNear` is `src/graph3d/lod.ts:111` (the facts cite 96-124). It takes `NearProbe`s and tests the centre in NDC against ±1 / ±1.3, plus depth and `facesEye`.
- Panel size caps are in `src/graph3d/near.ts:72` (30em tall, 20em wide).
- Plates themselves are not frustum-culled; this is about the near-tier panel choice only.
- Tests: `src/graph3d/lod.test.ts`, `near.test.ts`.

## Acceptance criteria

- `chooseNear` (or its probe) tests the panel's projected box (half-extents in NDC from panel size and distance), not just the centre.
- A tall panel whose centre is off screen but whose body overlaps the viewport stays near.
- A panel entirely off screen (box outside the margins) is still dropped; the budget and hysteresis (`enterScale`) behave as before.
- No change for panels whose centre is on screen.

## Test plan

Unit tests first in `lod.test.ts`: a tall probe with centre at NDC y = 1.6 but half-height 0.8 is kept; the same probe with half-height 0.2 is dropped; facesEye / depth rules unchanged; hysteresis still holds for already-near nodes. Extend `NearProbe` with the projected half-extents (computed by the caller from panel size and camera).

Manual test: open a note containing a long code block (add a fixture under `e2e/fixtures/` and copy it to `vault/tests/`, then Ctrl+R). Fly close so the panel's centre is below the screen edge: the panel must stay a live panel while any of it is visible, and fade only when fully gone.

## Out of scope

- Frustum culling of far plates.
- Changing the panel's width/height caps (see [[Graph - Node width in 3D and code blocks fit their lines]] for width).
- Near-tier budget or fade timings.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.

## Batch implementation notes (awaiting manual test)

**Cause.** `chooseNear` judged a node by its centre alone (NDC within ±1 to enter, ±1.3 to stay). A panel is up to 30em tall and drawn at a large screen scale when the camera is close, so its centre leaves the screen while most of its body is still in view, and it faded to its plate.

**Fix.** `NearProbe` gained optional `halfX` / `halfY`: the panel's half-size on screen in NDC (`panelHalfNdc(width, height, scale, viewport)`). The screen test is now `nearScreenDistance(p) = max(|x| - halfX, |y| - halfY)` against the same `NEAR_ENTER_SCREEN` (1) / `NEAR_EXIT_SCREEN` (1.3), so the *nearest edge of the box* has to be within the viewport (plus the exit margin for members). No extent means the centre alone, as before.

**CSS2DRenderer check.** Three's `CSS2DRenderer` does hide an object whose centre's clip z is outside [-1, 1] (`display: none`), i.e. depth below the camera near plane (1) or past far. It is not part of this bug: a CSS2D panel is a billboard, all of it at its centre's depth, so there is no "near part" to save, and at depth < 1 the panel is hundreds of times its laid-out size, so its centre is far off screen anyway. Left alone.

**Decisions worth remembering.**
- The extent applies to entering as well as staying. Otherwise a tall panel you pan to (centre off screen, body in view) would stay a plate yet survive as a panel once it was one, which is inconsistent. Consequence: a normal-sized panel can now enter when its *edge* touches the screen rather than its centre (the thresholds themselves are unchanged). Nearest-first budget still applies.
- The extent is only computed when the centre is past `NEAR_ENTER_SCREEN`; a centre on screen gives identical results with or without it, so the common path costs nothing.
- Size source: the measured `panel.width/height` (ResizeObserver, laid-out px) when the panel exists, else `panelBoxEm(node.graph) * 16 px`. Estimates lean large, which here means kept a bit longer.
- Planets (tilted, CSS3D) panels use the same screen-aligned estimate: foreshortening only makes it an overestimate. Not done: a tilted panel whose *centre* is behind the camera (`depth <= 0`) while a corner is in front still drops, because projecting a box that straddles the camera plane has no simple answer and it needs the camera to sit on a plate. Unverified in practice.

| File | Change |
|---|---|
| `src/graph3d/lod.ts` | `NearProbe.halfX/halfY`, `panelHalfNdc`, `nearScreenDistance`; `canEnter`/`canStay` use it |
| `src/graph3d/lod.test.ts` | Tests: tall kept/entered, short dropped, hysteresis band, width, centre-on-screen unchanged, depth/scale/mist rules |
| `src/views/Graph3DNear.ts` | Probes carry the extent when the centre is off screen; `panelPx` |
| `e2e/fixtures/graph3d/Long Checklist.md` (+ copy in `vault/tests/graph3d/`) | 40-line code block under a heading |

**Fixture.** `vault/tests/graph3d/Long Checklist.md`. Reload Obsidian (Ctrl+R) after it appears.

**Not verified.** Could not see Obsidian; the real on-screen behaviour (and whether `panelBoxEm`'s estimate matches the rendered height) is unchecked.

**Manual test.** Open Long Checklist, open the 3D graph from it, fly or scroll in on the code-block node until it is a live panel, then keep going until its centre is below (or above) the screen edge. The panel must stay live while any of it is visible, and fade only once it is fully off screen (plus the small margin). Normal short panels behave as before.
