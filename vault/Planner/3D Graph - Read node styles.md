---
title: 3D Graph - Read node styles
summary: "3D reads the osmosis-styles frontmatter (fill, border, text, width, branchLine, shape where meaningful), keyed the same way as 2D, so one styling system serves both views."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Mind Map - Styles survive text edits]]"
  - "[[3D Graph Phase 7 - Editing]]"
  - "[[Graph - Node width in 3D and code blocks fit their lines]]"
  - "[[3D Graph - Settings in the style sidebar]]"
  - "[[3D Graph - Shared toolbar ribbon]]"
  - "[[Mind Map - Boundary (cloud) style]]"
  - "[[3D Graph - Tapered hierarchy edges]]"
status: Done
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-11T10:48:56.000Z"
date_start_actual: "2026-11-11T10:48:56.000Z"
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

The 3D graph ignores per-node styles. A node styled in the 2D mind map (colour, border, text colour, width, branch line) looks unstyled in 3D. 2D and 3D should share one styling system as much as possible, and this ticket is the read side, the foundation for width, the 3D style sidebar, boundaries and tapered edges.

## What problem does this solve?

3D plates and panels honour each node's `osmosis-styles` entry: fill, border, text colour, width (consumed by the width ticket), branchLine (consumed by the taper ticket), and shape where it is meaningful in 3D. Keys resolve exactly as in 2D.

## What's your current workaround?

3D draws every plate in the theme colours; to see a node's style you must switch back to 2D.

## Batch and checkpoint

Round 7, Batch C (editing and styling). Checkpoint: checkpoint 2 (C) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> PRINCIPLE: 2D and 3D share one styling system as much as possible.

This is the foundation for [[Graph - Node width in 3D and code blocks fit their lines]], [[3D Graph - Settings in the style sidebar]], [[3D Graph - Tapered hierarchy edges]], [[Mind Map - Boundary (cloud) style]] and [[3D Graph - Shared toolbar ribbon]] (style copy/paste). Reuse 2D's resolution code; do not fork a 3D-only style format.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Styles live in `osmosis-styles` frontmatter keyed by `^id` or a stamped `^os-` key (`planStyleKeys`, `src/mindmap-style-key.ts`).
- `NodeStyle` already has `width` (2D has a drag handle for it). 3D reads NO per-node styles today.
- Where 3D draws: plate instancing `src/graph3d/` plates + `src/views/Graph3DPlates.ts`; near-tier panels `src/graph3d/near.ts`; the scene is `src/views/Graph3DScene.ts`; colours come from `appearance.ts` (colour-by modes).
- vitest cannot import `obsidian`: keep style resolution in a pure module (e.g. next to `mindmap-style-key.ts`) and test it there.
- 2D style application: look at how `MindMapView.ts` resolves a node's style and feeds the renderer.

## Acceptance criteria

- A pure function maps (note's styles map, node's key info) to a resolved `NodeStyle` for a 3D node, using the same key rules as 2D (`planStyleKeys` / `^os-`), with unit tests.
- Plates (instanced) honour fill and border colours and text colour; near-tier panels honour fill, border and text colour.
- `shape` is honoured only where meaningful in 3D (document which shapes are drawn; unsupported shapes fall back to the default plate without error).
- `width` and `branchLine` are read and exposed to the renderer (stored on the node's render data) for the tickets that consume them, even if not yet drawn.
- Styles update live when the note's frontmatter changes (no stale cache) and survive text edits as in [[Mind Map - Styles survive text edits]].
- A node with no style looks exactly as today.
- Plates stay instanced (no per-plate draw calls added).

## Test plan

Unit tests first: style-key resolution for `^id` and `^os-` nodes in the 3D node model; missing/partial styles; unknown shape fallback; a note with no `osmosis-styles` yields defaults.

Manual test (fixture: a note with styled nodes made in 2D, in `e2e/fixtures/`, copied to `vault/tests/`, Ctrl+R):
1. In 2D, style three nodes (fill, border, text colour); open the same note in 3D (toggle): the plates carry the same colours.
2. Fly close: the near panels carry them too.
3. Edit a node's text in 3D: the style persists.
4. Change a style in 2D, toggle to 3D: updated.

## Out of scope

- Writing styles from 3D (see [[3D Graph - Settings in the style sidebar]], [[Graph - Node width in 3D and code blocks fit their lines]]).
- Boundaries and taper rendering (they consume what is read here).
- Changing the style file format.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit 2fdb760 on `feature/3d-read-node-styles` (stacked on the Planets continent frames branch).

**Approach.** Styles are resolved into the 3D *model*, not the view: `buildGraph` (`src/graph3d/model.ts`) asks a per-note reader, `noteStyleReader(frontmatter, root, globalClasses)` in the new pure module `src/graph3d/node-style.ts`, for each note/line node and stores the result as `GraphNode.style` (a sparse `NodeStyle`, absent when unstyled). The reader reuses 2D's code: `parseOsmosisStyleFrontmatter`, `lookupNodeStyleByPath` (block ID `^id`/`^os-` > `_n:` stable ID > tree path, exactly the mind map's order), `lookupClassStyle`, `lookupVariantStyle` and `resolveCascade`. The scene turns each node's style into a `NodeLook` (`nodeLook()`: fill, border, text colour, stroke multiple, corner radius, plus `width` and `branchLine` carried through) on `EngineNode.look`, renewed on every `setData`. Plates draw it from new instance attributes (plate `aFill` vec4 + `aShape` vec2, glyph `aInk` vec4; a style's border colour is written into the existing `aColor`), so there is no extra draw call. Near panels paint from the same look (`Graph3DNear.paint`).

**Live updates.** No style cache: the frontmatter is read from `metadataCache.getFileCache()` on every reload, and the view already reloads on `metadataCache.on("resolve")` for loaded notes, so a style written in 2D (or by hand) lands within the 750 ms reload debounce. Text edits keep the style because `renameInFile` puts the line's block ID back, so the `^os-` key still matches.

### Decisions worth remembering
- **Theme not applied in 3D.** The cascade is Local > Class > Variant > the note's `baseStyle` (weakest, as 2D merges it into the theme base). The plugin theme (and map-level `topicShape`) is skipped: 3D's colour-by modes stand in for it, and applying it would restyle every unstyled node, breaking "a node with no style looks exactly as today".
- **A style's border colour beats the colour-by outline** (2D shows it, so 3D does). The selection accent still beats both.
- **Shapes drawn:** `rect` (square corners), `rounded-rect` (today's plate), `pill` (round ends). Every other shape (ellipse, circle, diamond, hexagon, cloud, underline, none, …) falls back to the default rounded plate: a plate is a one-line label, and `none` would leave text floating over whatever is behind it. `PLATE_CORNERS` in `node-style.ts` is the list.
- **Border:** `width` is a multiple of the default outline (2D's default is 1 px), capped at ×8; `style: none` draws no outline; dashed/dotted draw solid (not attempted).
- **Colours** are validated by `cssColor()`: `#rgb`, `#rrggbb`, `rgb()/hsl()` and names. `var(--…)`, 8-digit hex and keywords like `transparent` fall back to the default on both plates and panels, so a node looks the same near and far.
- Panels take fill (background), border (inset shadow colour + thickness), corner radius, and text colour (set on the rendered body, as 2D sets it on its wrapper). Font, size, weight, italic and alignment are not read (they would change panel size and spacing).
- `lookupVariantStyle` now takes `Pick<LayoutNode, "source">` (type widening only) so 3D can call it with a parse node.

### For the tickets that build on this
- Resolved style: `GraphNode.style` (model) and `EngineNode.look: NodeLook` (scene). `look.width` (mind-map px, null when unset) is for [[Graph - Node width in 3D and code blocks fit their lines]]; `look.branchLine` (`BranchStyle`, null when unset) is for [[3D Graph - Tapered hierarchy edges]]. Map-level branch settings (`branchLineColor/Thickness/Pattern/Taper`) are not read yet.
- Refresh path: style change → frontmatter change → `resolve` → `Graph3DView.reload` → `buildGraph` → `Graph3DScene.setData` (renews `look`, sets `layoutDirty`, calls `near.refreshColors()`). A 3D style writer (sidebar ticket) needs nothing more than writing the frontmatter.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/node-style.ts` | New: `noteStyleReader`, `nodeLook`, `NodeLook`, `DEFAULT_LOOK`, `PLATE_CORNERS`, `cssColor` |
| `src/graph3d/node-style.test.ts` | New: key resolution (`^os-`, user `^id`, `_n:`, tree path, root), cascade, variants, bad YAML, look, shapes, colours, `buildGraph` |
| `src/graph3d/model.ts` | `GraphNode.style`; `BuildOptions.globalClasses`; styles resolved in pass 1 |
| `src/styles.ts` | `lookupVariantStyle` accepts `Pick<LayoutNode, "source">` |
| `src/views/Graph3DPlates.ts` | Instance attributes `aFill`, `aShape` (stroke, corner), glyph `aInk`; `PlateSource.look`; parsed style colour cache |
| `src/views/Graph3DNear.ts` | `NearSource.look`; `paint()` (fill, outline, corners, text colour); style corners in the editor plate and occlusion holes |
| `src/views/Graph3DScene.ts` | `EngineNode.look`, set in `createNode`/`setData`; panels repainted after `setData` |
| `src/views/Graph3DView.ts` | Passes the global classes to `buildGraph` |

### Fixture
`e2e/fixtures/graph3d/Styled Mooring.md` → `vault/tests/graph3d/Styled Mooring.md`: fill + border + text colour (`^os-moor01`), a class with a 3 px border (`^chain-check`), pill (`^os-moor03`), rect without outline (`^os-moor04`), cloud falling back with width/branchLine (`^os-moor05`), a tree-path keyed text colour, and two unstyled lines.

### Not verified
Nothing was seen in Obsidian. Unit tests cover the resolution; the shader changes, the panel paint and the live reload after a 2D style write are untested by hand. Known gaps: transcluded content styled in its *host* note (2D's `_n:` key in the host's frontmatter) is not applied in 3D, which reads each line's styles from its own note; text font/size/weight/italic are not drawn.
