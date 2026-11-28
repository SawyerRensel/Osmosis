---
title: Sidecar files for flashcard data
summary: Toggling Source view is jarring because you lose your place with lots of frontmatter
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-03T17:51:06.895Z
date_modified: 2026-11-27T00:52:12.079Z
date_start_scheduled: 2026-11-27T01:51:15.000Z
date_start_actual: 2026-11-27T01:51:15.000Z
date_end_scheduled: 2026-11-28T02:12:42Z
date_end_actual: 2026-11-28T02:12:42Z
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
  - "[[Sidecar files - Core store and line-card schedules]]"
  - "[[Sidecar files - Fence schedules]]"
  - "[[Sidecar files - Mind map styles]]"
  - "[[Sidecar files - Occlusion shapes]]"
  - "[[Sidecar files - Move commands and docs]]"
blocked_by:
cover:
pull_request: https://github.com/SawyerRensel/Osmosis/pull/55
color:
---
# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

- with operators that can export/import them as well (move them in and out)

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*



## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*



## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

## What was implemented

**Where it shipped:** [PR #55](https://github.com/SawyerRensel/Osmosis/pull/55) (batch 17) into `release/0.0.6`.

Osmosis data (line schedules, fence schedules and exclude, occlusion shapes, `osmosis-styles`) can live in a sidecar note `{note name}.osmosis.md` in one flat folder (default `Osmosis/Schedule`, kept in Obsidian's Excluded files), so a note's own frontmatter stays short. Block ids and fence ids stay in the note. New data goes where the `dataLocation` setting says (default sidecar); each note is read from wherever its data already is. Move commands shift one note or the whole vault in either direction, keeping the most recent copy of half-moved data.

Built across five tickets — see each for cause, decisions and surface map:
- [[Sidecar files - Core store and line-card schedules]] (T125): NoteData store, line-card schedules, plaintext naming
- [[Sidecar files - Fence schedules]] (T126)
- [[Sidecar files - Mind map styles]] (T127)
- [[Sidecar files - Occlusion shapes]] (T133)
- [[Sidecar files - Move commands and docs]] (T128): move commands, most-recent-wins merge, docs
