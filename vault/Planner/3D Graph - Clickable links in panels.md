---
title: 3D Graph - Clickable links in panels
summary: "Make wikilinks and URLs inside near-tier panels clickable, but only on the focused or nearby node, so a careless click while navigating still just hops."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 4 - Near tier]]"
  - "[[Center viewport on clicked heading link]]"
  - "[[3D Graph Phase 7 - Editing]]"
status: In-Review
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-10-31T15:55:00.000Z"
date_start_scheduled: "2026-10-31T15:42:24.000Z"
date_start_actual: "2026-10-31T15:42:24.000Z"
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

# Feature Request

Requested by Sawyer in the Batch 1 manual test, 2026-10-31.

## What do you need built?

Links in near-tier panels (internal wikilinks, heading/block links, external URLs) currently do nothing when clicked. Make them work, with a guard: Sawyer doesn't want a stray click on a link to open a new map while just trying to hop to a distant node. So a link only fires when its node is the **focused** node (the last hopped-to node) or close to it. Otherwise the click is an ordinary hop to that node.

Modifier keys should follow the 2D mind map's link-click mapping (browser-like Ctrl/Cmd, Ctrl+Alt, Ctrl+Shift variants; see the mind map heading-links work and `Center viewport on clicked heading link`). Default for a plain click, chosen by the orchestrator because Sawyer asked for a recommendation: **plain click hops within the 3D graph** to the link target (stays in the medium you're exploring; a heading/block link lands on that line's node). Modifiers open the target in a note view, mirroring the 2D map's mapping. External URLs open in the browser as usual.

## What problem does this solve?

Panels show links but you can't follow them, so reading in 3D dead-ends at every link.

## What's your current workaround?

Find the target node in the graph by eye, or leave the 3D view.

## Notes

- Checkboxes stay out of scope (Phase 7 editing).
- Drag over a panel must still orbit; only a click (no drag) on a link fires.
- Hover preview (Ctrl-hover, `hover-link` event) is a nice-to-have if trivial.

## Batch implementation notes (awaiting manual test)

Code commit: `2e744cc` on `fix/3d-graph-batch-1`.

### Approach

Panels stay `pointer-events: none`, so a drag over a panel still orbits and the browser never follows an anchor itself. On a click (a press that never moved past the 6 px click slop), the scene asks the near tier what link is under the pointer: `Graph3DNear.linkAt()` finds the panel drawn on top there (`frontPanelAt`: nearest panel by view depth, unless a nearer plate covers the point, matching the CSS-mask holes), then the anchor whose client rects contain the point. `linkClickAction()` (pure, `src/graph3d/links.ts`) decides what the click does; the view then carries it out in `Graph3DView.followLink()`.

| Click | Result |
|---|---|
| Plain, link on the focused node or within `LINK_REACH` (60 world units) of it | Hop within the graph to the target. A heading/block link lands on that line's node; a target note not loaded becomes the focus, loads, then the camera flies to the line |
| Mod (Ctrl / Cmd) | New 3D graph tab focused on the target, landing on the heading/block |
| Mod+Alt | Target in a note view in a new tab (`openLinkText(..., "tab")`) |
| External URL, any modifiers | Browser (`window.open`), as in the mind map |
| Link on a node that is neither focused nor near it | Ordinary hop to the link's node (whatever the modifiers) |
| No link, plain | Unchanged: hop to the node under the pointer |
| No link, Shift/Ctrl/Cmd | Unchanged: nothing (that press is OrbitControls' pan) |

### Decisions worth remembering

- **Modifier mapping mirrors `MindMapView.openNodeLink`**: plain stays in the medium, Mod = same medium in a new tab, Mod+Alt = note view in a new tab. Shift is ignored, as in the mind map. The ticket's "Ctrl+Shift" mention has no counterpart in the 2D map, so it got none here.
- **"Focused" = the node the camera last flew to** (`Graph3DScene.focusId`, set in `flyTo`: plate clicks, link hops, and the note core on load). Manual orbiting or WASD flight does not move it, so after flying off by hand, the first click on a link hops; the next one follows.
- **"Near" = world distance ≤ `LINK_REACH` = 60** from the focused node, about the camera's standoff after a hop to a line (70). A guess; tune it in `links.ts` if links fire too readily or too rarely.
- **A plain click never replaces the 3D view.** An unresolved link or an attachment hops to its ghost/attachment node if one is loaded, otherwise opens in a new tab (the mind map opens those in the same leaf).
- **Mod-click needed a press record**: `onPointerDown` used to return early for Shift/Ctrl/Cmd without recording a press, so it now records one first. A Shift/Ctrl/Cmd click off a link still does nothing.
- **Tag anchors (`#tag`) and other scheme-less anchors are ignored**, so they don't `window.open` a bare fragment.
- `linkTargetNode` in `model.ts` resolves a subpath against a built model, sharing `subpathKey` with `buildGraph`'s own resolution, so a link lands exactly where its edge points.
- Mod-click's subpath rides in the new tab's view state as `subpath`, read once in `setState` and never returned by `getState`.
- Not done: Ctrl-hover preview (`hover-link`) and a pointer cursor over live links. Neither was trivial without hit-testing panels on every hover frame.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/links.ts` (new) | `linkClickAction` (gating), `frontPanelAt` (which panel is on top), `LINK_REACH` |
| `src/graph3d/links.test.ts` (new) | Gating and panel hit-test cases |
| `src/graph3d/model.ts` | `subpathKey` shared helper; exported `linkTargetNode` |
| `src/graph3d/model.test.ts` | `linkTargetNode` cases |
| `src/views/Graph3DNear.ts` | `PanelLink`, `linkAt()`, panel depth and last frame's plates kept for between-frame clicks |
| `src/views/Graph3DScene.ts` | `onLinkClick` option, `focusId`, `click()` routes through `linkClickAction`, Mod/Shift presses recorded |
| `src/views/Graph3DView.ts` | `followLink()`, model kept, `reload`/`setFocus` take a subpath, `subpath` view state |

### Fixture

`vault/tests/graph3d/Harbour Links.md` (master in `e2e/fixtures/graph3d/`): same-note heading links, block and heading links into Knots, a plain note link, an external URL, an unresolved link, and an attachment link. For an unloaded target, set depth 1 and use the Knots line `[[Rigging#Running Rigging]]`.

### Not verified

Nothing has been tested in Obsidian (no access). Unverified: hit-testing scaled panels via `getBoundingClientRect` and `getClientRects`, Mod-click while OrbitControls pans, the touch tap path, and whether 60 units feels right.
