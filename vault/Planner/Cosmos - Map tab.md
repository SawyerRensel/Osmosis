---
title: Cosmos - Map tab
summary: "T140. The Cosmos sidebar's Settings tab becomes Map: the mind map Map tab's style sections first (Theme to Reset all, with the shared Layout), then Show, Edges, Camera, Look."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Map views - Layout dropdown in the style sidebar]]"
  - "[[3D Graph - Settings in the style sidebar]]"
status: In-Review
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
date_start_scheduled: 2026-11-28T08:56:47Z
date_start_actual: 2026-11-28T08:56:47Z
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
# Cosmos - Map tab (T140)

Carried over from batch 17. It follows T139 ([[Map views - Layout dropdown in the style sidebar]]), which built the shared Layout section.

## Settled at intake (don't re-ask)
- The Cosmos sidebar tab **"Settings"** is renamed **"Map"**, so the tabs are Map / Node (`PropertiesSidebarView.ts:447-453`).
- **Order:** the mind map Map tab's sections first: Theme (with add / save / rename / delete), Variant, **Layout** (the shared section from T139), Background, Default shape, Default fill, Default border, Default text, Branch line, Reset all styles. Then Cosmos's Show, Edges, Camera and Look (from `SETTINGS_SECTIONS`).
- **Layout in Cosmos always writes the focus note**, and its description names that note.
- **The style sections** (Theme to Reset all) edit the selected node's note, or the scene's single note (`soleNotePath`). With neither, they show "Select a node to style its note."
- The batch-17 rule "no Layout section in Cosmos" is replaced by the shared Layout section.
- Cosmos's Layout & spacing sliders now live under Layout, from T139. Don't duplicate them.

## Today
- The mind map Map tab is inline in `PropertiesSidebarView.renderMapTab` (~L515–768). Helpers: `renderMapStyleSection` ~L1587 (per-section reset ~L1668–1728), the renderers L1814–2250, and refresh ~L2358.
- The note is picked by `updateContext()` (L377–417): a followed Cosmos wins, otherwise the last active MindMapView. Writes go through `writeMapFrontMatter`: `mindMap.processStylesTracked` (undoable) when a mind map holds the note, else `noteData.process`.
- Cosmos uses `renderSettingsTab` (L496), which builds `CosmosSettingsPanel` (`CosmosOverlays.ts:116`) from `SETTINGS_SECTIONS`. Collapsed state is in `settings.graph3dSettingsCollapsed`.
- The likely shape: extract the map-tab sections into a function that takes a "target note" (path plus a write function), and call it from both tabs. Cosmos writes through `noteData.process` (no mind map is open). Check that Cosmos re-renders on a style change (it already does for Node tab edits; follow that path).

## Context budget (~90k)
- `src/views/PropertiesSidebarView.ts`: L370–560, L1580–1730, and skim L1814–2250 (renderer signatures, not bodies). Then L2350–2380.
- `src/views/CosmosOverlays.ts` L100–200; `src/cosmos/settings-sections.ts` (whole).
- How Cosmos picks up style edits: `grep -n "styles\|onStyles\|refreshStyles" src/views/CosmosView.ts | head -30`, then ±10 lines around the relevant ones.

## Acceptance criteria
- The Cosmos tabs read Map / Node. The Map tab's sections are in the order above, and the style sections look and behave as in the mind map Map tab.
- With a node selected, the style sections edit its note, and Cosmos redraws. With a single-note scene and nothing selected, they edit that note. Otherwise they show the hint.
- Layout writes the focus note, and its description names it.
- Show, Edges, Camera and Look work as before, with their collapsed state kept.
- The mind map Map tab is unchanged in behaviour. lint, test and build pass.

## Test plan
1. Cosmos on `vault/tests/graph3d/Branch Lines.md` → style sidebar. The tabs are Map / Node, and the Map tab order is as above.
2. Change the Theme, then Default fill: the plates change. Open the same note in the mind map: it carries the same styles.
3. Raise the link depth so the scene has several notes, and clear the selection: the hint shows. Select a node in a linked note: the sections now edit that note.
4. Layout's description names the focus note. Pick Planets: it applies.

## Batch implementation notes (awaiting manual test)

Code commit: `0be0cad` on `batch/18-one-map-layouts`.

**Approach.** The mind map Map tab's code reads and writes through the mind map (`getActiveMindMap()`: its in-memory `osmosis-styles` cache, `processStylesTracked`, `applyMapSettings`, the variant methods). Cosmos has no mind map of the note, so a small stand-in, `NoteMapStyles` (`src/views/note-map-styles.ts`), plays that role for one note. The sidebar now asks `getMapStyleTarget()` (the mind map, else Cosmos's `NoteMapStyles`) everywhere the Map tab's style code used `getActiveMindMap()`. `renderMapTab` is split into `renderMapThemeSections` (Theme, Variant), the mind map's Layout section, and `renderMapStyleSections` (Background to Reset all). Cosmos's `renderCosmosMapTab` stacks Theme/Variant, Cosmos's own Layout & spacing section (focus note), Background to Reset all, then Show / Edges / Camera / Look. `CosmosSettingsPanel` takes an optional `layoutEl`, so its Layout section is drawn in that slot rather than with the others.

**Decisions**
- **Cosmos's writes are undoable in Cosmos.** `CosmosView.processMapStyles` writes through `edits.processFrontMatter` (one undo step) and sets `lastEditPath`, so Ctrl+Z with nothing selected undoes the Map tab edit. The note's own text said `noteData.process`. I went with the tracked write, which matches the mind map's undoable writes.
- **Cosmos redraws by itself.** The write lands in the note (or its sidecar), and Cosmos's existing `resolve` / `noteData.onChange` listeners reload it. `NoteMapStyles.applyMapSettings` is a no-op.
- **The style target** is `CosmosView.styleNotePath()`: the primary selected note or line plate's note, else `soleNote`. `soleNote` is a new field set on every reload, and the sidebar is told (`notifySettings`) when it changes. The tab re-renders only when the target path changes, so selecting another line in the same note does not rebuild it.
- **A "Styles of *Note*" line** heads the style sections, because in a scene with several notes it is otherwise unclear which note they edit. The hint "Select a node to style its note." takes its place when there is no target.
- **"Save node style to variant" is hidden in Cosmos.** It keys styles by the mind map's node keys and selection. Variant create, rename, delete and the Active dropdown all work.
- **Extract/save theme in Cosmos** takes the theme, `baseStyle` and the map settings, but not per-node depth overrides. The mind map folds those in from its laid-out nodes, and Cosmos has none (`getNodeMap` is optional on `MapStyleTarget`).
- **External changes** (an undo, or the mind map editing the same note) re-render the style sections when the note's parsed `osmosis-styles` differs from what the tab holds. They are skipped while a colour picker is open, so a drag is not fought.
- **The variant mutations are duplicated** as pure functions in `note-map-styles.ts`, not shared with `MindMapView`. I left `MindMapView` untouched so the mind map's behaviour cannot change. Sharing them is a candidate cleanup.
- The panel's section is still named "Layout & spacing" (from T139), not "Layout".

| File | Change |
|---|---|
| `src/views/note-map-styles.ts` | New: `MapStyleTarget` interface, `NoteMapStyles` (one note's map styles for Cosmos), pure variant writes |
| `src/views/note-map-styles.test.ts` | New: 7 tests (cache before the metadata cache catches up, theme, variants) |
| `src/views/PropertiesSidebarView.ts` | Tab label "Map" for Cosmos. `getMapStyleTarget()`. `renderMapTab` split. `renderCosmosMapTab` + `showCosmosStyleNote` replace `renderSettingsTab`. Save-to-variant hidden without a mind map |
| `src/views/CosmosView.ts` | `styleNotePath()`, `processMapStyles()`, `soleNote` tracked per reload with a settings notification |
| `src/views/CosmosOverlays.ts` | `CosmosSettingsPanel` optional `layoutEl` for its Layout section |
| `styles.css` | `.osmosis-cosmos-style-note` padding |

**Fixture:** reused `vault/tests/graph3d/Branch Lines.md` (it links `[[Rigging]]`, so raising the depth gives a two-note scene).

**Not verified (no Obsidian here):** everything visual. In particular:
- that Cosmos redraws promptly after a Theme or Default fill change. Themes show only in the *Mind map style* colour mode, the default;
- that Background applies only in a single-note scene, as before;
- that the hint and target switch happen on selection and on a depth change;
- undo of a Map tab edit from Cosmos.
