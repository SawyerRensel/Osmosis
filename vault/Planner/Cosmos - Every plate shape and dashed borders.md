---
title: Cosmos - Every plate shape and dashed borders
summary: "T130. Cosmos plates draw every mind map topic shape (and the map's default shape) with dashed and dotted borders, on the far-tier SDF plates and the near-tier panels."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Cosmos - Mind map theme as a colour mode]]"
  - "[[Cosmos - Node text font size and weight]]"
  - "[[Cosmos - Branch line styles]]"
status: In-Review
batch: 17
priority:
progress:
date_created: 2026-11-27T01:00:00.000Z
date_modified: 2026-11-27T14:40:00.000Z
date_start_scheduled: 2026-11-27T08:40:03.000Z
date_start_actual: 2026-11-27T08:40:03.000Z
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
# Cosmos - Every plate shape and dashed borders (T130)

Part 2 of 4 of *Cosmos 1:1 with mind map styles* (T129–T132). The scope is in T129 ([[Cosmos - Mind map theme as a colour mode]]): every visual style, with layout left to Cosmos.

## Today
- `TopicShape` (`src/styles.ts` L25–39) lists every shape the mind map draws (`src/shapes.ts`; `buildNodeShapeMap` is at `MindMapView` L9314).
- Cosmos maps only rect, rounded-rect and pill to corner radii (`PLATE_CORNERS`, `src/cosmos/node-style.ts` L85–90). The rest fall back.
- `border.style` dashed/dotted is ignored (`nodeLook` L131–148). Only `none` is honoured.
- The map-level default `topicShape` (`osmosis-styles.topicShape`, and the theme's `topicShape`) is not read.
- **Far tier:** WebGL instanced quads with an SDF fragment shader (`src/views/CosmosPlates.ts` L291–331). The attributes are at L379, and the per-node look is written at L639–663.
- **Near tier:** live Markdown panels as CSS2D, or CSS3D in Planets (`src/views/CosmosNear.ts`). Corner, stroke, fill and text are applied at L557–581.
- `node.background` (`NodeStyle.background`, styles.ts L98): check what the mind map does with it (grep `\.background` in `MindMapView` near L9890–9915). Mirror it if it is a visual fill behind the shape, otherwise note why not.

## Design
- **NodeLook gets `shape: TopicShape`** (in place of, or as well as, `corner`) and `dash: "solid" | "dashed" | "dotted"`. The default shape follows the cascade: node, then the map's `topicShape`, then the theme's `topicShape` when T129's mode passes a theme, then `rounded-rect`.
- **Far tier:** add a shape id (and a dash id) to the instance attributes. In the fragment shader, give each shape an SDF: ellipse, diamond, hexagon, parallelogram, cloud-ish and the rest. Use the mind map's path geometry from `src/shapes.ts` as the reference for proportions. A shape with no exact SDF uses the closest polygon SDF; list those in *What was implemented*. Dashes run along the SDF perimeter, using the angle or the arc parameter, at a dash length in world units matched to the mind map's `stroke-dasharray`.
- **Near tier:** CSS `clip-path` with the same polygon or ellipse per shape, plus a border that follows it. CSS borders don't follow a clip-path, so draw the outline as an SVG background or a pseudo-element. Pick one and say why. Dashed and dotted use the matching CSS or SVG dash.
- **Hit-testing and plate footprint:** keep the bounding rectangle. Clicks inside the box but outside a diamond still select it, as they do today.
- Text stays inside the shape's inner box. If the mind map pads text differently per shape (grep `shapes.ts` for an inset), mirror the padding.

## Context budget (~90k)
- `src/shapes.ts` (the whole file if under 400 lines; otherwise the per-shape path builders).
- `src/cosmos/node-style.ts` (whole) and `src/cosmos/plates.ts` (`PLATE_RADIUS` and friends).
- `src/views/CosmosPlates.ts`: L1–135, L226–380, L600–700.
- `src/views/CosmosNear.ts`: L100–170, L540–600, plus its CSS in `styles.css` (grep `osmosis-cosmos-near` or similar).
- `src/views/CosmosScene.ts` `shapeFor` L1881 ±30 lines.
- `src/views/MindMapView.ts` (`grep -a`): L9310–9340 and L9885–9915 only.

## Acceptance criteria
- Every `TopicShape` the mind map offers is drawn recognisably in Cosmos, both far and near. Selection highlight and found highlight follow the shape.
- Dashed and dotted borders are drawn on both tiers, solid stays solid, and `none` draws no border.
- A map-level default shape applies to unstyled nodes of that note only.
- There is no frame-time regression on a large vault. Report the plate pass ms before and after if the perf stats overlay gives it (`src/perf-stats.ts`).
- Unit tests: `nodeLook` shape and dash resolution, and the default-shape cascade.
- lint, test and build pass.

## Test plan
1. The worker adds `vault/tests/graph3d/Shapes.md` (Ctrl+R after it is written): one node per shape, plus dashed and dotted borders, plus a map default shape.
2. Open it in the mind map and in Cosmos side by side. Zoom out (far plates) and in (near panels): the shapes and dashes match the mind map.
3. Select a diamond node: the highlight follows the shape.
4. Planets layout: the shapes render on the globe (CSS3D near tier).

## Batch implementation notes (awaiting manual test)

Code commit `1b8d5da` on `batch/17-sidecars-cosmos-styles`.

### Approach
- **`NodeLook` gains `shape` and `dash`.** `nodeLook` validates the shape (`isTopicShape`; unknown YAML falls back to rounded-rect) and reads `border.style` dashed/dotted. `corner` stays: it is still the radius for rect, rounded-rect and pill, and what occlusion holes and the inline editor use.
- **Default shape cascade** (`noteStyleReader`): a node's own resolved shape (Local, Class, Variant, then the theme's base/depth `shape` in *Mind map style* mode), then the note's `osmosis-styles.topicShape`, then rounded-rect. A note with only a `topicShape` now gets a style reader, so its unstyled nodes come back as `{ shape }`.
- **Sizes mirror the mind map's layout** (`shapeBox` in the new pure `src/cosmos/plate-shapes.ts`, the same formula as `assignSizes` in `layout.ts`): the plate is its text box inflated by `getShapeInsets`, a circle is a square from the content's diagonal, and a triangle's or arrow's text moves off-centre into its inner box (`PlateShape.textX`). A diamond plate is twice the size of the same rounded plate, as in the mind map. `panelBoxEm` inflates the same way, so spacing and the panel estimate account for it.
- **Far tier** (`CosmosPlates.ts`): `aShape` is now a vec4 (stroke, corner, shape id, dash id) plus `aEm` (world units per em of the plate's text). The fragment shader picks an SDF by id:
  - rect, rounded-rect, pill: the rounded box, as before.
  - ellipse: Quilez's approximate ellipse distance. Circle: an exact circle.
  - diamond, hexagon, octagon, triangle, parallelogram, trapezoid, arrow-right: an exact polygon SDF over the mind map's own vertices (`shapes.ts` proportions), up to eight corners.
  - **cloud: approximated** as four overlapping ellipses, one per quadrant. The notches are a little deeper than the mind map's Bézier cloud, and it stays inside the plate's box, where the mind map's bulges about 5% past the top and bottom.
  - underline: the box for coverage, with the outline on the bottom edge only. none: a box with no outline unless the style gives a border colour, as the mind map's stylesheet draws it.
  - **Dashes** run along an arc length: the polygon's own perimeter for polygons and rectangles, the angle × radius for a circle, and an inscribed octagon's perimeter for ellipse and cloud. They use the mind map's `stroke-dasharray` (dashed `4 2`, dotted `1 2` px at 16 px text) in ems of text. Dashes finer than about two pixels blend to their share of the line, so far plates don't shimmer. There is one irregular dash where the perimeter starts, as SVG has.
  - The outline thickness is now `em × PLATE_STROKE_EM × stroke`. That is identical for unshaped plates, and keeps a diamond's border as thin as a rounded plate's.
- **Near tier** (`CosmosNear.ts`): any panel that is not a solid rectangle gets an SVG `<path>` (`shapePath`, the mind map's geometry) under its text. Shapes also clip the panel box with `clip-path: path(...)`, so the text, veil and fill all follow the outline. Their padding is the stylesheet's plus the shape's insets of the estimated box (`shapedPanelPadEm`), and their text is centred vertically.

### Decisions worth remembering
- **SVG outline, not a pseudo-element.** A CSS border or the inset shadow can't follow a clip-path or take a dash pattern; an SVG stroke can, with the mind map's own dasharray. The stroke is drawn twice as wide and its outer half is clipped, so it sits inside the box as the inset shadow did. Selection, find and link-target recolour the path through CSS (`.is-selected > .osmosis-cosmos-near-shape > path`), solid and 2 px, as the mind map's do.
- **The theme's `topicShape` is not read.** The ticket asked for it, but the mind map never reaches it: `DEFAULT_MAP_SETTINGS.topicShape` is `rounded-rect`, so `mapSettings.topicShape` is always set. Picking a theme in the sidebar writes the theme's shape into `osmosis-styles.topicShape`, which Cosmos does read. Reading the theme's own value would make Cosmos differ from the mind map. If Sawyer wants it anyway, it is one line in `noteStyleReader`.
- **The map's `topicShape` applies in every colour mode**, like `baseStyle`. It is a map setting, not a theme colour.
- **underline and none are filled with the scene background, not left transparent.** Plates aren't hidden under their panels, so a transparent panel would show the plate's glyphs doubled under the panel text, and a transparent far plate would leave the text with nothing behind it (the old reason these shapes fell back). Both tiers draw the background colour, so they read as "no plate" on empty space. A `none` node whose style sets a fill shows that fill, as the inline style does in the mind map.
- **The selection and find borders are solid** even on a dashed node, and follow the shape.
- **Hit-testing, picks, spacing and occlusion holes keep the bounding box**, as the ticket said. A nearer diamond cuts a rounded-box hole out of a farther panel, so the farther plate's colour shows in the diamond's empty corners.
- **`NodeStyle.background` is not drawn.** The mind map never renders it: it only appears in the colour palette's swatch collection (`color-palette.ts`) and in the style merge. The map-level background is T129's.

### Surface map
| File | Change |
|---|---|
| `src/cosmos/plate-shapes.ts` (new) | Shape and dash ids, dash lengths, `isTopicShape`, `isRectShape`, `isBareShape`, `shapeBox` (mind map sizing), `shapePath` (SVG geometry) |
| `src/cosmos/plate-shapes.test.ts` (new) | Ids cover every `TopicShape`, sizing, paths |
| `src/cosmos/node-style.ts` | `NodeLook.shape`/`dash`; the `none` shape has no outline without a colour; map `topicShape` default in `noteStyleReader` |
| `src/cosmos/node-style.test.ts` | Shape/dash resolution, the default-shape cascade |
| `src/cosmos/near.ts` | `panelBoxEm` inflates by shape; `shapedPanelPadEm` |
| `src/cosmos/near.test.ts` | Inflation and padding tests |
| `src/cosmos/plates.ts` | `shapeKey` includes the shape |
| `src/views/CosmosPlates.ts` | `PlateShape.em`/`textX`; `shape(..., topicShape)`; `aShape` vec4 + `aEm`; shape SDFs and dashes in the fragment shader |
| `src/views/CosmosPlates.test.ts` | Shaped layout, glyph offset, attribute writes |
| `src/views/CosmosScene.ts` | `shapeFor` passes the node's shape; a shape change re-lays the plate |
| `src/views/CosmosNear.ts` | SVG outline, clip-path, shape padding, min sizes, bare fills |
| `styles.css` | `.osmosis-cosmos-near-shape`, `.is-outlined`, `.is-shaped` rules |

### Fixture
`vault/tests/graph3d/Shapes.md` (master copy `e2e/fixtures/graph3d/Shapes.md`). It sets the map default to `topicShape: octagon` and has one line per shape (15) under *Shapes* and nine border cases under *Borders*: dashed and dotted on rounded-rect, ellipse, diamond, cloud and underline, a 3 px solid rect, border none, and none with a border colour. Under *Map default* are two unstyled lines that should be octagons, plus a link to `Styled Mooring`, whose unstyled lines stay rounded. It has no cards, so nothing needs back-dating. **Reload Obsidian (Ctrl+R) before testing.**

### Not verified
- **The shader has not been compiled on a GPU.** Vitest can't run WebGL, and no GLSL validator is available here. If the plates vanish, or the console shows a three.js shader error, the fragment shader in `CosmosPlates.ts` (`SHAPE_GLSL` / `PLATE_FRAGMENT`) is the place to look.
- **No frame-time numbers.** The plate pass is measured in Obsidian's perf overlay, which I can't run. Cost by reading the code, not measured: unshaped plates take the old rounded-box path plus a few comparisons. Polygon plates loop over up to eight edges per fragment, and dashed plates on curved shapes loop over an octagon.
- **Multi-line shaped panels:** the padding comes from the estimated box (`panelBoxEm`), not the measured one, so a panel whose real text is much larger than the estimate can have text in a diamond's clipped corners.
- **The background of bare shapes** uses `var(--background-primary)` in the near tier. With T129's per-note map background in *Mind map style* mode, the panels behind underline and none nodes may not match the scene's background colour.
- **Planets (CSS3D) panels** take the same paint path, but I haven't seen them.

## Fix round 1 (awaiting manual test)

Code commit `2c837ac` on `batch/17-sidecars-cosmos-styles`. Sawyer's failure (near tier, text "block of statements required to perform specific task."): Ellipse and Cloud clipped their text at the right and bottom and showed two offset outlines. Hexagon, Parallelogram and Arrow right had far too much margin across. Pill was fine.

### Causes
- **Too much margin (hexagon, parallelogram, arrow right): established from the code, with numbers.** The mind map wraps a shaped node's text narrower than its max node width (`contentMaxWidth = maxNodeWidth × (1 − insets) − padding`, `MindMapView` ~L9276/L9393), so the shape comes out at the cap. Cosmos wrapped the text at the full 20 em cap and then grew the shape round it, so a long sentence in a hexagon was 35.7 em wide, with 8.3 em of margin each side and only a 1.6 em slant. The plate labels had the same problem.
- **Clipped text: established as a mechanism from the code, not observed.** A shaped panel's padding came from `panelBoxEm`, an estimate of its text at 0.5 em a character, not from the rendered text. Whenever the rendered text was larger than the estimate, it reached past the shape's inner box into the area the clip path cuts off. With nominal metrics, the old code keeps this sentence inside the ellipse, so whatever Sawyer's node rendered differed from the estimate (I can't see what it held).
- **Doubled outline: established as a mechanism, not observed.** Plates are drawn under their panels, so the panel's outline has to hold the plate's whole outline. The old panel only guaranteed a box at least as big as the plate's. That is enough for an ellipse, but not for shapes whose slant depends on the height (parallelogram, arrow right, trapezoid and triangle poke out by the height difference). The far cloud was also a different cloud (four ellipses reaching 8% from the sides, where the panel's Bézier cloud reaches 10.5%), so a cloud plate as wide as its panel shows past it at both sides. **I could not tie the ellipse's doubling to a specific line**: under nominal sizes its plate is fully inside its panel. Fitting the panel to the measured text and making it hold the plate removes every way the two outlines can disagree, but the ellipse case is the one to look at first.

### Fix
- **The panel is fitted round its measured text** (`CosmosNear.fitShape`, pure `fitShapedPanel` in `src/cosmos/plate-shapes.ts`). The body now gets its own width (`max-content`, capped where the mind map wraps in that shape), and a `ResizeObserver` on it sets the box's exact size and padding: the mind map's box round the content, with the insets as padding and the text centred in the inner box. The body's width never depends on the box's, so it settles in one pass and is never a frame behind.
- **The panel holds its plate.** `fitShapedPanel` grows the box until its outline holds the plate's (`shapeHolds`, a polygon test). It grows across first, which is what parallelograms and arrows need, and otherwise grows every way.
- **Shapes wrap where the mind map's do** (`shapeWrapEm`): the panel's text, the spacing estimate (`panelBoxEm`) and the far plate's label cut (`shapeFor`).
- **The cloud is one cloud.** The mind map's Bézier cloud bulges about 6.8% of its box past the top and bottom (`CLOUD_BULGE`). Cosmos now fits it into its box, bulges and all, and keeps the mind map's text box inside it. The far plate draws the same curve as a 24-point polygon (`CLOUD_POLYGON`, generated into the shader).

### Margins across, per side, in ems of text (that sentence, default caps)
| Shape | Before | After | Mind map |
|---|---|---|---|
| Ellipse, Cloud, Octagon | 4.69 | 3.40 | 3.27 |
| Hexagon | 8.26 | 4.80 | 4.51 |
| Parallelogram | 6.03 | 4.00 | 3.80 |
| Arrow right (left / right) | 5.40 / 8.73 | 3.40 / 5.40 | 3.27 / 5.04 |
| Diamond | 10.40 | 5.40 | 5.04 |
| Triangle (left / right) | 2.40 / 18.40 | 1.40 / 9.40 | 1.50 / 8.58 |
| Trapezoid | 3.56 | 2.80 | 2.74 |

The box is now 20 em wide (the cap) for all of them, against 26 to 40 em before. The mind map's is 230 px, which is 17.7 of its 13 px ems. The remaining gap is Cosmos's 20 em cap and 0.4 em padding against the mind map's 17.7 em and 8 px.

### Decisions worth remembering
- **The triangle's top and bottom insets are 0.275, not the mind map's 0.2.** The mind map's inner box reaches 55% of the way across, where the triangle is only the middle 45% of its height tall, so its top corners are outside the outline. In the mind map the text spills over the outline; in Cosmos it would be clipped. Triangles come out about a third taller than the mind map's.
- **The cloud's top and bottom insets are about 0.218**, the mind map's 0.18 measured from a box grown by the bulge. It is the same cloud with the same text box, drawn inside its box, because a plate is drawn on its box's quad and a panel clips to its box.
- **Rectangles keep their labels.** The plate-label cut only applies to non-rectangle shapes, so pill, rect and rounded-rect plates are unchanged (pill passed).
- **The trapezoid keeps the mind map's 0.12 insets**, though a wide three-line trapezoid's top text corners come within 0.02 em of its slope. That is below a pixel, inside a glyph's side bearing.
- **The panel grows across before it grows up** to hold a plate, so a parallelogram or an arrow over a flatter plate is wider by the height difference, not taller.

### Surface map
| File | Change |
|---|---|
| `src/cosmos/plate-shapes.ts` | `shapeInsets` (cloud bulge, triangle), `shapeWrapEm`, `outlinePoints`, `shapeHolds`/`shapeHoldsRect`, `fitShapedPanel`, `CLOUD_BULGE`/`CLOUD_POLYGON`; `shapePath` and the polygons share one geometry |
| `src/cosmos/plate-shapes.test.ts` | The text fits every shape (single line, wrapped), margins against the mind map's, plate containment, cloud geometry, wrap widths |
| `src/cosmos/near.ts` | `PANEL_PAD_EM` exported; `panelBoxEm` wraps at the shape's wrap; `shapedPanelPadEm` removed |
| `src/cosmos/near.test.ts` | The wrap test replaces the padding test |
| `src/views/CosmosNear.ts` | The body is observed; `fitShape` sizes and pads shaped boxes; `paint` gives the body its wrap width |
| `src/views/CosmosPlates.ts` | Cloud SDF = the shared polygon; the polygon buffer holds 24 points |
| `src/views/CosmosScene.ts` | `shapeFor` cuts a shaped plate's label at the shape's wrap |
| `styles.css` | Shaped panels centre their body across; the body doesn't flex |

### Fixture
Unchanged: `vault/tests/graph3d/Shapes.md`. Its lines are short, so to repeat Sawyer's case, give a shaped line a long sentence (or test in the note Sawyer used).

### Not verified
- **Nothing was seen in Obsidian**, and the shader is still not GPU-compiled. The cloud branch now writes 24 polygon points, and the loop runs to 24.
- **The ellipse's doubling isn't tied to a line of the old code** (see *Causes*).
- **Dragging a shaped panel's width** writes `styleWidthFromEm` of the outer width, but the mind map reads `width` as the content width inside the shape. A dragged shaped node is therefore wider in the mind map than in Cosmos. This predates this fix and is not changed.
- **The inline editor** on a shaped node still opens as the plate's rectangle.

