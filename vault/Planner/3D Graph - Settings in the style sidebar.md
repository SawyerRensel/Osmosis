---
title: 3D Graph - Settings in the style sidebar
summary: "Rename Overlays to Settings and move it into the style sidebar like 2D's, with collapsible remembered sections, Layout on top, plain names; the 3D sidebar also styles the selected nodes with the same osmosis-styles."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[Graph - Shared header for 2D and 3D]]"
  - "[[3D Graph - Read node styles]]"
  - "[[3D Graph - Spacing sliders]]"
status: In-Review
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-10T12:00:00.000Z"
date_start_scheduled: "2026-11-11T11:15:51.000Z"
date_start_actual: "2026-11-11T11:15:51.000Z"
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
  - "[[3D Graph - Read node styles]]"
cover:
color:
pull_request:
---

# Optimization

## What tool or process needs improvement?

The 3D Overlays menu is a long, jargon-named list (Lookdev, Forces) separate from the style sidebar 2D users already know. Sawyer wants one sidebar: settings for the whole graph and styling for the selected node(s), the way 2D has it.

## What's slow or frustrating about it?

The 3D "Overlays" menu becomes a "Settings" section inside the style sidebar (same sidebar surface as 2D). It has collapsible sections (open/closed state remembered), a Layout dropdown on top with that layout's own controls under it, and plain section names. The sidebar also styles the selected node(s) with the same `osmosis-styles` as 2D.

## What would "better" look like?

Overlays is a separate popover with 5 groups and jargon section names.

## Batch and checkpoint

Round 7, Batch C (editing and styling). Checkpoint: checkpoint 2 (C) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

Blocked by: [[3D Graph - Read node styles]]. Do not start until that ticket is built (stacked branch is fine).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Overlays → "Settings", moved into the style sidebar; collapsible sections, Layout on top with its own controls, plain names. 3D sidebar also styles nodes (same osmosis-styles).

Section names: plain, e.g. Show / Edges / Layout & spacing / Camera / Look; no "Lookdev" and no "Forces". Node styling in the 3D sidebar uses the same panel code as 2D wherever possible (PRINCIPLE: 2D and 3D share one styling system as much as possible).

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Current Overlays order: Depth, Backlinks, Color by; Edges (7 toggles); Forces (Hierarchy to organic, Note spacing, Node spacing, Links pull, Flatten, Layout dropdown, Continent direction/balance); Camera (Travel speed, Click selects only); Lookdev (Mist, Link particles, Labels, Panel detail, Live panels).
- UI: `src/views/Graph3DOverlays.ts`; model and normalisation: `src/graph3d/overlays.ts` (+ test); applied via `Graph3DScene.setOverlays`.
- The 2D style sidebar lives in the mind map view (`src/views/MindMapView.ts` and its style panel modules); reuse, do not copy.
- Depends on [[3D Graph - Read node styles]]; the header button is delivered by [[Graph - Shared header for 2D and 3D]].
- Settings are stored per vault in `graph3dOverlays`; keep keys stable so existing vaults keep their values.

## Acceptance criteria

- The 3D graph's Overlays popover is replaced by a Settings area inside the style sidebar (same sidebar component/surface as 2D), reached by the shared header's Style sidebar button.
- Sections are collapsible and their open/closed state is remembered (per vault).
- A Layout dropdown is at the top; below it only the controls relevant to that layout (e.g. Continent spacing only for Planets, Flatten only for Flat slices).
- Section names are plain (Show / Edges / Layout & spacing / Camera / Look or similar); no 'Lookdev' or 'Forces'.
- With nodes selected, the sidebar offers the same node styling controls as 2D and writes the same `osmosis-styles` entries (using the 3D selection, multi-select aware).
- Every existing overlay setting is still reachable and keeps its stored value; no behaviour change to the settings themselves.
- Settings with nothing selected still work (sidebar shows graph settings only).

## Test plan

Unit tests: a pure description of the section tree (sections, controls, which layout shows what) tested for completeness against the `Overlays` model so no setting is orphaned; collapse-state normalisation.

Manual test (fixture: `vault/tests/graph3d/` Sailing and Anchor notes; Ctrl+R):
1. Open 3D, open the Style sidebar: Settings sections are collapsible; collapse some, reload Obsidian: they stay collapsed.
2. Change Layout: the controls beneath change; Continent spacing only in Planets.
3. All previous toggles/sliders still work and keep values across reload.
4. Select a node (and several): style fill/border/text in the sidebar; check the file's `osmosis-styles` and the 2D view show it.

## Out of scope

- Adding new settings (other tickets add their own).
- Changing defaults of existing settings.
- The header buttons (see [[Graph - Shared header for 2D and 3D]]).

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.

## Batch implementation notes (awaiting manual test)

Code commit `1733199` on `feature/3d-settings-style-sidebar` (stacked on T45).

**Approach.** The style sidebar (`PropertiesSidebarView`) now follows a 3D graph as well as a mind map. While a 3D graph was the last active view, its tabs are **Settings | Node**: Settings is the old Overlays popover rebuilt as collapsible sections (`Graph3DSettingsPanel`), and Node is the same Node-tab code 2D uses, driven through a small `NodeStyleHost` interface both views implement. The viewport's Overlays corner button and popover are gone; the header's paintbrush opens the sidebar, as in 2D.

- Section tree is pure data: `SETTINGS_SECTIONS` in `src/graph3d/settings-sections.ts` — Layout & spacing (Layout first, then Flatten / Continent spacing / direction / balance, then Hierarchy ⟷ organic, Note spacing, Node spacing, Links pull), Show (Depth, Backlinks, Color by), Edges (7 toggles), Camera (Travel speed, Click selects only), Look (Mist density, Link particles, Labels, Panel detail, Live panels). `controlShown` keeps the old visibility rules exactly (Flatten in Flat slices; continent controls in Planets; Balance hidden for Radial).
- Collapse state: `graph3dSettingsCollapsed` (section IDs) in data.json, so per vault; normalised on load (`normalizeCollapsed`), saved through the overlays' debounced save.
- Node styling in 3D: `Graph3DView.applyNodeStyleOverrides` / `resetNodeStyles` group the selected lines by note, stamp block IDs with `planStyleKeys` (same selectors as 2D), and merge into each note's `osmosis-styles` with the shared `writeStyleOverride` / `clearStyleOverride` (`src/style-write.ts`). The 2D write now uses the same `mergeStyleOverride` (extracted, unchanged behaviour). One undo step per change (recorder group), the whole colour drag one step.

**Decisions worth remembering**
- Settings stay stored in `graph3dOverlays` with the same keys; nothing renamed in data.json. The view file is still `Graph3DOverlays.ts` (class renamed to `Graph3DSettingsPanel`) to keep the diff small.
- The Settings panel replaces the Map tab only for 3D; the 2D sidebar is unchanged.
- In 3D the Style class section assigns a class (dropdown) but hides the class-management buttons (new/save/rename/scope/delete): those write map-level definitions through `MindMapView` methods. Use the mind map to manage classes.
- 3D has no plugin theme (T43), so the Node tab's swatches show Local + Class values, no theme defaults (`getActiveTheme()` returns undefined).
- Writes are serialised (`styleChain`); updates arriving mid-write coalesce (`combineStyleUpdates`). During a colour drag, plain writes don't reload the graph; the drag's end does (plus the metadata-cache reload), so plates recolour when the drag pauses/ends, not every step.
- A line stamped by an earlier write in the same drag is found again by its new block ID (`styleStamps`, `findNodeByBlockId`). The last-written frontmatter is cached per note (`styleFrontmatter`) until the metadata cache's `changed`, so the controls don't flick back.
- Selection follows reloads: `SceneOptions.onSelectionChange` fires from `applySelection` (which `setData` calls), and the stamp's ID change is carried by `edited` (each line's start via `stampedStart`).
- Tree-path selectors (legacy) are not read by the 3D Node tab's controls (block-ID and stable-ID are); drawing still uses T43's full lookup.

| File | Change |
|---|---|
| `src/graph3d/settings-sections.ts` (+test) | New: section tree, `controlShown`, collapse normalise/toggle |
| `src/style-write.ts` (+test) | New: shared `mergeStyleOverride`, `writeStyleOverride`, `clearStyleOverride`, `combineStyleUpdates` |
| `src/views/style-host.ts` | New: `NodeStyleHost`, `NodeStyleContext` |
| `src/views/sidebar-setting.ts` | `sidebarSetting` moved out of the sidebar, shared with the Settings panel |
| `src/views/Graph3DOverlays.ts` | Popover menu → `Graph3DSettingsPanel` (sections, collapsible, remembered) |
| `src/views/PropertiesSidebarView.ts` | Follows 3D graphs; Settings tab; Node tab via `getStyleHost()` |
| `src/views/Graph3DView.ts` | Overlays menu removed; Style button opens the sidebar; `settingsSource`, settings/selection listeners; `NodeStyleHost` impl (`writeStyles`) |
| `src/views/Graph3DScene.ts` | `onSelectionChange` option, fired from `applySelection` |
| `src/views/MindMapView.ts` | `implements NodeStyleHost`; `getNodeStyleContext`; merge via `mergeStyleOverride` |
| `src/mindmap-style-key.ts` (+test) | Plan returns `insertions`; `stampedStart` |
| `src/graph3d/edit.ts` | `findNodeByBlockId` |
| `src/settings.ts`, `src/main.ts` | `graph3dSettingsCollapsed` + `setGraph3DSettingsCollapsed` |
| `src/graph3d/controls-help.ts` | Help text: Settings (style sidebar), Look; Esc no longer closes a menu |
| `styles.css` | Removed the Overlays popover rules |

**Fixture:** existing `vault/tests/graph3d/` notes (Sailing, Anchor, `Styled Mooring.md`). No new fixture.

**Not verified (no Obsidian here):** the sidebar look of the Settings sections; that the sidebar picks up the 3D graph when opened from its paintbrush (`getMostRecentLeaf`); multi-note multi-select writes; the colour-drag undo step.
