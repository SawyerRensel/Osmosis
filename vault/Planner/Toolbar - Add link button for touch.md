---
title: "Toolbar - Add link button for touch"
summary: "A toolbar 'Add link' button (2D and 3D, edit mode): select a node, tap Add link, then TAP the target node to link them. A drag to navigate between the two must not count as picking a target."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Touch drag rotates and tap-hold multi-selects]]"
  - "[[Toolbar - Mind map toolbar sizing, buttons and icons]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-12T11:52:00.000Z"
date_start_scheduled: "2026-11-12T12:14:09.000Z"
date_start_actual: "2026-11-12T12:14:09.000Z"
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

## Sawyer's request (round 8 retest, 2026-11-12)

> Link lines on mobile should only trigger from a new "Add link" button in the mobile toolbar menu.

From the grill: **tap target**, in **both views**, with this note: "be careful to only apply target on a tap, distinct from a user tap-dragging to navigate to the node they want to link to."

## Behaviour
- New `TOOLBAR_GROUPS` entry "Add link" (`needsSelection`, `editOnly`, with a command so it can be hotkeyed; icon e.g. `link` or `link-2`, but check what fits beside the T63 icon set). It sits with the create buttons or right after them; record where.
- Tap it with a node selected and it lights up (`is-active`) to show you're in link mode, with a Notice or hint such as "Tap a node to link to". Then:
  - **Tap** another node → create the link. This is exactly what desktop drag-to-link creates in 3D. Find that code and reuse the same edit function.
  - **Drag / pan / zoom / rotate** → navigates as usual and does NOT pick a target and does NOT cancel link mode. Reuse the scene's click slop and `releaseIsClick` (3D) and 2D's tap detection.
  - Tap Add link again, tap empty space, press Escape or leave edit mode → cancel.
  - Tapping the source node itself → cancel (or ignore; record).
- **2D:** first find out what a "link" between two nodes means in 2D. Does 2D have relational/cross links (e.g. the 3D link line writes a `[[note#^block]]` or a relation into the source)? If 2D has the same edit function, wire it the same way. If 2D has no notion of a cross-link at all, implement the same underlying edit (whatever 3D writes into the markdown) so the button does the same thing in both views. Record what a link is.
- Works with a mouse too (the button is on desktop as well); desktop drag-to-link in 3D is unchanged.

## Code facts
- `src/views/ToolRibbon.ts` `TOOLBAR_GROUPS`/`ToolbarActions` (2D implements actions in `MindMapView.ts` ~:1939, **~84k tokens with NUL bytes**, so `grep -a -n` and small ranges only). 3D implements them in `Graph3DView.ts`.
- 3D tap/click: `releaseIsClick`, `linkClickAction` in `src/graph3d/links.ts`. 3D drag-to-link: grep `Graph3DScene.ts`.

## Context budget
Under ~130k tokens. Keep the pure "is this release a target pick?" state machine in `src/graph3d/` (or a shared pure module) with unit tests.

## Acceptance criteria
- Phone 2D and 3D edit mode: select A → Add link → drag around to find B (no link made) → tap B → link created, the same as the desktop result.
- Cancel paths work; reading mode has no button.

## Batch implementation notes (awaiting manual test)

Code: commit `6069490` on `feature/toolbar-add-link`. The whole ticket shipped.

### What a link is
The same thing in both views: `[[Note#^id|^N]]` (or `#Heading` for a uniquely named plain heading, or `[[Note]]` for a note/the 2D root) appended to the end of the source line, with a block ID stamped on the target if it has none. The 3D desktop drop menu's "Add link" writes exactly this. The pure edits were already shared (`src/graph3d/edit.ts`: `linkSubpath`, `appendInsertion`, `stampInsertion`; `src/graph3d/selection-edit.ts`: `planSelectionLink`), so nothing had to move. 2D had no cross-link notion before; it now calls `planSelectionLink` for one or many sources. 2D draws no line for a link: the new link shows as a `^N` link in the source node's text, the same as an existing one.

### Approach
- **Button:** `add-link` (icon `link`, label "Add link", command "Add link to node" → `mindmap-add-link`), `needsSelection`, `editOnly`, action `addLink`. It sits in its own group **right after Delete**: slot 9, the first button past the phone's eight. T63's eight-slot editing core is unchanged (its test still holds). Armed shows `is-active` + `aria-pressed` via a new `ToolRibbon.setActive(id, on)`.
- **State machine:** `src/link-pick.ts` `LinkPicker` (pure, `link-pick.test.ts`). `toggle(selection)` arms on a copy of the selection (nothing selected: stays off) or disarms; `tap({target, linkable})` → `pass` (not armed) / `link` (sources, target; disarms) / `cancel` (empty space or a source; disarms) / `ignore` (unlinkable plate; stays armed); `cancel()` for Escape etc.
- **Tap vs drag:** the views consult the picker only where a release has already been judged a tap. 3D: `Graph3DScene.click()`, reached only after `releaseIsClick` with `CLICK_SLOP_PX`, not after a hold (the hold timer nulls `press`) or a stopped coast. With `setLinkPicking(true)` the click calls `onLinkPick(pickedNode(...))` before anything else, so no checkbox, selection toggle, double-click, link follow or flight. 2D: top of `handleTouchTap` (pans set `panCommitted`, holds set `longPressTriggered`, and neither reaches it) and `handleClick` for the mouse (after the pan/drag and fold-toggle checks). Drags, pinches and holds run as usual and leave the mode armed. A hold still multi-selects, but the armed sources were fixed when it was armed.
- **3D link:** one armed line → `linkLines(from, to)`; several → `linkSelection(nodes, to)` (like the drop menu). Only line IDs are armed; a selection with no line gives "select a line first". Targets: lines and notes (`dropTarget`'s rule); a tag/file/other plate gives a Notice and stays armed.
- **2D link:** `linkNodes(sourceIds, targetId)`: `assertEditableFresh`, then each end is found again in a fresh `parser.parse` of its own file (`getNodeFile`: a transcluded node's source file) by `nodeAtStart` + type + content check. `planSelectionLink` plans it, every file is written in one edit group (target's file first, as 3D does), then `resyncFromParent`. The first linked line stays selected (`pendingSelectionRangeStart`).
- **Cancel:** tap the button again, tap empty space, tap a source node, Escape (3D: after a link drag cancel; 2D: before the find bar), leaving edit mode (3D `setEditMode(false)`, 2D `setReadingMode(true)`), and 2D switching to another note.

### Decisions worth remembering
- **Slot 9, after Delete**, not after the create buttons. That would push Delete off a phone's first eight, which T63 deliberately filled with the editing core. Move it into the first group if Sawyer wants it visible without scrolling.
- **A tap on empty space only cancels.** It does not also clear the selection the way a plain tap does, so cancelling loses nothing.
- **Tapping a source cancels** rather than being ignored. It is the obvious "never mind".
- **2D: a tap on a fold toggle still folds while armed**, so a target inside a collapsed branch can be reached. Any other tap on a node, including on a link inside it, picks the target.
- **Sources are fixed at arm time**, not read from the selection at the pick, because a hold on the way (3D and 2D) changes the selection.
- **2D embed lines (`![[…]]`) and the root are refused as sources**, and an embed line is refused as a target: `getNodeFile` names the embedded file for them, not the file their range indexes. The 2D root as a target links to the note (`[[Note]]`), which from its own note is skipped ("can't add a link to that line").
- Mouse/desktop: the button works with clicks too. 3D Alt+drag-to-link and the drop menu are unchanged.

### Surface map
| File | Change |
|---|---|
| `src/link-pick.ts` (+test) | new: `LinkPicker`, `LinkPick`, `PickTap` |
| `src/views/ToolRibbon.ts` (+test) | `add-link` def in its own group after Delete; `addLink` action; `setActive(id, on)` |
| `src/views/Graph3DScene.ts` | `onLinkPick` option, `setLinkPicking`, intercept at the top of `click()` |
| `src/views/Graph3DView.ts` | `linkPicker`, `toggleLinkPick`, `cancelLinkPick`, `pickLinkTarget`, `showLinkPick`; Escape and leaving edit mode cancel |
| `src/views/MindMapView.ts` | `linkPicker`, `toggleLinkPick`, `cancelLinkPick`, `pickLinkTarget`, `linkNodes`; intercepts in `handleTouchTap`/`handleClick`; Escape, reading mode and another file cancel |
| `src/graph3d/controls-help.ts`, `docs/mind-mapping/graph-3d.md`, `docs/mind-mapping/editing.md` | Add link documented |

### Fixture
None new. 3D: `vault/tests/graph3d/Sailing Basics.md` (and `Harbour Links.md` for linked notes). 2D: any mind map note, e.g. the same Sailing Basics file in 2D; one with an `![[embed]]` covers the cross-file case.

### Could not verify
Nothing was run in Obsidian or on a device. Not verified: whether the armed `is-active` look is visible enough on the bar; whether a phone's tap on a plate in 3D lands inside `CLICK_SLOP_PX` reliably while armed (it is the same test every 3D tap uses); 2D link into or out of a transcluded section (written by the code path above, but untested live); whether `normalizeHeadingSpacing`/renumbering shifts the 2D reselect offset on some notes (then the selection simply drops after the link).
