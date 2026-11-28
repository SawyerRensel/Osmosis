---
title: Map views - Layout per note replaces 2D-3D
summary: "T138. Layout (Mindmap / Organic / Planets) is saved per note with a vault-wide default; it replaces the 2D/3D pill, the lift-off animation and the per-device last map view."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Map views - Layout dropdown in the style sidebar]]"
  - "[[Cosmos - Remove Flat slices layout]]"
  - "[[3D Graph Phase 8 - 2D-3D toggle]]"
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
# Map views - Layout per note replaces 2D/3D (T138)

## Why
Today "2D or 3D" is a per-device toggle, and the Cosmos layout is a per-vault setting. Sawyer wants one choice that belongs to the note: **Layout = Mindmap / Organic / Planets**. The two engines remain an implementation detail.

## Settled at intake (don't re-ask)
- **No more 2D|3D pill** (`createViewSwitch`, `src/views/ViewHeader.ts:5`; remove it from `arrangeViewHeader`'s `SHARED_HEADER`). The two engines stay: `MindMapView` (`osmosis-mindmap`) for Mindmap, and `CosmosView` (`osmosis-cosmos`) for Organic and Planets, swapped in the same leaf by `plugin.swapLeafView` (`main.ts:1368`).
- **Saved per note** in its styles (`osmosis-styles`), so it follows NoteData to the sidecar or the note. A note without one uses a new vault-wide **"Default layout"** setting in Settings → Osmosis (default **Mindmap**). The default value is never written into notes: picking the default layout removes the key.
- **The Cosmos scene uses the focus note's layout.** With Follow active note on, moving to a note whose layout is Mindmap swaps the tab to the mind map. Likewise, a mind map that follows the active note (unpinned) swaps to Cosmos when the new note's layout is Organic or Planets. If the mind map has no follow behaviour, only the Cosmos direction applies; say so in your report.
- **Swapping engines has no animation.** Delete the lift-off / landing animation (`src/cosmos/liftoff.ts`, the liftOff / landing state in `CosmosView` (19 hits), `MindMapView` (8), `CosmosScene` (3), `cosmos/fit.ts`, `cosmos/history.ts` and their tests). **Keep** the undo history across the swap (`holdAcross`) and keep the focused node centred after the swap.
- **The note header brain button** opens the note in its own layout. Remove the per-device "last map view used": `src/last-map-view.ts`, its test, and `main.ts:32`, :1274, :1296-1301. `src/cosmos-legacy.test.ts:33/41` reference the storage key; keep whatever cleans up the old localStorage key, if anything does.
- **Cosmos's 3D spacing sliders stay per vault** (`settings.graph3dOverlays`). Only the layout choice moves to the note: remove `layout` from `graph3dOverlays` (`src/cosmos/overlays.ts`). The old per-vault value is **not** migrated into the Default layout setting: Sawyer chose Mindmap as the default.
- **The UI for picking a layout is T139** ([[Map views - Layout dropdown in the style sidebar]]). This ticket provides the model and one entry point that T139 calls, for example `plugin.setNoteLayout(path, layout)`. It writes the note's styles (undoable through `processStylesTracked` when a mind map holds the note) and swaps the engine when the engine changes. As a stopgap until T139, rewire Cosmos's existing Layout select (`src/cosmos/settings-sections.ts`, `src/views/CosmosOverlays.ts`) to call it for the focus note. Then nothing reads a dead setting between the tickets.
- **Storage key:** `mapLayout` exists (`src/styles.ts:176/205/216/308/707`, only `"classic"`, with `"radial"` allowed by the type). Choose between a new `layout` key and widening `mapLayout`, and record the choice and why in the ADR. Whichever you choose, the mind map's own Direction / Side / Balance stay as they are.
- **Docs:** update `GLOSSARY.md` (add **Layout**; T137 already dropped Flat). Write one ADR, `docs/adr/NNNN-layout-replaces-2d-3d-toggle.md` (create `docs/adr/` if it is missing; see `docs/agents/domain.md`), so the toggle isn't reintroduced. Update the user docs that mention 2D/3D (`grep -rni "2D/3D\|2D and 3D\|toggle to 3D\|switch to 3D" docs`).

## Context budget (~95k; tight, so read only these)
- `src/main.ts` L25–35, L1255–1310, L1360–1400; plus the settings tab spot for the new setting (`src/settings.ts`: the interface ~L190–240, the map-view settings section via `grep -n "addSetting\|new Setting" src/settings.ts`).
- `src/views/ViewHeader.ts` (whole); `src/view-header.ts` (whole).
- `src/views/MindMapView.ts` (`grep -a`): L295–305, L750–830 (`switchTo3D`), L2165–2200, and the `grep -an "liftOff\|landing"` hits ±10 lines.
- `src/views/CosmosView.ts`: L2500–2660 (`switchTo2D`, focus, follow, horizon), and the liftOff / landing hits ±10 lines.
- `src/cosmos/liftoff.ts` (exports only, to delete); `src/last-map-view.ts` (whole, 17 lines).
- `src/cosmos/overlays.ts` (the layout parts); `src/styles.ts` L170–220, L300–312, L700–712.
- Where `CosmosScene` reads the layout mode: `grep -n "layout ===\|\.layout\b" src/views/CosmosScene.ts`. Plumb the focus note's layout there, and don't read further.

## Acceptance criteria
- No 2D|3D pill in either header.
- The Default layout setting exists (Mindmap / Organic / Planets, default Mindmap) and applies to every note without its own layout.
- A note's own layout is saved in its styles and survives a reload. The brain button and the open-map commands open each note in its layout.
- `setNoteLayout` swaps engines in place: no animation, the undo history is kept, and the focused node is centred.
- Follow active note in Cosmos swaps to the mind map for a Mindmap note, and back.
- `last-map-view.ts` and `liftoff.ts` are gone; no dead code is left behind.
- The pure layout resolution (`noteLayout(styles, defaultLayout)`) and the engine choice are unit-tested.
- The ADR and glossary are written. lint, test and build pass.

## Test plan
1. Settings → Osmosis → Default layout = Mindmap. Open a note with the brain button: the mind map, with no pill in the header.
2. In Cosmos's Layout select, pick Planets for the focus note: Planets. Reload: the note still opens in Planets. Its styles (sidecar or `osmosis-styles`) carry the layout.
3. Pick Mindmap there: the tab becomes the mind map with no animation, centred on the same node. Ctrl+Z undoes the last edit made before the swap.
4. Set Default layout = Organic: a note with no layout of its own now opens in Organic.
5. Cosmos with Follow on: click into a Mindmap note in another pane. The Cosmos tab becomes the mind map.
