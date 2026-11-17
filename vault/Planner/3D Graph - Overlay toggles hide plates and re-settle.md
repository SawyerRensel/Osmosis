---
title: 3D Graph - Overlay toggles hide plates and re-settle
summary: "The Overlays menu is sticky (only its button and Escape close it); Tags and Unresolved links off hide their plates as Attachments does; every edge-kind toggle except Hierarchy stops its edges pulling and re-settles the loaded nodes; a new Forces toggle, Links pull, turns link pull off while links still draw."
tags:
  - task
calendar:
  - Bug Report
context:
people:
location:
related:
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[3D Graph - Flatten branches]]"
status: Done
priority:
progress:
date_created: "2026-11-07T14:50:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-07T14:55:00.000Z"
date_start_actual: "2026-11-07T14:55:00.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
all_day: false
parent:
children:
blocked_by:
cover:
color:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Bug Report

## What happened?

- Clicking, dragging or navigating in the viewport (and tapping the canvas on mobile) closed the Overlays menu, so changing several toggles meant reopening it each time.
- Tags off hid the tag edges but left the tag hub plates; Unresolved links off hid the edges but left the ghost plates. Only Attachments off removed its plates (`visibleModel`).
- A hidden edge kind kept pulling: `edgeShown` only gated drawing, so toggling a kind changed nothing about the layout.

## What should have happened? (Sawyer, 2026-11-07, settled)

1. **The Overlays menu is sticky.** Only its own button closes it, and Escape may close it too. This holds on mobile. It must not block the canvas beneath it beyond its own box.
2. **Toggles that own plates hide the plates too.** Tags off hides the tag hubs, Attachments off already removes attachment plates, Unresolved links off hides the ghosts. A node another shown edge kind still reaches stays visible.
3. **Every edge-kind toggle whose edges pull re-settles the graph.** A hidden kind no longer pulls, and toggling it re-settles the loaded nodes live through `Graph3DScene.reshape`. This applies to Links, Embeds, Properties, Tags, Attachments and Unresolved. **The Hierarchy edge toggle stays draw-only**: it keeps pulling and does not re-settle, because removing hierarchy pull would scatter every note and flatten depends on it. This is the **third and last** approved exception to "settled nodes never move" (after the force slider and the flatten slider); the comment on `reshape` lists all three.
4. **A new Forces toggle, "Links pull"**, on by default. Off means links between plates (kind `link`, ghost targets included) still draw if their edge kind is shown, but exert no force, and the graph re-settles.

## Where is this file located?

`vault/tests/graph3d/Sailing Basics.md` (frontmatter tag `#sailing`, inline `#seamanship`), `Harbour Links.md` (ghost "Lighthouse Keeper"), `Knots.md` (attachment `knot-diagram.svg`).

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

### Approach

- **Pull is one pure rule**, `linkPulls(kind, toGhost, overlays)` in `src/graph3d/overlays.ts`: hierarchy always pulls; any other kind pulls if `edgeShown` (its kind is on, and, into a ghost, Unresolved is on) and, for kind `link`, `linksPull` is on. `pullChanged(before, after)` says when a change of Overlays changes which edges pull (any non-hierarchy kind toggled, or `linksPull`).
- **The scene** (`Graph3DScene.pushData`) now builds a `pulling` set from that rule, and `degree` counts only pulling links, so d3's default strength (one over the fewer links at either end) is not diluted by links that no longer pull. `linkStrength` returns 0 for a link outside `pulling`. `setOverlays` reshapes when `forceBalance` or `pullChanged`.
- **Flatten needs no special case**: `flattenStep` hands a rigid piece's pull to its head by summing the velocity the link force gave its lines, and a zero-strength link gives none. `flatLinkScale` only concerns edges inside a rigid piece, which are hierarchy or already 0. (There is no `sameBranch` in `flatten.ts`.)
- **Plates**: `visibleModel` now generalises the attachment rule through `kindOwnedOff` (attachment node owned by the Attachments toggle, tag by Tags, ghost by Unresolved). A candidate node is left out, with the edges touching it, unless a *shown* edge (`edgeShown`) reaches it. The view's model swap is the existing attachment path: `modelKey(edges)` replaces `attachmentsShown`, so toggling any of the three reloads, and the nodes that leave fade out as departing nodes do, and those that arrive fade in.
- **Re-settle after the reload**: the scene reshapes at once when the toggle changes (so pulls respond immediately), and the view sets `resettleOnLoad`, so `reshape` runs again once the new model is in the scene, covering plates that just arrived (otherwise they would settle against pinned neighbours).
- **Focus on a leaving plate**: `reshape(followFocus)` takes a flag. If the focused node is a tag, ghost or attachment its toggle takes away, the camera does not ride along (`focusLeaves` in the scene for the immediate reshape, `focusLeft` in the view for the one after the reload). `setData` also drops a `follow` that targets a departing node. Plates, near-tier panels and edge picking already skip `departing` nodes.
- **Menu**: removed the view's `pointerdown` closer (and the now unused `Graph3DOverlaysMenu.contains`). Escape is registered on the view's scope: it first drops a link drag, else closes the menu. The panel is absolutely positioned inside a button-sized corner, so it covers only its own box; no CSS change was needed.

### Decisions worth remembering

- **Hierarchy toggle is draw-only on purpose** (spec). Don't "fix" it to stop pulling.
- **Hidden edges stay in the model; they just have strength 0.** Removing them from the model would break the edge kinds' drawing gate and the hidden-then-shown toggle for no gain.
- **A property edge to an attachment keeps the attachment only while Properties is on.** Before, it stayed even with Properties off (its edge hidden), because the rule looked at edge kinds, not toggles. Using shown edges is the consistent reading of "another shown edge kind".
- **Tag colouring reads the unfiltered model** (`fullModel`), since Tags off removes the tag hubs and edges `nodeTags` walks. Colour by tag keeps working with Tags off.
- **Escape was added** although the spec said "if that already works": it did not, and it is a few lines.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/overlays.ts` | `linksPull` setting + default + normaliser; `linkPulls`, `pullChanged`, `kindOwnedOff`, `modelKey`; `visibleModel` hides tag hubs and ghosts too |
| `src/graph3d/overlays.test.ts` | Tests for all of the above, updated `visibleModel` expectations (ghosts no longer stay with Unresolved off) |
| `src/views/Graph3DScene.ts` | `pulling` set, pulling-only `degree`, zero `linkStrength` for non-pulling links, `setOverlays` reshapes on `pullChanged`, public `reshape(followFocus)` with the three-exception comment, `focusLeaves`, no follow of a departing node |
| `src/views/Graph3DView.ts` | `modelKey` replaces `attachmentsShown`, `resettleOnLoad`, `fullModel` for tag colours, `focusLeft`, sticky menu (closer removed), Escape closes the menu |
| `src/views/Graph3DOverlays.ts` | "Links pull" toggle in Forces; `contains` removed |

### Fixtures

Reuses `vault/tests/graph3d/Sailing Basics.md`, `Harbour Links.md` and `Knots.md`. No fixture was written or edited.

### Manual test steps

Open `Sailing Basics` in the 3D graph at depth 1, set Attachments on in Overlays where noted.

1. **Sticky menu**: open Overlays, then click empty canvas, drag to orbit, scroll to zoom and click a plate to hop. The menu stays open throughout. Only the layers button closes it; Escape closes it too (focus on the graph view). On a phone, tap and drag the canvas: it stays open, and the canvas beyond the panel's box still responds.
2. **Tags**: with Tags on, the `#sailing` and `#seamanship` hubs are plates. Turn Tags off: they fade out, and the loaded nodes re-settle. Turn it back on: they return and the graph re-settles. With "Color by: Tag", colours survive Tags off.
3. **Unresolved links**: open `Harbour Links` at depth 1. The "Lighthouse Keeper" ghost plate is there. Turn Unresolved links off: it fades out. On: it returns.
4. **Attachments**: open `Knots`, turn Attachments on: the `knot-diagram.svg` plate appears and the graph re-settles; off removes it.
5. **Edge kinds re-settle**: with a graph at rest, toggle Links (and Embeds, Properties): the loaded nodes move to a new rest as pulls change; notes linked only by links drift apart with Links off. The edges also hide as before.
6. **Links pull**: in Forces, turn "Links pull" off with Links edges on. Link edges still draw but notes no longer pull towards each other; the graph re-settles. Turn it on: they re-gather. With Links edges off too, nothing is drawn.
7. **Hierarchy toggle**: turn the Hierarchy edge off. Edges hide, but nothing moves (no re-settle).
8. **Focused plate leaves**: click a tag hub (focus it), then turn Tags off. The camera stays where it was; nothing swings.
9. **Regressions**: the Hierarchy ⟷ organic and Flatten sliders still re-settle live while dragging; hops, follow-a-link, edits and clicking plates do **not** move settled nodes (only the toggles above do); follow-a-link rides the edge; relational study starts and runs; edit mode edits a line and the graph stays still; depth 0 (`Depth Zero.md`) still shows only the note and its transclusions, and toggles there behave.

### Not verified

I cannot see Obsidian. Not checked live: the feel of the re-settle after a plate-owning toggle (the double reshape: once at the toggle, once after the reload), mobile behaviour of the sticky menu, and Escape reaching the view's scope when focus is inside the menu's own controls.
