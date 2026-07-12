---

osmosis-cards: true

---

# Generate Flashcards Test ^os-w8f52e

This note starts with no opt-in frontmatter — the command should offer to add it. ^os-eg24lc

## Plain Elements ^os-0o00l2

- A bullet without an ID ^os-9vgz52
- A bullet that already has one ^os-keepme
	- A nested bullet ^os-nnpiu7

1. First step ^os-2kyyhx
2. Second step ^os-bvresf

A single-line paragraph. ^os-dh8e7l

This paragraph is hard-wrapped across
two lines, so only the second line should get an ID. ^os-eeujud

Test ^os-ho28zg

## Multi-line Blocks ^os-2is8x1

```python
def hello():
    return "world"  # carets ^ inside stay untouched
```

^os-r5gm0n

| Term | Meaning         |
| ---- | --------------- |
| ATP  | Energy currency |

^os-ftd11p

```osmosis
id: os-xztf15
What is the capital of France?
***
Paris
```

```osmosis
id: abc12345
Already has an id
***
Should stay untouched
```

## Exclusions ^os-buj6vs

<!-- osmosis-exclude -->

- This bullet must NOT be tagged ^os-j45ziv

![[block-id-verification]]

Final paragraph to close things out. ^os-lu8wjs
