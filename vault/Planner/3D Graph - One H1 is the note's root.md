---
title: 3D Graph - One H1 is the note's root
summary: "When a note is exactly one H1 and everything under it, the H1 plate is the note's root and the file-name plate is not built: frontmatter tags and properties hang from the H1, and links into the note land on it. Two H1s, none, or a line outside the H1 keep the file-name plate as root."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Flatten branches]]"
  - "[[3D Graph Phase 1 - Graph model]]"
status: In-Review
priority:
progress:
date_created: "2026-11-07T17:13:00.000Z"
date_modified: "2026-11-07T17:23:00.000Z"
date_start_scheduled: "2026-11-07T17:13:00.000Z"
date_start_actual: "2026-11-07T17:13:00.000Z"
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

# Feature Request

## What do you need built?

*Spec from Sawyer, 2026-11-07, settled.*

- **When a note has exactly one H1, the H1 plate is the note's root and the file-name plate is not built.** The file-name plate is left out of the model entirely, so it takes no space and plays no part in the forces. Frontmatter tags and properties hang from the H1. Links into the note (`[[Note]]`, no subpath) land on the H1.
- **When a note has more than one H1, or none, the file-name plate is the root**, as today.
- Flat branch slices pivot on the root: the H1 or the file plate. Flatten is touched only as far as needed to use the new root as its pivot. A later ticket reworks the slice spread and spacing.
- The ambiguous case (lines before the sole H1, or top-level content outside it) was left to the implementer to settle and record. See "Batch implementation notes".

## What problem does this solve?

Nearly every note starts with an H1 that repeats its file name, so the graph drew the title twice: a file plate "Sailing Basics" and, beside it, an H1 "Sailing Basics" (Sawyer's screenshot `batch/feedback-2026-11-07b/4.png`). The duplicate costs space and a node in the force calculation, and reads as clutter.

## What's your current workaround?

None. Every note with an H1 shows both plates.

## Reference Attachments/Screenshots

- Sawyer's screenshot of the duplicate: `batch/feedback-2026-11-07b/4.png` (in the orchestrator's batch folder, not in the vault).
- 2D prior art, both Ideas and not built: [[Render filename as H1 in Mind Map View if no H1 exists]] and [[Setting to disable root node when transcluded]]. The 2D mind map already lays its parse root out as an undrawn point, so the H1 reads as the map's root there. This ticket matches that.

## Batch implementation notes (awaiting manual test)

Commit `fc19538` on `feature/3d-graph-h1-root`, cut from `fix/3d-graph-overlay-toggles` at f2b6ed7.

### Approach

- **The rule (`soleH1` in `src/graph3d/model.ts`):** the H1 is the root only when the parse root has exactly **one** child and that child is a level-1 heading. Frontmatter is not in the parse tree, so it doesn't count. A line before the H1, a second H1, or any other top-level node gives the root two children, and the file plate stays. This is the suggested rule ("everything apart from frontmatter sits under the H1"), and the tree shape gives it for free. Content after the H1 always nests under it, because an H1 is the top heading level.
- **The H1 root takes the core's ID, `noteNodeId(path)`.** It stays a `line` node (`kind: "line"`, `source` = the heading) and gains `root: true`. The new `isNoteRoot(node)` (kind `note`, or `root`) replaces the core-kind checks wherever a consumer means "the note's root". Every lookup by `noteNodeId(path)` therefore works unchanged: hops, `linkTargetNode`, `selectAfter`, study's visited list, the frontmatter tag and property edges, and `[[Note]]` links. `[[Note#H1 text]]` and a block ID on the H1 also land on the root.
- **ID stability:** the ID doesn't depend on the H1's text, block ID or content hash. Editing the H1, stamping an ID on it, or editing anything under it keeps the root's ID, so its settled position holds.
- **When an edit adds a second H1 (or a line above the H1):** `note:path` becomes the file plate again and keeps the position the H1 had. The first H1 becomes an ordinary line with a new `line:` ID, seeded beside the file plate as a new line. Removing the second H1 reverses this: the H1 takes over `note:path` with the file plate's settled position, and the old H1 line departs. The H1 plate therefore "jumps" to where the file plate was, once, on that edit. Settled nodes of other notes don't move: the model rebuild only affects the edited note, as with any edit.

### Consumer by consumer

- **Tags, properties, links into a note:** in the model, the pass-2 sources and targets use the note index's `coreId`, which is now the root's ID. Frontmatter offsets aren't in any line's range, so they fall back to the root.
- **Hops, horizon, `NOTE_STAND_OFF`:** hops already target `noteNodeId`. Flights and edge rides to a root stand off at `NOTE_STAND_OFF` (160) when it is an H1, because a hop arrives at the note rather than at one line.
- **`settle.ts`:** a pinned H1 root of a settled note acts at its cluster's strength, as a core does. In an unsettled note it gets the base strength, as a line does. `ChargeNode` gained `root?`.
- **`positions.ts`:** a new H1 root is seeded beside the note that pulled it in (`NOTE_SEED_DISTANCE`), as a core is.
- **`flatten.ts`:** slices pivot on the root (`branch.core` = the root's ID, and `noteCores`/`notePush` follow it). Under an H1 root the walk starts at the H1 at outline depth 1, so the H1 is never a branch root, because it is the pivot. At flat depth 2 and above, branch roots and weights are exactly as before. Below depth 2 (slider at the right end), an H1-root note roots its branches at the H1's children, fully flat, as it does at depth 2. A core note still becomes one slice rooted at its H1. The branch weight is now per note, `flatWeight(max(rootDepth, topDepth + 1) + 1, flat)`, so the ramp never loosens on the way to depth 1 (it would have gone 1 → 0.5 → 1).
- **`liftoff.ts` (2D → 3D):** the map's undrawn root box seeds a core behind the map, as before. For an H1 root it is skipped, and the H1 seeds from its own box. A map focus on the root lands on whichever root the note has.
- **3D → 2D:** the H1 root is a line, so the map opens on the H1 line. No change needed.
- **Plates, near tier and appearance:** **decided: the H1 root keeps its heading styling.** It gets a line plate (not the larger core plate), the line colour, a near-tier panel that renders it as a heading, and the heading colour in colour-by-type. This is the least visible change (only the duplicate goes), and it matches the 2D map. The trade-off: from far off, a note's title plate is now line-sized. Changing that is one line in `Graph3DScene.shapeFor` (`isCore` → `isNoteRoot`) if Sawyer wants the big plate back.
- **Overlays:** colour by note follows `nodeColor` (line colour). Memory colour gives an H1 root the note's mean, as a core has, unless the H1 has a card of its own. Tags off (`visibleModel`) hides the frontmatter tag hubs and their edges from the H1 with no change, because they are ordinary tag edges. Colour by tag still spreads the frontmatter tag down from the root.
- **Panel links (`links.ts`):** these go through `linkTargetNode`, so `[[Knots]]` goes to the Knots root (its H1).
- **Edit mode:**
  - **Drag-to-link onto an H1 root writes `[[Note]]`**, as a core does, not `[[Note#Heading]]`. The H1 is the note.
  - **From the same note, "Add link" is not offered**, and a direct call gives the "already in that note" Notice, as for a core.
  - **The drop menu on an H1 root offers "Move under" and "Move to end of note", but not "Move after".** "Move after" would put the line outside the H1 and so bring back the core.
  - Moving a heading "to end of note" keeps today's core rule: a heading goes after the last top-level section, which can make it a second H1 and bring the core back. This is unchanged behaviour, recorded here.
  - Editing, re-levelling and deleting the H1 work as for any line. If the H1 is demoted to `##` or deleted, the core returns.
- **Study, trails, due-driven route:** the note set for a session (`Graph3DStudy.decorate`) uses `isNoteRoot`. Without that change, every single-H1 note's cards would have dropped out of study.
- **Depth 0:** a note shown in part (`NoteInput.only`) has no root at all, sole H1 or not, as before. A whole-note transclusion gets an H1 root like any loaded note, and the `![[…]]` edge lands on it.

### Facts for the flatten-spread ticket

- The pivot is `branch.core`. It is a `note` node or a `line` node with `root: true`, and in both cases its ID is `noteNodeId(path)`. Use `isNoteRoot` and never `kind === "note"`.
- Under an H1 root, branch roots sit at outline depth ≥ 2 (the H1's children), even at flat depth 1. Under a core, depth 1 is still one slice rooted at the H1. So nearly every fixture note (all have a sole H1) now pivots its slices on a line-sized plate that is itself a 3D node with charge.
- `outward(core, origin)` is never degenerate under an H1 root, because the pivot is never a branch root.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/model.ts` | `soleH1`, `isNoteRoot`, `GraphNode.root`; the sole H1 is built under `noteNodeId(path)` with no core and no hierarchy edge into it |
| `src/graph3d/model.test.ts` | Root tests: one H1, two H1s, none, a line before the H1, ID stability, a second H1 arriving, partial notes. The old core test uses two H1s |
| `src/graph3d/flatten.ts` | Pivot on `isNoteRoot`; the H1 root starts the walk at depth 1; per-note ramp weight |
| `src/graph3d/flatten.test.ts` | Depth-1 tests use a cored variant (a line before the H1); new H1-pivot test |
| `src/graph3d/settle.ts` / `.test.ts` | A pinned H1 root carries its cluster's charge |
| `src/graph3d/positions.ts` | An H1 root is seeded like a core |
| `src/graph3d/liftoff.ts` / `.test.ts` | Root box skipped for an H1 root; root focus finds either root |
| `src/graph3d/overlays.ts` / `.test.ts` | Memory: an H1 root without a card shows the note's mean |
| `src/views/Graph3DScene.ts` | `noteCores` and stand-offs use `isNoteRoot` |
| `src/views/Graph3DStudy.ts` | Study's note set uses `isNoteRoot` |
| `src/views/Graph3DView.ts` | `linkLines` treats an H1 root as the note (`[[Note]]`); the drop menu offers Move under and Move to end of note |
| `e2e/fixtures/graph3d/Harbour Rules.md`, `Draft Logbook.md` (+ copies in `vault/tests/graph3d/`) | New fixtures: two H1s; a line before the H1 |

### Fixtures

- `vault/tests/graph3d/Sailing Basics.md` (existing): one H1, frontmatter tag `sailing` and property `related: [[Points of Sail]]`. Expect no file plate.
- `vault/tests/graph3d/Harbour Rules.md` (new): two H1s. Expect the file plate as root, with tag `harbour` and property `[[Knots]]` on it.
- `vault/tests/graph3d/Draft Logbook.md` (new): a line before its only H1. Expect the file plate as root.

### Not verified

I couldn't see Obsidian. The following are unit-tested but unseen: the look of an H1-sized root from far off, flights and stand-offs, the drop menu, the re-settle after a second H1 is added, and flatten with an H1 pivot. Lint, the full vitest suite (2505 tests) and the build pass.
