---
osmosis-cards: true
---

# Block ID Verification ^os-head01

This note verifies that native Obsidian block IDs are hidden in reading view and stripped from mind map nodes.

## Heading with ID ^os-head02

A paragraph under the heading, itself carrying an ID. ^os-para01

- Bullet item with an ID ^os-bull01
- Bullet item without an ID
	- Nested bullet with an ID ^os-bull02
- [x] Checked task with an ID ^os-task01

1. Ordered item with an ID ^os-ord001
2. Ordered item without an ID

## Edge Cases ^os-head03

A paragraph with a user-authored block ID. ^my-custom-id

This line mentions 2 ^ 8 mid-sentence and has no trailing ID.

```js
// Code blocks must keep carets verbatim: x ^os-fake1
```

Link to a tagged block: [[block-id-verification#^os-bull01]]
