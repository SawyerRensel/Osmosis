---
title: Expose all Markdown elements in Mind Map Edit Mode
summary: Right now it hides any bullet or heading notation.
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-04T06:41:12.412Z
date_modified: 2026-08-04T17:41:22.000Z
date_start_scheduled:
date_start_actual:
date_end_scheduled:
date_end_actual: 2026-08-04T17:41:22.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/12
---
# Optimization 

## What tool or process needs improvement?

*Which existing tool, script, or workflow are you referring to? Include the name if you know it.*

The node-editing experience in an Osmosis Mind Map.  

## What's slow or frustrating about it?

*What specifically takes too long or feels clunky?*

It hides list and heading notation elements, and maybe others.  For example, sometimes I want to remove a list notation from a given node but am not able to do so unless I go back to Note Edit mode and do it there.  The context-switching is painful. 

## What would "better" look like?

*Describe your ideal outcome. How should it work differently?*

Every character in a line should show up when editing a node in Mind Map view excepting line-card hashes at the end - e.g.`^os-et33sd`, which are already hidden.  

## What was implemented

Shipped in [PR #12](https://github.com/SawyerRensel/Osmosis/pull/12) → `release/0.0.4`.

### The cause

The inline editor opened on a node's `content` — the label the parser produces *after* stripping the structural prefix into `type` and `depth`. Saving re-serialized that label from type/depth via `serializeLine`, so a bullet could only ever come back as a bullet. The markers weren't hidden by choice; they had already been thrown away by the time the edit box existed.

### The fix

Nodes now carry `raw` (`src/types.ts`), set by the parser: the node's exact source bytes minus the trailing block ID. The edit box opens on that and `renameNode` splices it back into the node's `range` verbatim — no re-serialization from type/depth. So `- `, `## `, `1. `, `[x] `, `![[…]]` are all editable from the map.

Two things stay hidden, because neither is text:

- **The trailing block ID** (`^os-a1b2c3`) — card identity and style anchor, re-attached on save. It survives a line that changes kind mid-edit, so converting `- item ^os-x` to a heading keeps the card.
- **The leading indentation** — the one marker the map already draws. Showing it rendered the whole box in source style, because Obsidian's editor reads a tab-indented line as an indented *code block*. Depth is visible in the map's structure and changed with indent/outdent, not by typing tabs.

`nodeEditText` withholds both; `restoreEditedLine` puts them back. Exact inverse: an unchanged edit round-trips to the original bytes, spaces stay spaces (no tab normalization), and a line that changes kind keeps its place in the tree.

### Decisions worth remembering

- **The initial selection covers the text but not the marker.** Type-to-rename works as before, and "add child, then type" still produces a bullet instead of overwriting the `- ` the new line is made of. Ctrl+A still reaches the marker.
- **A type change doesn't re-indent children.** Retyping `- Parent` as `## Parent` converts that line only. Heading spacing and ordered-list numbering are re-normalized by the existing write path (`writeMarkdown` → `normalizeHeadingSpacing`), so the result is well-formed either way, but nesting is the user's to manage.
- **Typed whitespace adds to the node's indentation rather than replacing it**, since depth belongs to the map's structure.
- **Multiline blocks are untouched throughout.** Code fence / table / blockquote bytes are atomic, their ID lives on a standalone `^id` line outside `range`, and a leading `>` is content rather than depth — `nodeIndent` returns `""` for them.
- The old "strip `[ ]` for editing, re-add on save" special case is gone. The checkbox is now just characters.

### Surface map

| File | Change |
|---|---|
| `src/types.ts` | New `raw?: string` on `OsmosisNode` |
| `src/parser.ts` | Populates `raw`; `ParsedLine.raw`; `createNode` takes it (defaults to `content`, already verbatim for multiline blocks) |
| `src/mindmap-edit.ts` | `nodeEditText`, `restoreEditedLine`, `nodeIndent`, `reattachBlockId`, `editSelectionStart`, `isMultilineBlock` |
| `src/views/MindMapView.ts` | `startEditing` opens on `nodeEditText`; `stopEditing` compares/passes the whole line; `renameNode` splices it; `createFallbackTextarea` takes the value + selection start |
| `src/parser.test.ts`, `src/mindmap-edit.test.ts` | `raw` byte-exactness; the five helpers; round-trip over every node of a mixed document |

### Test fixture

`e2e/fixtures/raw-line-editing.md` → `vault/tests/mindmap/raw-line-editing.md`. Covers tab and space indentation, two nesting levels, checkboxes, ordered items, an embed, inline block IDs on a bullet / task / heading, and a callout with a standalone `^id`.

### Follow-ups

- [[Fix Mind Map Editing box]] — the edit box still doesn't scale with zoom or wrap the node as you type.