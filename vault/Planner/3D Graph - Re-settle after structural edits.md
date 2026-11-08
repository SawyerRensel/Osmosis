---
title: 3D Graph - Re-settle after structural edits
summary: "After any structural edit in 3D edit mode (add, move, re-level or delete a line), the loaded graph re-settles, respecting plate extents and the flatten setting, while the camera follows the node being edited so it doesn't get lost. Text-only edits don't re-settle."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Overlay toggles hide plates and re-settle]]"
status: In-Review
priority:
progress:
date_created: "2026-11-08T20:22:00.000Z"
date_modified: "2026-11-08T20:40:00.000Z"
date_start_scheduled: "2026-11-08T20:22:00.000Z"
date_start_actual: "2026-11-08T20:22:00.000Z"
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

# Feature Request

## What do you need built?

Feedback (Sawyer, 2026-11-08): "Adding new nodes when editing a graph causes them to overlap. Need to recalculate when new nodes are added, respecting node boundaries and branch flattening settings, etc."

Spec (settled in grill, 2026-11-08):

- This is the **fourth approved exception** to "settled nodes never move", after the force-balance slider, the flatten slider and the edge-kind / Links-pull toggles.
- After any **structural edit** in 3D edit mode, re-settle **everything loaded**, respecting plate extents and the flatten setting, the way the other three exceptions do. Structural edits are anything that changes the outline's shape: adding a child, sibling or parent (Tab, Enter, Mod+Enter), moving or re-levelling a line (drag-drop menu), deleting a line.
- Sawyer: "Re-settle everything, but make sure the camera stays with/tracks the node we're editing so resettling doesn't cause it to get lost." While the re-settle runs, the camera **follows the node being edited** (or the newly added node whose editor opens). It keeps its offset and orientation to that node as the node moves. The user's own orbit and zoom input still work during it.
- **Text-only edits** (changing a line's words) are not structural and must not re-settle.
- A re-settle adds no back/forward history entry, and it does not renew the flat ring's phase (the ring only turns to face the camera on a refocus).

## What problem does this solve?

New lines are seeded near their parent (`positions.ts`, `SEED_SPREAD`) and then pinned once the editor opens, while every other node stays pinned where it settled. Nothing makes room for them, so a burst of new siblings overlaps its neighbours.

## What's your current workaround?

Nudge the force-balance or flatten slider in Overlays to force a re-settle.

## Reference Attachments/Screenshots

None.

## Batch implementation notes (awaiting manual test)

### Cause

A structural edit's reload keeps every existing node where it is (`placeNodes`), seeds each new line 10 units from its parent (`SEED_SPREAD`), `seedClear` moves it beside the parent in the screen plane, and opening the editor pins it there (`setEditing`). Everything else is already pinned, so nothing makes room: the many-body force only acts on free nodes and their notes (`settle.ts`), and a new line pinned at its seed spot is never laid out in its flat slice. A burst of new siblings therefore piles up on its neighbours.

### Approach

- **What counts as structural is judged from the result, not the action.** `outlineChanged(before, after)` (new `src/graph3d/outline.ts`) compares each note that is loaded in both models: its lines in document order, each with its parent's index and its text. It is structural when the shape (the parent indices) differs, or when the same texts come in a different order (a move among siblings, which leaves the shape alone). Rewording a line changes only its own text, so it is never structural. Notes that load or unload don't count, so typing a `[[link]]` that brings in a note doesn't re-settle.
- **Which reloads are judged:** only those after an edit made in this view (`editLanded`, set in `commitLines`, the cross-note `moveLine`, `linkLines` and undo/redo `step`). An edit made in another pane doesn't re-settle. The flag is consumed by the reload that completes, so a reload superseded by a newer one (`loadSeq`) hands it on.
- **The re-settle** is `Graph3DScene.reshape(true, true)`, called in `reload` after `openPending` has seeded the new line. With `edit`, `reshape` frees the line being edited too and sets `editSettling` until `settle()` (engine stop) pins everything again. While `editSettling`, `setEditing` doesn't pin the line the editor opens on.
- **Camera tracking:** `follow` gained a `track` flag. A track is the existing follow (the camera moves by however much its node moved each frame, so it keeps its offset and orientation), except that `cancelFlight` (every orbit, pan, wheel, pinch, stick or flight-key input) doesn't end it. It ends when its node is pinned, departs, or a flight or edge ride starts. It begins on the scene's focused node, which `place()` has just set to the edited line (the new line, the moved line, or after a delete the selected line or the note). An editor opening during the settle moves the track to its line. A save gives the line a new ID, and the track moves to the successor (`setData`). An edit's turn or pan (`glide`) under way is shifted along with the node (`shiftGlide`), and so is the pivot of a drag or orbit coast, so the user keeps orbiting what they pressed. `seedClear` resets the track's last position, so the seed's jump isn't followed.

### Decisions worth remembering

- **The edited line is released too, not kept pinned.** Kept pinned, a new line would stay where `seedClear` dropped it, off its flat slice, and the neighbours would only push away from it. That is the overlap Sawyer saw. Released, forces and `flattenStep` place it like any other line, and the camera tracks it so the editor stays on screen (the near tier keeps the editor over its plate every frame).
- **Judge by `outlineChanged`, not by edit kind.** Undo and redo, and a reword that turns a list line into a heading (which moves its subtree), are judged by what they did, and "text edits don't re-settle" holds by construction. Reordering two siblings with identical text isn't detected. That case is harmless.
- **No coalescing.** A re-settle only reheats the same simulation, so rapid edits don't add up: each one restarts the cool-down and the per-tick cost is that of one re-settle (all loaded nodes in the many-body force, the same as the three slider/toggle exceptions). Each structural reload calls `graphData` twice (`setData`, then `reshape`), which is O(n) once per edit, not per tick. The per-frame addition is one vector add (`followMove`), so `measure-graph3d-ticks` was not run.
- **No history entry and no ring turn.** Tracking moves the camera without `navigate`, and `reshape` → `pushData` → `capturePhases` keeps each core's ring phase (only `faceNote` renews one, on refocus).
- The `reshape` comment now lists **four** exceptions.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/outline.ts` (new) | `outlineChanged`: structural vs text-only edit |
| `src/graph3d/outline.test.ts` (new) | add sibling/child, delete (incl. last line), re-level, sibling move, cross-note move, heading→list, reword, load/unload |
| `src/graph3d/flight.ts` | `shiftGlide`: carry an edit's turn along with its moving node |
| `src/graph3d/flight.test.ts` | `shiftGlide` keeps the pose's offset |
| `src/views/Graph3DScene.ts` | `reshape(followFocus, edit)`, `editSettling`, `follow.track`, `followMove`, `cancelFlight` keeps a track, `setEditing` tracks instead of pinning during a settle, track retargets on a save's new ID, `seedClear` resets the track, drag/coast pivots move with a track, comment lists four exceptions |
| `src/views/Graph3DView.ts` | `editLanded` flag (set by `commitLines`, `moveLine`, `linkLines`, `step`), `reload` judges `outlineChanged` and calls `reshape(true, true)` after `openPending` |

### Fixture

None new. Use `vault/tests/graph3d/Sailing Basics.md` and `vault/tests/graph3d/Galley Handbook.md`.

### Manual test steps

Open Sailing Basics in the 3D graph and turn on edit mode. Select a line by clicking its plate.

1. **Rapid Enter ×5:** press Enter, type a word, Ctrl+Enter, and repeat five times. Each new sibling ends up clear of its neighbours, with no plates overlapping once the layout cools. The line you are typing in stays put on screen while the graph moves around it. Typing doesn't stutter.
2. **Tab child:** select a line and press Tab. A child appears, its editor opens, and the graph re-settles around it. The editor stays on screen.
3. **Mod+Enter (insert parent), Alt+arrows (move/indent/outdent), drag-move:** each re-settles, and the camera follows the moved line. Drag a line onto a plate in Galley Handbook (cross-note move): both notes re-settle.
4. **Delete** a line (Delete key or menu): the graph closes the gap. The camera tracks the line that is selected afterwards.
5. **Text-only edit:** F2 on a line, change a word, Ctrl+Enter. Nothing else moves.
6. **Flatten 1.0 while adding:** set Overlays → flatten to 1.0 and add siblings and children. New lines take their place in the slice in document order, not off to one side. The ring doesn't rotate.
7. **Orbit and zoom during the settle:** right after an Enter, drag to orbit and scroll to zoom. Both work, and the edited line doesn't drift away.
8. **Undo** (Mod+Z) an add: the graph re-settles. Undo a reword: nothing moves.
9. **History:** after several edits, press ← (back). It goes to the place you were before the edits. The re-settle added no steps.
10. **Regression:** the force-balance and flatten sliders and the edge toggles still re-settle as before, and the line being edited stays pinned during those.

### Not verified

Nothing was run in Obsidian. Things to watch:
- With the edited line free, its plate (and the editor over it) moves in the world while the camera tracks it, so it should look still on screen. A long first settle on a large world (depth 2+) may feel floaty.
- Tracking starts on the scene's focused node after `place()`. If that is not the line Sawyer expects after a delete (the next line, or the note when nothing is selected), say so.
