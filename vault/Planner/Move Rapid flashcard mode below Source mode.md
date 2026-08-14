---
title: Move Rapid flashcard mode below Source mode
summary: The ⋯ menu item lands above "Source mode" instead of below it, and the public Menu API offers no way to order items within a section — the fix needs the live menu's data-section values.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Rapid Flashcard Mode]]"
status: To-Do
priority:
progress:
date_created: 2026-08-14T13:45:00.000Z
date_modified: 2026-08-14T13:45:00.000Z
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
pull_request:
---

# Bug Report

## Environment

| Field            | Value          |
| ---------------- | -------------- |
| Platform         | Obsidian 1.13  |
| Operating System | Linux, desktop |

## What happened?

The "Rapid flashcard mode" item added to a note's ⋯ menu renders **above**
"Source mode":

```
Backlinks in document
Rapid flashcard mode  ✓
Reading view
Source mode
─────────────
Split right
```

It is registered with `setSection("pane")` in `registerRapidFlashcardMode`
(`src/main.ts`), shipped in [[Rapid Flashcard Mode]] / PR #29.

## What should have happened?

It should sit directly **below** "Source mode", as the last item of that group.

## Why it is not already fixed

The public API has no lever for this. `MenuItem.setSection` is the only ordering
control in `ref/obsidian-api/obsidian.d.ts` (~line 4361), there is no
within-section ordering, and the doc comment's own advice is:

> To find the section IDs of an existing menu, inspect the DOM elements to see
> their `data-section` attribute.

The observed placement has two competing explanations, and the fix differs
depending on which is true:

1. **All four items are in `pane` and the section is sorted by title.**
   `Backlinks` < `Rapid` < `Reading` < `Source` fits exactly. If so, only a
   rename moves the item, which is a poor lever to depend on.
2. **"Reading view" / "Source mode" live in a later section than `pane`.**
   If so, the fix is one line: name that section in `setSection`.

Note that plain insertion order is ruled out — the plugin's handler runs after
core's, so the item would be last in its section, and it is not.

## Steps to Reproduce

### 1. Start from

Any markdown note in the vault, with Osmosis loaded.

### 2. Prep/settings

None.

### 3. Do this

Tap the **⋯** at the top right of the note.

### 4. Trigger

Read the order of the group containing "Source mode".

## How to resolve it

With Obsidian open, paste into the developer console (Ctrl+Shift+I), then open
the ⋯ menu within five seconds:

```js
setTimeout(() => document.querySelectorAll('.menu-item').forEach(
  e => console.log(e.dataset.section, '|', e.innerText.trim())), 5000);
```

If "Source mode" reports a section other than `pane`, change the `setSection`
call to match and the item lands last in that group. If it reports `pane`, the
menu is sorting by title, and the options are to accept the placement or rename
the item to something that sorts after "Source mode".
