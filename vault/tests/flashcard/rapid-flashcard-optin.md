# Opt-in on card insert

This note deliberately starts with **no frontmatter at all**. Until it has
`osmosis-cards: true`, nothing in it generates a card — fences included — so
inserting a card here has to add the opt-in itself.

## 1. Rapid mode

With the mode on, type a card below. When the fence appears, frontmatter should
appear at the top of the note too:

```
---
osmosis-cards: true
---
```

Then check the card actually reached the deck, which is the whole point of the
opt-in.

- `Largest moon of Saturn` ⏎ ⏎
- `Titan` ⏎ ⏎ ⏎

## 2. Insert card command

Undo the frontmatter (or delete it by hand), then run
"Osmosis: Insert basic card" from the command palette here. Same expectation:
the fence appears, `osmosis-cards: true` is added, and `Front content` is still
selected so you can type straight over it.

## 3. Already opted in

Once the note has the property, inserting more cards must not touch the
frontmatter again — no duplicate keys, no churn.
