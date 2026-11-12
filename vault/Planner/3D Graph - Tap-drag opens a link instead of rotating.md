---
title: 3D Graph - Tap-drag opens a link instead of rotating
summary: On touch, a drag that starts on a link in a near-tier panel opens the link instead of orbiting. Links should open on touch only from the long-press context menu.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Planets surface grab anywhere on the sphere]]"
  - "[[3D Graph - Clickable links in panels]]"
  - "[[3D Graph Phase 7 - Editing]]"
status: In-Review
priority:
progress:
date_created: 2026-11-12T10:27:07Z
date_modified: 2026-11-12T10:45:00Z
date_start_scheduled: 2026-11-12T10:27:07Z
date_start_actual: 2026-11-12T10:27:07Z
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

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Mobile (phone) and desktop |
| Operating System |       |

## What happened?

*What actually happened? Describe what went wrong.*

From Sawyer's round-8 test, 2026-11-12:

> "tap-drag is triggering link in 3D graph view instead of rotating like it should. the link should be a selection from tap-hold context menu"

## What should have happened?

*What did you expect to happen instead?*

- **Touch:** a drag that starts anywhere, on a link or not, orbits (or grabs the surface in Planets) exactly as on empty space. A link in a panel never opens from a tap or a drag. A long press on a link offers "Open link" in the node's context menu.
- **Desktop mouse:** a click without moving on a link still opens it. A mouse drag that starts on a link orbits and does not open the link on release.

## Where is this file located?

*Paste the filepath location  (if the bug occurred in a test file)*

`vault/tests/graph3d/Harbour Links.md`



## Steps to Reproduce

### 1. Start from

(e.g. new scene / open file link)  *Attach a screenshot for this step*



### 2. Prep/settings

(e.g. setting/value changes)  *Attach a screenshot for this step* 



### 3. Do this

(e.g. click this button)  *Attach a screenshot for this step*

​

### 4. Trigger

Describe the last action you took before the problem  *Attach a screenshot for this step*

​

## Batch implementation notes (awaiting manual test)

Code commit: `cae29c1` on `fix/round-8-feedback`.

### The cause

Near-tier panels never take the pointer (`.osmosis-graph3d-near { pointer-events: none }`, and Planets' CSS3D anchors are set to `none` too), so the anchor's native click and Obsidian's link handler never run. The scene hit-tests links itself. A press that ends as a click goes through `click()` → `near.linkAt()` → `linkClickAction()`, and that follows a link on the focused node or a nearby one. Two things let a finger on a link open it:

1. **A touch tap on a link followed it.** On a phone, a finger that lands on a link to start a drag and lifts within the 6 px click slop is a "tap". The link sits on the focused node, which is where you would start a drag, so it fired.
2. **The release position was never checked.** `this.press` was cleared only by a `pointermove` past the slop. A quick flick can reach `pointerup` with no move dispatched in between (coalesced moves), so the press survived and became a click. A `pointercancel` (the system taking the touch) also ran `click()`, because the press branch ignored `e.type`.

T57's `aim(x, y, touch, grab)` / `sphereOnRay` change only how a drag pivots or grabs. It does not touch `press` or the link path, so it is not involved.

### The fix

- `linkClickAction` takes `touch`. On touch a link never fires: a tap on a link is a tap on its node (select and fly, or select only with "Click selects only").
- `releaseIsClick(press, x, y, cancelled, slop)`: the scene clicks only on a real `pointerup` that lands within the slop of the press. This covers mouse and touch alike.
- Long press: a finger held still on a link starts the long press even when the node has no menu of its own. The scene passes the `PanelLink` to `onContextMenu`. The view's `showNodeMenu` puts **Open link "text"** first (just "Open link" when the text is over 30 characters or empty), then a separator and the usual plate menu. A node without a plate menu (not a line or note) shows only the link item. The item calls `followLink(link, "follow" | "external")`, the same as a plain desktop click. It ignores the focus-reach rule, because a long press is deliberate.
- Controls help (Touch) gains "Hold a finger on a link in a panel".

### Decisions worth remembering

- **No capture-phase click suppression on the panel container.** The brief suggested one. The panels are `pointer-events: none`, so no `click` can ever target an anchor inside them, and such a handler would be dead code. The scene's own hit-testing is the only link path. If panels are ever made interactive, this decision needs revisiting.
- **Desktop is unchanged** for a click in place. A right-click menu does not gain "Open link": the brief left desktop alone, and a click already opens links there.
- **The release check applies to every press**, not just links, so a fast flick on empty space no longer clears the selection or rides an edge either. That is the same rule ("a drag is never a click") applied more reliably.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/links.ts` | `touch` input on `linkClickAction`; `releaseIsClick`; `openLinkTitle`, `LINK_LABEL_MAX` |
| `src/graph3d/links.test.ts` | Tests for touch links, the release check and the menu label |
| `src/views/Graph3DNear.ts` | `PanelLink.text` (the anchor's text) |
| `src/views/Graph3DScene.ts` | Release check on `pointerup`/`pointercancel`; `touch` passed to `linkClickAction`; long press carries the link under the finger; `onContextMenu` gains `link` |
| `src/views/Graph3DView.ts` | `showNodeMenu(..., link)` adds "Open link" first |
| `src/graph3d/controls-help.ts` | Touch entry for holding a finger on a link |

### Fixture

`vault/tests/graph3d/Harbour Links.md` (existing): same-note heading links, block, heading and note links to `Knots`, an external URL, an unresolved link and a file link.

### Not verified

Nothing was run in Obsidian. Not verified: whether a long press on a phone lands on `linkAt` at the finger's centre for small link text, whether the Obsidian `Menu` shows at the finger on iOS, and whether the flick-without-move case was the one Sawyer hit or only the tap-within-slop case.
