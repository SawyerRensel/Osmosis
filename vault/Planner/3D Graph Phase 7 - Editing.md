---
title: 3D Graph Phase 7 - Editing
summary: "Full editing in 3D: extract the edit pipeline and a per-file shared undo history from MindMapView, then inline editing, drag-to-link, and the four structural edits."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: To-Do
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-10-29T01:03:06.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph Phase 4 - Near tier]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

1. **Refactor (behaviour-neutral):**
   - Move edit application out of `MindMapView.ts` into a shared module: `applySnapshot`, the undo/redo history, and the `vault.modify` / `processFrontMatter` paths around lines 7660–7990.
   - The module owns **one undo/redo history per file**, shared by both views.
   - 2D edit mode must behave exactly as before. Use `grep -a`, because the file contains NUL bytes.
2. **Inline editing** in the near tier, using the same `raw` bytes and `nodeEditText` / `restoreEditedLine` / `reattachBlockId` helpers as 2D.
3. **Drag-to-link:**
   - Drag line A onto line B to insert a link to B at the end of A.
   - Stamp a block ID on B with `generateBlockId` if it has none.
   - Build the link text with `app.fileManager.generateMarkdownLink`.
4. **Structural edits:** add child or sibling, delete, move or reparent (within a note and across notes), and retype. These reuse the `src/mindmap-edit.ts` helpers.

**Acceptance:**
- Every 2D edit operation still works after the refactor.
- Each 3D edit writes the correct bytes.
- Undo in either view undoes the other view's edits to that file.
- Unit tests cover the shared history.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.
