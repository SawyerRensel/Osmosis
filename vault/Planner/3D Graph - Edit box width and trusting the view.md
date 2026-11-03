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
status: In-Review
priority:
progress:
date_created: "2026-11-03T17:35:29.000Z"
date_modified: "2026-11-03T18:05:25.000Z"
date_start_scheduled: "2026-11-03T17:54:18.000Z"
date_start_actual: "2026-11-03T17:54:18.000Z"
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

## Batch implementation notes (awaiting manual test)

**Built** on `fix/3d-graph-edit-box-view` (stacked on the Phase 8 tip `39c60e7`), code commit `b2a207f`. Not pushed, no PR, not tested in Obsidian.

### 1. Edit box width

**Cause.** The ticket's guess was close but not quite right. The box was not measured only once: with `width: max-content` the browser re-sizes it on every layout. The real cause is that inside Obsidian, CodeMirror gives a shrink-to-fit parent none of its text's width. The screenshot shows this: the box is about 42 px wide at about 2.8× scale, so about 15 px laid out. That is the box's border and padding alone (4 px + 0.8 em), with a text width of zero. A new line's plate is empty, so the plate `min-width` was 0 too, and every character wrapped. An existing line wrapped at its plate width. The 2D mind map hit the same wall long ago, and its `resizeEditContainer` sets an explicit width from the text for that reason. I could not read Obsidian's own CSS (it lives outside the repo), so I have not found which rule zeroes the editor's contribution.

**Fix.** `Graph3DEditor.fitWidth` sets the box's width inline from its text, the way a plate is sized:
- The text's width is measured on a shared canvas, in the font of the first `.cm-line`, or of its `.cm-header` span for bold heading text.
- The chrome (everything between the box's edge and the text) is read off the layout as `box.offsetWidth - line content width`.
- Pure `fitEditWidth` (`graph3d/edit.ts`) adds 4 px of slack and clamps the result between the plate's width (min) and the CSS `max-width: 20em` (max). Past 20em the text wraps.
- It runs on every doc change (`onChange`) inside CodeMirror's measure cycle (`requestMeasure`), so the new width lands before the frame paints. It also runs on open and on `setPlate`.
- The textarea fallback is sized the same way.
- Plate scaling is untouched (`place` still scales the box).
- The 2D overlay is untouched: `MindMapView` is unchanged, and the only CSS edit is a comment in `.osmosis-graph3d-edit-box`.

### 2. Trusting the view

`Graph3DScene.setEditing` no longer flies, and `Graph3DNear.readable` is gone. Add, edit (F2, double-click), retype and indent all go through `setEditing`, or through no camera code at all (indent and outdent open no editor).
- **Desktop:** the camera stays put unless the line is off screen. "Off screen" means its plate, plus 48 px, is not wholly inside the view (`plateInset`). Then the camera turns where it stands (`turnToSee`): the view direction swings along the shortest arc toward the line and stops as soon as it is in. Position and orbit distance are unchanged, so there is no zoom and the mist does not change.
- **Phone (`centre`):** the camera pans the line onto the view's centre line (`panOnto`). This is a sideways move only, so the line keeps its depth and the camera never zooms in. The existing keyboard view offset (`setVisibleBand`) then puts that centre mid-way down the part above the keyboard. If the line is behind the camera, it turns first, then pans.
- Both moves are a 400 ms eased `glide` (`glidePose`, `graph3d/flight.ts`) to a fixed pose, run in `steerFlight`. Any user input cancels it (`cancelFlight`), and so does a hop's flight.

### 3. Seeding

`seedClear` now calls `seedBeside` (`graph3d/framing.ts`):
- The new line goes `linkDistance` from its parent, in the plane through the parent that faces the camera, so it sits at the parent's depth.
- It tries 12 directions: right first, then alternately below and above (−30°, +30°, −60° …).
- The first direction whose spot is clear of every other on-screen node by half the seeding distance on screen wins. Failing that, the clearest one does.
- A spot inside the view beats one outside it.
- With an empty screen the line goes to the right, as in the mind map.

### Decisions worth remembering

- **Measure, don't fight CodeMirror's CSS.** Another selector would have been a guess about Obsidian's stylesheet. The 2D map's explicit width is proven, and a canvas measure is cheap and needs no extra DOM.
- **The phone always pans the line to the centre** (unless it is already there), rather than only when the keyboard would cover it. At `setEditing` time the keyboard is not up yet and its size is not known. Centring is also what the band offset is built around, so the result is predictable.
- **"Off screen" includes a 48 px margin and the plate's half-size.** A line whose centre is just inside the edge, but whose plate is cut off, still counts as off screen. The inset is capped at 80% of each half of the view.
- **The turn takes the shortest arc toward the line**, which is the minimal turn in angle. Exactly behind the camera, it turns about the camera's up, like a person turning round.
- **Seeding direction: right first, then the freest.** The fixed preference keeps the result predictable. "Free" counts every node drawn on screen, nearer or farther: a farther plate under the spot would be covered, but it still makes a confusing pile.
- **Overturned (Sawyer):** the anchoring ticket's "desktop flies when the text is unreadably small or off screen; a phone always flies to centre", and Phase 7 slice 5's random seeding direction. Test 3 of the anchoring ticket ("F2 on a far line flies in") no longer holds: the editor now opens small, where the line is.
- **Unchanged:** a double-click still starts with a click, and that click hops (a flight). The second press cancels the flight, so the view can still lurch a little on a double-click. F2 does not lurch.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/framing.ts` | New, pure: `CameraPose`, `project`, `inView`, `plateInset`, `turnToSee`, `panOnto`, `seedBeside` |
| `src/graph3d/framing.test.ts` | New: 18 tests |
| `src/graph3d/flight.ts` | `Glide`, `glidePose` |
| `src/graph3d/flight.test.ts` | 2 tests for `glidePose` |
| `src/graph3d/edit.ts` | `fitEditWidth` |
| `src/graph3d/edit.test.ts` | 5 tests for `fitEditWidth` |
| `src/views/Graph3DEdit.ts` | `fitWidth`, `measureWidth`, shared canvas measurer, `textarea` field; `onChange` re-fits |
| `src/views/Graph3DScene.ts` | `setEditing` turns or pans instead of flying (`showEdited`), `glide` in `steerFlight`/`cancelFlight`, `cameraPose`, `plateInset`, `seedClear` uses `seedBeside` |
| `src/views/Graph3DNear.ts` | `readable` removed (now unused) |
| `src/views/Graph3DView.ts` | `openEditor` doc comment |
| `styles.css` | Comment on the 3D edit box's `width: max-content` (now only the starting width) |

### Fixture

No new fixture; the existing ones cover it. Use `vault/tests/graph3d/Watch Bill.md` (headings, a nested list, a checkbox), which has a good mix of short and long lines. For the 2D check, use `vault/tests/mindmap/move-nodes.md` as a mind map. Reload Obsidian (Ctrl+R) first.

### Manual test (Sawyer)

Desktop: open `Watch Bill.md`, run "Open 3D graph for current note" (depth 1), turn on the pencil. Stay at a mid distance, where plates are small.
1. **Width.** Click "Log the wind", press Tab, and type "Gust log every hour on the half hour, and the barometer too". Expected:
   - The box widens with each character and does not wrap until it is about 20em wide, then grows down.
   - The camera does not move at all.
   - The new plate sits beside "Log the wind" on screen (to its right if that spot is clear).
   - Ctrl+Enter saves, and the plate shows the text where the box was.
2. **Enter, F2, indent.** Enter on "Check the anchor light": the sibling appears beside its parent on screen, and the camera does not move. F2 on a long existing line: the box opens at the plate's width (or wider, up to 20em, if the text needs it), and the camera does not move. Alt+Right / Alt+Left: no camera move. Zoom far out and F2 a far line: no fly-in. The editor is small but still on its plate.
3. **Off screen.** Orbit so a line sits at the very edge, partly cut off, and press F2. Expected: the camera turns in place (no zoom, the mist does not change) just enough to bring the whole plate in, with a small margin. Then select a line whose parent is at the screen edge and press Enter. The new line should land on screen (it picks a free spot in view); if it cannot, the camera turns just enough.
4. **Seeding direction.** Press Enter several times on the same line: each new sibling picks a different free spot around the parent instead of piling up.

Phone:
5. Turn on the pencil, tap a line in the lower half of the screen, then double-tap it (or tap, then Enter on a hardware keyboard). Expected: the camera pans sideways, without zooming in or out (plates keep their size), so the line ends up mid-way above the keyboard with the editor on it. Typing widens the box as on desktop.

2D regression:
6. Open `vault/tests/mindmap/move-nodes.md` as a mind map, select a node, press Tab, and type a long sentence. The edit box looks and grows exactly as before. Double-click an existing node to edit it: unchanged.

### Not verified

Nothing has run in Obsidian. In particular:
- Which Obsidian rule makes CodeMirror contribute no width (the fix does not depend on it).
- The canvas measurement against live-preview rendering. On list lines it slightly over-measures (the raw `- ` plus the hanging-indent padding), which leaves a little extra room but no wrap. Bold or italic spans inside a line are measured in the line's regular weight; the 4 px slack may not cover a long bold run, which would wrap a word early.
- `requestMeasure` timing (no visible wrap flicker as you type).
- The turn near straight up or down, where OrbitControls clamps the polar angle.
- The pan with the keyboard offset on a real phone.

Lint, the full suite (79 files, 2,419 tests) and the build pass.
