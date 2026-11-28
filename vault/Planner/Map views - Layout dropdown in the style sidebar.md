---
title: Map views - Layout dropdown in the style sidebar
summary: "T139. One shared Layout dropdown (Mindmap / Organic / Planets) in the style sidebar replaces the mind map's 'Map layout: Classic'; under it the Mindmap or the Cosmos spacing controls show."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Map views - Layout per note replaces 2D-3D]]"
  - "[[Cosmos - Map tab]]"
status: In-Review
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
date_start_scheduled: 2026-11-28T08:50:47.000Z
date_start_actual: 2026-11-28T08:50:47.000Z
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
# Map views - Layout dropdown in the style sidebar (T139)

Follows T138 ([[Map views - Layout per note replaces 2D-3D]]). Read T138's *What was implemented* (or its implementation notes) and its ADR first. They give you the storage key and the `setNoteLayout` entry point.

## Settled at intake (don't re-ask)
- The mind map Map tab's **"Map layout: Classic"** dropdown (`renderLayoutSection`, `PropertiesSidebarView.ts:1814`) is replaced by the shared **Layout** dropdown: Mindmap / Organic / Planets.
- Under it, the controls follow the chosen layout:
  - **Mindmap:** Direction, Side, Balance, Default collapse depth, H/V spacing. These stay per note, as today.
  - **Organic / Planets:** Cosmos's Layout & spacing sliders (`SETTINGS_SECTIONS` "Layout & spacing", `src/cosmos/settings-sections.ts`; rendered by `CosmosSettingsPanel`, `src/views/CosmosOverlays.ts:116`). They stay per vault.
- Changing it calls T138's `setNoteLayout`, so picking Organic in the mind map sidebar swaps that tab to Cosmos.
- Build it as **one reusable section** (a function in its own module, or in `PropertiesSidebarView` if that is simpler). T140 places it in the Cosmos Map tab and makes it always write the focus note there. In this ticket, the Cosmos Settings tab's Layout & spacing section also uses the shared dropdown (it replaces T138's stopgap select). T140 then moves it.
- The section's description names the note it writes ("Layout of *Note name*").

## Context budget (~75k)
- `src/views/PropertiesSidebarView.ts`: L370–460 (`updateContext`, tabs), L496–520 (`renderSettingsTab`), L1580–1600, L1810–1900 (`renderLayoutSection` and its neighbours), and the refresh logic ~L2350–2380.
- `src/views/CosmosOverlays.ts` L100–200; `src/cosmos/settings-sections.ts` (whole).
- `src/views/sidebar-setting.ts` (whole).
- T138's diff: `git log --oneline --grep T138` and `git show --stat`, then only the parts you need.

## Acceptance criteria
- Both sidebars show the same Layout dropdown with three options. The value is the note's own layout, or the Default layout when the note has none.
- Mindmap shows the Mindmap controls; Organic and Planets show the Cosmos spacing sliders. Switching re-renders the section without a reload.
- Picking a layout swaps the tab's engine (via T138) and the sidebar follows the new view.
- "Map layout: Classic" is gone. lint, test and build pass.

## Test plan
1. Mind map on any note → style sidebar → Map tab → Layout = Mindmap, with Direction, Side, Balance and the spacing controls below it.
2. Pick Organic: the tab becomes Cosmos, the sidebar now shows Cosmos's tabs, and its layout dropdown reads Organic with the Cosmos spacing sliders.
3. Pick Planets, then Mindmap: each one applies, and the note keeps it after a reload.

## Batch implementation notes (awaiting manual test)

Code commit: `f266b68` on `batch/18-one-map-layouts`.

**Approach.** One shared section, `renderLayoutSection(body, target, renderControls)` in `src/views/layout-section.ts`. It draws the Layout dropdown (Mindmap / Organic / Planets, from `NOTE_LAYOUTS`) with the description "Layout of *Note name*". Below the dropdown is a container that `renderControls(el, layout)` fills. The section fills it once at the start and again after every pick, before the write. `target` is `{ path, layout, setLayout }`: the note it shows and writes, that note's effective layout (`plugin.noteLayoutOf`), and the save call (`plugin.setNoteLayout`). The function returns a `(layout) => void` updater for layouts changed elsewhere.
- **Mind map Map tab:** the Layout section calls it for `currentFilePath`. Under Mindmap it draws the old controls (Direction, Balance, Side, Default collapse depth, H/V spacing), now in `renderMindmapLayoutControls`. The "Map layout: Classic" row is gone, and so are its refresh lines and the `mapLayoutDropdown` field. `refreshMapStyleControls` calls the updater with `noteLayoutOf(path)`.
- **Cosmos Settings tab:** `CosmosSettingsPanel.build()` hands the "layout" section to the new `layoutSection()`. That method calls the shared section for `source.layoutNote()` (the focus note) and puts the section's other controls (the spacing sliders, the continent controls, and so on) in its container. `controlShown` still hides the Planets-only ones. T138's stopgap dropdown (`case "layout"` in `control()`) is removed. When the view has no focus note, the panel shows the controls without a dropdown.

**Decisions**
- **Under Organic/Planets, the mind map Map tab shows a one-line hint ("Drawn in Cosmos, which has this layout's spacing settings.") instead of the Cosmos sliders.** Picking one swaps the leaf to Cosmos, and that sidebar does show the sliders, so the hint only shows for a moment. It would also show if a mind map is ever open on a Cosmos-layout note. Rendering the real sliders there would need a `CosmosSettingsSource` without a CosmosView. That is a larger refactor than the ticket needs.
- **In Cosmos, the sliders stay under Mindmap too.** A Mindmap note opened in Cosmos anyway is drawn Organic (`cosmosLayout`), so its sliders still apply. After a Mindmap pick, they show only until the leaf swaps.
- **Cosmos now calls `notifySettings()` when the focus note changes (`setFocus`) or is renamed.** Before this, the panel rebuilt only when the layout changed, so after navigating to a note with the same layout the description would still name the old note. `refresh()` now also compares `layoutNote`.
- **The Layout section's reset (↺) does not clear the note's layout.** It resets the Mindmap controls as before. Clearing the layout could swap the leaf, which a style reset shouldn't do.
- `SETTINGS_SECTIONS` still lists `"layout"` first, which keeps its test and the section order. `control()` now takes `Exclude<SettingsControl, "layout">`.
- `noteTitle(path)` (the file name without its folder or `.md`) is in pure `src/note-layout.ts` and is unit-tested.

| File | Change |
|---|---|
| `src/views/layout-section.ts` | New: the shared `renderLayoutSection` and the `LayoutTarget` interface |
| `src/views/PropertiesSidebarView.ts` | The Layout section uses the shared section. `renderLayoutSection` (the private one) became `renderMindmapLayoutControls` without the Map layout row. Removed `mapLayoutDropdown` and the `MapLayout` import. Refresh calls `showNoteLayout`. |
| `src/views/CosmosOverlays.ts` | `CosmosSettingsSource.layoutNote`. New `layoutSection()` uses the shared section. Removed the stopgap `case "layout"`. `refresh()` also compares the layout note. |
| `src/views/CosmosView.ts` | `settingsSource().layoutNote`. `notifySettings()` on focus change and on rename. |
| `src/note-layout.ts`, `src/note-layout.test.ts` | `noteTitle` and its tests |

**Fixture:** reused `vault/tests/graph3d/Branch Lines.md`, which has no `layout` key, so it starts on the Default layout. Any note works.

**Not verified:** nothing was tested in Obsidian (batch rule). Untested by hand: the brief hint during the swap; the description updating after navigating in Cosmos; and how the nested `.osmosis-layout-controls` div looks (the rows sit one level deeper than before, and no CSS targets direct children). Pre-existing and not changed: "Reset all styles" deletes the whole `osmosis-styles`, so it also clears the note's `layout` without swapping the view. The dropdown then reads the Default layout.
