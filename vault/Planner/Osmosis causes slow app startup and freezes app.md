---
title: Osmosis causes slow app startup and freezes app
summary: I think it does, at least.  After a commit in September or August, Obsidian takes much much longer to load/become responsive.  For example, when I open Obsidian on my phone, it will load the last page and dataview queries.  I'll try to create a new note and can trigger the command from the command pallette, but it still hangs on that page for nearly 30 seconds until switching to the new note. 
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
date_created: "2026-09-23T15:38:49.206Z"
date_modified: "2026-10-20T08:23:24.801Z"
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

Obsidian fires `vault.on("create")` for **every existing file** while a vault loads (documented in `obsidian.d.ts`: "register your event handler inside `Workspace.onLayoutReady`" to avoid it). Osmosis registered its `create` handler in `onload`.

That was harmless until 74bf254 (2026-09-07). Before it, the incremental sync was `debounce((file) => …)`, and Obsidian's `debounce` keeps only the last call's argument — so the load-time flood synced one note. 74bf254 fixed a real bug (a study session's burst of frontmatter flushes synced only the last note) by accumulating paths in a `Map`. From then on the flood queued the whole vault, and two seconds after load every note was read and parsed again in one `Promise.all` burst — on top of `syncAll`, which had just done the same thing sequentially. Hence: slow only at startup, independent of note size, mind maps or embeds, and fast once it finished.

### How it was found

From the commit history (Aug–Sept, per the hunch that a recent commit caused it), not a profile. Ruled out along the way: card parsing itself (measured at 0.08–0.19 ms per note over the dev vault), Rapid Flashcard Mode's editor extension (an early-return keymap), the review-log shards (not read at startup), and the nested-embed expansion of 40401c6 (the freeze happened with no mind map open).

### The fix

The `create` handler is registered inside `onLayoutReady`. Files that exist at load are `syncAll`'s job; files created afterwards still sync through the batched queue, and 74bf254's multi-note fix is untouched.

### Decisions worth remembering

- **Do not move the `create` registration back into `onload`.** The batching `Map` is correct and must stay; the two only combine into a freeze when `create` sees the vault-load flood.
- `modify`, `delete` and `rename` are not fired at load and stay in `onload`.

### Surface map

| File | Change |
|---|---|
| `src/main.ts` | `vault.on("create")` registered in `onLayoutReady` |

### Test fixture

None: the freeze needs a real vault to show, and `main.ts` cannot load under Vitest. Verified manually on a real vault (startup freeze gone; a new note's fence still gets its `id:` stamped).

### Follow-ups

None.
