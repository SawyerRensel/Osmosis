---
title: 3D Graph Phase 3 - Streaming and stability
summary: "Make the loaded area stream as you move: fade in/out, prefetch ring, and pin-on-settle so the world never rearranges within a session."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Plates for every node]]"
  - "[[3D Graph - Focus dimming]]"
  - "[[3D Graph - Plate-aware spacing]]"
status: Done
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-10-31T11:32:09.000Z"
date_start_scheduled: "2026-10-30T12:39:46.000Z"
date_start_actual: "2026-10-30T12:39:46.000Z"
date_end_scheduled: "2026-10-31T11:32:09.000Z"
date_end_actual: "2026-10-31T11:32:09.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph Phase 2 - View shell]]"
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/47
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

- **Fading:** departing nodes fade out, leave the graph data and free their objects; arriving nodes fade in.
- **Prefetch:** the N + 1 ring reads only the link cache, so the next hop is instant.
- **Stability:**
  - Settled nodes are pinned (`fx/fy/fz`).
  - Only new arrivals are simulated, and they're pinned once they cool.
  - A new note is seeded next to the neighbour that pulled it in.
- ~~**Saved positions** in plugin data~~ — **dropped (2026-10-30).** Built, tested, then removed: it writes a lot of data on large maps, and a vault's shape should adapt organically as notes are added rather than be set in stone. Positions now live only as long as the view; each session settles afresh.
- **Every line, always.** Use instanced far-tier meshes and a sprite atlas, and simulate only unpinned nodes. Measure on the vault's largest note.

**Acceptance:**
- Walking several hops never rearranges nodes that have already settled.
- ~~Reopening the view (and restarting Obsidian) restores the same shape.~~ Dropped with saved positions.
- Editing a line moves only that line.
- Unit tests cover seeding: new notes beside their puller, lines beside their parent, existing nodes kept.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.

## What was implemented

Shipped in [PR #47](https://github.com/SawyerRensel/Osmosis/pull/47) → `feature/3d-graph-view`. Two commits: the streaming core (`5ff12a5`), then plates, backlinks and the perf readout (`dc73f33`).

### Scope that grew during the phase

The phase started as streaming and stability. Manual testing on a large web added three things, all in the PR:
- **Backlinks toggle:** off by default, saved in view state.
- **Label plates:** these replaced `three-spritetext`.
- **Perf readout:** a gauge toggle in the viewport's bottom-left corner.

Saved positions were built and then dropped (see the scope list above).

### The cause

- **The world rearranged on every hop** because the whole simulation re-ran on each new graph. Nothing was pinned, and a new note started at the origin.
- **The undirected hop search pulled in everything that links to a hub.** One hop from a popular note loaded its whole backlink neighbourhood, which the mind map never does.
- **Text sprites were costly and hard to read.** Each `three-spritetext` setter re-rasterised. The labels floated above their node, so overlapping labels and spheres had no clear order.

### The fix

- **Streaming:** `computeHorizon` diffs the loaded sets. Departing nodes fade out and are then dropped. Arriving nodes are seeded beside the note or line that pulled them in (`positions.ts`, the horizon's `via`) and fade in. The ring one hop past the loaded area is read ahead.
- **Stability:** settled nodes are pinned (`fx/fy/fz`). `settle.ts` limits the many-body force to nodes that are still free, so a tick stays cheap in a large world.
- **Backlinks:** `noteAdjacency` keeps `forward` and `backward` maps. `computeHorizon(…, backlinks)` walks `forward` only unless the toggle is on. Hopping away from a note that isn't linked back unloads it, and the back arrow returns to it.
- **Plates:** `plateSprite()` draws each label once to its own canvas. The fill is `--background-secondary`, the outline is in the node colour, and the font is `--font-interface`, all read through the `.osmosis-graph3d-probe` theme probe.
  - A plate is centred on its node, and the sphere shrinks by `1 - labelAlpha` under it.
  - `labels.renderOrder = 1` with `depthWrite: false`: plates draw over edges, spheres in front still hide them, and transparent sorting puts a nearer plate over a farther one.
  - Plate clicks use a screen rect (`ScreenNode.plate` in `depth.ts`).
- **Sphere-only updates:** label fades set `spheresDirty`, which rewrites only the sphere instances, not the ~30k edge vertices.

### Decisions worth remembering

- **No decluttering (Sawyer, 2026-10-31).** A version where overlapping plates gave way (the farther plate faded and its sphere returned) was built and removed. It read *worse* at medium distance. Sawyer would rather see everything and orbit to look behind. Don't bring it back.
- **No distance limit on plates; a count cap instead.** `LABEL_BUDGET` has `enter`/`exit` = `Infinity` and `max` 150 desktop / 60 mobile. The cap exists only because each plate is its own canvas, about 0.7 MB of GPU memory (199 plates ≈ 128–151 MB on Sawyer's vault). [[3D Graph - Plates for every node]] replaces this with a shared glyph atlas and removes the cap.
- **Node positions are not saved** (see the scope list). `loadSettings` drops the `graph3dPositions` key an earlier build wrote.
- **`three-spritetext` was removed by editing `package-lock.json` by hand.** `npm uninstall` would have rewritten all 15k lines.
- **The perf readout stays, behind a toggle,** at Sawyer's request. It records nothing while hidden. Clicking the readout hides every plate, which is a measuring aid for comparing frame cost.
- **Only the stress-web generator is committed.** `e2e/generate-graph3d-stress.mjs` is deterministic. Its output (`e2e/fixtures/graph3d-stress/`, `vault/tests/graph3d-stress/`, 1.7 MB each) is gitignored. Run `node e2e/generate-graph3d-stress.mjs`, then reload Obsidian.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/horizon.ts` (+ test) | Forward/backward adjacency; `backlinks` parameter; `via` for seeding |
| `src/graph3d/positions.ts` (+ test) | Seed new nodes beside their puller or parent |
| `src/graph3d/settle.ts` (+ test) | Many-body force over free nodes only |
| `src/graph3d/depth.ts` (+ test) | Plate rects in picking |
| `src/graph3d/lod.ts` | `chooseLabelled` (nearest N); declutter removed |
| `src/views/Graph3DScene.ts` | Fades, pinning, instanced spheres, merged edges, plates, `fadeInLabels` |
| `src/views/Graph3DView.ts` | Backlinks toggle, theme probe reads the plate fill and font |
| `src/views/Graph3DPerf.ts` (new) | Perf readout behind the gauge toggle |
| `src/main.ts` | Drop the old `graph3dPositions` key |
| `styles.css` | Perf corner, plate probe |
| `package.json`, `package-lock.json` | Remove `three-spritetext` |
| `e2e/generate-graph3d-stress.mjs` (new), `.gitignore` | Stress web generator; output ignored |

### Test fixture

- `vault/tests/graph3d/`: the sailing web, small enough that every node gets a plate.
- The stress web: 41 notes, ~27k nodes at depth 2. Open the 3D graph on "Stress Hub". Regenerate it as above.

### Not done, and follow-ups

- **The phase's "sprite atlas" line** is not done. Plates are one canvas each, so the cap stays. → [[3D Graph - Plates for every node]]
- **Plates pop at the cap.** At the 150th-nearest boundary, a plate can be removed without a fade and its sphere snaps back. Left alone because the next task removes the cap.
- **Plates crowd each other.** Spacing ignores plate size. → [[3D Graph - Plate-aware spacing]]
- **Dense clusters near the focus are hard to read.** → [[3D Graph - Focus dimming]]
- **The stress web's first load is slow** (~3 fps for 5–10 s; frame 422 ms, but tick + render only ~36 ms, so the simulation step is suspected). Unmeasured, and no task note yet.
