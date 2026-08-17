---
osmosis-cards: true
osmosis-deck: Engineering/Selection
---

# Image occlusion — multi-select fixture

Phase 6 fixture, for selecting **several things at once** and lining them up:
by Shift+click on a desktop, and by resting a finger on a mask or a label on a
phone, which has no Shift to press.

Everything below is deliberately **ragged** — no two masks share a left edge and
no two labels do either — so an alignment that silently did nothing would be
indistinguishable from one that worked. After Align left the whole selection
should share one left edge, and nothing should change size.

Reset this file from `e2e/fixtures/` between runs — the editor writes back into
it, which is half of what the fixture is for.

No card here carries a schedule, so every one is **new** and therefore
studiable. Deck Total is new + learn + due; a future-dated `review` card would
count for nothing and look exactly like a card that failed to generate.

## Fence card — three ragged masks and two ragged labels

The three masks are in three groups, so they are three cards and the selection
crosses card boundaries — aligning must not disturb any group, and the card
count in the hint line must not move.

The two labels are **not** masks. They must never become a fourth card, and
they must survive being selected alongside a mask: that pairing is the whole
point of the fixture, and it used to be impossible.

```osmosis
id: span-select
occlude:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.14
      y: 0.2
      w: 0.18
      h: 0.08
    - group: c2
      kind: rect
      x: 0.42
      y: 0.36
      w: 0.14
      h: 0.08
    - group: c3
      kind: ellipse
      x: 0.72
      y: 0.58
      rx: 0.09
      ry: 0.05
  annotations:
    - x: 0.2
      y: 0.76
      w: 0.28
      h: 0.07
      text: "Deck slab"
    - x: 0.56
      y: 0.87
      w: 0.3
      h: 0.07
      text: "Pier, scour 2.4 m"

Name the part of the span each mask covers.

![[span-elevation.svg]]
```

Expected: **three** cards, `span-select-c1` through `-c3`. All three show both
labels, on the front and on the back.

## Fence card — a diagram to build a selection on

Nothing occludes this one yet. Draw four or five masks and a couple of labels on
it, then exercise the selection itself: gather them by Shift+click, gather them
by holding a finger, drag the whole arrangement into the image's edge and check
it does not deform, and undo the lot.

The fence already has an `id:`, so saving here should add only an `occlude-*`
block — nothing else about the note should move.

```osmosis
id: section-select
Which parts of this section carry load in compression?

![[bridge-cross-section.svg]]
```

## Line card — the other carrier

The same selection work, stored in frontmatter rather than a fence header once
this line is occluded. Draw two masks and two labels, align them together, and
the `osmosis-schedule` entry below its block ID should gain both `shapes` and
`annotations` with the aligned coordinates.

![[bridge-cross-section.svg]] ^os-sel001
