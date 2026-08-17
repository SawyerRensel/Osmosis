---
title: Add margin to mind map toggle in note view
summary: Need more margin on the left
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-04T16:46:24.154Z
date_modified: 2026-08-13T19:05:00-04:00
date_start_scheduled: 2026-08-13T18:50:14-04:00
date_start_actual: 2026-08-13T18:50:14-04:00
date_end_scheduled: 2026-08-13T19:05:00-04:00
date_end_actual: 2026-08-13T19:05:00-04:00
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/24
---
# Optimization 

## What tool or process needs improvement?

*Which existing tool, script, or workflow are you referring to? Include the name if you know it.*
![](edited_abcca237-8ade-4b00-9958-19346c8a09ce2574368257760215643.jpg)


## What's slow or frustrating about it?

*What specifically takes too long or feels clunky?*



## What would "better" look like?

*Describe your ideal outcome. How should it work differently?*

The mind map toggle should sit in the note header like any other action —
same spacing from the pill edge, same icon size, same brightness as the
reading-view toggle next to it.

## What was implemented

**Where it shipped** — [PR #24](https://github.com/SawyerRensel/Osmosis/pull/24),
branch `fix/mindmap-toggle-header-icon` → `release/0.0.4`.

**The cause** — this read like a margin problem but was not one. The button
in `addMindMapActionToMarkdownLeaves` was built by hand with
`class="clickable-icon osmosis-mindmap-action"`. Obsidian puts a second class,
`view-action`, on every native header button — `view.addAction()` adds it, and
our own study/peek buttons in `LineRevealProcessor.createHeaderAction` already
set it. `view-action` is what carries the header icon's sizing, color, and
spacing inside the action pill, so the mind map button was the single action in
the row missing all three at once. That is why it looked cramped on the left
*and* smaller *and* dimmer: one missing class, not three style bugs.

**The fix** — add `view-action` to the class list. One line.

**Decisions worth remembering**

- **No CSS margin was added, deliberately.** The obvious reading of the request
  is a `margin-left` on `.osmosis-mindmap-action` under `.is-mobile`. Don't
  reintroduce one. It would have hidden the real defect (wrong class) behind an
  override that only corrected the spacing symptom while leaving the icon small
  and dim, and it would drift out of step with Obsidian's own header spacing on
  any future theme or version change.
- **Match the native class rather than restyling `.view-actions`.** Styling the
  container's first child would have reached native buttons too — heavy-handed
  for a plugin, and wrong the moment the study/peek buttons take the leftmost
  slot.
- Anything else injected into `.view-actions` in future should be created the
  way `createHeaderAction` does it: `clickable-icon view-action <our-class>`.

**Surface map**

| File | Change |
|---|---|
| `src/main.ts` | `addMindMapActionToMarkdownLeaves` — added `view-action` to the button's class list |

**Test fixture** — none needed; the button appears on every markdown note.
Verified manually on mobile against the header pill in the screenshot above.

**Follow-ups** — none.