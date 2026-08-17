---
title: Fix Mind Map Editing box
summary: Scale it according to the current zoom level.  Auto-wrap the node as you type.  Unfreeze edit box when zooming or panning when editing a node
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Expose all Markdown elements in Mind Map Edit Mode]]"
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-04T06:44:02.791Z
date_modified: 2026-08-06T01:11:00.000Z
date_start_scheduled:
date_start_actual:
date_end_scheduled:
date_end_actual: 2026-08-06T01:11:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/13
---

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         |       |
| Operating System |       |

## What happened?

*What actually happened? Describe what went wrong.*

​When entering node Edit mode in Mind Map view

- The edit box uses Obsidian's font size inside a node, which is jarring when you're not zoomed in on the mind map to match the font size exactly
- 

## What should have happened?

*What did you expect to happen instead?*

​Editing a node in Mind Map View should scale it according to the current zoom level. Auto-wrap the node as you type, not just the temporary edit box. Unfreeze edit box when zooming or panning when editing a node

## Where is this file located?

*Paste the filepath location  (if the bug occurred in a test file)*



## Steps to Reproduce

### 1. Start from

(e.g. new scene / open file link)  *Attach a screenshot for this step*

Start from Mind Map view

![](Pasted%20image%2020260805082448.png)

### 2. Prep/settings

(e.g. setting/value changes)  *Attach a screenshot for this step* 

Zoom out.

### 3. Do this

(e.g. click this button)  *Attach a screenshot for this step*

​Activate node edit mode (notice the font size in the box is much bigger than the rest of the map)

![](Pasted%20image%2020260805082523.png)

### 4. Trigger

Describe the last action you took before the problem  *Attach a screenshot for this step*

​When panning the map, the edit box stays frozen in it's original location instead of panning with the rest of the map

![](Pasted%20image%2020260805083122.png)

## What was implemented

Shipped in [PR #13](https://github.com/SawyerRensel/Osmosis/pull/13) → `release/0.0.4`, from `fix/mindmap-edit-overlay-zoom`.

### The cause

All three symptoms are one fact: the inline edit overlay is a plain DOM box laid over an SVG node, so **nothing about it scales with the map's viewBox** the way the node's own content does. Every dimension has to be multiplied by the zoom by hand, and none of it was.

- **Font size.** The overlay did set `13px × zoom` on its container — but the CSS said `.cm-content { font-size: inherit }`, and `inherit` resolves against `.cm-editor`, not the container. So the text took Obsidian's editor font size instead, and on heading nodes `.cm-header-*` won outright. Neither the zoom nor the node's own depth-based size (20/17/15/14px) ever reached the text. The hardcoded `13` was wrong for headings anyway.
- **Frozen box.** The overlay is positioned once from `getBoundingClientRect()` when editing starts. `updateViewBox()` — the single choke point every pan and zoom goes through — never touched it.
- **No wrapping.** `resizeEditContainer()` widened the box to fit the longest line, capped only by the distance to the view's right edge, so it ran sideways instead of wrapping where the node would.

### The fix

Metrics are read off the node itself rather than guessed: `nodeTextMetrics()` takes the computed font size and line height from the node's rendered `.osmosis-node-content`, so heading depth and per-node style overrides come along for free, and `nodeWrapWidth()` returns the width that node wraps at (its explicit width if it has one, else the map's max node width). Both are stored at zoom 1 in `editMetrics`.

`positionEditOverlay()` then applies them for the *current* zoom — position, min/max size, font size, line height, padding, wrap width — and `updateViewBox()` calls it, so the overlay tracks its node through every pan and zoom. Typography reaches CodeMirror as CSS custom properties that `styles.css` forces onto `.cm-editor`/`.cm-content`/`.cm-line`. `EditorView.lineWrapping` plus a max width of `maxNodeWidth × zoom` makes the box grow sideways to the node's wrap width, then wrap and grow downward.

Save/Cancel text buttons became lucide `check`/`x` icon buttons along the way.

### Decisions worth remembering

- **`!important` on the CodeMirror font rules is load-bearing.** A node ignores Obsidian's heading sizes — its text size comes from its heading *depth* — so the overlay must ignore them too, and Obsidian's own rules outrank ours on specificity. Removing the `!important` puts `## Title` back at Obsidian's h2 size regardless of zoom.
- **Only the block axis is zeroed when stripping the editor's note-level chrome.** The first attempt used `padding: 0 !important` on `.cm-line` to kill the gap Obsidian's heading spacing left above the text. That dragged list markers out of the box — a list line's *inline* padding is the hanging indent its `- ` sits in — and `.cm-editor`'s overflow clipped them, silently undoing [[Expose all Markdown elements in Mind Map Edit Mode]]. `margin-block`/`padding-block` only.
- **Hover uses `--background-secondary-alt`, not `--background-modifier-hover`.** The latter is a translucent overlay meant to sit on a solid surface; these buttons float over the map, so it made them look see-through instead of highlighted.
- **The text really does get tiny at heavy zoom-out** (zoom 0.2 → ~3px). That is what "scale according to the current zoom level" means, and a legibility floor would break the match it buys. Deliberate, not an oversight.
- **The node shape behind the overlay still doesn't reflow per keystroke.** Making the node itself grow and wrap live needs a full re-layout on every keystroke. The overlay wraps *where the node would*, which is the visible half of that; it can still grow taller than the shape it covers.
- **The button stacking threshold dropped from 160px to 72px** (`EDIT_BUTTONS_MIN_WIDTH`). Two 28px icon buttons need ~56px plus a gap where the old text buttons needed ~160; leaving it at 160 would have stacked them vertically on every ordinary node.

### Surface map

| File | Change |
|---|---|
| `src/mindmap-edit.ts` | New `editOverlayGeometry` + its input/output types — the zoom arithmetic, kept pure and out of the view |
| `src/views/MindMapView.ts` | `editMetrics` state; `nodeTextMetrics`, `nodeWrapWidth`, `positionEditOverlay`, `clampOverlayAboveKeyboard`; `updateViewBox` re-places the overlay; `startEditing` no longer hardcodes a font size or positions the box itself; `resizeEditContainer` scales its padding allowance; `createFallbackTextarea` loses its geometry arguments; `EditorView.lineWrapping`; lucide icon buttons |
| `styles.css` | Custom-property typography forced onto the CM elements; block-axis-only chrome reset; icon-button styling |
| `src/mindmap-edit.test.ts` | 6 tests for `editOverlayGeometry` |

### Test fixture

`e2e/fixtures/edit-overlay-zoom.md` → `vault/tests/mindmap/edit-overlay-zoom.md`. Headings at four depths plus a bullet and a task (per-node font matching), one deliberately over-long bullet (wrapping), and three filler columns so the map is wide enough to need zooming out and panning mid-edit.

### Follow-ups

None opened. The live node reflow noted above is the one thing deliberately left; it needs a re-layout path that doesn't rebuild the SVG per keystroke, which is a task of its own rather than a loose end of this one.
