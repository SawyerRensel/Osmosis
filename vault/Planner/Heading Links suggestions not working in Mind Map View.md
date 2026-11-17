---
title: Heading Links suggestions not working in Mind Map View
summary: "Typing `[[#start typing some heading text]]` doesn't return anything in the drop down menu when editing a node in Mind Map View like it does in Note View."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Center viewport on clicked heading link]]"
status: Done
priority:
progress_current:
progress_total:
date_created: "2026-10-30T11:47:47.574Z"
date_modified: "2026-10-31T02:01:49.000Z"
date_start_scheduled: "2026-10-30T16:41:55.000Z"
date_start_actual: "2026-10-30T16:41:55.000Z"
date_end_scheduled: "2026-10-31T02:01:49.000Z"
date_end_actual: "2026-10-31T02:01:49.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/46
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

**Where it shipped:** [PR #46](https://github.com/SawyerRensel/Osmosis/pull/46), `feature/mindmap-heading-links` → `feature/3d-graph-view-phase-3`. Shipped with [[Center viewport on clicked heading link]].

### The cause

The node editor is Obsidian's internal markdown editor driven through a duck-typed `owner`, which `EmbeddableMarkdownEditor` also installs as `workspace.activeEditor`. That owner had `editMode` and `editor` but no `file`. Link autocomplete resolves a same-note `[[#` against the editor's file. With no file there were no headings to list. `[[Note#…` worked because it names its note.

### The fix

`EmbeddableMarkdownEditor` gained a `file` option, which is passed into the owner object. `MindMapView.startEditing` passes `nodeFile(node.source)`: the map's note, or the embedded note for a transcluded node, so `[[#` lists the headings of the note the text actually lives in.

### Surface map

| File | Change |
|---|---|
| `src/editor/EmbeddableMarkdownEditor.ts` | `file` prop; `owner.file` |
| `src/views/MindMapView.ts` | Passes `file: this.nodeFile(node.source)` to the editor |

### Test fixture

`vault/tests/mindmap/heading-links/Link Source.md`: edit any node and type `[[#Fil`, and **Filler** is suggested.
