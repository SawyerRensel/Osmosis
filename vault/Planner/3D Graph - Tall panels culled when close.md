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
status: To-Do
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-10T12:00:00.000Z"
date_start_scheduled:
date_start_actual:
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
