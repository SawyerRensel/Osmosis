---
title: 3D Graph - Transcluded notes skip the embed plate
summary: "Batch 12 (T95). A transclusion line (![[Note]]) shows as its own plate in the 3D graph; the parent should connect straight to the embedded note's H1 (or its filename)."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:

status: In-Review
batch: 12
priority:
progress:
date_created: 2026-11-18T12:00:00.000Z
date_modified: 2026-11-19T04:10:00.000Z
date_start_scheduled: 2026-11-19T03:54:59.000Z
date_start_actual: 2026-11-19T03:54:59.000Z
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

# 3D Graph - Transcluded notes skip the embed plate (T95)

## What happened?

In the 3D graph, a note that transcludes another (`![[GitHub]]`) shows the
**transclusion line itself as a plate** (Sawyer's screenshot: a plate reading
"GitHub / GitHub" with the embed's purple left rule). That plate then connects
to the embedded note's own H1 plate ("GitHub"). The reader sees the same title
twice, on two plates.

## What should have happened?

The embed line gets no plate. The edge from the embedding line's parent goes
**straight to the embedded note's H1 plate**. If the embedded note has no H1,
it goes to the plate that stands for the note, labelled with the **filename**.

This applies to embeds at depth 0 (`collectEmbedded`, `src/graph3d/transcluded.ts`)
and wherever else an embed line becomes a node. The edge kind stays `embed`, so
its style and colour hold.

## Cases to cover

- `![[Note]]` whole-note embed → parent connects to Note's H1, or to its filename plate.
- `![[Note#Heading]]` → connects to that heading's plate.
- `![[Note#^block]]` → connects to that block's plate.
- An embed **inside a list item** (the line has text plus an embed): the line keeps its plate, because it has its own content. Only a line whose whole content is the embed is skipped. Check how `model.ts` (~line 337, "an embed lifted out of a list item") treats this, and keep it.
- An embed line with children under it: re-parent its children to the parent so nothing is orphaned.
- Image/attachment embeds (`![[pic.png]]`) are out of scope. They keep their attachment plate.
- Study: if the embed line was a card (line card with a block id), say what happens to that card in the batch notes. Don't silently drop a card.

## Acceptance criteria

- [ ] Unit tests in `src/graph3d/` for each case above (the graph-building logic is pure: `model.ts`, `transcluded.ts`).
- [ ] The screenshot case: one "GitHub" plate, joined to the embedding parent by an embed edge.
- [ ] The 2D mind map is unchanged. This is 3D-only.

## Test plan

Manual: open a note that has a line containing only `![[Other note]]`, and open
the 3D graph on it. There's no plate for the embed line, and the parent's edge
runs to Other note's H1. Repeat with a note that has no H1 (→ filename) and with
a `#Heading` embed.

## Context budget (~20k tokens)

| Read | Range | ~Tokens |
|---|---|---|
| `src/graph3d/transcluded.ts` | whole | 1.2k |
| `src/graph3d/transcluded.test.ts` | whole | ~1.5k |
| `src/graph3d/model.ts` | whole (377 lines) | ~4k |
| `src/graph3d/model.test.ts` | skim the embed cases (`grep -n embed`) | ~2k |
| `src/views/Graph3DView.ts` | `grep -n collectEmbedded` call site ± 40 lines only | ~1k |

Don't read `Graph3DScene.ts` (~42k) unless the plate is made there. Grep first.

## Batch implementation notes (awaiting manual test)

Code commit: `694ea83` on `batch/12-study-tab`.

**Cause.** `buildGraph` (`src/graph3d/model.ts`) turned every parse-tree node into a line plate, the parser's `transclusion` node included. That node's `content` is the link target ("GitHub"), so the plate repeated the embedded note's title, and the link cache's embed edge left from it to the note's real H1 plate.

**Fix.** In pass 1's walk, a `transclusion` node gets no plate. It is still pushed into the note's `lines` index, under its graph parent's ID, so pass 2's `lineAt`/`sourceAt` lands the cached `![[…]]` on the parent line and the `embed` edge runs parent → target. The target is unchanged: the embedded note's root (its sole H1 under `note:<path>`, or the file-name core when there is no sole H1), or the heading or block line a `#Heading` / `#^block` names. The edge kind stays `embed`. Anything under the embed node is walked with the parent's ID, so nothing is orphaned. `transcluded.ts` needed no change: `collectEmbedded` scopes by parse nodes, not plates.

**Decisions**
- **A list item with text before a trailing embed (`- Stowage plan ![[Galley Stores]]`) keeps its plate, and the lifted embed child loses its plate.** The parser splits that line into the item plus a `transclusion` child whose range sits inside the item's line (the `lineAt` comment around line 337). Before this change, that child was a second "Galley Stores" plate under the item: the same duplicated title. Now the item's plate carries the embed edge itself. The old test "places a trailing list-item embed on the lifted embed line, not its parent" was replaced by one asserting the opposite. **Sawyer: this is the call to check.** If the ticket's "keep it" meant keeping the lifted plate, restrict the skip to nodes that are not inside their parent's line.
- **Cards:** an embed line is never a card. `line-cards.ts` returns null / false for `transclusion` nodes and `generate-ids.ts` never stamps one, so no card is dropped. A user-typed block ID on an embed line (`![[X]] ^id`) is mapped to the parent line, so a `[[#^id]]` link lands on the line above.
- **The one exception: a partial note's root that is itself an embed line** (`![[Host#^id]]` where `^id` sits on an embed line) keeps its plate. Nothing is above it to carry the edge, and dropping it would leave nothing to show.
- **The parser never gives an embed node children.** Lines indented under `- ![[X]]` hang from the enclosing item or heading. The re-parent path is defensive and is tested with a hand-built tree.
- **Image and attachment embeds are untouched.** The parser makes `![[pic.png]]` a paragraph, not a `transclusion` (`isMediaEmbed`), so it keeps its plate and its attachment edge.
- **An embed of a note outside the loaded set** (depth ≥ 1, an embedded note past the horizon) now shows nothing, where it used to show a dangling title plate. This matches how a plain link to an unloaded note already adds nothing. An unresolved embed still gets its ghost, joined from the parent line.

| File | Change |
|---|---|
| `src/graph3d/model.ts` | Pass-1 walk skips `transclusion` nodes. They index under the parent's ID and their children re-parent. The module doc is updated. |
| `src/graph3d/model.test.ts` | Two old embed tests replaced. New cases: sole-H1 target, no-H1 file-name target, heading and block embeds, text + embed list item, re-parented child, block ID on an embed line, partial-root exception. |
| `src/graph3d/transcluded.test.ts` | Depth-0 screenshot case: one title plate, with an embed edge from the parent root. |
| `e2e/fixtures/graph3d/Embed Plates.md`, `Galley Stores.md` (+ `vault/tests/graph3d/` copies) | New fixture. It has no cards, so there are no dates to back-date. |

**Fixture:** `vault/tests/graph3d/Embed Plates.md`, which embeds `Galley Stores.md` (no H1), `Weather.md` (sole H1) and `Knots.md` (`#Bends`, `#^bowline`). The existing `vault/tests/graph3d/Depth Zero.md` covers the same cases under headings.

**Not verified**
- Nothing was seen in Obsidian. No Playwright was run, per the batch rules.
- **Flatten slider:** `flatten.ts` lays a note out with the 2D `computeLayout` over the parse tree. An embed node, which now has no plate and no measured size, may still reserve a row there, leaving a small gap in a flattened slice where the embed line was. This was read in the code and not measured.
- Graph3D editing can no longer select an embed line, because there is no plate to select. It is edited from the note or the 2D map.
- The 2D mind map is untouched. Only `src/graph3d/model.ts` changed.

