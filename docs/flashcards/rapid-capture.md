---
icon: lucide/zap
---

# Rapid Capture

**Rapid Flashcard Mode** turns plain typing into flashcards. Blank lines are the
only syntax: one blank line ends the front, two blank lines commit the card. No
command per card, no placeholder text to overtype, no cursor wrangling.

It exists for capture on a phone, where making a card the ordinary way costs a
command palette, a scroll, and two careful text selections.

## Turning It On

| Where | How |
|-------|-----|
| Note menu | The ⋯ menu in a note's header — **Rapid flashcard mode**, near *Source mode* |
| Command palette | **Toggle rapid flashcard mode** (bindable to a hotkey) |

A checkmark in the menu shows the state. **Nothing turns it off but you** — not
++escape++, not switching notes, not losing focus — and it's always off again
after a restart.

## The Grammar

Type the front. Leave one blank line. Type the back. Press ++enter++ until you
have two blank lines:

```text
HTTP 429                      ← front, line 1
What does the server want?    ← front, line 2

Too Many Requests             ← back, line 1
Back off and retry later      ← back, line 2

                              ← the third Enter commits
```

The buffer becomes a finished card, with the cursor left on a fresh line ready
for the next front:

````markdown
```osmosis
HTTP 429
What does the server want?
***
Too Many Requests
Back off and retry later
```
````

Both sides can be as many lines as you like — that's what the single blank line
buys. Text is captured **literally**, markers and all, so a front or a back can
itself be a list.

Osmosis adds `osmosis-cards: true` to the note's frontmatter the first time you
commit a card there, so a card typed into a brand-new note actually becomes a
card.

## Code Blocks

Either side of a card can be a fenced code block. Blank lines *inside* a fence
are code, not card boundaries, and the `osmosis` fence Osmosis writes is always
one backtick longer than the longest run it contains:

`````markdown
````osmosis
What does this print?
***
```python
print(" ".join(["a", "b"]))
```
````
`````

## Things to Know

- **Two blank lines always make a card while the mode is on.** Trailing off a
  prose paragraph with a couple of ++enter++ presses will fire one. The menu
  checkmark is the reminder; toggle the mode off when you go back to writing.
- **Prose directly above the front is absorbed into it.** Two non-blank lines
  with nothing between them are one block by this grammar. Leave a blank line
  before you start typing a card under an existing paragraph.
- **A plain code block directly above the front is absorbed too**, because that
  is exactly what lets a code block *be* a card side. Leave a blank line after
  one you don't want captured.
- **An `osmosis` fence is never swallowed.** A card typed directly beneath a
  card written moments earlier stays its own card.
- **A back with no front above it does nothing** — the ++enter++ behaves
  normally rather than writing half a card.
- **Basic cards only.** For `bidi:` and `type-in:`, use the
  [insert-card commands](card-types.md#inserting-cards-via-command-palette).

## The Alternatives

| Way in | Best for |
|--------|----------|
| **Rapid Flashcard Mode** | Typing a run of cards, especially on mobile |
| [Insert card commands](card-types.md#inserting-cards-via-command-palette) | One card of a specific type |
| [Line cards](line-cards.md) | Turning notes you already wrote into cards |
| [Image occlusion](image-occlusion.md) | Anything visual |
