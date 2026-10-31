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
status: To-Do
priority:
progress:
date_created: "2026-10-31T16:00:00.000Z"
date_modified: "2026-10-31T16:00:00.000Z"
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
