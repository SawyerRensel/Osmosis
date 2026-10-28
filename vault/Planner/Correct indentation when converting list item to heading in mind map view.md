---
title: Correct indentation when converting list item to heading in mind map view
summary: For example, when in Mind Map view and converting a top-level list item to heading (e.g. an h3), its children don't dedent.  Then, when attempting to change its former child list item to a sub-heading (e.g. h4), it's children are not parented to the new sub-heading as expected.
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
date_created: 2026-10-19T09:45:07.235Z
date_modified: 2026-10-20T12:23:35.727Z
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

Since the node editor exposes raw markdown, changing `- Vegetables` to `### Vegetables` is a *rename*: `renameNode` spliced the one edited line back in and left the subtree alone. The children kept their list indentation (`\t- Tomatoes`), and the parser reads a tab-indented `#### Tomatoes` as a **paragraph** whose text is literally `#### Tomatoes` — so the second conversion in the report never produced a heading and its children never attached.

Fixing the indentation exposed a second, structural problem: markdown fixes a section's order. A heading owns everything below it until a heading of its level or higher, so a parent's list items must all come before its first sub-heading. Converting in place silently re-parented whatever followed — `- Herbs` became a child of the new `### Vegetables`, and a new `- Flowers` landed inside the preceding heading's section.

### The fix

Two pure functions in `src/mindmap-edit.ts`, called from `renameNode` for any rename that crosses list ↔ heading:

- `retypeSubtree` re-nests the subtree for the new kind. **List → heading:** the heading goes to column 0 and every descendant loses the item's child indentation (the prefix is stripped verbatim, so fenced code keeps its relative indent). **Heading → list:** the heading's own content up to its first sub-heading is indented one level under the new item, with blank lines dropped (fences excepted) because a blank line ends nesting in the parser.
- `retypeInFile` (option A) moves the node to where its new kind keeps the rest of the tree intact. A new heading moves after its parent's remaining list siblings; a nested list item first leaves its list — a heading cannot sit inside one — and is placed as if it were the top-level item containing it. A new list item moves before its first heading sibling, taking the old heading's sub-headings with it.

After the write, the converted node is re-selected by its text and new kind, since its old offset no longer finds it.

### Decisions worth remembering

- **Option A — move the node — over cascading conversions or leaving it.** Converting the following siblings too (option B) would change nodes the user never touched; leaving it (option C) re-parents silently. Moving changes only the converted node's position among its siblings. Do not "simplify" this back to an in-place splice.
- **A nested item turned heading changes parent** (from its list item to that item's parent). Unavoidable: no position inside a list can hold a heading.
- **Sub-headings of a heading turned list item pass to its former parent.** A list item cannot own a heading.
- **Only same-file siblings are positioned against.** An embed's expansion is positioned by its `![[…]]` host line; content of another file has no byte order relative to this one.

### Surface map

| File | Change |
|---|---|
| `src/mindmap-edit.ts` | New `retypeSubtree`, `retypeInFile` |
| `src/views/MindMapView.ts` | `renameNode` builds the ancestor chain, calls `retypeInFile`, re-selects the moved node |
| `src/mindmap-edit.test.ts` | 13 tests replaying `renameNode` + spacing normalization and re-parsing the result, including the reported two-step sequence, nested lift-out, and a list → heading → list round trip |

### Test fixture

`e2e/fixtures/list-to-heading.md` — Garden Plan: `- Vegetables` → `###` (Herbs must stay under Beds), back to `-`, nested `- Tomatoes` → `###` (Peppers must stay under Vegetables), and `### Flowers` → `-`.

### Follow-ups

None. A first manual run of the nested case showed Peppers swallowed by Beefsteak; a diagnostic run on the same build came back correct for every step, and the cause of the first result was never reproduced. If it recurs, log `retypeInFile`'s inputs from `renameNode` — the bad output matched an empty ancestor chain exactly.
