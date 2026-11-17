---
title: 3D Graph - Edge hints
summary: "When close to a node, each link or embed edge leaving it shows a small label just off this end naming its target, fading in by distance with the nearest 8 shown; hierarchy edges get no label."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Follow a link]]"
  - "[[3D Graph - Clickable links in panels]]"
  - "[[3D Graph - Tapered hierarchy edges]]"
  - "[[3D Graph - Focus dimming]]"
status: Done
priority:
progress: 100
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled:
date_start_actual: "2026-11-11T21:45:25.000Z"
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

In an organic layout it is hard to tell where an edge goes without flying along it. Sawyer wants to navigate such a layout: when near a node, its outgoing link and embed edges should say where they lead.

## What problem does this solve?

When the camera is close to a node, each link or embed edge leaving it shows a small label just off this end of the edge, naming its target ("Note > Heading" or the target node's text). Labels fade in by distance, and only the nearest 8 show. Hierarchy edges get no label.

## What's your current workaround?

Click the edge to ride it and see where you land.

## Batch and checkpoint

Round 7, Batch D (look). Checkpoint: checkpoint 3 (D) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Edge hints: link/embed edges only, target name label near this end, fade by distance, nearest 8.

Purpose: make navigating an organic layout possible. Hierarchy edges (and tag edges) get no label.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Edges are drawn as one LineSegments (`src/views/Graph3DScene.ts`); edge data and kinds are in `src/graph3d/model.ts` and `appearance.ts`; picking in `src/graph3d/edgepick.ts`.
- Labels: the scene already draws plate text and near panels (`src/graph3d/near.ts`, `lod.ts` chooses near nodes by budget); an edge-hint tier would pick the nearest 8 edge ends by distance with a similar probe-and-choose pure function.
- Link targets: edge target node (note + heading, or node text) is derivable from the model; label text rule: 'Note > Heading' for cross-note targets, the node text for same-note targets.
- Labels must be cheap: pool 8 sprites/DOM labels, not one per edge.

## Acceptance criteria

- Within a distance threshold of a node, each link and embed edge leaving that node shows a label near this end, reading 'Note > Heading' (cross-note) or the target node's text (same note), truncated sensibly.
- Labels fade in by distance (opacity from far threshold to near threshold) and at most the nearest 8 are shown at once, with hysteresis so they do not flicker.
- Hierarchy (and tag) edges show no label.
- Labels face the camera, do not block clicks on plates or edges, and respect focus dimming / hidden edge kinds (a hidden edge has no hint).
- Both ends of an edge can have their own label when the camera is near both nodes (each names its own target).

## Test plan

Unit tests first (pure module with probes, like `chooseNear`): selecting the nearest 8 from many candidates; fade factor by distance (0 beyond far, 1 within near, monotonic); hysteresis; label-text builder for cross-note heading, cross-note root, same-note target; kind filter excludes hierarchy and tags.

Manual test (fixture: `vault/tests/graph3d/` Sailing notes which link to each other, Organic layout, depth 2 or 3; Ctrl+R):
1. Fly close to a node with links: labels appear near the start of each link edge naming the target.
2. Back away: they fade out; with a node of many links only the nearest 8 show.
3. Hierarchy edges never have labels. Hide the link edge kind: the labels go.
4. Use the labels to navigate: ride an edge to the named target.

## Out of scope

- Arrowheads and direction cues ([[3D Graph - Tapered hierarchy edges]]).
- Clickable labels (labels are non-interactive).
- Labels for hierarchy, tag or attachment edges, and labels mid-edge.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Branch** `feature/3d-edge-hints` (stacked on T52), code commit `9c5bfa5`.

### Approach
- Pure `src/graph3d/edge-hints.ts`: `hintedKind` (link and embed only), `hintFade` (1 within `HINT_NEAR_DEPTH` 120, 0 from `HINT_FAR_DEPTH` 300, linear between, view depth of the node), `chooseHints` (nearest `HINT_MAX` 8, same shape as `chooseNear`: a member gets a 25 % rank bonus and may drift to 1.15 NDC off screen where a newcomer needs 1.0), `hintText` / `plainLabel` / `noteName` (label text), `exitDistance` (how far a plate reaches along the edge as the camera sees it) and `labelShift` (which side of the anchor the box sits on).
- `src/views/Graph3DHints.ts`: pool of 12 CSS2D labels (8 + 4 spare so a leaving label can finish fading while its replacement fades in), opacity eased at 0.12 s, inert (`pointer-events: none`), drawn by the near tier's CSS2D renderer (so no new renderer). `Graph3DScene.updateHints` runs each frame after the boundaries: one pass over the cached link/embed edges with the depth test first, then text, direction and reach only for the chosen few.
- Anchor = this end's node plus the edge's direction (the first or last point of `planetEdge`'s points, so a Planets lane or tunnel leaves along its drawn arc) times the plate's reach (or the live panel's size, `Graph3DNear.liveBoxWorld`) plus 4 px. Label is shifted so its near side touches the anchor.

### Decisions worth remembering
- A hint at EITHER end of an edge names the node at the OTHER end (the ticket says "each names its own target"). So a link A to B shows "B" near A and "A" near B; nothing marks direction (arrowheads are out of scope).
- Hidden by Settings > Look > Labels = none (labels none means no text), but NOT by "plates" (hints are not panels). No new setting: the ticket asked for none.
- Hidden edge kinds: uses the same `edgeDrawn` test as the drawn edges, so a hidden kind or a hidden-ghost edge has no hint. Focus dimming and mist: opacity is multiplied by `plateVisibility`, the same term the panels use.
- Planets: a hint is skipped while its node's plate faces away (`showsText`), matching the no-text-on-backs rule.
- Thresholds are world-unit view depths (a line node's flight stand-off is 70, so a selected node's hints are fully visible); they are constants at the top of `edge-hints.ts` for tuning.
- Labels are DOM, so (like panels) they always draw over the canvas; a plate nearer than the hint does not cover it. Not decluttered by design.
- `tag`, `property`, `attachment` and `hierarchy` edges never get hints; `plainLabel` strips heading/list/emphasis markers and shows links as their text; text is cut at 40 characters with an ellipsis.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/edge-hints.ts` | new pure module (above) |
| `src/graph3d/edge-hints.test.ts` | 17 unit tests: kind filter, fade, nearest 8, hysteresis, text builder (cross-note heading / root / same note / ghost), reach, shift |
| `src/views/Graph3DHints.ts` | new label pool |
| `src/views/Graph3DScene.ts` | `hints` field, `updateHints`/`placeHints`, group added to the scene, disposed |
| `src/views/Graph3DNear.ts` | `liveBoxWorld(id)` |
| `styles.css` | `.osmosis-graph3d-hint(-anchor)` |

### Fixture
`vault/tests/graph3d/Hint Harbour.md` (master in `e2e/fixtures/graph3d/`): one line with 12 links (10 notes, a heading, a ghost), a same-note link, an embed. Ctrl+R after the build.

### Not verified
Could not see Obsidian: label placement against tilted Planets plates, the 120/300 thresholds' feel, and label overlap when several edges leave in nearly the same direction (not decluttered).

### Follow-up after Sawyer's test (2026-11-11)

Sawyer's test ("Javascript" note, node "Arguments" with many incoming links): the hints sat in one horizontal row under the plate, overlapping, and zoomed out they looked bigger than the node. Settled with Sawyer: hints run along their link lines, and scale with the world. Code commit `0d518e0`.

- **Along the edge.** Each label is turned to its edge's on-screen direction (node centre to anchor, projected, so perspective is included; camera-plane direction when seen end on) and centred across the line, its start against the anchor just off the plate. `readableAngle` keeps text within ±90°: a leftward edge flips, and the label's END touches the anchor instead. A vertical edge reads bottom to top. This follows the edge's screen direction, so the Planets upright spin does not matter.
- **No stacking.** `stackHints` (per node): a hint whose box would cover an earlier one's (edges under 90° apart, spans overlapping where they are closer across than a box height) is pushed out along its edge past that one's end plus 4 px; after `HINT_MAX_PUSHES` (2) pushes it is dropped. Taken in `chooseHints` order (current set ahead of newcomers), so a shown hint never moves when one arrives; deterministic, no per-frame state. Box sizes are estimated from the text (`hintBox`, 0.55 em a character), not measured.
- **World size.** Hint text is `HINT_EM_RATIO` 0.6 of a line plate's text in world units (`HINT_EM_WORLD` in the scene); the box has a fixed 12 px font (`HINT_BASE_PX`) scaled by CSS transform, so no relayout per frame. Below 8 px on screen it fades, gone at 6 px (`hintSizeFade`), and too-small ends are not even candidates. The 120/300 depth fade is kept; on a typical window the size cutoff now ends hints before 300.
- Hints with other nodes are still not decluttered against each other (only hints at one node are stacked).

| File | Change |
|---|---|
| `src/graph3d/edge-hints.ts` | `labelShift` replaced by `readableAngle`, `hintSizeFade`, `hintBox`, `stackHints` and size constants |
| `src/graph3d/edge-hints.test.ts` | 27 tests: readable angle (all directions, flips, vertical), size fade, box, stacking (separate, push, drop, per node, ±180° wrap, newcomer doesn't move others) |
| `src/views/Graph3DHints.ts` | `place` takes angle, flip, push and scale; one transform string |
| `src/views/Graph3DScene.ts` | `placeHints`: size filter, projected direction, spans, `stackHints` |
| `styles.css` | hint font fixed at 12 px, `transform-origin: 0 0` |

Not verified: the feel of 0.6 and the 6–8 px cutoff, and the text-width estimate against real fonts (a long label may be pushed a little too far or not quite far enough).
