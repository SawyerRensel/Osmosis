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
  - "[[Mind Map - Boundary (cloud) style]]"
cover:
color:
pull_request:
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
