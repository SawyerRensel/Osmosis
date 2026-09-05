---
title: Study mode stops before transcluded reviews are finished.
summary: Unexpected behavior occurs - seemingly inconsistently - when studying large mind maps with many transcluded notes, causing Obsidian to crash. 
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: In-Progress
priority:
progress_current:
progress_total:
date_created: "2026-09-01T17:04:08.290Z"
date_modified: "2026-09-03T20:48:03.215Z"
date_start_scheduled: "2026-09-03T22:30:00"
date_start_actual: "2026-09-03T22:30:00"
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
---

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         |       |
| Operating System |       |

## What happened?

*What actually happened? Describe what went wrong.*

![|300](../../../media/Pasted%20image%2020260903205309.png) ​![Screenshot_20260903-165409|300](../media/Screenshot_20260903-165409.png) 

I'm studying the [Full Stack Engineering](../tests/transclusion_study_issue/Programming/Full%20Stack%20Engineering/Full%20Stack%20Engineering.md) in Mind Map View study mode.  I get this far and tap to reveal this node.  

![Screenshot_20260903-165414|300](../media/Screenshot_20260903-165414.png)

Obsidian crashes and looks like this - a little upside down android icon in the upper left corner.  

![Screenshot_20260903-175524|300](../media/Screenshot_20260903-175524.png)

I restart Obsidian.   Now, I've tested this before when I styled the mind map with a global theme.  When it crashes somehow the theme gets lost and `osmosis-styles` gets set to `object Object`.  It loses all styling for individual nodes as well.  (I only edited node styles within this root note).  

When I activate study node again, sometimes it says that there are no nodes to review even when I know there are, especially in transcluded notes in the lower half of the map I haven't gotten too yet.  When I go into the [Web 2.0](../tests/transclusion_study_issue/Topics/Web%202.0.md) note and remove the last entry for the `osmosis-schedule`, then go back to the [Full Stack Engineering](../tests/transclusion_study_issue/Programming/Full%20Stack%20Engineering/Full%20Stack%20Engineering.md) note, then activate study mode, then the nodes are properly hidden/visible according to their schedules (except for that node whose schedule I deleted.)  

This keeps happening over and over again.  Obsidian keeps crashing whenever I finish reviewing all of the line cards in the root [Full Stack Engineering](../tests/transclusion_study_issue/Programming/Full%20Stack%20Engineering/Full%20Stack%20Engineering.md) note in mind map view but before I finish studying the line cards in in all transcluded nodes.  Sometimes - like in the example above - it seems to crash when I finish or am near finishing studying all the line cards in a transcluded note.  For context, I am only ever studying from the mind map view of the [Full Stack Engineering](../tests/transclusion_study_issue/Programming/Full%20Stack%20Engineering/Full%20Stack%20Engineering.md) note, not from any transcluded note itself.

## What should have happened?

*What did you expect to happen instead?*

​Study mode should remain active until I have finished studying all due cards in the Mind Map view study mode session, including all transcluded notes.  Obsidian should not crash.  Mind map styles should be preserved across study sessions and resilient against loss from a crash. 

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
