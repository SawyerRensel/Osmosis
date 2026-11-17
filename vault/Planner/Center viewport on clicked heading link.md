---
title: Center viewport on clicked heading link
summary: Currently, clicking a heading link opens the document in Note View.  It should instead center and select the nodes of the heading in Mind Map View.  Should work for both internal and external headings.
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Heading Links suggestions not working in Mind Map View]]"
status: Done
priority:
progress_current:
progress_total:
date_created: "2026-10-30T11:52:36.401Z"
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
# Optimization 

## What tool or process needs improvement?

*Which existing tool, script, or workflow are you referring to? Include the name if you know it.*



## What's slow or frustrating about it?

*What specifically takes too long or feels clunky?*



## What would "better" look like?

*Describe your ideal outcome. How should it work differently?*
## What was implemented

**Where it shipped:** [PR #46](https://github.com/SawyerRensel/Osmosis/pull/46), `feature/mindmap-heading-links` → `feature/3d-graph-view-phase-3`. Shipped with [[Heading Links suggestions not working in Mind Map View]].

### The cause

- **Links left the map.** `openNodeLink` handed every internal link to `workspace.openLinkText`, which opens the target in the active leaf. The active leaf is the mind map, so the map was replaced by Note View.
- **Blank map on Back** (found during this task: Ctrl+O or following a link from a map tab, then Back). `getState()` deliberately left out `file`, because `setState` auto-pinned any view whose state named a file. History restores a view from `getState()`, so the restored map had no note to load. `onOpen`'s `loadActiveFile()` then found only the mind map leaf itself and drew nothing.

### The fix

- **Link clicks** (`openNodeLink(anchor, e)`):
  - Plain click: `this.leaf.setViewState(mindmap, { file, pinned, linkJump: true }, { subpath })`. This loads the target's map in the same tab, pinned.
  - Mod-click: the same, in `getLeaf("tab")`.
  - Mod+Alt-click: `openLinkText(…, "tab")`, so the note opens in Note View in a new tab.
  - Non-Markdown or unresolved targets fall back to `openLinkText`, as before.
  - The link resolves against the node's own note, which is the embedded note for a transcluded node.
- **History:**
  - `getState()` now returns `file` + `pinned`. `setState` pins unless `pinned === false`, so restoring an unpinned map no longer pins it, and callers that pass only `file` still pin.
  - `setState` sets `result.history = true` when it switches note or on a `linkJump` (so jumps within the same note are undoable), and fits the view when it switches note.
  - `getEphemeralState()`/`setEphemeralState()` carry `viewport` (viewBox + zoom), so Back returns to the exact position.
- **Reveal** (`revealSubpath`): `resolveSubpath` on the metadata cache gives the start offset of the heading or block. `nodePathAt` turns that offset into a node path. Any collapsed ancestors are expanded, then the node is selected and centered (`centerOnNode`, which was extracted from `centerOnRoot`). If the target isn't found, a "Couldn't find" notice is shown.

### Decisions worth remembering

- **Same tab, pinned** (Sawyer's choice). An unpinned map would snap back to the paired note on the next click there. A jump within the open note keeps the existing pin state.
- **Only the heading node is selected**, not its subtree (Sawyer).
- **Block refs and plain note links are included** (Sawyer). A plain link fits the whole map.
- **Modifier mapping** (Sawyer): Mod-click opens a mind map in a new tab; Mod+Alt-click opens Note View in a new tab. This deliberately departs from Obsidian, where Mod+Alt means split.
- **`getState()` now includes `file`.** This reverses the old "never return `file`" rule. The explicit `pinned` flag removes the reason for that rule. Side effect: an unpinned map reopens on its last note after a restart, then follows the note pane as before.
- **Uses Obsidian's resolver.** `resolveSubpath` rather than our own heading matching, so nested `#A#B` paths, case, and block IDs resolve exactly as Obsidian resolves them.
- **`nodePathAt` skips transcluded nodes**, because their ranges index the embedded file and could collide with offsets in the host file.

### Surface map

| File | Change |
|---|---|
| `src/views/MindMapView.ts` | `openNodeLink` routing and modifiers; `getState`/`setState` with `file` + `pinned` + history; `get/setEphemeralState`; `revealSubpath`; `centerOnNode`; `nodeFile`; `isViewport` |
| `src/mindmap-links.ts` | New pure `nodePathAt` (offset → node path) |
| `src/mindmap-links.test.ts` | 5 unit tests |

### Test fixture

`e2e/fixtures/heading-links/` (copied to `vault/tests/mindmap/heading-links/`). `Link Source.md` has same-note, other-note heading, nested heading, block ref, plain, and missing-heading links. `Link Target.md` holds the targets, including `^glue-tip`.

### Not done

- Collapse state still isn't persisted across note switches, so Back doesn't restore folds.
