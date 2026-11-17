---
title: Mind Map - Styles survive text edits
summary: A style applied to a mind-map node is keyed by the line's block ID (reused, or stamped as ^os-xxxxxx), not by a hash of its text, so editing the text no longer drops the style.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
status: Done
priority:
progress:
date_created: "2026-11-09T22:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-09T22:00:00.000Z"
date_start_actual: "2026-11-09T22:00:00.000Z"
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

# Bug Report

## What happened?

Styling a mind-map node (colour, shape, border, anything) stores the style in the note's `osmosis-styles` frontmatter under a selector. For a line with no block ID that selector was `_n:<content hash>`. The hash is built from the node's type, depth, text and occurrence, so editing the text changes the hash and the style is orphaned: it vanishes from the node.

## What should have happened?

The style stays with the line when its text is edited.

## Where is this file located?

`e2e/fixtures/style-survives-edits.md`, copied to `vault/tests/mindmap/style-survives-edits.md`.

## Spec (settled by Sawyer, 2026-11-08 grill)

- Styling a node reuses the line's existing block ID (`^anything`), or stamps a new `^os-` ID onto the line (`generateBlockId`) and keys the style by it.
- No migration of old `_n:` styles. They keep working until the node is restyled; restyling moves the style to the block-ID key and drops the `_n:` entry.
- Lines that cannot take a block ID keep the `_n:` fallback.
- The stamp and the style write are one undo step.
- How IDs render or are hidden is unchanged.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

### Cause

`buildPreferredSelector` (`src/styles.ts`) returned `^blockId` when the parsed node had one and `_n:<node.id>` otherwise; `applyNodeStyleOverrides` (`MindMapView.ts`) only ever *used* an ID the line already had. Nothing stamped one, so unstamped lines were keyed by a content hash.

### Approach

`applyNodeStyleOverrides` now, inside one edit group: (1) re-reads and re-parses the file, (2) asks the pure `planStyleKeys` (`src/mindmap-style-key.ts`) for each node's selector and any stamp, (3) writes the stamped text through `writeFileTracked`, (4) writes the styles to frontmatter under those selectors, (5) closes the group, then renders. The existing merge code already moves an `_n:` entry onto the block-ID key and deletes it when the node's selector is a block ID, so restyling a legacy node needs no new code.

Selector choice per node (`planStyleKeys`):

| Line | Key |
|---|---|
| Has a block ID (any `^id`) | `^id`, no edit |
| Heading, bullet, ordered item, one-line paragraph, blockquote | stamps ` ^os-xxxxxx` at the end of the line |
| Fenced code block (not a card fence), table | stamps a `^os-xxxxxx` line after the block (Obsidian's multi-line block ID) |
| Card fence (` ```osmosis `) | `_n:` fallback (it has its own `id:` identity) |
| `![[embed]]` line | `_n:` fallback |
| Paragraph line that runs on into the next line (a block ID only counts at the end of a paragraph) | `_n:` fallback (the mind map's save normalisation normally splits such runs) |
| Root | `_n:` fallback |
| Node pulled in by transclusion (its line is in another file) | unchanged: its own `^id` if the source line has one, else `_n:` |
| Line the fresh parse can no longer find | `_n:` fallback |

The rule is the same one the 3D graph's block links and "Generate flashcards" use (`canStamp` in `src/graph3d/edit.ts`, now exported; `stampInsertion` for the text). Frontmatter is not a node, so it is never stamped.

### Decisions worth remembering

- **Stamp only when the write sets something.** A write that only clears keys (e.g. pasting an empty style) stamps nothing, so clearing styles never litters a note with IDs.
- **One undo step.** `applyNodeStyleOverrides` opens its own `beginEditGroup` unless a live edit (colour-picker drag) or an outer group is already open. The group keeps the first `before` and last `after`, so Ctrl+Z reverts the stamp and the style together. During a live edit the first drag tick stamps; later ticks find the ID already there; the live session coalesces everything into one step.
- **Fresh parse, then find by node ID.** The stamp offsets come from a parse of the bytes just read, with each node found again by its (content-derived) parse ID, as the 3D graph does. Stamping does not change a node's ID.
- **Every path goes through `applyNodeStyleOverrides`**: the sidebar's `writeNodeStyle` (colour, shape, border, text, ...; multi-node selection), paste style, node-width drag-resize, and the toolbar's style/class assignment. The 3D graph does not write node styles (it only reads `osmosis-styles` map settings, `src/graph3d/planets.ts`).
- **Theme extraction read fix.** "Save theme from map" (`PropertiesSidebarView.extractThemeFromMap`) read only `_n:` keys, so block-ID-keyed styles would have been missed. It now uses `lookupNodeStyle` (block ID, then `_n:`, then tree path). Side effect: tree-path keyed local styles are now folded in too.
- **Not changed:** how `^ids` render or hide; `resetNodeStyles` (already clears both the `^id` and `_n:` keys); variant styles (`_n:` read at `MindMapView.ts` ~8408).

### Surface map

| File | Change |
|---|---|
| `src/mindmap-style-key.ts` | New pure `planStyleKeys`: selector per node + stamped text |
| `src/mindmap-style-key.test.ts` | Unit tests: reuse, heading/bullet/nested/ordered/paragraph/code block stamps, fallbacks, batch distinct IDs |
| `src/views/MindMapView.ts` | `applyNodeStyleOverrides` split into stamp + write inside one edit group (`stampStyleBlockIds`, `writeNodeStyleOverrides`) |
| `src/views/PropertiesSidebarView.ts` | Theme extraction reads node styles via `lookupNodeStyle` |
| `src/graph3d/edit.ts` | `canStamp` exported |
| `e2e/fixtures/style-survives-edits.md` | Fixture (master) |
| `vault/tests/mindmap/style-survives-edits.md` | Fixture copy |

### Fixture

`vault/tests/mindmap/style-survives-edits.md`: heading, bullets (one nested), ordered items, two paragraphs, a bullet with an existing `^tide-log`, a code block, and `_n:` styles in frontmatter on the paragraph "Legacy styled line, restyle me." (yellow) and the ordered item "Plot the course" (teal hexagon). Reload Obsidian (Ctrl+R) after the file is copied, before testing.

### Manual test

1. Open the fixture in the mind map. The two `_n:` lines show their old styles.
2. Select "Check the mooring lines", set a fill colour. In the source view, the line now ends with ` ^os-xxxxxx`; the frontmatter has a `"^os-xxxxxx"` entry.
3. Edit that node's text (F2). The fill stays.
4. Select "Log the tide table" (already `^tide-log`), set a shape. No new ID; frontmatter gains `"^tide-log"`.
5. Select several nodes (heading, bullet, ordered item) and set a colour: each gets an ID; one Ctrl+Z reverts every stamp and every style together; Ctrl+Shift+Z redoes both.
6. Style the code block: a `^os-xxxxxx` line appears right after the closing fence.
7. Old `_n:` styles: the yellow paragraph ("Legacy styled line, restyle me.") and the teal hexagon ("Plot the course") still show. Restyle "Plot the course" (change its colour): its line gains an `^os-` ID and the `_n:03a44489` entry is gone from the frontmatter. Now edit its text: the style stays. (For contrast, editing the text of the still-`_n:` yellow paragraph loses its yellow, as before.)
8. Pasting an empty style onto an unstyled node adds no ID.

### Not verified

I cannot see Obsidian. Unit tests cover the selector/stamp logic only; the edit-group undo behaviour and the legacy `_n:` migration are read from the code (`EditRecorder`, existing merge in `writeNodeStyleOverrides`), not run. Transcluded nodes still use `_n:` when their source line has no ID (stamping would mean editing another file).
