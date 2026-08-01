---
osmosis-deck: Flashcard Types Test
osmosis-cards: true
---

# Flashcard Types Test

Each section below is a separate card (or group of cards). Work through them in sequential study to verify every syntax form.

## 1. Basic front/back

```osmosis
id: 8ff616aa
What is the capital of France?
***
Paris
```

## 2. Prose cloze — `==highlight==`

Expect 3 cards, one per term blanked. Back shows all three highlighted.

```osmosis
id: db070e7a

==Mitochondria== are the ==powerhouse== of the ==cell==.
```

## 3. Prose cloze — `**bold**`

Expect 2 cards.

```osmosis
id: c83b465e

**Bonjour** means **hello** in French.
```

## 4. Prose cloze — `:::plain:::`

Expect 2 cards. Note the `:::` markers are stripped from both sides — no visual residue.

```osmosis
id: 86739adf

The :::mitochondria::: is the powerhouse of the :::cell:::.
```

## 5. Prose cloze — mixed delimiters in one card

Expect 3 cards. Demonstrates that `==`, `**`, and `:::` can all coexist.

```osmosis
id: 72d0a91e

==Paris== is the capital of **France**, which sits on the :::Seine:::.
```

## 6. Grouped prose cloze — same term blanked twice

Expect **1 card**. Both "Paris" occurrences blank together.

```osmosis
id: 367eab41

==c1:Paris== is the capital, and ==c1:Paris== sits on the Seine.
```

## 7. Grouped prose cloze — across delimiters

Expect **1 card**. All three `c1` occurrences — highlight, bold, and plain — blank together.

```osmosis
id: 06199e1d

==c1:Claude== wrote it, **c1:Claude** tested it, and :::c1:Claude::: shipped it.
```

## 8. Sparse user-chosen group numbers

Expect 2 cards with IDs ending `-c1` and `-c5` (numbers preserved verbatim).

```osmosis
id: sparse-test
==c1:First== ... ==c5:Fifth==
```

## 9. Anonymous clozes numbered above labeled ones

Expect 3 cards. The labeled one keeps `c2`; the two anonymous ones get `c3` and `c4`.

```osmosis
id: anon-test
==c2:labeled== plus ==anonymous-one== plus ==anonymous-two==
```

## 10. Single-line code cloze

Expect 1 card. The `return n` line is blanked on the front.

````osmosis
id: 020b6588

```python
def fibonacci(n):
    if n <= 1:
        return n  # osmosis-cloze
    return fibonacci(n-1) + fibonacci(n-2)
```
````

## 11. Multi-line code cloze region

Expect 1 card. The whole loop body is replaced with a single blank.

````osmosis
id: 61f40b41

```python
def fibonacci(n):
    if n <= 1:
        return n
    # osmosis-cloze-start
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
    # osmosis-cloze-end
```
````

## 12. Mixed single-line and multi-line code clozes

Expect 2 cards — one per region.

````osmosis
id: 1799d1c4

```python
def fibonacci(n):
    if n <= 1:
        return n  # osmosis-cloze
    # osmosis-cloze-start
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
    # osmosis-cloze-end
```
````

## 13. Grouped line-level code clozes

Expect **1 card**. Both `x = 1` and `y = 2` lines blank together; `z = 3` visible.

````osmosis
id: 90d28f2c

```python
x = 1  # osmosis-cloze-c1
y = 2  # osmosis-cloze-c1
z = 3
```
````

## 14. Grouped line-level + multi-line region

Expect **1 card**. The `x = 1` line AND the multi-line region collapse together; `a = 4` visible.

````osmosis
id: 96bc54ba

```python
x = 1  # osmosis-cloze-c1
# osmosis-cloze-start-c1
y = 2
z = 3
# osmosis-cloze-end-c1
a = 4
```
````

## 15. Inline code cloze — single occurrence

Expect 1 card.

````osmosis
id: fef9f8e6

```python
print(:::"Hello, World":::)
```
````

## 16. Inline code clozes — separate anonymous

Expect 2 cards.

````osmosis
id: ad20c427

```python
x = :::"hello":::
y = :::"world":::
```
````

## 17. Inline code clozes — grouped by `c<N>`

Expect 2 cards. `c2` blanks both `name` occurrences together.

````osmosis
id: 213a310d

```python
def :::c1:greet:::(:::c2:name:::):
    return f"Hello, :::c2:name:::"
```
````

## 18. Mixed prose + inline code clozes in one fence

Expect 3 cards.

- `c1`: `greet` blanked in code; prose visible.
- `c2`: both `name` occurrences blanked together; prose visible.
- `c3`: prose cloze blanked; code visible.

````osmosis
id: 19f6aa95

This is a regular :::c3:cloze:::.

```python
def :::c1:greet:::(:::c2:name:::):
    return f"Hello, :::c2:name:::"
```
````

## 19. Prose and code sharing the same `c<N>` group

Expect **1 card**. The prose `greet` and the code `greet` blank together — universal grouping across prose and code.

````osmosis
id: 072e6b19

The function ==c1:greet== is defined below:

```python
def :::c1:greet:::():
    pass
```
````

## 20. JavaScript comment syntax

Expect 1 card. Confirms `//` comments work for the marker.

````osmosis
id: cd7a18a2

```javascript
function add(a, b) {
    return a + b; // osmosis-cloze
}
```
````

## 21. Basic card with hint

Hint appears on the front in italics.

```osmosis
id: ecbbba78
hint: A greeting in French

Bonjour
***
Hello
```

## 22. Bidirectional card

Expect 2 cards — forward and reverse. Each scheduled independently.

```osmosis
id: 2b976b13
bidi: true

Paris
***
Capital of France
```

## 23. Type-in card

You type the answer rather than flipping.

```osmosis
id: 1b58437e
type-in: true

Spell the capital of France
***
Paris
```
