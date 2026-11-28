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
status: To-Do
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
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
