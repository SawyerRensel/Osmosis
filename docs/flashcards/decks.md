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

A note at `Vault/Languages/French/greetings.md` automatically belongs to the `Languages/French` deck.

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
