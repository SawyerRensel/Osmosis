---
title: 3D Graph - Arrow-key navigation
summary: "3D: plain arrow keys move the selection to the related plate (parent, child, sibling or linked line) closest to that direction on screen, Shift+arrow extends the selection the same way, and the camera glides to centre the new primary without turning. Parity with the 2D mind map's arrows."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Multi-select]]"
status: In-Review
priority:
progress:
date_created: "2026-11-09T12:52:34.000Z"
date_modified: "2026-11-09T13:05:00.000Z"
date_start_scheduled: "2026-11-09T12:52:34.000Z"
date_start_actual: "2026-11-09T12:52:34.000Z"
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

Arrow-key navigation in the 3D graph, for parity with the 2D mind map (which already has arrows and Shift-extend). Spec settled by Sawyer on 2026-11-09:

1. **Screen-relative.** With a selection (the primary is `selectedNodes()[0]`, which is `focusId`), each plain arrow key moves the selection to the **candidate closest to that direction on screen**.
   - Candidates are the primary's parent, children, link targets and sources (any edge touching it), and its siblings (nodes sharing its parent).
   - Each candidate is scored on its projected screen vector from the primary: angle to the arrow's direction, plus distance. Anything more than ~60–70° off-axis is ruled out; smaller angles win, then shorter distances.
   - If nothing lies in that direction, nothing happens.
   - Candidates behind the camera or not rendered (hidden by a toggle) are skipped.
2. **Shift+arrow** extends the multi-selection the same way: the found node is added and becomes the new primary, and the rest stay selected. Moving onto an already-selected node just makes it primary.
3. **The camera follows.** It glides to centre the new primary, keeping the current viewing distance and orientation: camera and target translate together with no turn, so screen "up" stays stable from hop to hop. A short eased glide. History follows whatever a plate click does.
4. **Keys** are registered in the view's Scope. Alt+arrows (structural) and WASDQE (flight) are untouched. Arrows do nothing while a node editor or input is focused, when the graph view isn't active, or with no selection.
5. The selection doesn't change the focus note (focus changes only on purpose).
6. 2D is unchanged.

## What problem does this solve?

Moving around a note's lines in 3D needs the mouse today. The 2D mind map lets you walk the tree with the arrows; the 3D graph should too, and Shift+arrows should build a selection for the multi-select actions.

## What's your current workaround?

Clicking plates one by one, and Shift+click to build a selection.

## Reference Attachments/Screenshots

2D reference: `MindMapView.ts` arrow handling (~6599-6611).

## Batch implementation notes (awaiting manual test)

Commit d6743f6 on `feature/3d-graph-arrow-nav` (cut from `fix/3d-graph-mouse-look-ease` at 6371be5).

**Keys:** ←↑→↓ move the selection to the related plate closest to that direction on screen; Shift+←↑→↓ add it to the selection as the new primary.

**Approach.** The pure module `src/graph3d/arrow-nav.ts` has two functions. `arrowCandidates(id, edges)` returns the primary's parent, children, the other end of every other edge touching it (link, embed, property, tag, attachment, in either direction) and its siblings, each once. `pickInDirection(offsets, arrow)` takes each candidate's screen vector from the primary and returns the best id or null. The scene's `arrowTarget(arrow)` projects the primary (`selectedNodes()[0]`) and the candidates through the camera. `glideTo(id)` makes the node the focused node and starts a `Glide` that moves the camera and the orbit target together by the step from the target to the node. In the view, `arrowKey` (registered on the view's Scope, plain and Shift for each arrow) selects the result (alone, or added) and calls `navigate(..., glide = true)`. The `glide` flag rides in the view state to `travel`, which calls `glideTo` instead of `flyTo`.

**Decisions worth remembering**

- **Scoring:** score = screen distance × (1 + 4 × angle in radians), lowest wins. Anything more than 65° off the arrow's axis is out, and so is a candidate drawn exactly on the primary. Equal scores go to the candidate listed first: parent, then children, then edge neighbours, then siblings, in edge order. At weight 4, a plate 45° off counts 4.1 × its distance and one 10° off 1.7 ×. So a plate squarely in the direction beats a nearer one well off it, and a plate a few degrees off beats one straight on but much farther.
- **History: each arrow hop is a back/forward step**, because a plate click is (`visit` → `navigate`). Shift+arrow is a step too, unlike Shift+click (which doesn't move the camera). Shift+arrow does move it, so back returns the camera to the previous plate. Back/forward themselves still *fly* (`glide` is not kept in `getState`).
- **Study mode:** an arrow hop does not count as clicking the plate (it doesn't call `study.clicked`). It is like arriving by an edge ride, so a hidden card stays hidden until clicked.
- **No turn, no zoom:** the camera keeps its offset from the orbit target. If you have zoomed so the target is not on the plate, the node lands where the target was (screen centre at the target's depth). The glide is the edit glide's 400 ms ease-out (`GLIDE_MS`) and is not scaled by the travel-speed slider. A node still settling is followed during the glide and after it (`follow.steer`, the same `shiftGlide` path the edit track uses), until it is pinned. Any pointer input cancels it, as with a flight.
- **Skipped candidates:** behind the camera, fading out (`departing`, `opacity <= 0`, which covers plates hidden by an Overlays toggle) or not placed yet. Plates past the mist are *not* skipped: the spec named only behind-camera and hidden. A primary behind the camera makes the arrows do nothing.
- **Edges hidden by the Overlays edge toggles still count** (the Hierarchy toggle only hides the drawing, and parent/child must still work). Only the plates' visibility filters candidates.
- **Key guards:** nothing happens while the line editor is open, while focus is in an input, textarea, contenteditable or select (an Overlays slider keeps its arrows), or with no selection (the key goes on). With a selection but nothing in that direction, the key is consumed and nothing happens. Scope keys only fire while the 3D view is the active leaf. Alt+arrows (structural) and WASDQE (flight) are untouched, and so is 2D.
- **Rapid presses:** the primary (`focusId`) updates when `travel` runs, after `leaf.setViewState` resolves. A plain arrow replaces the selection at once, so repeated presses chain correctly. A Shift+arrow pressed again before the previous step lands would still start from the old primary. I have not seen this, but it is untested.

## Surface map

| File | Change |
|---|---|
| `src/graph3d/arrow-nav.ts` | New: `arrowCandidates`, `pickInDirection`, `MAX_OFF_AXIS_DEG` (65), `ANGLE_WEIGHT` (4) |
| `src/graph3d/arrow-nav.test.ts` | New: 12 unit tests (each ± axis, nothing in the direction, the 65° cutoff, on-the-primary skip, exact tie, nearer on the same angle, far on-axis vs near off-axis both ways, sibling vs child, candidate gathering) |
| `src/views/Graph3DScene.ts` | `glideTo`, `arrowTarget`, `follow.steer` (the glide moves with a settling node) |
| `src/views/Graph3DView.ts` | `arrowKey` on the Scope (plain and Shift arrows), `navigate`/`travel` take `glide`, `setState` passes it on |

## Test fixture

No new fixture: `vault/tests/graph3d/Sailing Basics.md` (depth 1+, so Knots is loaded) and `vault/tests/graph3d/Galley Handbook.md`.

## Manual test steps

Open `Sailing Basics.md` in the 3D graph at depth 1. Click the "Every sailor learns [[Knots]] first" plate to select it.

1. Press the arrow that points at its sibling "Good habits #seamanship" on screen: the selection border moves there, and the camera glides about 0.4 s to centre it **without turning**. Press the arrow toward its child "Check the weather…": it moves down into the child. Press the arrow toward the parent (the H1 root): it moves up.
2. Back on "Every sailor learns…", press the arrow toward the Knots note plate (the link edge): the selection crosses the link and the camera glides there. The focus note (tab title) stays Sailing Basics.
3. Press an arrow pointing where no related plate lies: nothing happens.
4. Orbit so the graph is at an odd angle, then arrow around several times: screen up stays the same from hop to hop, and the viewing distance doesn't change.
5. Shift+arrows: each press adds the next plate, which becomes the primary (Copy with Ctrl/Cmd+C lists the primary's note first). Shift+arrow onto a plate already selected only makes it primary; nothing is removed. A plain arrow afterwards selects one plate alone.
6. Open Galley Handbook. Walk a long list with the arrows (siblings), then press ← (Obsidian back, or the back button): the camera returns to the previous plate, one step per arrow press.
7. Edit mode: F2 on a line, press the arrows inside the editor: the caret moves and the selection doesn't. Same in an Overlays slider (focus it, arrows change the value).
8. Esc clears the selection; then the arrows do nothing.
9. Regressions: Alt+←/→/↑/↓ in edit mode still outdent, indent and move. WASDQE flight still flies. A plate click still flies (with a turn) and records history. Shift+click still toggles. Esc clears the selection.

## What I could not verify

Everything in Obsidian (I cannot see it). That includes: how the 65° cutoff and weight 4 feel on real layouts; that the plain Arrow keys reach the view's Scope (no core hotkey on bare arrows in a non-editor view is expected); that a quick run of Shift+arrows chains from the newest primary; and that the glide looks smooth while nodes are still settling.
