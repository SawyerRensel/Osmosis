---
title: 3D Graph - Planets ignores a note's 2D map settings
summary: "The Planets Continent direction and balance dropdowns looked dead because a note's own 2D map settings (direction, map layout, balance, side) overrode them. Planets now ignores those; the Overlays dropdowns always apply."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets mode]]"
status: In-Review
priority:
progress:
date_created: "2026-11-10T04:02:05.000Z"
date_modified: "2026-11-10T04:12:00.000Z"
date_start_scheduled: "2026-11-10T04:02:05.000Z"
date_start_actual: "2026-11-10T04:02:05.000Z"
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

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Obsidian desktop |
| Operating System | Linux |

## What happened?

Sawyer: "it always renders as 'Both sides' in 3D planet layout regardless of whether I select 'One side', 'Both sides', or 'Alternating'."

The Overlays menu's Continent balance dropdown (and Continent direction) in Planets layout appears dead.

## What should have happened?

Choosing One side, Both sides or Alternating re-lays out every planet's continents live.

## Where is this file located?

Sawyer's own notes. Repro fixture: `vault/tests/graph3d/Anchor Balance.md` (own `balance: alternating`).

## Steps to Reproduce

### 1. Start from

A note whose frontmatter has an `osmosis-styles:` block with `balance: both-sides` (set for its 2D map), open in the 3D graph, Layout Planets.

### 2. Prep/settings

Overlays, Continent balance: One side, then Alternating.

### 3. Do this

Look at the continents of the planet.

### 4. Trigger

Nothing changes: the note's own frontmatter wins over the dropdown.

## Batch implementation notes (awaiting manual test)

**Cause.** P2 of [[3D Graph - Planets mode]] let a note's own `osmosis-styles` frontmatter override the Overlays defaults, field by field (`resolveContinentStyle`, fed by `noteMapSettings` through a scene option the view answered from the metadata cache). That frontmatter is what the 2D map writes (`direction`, `mapLayout`, `balance`, `layoutSide`). Sawyer's notes set `balance: both-sides` for 2D, so on every planet the Continent balance dropdown lost to the note. Confirmed with Sawyer.

**Decision (Sawyer): split 2D and Planets settings.** Planets ignores the note's Balance, Direction, `mapLayout` (radial) and `layoutSide`. The Overlays dropdowns (`continentDirection`, `continentBalance`) apply to every planet. The 2D map keeps its per-note settings, untouched. There is no per-note Planets key.

**What was removed** (only what this orphaned): `resolveContinentStyle`, `noteMapSettings`, `NoteMapSettings`, the scene's `noteMapSettings` option and the view's reader, and the planets.ts imports of `buildMapSettingsFromFrontmatter`, `parseOsmosisStyleFrontmatter`, `MapSettings`, `LayoutSide`. Also orphaned and removed: `ContinentStyle.side` (only a note's `layoutSide` ever set it; `treeMap` now uses the direction's default side, as before for notes without one), and `PlanetWorld.update`'s per-planet `styleOf(core)`, which is now one shared `style: ContinentStyle`. The planet key still includes direction and balance. The view's `resolve` handler is general (it reloads the model on any note edit) and stays; there was no map-settings cache or listener of its own.

**The no-override path, checked (no second bug found).** Menu dropdown -> `change` -> `setGraph3DOverlays` -> `applyControlSettings` -> `Graph3DScene.setOverlays`. `continentStyleChanged` is true in Planets when direction or balance differ, so `relayout` clears the world and calls `reshape`, whose `pushData` runs `updatePlanets` with the new style (`this.overlays` is assigned before that). `planetKey` includes `direction/balance/spacing`, and `treeMap` passes `balance` to `computeLayout`. A re-layout from the dropdown is instant (the world is cleared, so nothing eases), as it was for the Layout change. T30 (balance by area in `layout.ts`) is untouched; its tests pass.

**Tests** (`src/graph3d/planets.test.ts`): for a head with four children, one-side, both-sides and alternating give the sides RRRR / RRLL / RLRL and different plates; the shared style re-lays out every planet when balance changes, and when direction changes, and not otherwise. "A note whose frontmatter says `balance: both-sides` follows the global setting" is now structural: planets take no per-note input at all, so there is nothing for the frontmatter to feed (the removed `resolveContinentStyle` tests are gone with it).

| File | Change |
|---|---|
| `src/graph3d/planets.ts` | Removed per-note override plumbing, `side`; one shared style; doc comments |
| `src/graph3d/planets.test.ts` | Dropped override tests; balance-differs and shared-style re-layout tests |
| `src/graph3d/overlays.ts` | Doc comments: a note's 2D settings don't apply on a planet |
| `src/views/Graph3DScene.ts` | Builds the style from the Overlays; removed `noteMapSettings` option |
| `src/views/Graph3DView.ts` | Removed `noteMapSettings` reader and option |
| `src/views/Graph3DOverlays.ts` | Dropdown descriptions no longer mention an override |
| `e2e/fixtures/graph3d/Anchor Balance.md`, `Anchor Radial.md` (+ `vault/tests/graph3d/` copies) | Prose says the note's 2D settings are ignored on a planet (Anchor Radial's said the same false thing); frontmatter unchanged |

`docs/` had no mention of Planets or the override, so nothing to change there. [[3D Graph - Planets mode]]'s P2 section still describes the overridden design; it is historical and this note supersedes it.

**Fixture.** `vault/tests/graph3d/Anchor Balance.md` (`balance: alternating`, `direction: left-right`) and `Anchor Radial.md` (`mapLayout: radial`), linked to `Sailing Basics.md` (no settings). Masters in `e2e/fixtures/graph3d/`. Reload Obsidian (Ctrl+R) before testing, as the fixtures were rewritten under a live vault.

**Manual test.** Open `tests/graph3d/Anchor Balance.md` in the 3D graph at depth 2, Layout Planets. All three planets (Anchor Balance, Anchor Radial, Sailing Basics) must look alike (left to right, one side). In Overlays set Continent balance to Both sides, then Alternating, then One side: every planet's continents change together, live (a continent needs 2 or more children to differ). Set Continent direction to Radial and Top down: all three planets follow. Open Anchor Balance in the 2D map: it still lays out alternating, left to right.

**Not verified.** Anything visual, in Obsidian. The re-layout path was read, not run.
