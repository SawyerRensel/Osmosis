---
title: Cosmos - Remove Flat slices layout
summary: "T137. Delete the Cosmos Flat slices layout, its Flatten slider, code, tests and docs; a saved flat layout reads as Organic until T138 moves layout to the note."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Map views - Layout per note replaces 2D-3D]]"
  - "[[3D Graph - Flatten branches]]"
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
# Cosmos - Remove Flat slices layout (T137)

## Why
The Mindmap layout (T138) takes Flat's place. The Cosmos layouts become Organic and Planets.

## Settled at intake (don't re-ask)
- Delete the flat-only code, the "Flatten branches" slider, the flatten tests and the Flat docs and glossary entries.
- **A saved `"flat"` layout reads as Organic** for now (`src/cosmos/overlays.ts` migration, around :126). T138 runs next and turns "no layout" into the vault's Default layout (Mindmap). Also change the overlays default (today `"flat"`, :83) to `"organic"`.
- **Keep** what Organic and Planets use: `notePush`, `flatCharges` (noteCores, the Note spacing charge, CosmosScene.ts:912-917), and `facingPhase` plus the ring phases (CosmosScene.ts:880; CosmosView.ts:11 imports `facingPhase`). Move any survivor out of `flatten.ts` into the module that uses it (or a small new one) before you delete `flatten.ts`. Check callers of `obbOverlap` and `ringDirections` before deleting them.
- The Planner note [[3D Graph - Flatten branches]] is history: leave it.

## Footprint (intake facts)
- `src/cosmos/flatten.ts` (694 lines) and `flatten.test.ts` (595 lines).
- `CosmosScene.ts`, ~30–40 lines: :51, :428-446, :680-683, :772, :906-907, :976, :1001, :1024, :1095.
- `src/cosmos/overlays.ts`: the `"flat"` mode, `flatten` (0.75), `effectiveFlatten` :151, and the migration :126.
- `src/cosmos/settings-sections.ts:38`, :57-58; `src/views/CosmosOverlays.ts` :26, :52, and the "Flatten branches" slider ~:139-150.
- Tests: `settle.test.ts` and `plating-bench.test.ts` import from flatten; about 11 test lines mention "flat".
- `e2e/measure-near-panels.ts` and `e2e/measure-graph3d-ticks.ts`: update them so they still compile (don't run them).
- Docs: `GLOSSARY.md:39-47` (Flat branch, Flat depth, Ring: drop Ring only if it is flat-only), plus `grep -rni "flat slices\|flatten" docs`.
- T132 left Flat-specific notes in `src/cosmos/branch-look.ts` (cross axis "world up in Organic and Flat"). Update the comments only.

## Context budget (~85k)
- `src/cosmos/flatten.ts`: read its exports and header, then only the bodies of what survives (`grep -n "^export" src/cosmos/flatten.ts`; `grep -rn "from \"./flatten\"\|cosmos/flatten" src e2e`).
- `src/views/CosmosScene.ts`: the line sites above ±15 lines, plus L870–920.
- `src/cosmos/overlays.ts` (whole, 379 lines); `src/cosmos/settings-sections.ts` (whole, 81 lines); `src/views/CosmosOverlays.ts` L1–160.
- The test files: only where they import or mention flat.

## Acceptance criteria
- No Flat layout in the UI, code or docs. `grep -rni "flatten\|\"flat\"" src` only finds the kept `flatCharges` / note-spacing names, or nothing.
- A vault saved with `layout: "flat"` opens Cosmos in Organic, with no error.
- Organic and Planets lay out exactly as before. The settle and plating tests pass unchanged, apart from removed flat cases.
- lint, test and build pass.

## Test plan
1. Open Cosmos on `vault/tests/graph3d/` notes. Settings → Layout & spacing offers Organic and Planets only, and there is no Flatten slider.
2. If the vault was on Flat, it now shows Organic.
3. Switch to Planets and back: both look as before.
