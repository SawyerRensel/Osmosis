---
icon: lucide/settings
---

# Settings

Everything under **Settings > Osmosis**. Osmosis uses Obsidian's declarative
settings API, so every one of these is findable from Obsidian's own settings
search.

## Mind Map

| Setting | Default | What it does |
|---------|---------|--------------|
| **Branch line style** | Curved | Default geometry of the lines between nodes — curved, straight, angular, or rounded elbow. Per-map [styling](../mind-mapping/styling.md) overrides it |
| **Max node width** | 230 px | Default width at which node text wraps. A map's own **Max width** overrides it |
| **Highlight transcluded branches** | Off | Visually distinguish nodes embedded from another file |
| **Expand transclusions** | On | Load embedded notes expanded when a map opens. Off starts them collapsed and loads on first expand |
| **Default mind map mode** | Editing | Which mode new maps open in — Editing, Reading, or *Reading on mobile only*. See [reading mode](../mind-mapping/index.md#reading-mode) |
| **Cursor sync** | On | Clicking a node scrolls the editor to its line, and vice versa |

### Undo history

| Setting | Default | What it does |
|---------|---------|--------------|
| **Undo steps** | 50 | Maximum [map undo](../mind-mapping/editing.md#undo-redo) history kept per mind map |
| **Undo memory cap (MB)** | 20 | Ceiling on the memory that history may use. Whichever limit is hit first drops the oldest edits |

## Spaced Repetition

| Setting | Default | What it does |
|---------|---------|--------------|
| **Daily new card limit** | 20 | Maximum new cards introduced per day (0 = unlimited) |
| **Daily review card limit** | 200 | Maximum reviews per day (0 = unlimited) |
| **Learning steps** | `1m, 10m` | Intra-session [steps](../studying/spaced-repetition.md#learning-steps) for new cards |
| **Relearning steps** | `10m` | Steps for cards you rated *Again* |
| **Include line cards in decks** | On | Count [line cards](../flashcards/line-cards.md) in deck totals and sequential study. Off keeps them studiable in place only. Per-note override: `osmosis-line-cards: false` |

## Review History

| Setting | Default | What it does |
|---------|---------|--------------|
| **Review log folder** | `Osmosis/Reviews` | Where the [review log](data-storage.md#review-history) is written. Changing it moves the existing files |
| **Device name** | Auto-detected | Labels this device's log files so no file ever has two writers. Leave empty to detect |

!!! tip "Keep the log out of search results"
    Add the review log folder to **Settings > Files & links > Excluded files**.
    The files are generated Markdown, so Obsidian indexes them like any note
    unless you say otherwise.

## Study Mode

| Setting | Default | What it does |
|---------|---------|--------------|
| **Show deck breadcrumb in study modal** | Off | Show which deck the card on screen belongs to |
| **Line card context lines** | 2 | How many preceding sibling lines appear as context on a line card's front in sequential study (0 = breadcrumb only) |

## Note Inclusion

Four lists decide which notes generate cards at all. See
[Decks](../flashcards/decks.md#automatic-inclusion).

| Setting | What it does |
|---------|--------------|
| **Include folders** | Notes in these folders generate cards without `osmosis-cards: true` |
| **Include tags** | Notes carrying these tags generate cards without `osmosis-cards: true` |
| **Exclude folders** | Notes in these folders never generate cards |
| **Exclude tags** | Notes with these tags never generate cards |

Folder and tag fields autocomplete against your vault. Tags match
hierarchically, so `archive` also covers `archive/2024`.

!!! warning "Exclusion always wins"
    A note in an excluded folder generates nothing, even with
    `osmosis-cards: true` in its frontmatter or a matching include rule.

## Per-Note and Per-Map Settings

Some settings aren't global at all — they live in the note:

| Where | Key | Controls |
|-------|-----|----------|
| Frontmatter | `osmosis-cards` | Whether this note generates cards |
| Frontmatter | `osmosis-deck` | This note's [deck](../flashcards/decks.md) |
| Frontmatter | `osmosis-line-cards` | Whether this note's line cards count in decks |
| Frontmatter | `osmosis-styles` | This map's [layout, theme, and per-node styles](../mind-mapping/styling.md#per-map-settings) |
| Fence metadata | `deck`, `hint`, `bidi`, `type-in`, `exclude` | One [card](../flashcards/index.md#metadata) |
| Properties sidebar | — | Everything in `osmosis-styles`, with a UI |
