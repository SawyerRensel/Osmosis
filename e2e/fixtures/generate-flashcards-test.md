# Generate Flashcards Test

This note starts with no opt-in frontmatter — the command should offer to add it.

## Plain Elements

- A bullet without an ID
- A bullet that already has one ^os-keepme
	- A nested bullet

1. First step
2. Second step

A single-line paragraph.

This paragraph is hard-wrapped across
two lines, so only the second line should get an ID.

## Multi-line Blocks

```python
def hello():
    return "world"  # carets ^ inside stay untouched
```

| Term | Meaning |
|------|---------|
| ATP  | Energy currency |

```osmosis
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

## Exclusions

<!-- osmosis-exclude -->
- This bullet must NOT be tagged

![[block-id-verification]]

Final paragraph to close things out.
