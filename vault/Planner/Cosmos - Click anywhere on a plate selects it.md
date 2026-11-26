---
title: Cosmos - Click anywhere on a plate selects it
summary: "T118. A plain click anywhere on a Cosmos plate or its near-tier panel selects the node, not just a click near the plate's centre."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: Done
batch: 15
priority:
progress:
date_created: 2026-11-24T23:17:08.000Z
date_modified: 2026-11-26T18:46:00.000Z
date_start_scheduled: 2026-11-24T23:31:20.000Z
date_start_actual: 2026-11-24T23:31:20.000Z
date_end_scheduled: 2026-11-26T18:46:00.000Z
date_end_actual: 2026-11-26T18:46:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/53
---

# Cosmos - Click anywhere on a plate selects it (T118)

## What Sawyer asked
> Clicking anywhere on a plate should select it. This example, I can only select the plate when I click near its center.

Screenshot: `ref/screenshots/Pasted image 20261124073906.png`. It shows an "Object" plate with two large images, a near-tier panel much bigger than the node's WebGL plate.

## Cause (hypothesis from a code read, verify first)
`CosmosScene.click()` (L2360–2425) handles a plain click with `this.nodeNear(x, y)` at ~L2416. `nodeNear` (L2944–2974) projects only `node.shape.width/height`, the bare WebGL plate, and ignores the panel. When that misses, ~L2424 returns early if `this.near.nodeAt(x, y)` is non-null ("a panel over it has the click"), so nothing gets selected. Shift-click, link-pick and double-click go through `pickedNode` (L2290–2294, panel first), which is why those work.

## Design
- A plain click should use the same panel-first pick that `pickedNode` uses. Then a click anywhere inside a drawn panel, or anywhere on the plate, selects that node.
- Clicks on links and checkboxes inside a panel (`linkAt` / `checkboxAt`) keep their current behaviour.
- Tilted Planets panels: `panelAt` uses the CSS3D box's `getBoundingClientRect`, which is fine. Do not let back-facing plates steal clicks.

## Context budget (~45k)
- `src/views/CosmosScene.ts` (3513 lines). Read only: `PICK_SLOP_PX` ~L331, `pickedNode` L2290–2294, `click` L2360–2425, `doubleClicked` L2435–2443, planet `grabRadius` pick L2912–2935, `nodeNear` L2944–2974.
- `src/views/CosmosNear.ts`: `panelAt` L403–419, `nodeAt` L422–424, `linkAt` ~L500, `checkboxAt` ~L521.
- `src/cosmos/depth.ts` `pickNode` L35–49; `src/cosmos/links.ts` `frontPanelAt` L172–184.

## Acceptance criteria
- Clicking any point of a node's visible panel or plate selects it: centre, corners, over an image. This holds in Galaxy and Planets layouts.
- Clicking a wikilink or checkbox inside a panel still does that action.
- Clicking empty space still clears the selection.
- If there is pure pick logic, a unit test covers it.

## Test plan
Open Cosmos on a note with an image-heavy node (e.g. the T112 fixture). Click near each corner of a big panel and confirm it selects. Click a link inside a panel and confirm it follows. Click empty space and confirm it deselects.

## What was implemented

Shipped in [PR #53](https://github.com/SawyerRensel/Osmosis/pull/53) → `release/0.0.6` (batch 15, commit `6c620c5`).

### The cause

The hypothesis above held. `CosmosScene.click()` picked a plain click's node with `nodeNear`, which projects only `node.shape.width/height` (the bare WebGL plate, plus 16 px or 32 px of slop). Since T111/T112 a near-tier panel can be many times that size, so a click on most of the panel missed. The next line then returned early because "a panel over it has the click", so nothing was selected and nothing cleared. Shift-click, link-pick, touch-select taps, double-click, link drags and the context menu already picked panel-first through `pickedNode`, which is why only the plain click was broken.

### The fix

The plain click now uses `pickedNode(x, y, touch)`: the front panel's node first (`CosmosNear.nodeAt` → `frontPanelAt`), else the nearest plate by `nodeNear`. A one-line change.

### Decisions worth remembering

- **Links and checkboxes are unchanged.** `checkboxAt` and `linkAt` with `linkClickAction` run before the pick, so a click on a wikilink or checkbox inside a panel still does that action.
- **Back-facing plates can't steal clicks.** In Planets mode a plate seen from behind never joins the near set (`showsText`, `CosmosNear` ~L287), so it has no panel for `panelAt` to find, and `nodeNear` already skips back-facing plates.
- **The panel-hit early return stays.** `if (this.near.nodeAt(x, y) !== null) return;` is now reached only when a panel is hit but its node is no longer in `this.nodes` (for example while departing), so such a click still doesn't clear the selection or ride an edge under the panel.
- **The hover cursor is deliberately unchanged**; see the follow-up.

### Surface map

| File | Change |
|---|---|
| `src/views/CosmosScene.ts` | `click()`: a plain click selects `pickedNode` (panel-first) instead of `nodeNear` (plate only) |
| `src/cosmos/links.test.ts` | New `frontPanelAt` case: a 400×600 panel is its node's at all four corners and the centre, far outside its own plate |

### Test fixture

`vault/tests/graph3d/Inline Images.md` (the T112 fixture, reused unchanged). Its "Object" line is the panel in the screenshot. It has no cards.

### Follow-ups

- **The hover cursor shows only over the plate.** The `pointer` cursor in `tick()` still uses `nodeNear`, so it does not appear over the rest of the panel, although a click there now selects. Making it panel-aware would call `getBoundingClientRect` on every panel on each frame the pointer moves (layout reads). Left open for Sawyer to ask for if the mismatch bothers him.
- The view code cannot be unit-tested (Vitest cannot import `obsidian`), so only the pure `frontPanelAt` pick has a test; the click path itself rests on Sawyer's manual test.
