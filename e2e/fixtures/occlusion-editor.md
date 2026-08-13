# Image occlusion editor fixture

Phase 3 fixture. **Nothing in this note is a card yet, and that is the point.**
Every image below is untagged: no block ID, no fence `id:`, no `{label}`, and no
`osmosis-cards` property in frontmatter — this note has no frontmatter at all.

Identity is minted lazily, at save. So each section is really a test of what the
editor writes *into* this file, and cancelling must leave it byte-identical.

Reset this file from `e2e/fixtures/` between runs — the whole fixture is its
starting state.

Both fences below are **drafts**: no separator, no cloze, no occlusion, so
`generateExplicitCards` makes no card from either. They still render their
content in edit and reading view rather than dumping raw source — otherwise the
diagram you are about to occlude is only ever shown to you as text. A draft has
no divider, no hidden back, and no rating row, and nothing joins a deck until it
becomes a real card.

## Bare image in prose — becomes a line card

An image outside any fence is occluded as a *line* card. Saving should add a
` ^os-xxxxxx` block ID to the line, add `osmosis-schedule.os-xxxxxx.occlude`
with block-mapping shapes to frontmatter, and add `osmosis-cards: true`.

![[bridge-cross-section.svg]]

## Bare image — for the cancel test

Draw a mask on this one and cancel. Nothing above or below should change: no
block ID on this line, no frontmatter, no opt-in property.

![[span-elevation.svg]]

## Fence, one diagram, no id and no label

A single-embed fence stays unlabelled: saving should mint an `id:` directly
under the opening line and write a bare `occlude:` block, with no `{a}` added to
the embed. A label is text in the note and only earns its keep at two diagrams.

```osmosis
Which parts of this span carry load in compression?

![[span-elevation.svg]]
```

## Fence, two diagrams, neither id nor labels

The one that catches the off-by-one: minting the `id:` pushes every line below
it down by one, so a label written to the pre-insertion line number lands on the
wrong embed. Occlude the **cross-section** here and the `{a}` must end up on the
cross-section, not on the elevation.

Then occlude the elevation too. It should get `{b}`, and its groups should carry
on from the cross-section's — both embeds derive their card IDs as
`<fenceId>-cN` from the same fence, so a second diagram restarting at `c1` would
overwrite the first diagram's cards.

```osmosis
Name the labelled parts of each drawing.

![[bridge-cross-section.svg]]
![[span-elevation.svg]]
```

## Prose with no image

Right-clicking here offers no occlusion item, and with the cursor on this line
`Osmosis: Create image occlusion` should be absent from the command palette
entirely — the command checks for an image before it offers itself.

Bridge decks are sized by live load, not by span alone.
