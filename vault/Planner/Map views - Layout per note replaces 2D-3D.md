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
status: In-Review
batch: 18
priority:
progress:
date_created: 2026-11-28T03:39:06.000Z
date_modified: 2026-11-28T03:39:06.000Z
date_start_scheduled: 2026-11-28T04:09:04.000Z
date_start_actual: 2026-11-28T04:09:04.000Z
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

## Batch implementation notes (awaiting manual test)

Code commit: `b073cb8` on `batch/18-one-map-layouts`. The whole ticket is done; nothing was left as a slice.

**Approach.** The pure model lives in `src/note-layout.ts`. `noteLayout(styles, defaultLayout)` reads `osmosis-styles.layout`; `engineFor` maps Mindmap to the mind map and Organic/Planets to Cosmos; `cosmosLayout` maps a Mindmap note shown in Cosmos to Organic; `writeNoteLayout` sets the key, or removes it (and an emptied `osmosis-styles`) for the default. The plugin adds `noteLayoutOf(path)`, `openNoteMap(leaf, path)` and `setNoteLayout(path, layout)`. `layout` left `CosmosOverlays`: the scene now gets `SceneOverlays = overlays + { layout }`, built by `CosmosView.sceneOverlays()` from the focus note. Each reload calls `applyLayout()`, so a hop, or an edit or undo of the layout, re-lays out the scene. The lift-off is replaced by `src/cosmos/swap-focus.ts`, a `swapFocus` hand-over (`MapFocus` plus `focusNodeId` / `focusChain`) that keeps only "centre on the focused line".

**Decisions**
- **New `layout` key, not a widened `mapLayout`.** `mapLayout` is the mind map's tree algorithm. Also, the sidebar has written `mapLayout: classic` into notes, and widening would turn those into explicit Mindmap choices that ignore the Default layout. Recorded in `docs/adr/0001-layout-replaces-2d-3d-toggle.md`. `mapLayout` and its sidebar dropdown are untouched; T139 decides their fate.
- **"Open Cosmos for current note" and the file menu's "Cosmos" still open Cosmos** for any note. A Mindmap note opened that way draws Organic. Otherwise there would be no way into Cosmos while the default is Mindmap and T139's picker doesn't exist yet. Hops inside Cosmos never swap engines; only Follow active note does, as settled.
- **Both follow directions are implemented.** The unpinned mind map's `active-leaf-change` swaps to Cosmos (follow forced on) for an Organic/Planets note. A following Cosmos swaps to an *unpinned* mind map for a Mindmap note. Follow swaps pass `active: false`, so the pane you clicked keeps focus.
- **"Open mind map view" (no file) still opens a mind map**, following the active note. It swaps on the next follow move.
- **The brain button's aria-label and the file-menu item are renamed "Mind map view" → "Map view"**, since they now open the note's layout.
- **The "Toggle between mind map and Cosmos" command (`mindmap-toggle-3d`) is removed** along with the pill. Toggling an engine contradicts the note's layout; the ADR says don't bring it back.
- **The Cosmos Layout dropdown (stopgap) lists Mindmap / Organic / Planets and shows the focus note's own layout**, even when Cosmos draws a Mindmap note as Organic. Picking calls `setNoteLayout`.
- **`setNoteLayout` waits (up to 2 s) for the metadata cache to read the new layout before swapping or re-laying out.** Otherwise the incoming view reads the stale value and flashes the old layout.
- **The old `osmosis-last-map-view` localStorage value is left in place.** Nothing cleaned it before. It is harmless and just goes unread. `cosmos-legacy.test.ts` still uses the string as an "unrelated key is left alone" sample.
- **The old per-vault `graph3dOverlays.layout` is dropped on load** (`normalizeOverlays` rebuilds the object) and is not migrated, as settled.
- Changing the Default layout re-lays out open Cosmos views (`refreshOpenCosmosControls`) but doesn't swap open views between engines.
- An undo that reverts a recorded layout write re-lays out Cosmos (Organic ↔ Planets) but doesn't swap engines.
- `CosmosScene.faceNote` lost its `phase` argument (only the lift-off used it), and `standOver`, `linePlateHeight` and `linePlatePixels` are gone.
- Phone header padding: the `:has(> .osmosis-view-switch)` rule now keys on the leaf's `data-type` for both map views.

| File | Change |
|---|---|
| `src/note-layout.ts` (+test) | New: the Layout model |
| `src/cosmos/swap-focus.ts` (+test) | New: focused-node hand-over across a swap |
| `src/cosmos/liftoff.ts`, `src/last-map-view.ts` (+tests) | Deleted |
| `src/main.ts` | `noteLayoutOf`, `openNoteMap`, `setNoteLayout`, `untilLayoutReads`; `swapLeafView(leaf, "mindmap"\|"cosmos", state, keep, active)`; brain button / file menu open in layout; last-map-view and toggle command removed; `defaultLayout` normalised on load |
| `src/settings.ts` | `defaultLayout` setting (first in the list) |
| `src/cosmos/overlays.ts` (+test), `settings-sections.ts` | `layout` out of `CosmosOverlays`; helpers take `{ layout }` |
| `src/cosmos/fit.ts` (+test) | `opensFitted` false when a `swapFocus` is handed over |
| `src/views/CosmosView.ts` | layout from focus note, `applyLayout`, `swapToMindMap(path, followed)`, `followTo`, `focusNote`; lift-off removed |
| `src/views/CosmosScene.ts` | `SceneOverlays` carries layout; lift-off methods removed |
| `src/views/CosmosOverlays.ts` | Layout dropdown = note layout via `source.layout/setLayout` |
| `src/views/MindMapView.ts` | `swapToCosmos(followed?)`, simplified `land`, follow swap |
| `src/views/ViewHeader.ts`, `src/view-header.ts` (+test), `ToolRibbon.ts` (+test), `styles.css` | Pill, its command and CSS removed |
| `GLOSSARY.md`, `docs/adr/0001-…`, `docs/mind-mapping/cosmos.md`, `docs/reference/{commands,settings}.md` | Layout, Default layout, ADR, user docs |
| comments in `edit-history.ts`, `mindmap-state.ts`, `PropertiesSidebarView.ts` | No longer say "2D/3D toggle" |

**Fixture:** `e2e/fixtures/layout/` → `vault/tests/layout/`: `Layout Harbour.md` (no layout), `Layout Planets Voyage.md` (`layout: planets`) and `Layout Organic Galley.md` (`theme` + `layout: organic`), linked to each other. They have no cards, so there are no dates to back-date.

**Not verified** (only Sawyer can check these in Obsidian):
- the swap itself: no flash, focus centred, undo across it;
- that follow swaps leave the clicked pane focused;
- the phone header padding;
- that the sidebar's Settings panel follows a swap cleanly.
