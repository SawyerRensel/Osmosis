# Card Authoring Friction — Example Scenario

This document illustrates the UX question: **how does a user know what has become a card, and how do they manage cards without doing a full review session?**

---

## The Scenario

You write this note, `Python Basics.md`:

```markdown
---
osmosis: true
osmosis-deck: programming/python
---

# Python Basics

## Variables

Python variables are dynamically typed. You don't need to declare a type — the interpreter infers it at runtime.

x = 10       # int
x = "hello"  # now a string — no error

## Functions

A function is defined with the `def` keyword.

```python
def greet(name):
    return f"Hello, {name}!"  # osmosis-hide
```

## Duck Typing

Python uses ==duck typing== for polymorphism. If it walks like a duck and quacks like a duck, it's a duck.

## List Comprehensions

| Syntax | Meaning |
|---|---|
| `[x for x in list]` | Copy the list |
| `[x for x in list if condition]` | Filter the list |
| `[f(x) for x in list]` | Transform the list |
```

---

## What Osmosis Generates From This Note

Osmosis silently generates **5 cards** from this note:

| # | Card Type | Front | Back |
|---|---|---|---|
| 1 | Heading-paragraph | "Variables" | "Python variables are dynamically typed. You don't need to declare a type — the interpreter infers it at runtime." |
| 2 | Heading-paragraph | "Functions" | Full paragraph + code block |
| 3 | Code cloze | Code block with `return f"Hello, {name}!"` hidden (░░░░░░) | Full code block revealed |
| 4 | Inline cloze | "Python uses ░░░░░░ for polymorphism. If it walks like a duck..." | "Python uses **duck typing** for polymorphism..." |
| 5 | Table (×3 rows) | Each row: Syntax column | Meaning column |

---

## The Problem Without Gutter Indicators

Without any visual feedback, the user has **no idea** that:

- The `## Variables` heading became Card #1
- The `## Functions` heading became Card #2 (and the code block inside it also generated Card #3 separately)
- The `==duck typing==` highlight became Card #4
- Each row of the table became its own card (#5a, #5b, #5c)
- `## Duck Typing` did NOT become a heading card even though it has `osmosis: true` — because the paragraph under it was already consumed by the cloze card from the highlight

The user might:
- Accidentally duplicate effort (manually add `Q::A` for something already auto-generated)
- Be surprised during review ("I didn't know that was a card!")
- Want to exclude the `## Variables` heading from cards because it's too basic — but not know how
- Want to exclude the `## Functions` heading card but keep the code cloze inside it

---

## Proposed Solution: Gutter Indicators + "Cards in This Note" Panel

### 1. Gutter Indicators (inline in editor)

Small icons appear in the editor gutter (the left margin, like line numbers) next to any line that has generated a card:

```
   1 │ ---
   2 │ osmosis: true
   3 │ ---
   4 │
🃏 5 │ ## Variables
   6 │
   7 │ Python variables are dynamically typed...
   8 │
🃏 9 │ ## Functions
  10 │
  11 │ A function is defined with the `def` keyword.
  12 │
  13 │ ```python
🃏14 │ def greet(name):
  15 │     return f"Hello, {name}!"  # osmosis-hide
  16 │ ```
  17 │
🃏18 │ ## Duck Typing
  19 │
  20 │ Python uses ==duck typing== for ...
  21 │
🃏22 │ | Syntax | Meaning |
  23 │ |---|---|
  24 │ | `[x for x in list]` | Copy the list |
  25 │ | `[x for x in list if condition]` | Filter the list |
  26 │ | `[f(x) for x in list]` | Transform the list |
```

Hovering the gutter icon shows a tooltip: **"This line generated 1 card. Click to preview."**

Clicking the icon opens a small inline preview of the card (front and back), with options:
- **Exclude this card** — adds `<!-- osmosis-exclude -->` above the line, card is archived (soft-deleted)
- **Edit card** — opens the card in a modal for manual tweaks (e.g. override the auto-generated front/back)
- **Preview card** — see exactly what the front and back look like during review

---

### 2. "Cards in This Note" Panel

A panel (accessible from the note's "More options" ⋯ menu → "View cards for this note", or a button in the Osmosis sidebar) that lists every card generated from the current note:

```
Cards in: Python Basics.md          [5 cards]  [Study now ▶]

  ┌─────────────────────────────────────────────────────────┐
  │ 🃏 Heading  │ Variables                    Due: today   │
  │             │ Front: "Variables"                        │
  │             │ Back: "Python variables are dynami..."    │
  │             │                    [Preview] [Exclude]    │
  ├─────────────────────────────────────────────────────────┤
  │ 🃏 Heading  │ Functions                    Due: today   │
  │             │ Front: "Functions"                        │
  │             │ Back: "A function is defined with..."     │
  │             │                    [Preview] [Exclude]    │
  ├─────────────────────────────────────────────────────────┤
  │ 🔧 Code     │ greet() return value         Due: 3 days  │
  │             │ Front: code with hidden line              │
  │             │ Back: full code revealed                  │
  │             │                    [Preview] [Exclude]    │
  ├─────────────────────────────────────────────────────────┤
  │ ✂️ Cloze    │ duck typing                  Due: today   │
  │             │ Front: "Python uses ░░░░░░ for..."        │
  │             │ Back: "Python uses duck typing for..."    │
  │             │                    [Preview] [Exclude]    │
  ├─────────────────────────────────────────────────────────┤
  │ 📊 Table    │ List comprehension syntax    Due: 5 days  │
  │             │ 3 cards (one per row)                     │
  │             │                    [Preview] [Exclude]    │
  └─────────────────────────────────────────────────────────┘
```

---

### 3. Excluding a Card

To exclude a specific card without disabling `osmosis: true` on the whole note, the user can:

**Option A: From the gutter icon or panel** — click "Exclude", Osmosis inserts `<!-- osmosis-exclude -->` above the relevant line:

```markdown
<!-- osmosis-exclude -->
## Variables

Python variables are dynamically typed...
```

**Option B: Manual** — the user types `<!-- osmosis-exclude -->` themselves. Same effect.

The card is soft-deleted (SR history preserved, card archived). If the `<!-- osmosis-exclude -->` comment is removed later, the card is re-activated.

---

## Summary

The gutter indicators + "Cards in This Note" panel solve a transparency problem: the user always knows what Osmosis has turned into cards, can preview cards before ever reviewing them, and can surgically exclude individual cards without disrupting the rest of the note.

This is something neither Decks nor Obsidian-Spaced-Repetition do well — they both treat card generation as a black box.
