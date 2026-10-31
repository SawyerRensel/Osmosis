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
status: To-Do
priority:
progress:
date_created: "2026-10-31T11:19:43.000Z"
date_modified: "2026-10-31T11:19:43.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph - Plates for every node]]"
cover:
color:
pull_request:
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
