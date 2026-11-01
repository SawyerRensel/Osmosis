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
status: In-Review
priority:
progress:
date_created: "2026-11-01T02:05:00.000Z"
date_modified: "2026-11-01T02:25:04.000Z"
date_start_scheduled: "2026-11-01T02:08:13.000Z"
date_start_actual: "2026-11-01T02:08:13.000Z"
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

> [!important] Deliberate exception: the force slider moves settled nodes
> Batch 1's rule is that **settled nodes never move**. Dragging the Overlays menu's **Hierarchy ⟷ organic** slider is the one deliberate, explicit exception (Sawyer, 2026-11-01): it unpins every loaded node and re-settles them under the new link weights, live, as you drag (`Graph3DScene.reshape`, called from `setOverlays` only when `forceBalance` changes). Hops, edits, undo, data updates and every other overlay keep settled nodes still. Do not "fix" this back, and do not extend it to any other path.

## Batch implementation notes (awaiting manual test)

**Built** on `fix/3d-graph-editor-anchoring` (cut from `feature/3d-graph-phase-7`), code commit `1b33c38`. Not pushed, no PR, not tested in Obsidian.

### 1. Editor anchored to its plate

**Why the box was offset and smaller.** Slice 3 measured the node's screen box once, when the editor opened, and fixed an unscaled box there on `document.body`; only a *press* blurred it (and saved), so the wheel, pinch, keys and joysticks moved the camera with the editor left behind. The first screenshot fits this exactly: the editor's box (left 468, right 938, top 465) and the plate as shown (502–1066, top 468, 68 px tall) are one box scaled 1.2× about the point (298, 450), both x-edges giving the same point. That is a zoom toward the cursor after the editor opened, not a measuring error: the box was right when placed and the camera moved. It was also smaller because its text was always `--font-text-size`, whatever the plate's text size.

**Why "sometimes the node moves".** Three causes, none a placement-carry bug:
- The node was still free. After opening the graph or a hop, new nodes settle for up to 15 s before `settle()` pins them; an editor opened in that window watched its node drift away.
- A double click starts with a click, which hops: the camera flies toward the line until the second press cancels it, so the view lurches on every double click. Unchanged (it is the hop), but harmless now that the editor follows the plate.
- A race on save: a reload already under way when the save wrote could read the new bytes and seed the line's successor beside its parent before `edited` said where it goes; the edit's own reload then found the new ID already placed and did not carry it.

**The fix.**
- `Graph3DEditor` (`Graph3DEdit.ts`) mounts in the scene's stage, not on `document.body`: a zero-size anchor (`.osmosis-graph3d-edit`) and a box laid out exactly as the node's near-tier panel is (16 px text, the plate's width and height as minimums, the plate's corners, 20 em max), so text laid out there lands at the plate's text size. `Graph3DNear.update` places it every frame (`placeEditor`): centred on the projected node, scaled by `panelScale`, faded into the mist with the plate (focus dim left out so the line being typed stays readable), hidden by opacity behind the camera. The save and cancel buttons stay 28 px over the box's top corners at any zoom.
- `Graph3DScene.setEditing(id, editor, centre)` pins the node where it is (so a settling layout can't carry it off, and the carry on save puts its successor on the same pinned spot), stops a flight elsewhere, and flies to the node when `centre` (phones) or when its text would be smaller than a panel's entry size or off screen (`Graph3DNear.readable`).
- **Camera moves no longer blur-save.** While editing, a `mousedown` anywhere in the stage outside the editor is `preventDefault`ed, which keeps the focus in the editor through orbit, pan, pinch, joysticks and corner buttons; the wheel never blurred. A *click* on the canvas (a press that stays within the 6 px slop) still saves first (`onClickWhileEditing`), then hops as before. Focus leaving for anything outside the stage (Overlays menu, header, another tab) still saves on blur.
- **Reloads wait for the save** as well as the open editor (`saving` counter), and `commitEdit` drops a reload already under way (`loadSeq++`) before it writes; the edit's own reload replaces it.
- **Phone keyboard.** As before the WebView overlays the keyboard (`overlaysContent = true` on Android, the mind map's recipe). The editor reports the part of the window left visible (`visibleBand`: the visual viewport less the VirtualKeyboard rect) through `onVisibleBand`, and the scene shifts the picture up by `bandOffset` with `camera.setViewOffset`, so the camera's centre, where the edited line is after the flight, sits mid-way down the visible part. Cleared when the editor closes and re-applied on resize. iOS has no VirtualKeyboard API: if the WebView resizes, the stage shrinks and the line stays centred anyway; if only the visual viewport shrinks, the band covers it.

### 2–5. Overlays

- **Bloom removed**: the toggle, the `UnrealBloomPass`/`OutputPass` code and the `bloom` field. `normalizeOverlays` builds a fresh object, so a saved `bloom: true` loads and is dropped on the next save (unit-tested).
- **Row radius**: `.osmosis-graph3d-overlays .setting-item` gets `border-radius: var(--radius-s)` (class doubled to outweigh Obsidian's rule without `!important`).
- **Attachments**: `DEFAULT_OVERLAYS.edges.attachment = false`. `visibleModel` (pure, `overlays.ts`) drops attachment nodes that only attachment edges reach, with those edges; the view builds its model through it, so plates, picks, panels, hops and link clicks all agree (a click on a link to a hidden attachment opens it in a tab, as for any file not shown). Toggling Attachments reloads the loaded area; settled nodes stay put, re-shown attachments arrive and settle like any arrival. An attachment a frontmatter property also links to stays, with only the property edge drawn. "Unresolved links" still hides edges, not ghost nodes.
- **Force slider**: the value did reach the force model: `setOverlays` re-weights `linkForce.strength`, d3 re-initialises the strengths, and `linkStrength` reads the new `forceBalance`. The identical screenshots were only the settled-node rule: every node was pinned and the simulation had stopped, so nothing re-ran. Now `reshape()` unpins every loaded node except one being edited, rebuilds the many-body set and reheats (`pushData`), and the camera follows the focused node until `settle()` pins everything again. The slider sends every step (`setInstant(true)`). New description: "Left keeps each note's mind-map shape; right lets links shape the web. Moving it re-settles the loaded notes as you drag."

### Decisions worth remembering

- **A dedicated tracked box, not the panel itself.** Making the near-tier panel editable needed an exception at every step of its lifecycle: panels are chosen per frame by text size and budget (and none exist with Labels set to plates only), render asynchronously, cross-fade in, are removed when they leave the tier, are hidden by the CSS2D renderer with `display: none` behind the camera (which takes the focus, and a blur saves), get nearer plates cut out of them by a mask, and are veiled by the mist. The editor instead uses the panel's own layout numbers and `panelScale`, placed from `Graph3DNear.update` with the same camera, so it lands on the same pixels and moves, scales and hides with the plate, with none of those exceptions.
- **The editor draws over everything in the scene**, panels and nearer plates included, so you always see what you type. Corner controls stay above it.
- **Focus dim is not applied to the editor**; the mist is.
- **Desktop does not move the camera on edit** unless the text would be unreadably small or off screen. A phone always centres the line (the keyboard takes half the screen).
- **Pinning the edited node is permanent**: it would have been pinned when the layout cooled anyway.
- **The slider exception skips the node being edited** and only runs when `forceBalance` changes. A slider move in one 3D view re-settles every open 3D view (it is one shared setting).
- **No migration for Attachments**: a data.json that already saved Attachments on keeps it on. Sawyer's last saved state (the screenshot) was off.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/edit.ts` | `editBoxGeometry`, `fitEditTop`, `Box`, `EditBounds` removed; `editorAnchor`, `EditorPlace`, `visibleBand`, `VisibleBand`, `bandOffset` added |
| `src/graph3d/edit.test.ts` | 7 old geometry tests replaced by 8 for the new helpers |
| `src/graph3d/overlays.ts` | `bloom` removed; Attachments off by default; `visibleModel` |
| `src/graph3d/overlays.test.ts` | bloom dropped on load, default edges, `visibleModel` (3 new) |
| `src/views/Graph3DEdit.ts` | Rewritten: mounted in the stage, `TrackedEditor` (`setPlate`, `place`), buttons placed per frame, `onVisibleBand` |
| `src/views/Graph3DNear.ts` | `TrackedEditor`, `setEditing(node, editor)`, `placeEditor`, `readable`; `panelRect` removed |
| `src/views/Graph3DScene.ts` | Bloom removed; `reshape`; `setEditing(id, editor, centre)` pins and may fly; stage `mousedown` guard; `onClickWhileEditing`; `setVisibleBand` / view offset; `nodeScreenBox` removed |
| `src/views/Graph3DView.ts` | Editor wiring, `saving` gate, `loadSeq++` in `commitEdit`, `visibleModel` in `reload`, reload on an Attachments toggle |
| `src/views/Graph3DOverlays.ts` | Bloom row removed; slider description, `setInstant(true)` |
| `styles.css` | `.osmosis-graph3d-edit` anchor and box, button positioning; Overlays row radius |

### Fixture

None new; existing ones cover it. Editing: `vault/tests/graph3d/Chart Table Notes.md` (slice 3). Attachments: `vault/tests/graph3d/Knots.md` (embeds `knot-diagram.svg`) and `Signal Flags.md` (flag SVGs). Slider: any area, e.g. `Sailing Basics.md` at depth 2. Reload Obsidian (Ctrl+R) before testing.

### Manual test (Sawyer)

Desktop:
1. **Anchored.** Open `Chart Table Notes.md`, "Open 3D graph for current note", turn on the pencil. Fly near "Anchored in the lee of the island" and double-click it. Expected: the editor sits on the plate, same size of text, outlined in the accent colour, its Save/Cancel buttons above its corners. Wheel-zoom in and out, orbit with a drag, pan with Shift-drag or right-drag (WASD types into the editor, so it does not fly while editing): the box stays on the plate, grows and shrinks with it, fades into the mist and hides when the plate goes behind you. The editor stays open throughout, with the cursor where it was.
2. **Not moved.** Save with Ctrl+Enter: the plate shows the new text exactly where it was and stays selected. Repeat straight after opening the graph (within the first seconds, while things settle): the edited plate stays put.
3. **Far line.** Click a far line (it becomes focused), zoom far out, press F2: the camera flies in to it and the editor is readable.
4. **Click away.** With the editor open and text changed, click empty space or another line: it saves, then hops. Escape cancels; the x and check buttons work.
5. **Still works.** Outside the editor: single click hops, double click edits, a checkbox ticks, link drag (slice 4) from a line to another line still links.

Phone:
6. Turn on the pencil, double-tap a line. Expected: the camera flies to it; when the keyboard comes up, the picture shifts so the line sits in the middle of the area above the keyboard, with the editor on it. Orbit with one finger, pinch, use the joysticks: the keyboard stays up and the editor follows the plate. A tap elsewhere saves and hops; the check button saves, the x cancels; after closing, the picture drops back.

Overlays:
7. Open the Overlays menu: no Bloom; the rows' rounded boxes have small corners like Obsidian's settings.
8. Open `Knots.md` at depth 2. With Attachments off (the default on a fresh data.json), the diagram plate is gone, not just its edge. Turn it on: the plate and edge arrive near Knots; off again: both go. Nothing else moves. Unresolved links off still leaves ghost plates.
9. Drag the Hierarchy ⟷ organic slider from 0.5 to 0 and to 1: the loaded nodes visibly re-settle as you drag (each note tightening into its mind-map shape at 0, links pulling notes together at 1), the camera stays on the focused node, and everything settles still again within ~15 s. Then hop or edit: settled nodes don't move.

### Not verified

Nothing has run in Obsidian. In particular: CodeMirror under a CSS `scale()` transform (selection and click placement; CodeMirror 6.38 supports transforms, but the embeddable editor has not been tried scaled); that `preventDefault` on `mousedown` keeps the focus for a tap on Android and iOS; the VirtualKeyboard `boundingRect` and the off-centre projection on a real phone, and what iOS does with the layout; `max-content` sizing of the box around CodeMirror (it may hug the plate's width and wrap instead); the Overlays row radius against Obsidian's own rule (selector specificity unverified); the slider's live re-settle cost on a large area (it unpins everything, so the full many-body force runs until it cools). Lint, the full suite (2,300 tests) and the build pass.
