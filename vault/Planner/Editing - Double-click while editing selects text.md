---
title: "Editing - Double-click while editing selects text"
summary: "Round 11 (T82). In the 3D plate editor and the 2D inline node editor, a double-click selects a word like note edit mode instead of saving."
tags:
  - task
calendar:
  - Bug Report
context:
people:
location:
related:
  - "[[Mind Map - Shift+Enter adds a sibling above]]"
status: Done
priority:
progress:
date_created: "2026-11-15T21:50:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-15T21:57:00.000Z"
date_start_actual: "2026-11-15T21:57:00.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Editing - Double-click while editing selects text (T82)

## Problem (Sawyer, 2026-11-15)
> Doubleclicking when editing a plate should not commit it. It should select the text like doubleclicking does in note edit mode

Decision (Sawyer, 2026-11-15): apply to **both** 3D plates and the 2D inline editor.

## Cause (read from code, certain)
- 3D: `src/views/Graph3DEdit.ts` ~104–108: a `dblclick` listener on the editor anchor calls `this.close(true)`.
- 2D: `src/views/MindMapView.ts` ~7232–7236: a `dblclick` listener on the editor container calls `this.stopEditing(true)`.

## Fix
Keep `e.stopPropagation()` (the canvas/map must not act on it, e.g. 2D `handleDblClick` at ~1936 must not start another edit), drop the save. CodeMirror (and the textarea fallback) then select the word natively. Update the comments.

## To check
- A double-click on *another* plate/node while editing still behaves as before (it goes through the scene/SVG, not the editor).
- Triple-click selects the line (native) and doesn't save.
- Mobile: a double-tap in the editor doesn't save either.

## Conventions
- Round 11 batch ticket. Follow `batch/subagent-brief.md`: stay on the branch the orchestrator checked out, commit code by path and the note separately, set `status: In-Review`, add "Batch implementation notes (awaiting manual test)" with desktop and phone retest steps. No push, no PR.
- `vault/Bases/Osmosis Project Board.base` has an uncommitted edit of Sawyer's. Never stage, revert or touch it; "clean tree" means clean apart from that file.
- Pure logic goes outside `src/views/` (Vitest cannot import `obsidian`). Run vitest with `--maxWorkers=2`.
- Never read whole: `src/views/MindMapView.ts` (~84k tokens, NUL bytes, use `grep -a -n`), `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts`, `styles.css`.

## Context budget
Small: ~40k tokens. `Graph3DEdit.ts` by range, `MindMapView.ts` ~7200–7260 and `handleDblClick` by grep.

## Test plan (Sawyer)
1. 2D: double-click a node to edit; double-click a word inside the editor → word selected, still editing. Save with ✓/Enter.
2. 3D: same on a plate.
3. Double-click another node while editing → same as before this change.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes
Commit 945d156 on `fix/dblclick-selects-text`.

**Approach.** Both `dblclick` listeners keep `e.stopPropagation()` and no longer save. CodeMirror then selects the word natively. Comments updated.

**Checked by reading the code**
- 2D: `handleDblClick` is registered on the map `container` (~1936) and starts an edit only for a clicked node. The editor lives in `contentEl` and its `dblclick` stops propagation, so the map never sees a double-click made inside the editor. A double-click on another node still goes through `handleDblClick` as before.
- 3D: `Graph3DScene.ts`, `Graph3DView.ts`, `Graph3DNear.ts` and `Graph3DPlates.ts` have no `dblclick` handling at all, so nothing behind the editor reacts. The editor anchor's `dblclick` still stops propagation. A press elsewhere still goes through the existing outside-click handling, untouched.
- Triple-click and a mobile double-tap fire no save path: the only `dblclick` listeners were the two removed saves. 2D `handleDblClick` also ignores touch.

**Decisions.** Kept `stopPropagation` rather than deleting the listeners, so no ancestor listener can start another edit on the double-click. The 2D edit overlay built at ~7541 (a second editor) never had a `dblclick` save, so it is unchanged.

| File | Change |
|---|---|
| `src/views/Graph3DEdit.ts` | `dblclick` on the anchor: stopPropagation only |
| `src/views/MindMapView.ts` | `dblclick` on the editor container: stopPropagation only |

**Fixture.** None needed; any note works.

**Not verified.** I can't see Obsidian, so the native word selection and the phone double-tap are untested.

**Retest (desktop)**
1. 2D map: double-click a node to edit, then double-click a word inside the editor. The word is selected and you are still editing. Triple-click selects the line. Save with the check or Enter.
2. 3D graph: same on a plate.
3. While editing, double-click another node or plate. Behaviour is the same as before.

**Retest (phone)**: double-tap a word in the editor. It selects (or does the native thing) and doesn't save.
