---
osmosis-cards: true
osmosis-styles:
  theme: Catppuccin Mocha
---

# Linking Strategies

Links are the nervous system of a knowledge base. The way you link notes determines whether your vault becomes a searchable archive or a thinking tool.

[Zettelkasten Linking — Bryan Jenks](https://www.youtube.com/watch?v=7TnUNN39NBU)

## When to Link

Not every mention deserves a link. Over-linking creates noise; under-linking creates silos.

### Link When
- The target note adds context the reader needs
- You're connecting two ideas that inform each other
- You want to find this connection again later
- The link represents a meaningful relationship, not just a shared word

### Don't Link When
- The term is common and the link would be trivial (e.g., linking "the" or "project")
- You'd be linking to a note that doesn't exist and you don't plan to create
- The connection is so obvious it adds no value
- You're linking just to increase your graph density

## Hub Notes

Hub notes serve as navigational anchors in your vault.

### What Makes a Good Hub Note
- Links to 10-30 related notes on a topic
- Brief context for each link (not just a list)
- Updated as new notes are added
- Has a clear scope — not trying to cover everything

### Hub Note Patterns
- **Topic hubs**: "Machine Learning", "Stoic Philosophy", "Product Design"
- **Project hubs**: "Q1 Launch Plan", "Book Draft", "Home Renovation"
- **Temporal hubs**: "2026 Goals", "March Retrospective"
- **Question hubs**: "How do people learn?", "What makes teams effective?"

### Hub Note vs MOC
- Hub notes are simpler — mostly curated link lists with brief annotations
- MOCs include more narrative, structure, and your own synthesis
- Start with hub notes, upgrade to MOCs when the topic demands it

## Atomic Notes

The principle of one idea per note, borrowed from Zettelkasten.

### Rules for Atomic Notes
- Each note captures a single, complete idea
- The note should be understandable on its own
- Title summarizes the claim or concept
- Length: typically 100-300 words
- Links connect it to related ideas

### Benefits of Atomicity
- Notes are reusable across contexts
- Easy to link precisely (you know exactly what you're linking to)
- Forces clarity of thought
- Prevents "god notes" that try to cover everything

### When Atomicity Breaks Down
- Tutorial or how-to content that needs sequential steps
- Meeting notes that capture a single event
- Daily journals that are inherently multi-topic
- Reference material (API docs, specs) that belongs together

## Linking Patterns

### Contextual Links
- Embedded in the flow of writing
- Example: "This connects to [[spaced repetition]] because..."
- Best for: building understanding, writing-heavy vaults

### Structural Links
- Placed in dedicated sections (e.g., "Related Notes" at the bottom)
- Example: a "See also" section with curated links
- Best for: reference-heavy vaults, hub notes

### Bidirectional Awareness
- Always consider: "If someone lands on the target note, would they want to come back here?"
- If yes, add an explicit backlink or rely on Obsidian's backlinks pane
- If no, the link is still valuable as a one-way pointer

### Link Density Guidelines
- **Sparse linking** (1-2 links per note): Good for focused writing
- **Moderate linking** (3-7 links per note): Balanced for most knowledge bases
- **Dense linking** (8+ links per note): Useful for hub notes and research synthesis
- Average across vault: aim for 3-5 links per note

## Common Linking Mistakes

- **Link hoarding**: Linking everything to everything, creating noise
- **Orphan notes**: Notes with zero incoming or outgoing links
- **Dead-end notes**: Notes with incoming links but no outgoing links
- **Circular clusters**: Small groups of notes that only link to each other
- **Title-only links**: Linking to a note just because the title matches a word

---

## Flashcards

```osmosis
id: pkm-link-001
stability: 30.5
difficulty: 0.25
due: 2026-03-30T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 15
lapses: 0
state: review

What is the principle of atomic notes?
***
Each note captures a single, complete idea that is understandable on its own, typically 100-300 words, with a title that summarizes the claim or concept.
```

```osmosis
id: pkm-link-002
stability: 5.5
difficulty: 0.40
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 7
lapses: 1
state: review

What is the recommended average link density for a knowledge base vault?
***
3-5 links per note on average. Sparse linking (1-2) works for focused writing, moderate (3-7) for most knowledge bases, and dense (8+) for hub notes and research synthesis.
```

```osmosis
id: pkm-link-003
stability: 0.3
difficulty: 0.68
due: 2026-03-10T16:00:00.000Z
last-review: 2026-03-10T12:00:00.000Z
reps: 9
lapses: 2
state: relearning

What is the difference between a hub note and a Map of Content (MOC)?
***
Hub notes are simpler curated link lists with brief annotations (10-30 links). MOCs include more narrative, structure, and personal synthesis. Start with hub notes and upgrade to MOCs when the topic demands it.
```

```osmosis
id: pkm-link-004
stability: 1.0
difficulty: 0.52
due: 2026-03-10T20:00:00.000Z
last-review: 2026-03-10T12:00:00.000Z
reps: 3
lapses: 0
state: learning

What are five common linking mistakes in a knowledge base?
***
1) Link hoarding (over-linking everything), 2) Orphan notes (no links at all), 3) Dead-end notes (incoming but no outgoing links), 4) Circular clusters (small groups only linking to each other), 5) Title-only links (linking just because a word matches a note title)
```
