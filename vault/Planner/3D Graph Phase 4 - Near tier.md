---
title: 3D Graph Phase 4 - Near tier
summary: "Live Obsidian DOM for the nearest nodes: MarkdownRenderer in CSS2D billboards, media lifecycle, budgets, hysteresis, and a matched DOM fade into the mist."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-10-31T12:00:00.000Z"
date_start_actual: "2026-10-31T12:00:00.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph Phase 3 - Streaming and stability]]"
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

- **Rendering:** `MarkdownRenderer.render()` into `CSS2DObject` billboards that face the camera. Reuse the mind map's rendered-HTML caching approach and its themes, shapes and per-node styles.
- **Budget:** the nearest nodes win (**Proposed:** 24 on desktop, 12 on mobile).
- **Tier selection:** pure logic in `src/graph3d/lod.ts`, with hysteresis at every boundary.
- **Media:** video and audio play only in the near tier, and pause when their node leaves it.
- **DOM fade:** a distance-based opacity fade tuned to match the WebGL fog, so the two read as one mist.

**Acceptance:**
- Callouts, code blocks, images, video and audio render live up close.
- Nothing flickers at tier boundaries.
- The node budget holds while flying through a dense area.
- Unit tests cover tier choice.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Built 2026-10-31 on `feature/3d-graph-near-tier` (cut from `feature/3d-graph-focus-dimming`), stacked on the unmerged plates, plate-spacing and focus-dimming branches. Commits: 99a958c (code), 2e1ea02 (fixture). Not pushed; no PR. Not manually tested, and nothing here has run in real Obsidian yet.

### Approach

- **Panels over plates, not instead of them.** The nearest line nodes and media-attachment nodes get their Markdown rendered by `MarkdownRenderer.render()` into a `CSS2DObject` panel. The plate stays underneath. 3d-force-graph takes the `CSS2DRenderer` through `extraRenderers` at construction, then sizes it and draws it after the canvas every frame.
- **Sized like the plate.** A panel is laid out at 16 px text and scaled each frame by its view depth (in `onBeforeRender`, using the camera of that render). The scale makes its text the same size on screen as the plate text under it: px per world unit = 16 / (`LINE_PLATE_HEIGHT` / `PLATE_HEIGHT_EM`). The panel's minimum size is the plate's, with the same corner radius and outline colour, so the plate never peeks out round it.
- **One mist.** A background-coloured veil over each panel has opacity `1 − plateVisibility(node.opacity, depth, focus, fog.density)`. That is exactly the plate shader's mix toward the background: arrival fade × (1 − focus dim) × FogExp2. `plateVisibility` is a new pure helper in `src/graph3d/focus.ts`, built on `focusDim`, so the maths isn't duplicated. The outline is an inset box-shadow, not a border, so the veil covers it too, as the plate shader dims the plate outline.
- **Entering and leaving the tier cross-fade** over 0.25 s. This is CSS opacity on the whole panel, so the plate shows through while it fades. A panel fades in only once its render has finished, so you never see an empty box.
- **Tier choice is pure** (`src/graph3d/lod.ts`, `chooseNear`): it runs every frame over the nodes whose screen scale passes a cheap pre-filter.
- **What a panel shows** is pure too (`src/graph3d/near.ts`, `nearMarkdown`). A line renders its `raw` source, dedented, so `## Heading` is a heading, `- item` a list item and `> [!tip]` a callout. A media attachment (image, audio, video) renders `![[path]]`. Note cores, tags, ghosts and non-media attachments keep only their plate.
- **Lifecycle.** Each panel renders into its own `Component`, which is unloaded when the panel is removed or re-rendered. Video and audio pause the moment their node leaves the tier, and pause when the view goes into the background. When the panel is removed they release their media (`src` removed, `load()`). The view's `destroy()` unloads every panel.
- **HTML cache**, as in the mind map: a panel's rendered body is cloned into a 64-entry LRU, keyed by note path + Markdown, when the panel leaves. A node that comes back is cloned rather than re-rendered. Bodies containing images, media, iframes or `.internal-embed` are never cached, because a clone carries neither their loading nor their players.

### Decisions (with reasons)

| Decision | Why |
|---|---|
| Distances are **screen scale**, not world units: enter at 0.6 (≈ 9.6 px text), leave below 0.45 (≈ 7 px) | The tier follows what you can read, whatever the viewport size, and whatever size the plate-aware spacing makes clusters. The old absolute numbers would have been wrong after the spacing change. Tune them in `lod.ts`. |
| Hysteresis on four boundaries | **Scale** 0.6 / 0.45. **Screen edge:** the centre must be on screen to enter, and can drift to 1.3× out before it leaves. **Visibility through the mist and dim:** 0.2 / 0.1. **Budget:** a member competes as if 15 % nearer (`NEAR_KEEP_BONUS`), so near-equidistant nodes don't trade places. |
| Budget **24 desktop / 12 mobile**, nearest win (by view depth) | The spec's proposed numbers. `Platform.isMobile`. Panels that are fading out don't count against the budget. |
| Embeds in lines become links (`unembed`): `![[Rigging]]` → `[[Rigging]]`, and `![[clip.mp4]]` → `[[clip.mp4]]` too | The spec: embedded content lives once, in its own node. Embedded files are already attachment nodes, and those render the media, so rendering a line's embed as well would show every image and play every clip twice. |
| Media is not autoplayed; you press play on the panel's own controls | "Play only in the near tier" is enforced by pausing on exit. Autoplaying with sound while flying felt wrong. Only `video`, `audio` and `iframe` take the pointer; the rest of the panel lets the pointer through to the canvas, so a drag over a panel still orbits and a click still hops (picked by plate). |
| Panels draw over all of the canvas | DOM can't depth-test against WebGL. Panels sort among themselves by distance (CSS2DRenderer's z-index), but a **note core or tag plate nearer than a panel is covered by it**. Known limitation; see below. |
| Not built: themes, shapes and per-node styles from the mind map | Those resolve from each note's `osmosis-style` frontmatter through `MindMapView` internals. Panels follow the Obsidian theme instead (`--background-secondary` fill, like the plates). Left for a follow-up. |
| Not built: video-platform links (YouTube/Vimeo → iframe) | `replaceVideoEmbeds` is a private `MindMapView` method. Extracting it is a separate change. Iframes are already allowed to take the pointer and are removed with their panel. |

### Surface map

| File | Change |
|---|---|
| `src/graph3d/lod.ts` (new) | `chooseNear` (budget + hysteresis), `panelScale`, tier constants |
| `src/graph3d/lod.test.ts` (new) | Tier choice: enter/stay at each boundary, behind camera, budget, keep bonus, a fly-through with no flicker |
| `src/graph3d/near.ts` (new) | `nearMarkdown` (what a panel renders), `unembed` |
| `src/graph3d/near.test.ts` (new) | Dedent, markers kept, embeds → links, media attachments, nodes with no panel |
| `src/graph3d/focus.ts` / `.test.ts` | `plateVisibility`: the plate shaders' fade as one pure function |
| `src/views/Graph3DNear.ts` (new) | CSS2DRenderer, panels, per-panel `Component`, scale/veil per render, cross-fade, media pause/release, HTML cache |
| `src/views/Graph3DScene.ts` | Builds `Graph3DNear` and passes its renderer through `extraRenderers`; `near.update(...)` each tick after the focus/mist easing; pauses media when hidden; destroys it |
| `src/views/Graph3DView.ts` | `renderMarkdown` option → `MarkdownRenderer.render(this.app, …)` |
| `styles.css` | `.osmosis-graph3d-near*`: the layer (own stacking context under the header), anchor, panel, veil, media pointer events |

### Fixture

`e2e/fixtures/graph3d/Sail Care.md` (→ `vault/tests/graph3d/`) contains:
- a heading
- a long paragraph
- a `[!warning]` callout
- a YAML code block
- a table
- `![[knot-diagram.svg]]`
- `![[ship-bell.mp3]]` (new, a 6 s generated tone)
- `![[wake-pattern.mp4]]` (new, a 6 s ffmpeg test pattern with a tone)
- a block-ref link
- a mid-line note embed

It links to Knots and Rigging. No existing note was edited.

### Couldn't verify (needs the manual test)

- Nothing has run in Obsidian. Lint, unit tests and build pass.
- Whether panel text visually matches the plate text size, and whether the veil reads as one mist with the plates (it should, by construction).
- Large scales up close: a panel near the camera can be scaled ×10 or more. Chrome re-rasterises it; this is unmeasured on mobile.
- Whether Obsidian's audio embed renders as `<audio>` through `MarkdownRenderer` outside a note (it should; the mind map relies on the same thing).
- The cost of 24 panels re-styled every frame. Expected to be small; unmeasured.

### Follow-ups (no task notes created yet)

- Mind-map themes and per-node styles on panels.
- YouTube/Vimeo iframes (extract `replaceVideoEmbeds`).
- Panels covering nearer core/tag plates: a possible fix is giving cores a panel too, or hiding a panel whose screen rectangle is behind a nearer core.
- Interactive panels (click links, tick checkboxes): this belongs to Phase 7 editing.
