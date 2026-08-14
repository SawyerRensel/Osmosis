---
osmosis-cards: true
osmosis-deck: Testing/Rapid Mode
---

# Rapid flashcard mode

Scratch note for typing cards by hand. Turn the mode on from this note's ⋯ menu
(it sits under "Source mode"), then type into the sections below.

The grammar is blank lines and nothing else: **one** blank line ends the front
and starts the back, **two** blank lines commit the card. So the third Enter in
a row is the only keystroke the plugin takes for itself. Inside a fenced code
block none of that applies — a blank line there is code.

The mode can also be toggled from the command palette: "Osmosis: Toggle rapid
flashcard mode".

## 1. Type a card here

Type these four lines and the three Enters, and watch them fold into a fence:

- `Capital of Portugal` ⏎ ⏎
- `Lisbon` ⏎ ⏎ ⏎

## 2. Multi-line front and back

Same again, but with two lines on each side and no blank line inside either:

- `HTTP 429` ⏎ `What does the server want?` ⏎ ⏎
- `Too Many Requests` ⏎ `Back off and retry later` ⏎ ⏎ ⏎

## 3. Type directly under this line with no blank line between
The line above has no blank line after it, so it is part of the same block —
a front typed here absorbs it. Expected, and worth seeing once.

## 4. Right below an existing fence

```osmosis
Existing card
***
Its answer
```
A front typed on the line directly under that closing fence must not swallow
the fence. The new card should get a blank line inserted above it.

## 5. A code block as the back

Type the question, one blank line, then the fenced block, then three Enters.
The card fence has to come out **four** backticks long so it can hold the three
inside it:

- `How to print "meow" in Python?` ⏎ ⏎
- ` ```python ` ⏎ `print("meow")` ⏎ ` ``` ` ⏎ ⏎ ⏎

## 6. A code block as the front

Same block, other side — the walk-up has to take the whole fence with it rather
than stopping at its closing line:

- ` ```python ` ⏎ `print("meow")` ⏎ ` ``` ` ⏎ ⏎
- `meow` ⏎ ⏎ ⏎

## 7. A code block with a blank line in it

The blank line inside the fence is code, not a card boundary, so this is still
one card and not two:

- `Two statements` ⏎ ⏎
- ` ```python ` ⏎ `a = 1` ⏎ ⏎ `b = 2` ⏎ ` ``` ` ⏎ ⏎ ⏎

## 8. A code block inside a code block

Four backticks in, five backticks out:

- `How do you show a fence in Markdown?` ⏎ ⏎
- ` ````markdown ` ⏎ ` ```js ` ⏎ `const a = 1;` ⏎ ` ``` ` ⏎ ` ```` ` ⏎ ⏎ ⏎

## 9. Cases that must stay ordinary Enters

- Three Enters with only one block above them (no front) — nothing captured.
- Three Enters inside an unclosed code fence — nothing captured.
