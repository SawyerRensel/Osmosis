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
