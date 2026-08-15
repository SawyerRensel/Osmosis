---
icon: lucide/layers
---

# Flashcards

Osmosis flashcards live directly in your markdown files — as `osmosis` code fences for authored cards, as [line cards](line-cards.md) generated from the note's own lines, or as [masks over an image](image-occlusion.md). No external database, no sync issues — your cards travel with your notes.

![osmosis_sequential_study_flashcard_answer_frontback](../assets/media/osmosis_sequential_study_flashcard_answer_frontback.png)

## Enabling Cards

A note must opt in to card generation. Three ways:

### Frontmatter

```yaml
---
osmosis-cards: true
---
```

### Folder Inclusion

In **Settings > Osmosis > Include folders**, add folder paths. All notes in those folders will generate cards automatically.

### Tag Inclusion

In **Settings > Osmosis > Include tags**, add tags. All notes with those tags will generate cards automatically.

### Opting Back Out

**Exclude folders** and **Exclude tags** in the same settings screen block card generation outright — a note in an excluded folder or carrying an excluded tag generates no cards even if it opted in through any of the three ways above. See [Decks](decks.md) for details.

!!! tip "Opting in usually happens for you"
    The card-insertion commands, [Rapid Flashcard Mode](rapid-capture.md), the
    [occlusion editor](image-occlusion.md), and *Generate flashcards from note*
    all add `osmosis-cards: true` themselves. You only need to write it by hand
    if you're typing a fence out from scratch in a brand-new note.

## Ways to Make a Card

| Way in | Produces |
|--------|----------|
| An `osmosis` fence you write, or the **Insert card** commands | A [fence card](card-types.md) — basic, bidirectional, type-in, cloze, or code cloze |
| [Rapid Flashcard Mode](rapid-capture.md) | Basic fence cards, from plain typing |
| **Generate flashcards from note** | [Line cards](line-cards.md) — every line of a note, scheduled |
| Right-click an image > **Create image occlusion** | [Occlusion cards](image-occlusion.md) — one per mask group |

## Your First Card

Add an `osmosis` code fence to any opted-in note:

````markdown
```osmosis
What is the capital of France?
***
Paris
```
````

The `***` separator divides the front (question) from the back (answer).

## Metadata

Add optional metadata at the top of the fence, before a blank line:

````markdown
```osmosis
id: french-capital
deck: geography/europe
hint: Western Europe

What is the capital of France?
***
Paris
```
````

| Field | Description | Default |
|-------|-------------|---------|
| `id` | Stable card identifier | Auto-generated |
| `bidi` | Generate a reverse card too | `false` |
| `type-in` | Require typed answer | `false` |
| `deck` | Override deck assignment | From folder/frontmatter |
| `hint` | Shown on the front as a hint | — |
| `exclude` | Skip this fence for card generation | `false` |

## Scheduling Data

After you review a card, Osmosis writes scheduling fields (`due`, `stability`,
`difficulty`, `reps`, `lapses`, `state`, `last-review`) back into the fence
metadata. A fence that produces several cards — bidirectional, cloze, occlusion
— gives each one its own nested block (`r:`, `c1:`, `c2:`). [Line
cards](line-cards.md) store their schedules in the note's `osmosis-schedule`
frontmatter instead.

All of it is managed by FSRS; don't edit it by hand. See [Data
Storage](../reference/data-storage.md) for the full format.

## Guides

<div class="grid cards" markdown>

-   [:octicons-note-24: __Card Types__](card-types.md)

    Basic, bidirectional, type-in, cloze, and code cloze cards with examples

-   [:octicons-image-24: __Image Occlusion__](image-occlusion.md)

    Cover parts of a diagram and recall what's underneath

-   [:octicons-list-unordered-24: __Line Cards__](line-cards.md)

    Turn every line of a note into its own flashcard — no extra authoring

-   [:octicons-zap-24: __Rapid Capture__](rapid-capture.md)

    Type cards as fast as you can think of them, especially on mobile

-   [:octicons-stack-24: __Decks__](decks.md)

    Organizing cards into decks by folder, frontmatter, or per-card override

-   [:octicons-search-24: __Card Browser__](../studying/card-browser.md)

    Find any card in the vault — then suspend, reset, re-deck, or delete it

</div>
