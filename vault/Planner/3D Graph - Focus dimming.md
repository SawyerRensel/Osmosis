---
title: 3D Graph - Focus dimming
summary: Dim plates progressively by depth away from the focused node, on top of the overall mist, so a dense cluster around the focus reads as in front and behind without losing sight of the far background.
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Plates for every node]]"
  - "[[3D Graph - Plate-aware spacing]]"
status: Done
priority:
progress:
date_created: "2026-10-31T11:19:43.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-10-31T12:00:00.000Z"
date_start_actual: "2026-10-31T12:00:00.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
  - "[[3D Graph - Plates for every node]]"
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

Part of [[Develop Mind-Map Graph View]]. A local, depth-of-field-like dim **on top of** the overall mist (`FogExp2`, eased by `MIST_EASE` in `src/views/Graph3DScene.ts`). Sawyer left the details to Claude ("whatever you think is best"), so the design below is decided. Change it only if manual testing says so.

### Design

- **Focus depth** = the view-space depth of the orbit target (`controls.target`). Zooming already aims the target at a node, so the focus is the node you're looking at. Ease it the way the mist eases (`MIST_EASE`), so re-aiming doesn't pop.
- **Behind the focus:** dim ramps smoothly from 0 at the focus depth to a maximum (start at **70%** toward the background colour) at **one focus depth behind it** (twice the camera's distance to the focus).
- **In front of the focus:** a lighter dim (start at **30%**), ramping toward the camera, so the focused plate stands out without the plates in front of it vanishing.
- **Far background stays visible.** The dim has a ceiling below 100%, and the mist does the rest, so you still see where you are.
- **Edges dim the same way**, so a dimmed cluster's links don't stay bright. Add the same uniform to the edge material through `onBeforeCompile`.
- **Implementation:** a uniform pair (focus depth, ramp scales) in the plate and glyph shaders from [[3D Graph - Plates for every node]]. Dim is a mix toward the background colour, like fog, because plates are opaque. It costs nothing per frame on the CPU.
- Pure maths (the dim curve from depth, focus depth and constants) goes in `src/graph3d/` with unit tests. The shader mirrors it.

### Why after the glyph plates

With per-sprite textures this would be a per-plate opacity write every frame, and transparency conflicts with opaque, depth-ordered plates. In the plate shader it's one uniform.

## What problem does this solve?

Close to a node with many small branches, every plate is equally bright, and the cluster is overwhelming (Sawyer's close-up screenshot, 2026-10-31). Plate size hints at distance, but not enough to read what's in front and what's behind.

## What's your current workaround?

Orbit until the cluster separates.

## Test plan

- **Unit:** the dim curve: 0 at the focus, monotonic on each side, capped at each maximum, scaled by focus depth.
- **Manual (Sawyer):**
  - Zoom onto a busy node in Sawyer's vault. Plates behind it fade back, plates in front fade a little, and the focused one is clearest.
  - Re-aim the zoom at a nearer or farther node. The dim follows smoothly without popping.
  - Zoomed out, the far background is still visible.

## Conventions

- lint → test → build → manual-test instructions → stop for Sawyer before committing.
- Tune the two maxima and the ramp length with Sawyer. Record the values chosen, and why, in "What was implemented".

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Built on `feature/3d-graph-focus-dimming` (cut from `feature/3d-graph-plate-spacing`), commit 1080cec. Not pushed, no PR.

### Approach

- `focusDim(depth, focus)` in `src/graph3d/focus.ts` is the curve; `FOCUS_DIM_GLSL` is the same curve as a GLSL function, generated from the same constants so they can't drift.
- **Curve:** `offset = (depth − focus) / focus`. Behind: `0.70 · smoothstep(offset / 1)`, so it reaches 70% one focus depth behind (twice the camera→focus distance). In front: `0.30 · smoothstep(−offset / 1)`, reaching 30% at the camera. Smoothstep (3t²−2t³) is flat at the focus, so the focused node and its immediate neighbours stay full brightness and nothing pops at the boundary.
- **Focus** = view depth of `controls.target` (`viewDepth()`, projection on the camera's forward axis, min `MIN_DEPTH`), eased each frame with the mist's `MIST_EASE` (0.25 s) exponential. It lives in one shared uniform, `Graph3DPlates.focus` (`uFocus`), used by the plate material, every glyph-page material and the edge material.
- **Plates/glyphs:** the vertex shader computes `vOpacity = aOpacity · (1 − focusDim(viewDepth of plate centre))`, so dim folds into the existing mix toward `uBackground`, before the fog. Zero CPU work per frame: no attribute writes.
- **Edges:** `LineBasicMaterial.onBeforeCompile` adds `vFocusDepth` and multiplies `diffuseColor.a` by `1 − focusDim`. Edges are alpha-blended over the background, so lowering alpha is the same mix.

### Decisions

- **Per-plate, not per-fragment, dim** for plates: a plate and its text dim as one, so text doesn't fade partway across a wide plate. Edges dim per fragment so a link fades along its length into a dimmed cluster; at its ends it matches the plates it joins.
- **Ramp lengths relative to the focus depth**, not absolute units, so the plate-aware spacing's bigger clusters and any zoom level behave the same.
- **Ceilings 70% / 30%** as the ticket said; the mist does the rest, so the far background never vanishes. Untuned: change the four constants at the top of `focus.ts` if manual testing says so.
- **First frame** seeds the focus directly instead of easing up from 0 (which would flash everything dim).

### Surface map

| File | Change |
|---|---|
| `src/graph3d/focus.ts` | New: constants, `focusDim`, `FOCUS_DIM_GLSL` |
| `src/graph3d/focus.test.ts` | New: 0 at focus, monotonic both sides, capped, scales with focus, shader carries the constants |
| `src/views/Graph3DPlates.ts` | Shared `focus` uniform; plate and glyph vertex shaders fold the dim into `vOpacity` |
| `src/views/Graph3DScene.ts` | Eases `focus` from the orbit target each tick; edge material dims through `onBeforeCompile` |

### Fixture

No new fixture: `vault/tests/graph3d/` (Sailing Basics and its linked notes) already has clusters dense enough to show front/behind; Sawyer's own vault and the stress web are better for the "busy node" case.

### Not verified

- The shaders were not compiled in a real WebGL context (no Obsidian or GLSL validator here). If plates or edges disappear, check the console for a shader compile error first.
- The visual tuning: whether 70/30 and a one-focus-depth ramp read well.
