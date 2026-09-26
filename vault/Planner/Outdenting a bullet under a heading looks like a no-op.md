---
title: Outdenting a bullet under a heading looks like a no-op
summary: The first outdent of a top-level bullet under a heading only turns it into a paragraph, which stays the heading's child — the node doesn't visibly change level until a second outdent.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Expose Mind Map editing operators as hotkeys]]"
status: To-Do
priority:
progress:
date_created: 2026-09-26T01:54:36.000Z
date_modified: 2026-09-26T01:54:36.000Z
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

| Field            | Value            |
| ---------------- | ---------------- |
| Platform         | Obsidian desktop |
| Operating System | Linux            |

## What happened?

In a top-down map, selecting **Sink** (a `- Sink` bullet under `## Kitchen`) and outdenting — toolbar ↑, Alt+↑, or the "Move node up" command — turned `- Sink` into a plain paragraph `Sink` placed after Kitchen's list. On the map, Sink stayed a child of Kitchen; only its bullet disappeared and it moved to the end of its siblings. It looked like outdent did nothing.

Same in a left-to-right map with ← / Alt+←: it's the outdent operator, not the key binding.

## What should have happened?

One outdent should visibly move the node up a level: Sink should become Kitchen's sibling (`## Sink` after Kitchen's subtree).

## Where is this file located?

`vault/tests/mindmap/hotkey-commands-vertical.md` (master: `e2e/fixtures/hotkey-commands-vertical.md`)

## Steps to Reproduce

### 1. Start from

Open `vault/tests/mindmap/hotkey-commands-vertical.md` as a mind map.

### 2. Prep/settings

None. The fixture's frontmatter sets `direction: top-down`.

### 3. Do this

Select **Sink**.

### 4. Trigger

Press Alt+↑ (or the toolbar ↑ button). The source now reads `- Stove`, `- Fridge`, blank, `Sink` under `## Kitchen`. Sink is still Kitchen's child on the map.

## Notes for the fix

- **Where:** `outdentContext` and the root special case in `outdentNode`, both in `src/views/MindMapView.ts`.
- **Why it's staged:** commit `305b414` (March 2026) made depth-0 list items under a heading become a paragraph first ("progressive: bullet → paragraph → heading"). The previous code reused the heading's depth as list indentation, so the item re-parsed as a nested child of a sibling list item. Don't reintroduce that bug.
- **Proposed shape:** skip the paragraph stage when it wouldn't change the node's parent. A depth-0 bullet under a heading goes straight to a heading at the parent's level, landing after the parent's subtree. Under the root there's no higher level to go to, so the staged type change there may still be the only useful outcome. Decide this explicitly.
- **Check indent for symmetry:** indenting `## Sink` back under Kitchen — what type does it get?
- **Tests:** the splice logic is in the view, and Vitest can't import it. Move the pure type/depth decision out of `src/views/` so it can be unit-tested.
