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
status: To-Do
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-10T12:00:00.000Z"
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
