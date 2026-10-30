---
title: 3D Graph Phase 2 - View shell
summary: "The 3D Graph ItemView: 3d-force-graph mount, far and middle tiers, mist, theme following, hop navigation, depth control, desktop and mobile controls."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
priority:
progress: 100
date_created: 2026-10-29T01:03:06.000Z
date_modified: 2026-10-30T01:35:00.000Z
date_start_scheduled: 2026-10-29T11:01:15.000Z
date_start_actual: 2026-10-29T11:01:15.000Z
date_end_scheduled: 2026-10-30T01:35:00.000Z
date_end_actual: 2026-10-30T01:35:00.000Z
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
  - "[[3D Graph Phase 1 - Graph model]]"
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/45
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

- **Dependencies:** add `3d-force-graph` and `three` (exact versions) and use the d3 force engine. Measure the size delta in `main.js` (542,138 bytes before this phase) and the startup cost, and record both here.
- **The view:** `src/views/Graph3DView.ts` (`VIEW_TYPE_GRAPH3D`), registered in `main.ts`. Open it with the command "Open 3D graph for current note" and from the file menu.
- **Tiers:** far (point or sphere) and middle (text sprite), plus the note core drawn larger and brighter with its title.
- **Mist:** `FogExp2`. Background and fog colours come from Obsidian's CSS variables and update on `css-change`.
- **Navigation:**
  - Click or tap to hop: the camera flies to the node and the horizon recentres.
  - Orbit controls plus WASD/QE flight, with keys through the view's `Scope`.
  - Mobile: orbit, pinch and tap.
  - A depth control in the header.
  - A follow-active-note toggle, off by default.

**Acceptance:**
- Opening the view on a fixture note shows its N-hop neighbourhood in 3D.
- Hopping recentres the view.
- Switching between light and dark themes changes the mist.
- Works on desktop, iOS and Android.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.

## Measurements

*Taken 2026-10-29 by Claude while building this phase.*

- **`main.js` size:** 542,138 → **1,369,556 bytes (+827,418)**. Three.js is 619 KB of that, and the force-graph stack (three-forcegraph, three-render-objects, d3-force-3d, ngraph, tween, etc.) is most of the rest. Before the `three/webgpu` alias in `esbuild.config.mjs`, the bundle was 1,980,244 bytes: `three-render-objects` statically imports `WebGPURenderer`, which drags in Three's whole WebGPU stack (588 KB) even though we never use it.
- **Startup cost:** evaluating the bundle (Node, `obsidian` stubbed, 15 runs each) went from a median of **12.0 ms to 26.1 ms (+14 ms)**. That is parse cost only. Three.js is *not* evaluated at plugin load: `Graph3DView` loads `Graph3DScene` with a dynamic `import()`, which esbuild turns into a lazy init, and `window.__THREE__` stays unset after `main.js` loads. Not yet measured inside Obsidian itself.

## Navigation notes

- **No node drag.** A press on a node orbits that node instead (Sawyer, 2026-10-29: the layout places nodes itself, and Phase 3 pins and saves positions). `enableNodeDrag(false)` on every platform. **Phase 7's drag-to-link** (drag line A onto line B) will need a modifier key or an edit mode to tell a linking drag from an orbiting one. Don't take the plain left-drag back for it.

## What was implemented

Shipped in [PR #45](https://github.com/SawyerRensel/Osmosis/pull/45) → `feature/3d-graph-view`, together with [[3D Graph Phase 1 - Graph model]].

**The shape.** `Graph3DView` (an `ItemView`) owns the header (depth slider, follow-active-note toggle), the horizon and theme reading. It loads `Graph3DScene` with a dynamic `import()`, so Three.js is evaluated only when a 3D graph opens. The scene wraps 3d-force-graph (d3 engine) and draws the far and middle tiers (`lod.ts`), with labels and colours from `appearance.ts` and `FogExp2` mist. Background and fog colours come from Obsidian's CSS variables and update on `css-change`. The view opens from the command "Open 3D graph for current note" and from the file menu.

**Why navigation is our own.** OrbitControls fell short in three measured ways:
- **Wrong orbit depth:** a raycast under the cursor missed small nodes and fell back to the orbit target, which is the middle of the graph. On the 49-node fixture, 40 of 196 presses within 10 px of a node missed at camera distance 600, and 88 of 196 at 1200. Link lines caught only 2–3%.
- **Zoom wall:** `zoomToCursor` shrinks the radius geometrically, so the camera halves its way toward a node forever.
- **Pinch crash:** lifting one finger of a pinch leaves OrbitControls in TOUCH_DOLLY_PAN with one pointer, and it throws on every move.

**The fix:**
- `depth.ts` `pickNode` aims at the node whose screen edge is nearest the cursor, within 16 px for a mouse or 32 px for touch. On a miss it reuses the last depth, Blender Auto Depth style. With it, 0 of the same presses miss.
- `dollyDistance` sizes each zoom step by the depth under the cursor, but never less than `MIN_DOLLY` (200 per unit of ln zoom, about 10 units a wheel notch), so zoom passes through a node.
- Drag rotation (`pivot.ts`), the wheel (a capture-phase listener on the container), pinch and two-finger pan are all handled in the scene. OrbitControls keeps only middle-drag zoom.

**Decisions worth remembering:**
- **No node drag** (`enableNodeDrag(false)`). A press on a node orbits it. The layout places nodes itself, and Phase 3 pins and saves positions.
- **Zoom re-seats the orbit target** at the aim point's view depth (minimum 10), so the mist and flight speed follow where you are looking. The fog eases to its new density over 0.25 s; without that it pops.
- **A flight key latches look mode** for the rest of a left-drag, and the next fresh press orbits again. While looking, the wheel sets flight speed (×1.25 a notch, ×⅛–×8). The speed is shown briefly in a bottom-right readout, shared across views and reset on restart.
- **Touch defaults to orbiting the point under the finger.** The setting is `graph3dOneFingerDrag` (`point` / `center` / `look`). It was renamed from `graph3dTouchDrag`, and `loadSettings` deletes the old key, so existing installs get the new default instead of a stale value.
- **Touch momentum** (orbit, pan, pinch) reuses `mindmap-inertia.ts`. A touch that lands mid-coast stops the coast and doesn't hop.
- **"View center" means only the view center:** there's no node pivot in that mode.
- **Keep the `three/webgpu` alias** in `esbuild.config.mjs` (see Measurements).
- **Never hold a reference to `controls.target`:** `cameraPosition()` replaces it with a new `Vector3`.

**Final size:** `main.js` is 1,379,291 bytes after the navigation round (1,369,556 at the first measurement above).

**Not done:**
- Middle-drag zoom is still OrbitControls', and it still stalls near a node.
- Touch turn and zoom rates are unchanged, pending Sawyer's tuning now that momentum is in.
- Startup cost hasn't been measured inside Obsidian itself.

**Surface map:**

| File | Change |
|---|---|
| `src/views/Graph3DView.ts` | New: the view, header controls, horizon, theme, follow-active-note |
| `src/views/Graph3DScene.ts` | New: 3d-force-graph mount, tiers, mist, hop, and all pointer/wheel/touch navigation |
| `src/views/three-webgpu-stub.ts` | New: stand-in aliased over `three/webgpu` |
| `src/graph3d/lod.ts`, `appearance.ts`, `pivot.ts`, `depth.ts` (+ tests) | New: pure tier, look, rotation and aim/zoom logic |
| `src/main.ts` | View registration, command, file-menu item, old-key cleanup in `loadSettings` |
| `src/settings.ts` | `graph3dDesktopPivot`, `graph3dOneFingerDrag` and their settings section |
| `styles.css` | View layout, header controls, empty state, speed readout |
| `esbuild.config.mjs` | `three/webgpu` alias |
| `eslint.config.mts` | "3D" added to the sentence-case `ignoreWords` |
| `package.json`, `package-lock.json` | `3d-force-graph`, `three`, `three-spritetext`, `@types/three` (exact versions) |

**Test fixture:** `e2e/fixtures/graph3d/`, copied to `vault/tests/graph3d/`. `Sailing Basics` is the start note. `Knots` is the dense web used for the depth-pick measurements. `Points of Sail` is reachable only by a property link, `Navigation` is four hops out and shares a tag and an attachment that must not pull it closer, and `knot-diagram.svg` is the shared attachment.

**Follow-ups:**
- [[3D Graph Phase 7 - Editing]]: drag-to-link needs a modifier key or an edit mode.
- [[3D Graph Phase 3 - Streaming and stability]]: pinned positions.

