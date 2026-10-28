---
title: Contextual study mode increases image size for image occlusion
summary: Study mode should respect the custom image width and stay the same size as in note edit and reading views.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-10-15T17:31:28.125Z
date_modified: 2026-10-20T12:25:44.340Z
date_start_scheduled: "2026-10-20T12:46:40.000Z"
date_start_actual: "2026-10-20T12:46:40.000Z"
date_end_scheduled: "2026-10-28T01:02:34.000Z"
date_end_actual: "2026-10-28T01:02:34.000Z"
pull_request: https://github.com/SawyerRensel/Osmosis/pull/43
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
---

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         |       |
| Operating System |       |

## What happened?

*What actually happened? Describe what went wrong.*

​

## What should have happened?

*What did you expect to happen instead?*

​

## Where is this file located?

*Paste the filepath location  (if the bug occurred in a test file)*



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

## What was implemented

**Where it shipped:** [PR #43](https://github.com/SawyerRensel/Osmosis/pull/43), branch `fix/mindmap-edits-occlusion-width-startup` → `release/0.0.6`.

### The cause

An occluded diagram is not the note's own embed in study: `renderOcclusion` builds its own `<img>` from `CardOcclusion.image`. The embed regexes in `src/card-gen/occlusion.ts` deliberately skip the `|300` sizing suffix to get at the link target — and nothing kept it. So every occluded image drew at its natural width (capped at 100%), in contextual study and every other surface that shares the renderer.

### The fix

- `embedWidth` reads the width the way Obsidian does: `![[x.png|300]]`, `![[x.png|300x200]]`, `![300](x.png)`, `![alt|300](x.png)`.
- `CardOcclusion` gained an optional `width`. `findLabeledEmbeds` carries it per labelled embed, `findFirstEmbedWidth` covers the bare `occlude:` and line-card forms, and `cardOcclusion` stores it at all four build sites.
- `renderOcclusion` sets it as the `<img>`'s `width`, with `height` derived from the cached natural ratio so the box is still reserved before decode (the anti-scroll-jump behaviour `createImage` already had).

### Decisions worth remembering

- **Only the width is kept.** `|300x200` is honoured as width 300 with the picture's own proportions, never stretched: the mask overlay maps onto the image box, so a distorted box would be a distorted picture.
- **Applied everywhere `renderOcclusion` draws** — contextual (fences and line cards), live preview, the mind map, and the sequential study modal — so a diagram is the size the note says on every surface.
- **The shared `ANY_EMBED_REGEX` / `LABELED_EMBED_REGEX` were left alone.** The width is re-read from the matched embed text instead, so no capture-group numbering changed under their many callers.

### Surface map

| File | Change |
|---|---|
| `src/database/types.ts` | `CardOcclusion.width` |
| `src/card-gen/occlusion.ts` | `embedWidth`, `findFirstEmbedWidth`; `LabeledEmbed.width`; `cardOcclusion` takes a width |
| `src/card-gen/explicit.ts` | Fence occlusion cards carry their embed's width |
| `src/views/OcclusionRenderer.ts` | `createImage` applies the width |
| `src/card-gen/occlusion.test.ts`, `src/views/OcclusionRenderer.dom.test.ts` | Width parsing table, line/fence card widths, rendered `width` attribute |

### Test fixture

`e2e/fixtures/occlusion-image-width.md` — a line card at `|250`, a fence card at `|300`, and an unsized fence as the control.

### Follow-ups

None.
