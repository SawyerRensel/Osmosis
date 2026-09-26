---
title: Expose Mind Map editing operators as hotkeys
summary: What if you could assign custom hotkeys to editor buttons in Obsidian's hotkey settings?
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Outdenting a bullet under a heading looks like a no-op]]"
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-15T10:22:17.269Z
date_modified: 2026-09-26T01:54:36.000Z
date_start_scheduled: 2026-09-26T00:35:34.000Z
date_start_actual: 2026-09-26T00:35:34.000Z
date_end_scheduled: 2026-09-26T01:54:36.000Z
date_end_actual: 2026-09-26T01:54:36.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/41
---
# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*



## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

- My current hotkeys of "Move line up/down", `Alt+uparrow/downarrow` aren't working in Mind Map view. 

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*



## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*


## What was implemented

Shipped in [PR #41](https://github.com/SawyerRensel/Osmosis/pull/41) → `release/0.0.6`.

### The cause

Alt+Arrow already moved nodes in the mind map. It was hard-wired in the view's container `keydown` handler (`handleKeyDown` → `resolveArrowAction`), not a command. Obsidian's keymap runs before a DOM handler. With "Move line up" bound to Alt+↑ as a user hotkey, the global scope matched the key and consumed the event, so the map's handler never saw it. It worked in the dev vault, where nothing was bound to Alt+↑. It failed in the main vault, where something was. None of the map's other operators was a command either, so none could be rebound.

### The fix

- **Alt+Arrow claimed in the view's scope.** `MindMapView` registers Alt+↑/↓/←/→ on its own `Scope`, the same way it already claims Ctrl+C/D/X/V/Z, F2 and the rest, so the view gets the key before the app scope. While a node is being edited the handler returns `undefined` and the key falls through: the node editor pushes its own scope, so "Move line up" keeps working inside it.
- **Every toolbar button is a command.** The button definitions moved out of the `ToolRibbon` constructor into a module-level `TOOLBAR_GROUPS`. Each entry gained a `command` name, and its `action` became a key into `ToolbarActions`. `main.ts` registers one `mindmap-<id>` command per entry. Its `checkCallback` asks the active `MindMapView` → `ToolRibbon.trigger`, which applies the same rule that disables or hides the button (`canRunToolbarAction`). The toolbar and the command list therefore come from one source, and a new button gets its command automatically.

### Decisions worth remembering

- **Move commands follow screen direction**, not tree position, to match the toolbar arrows (user's choice). "Move node up" outdents in a top-down map and moves to the previous sibling in a left-to-right one. They go through `executeDirectionalAction`, the same path as the toolbar arrows.
- **No default hotkeys.** The view's built-in keys already cover every operator. Default hotkeys on commands would collide with core bindings (Ctrl+C, Ctrl+Z…) outside the map.
- **"Map properties" has no command of its own.** "Open mind map properties" already does the same thing. It's the one `TOOLBAR_GROUPS` entry without `command`, and a unit test pins that.
- **Commands refuse to run while a node is being edited.** The node editor's scope sits on top of the app scope, so a command hotkey would otherwise fire mid-edit and restructure the map under the cursor.
- **Commands read fresh state rather than the toolbar's cached state.** `runToolbarCommand` builds the state at call time (`toolbarState()`), so a command never trusts a stale `updateToolbarState`.

### Surface map

| File | Change |
|---|---|
| `src/views/ToolRibbon.ts` | Button defs lifted to exported `TOOLBAR_GROUPS` with `command` names; `ToolbarActions` interface; `canRunToolbarAction`; `trigger()` for commands |
| `src/views/MindMapView.ts` | Alt+Arrow registered on the view scope; `toolbarState()` and public `runToolbarCommand()` |
| `src/main.ts` | One `mindmap-<id>` command per `TOOLBAR_GROUPS` entry that has a `command` |
| `src/views/ToolRibbon.test.ts` | Availability rule; unique ids and command names; only "Map properties" lacks a command |

### Test fixture

- `vault/tests/mindmap/hotkey-commands.md`: a left-to-right map (Kitchen / Garage / Garden). Covers Alt+↑ with a conflicting "Move line up" binding, node-editor passthrough, a Ctrl+Backspace-bound "Delete node" deleting exactly one node, and command availability (selection, reading mode, non-map views).
- `vault/tests/mindmap/hotkey-commands-vertical.md`: the same content with `direction: top-down`. Covers screen-direction move commands (↑ outdents).

Masters are in `e2e/fixtures/`.

### Follow-ups

- [[Outdenting a bullet under a heading looks like a no-op]]: found during manual testing. Outdenting a top-level bullet under a heading takes two presses (bullet → paragraph → heading), so the first one looks like nothing happened. That's the outdent operator, shared by the toolbar and Alt+Arrow, so it was deliberately left out of this PR.
