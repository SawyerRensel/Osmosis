---
title: Paste as a true child of the selected node
summary: Paste and Add child file content under the wrong heading; multi-item pastes aren't normalized per item
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Mind Map Permeable Embed Boundaries]]"
status: Done
priority:
date_created: 2026-08-03T18:15:06.944Z
date_modified: 2026-08-03T19:19:33.300Z
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
progress:
---

# Optimization

You are working on **Osmosis**, an Obsidian plugin (mind map + spaced repetition
over Markdown), on branch **`feature/paste-child-placement`** (cut from
`feature/permeable-embed-boundaries`). This is a **continuation** — read "State
of the tree" before touching anything, because one partial change is already
applied and uncommitted.

## What tool or process needs improvement?

Paste (`Ctrl/Cmd+V`) and **Add child** in the mind map view — specifically
`pasteNodes()` and `addChildNode()` in `src/views/MindMapView.ts`, and the pure
re-indent layer they lean on in `src/mindmap-edit.ts`.

## What's slow or frustrating about it?

**Both file content under the wrong parent, silently.** They insert at
`subtreeEnd(parent)` — the end of the parent's whole subtree. For a list item
that is genuinely "last child". For a **heading**, it is not: a heading owns only
the bytes *before its first sub-heading*, so anything appended past that reads as
content of the sub-heading instead.

Paste a bullet onto `# City Transit Plan`:

```markdown
# City Transit Plan
## Bike Network      ← everything from here down
## Bus Network          belongs to a sub-heading
## Edge Cases
- Frequency targets  ← meant as a child of "City Transit Plan";
                       markdown reads it as a child of "Edge Cases"
```

The line lands several screens from where the user was looking, under a heading
they never selected. No depth or heading level fixes this — the *offset* is
wrong, not the indentation.

**Second problem: a multi-item clipboard is re-levelled as one blob.**
`clipboardNodeType` / `clipboardNodeDepth` record only the **first** selected
node, and the whole joined clipboard text is shifted by that single delta. Copy a
heading and a bullet together and one of them lands wrong.

**Third: types don't adapt.** A copied heading pasted onto a bullet stays a
heading, breaking out of the list. The drag path already converts types via
`reindentSubtree`; paste only shifts depth via `adjustPasteDepth`. Two divergent
implementations of the same operation.

## What would "better" look like?

> The user's framing, treat as the governing rule:
> *"Promote the top-level item(s) we're pasting to be direct children of whatever
> node we've selected (excepting tables, any children of the nodes we're pasting,
> etc.)."*

Each **top-level** clipboard item is normalised **independently** against the
selected node. Descendants keep their relative structure, and atomic blocks are
never reshaped.

### The agreed rules

1. **Per-item promotion.** The clipboard stores a record per copied subtree, not
   one blob with one type/depth. Each item gets its own target context and its
   own delta.

2. **Target context — `inferChildContext(parent, child)`** (currently 1-arg;
   make it type-aware):

   | parent | child | result |
   |---|---|---|
   | bullet / ordered | bullet / ordered | `{ child.type, parent.depth + 1 }` |
   | bullet / ordered | heading | `{ parent.type, parent.depth + 1 }` — no heading can live under a list item, so it becomes one |
   | heading | heading | `{ heading, min(6, parent.depth + 1) }` — a level deeper, not a depth deeper |
   | heading | anything else | `{ ordered\|bullet, 0 }` — a fresh list at the top level |
   | multiline (table/code/blockquote) | any | `{ bullet, 0 }` — nests nothing |

3. **Insert offset — new pure `childInsertOffset(parent)`:** the start of the
   parent's first **non-embedded** heading child, else `subtreeEnd(parent)`.
   Transcluded children are skipped deliberately: an embed occupies a single
   `![[…]]` line in *this* file, so a heading inside it splits the source note's
   bytes, not these. For a list parent the two offsets coincide, so this only
   changes heading behaviour.

4. **Splice with `edit.insertAt`**, not hand-rolled `slice + "\n"`. The current
   formula assumes the offset sits at a line's end; inserting *before* a heading
   needs the newline on the other side. `insertAt` already adds separators only
   where the surrounding bytes lack them, and is tested.

5. **Re-level with `reindentSubtree`, not `adjustPasteDepth`.** It is the drag
   path's converter: it re-serialises the first line at the new type/depth
   (threading the block ID through), shifts descendants by the child-base delta,
   handles heading↔list crossings, and returns code blocks / tables /
   blockquotes **unchanged** — which is exactly the "excepting tables" the user
   asked for, already built.

6. **Accepted consequence:** with one insert offset regardless of clipboard
   composition, a pasted *heading* lands **before** the parent's existing
   sub-headings (first among heading children) rather than after them. It is
   still a true direct child. The alternative — a type-dependent offset, or
   splitting one paste across two insert points for a mixed clipboard — is worse.

### Consequences to clean up

Adopting rule 5 orphans code that **this change** made unused. Remove it, don't
leave it:

- `edit.adjustPasteDepth` (pure, ~100 lines) and the `adjustPasteDepth` wrapper
  in `MindMapView`. **Port its three tests onto `reindentSubtree`** — fences,
  standalone `^id` lines, and depth shifting are real behaviours that must keep
  their coverage, they just move to the surviving converter.
- `clipboardNodeType` / `clipboardNodeDepth` fields, replaced by the per-item
  records.

## Open question — decide with the user before building

**Does `addChildNode` adopt `childInsertOffset` too?**

`inferChildContext` is already shared between paste and Add child (commit
`6dedf21`). Rule 3 is the same bug in the same shape: today, selecting
`# City Transit Plan` → **Add child** appends the new empty bullet at the very
end of the file, under `## Edge Cases`. With the shared fix it would instead
appear directly under the heading you selected, before `## Bike Network`.

- **Recommendation: yes, fix both.** It is one defect, and fixing only paste
  re-splits two paths that were just unified.
- **Cost:** it changes long-standing Add child behaviour for headings that have
  sub-headings. Nothing else uses `childInsertOffset`, so scoping it to paste is
  a one-line change if the user prefers.

## State of the tree — read before editing

Branch `feature/paste-child-placement`, cut from
`feature/permeable-embed-boundaries` at commit **`6dedf21`** ("feat: Carry card
identity across the embed seam (phases 5-6)").

**`npm run lint` → 0/0. `npm test` → 696 passed, 30 files. `npm run build` →
clean.** Keep it that way.

### One partial change is applied and uncommitted

In `src/mindmap-edit.ts` only — it is green and self-consistent, it is the
groundwork for rule 5, and it is **not** finished work:

1. `reindentSubtree`'s `originalNode` parameter widened from `OsmosisNode` to
   `Pick<OsmosisNode, "type" | "depth" | "content" | "blockId">` (line ~385), so
   paste can pass a clipboard record instead of a live node — after a **cut**
   the original node no longer exists.
2. Its descendant branch (line ~471) now leaves **table rows** (`/^\s*\|/`) and
   **standalone `^id` lines** alone instead of tab-indenting them. Indenting a
   row breaks the table; indenting the ID line detaches it from the block it
   names. This is the invariant stated at the top of that file, which
   `reindentSubtree` was violating for descendants — it also fixes the same
   latent bug on the **drag** path.

Change 2 has **no test yet**. Add one.

### Changes in the tree that are NOT yours — never stage them

`.gitignore`, `vault/Bases/`, `vault/Planner/`, `vault/templates/` (renames in
flight), `vault/tests/flashcard/`, `vault/Callouts and Blockquotes as Single
Nodes.md`. Stage by explicit path, always.

### Gotcha: `src/mindmap-edit.ts` is treated as binary by git

It contains two deliberate NUL bytes — sentinel keys in `sameEditTarget` that
cannot collide with a real file path. `git diff` shows `Bin … bytes` and plain
`grep` finds nothing. **Use `grep -a`.** Pre-existing; do not "fix" it.

## The surface you need

**`src/mindmap-edit.ts`** (pure, unit-tested — all new logic belongs here)

| Symbol | What it does |
|---|---|
| `inferChildContext(parent)` | 1-arg today; make it `(parent, child)` per rule 2 |
| `childInsertOffset(parent)` | **does not exist yet** — rule 3 |
| `reindentSubtree(text, node, newType, newDepth)` | the converter to standardise on |
| `insertAt(text, offset, block)` | separator-aware splice, rule 4 |
| `subtreeEnd` / `nodeHostStart` / `subtreeHostEnd` | span math; `embedHostRange` folds an embed to its host line |
| `adjustPasteDepth` | to be **deleted** once paste stops calling it |
| `collectBlockIds` / `stripBlockIds` | paste-identity helpers (phase 6, keep) |

**`src/views/MindMapView.ts`**

| Symbol | Line ≈ | Note |
|---|---|---|
| `copySelectedNodes(isCut)` | 4050 | records the clipboard; add per-item records here — the live nodes are still in hand at copy time, so capture `type`, `depth`, `content`, `blockId`, and the subtree `text` |
| `pasteNodes()` | 4124 | the main edit; already routes by `containingFileOf()`, strips IDs on copy, and migrates schedules on a cross-file cut — **preserve all of that** |
| `addChildNode(parentNode)` | ~6990 | shares `inferChildContext`; the open question above |
| `clipboardItems` | — | the new field; `clipboardText` stays (system-clipboard write + the paste guard) |

`src/mindmap-edit.test.ts` has `prepareVault(host, files)` / `parseVault(...)`
driving the **real** parser + `TransclusionResolver` over an in-memory vault,
plus a `node()` factory for pure cases. Reuse them.

## Test plan

Vitest, in `src/mindmap-edit.test.ts`:

- `inferChildContext` — every row of the rule-2 table, including heading→list
  conversion and the `min(6, …)` clamp.
- `childInsertOffset` — heading with sub-headings → before the first one;
  heading with only list children → `subtreeEnd`; bullet parent → `subtreeEnd`;
  **parent whose heading child is transcluded** → `subtreeEnd`, not the embed
  line (use `parseVault` with the seam fixtures for a real tree).
- `reindentSubtree` — the three cases ported from `adjustPasteDepth`, plus the
  new table-row and `^id`-line guards.
- Multi-item promotion — a clipboard of a heading + a bullet pasted onto one
  parent, each landing at its own correct level.

## Manual testing (the user performs it — do not run Playwright)

Fixtures are in `e2e/fixtures/seam-*.md`, copied into `vault/tests/mindmap/`.
Open **seam-transit-map.md** as a mind map. All the seam notes carry
`osmosis-cards: true`; card generation is opt-in per note, and a line card
belongs to the file that physically holds the line.

1. Select `# City Transit Plan`, paste a bullet → it appears directly under that
   heading, **above** `## Bike Network`, not at the end of the file.
2. Select `## Bus Network`, paste a bullet → last child of Bus Network,
   unchanged from today.
3. Select a bullet, paste a bullet → indented one level as its child.
4. Copy a heading, paste onto a bullet → arrives as a list item at the child
   depth, not as a heading breaking the list.
5. Multi-select a heading and a bullet, copy, paste onto one node → both land at
   their own correct levels.
6. Paste a subtree containing a **table** and a fenced code block → contents
   byte-identical, table rows not indented, any `^id` line still attached.
7. Regression: cut an embedded line with review history, paste onto a host node →
   schedule still follows (phase 6 must not break).
8. Reading mode → every gesture inert.

## Conventions (override CLAUDE.md where they conflict)

- **Project/task management now lives in `vault/Planner/`**, not `notes/` or
  `prompts/`. Write new task notes there from `vault/templates/`.
- Beads (`bd`) is **NOT installed** — skip it. **Do not use TodoWrite.**
- **Do not run Playwright** (`npm run e2e`). Vitest unit tests ARE expected.
- Loop: implement → `npm run lint` (0/0) → `npm test` (all pass) → `npm run
  build` (clean) → give **step-by-step manual test instructions** → **STOP and
  wait for the user's confirmation** → only then commit.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Never commit `package-lock.json` churn. Stage by explicit path. Surgical
  edits; match surrounding style. Stay inside `/home/user/Osmosis`.
- **Neutral, non-biology examples** in fixtures and tests. The seam fixtures use
  a city-transit host embedding bicycle-infrastructure notes.

## Commands

```bash
npm run lint     # eslint . — expect 0 errors, 0 warnings
npm test         # vitest — 696 passing at handoff
npm run build    # tsc -noEmit -skipLibCheck && esbuild -> vault/.obsidian/plugins/Osmosis
```