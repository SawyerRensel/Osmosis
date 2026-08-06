---
icon: lucide/folder-tree
---

# Decks

Cards are organized into decks for focused study sessions.

## Deck Assignment

Deck assignment follows this priority (highest to lowest):

1. **`deck:` in fence metadata** — Per-card override
2. **`osmosis-deck:` in frontmatter** — Per-note override
3. **Folder path** — The note's folder becomes the deck name

### Per-Card

````markdown
```osmosis
deck: languages/french

Bonjour
***
Hello
```
````

### Per-Note

```yaml
---
osmosis-cards: true
osmosis-deck: languages/french
---
```

### By Folder

A note at `Vault/Languages/French/greetings.md` automatically belongs to the `Languages/French` deck — the **full** folder path, not just the parent folder.

On the Dashboard these nest and indent to match your vault's folder structure. Intermediate folders that hold no cards of their own are pruned away, so you only see levels that mean something. Decks you assign explicitly (via `deck:` or `osmosis-deck:`) always keep their full slash-separated hierarchy, pruning or not.

### Line Cards

[Line cards](line-cards.md) follow the note's deck (`osmosis-deck` frontmatter or folder path). They count toward deck totals by default; exclude them with `osmosis-line-cards: false` in the note's frontmatter, or globally via **Settings > Osmosis > Include line cards in decks**. Excluded line cards stay studiable in place (contextual and spatial modes) — they just don't appear in decks or sequential study.

## Hierarchical Decks

Decks are hierarchical, separated by `/`. For example:

```
languages/
  languages/french
  languages/spanish
  languages/japanese
```

The Dashboard shows this as a collapsible tree. You can study:

- A **single deck** — Just the cards directly in that deck
- A **parent deck** — The deck and all its sub-decks
- **All decks** — Every card across the vault

## Automatic Inclusion

Instead of adding `osmosis-cards: true` to every note, you can auto-include notes by folder or tag in **Settings > Osmosis**:

- **Include folders** — Any note in these folders generates cards
- **Include tags** — Any note with these tags generates cards

This pairs well with folder-based deck assignment — add a folder to the include list, and every note in it automatically generates cards organized into the right deck.

## Automatic Exclusion

The same settings screen has the opposite lists, useful when a vault contains another vault you'd rather keep out of your decks:

- **Exclude folders** — No note in these folders generates cards
- **Exclude tags** — No note with these tags generates cards

Exclusion wins over every opt-in: a note in an excluded folder generates no cards even with `osmosis-cards: true` in its frontmatter or a matching include folder or tag. Tags match hierarchically, so excluding `archive` also excludes `archive/2024`.
