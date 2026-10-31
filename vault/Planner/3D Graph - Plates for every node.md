---
title: 3D Graph - Plates for every node
summary: Draw every node in the 3D graph as a label plate, at any distance, by building plates from one shared glyph atlas instead of a canvas texture each. Spheres and the plate cap go away.
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 3 - Streaming and stability]]"
  - "[[3D Graph - Focus dimming]]"
  - "[[3D Graph - Plate-aware spacing]]"
  - "[[3D Graph Phase 4 - Near tier]]"
status: To-Do
priority:
progress:
date_created: "2026-10-31T11:19:43.000Z"
date_modified: "2026-10-31T11:19:43.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph Phase 3 - Streaming and stability]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

Part of [[Develop Mind-Map Graph View]]. Read that note's `# Spec` first, especially "Detail tiers". This task changes the far and middle tiers: **every node is a plate, at every distance.** Nothing is drawn as a sphere.

### State of the tree when this was written

Phase 3 (`feature/3d-graph-view-phase-3`) ships label plates as **one `Sprite` per node, each with its own canvas texture** (`plateSprite()` in `src/views/Graph3DScene.ts`):
- The fill is `--background-secondary`, the outline is in the node colour, and the font is `--font-interface`, read through the `.osmosis-graph3d-probe` theme probe.
- Note titles always get a plate. Line plates are capped by `LABEL_BUDGET` (`enter`/`exit` = `Infinity`, `max` 150 desktop / 60 mobile). The nearest nodes win, in any direction, including nodes behind the camera.
- Decluttering was removed on Sawyer's request: plates never give way, and the nearer one simply covers the farther one.
- A sphere shrinks away under its plate as the plate fades in (`labelAlpha`).

### Why the per-plate textures can't do this (measured)

Perf readout on Sawyer's vault, depth 2, 2026-10-31:
- **199 plates ≈ 128–151 MB GPU, about 0.7 MB each.**
- **201 draw calls** in a wide view (one per sprite).
- At that rate the stress web's ~27k nodes would need about 19 GB. Even drawing each plate small into a shared texture (the old "sprite atlas" plan) is about 1 GB.
- Because of the cap, close nodes in view are often still spheres. The cap is spent on nodes behind or beside the camera.

### The design: plates built from a shared glyph atlas

- **Glyph atlas:** each character the loaded area uses is drawn once with the theme font into a shared texture (`CanvasTexture`), growing by pages as new characters appear. Store each glyph's advance, measured with `measureText`. Rasterise at a size that stays sharp at the largest plates in Sawyer's close-up screenshot (start at about 64 px cells, with mipmaps).
- **Plate backgrounds:** one `InstancedMesh` of camera-facing quads. Per instance: centre, width, height and outline colour. The rounded rectangle and its outline are drawn in the fragment shader from a signed distance, so no texture is needed.
- **Glyphs:** one `InstancedMesh` of camera-facing quads. Per instance: plate centre, offset within the plate, the glyph's atlas UV rect, and size.
- **Opaque, with the depth buffer:** both meshes are opaque, use `depthWrite: true`, and discard pixels outside the shape. Overlapping plates are then ordered by depth with no per-instance sorting. Glyphs sit a hair toward the camera (or use polygon offset) so they don't fight their own plate for depth.
- **Fading:** opaque plates can't fade with alpha. Arrival, departure and fog are a mix toward the background colour. A plate therefore covers what's behind it for the whole of its ~0.5 s arrival. **Sawyer accepted this for the test.**
- **No kerning or ligatures:** glyphs are placed by their measured widths. **Sawyer accepted this for the test.** If it reads badly, measure per-pair kerning with `measureText` on character pairs next.
- **Spheres go:** remove the sphere layers (`solid`/`fading`), `labelAlpha`'s sphere shrink, `LABEL_BUDGET`, `chooseLabelled` (and its tests in `src/graph3d/lod.test.ts`), the label creation throttle (`LABELS_PER_PASS`), `three-spritetext` leftovers, and `plateSprite()`.
- **Picking:** `pickNode` in `src/graph3d/depth.ts` already hits `ScreenNode.plate` rects. Every node now has one, and the `radius` hit path goes.
- **Pure logic goes in `src/graph3d/`** (Vitest can't import `obsidian`): plate layout (text → glyph offsets and plate size) and atlas slot packing. Write them test-first.

### Formatted content: what this does and doesn't cover

Glyph plates draw **runs of text**, which is everything plates show today. They can be extended to:
- bold, italic and code, as extra font variants in the atlas, coloured per glyph;
- an icon per plate (callout type, task checkbox, Lucide icons), drawn into the atlas like a glyph;
- plate shape and colour by node type (a callout plate in its callout colour).

They **can't** draw tables, images, math, embeds or a callout's full body. Those are [[3D Graph Phase 4 - Near tier]]: live `MarkdownRenderer` DOM for the nearest ~24 nodes, layered over the plate. So the glyph plate is the scalable representation for every node, and rich content is a near-tier upgrade for a few. Out of scope here; listed so the atlas doesn't paint itself into a corner.

### Open questions

- Atlas cell size vs sharpness up close. Measure the largest on-screen plate in a close-up and choose the cell size from that.
- Per-glyph instance count on the stress web (~27k plates × ~25 characters ≈ 700k instances, about 20–30 MB of instance data). Check the frame time; if it's too slow, truncate far plates' text harder.
- Should edges stop at the plate's edge rather than its centre? Not needed for the test.

## What problem does this solve?

Sawyer wants to see every node as a readable plate and orbit or pan to look behind, rather than a mix of spheres and plates. With per-plate textures this is impossible at vault scale, and the cap leaves close nodes as spheres.

## What's your current workaround?

Zoom in until the nearest 150 nodes become plates.

## Test plan

- **Unit (test-first):** plate layout (advances, truncation, plate size from text), atlas packing (slots don't overlap, a new page when one is full, a character is reused, not redrawn).
- **Measure** with the temporary perf readout (`src/views/Graph3DPerf.ts`) on the stress web (`e2e/generate-graph3d-stress.mjs`, depth 2) and on Sawyer's vault: GPU memory, draw calls, frame time, and the time to plate a freshly loaded area. Compare against the figures above.
- **Manual (Sawyer):**
  - Sailing web and stress web: no node is a sphere at any distance.
  - Overlapping plates: the nearer covers the farther, with no flicker while orbiting.
  - Clicking a plate hops to it.
  - Theme switch redraws plates in the new colours and font.

## Conventions

- lint → test → build → manual-test instructions → stop for Sawyer before committing.
- Branch `feature/3d-graph-plates…` cut from `feature/3d-graph-view` once Phase 3 merges. Commit code by path; task notes get their own commit.
- Remove the perf readout before the PR, unless a later task still needs it.
