---
title: Transcluded media not rendering in Mind Map View
summary: Relative media paths show as not found when the link is relative to child/transcluded note instead of the parent/host note. 
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: Ideas
priority:
progress_current:
progress_total:
date_created: "2026-09-01T07:56:17.884Z"
date_modified: "2026-09-01T07:56:17.884Z"
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

Renders when media in a transcluded note is relative to the parent note

​![](../../../media/Pasted%20image%2020260901075624.png)
![](../../../media/Pasted%20image%2020260901075756.png)
![](../../../media/Pasted%20image%2020260901075720.png)

But not when it's relative to the note in which it is actually stored:
![](../../../media/Pasted%20image%2020260901075851.png)
![](../../../media/Pasted%20image%2020260901075902.png)


## What should have happened?

*What did you expect to happen instead?*

​Mind map view should render linked media in the same way Obsidian does, regardless of whether using wikilinks or absolute/relative markdown links.  The relative link path can be completely "wrong" except for the actual file name, and Obsidian will still render the media. 

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