---
title: 3D Graph - Edit box width and trusting the view
summary: "The 3D edit box doesn't grow sideways as you type (each character wraps to its own line), and Enter/Tab/edit fly the camera to the node, so you lose sight of where you came from. Size the box to its text, keep the camera where the user put it, and seed new nodes beside their parent in the screen plane."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph Phase 7 - Editing]]"
  - "[[3D Graph - Editor anchoring and overlays fixes]]"
status: To-Do
priority:
progress:
date_created: "2026-11-03T17:35:29.000Z"
date_modified: "2026-11-03T17:35:29.000Z"
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

Sawyer's feedback from using 3D edit mode, 2026-11-03. Settled in a grilling session the same day; the decisions below are Sawyer's.

## 1. The edit box only grows downward

![[3d-graph-feedback-edit-box-width.png]]

(`vault/media/` is gitignored; the screenshot exists only locally.)

**What happened:** typing into a new (or short) node, the box stays the width it had when empty, so every character wraps onto its own line and the box grows only vertically.

**Not the cause (Sawyer):** the plate scale. The box *should* keep scaling with its plate, as it does now.

**Likely cause (unverified):** `.osmosis-graph3d-edit-box` is `width: max-content; max-width: 20em` (`styles.css`, around line 4436). The box is measured once at its empty content and CodeMirror inside does not push a shrink-to-fit parent wider as text is typed (its content wraps to whatever width the box already has). The `ResizeObserver` in `Graph3DEdit.ts` only re-places the box; it doesn't size it.

**Should:** size the box to its text the way a plate is sized: it widens as you type up to the max width (keep `20em`, the panel width the scene spaces nodes for), and only then wraps. Applies to new and existing nodes.

## 2. The camera jumps to the node on Enter / Tab / edit

**What happened:** selecting a node and pressing Enter (add sibling) or Tab (indent / add child) flies the camera onto the new node, so the context of where you came from is gone.

**Cause:** `Graph3DScene.setEditing` flies to the node whenever `centre` (a phone) is set or the text isn't `near.readable` from where the camera is. On top of that, `seedClear` places a new line a link's length from its parent in a *random* 3D direction, so it often lands off-screen or behind other plates.

**Should (Sawyer: "trust the current view"):**
- **Desktop:** the camera stays exactly where it is on add, edit, indent and retype. "Too small to read" is no longer a reason to fly. Only if the node is off-screen does the camera *turn* (no move, no zoom) just far enough to bring it into view.
- **Phone:** the keyboard covers half the screen, so the node may still be brought above the keyboard, but by **panning only**, never zooming in.
- **New nodes** appear beside their parent **in the plane of the screen** (as the user is looking at it), at a link's length, not in a random 3D direction. This is what lets the camera stay still.

## Constraints

- "Settled nodes never move" stands; seeding a *new* node's first position is not a move.
- Don't touch the force-slider live re-settle exception.
- The near tier keeps the editor over its plate each frame (F5 of the editor-anchoring ticket); keep that.

## Test plan

- Desktop, edit mode, from a mid-distance where plates are small: select a node, Enter, type a sentence. The box widens with the text until 20em, then wraps; the camera doesn't move; the new plate sits beside its parent on screen.
- Same with Tab, with F2 on an existing node, and with an indent/outdent.
- Turn so a selected node's parent is near the screen edge, press Enter: if the new node would be off-screen, the camera turns just enough; no zoom.
- Phone: Enter on a node in the lower half; it pans above the keyboard without zooming in.
- 2D mind map edit box is unchanged (the 2D overlay shares `.osmosis-edit-overlay`).
