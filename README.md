# Osmosis

**Absorb information faster and longer with unified notes, flashcards, and mind mapping.**

Osmosis turns your markdown notes into interactive mind maps and study material. Write once, study in multiple modes. No duplicate content, no external tools, no proprietary formats.

---

## What Osmosis Does

Osmosis gives you three ways to interact with the same markdown content:

- **Mind Map View** — See your notes as a fully interactive, editable mind map. Headings become branches, lists become nodes. Edit the map, and the markdown updates. Edit the markdown, and the map updates.
- **Flashcards** — Create flashcards directly in your notes using a simple code fence syntax. Basic Q&A, bidirectional, type-in, cloze deletions, and code cloze cards are all supported.
- **Spaced Repetition** — Study your cards with the FSRS algorithm (the same one powering modern Anki). Three study modes: sequential (classic card review), contextual (study inline in your notes), and spatial (study on the mind map itself).

Everything lives in your markdown files. Card scheduling data is stored in the fences themselves — no external databases, no sync issues.

## Quick Start

### Open a Mind Map

1. Open any markdown file
2. Click the brain icon in the editor header (or use the command palette: **Open mind map view**)
3. Your headings and lists appear as an interactive mind map

### Create a Flashcard

Add an `osmosis` code fence anywhere in your note:

````markdown
```osmosis
What is the powerhouse of the cell?
***
The mitochondria
```
````

### Enable Cards for a Note

Add `osmosis-cards: true` to your note's frontmatter:

```yaml
---
osmosis-cards: true
---
```

Or configure tag/folder-based inclusion in Settings > Osmosis.

### Start Studying

Click the graduation cap icon in the sidebar to open the Dashboard. It shows your decks and due card counts. Click any deck to start a study session.

## Documentation

Full documentation is available at the [Osmosis docs site](https://osmosis.md/):

- [**Getting Started**](https://osmosis.md/getting-started/) — Installation and quick start
- [**Mind Mapping**](https://osmosis.md/mind-mapping/) — Layout, editing, keyboard shortcuts, styling, themes
- [**Flashcards**](https://osmosis.md/flashcards/) — Card syntax for every card type, with examples
- [**Studying**](https://osmosis.md/studying/) — Sequential, contextual, and spatial study modes

## Installation

### From Community Plugins (coming soon)

1. Open **Settings > Community Plugins > Browse**
2. Search for "Osmosis"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/SawyerRenworthy/Osmosis/releases)
2. Extract to your vault's `.obsidian/plugins/osmosis/` directory
3. Enable "Osmosis" in **Settings > Community Plugins**

## License

[GNU GPL v3](LICENSE)
