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
status: To-Do
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-12T11:52:00.000Z"
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
