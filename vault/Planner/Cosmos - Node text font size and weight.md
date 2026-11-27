---
title: Cosmos - Node text font size and weight
summary: "T131. Cosmos draws a node's text font, size, weight, italic and alignment (and the map's max node width) as the mind map does, on the far-tier glyph atlas and the near-tier panels, with plates sized to match."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Cosmos - Mind map theme as a colour mode]]"
  - "[[Cosmos - Every plate shape and dashed borders]]"
  - "[[Cosmos - Branch line styles]]"
status: In-Review
batch: 17
priority:
progress:
date_created: 2026-11-27T01:00:00.000Z
date_modified: 2026-11-27T13:20:46.000Z
date_start_scheduled: 2026-11-27T08:55:26.000Z
date_start_actual: 2026-11-27T08:55:26.000Z
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
# Cosmos - Node text font size and weight (T131)

Part 3 of 4 of *Cosmos 1:1 with mind map styles* (T129–T132). The scope is in T129 ([[Cosmos - Mind map theme as a colour mode]]).

## Today
- `TextStyle` (`src/styles.ts` L44–51) has `font`, `size`, `weight`, `color`, `alignment` and `style` (italic). Cosmos honours only `color`.
- **Far tier:** one `GlyphAtlas` per scene font, drawn in white and tinted per glyph (`src/views/CosmosPlates.ts` L59–225). The atlas is built at `FONT_PX` 48 from the Obsidian theme font, `SceneTheme.font`.
- **Near tier:** CSS panels at `NEAR_FONT_PX` 16 (`src/views/CosmosNear.ts` L119). Styles are applied at L557–581.
- **Sizing:**
  - `sizeNode` (`CosmosScene.ts` L180–200) and `plateWidthEm` / `panelBoxEm` (`src/cosmos/near.ts` L299–340) size plates and panels in em.
  - `look.width` (the node's `width` style) already re-widths (L755–767).
  - Layout spacing reads the footprints (`flatSize` L971, `nodeFootprint` in `appearance.ts` L127).
- The map's `maxNodeWidth` (`osmosis-styles.maxNodeWidth` and the theme's) sets the wrap width in the mind map. Cosmos ignores it.
- How the mind map applies them: `MindMapView` around L9905–9915 (grep `text.font`, `text.size`, `fontWeight`, `fontStyle`, `textAnchor` / `alignment`), plus its measuring code (grep `measureText` or the text measurer it uses).

## Design
- **NodeLook** gets `text: { font?, sizeScale, weight?, italic, align }`. `sizeScale` is `text.size / the mind map's default font size`, so a 2× node in the mind map is a 2× node in Cosmos.
- **Plates scale with the text:** em sizes are multiplied by `sizeScale`, so bigger text means a bigger plate and footprint. Layout spacing then follows automatically, because it reads the footprints.
- **`maxNodeWidth`** caps the text wrap width in em, the same px-to-em conversion as `STYLE_PX_PER_EM` (`near.ts`) uses for `width`. An explicit node `width` still wins.
- **Far tier:** key the atlases by `font|weight|italic`, one atlas per variant that is actually used, created lazily. Each glyph instance points at its atlas page. Keep `FONT_PX` per atlas and scale the quads by `sizeScale`, so no new atlas is needed per size. Alignment shifts the line origins inside the plate's text box.
  - Watch the texture budget. Report the number of atlases on the Shapes and text fixture and on Sawyer's large vault if measurable.
  - A font that is not loaded falls back to the scene font. Use `document.fonts.check` before rasterising.
- **Near tier:** CSS `font-family`, `font-size` (as an em multiple of `NEAR_FONT_PX`), `font-weight`, `font-style` and `text-align` on the panel.
- Theme defaults come through T129's cascade when *Mind map style* mode passes a theme. With no theme, the defaults are today's.

## Context budget (~95k)
- `src/views/CosmosPlates.ts`: L1–225 and L380–744 (the glyph layout and instance writes). Skip the shaders except `GLYPH_VERTEX` L332–378.
- `src/cosmos/near.ts` L280–360, `src/views/CosmosNear.ts` L100–170 and L360–400 (`panelPx`), L540–600.
- `src/views/CosmosScene.ts`: L175–205, L745–770, L960–975, L1875–1910.
- `src/cosmos/node-style.ts` (whole), `src/cosmos/appearance.ts` L100–140.
- `src/views/MindMapView.ts` (`grep -a`): the text-style application near L9905–9915 and the measurer it calls. **Under 150 lines total.**

## Acceptance criteria
- A node with font, size, weight, italic or alignment set in the mind map shows the same in Cosmos, on both far plates and near panels.
- Bigger text gives a proportionally bigger plate, and neighbours are spaced by it in Organic, Flat and Planets.
- `maxNodeWidth` wraps text in Cosmos at the same width as the mind map, relative to the font size.
- An unknown font falls back without errors. The atlas count stays bounded to the variants used.
- No visible frame-time regression on a large vault.
- Unit tests: NodeLook text resolution (size scale, alignment and italic parsing), and the em scaling with `maxNodeWidth`.
- lint, test and build pass.

## Test plan
1. Use `vault/tests/graph3d/Shapes.md` from T130, extended by the worker (Ctrl+R after it is written): nodes in a serif font, at 2× size, bold, italic, and centre- or right-aligned, plus a map `maxNodeWidth`.
2. Open the mind map and Cosmos side by side. Text looks the same far and near, and big nodes have big plates.
3. Planets: big plates don't overlap their neighbours.
4. Open a large note: there is no stutter while orbiting.

## Batch implementation notes (awaiting manual test)

Code commit: `0e55996` on `batch/17-sidecars-cosmos-styles`.

### Approach
- **NodeLook.font** (`FontLook`: `family`, `scale`, `weight`, `italic`, `align`) is resolved in `src/cosmos/node-style.ts` by `fontLook`, from the cascaded `text` style, so theme weights in *Mind map style* mode arrive through T129's cascade with nothing extra. The design called the field `text`, but `NodeLook.text` was already the text colour, so it is `font`.
- **Size:** `textScale(style)` = `text.size / 13` (`MAP_FONT_PX`, the mind map's `.osmosis-node-content` size). Everything a node measures is in *its own* ems. Converting to the world multiplies by `emWorld × scale`, and converting to panel px multiplies by `NEAR_FONT_PX × scale`. So `shapeFor` passes `height × scale`, `sizeNode` and `flatSize` multiply their em by the scale (which feeds spacing in Organic, Flat and Planets), and the panel box's `font-size` is `16 × scale` px, which scales its em padding and widths with it.
- **Width styles** stay correct at any size: `styleWidthEm(px, scale)` and `styleWidthFromEm(em, scale)` convert px into the node's own ems. That applies to the panel rule, the drag preview minimum, and the width drag's write-back.
- **maxNodeWidth:** `noteMaxWidth(frontmatter)` → `GraphNode.maxWidth` (px) on every node of that note, set in `buildGraph`. In `panelWidthRule`, a `default` rule caps at `maxWidthEm(px, scale)` = (px − the mind map's 2×8 px padding) / (13 × scale) + panel padding, so text wraps at the mind map's content width relative to the font size. A node's own `width` still wins. `plateCapEm` cuts a line plate's single-line label at the same width.
- **Far tier, atlas faces:** the design had one atlas per variant. I did not build that. Each `font|weight|italic` variant is instead a *face* in the **one shared atlas**: the packer keys slots by `faceId\0char`, and each face has its own canvas font and advances. A variant therefore costs only the slots its characters take, never a new 1024² page (~5.6 MB each with mipmaps). The size is never part of a face, because the quads scale. Faces are created lazily and counted in the perf readout ("N face(s)").
- **Fallback:** a face's canvas font is `[italic] weight 48px "Family", <theme font list>`, so a font that is not installed falls through to the theme font by the CSS family list. A family the canvas *rejects* (unparseable) is detected (the font setter leaves the old value) and dropped. Family names are stripped of quotes, backslashes, `;` and braces (`fontFamily`). I did not use `document.fonts.check`. The family list covers the missing-font case without it, and `check()` returns true for unknown families anyway.
- **Alignment** on a single-line plate only shows when the plate is wider than its text (a `width` style or a code block's fit). `layoutPlate(…, align)` sits the text left or right within the padding. `justify` on a plate is left, as CSS puts a last line. Panels get CSS `text-align`, plus `font-family` (falling back to `var(--font-text)`), `font-weight` and `font-style` on the body.

### Decisions worth remembering
- **Outline and dashes don't scale with text size.** `PlateShape.em` and the panel's stroke and dash ems are divided by the scale, because the mind map's border is in px whatever the font size. The shape-cache key therefore includes the scale, so a 2× line plate never collides with a note-title plate of the same height.
- **The scale is relative to 13 px for every node, headings included.** The mind map's unstyled H1 is 20 px, but Cosmos draws headings at body size, so an explicit `text.size: 20` on an H1 makes it 1.54× in Cosmos. That matches the mind map's ratio to body text. Built-in themes set no sizes, only weights.
- **The scale is clamped to 0.25–8×**, so a stray `text.size` can't make a plate that swallows the scene.
- **Weight 400 is the default face**, and weights are clamped to 1–1000. Only numeric weights are read, as `TextStyle` types them.
- **maxNodeWidth is read from `osmosis-styles` only, in every colour mode.** The mind map reads only the frontmatter's value, never the theme's, and like the map's `topicShape` it isn't theme-gated. Without one, Cosmos keeps its own cap (20 em). The plugin's `defaultMaxNodeWidth` (230 px) is *not* applied, so unconfigured notes look as they did before.
- **New fixture instead of extending `Shapes.md`.** Adding a map `maxNodeWidth` to Shapes would have changed what T130's test shows.
- Note cores scale with their root's `text.size` too, from their own core height, and keep their 30 em cap. `maxNodeWidth` doesn't cut core titles.

### Surface map
| File | Change |
|---|---|
| `src/cosmos/node-style.ts` | `FontLook`, `DEFAULT_FONT`, `MAP_FONT_PX`, `textScale`, `fontLook`, `fontFamily`, `plateAlign`, `fontKey`, `noteMaxWidth`; `NodeLook.font` |
| `src/cosmos/model.ts` | `GraphNode.maxWidth`, set from `noteMaxWidth` in `buildGraph` |
| `src/cosmos/near.ts` | `STYLE_PX_PER_EM` = `MAP_FONT_PX`; `styleWidthEm` and `styleWidthFromEm` take a scale; `maxWidthEm`; `panelWidthRule` caps at maxNodeWidth; `plateCapEm` |
| `src/cosmos/plates.ts` | `PlateAlign`; `layoutPlate` align param; `shapeKey` font part |
| `src/views/CosmosPlates.ts` | `GlyphAtlas` faces in shared pages; `shape(…, font)`; queued shapes carry their face; `stats().faces`; em unscaled by text size |
| `src/views/CosmosScene.ts` | `shapeFor` scales height, passes font and the maxNodeWidth cap; `sizeNode` and `flatSize` scale em; re-lay check includes face, scale and maxWidth; width drag converts at the node's scale |
| `src/views/CosmosNear.ts` | panel and editor font-size × scale; family, weight, italic and align on the body; stroke and dash unscaled; explicit max-width under maxNodeWidth |
| `src/views/CosmosPerf.ts` | face count in the atlas line |
| tests | `node-style.test.ts`, `near.test.ts`, `plates.test.ts`, `CosmosPlates.test.ts` (canvas stub now rejects unparseable fonts) |

### Fixture
`vault/tests/graph3d/Text Styles.md` (master `e2e/fixtures/graph3d/Text Styles.md`, "Galley Type"). The map sets `maxNodeWidth: 200`. It has one line each for: a serif face, 2×, bold, italic, centred and right-aligned at 300 px, everything at once, a missing font, a 3× ellipse, and a long unstyled line that wraps. It has no cards, so there is nothing to back-date.

### Not verified
- Nothing has been run in Obsidian or on a GPU. No shaders changed.
- Atlas face count and frame time were not measured on the fixture or on Sawyer's large vault. Read them from the perf gauge ("N face(s)"). The expected faces are 1 plus one per distinct family/weight/italic/alignment used, and a theme adds up to 3 weights (600/650/700).
- A web font that is still loading when a face is first rasterised would be drawn in the fallback and kept until the theme font changes. This was not handled.
- The mind map draws unstyled headings bigger and bolder by CSS. Cosmos still doesn't (out of scope: "with no theme, the defaults are today's").
