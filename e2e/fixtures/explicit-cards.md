---
osmosis: true
osmosis-deck: test-deck
---

# Explicit Card Test Note

## Basic Q&A Card

```osmosis
What is the capital of France?
***
Paris
```

## Card with id: metadata

```osmosis
id: test1234
deck: geography

What is the capital of Japan?
***
Tokyo
```

## Bidirectional Card

```osmosis
id: bidi5678
bidi: true

Bonjour
***
Hello
```

## Cloze Card

```osmosis
id: cloze999

==Bonjour== means ==hello== in ==French==
```

## Bold Cloze Card

```osmosis
id: boldcloze

**Paris** is the capital of **France**
```

## Mixed Cloze Card

```osmosis
id: mixcloze

==Bonjour== means **hello** in ==French==
```

## Type-in Card

```osmosis
id: typein01
type-in: true

Spell the capital of France
***
Paris
```

## Card with Hint

```osmosis
id: hint0001
hint: Think about organelles

What produces ATP in a cell?
***
Mitochondria
```

## Excluded Card

```osmosis
exclude: true

This should NOT generate a card
***
Because it is excluded
```

## Another Card After Exclusion

```osmosis
id: afterexc
This one should generate a card
***
Because the exclusion only applies to the previous fence
```
