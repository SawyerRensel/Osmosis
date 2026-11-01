---
title: 3D Graph - Editor anchoring and overlays fixes
summary: "Sawyer's feedback from testing the 3D inline editor and the Overlays menu: anchor the editor to its plate (and keep it above the phone keyboard), drop Bloom, soften the Overlays radius, make Attachments off by default and hide attachment plates with it, and make the Hierarchy↔organic slider re-settle the loaded area live."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph Phase 7 - Editing]]"
  - "[[3D Graph Phase 5 - Overlays menu]]"
status: To-Do
priority:
progress:
date_created: "2026-11-01T02:05:00.000Z"
date_modified: "2026-11-01T02:05:00.000Z"
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
cover:
color:
pull_request:
---

# Bug Report

Sawyer's feedback from testing the stack through Phase 7 slice 3, 2026-10-31.

## 1. The inline editor isn't anchored to its plate

> "Sometimes the keyboard pops up overtop of a plate I'm editing so I can't type or can't see what I'm typing. I'd want the keyboard to push up the viewport or the plate so the plate stays centered/visible within the viewport. The editor box also appears in a different location from the node itself. It doesn't stay with the node, and sometimes the node moves. If I zoom out, the editor box stays locked to the camera. Editing a plate should always be anchored to the plate itself."

![[3d-graph-feedback-editor-offset.png]]
The editor box (purple) sits above and left of the plate it edits, smaller than the plate's text.

![[3d-graph-feedback-editor-zoomed-out.png]]
After zooming out, the box stays where it was on screen while the plate ("Good books finish themselves", centre) has shrunk away from it.

**Expected:**
- The editor is attached to the plate. It moves, scales and hides with it as the camera moves, like a near-tier panel. Ideally it *is* the plate's panel, made editable.
- The node does not move while it is being edited, and saving doesn't move it either.
- On a phone, when the keyboard opens, the camera (or viewport) moves so the plate being edited stays centred and visible above the keyboard.

Context: slice 3 deliberately placed the editor once on `document.body` (fixed), and blurring on a camera move saves it. Sawyer has overturned that call: the editor must track the plate.

## 2. Remove Bloom from the Overlays menu

> "Let's remove 'bloom' from the overlays menu. I'm not a fan."

Remove the toggle and the bloom pass if nothing else uses it. A saved `bloom: true` setting must load harmlessly.

## 3. The Overlays menu item boxes' border radius is too aggressive

![[3d-graph-feedback-overlays-radius.png]]
Each row's rounded box should use a smaller radius, in line with Obsidian's own settings rows (e.g. `var(--radius-s)`).

## 4. Attachments: off by default, and hide their plates when off

> "Let's turn off attachments by default because they're already a part of the note. Also, toggling them off removes the connection but doesn't remove the attachment plate from the viewport."

![[3d-graph-feedback-attachments-on.png]]
![[3d-graph-feedback-attachments-off.png]]
With Attachments off, the edge goes away but the image plate (the notepad) stays.

**Expected:** the Attachments edge kind defaults to off. When it is off, attachment nodes (nodes that only exist because of an attachment edge) are not shown either. Phase 5 decided that "Unresolved links" hides edges, not ghost nodes; attachments are different because the attachment *is* the node.

## 5. The Hierarchy ↔ organic slider has no visible effect

![[3d-graph-feedback-force-0.25.png]]
![[3d-graph-feedback-force-0.00.png]]
![[3d-graph-feedback-force-1.00.png]]
The graph is identical at 0.25, 0.00 and 1.00.

**Cause:** Batch 1's rule is that settled nodes never move. The slider only shapes notes that arrive after a hop or Depth change, so dragging it on a settled graph shows nothing.

**Decision (Sawyer, 2026-11-01):** re-settle live. Dragging the slider re-relaxes the loaded nodes so the shape change is visible. This is a deliberate, explicit exception to "settled nodes never move": it happens only in response to the user moving this slider. Every other path (hops, edits, data updates) still keeps settled nodes still. Update the slider's description text to match.
