---
title: "Mind Map - Ctrl+arrow keys navigate the hierarchy"
summary: "Plain arrows keep moving by screen direction; Ctrl+arrows move strictly by hierarchy (sibling, parent, first child) and Ctrl+Shift+arrows extend the multi-selection the same way. 2D and 3D."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Toolbar - Mind map toolbar sizing, buttons and icons]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-12T16:50:00.000Z"
date_start_scheduled: "2026-11-12T16:36:55.000Z"
date_start_actual: "2026-11-12T16:36:55.000Z"
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

# Mind Map - Ctrl+arrow keys navigate the hierarchy (T72)

## Request (Sawyer, 2026-11-12, verbatim)
> Navigate a mind map using the Ctrl key as a modifier to the arrow keys that strictly follows the hierarchy instead of relative to the screen … keep the default but add Ctrl as a modifier. Ctrl+Shift + arrow keys should also work to multiselect.

## Decided
- Plain arrows: unchanged (screen direction; 3D `src/graph3d/arrow-nav.ts`, 2D MindMapView ~6490).
- Ctrl (Mod on macOS? use Obsidian's `Mod` = Ctrl/Cmd) + Up/Down = previous/next sibling (stop at the ends, no wrap); Ctrl+Left = parent; Ctrl+Right = first child (or the last-visited child if such memory already exists for screen nav; otherwise first).
- **No mirroring** on the left side of a balanced 2D map (grill, 2026-11-12): Left is always parent, Right always first child, matching T63's semantic outdent/indent.
- Ctrl+Shift+arrow extends the multi-selection along the same hierarchy moves (look at how plain Shift+arrow multi-select works today, if it does; otherwise add the selected node to the selection and move the cursor).
- Alt+arrows (move/structural) unchanged. Check conflicts: Ctrl+arrow while editing text is word-jump — gate on not editing. Check whether Obsidian core or the plugin already binds Mod+arrows in these views (grep `"Mod"` registrations).
- Collapsed/hidden children: Ctrl+Right on a collapsed node — expand or do nothing? Pick what plain navigation does with collapsed nodes and record it.

## Acceptance criteria
- 2D and 3D: Ctrl+arrows walk siblings/parent/child regardless of layout direction; Ctrl+Shift+arrows grow the selection; plain arrows unchanged; editing a node's text, Ctrl+arrows jump words as before.
- Pure helper `hierarchyStep(tree, id, dir)` (or similar) with unit tests, shared by both views.
- Controls help and docs keyboard reference updated.

## Context budget
Under ~130k. arrow-nav.ts, selection.ts whole; views by grep/range.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.

## Batch implementation notes (awaiting manual test)

Code commit `d3f7e4a` on `feature/ctrl-arrow-hierarchy-nav`.

### Approach
- New pure module `src/hierarchy-nav.ts`, shared by both views: `hierarchyStep(tree, id, step)` over a `Hierarchy` (`parent(id)`, `children(id)`), `arrowKeyStep(key)` (Up → prevSibling, Down → nextSibling, Left → parent, Right → firstChild, never mirrored) and `edgeHierarchy(edges, include)` that builds a `Hierarchy` from the 3D graph's `hierarchy` edges.
- **3D:** `Graph3DScene.hierarchyTarget(step)` runs `hierarchyStep` over the scene's links, treating plates that are departing, invisible or not placed yet as absent, as `arrowTarget` already does. The view's existing `arrowKey` handler takes an optional step. `Mod+Arrow` and `Mod+Shift+Arrow` are registered on the view Scope next to the plain/Shift arrows, so selection, extend, camera glide and back/forward history all work exactly as for plain arrows.
- **2D:** `handleKeyDown` checks for Ctrl/Cmd (without Alt) + arrow before the direction-aware `resolveArrowAction`, and calls the new `navigateHierarchy(step, extend)`. The tree comes from `nodeMap` (LayoutNode parent/children). `Mod+Arrow` and `Mod+Shift+Arrow` are also claimed on the view Scope using the Shift+Enter pattern (`if (!e.defaultPrevented) handleKeyDown(e)`), so a global hotkey on those keys can't take them first.

### Decisions worth remembering
- **No mirroring, no layout swap** (Sawyer's decision): Left is always the parent and Right is always the first child, on either side of a balanced map and in top-down layouts too.
- **Siblings stop at the ends.** Plain 2D arrows jump to a cousin at the end of a sibling list. Ctrl+arrows don't, because the ticket asks for strict hierarchy.
- **Collapsed node + Ctrl+Right (2D):** expands the node, just like plain Right/Shift+Right do today; press again to step in. In 3D, collapsed or hidden children aren't in the scene, so nothing happens.
- **The root is never a target in 2D** (same as plain Left): Ctrl+Left on a top-level node does nothing. Top-level nodes are siblings across both sides of a balanced map, in document order.
- **Ctrl+Right goes to the first child.** There's no last-visited-child memory in either view, so I didn't add one.
- **Ctrl+Shift extend** reuses each view's existing extend: in 2D that's `extendSelectionTo` (so backtracking deselects); in 3D the target is appended as the new primary.
- **Editing guard:** in 2D the Scope handler returns `undefined` while `editingNodeId` is set (and `handleKeyDown` returns early anyway). In 3D the existing `isEditableTarget` / `editor.isOpen` guard applies. Either way the editor keeps its Ctrl+arrow word jumps.
- Neither view had an existing `Mod+Arrow` registration. Before this change, 2D Ctrl+arrow behaved like a plain arrow, because `handleKeyDown` didn't look at Ctrl.
- On macOS, `Mod` is Cmd. 2D also accepts a physical Ctrl from the container keydown if the OS lets it through.

### Surface map
| File | Change |
|---|---|
| `src/hierarchy-nav.ts` | New pure module: `hierarchyStep`, `arrowKeyStep`, `edgeHierarchy` |
| `src/hierarchy-nav.test.ts` | Unit tests (siblings, stop at the ends, parent/child, root/leaf, filter, key mapping) |
| `src/views/Graph3DScene.ts` | `hierarchyTarget(step)` |
| `src/views/Graph3DView.ts` | `Mod`/`Mod+Shift` arrow Scope registrations through `arrowKey` |
| `src/views/MindMapView.ts` | Scope registrations, Ctrl branch in `handleKeyDown`, `navigateHierarchy` |
| `src/graph3d/controls-help.ts` | Three new rows in Keys |
| `docs/mind-mapping/navigation.md` | New "Following the outline" table (the 2D arrow docs live here, not in `editing.md`) |
| `docs/mind-mapping/graph-3d.md` | Three new key rows |

### Fixture
`e2e/fixtures/ctrl-arrow-hierarchy.md` → `vault/tests/mindmap/ctrl-arrow-hierarchy.md`: a balanced left-right map ("Marina Guide") with four sections, so two land on each side.

### Manual retest (desktop; on a phone only with a hardware keyboard)
1. Reload Obsidian (Ctrl+R). Open `tests/mindmap/ctrl-arrow-hierarchy.md` as a mind map.
2. Select **Visitor pontoon** (right side). Press Ctrl+Down twice: Fuel dock, then Long-stay pontoon. Press Ctrl+Down again: nothing happens (no jump to Laundry). Ctrl+Up walks back.
3. On **Visitor pontoon**, press Ctrl+Right to get Water tap, then Ctrl+Left to get Visitor pontoon, then Ctrl+Left again to get Berths.
4. On a **left-side** branch (e.g. Weather or Contacts): Ctrl+Right goes to its first child, even though that child is on the screen's left. Ctrl+Left goes back to the parent. Plain Left/Right there are still mirrored as before.
5. On Visitor pontoon, press Ctrl+Shift+Down twice: three nodes are selected. Ctrl+Shift+Up deselects the last one (backtracking).
6. Collapse Chandlery (Space), then press Ctrl+Right on it: it expands. Press Ctrl+Right again: you land on Charts.
7. Press F2 to edit a node's text, then Ctrl+Left/Right: the caret jumps by words and the selection doesn't move.
8. Switch the map to top-down: Ctrl+Up/Down are still siblings, and Ctrl+Left/Right are still parent/child.
9. 3D: open the same note in the 3D graph and select a line plate. Ctrl+arrows follow the outline wherever the plates sit on screen, and the camera glides after them. Ctrl+Shift+arrow adds to the selection. Plain arrows still go by screen direction. Check that the controls help (⋯ → Controls help) lists the new rows.

### Not verified
I couldn't run Obsidian. Unverified: that Obsidian core doesn't swallow Mod+Arrow before the view Scope (it shouldn't, since the Scope takes it first); the double-dispatch guard in 2D (the container keydown runs first and calls `preventDefault`, then the Scope skips); and how macOS handles Cmd+arrow.
