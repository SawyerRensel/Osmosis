---
icon: lucide/list-tree
---

# Line Cards

Line cards turn a whole note into flashcards — **every line becomes its own scheduled card**, with no fences and no duplicate authoring. Osmosis tags eligible lines with native Obsidian block IDs, and each tagged line is scheduled by FSRS like any other card: the front is the line's place in the note's structure, the back is the line itself.

## Generating Line Cards

Run **Generate flashcards from note** from the command palette, or right-click a note and choose **Generate flashcards**.

Osmosis scans the note and shows a confirmation modal listing the lines that will be tagged. Nothing is written until you confirm; the change is a single edit, so one undo reverts it.

- **Eligible lines** are the same elements that become mind map nodes: headings, bullet items, numbered items, and paragraphs.
- **Skipped**: frontmatter, code fences (including `osmosis` fences — those are already cards), blank lines, and anything under `<!-- osmosis-exclude -->`.
- If the note isn't opted in yet, the modal notes that `osmosis-cards: true` will be added to its frontmatter.
- Re-running the command is **incremental** — it only tags new, untagged lines. Existing IDs (and their scheduling history) are untouched.

## Block IDs

Each tagged line ends with a block ID of the form `^os-` plus six characters:

```markdown
- Pour water at 96 °C in slow circles ^os-a1b2c3
```

Block IDs are native Obsidian syntax:

- **Invisible in reading view** — Obsidian hides them natively (they appear dimmed in live preview and source mode).
- **Linkable** — `[[note#^os-a1b2c3]]` deep-links straight to the line.
- **Stable** — the ID travels with the line through edits, reorders, and renames, so scheduling history survives.

If a line already carries a block ID you added yourself, Osmosis reuses it instead of adding a second one.

### Multi-Line Blocks

Code blocks and tables are single units, so they get a single identity:

- **`osmosis` fences** use their existing `id:` metadata key (added if missing).
- **Generic code blocks and tables** get a standalone `^os-xxxxxx` line immediately after the block — Obsidian's native way to block-reference multi-line content.

## Card Anatomy

A line card asks: *given where this line sits in the note, what does it say?*

- **Front** — the ancestor breadcrumb (`Coffee Brewing › Pour Over › ?`), plus up to N immediately preceding sibling lines for context in sequential study (**Settings > Osmosis > Line card context lines**, default 2).
- **Back** — the line itself, rendered as markdown.
- **Identity** — `note path#^blockId`, stable across edits and reorders.

## Scheduling Data

Line card schedules live in the note's frontmatter under `osmosis-schedule`, keyed by block ID:

```yaml
---
osmosis-cards: true
osmosis-schedule:
  os-a1b2c3:
    due: 2026-07-22T10:30:00
    stability: 4.2
    difficulty: 5.1
    lastReview: 2026-07-15T09:12:00
    reps: 3
    lapses: 0
    state: review
    learningSteps: 0
---
```

The key is written lazily — only after the first review, not when IDs are generated. Writes are debounced and coalesced, so rating a run of cards produces one file write, flushed at session end. See [Spaced Repetition](../studying/spaced-repetition.md#data-storage) for details.

## Studying Line Cards

Line cards work in all three [study modes](../studying/study-modes.md):

- **Sequential** — drawn from decks like any other card; the front shows the breadcrumb and context lines.
- **Contextual** — *Peek* and *Study* modes in reading view hide and reveal lines in place.
- **Spatial** — due lines hide behind `?` placeholders on the mind map; reveal and rate without losing the map's structure.

## Decks & Opt-Out

Line cards count toward deck totals and appear in sequential study by default. Deck assignment follows the note ([`osmosis-deck` frontmatter or folder path](decks.md)).

To keep them out of decks while still studiable in place (peek/study/spatial):

- **Per note**: add `osmosis-line-cards: false` to the frontmatter.
- **Globally**: turn off **Settings > Osmosis > Include line cards in decks**.

## Deleting Lines & Orphans

Deleting a line (or just its block ID) **soft-deletes** the card: the schedule entry stays in `osmosis-schedule`, and if the ID reappears the card re-links with its history intact.

## Bonus: Stable Styling Anchors

Block IDs double as mind map [style selectors](../mind-mapping/styling.md#per-node-style-selectors). A node tagged `^os-a1b2c3` can be styled with that key in `osmosis-styles` — unlike tree-path selectors, it survives renames and reorders.
