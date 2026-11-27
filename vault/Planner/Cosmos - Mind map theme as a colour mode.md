---
title: Cosmos - Mind map theme as a colour mode
summary: "T129. A new default 'Mind map style' colour-by mode draws each note's mind map theme (base + per-depth styles + baseStyle) in Cosmos, and a single-note scene uses the note's map background."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Cosmos - Every plate shape and dashed borders]]"
  - "[[Cosmos - Node text font size and weight]]"
  - "[[Cosmos - Branch line styles]]"
  - "[[Sidecar files - Mind map styles]]"
status: In-Review
batch: 17
priority:
progress:
date_created: 2026-11-27T01:00:00.000Z
date_modified: 2026-11-27T01:00:00.000Z
date_start_scheduled: 2026-11-27T08:33:12.000Z
date_start_actual: 2026-11-27T08:33:12.000Z
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
# Cosmos - Mind map theme as a colour mode (T129)

Part 1 of 4 of *Cosmos 1:1 with mind map styles* (T129–T132). Sawyer's ask is "providing 1:1 support for all mindmap styles (whole map and node settings) in Cosmos view."

## Settled at intake (2026-11-27)
- **Scope** for T129–T132: every *visual* style. Layout (direction, balance, side, spacing, collapse depth) stays Cosmos's own, through the Continent direction and Node spacing overlays.
- **The theme becomes a colour-by mode.** Add a *Mind map style* entry to the Overlays' *Colour by*, and make it the default. The existing modes (note, memory, tag, type) still override the fill when picked. A node's explicit style (Local, Class or Variant) always wins over both.
- **Map background:** use the note's background only when the scene shows a single note, or Planets is focused on one note. Otherwise keep the Obsidian background.

## Today
- `src/cosmos/node-style.ts` `noteStyleReader` (L47–68) runs the cascade with **the theme left out** (header L17–19). Only `baseStyle` feeds the weakest layer.
- Colour by:
  - `src/cosmos/overlays.ts` `ColorMode` L14 (`"note" | "memory" | "tag" | "type"`), default `colorBy: "note"` L69, and normalisation at L113.
  - `CosmosView.coloring` L627–636 calls `overlayNodeColor(node, mode, context)`, and `setColoring` lives in `CosmosScene.ts` L1042.
  - A style's `fill` already wins over the colour-by colour. Find where `NodeLook.fill` and the colour-by colour meet (`CosmosScene.ts`, grep `look.fill` / `colorOf`).
- How the mind map does it:
  - The theme is `mapSettings.theme` (per-note `osmosis-styles.theme`). The default theme means none (`MindMapView.ts` L8786–8792).
  - `getEffectiveTheme` (L2482–2493) merges `baseStyle` into `theme.base`.
  - Each node gets `resolveNodeStyle(effectiveTheme, depth, local, class, variant)` (`src/styles.ts` L416–437): theme base plus `theme.depths[depth]`.
  - Themes come from `getTheme(name, settings.customThemes)` (`src/themes.ts` L261).
- **Coloured branches:** `ThemeDefinition.coloredBranches` and `branchColors` exist, but the mind map **never draws them**. The only code reading them is the sidebar's colour palette (`src/color-palette.ts` L53). For a 1:1 match Cosmos does not draw them either. Say so in *What was implemented*, and do not build it.
- The scene background is `CosmosScene.setTheme` L982–990 (`backgroundColor`, plus the fog colour).

## Design
- `noteStyleReader` takes an optional `theme: ThemeDefinition | undefined`. When it is given, the theme layer is `resolveNodeStyle`'s theme part (base plus depth, with `baseStyle` merged in as `getEffectiveTheme` does). The depth must be the **same depth the mind map uses** for that node. Check what `nodeDepth` is in `MindMapView` around L9180–9195 (heading level or tree depth) and reproduce it from the `OsmosisNode` tree.
- Pass the theme **only in Mind map style mode**. In the other modes, behaviour is exactly as today: the theme is left out and the colour-by colour fills nodes with no fill of their own.
- In Mind map style mode, a node with no fill at all (unthemed note, no style) uses today's plate colour, the Obsidian theme, as the mind map does.
- The theme also supplies text colour, border, shape and branch line (`theme.branchLine`) through the cascade. Whatever T130–T132 draw follows it automatically. T129 needs only the fill, text and border colours to look right, because those are already drawn.
- **Default for existing users:** `DEFAULT_OVERLAYS.colorBy` becomes `"style"` (pick a name). A saved `colorBy` is respected, so Sawyer may need to pick it once; say so in the test steps.
- **Background:** when the model holds one note (or Planets has a focused note), and that note's theme or `osmosis-styles.background` gives a background, `setTheme` uses it, fog included. Otherwise use the Obsidian background. The precedence is the mind map's: grep `background` in `MindMapView` around L9532.
- Re-colour when a note's `osmosis-styles` or `theme` changes. The existing `styleFrontmatter` invalidation is at `CosmosView` L516. If T127 has landed, styles may be in a sidecar, so read through `NoteData` if `plugin.noteData` exists.

## Context budget (~85k)
- `src/cosmos/node-style.ts`: the whole file (166 lines), plus `node-style.test.ts` skimmed.
- `src/cosmos/overlays.ts` L1–135, plus `settings-sections.ts` (the Overlays UI list).
- `src/cosmos/appearance.ts` L40–80 (`nodeColor`), and grep `overlayNodeColor`.
- `src/views/CosmosView.ts`: L505–550, L590–640, L2030–2060, L2600–2615.
- `src/views/CosmosScene.ts`: L440–500, L975–1060.
- `src/styles.ts` L110–165 and L364–437. `src/themes.ts` L1–60 and L255–288.
- `src/views/MindMapView.ts` (`grep -a`): L2482–2493, L8784–8793, L9180–9200, and around L9532 (background). **Only these.**

## Acceptance criteria
- Overlays → Colour by has *Mind map style*, and it is the default for new settings.
- In that mode, a note themed (for example) Nord in the mind map shows the same fills, text colours and borders per depth in Cosmos. `baseStyle` and per-node styles stack on top as in the mind map.
- Other colour modes look exactly as before.
- A single-note scene with a themed or background note uses that background. A multi-note scene does not.
- Coloured branches are not drawn, matching the mind map, and that is documented.
- Unit tests: `noteStyleReader` with a theme (base, depth override, local wins, baseStyle merge), and the overlays normalisation for the new mode.
- lint, test and build pass.

## Test plan
1. Pick a note, set its mind map theme to Nord, and give one node a fill.
2. Open Cosmos on it. Overlays → Colour by → Mind map style. The depths match the mind map's colours, and the styled node keeps its fill.
3. Switch to Tag, then back: tag colours, then theme colours again.
4. Set the map background in the mind map's properties. A single-note Cosmos shows it, and opening a multi-note scene drops it.
5. Run the vault-wide Cosmos: unthemed notes look as before.

## Batch implementation notes (awaiting manual test)

Code commit: c4d7368 on `batch/17-sidecars-cosmos-styles`.

### Approach
- Styles are baked into the model: `buildGraph` puts each node's resolved style on `GraphNode.style`. So the theme joins the cascade there. `BuildOptions.themes` is a `ThemeLookup` (`(name) => getTheme(name, settings.customThemes)`), and `CosmosView.reload` passes it **only when `colorBy === "style"`**. Without a lookup, `noteStyleReader` behaves exactly as before.
- `noteStyleReader(fm, root, globalClasses, themes?)`: with a lookup, `noteTheme(fm, themes)` reproduces `MindMapView.getEffectiveTheme`. It takes the theme that `osmosis-styles.theme` names (none for Default or an unknown name) and merges `baseStyle` into a copy of its base. Each node then gets `resolveNodeStyle(theme, depth, local, class, variant)`. The depth is the mind map's: a heading's level, and `undefined` (the base only) for every other line and for the file-name root (`MindMapView` `renderNode`, `node.source.type === "heading" ? depth : undefined`).
- The outline and edge colour (the colour-by colour) in Mind map style is the note hue, the same as Note mode. An unthemed note therefore looks exactly as it did under the old default.
- Turning Mind map style on or off rebuilds the model (`applyControlSettings` compares `modelThemed`, then `reload()`). This is a plain reload, not a re-settle, so nothing moves.
- Background: after a themed build, `soleNotePath(model.nodes)` checks whether every note and line plate belongs to one note. If so, `mapBackground(frontmatter, themes)` applies the mind map's precedence (`osmosis-styles.background`, then the theme's `background`, `cssColor`-checked). `setSceneBackground` stores it, and `readTheme()` substitutes it, so `scene.setTheme` recolours the WebGL background, the fog and the plates' fade colour (`uBackground`). It only calls `setTheme` when the colour changes.
- Re-colouring on a note's style or theme change needed nothing new. A note edit fires `resolve`, and a sidecar change fires `noteData.onChange`, and both already reload. Both read styles through the merged sidecar frontmatter (`readNote`).
- `getActiveTheme()` (the Node tab's theme defaults) now returns the primary selected line's note theme in Mind map style mode, as the mind map's sidebar shows its theme. In other modes it still returns none.

### Decisions
- **Mode value `"style"`, label "Mind map style"**, listed first in Color by. `DEFAULT_OVERLAYS.colorBy` is `"style"`. A saved `colorBy` is respected, so if Sawyer's data.json already saved `"note"`, they have to pick Mind map style once.
- **Background only in Mind map style mode.** The acceptance criteria say other modes look exactly as before, so Tag, Note and the others keep Obsidian's background, even for a single note.
- **"Planets focused on one note" is read as "the scene holds one note".** That means note and line plates from one path; tag, attachment and ghost plates don't count. I found no separate "focused planet" state in the scene, so in Planets with several notes loaded the background stays Obsidian's. If Sawyer means the camera sitting on one planet, that is a follow-up.
- **Coloured branches are not drawn.** `ThemeDefinition.coloredBranches` and `branchColors` are read only by the sidebar colour palette (`src/color-palette.ts`); the mind map never draws them. For a 1:1 match Cosmos doesn't either, and `docs/mind-mapping/cosmos.md` says so.
- **`getEffectiveTheme` is duplicated, not shared.** `noteTheme` is a pure copy of the mind map's private method. Leaving `MindMapView` untouched kept the change surgical. If the two drift, move the mind map onto `noteTheme`.
- Map-level theme fields that are not in the cascade (`topicShape`, `branchLine`, `maxNodeWidth`, and the map's `branchLine*` overrides) are **not** applied here. They belong to T130 and T132 (see Facts below).

### Facts for T130–T132
- Per-node resolution lives in `src/cosmos/node-style.ts` `noteStyleReader`, which is called from `buildGraph` (`src/cosmos/model.ts`). Theme base and depth fields (fill, border, text incl. `weight`/`size`, shape, `branchLine` when inside `base`/`depths`) arrive on `GraphNode.style` automatically in Mind map style mode. `nodeLook()` is where the scene reads them.
- In the mind map, the theme's **map-level** `topicShape` and `branchLine` are *not* part of the cascade. The shape is `resolvedStyle.shape ?? mapSettings.topicShape ?? activeTheme.topicShape ?? "rounded-rect"`, and the branch line uses `theme.branchLine` plus the `branchLine*` map settings. To draw those, use `noteTheme(fm, themes)` (exported) and `parseOsmosisStyleFrontmatter` for the map settings. Only do it when `themes` is passed (Mind map style mode).
- The theme only reaches the model in Mind map style mode, and `CosmosView.modelThemed` tracks that.

### Surface map
| File | Change |
|---|---|
| `src/cosmos/node-style.ts` | `ThemeLookup`; `noteStyleReader` takes `themes?` and resolves through `resolveNodeStyle`; new `noteTheme`, `mapBackground` |
| `src/cosmos/model.ts` | `BuildOptions.themes`, passed to `noteStyleReader` |
| `src/cosmos/overlays.ts` | `ColorMode` adds `"style"` (default); normalisation list; `overlayNodeColor` style → note hue; new `soleNotePath` |
| `src/views/CosmosOverlays.ts` | "Mind map style" dropdown entry |
| `src/views/CosmosView.ts` | theme lookup in `reload`, `modelThemed` reload on mode switch, single-note background (`setSceneBackground`, `readTheme`), `getActiveTheme` in style mode |
| `src/cosmos/node-style.test.ts`, `src/cosmos/overlays.test.ts` | theme base/depth, local wins, baseStyle merge, no-lookup/Default/unknown, `mapBackground`, `buildGraph` with themes; default/normalisation, `soleNotePath`, style colour |
| `docs/mind-mapping/cosmos.md`, `docs/changelog.md` | Color by row (incl. coloured branches not drawn); Unreleased entry |
| `e2e/fixtures/graph3d/Themed Harbour.md`, `Themed Galley.md` (+ `vault/tests/graph3d/` copies) | fixtures |

### Fixture
`vault/tests/graph3d/Themed Harbour.md` uses Nord with no own background (so Nord's `#2e3440` applies), H1 to H3 plus bullets, and one line ("Fuel dock") with its own red fill. It links to `Themed Galley` and `Sailing Basics`. `vault/tests/graph3d/Themed Galley.md` uses Ocean with its own `background: "#1b2b1b"` and a `baseStyle` fill, and has no H1 (the file-name root takes the base). Neither has cards, so there are no dates to back-date.

### Not verified
- Nothing was checked in Obsidian. I couldn't confirm whether `setTheme`'s plate re-measure, when the background changes, is noticeable on a large single note. It runs only when the background colour actually changes.
- Whether the sidebar's Node tab refreshes its theme defaults right after Color by changes (it re-reads on the next selection change).
- Custom-theme edits made in settings while Cosmos is open don't reload Cosmos. They show on the next reload (a hop, an edit or a mode switch).
