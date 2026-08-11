---
osmosis-cards: true
osmosis-deck: Engineering/Bridges
osmosis-schedule:
  os-am7yvh:
    occlude:
      mode: hide-all-guess-one
      shapes:
        - group: c1
          kind: rect
          x: 0.3451
          y: 0.126
          w: 0.3067
          h: 0.3855
        - group: c2
          kind: rect
          x: 0.1028
          y: 0.6753
          w: 0.1247
          h: 0.0266
---

# Image occlusion — full toolset fixture

Phase 4 fixture. Everything below is already a card, so the **reading** half of

each new feature can be checked before you draw anything: a polygon authored

elsewhere, and text annotations, both rendering in sequential study.

Reset this file from `e2e/fixtures/` between runs — the editor writes back into

it, which is the other half of what this fixture is for.

No card here carries a schedule, so every one is **new** and therefore

studiable. Deck Total is new + learn + due; a future-dated `review` card would

count for nothing and look exactly like a card that failed to generate.

## Fence card — polygon masks and annotations

`c1` is a triangle over the centre arch and `c2` a quadrilateral over the deck.

Neither has ever been drawn by hand: they are here so that reopening the editor

on a shape it did not create restores it exactly, vertex for vertex.

The two annotations are **not** masks. They must appear on the front *and* the

back of both cards, must never turn into a third card, and must read at their

true proportions rather than stretched — the mask overlay is deliberately

squashed to the image's aspect ratio and text drawn inside it would be squashed

with it.

```osmosis
id: span-shapes
occlude:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: poly
      points: [[0.395, 0.505], [0.605, 0.505], [0.5, 0.36]]
    - group: c2
      kind: poly
      points: [[0.12, 0.2], [0.88, 0.2], [0.88, 0.28], [0.12, 0.28]]
  annotations:
    - x: 0.02
      y: 0.02
      text: "Elevation, 1:200"
    - x: 0.62
      y: 0.86
      text: "Scour depth: 2.4 m"

Name the part of the span each mask covers.

![[span-elevation.svg]]
```

Expected: **two** cards, `span-shapes-c1` and `span-shapes-c2`. Both show both

labels. The second label carries a `:` and a `.`, which is why the writer always

quotes annotation text — unquoted it would change the meaning of the line, and

in the frontmatter carrier that fails the parse of the *whole note*.

## Fence card — a diagram to draw on

Nothing occludes this one yet. It is where the new tools get exercised: draw a

polygon vertex by vertex, close it on its first point, drag a vertex, alt-click

one away, double-click an edge to add one, place a label, align a pair of

rectangles, duplicate a mask, and undo the lot.

The fence already has an `id:`, so saving here should add only an `occlude-*`

block — nothing else about the note should move.

```osmosis
id: cross-section
Which parts of this section carry load in compression?

![[bridge-cross-section.svg]]
```

![Pasted image 20260806172808](Pasted%20image%2020260806172808.png) ^os-am7yvh

## Line card — annotations in the other carrier

The same annotation list, stored in frontmatter rather than a fence header once

this line is occluded. Draw a mask and a label on it and the `osmosis-schedule`

entry below its block ID should gain both `shapes` and `annotations`.

![[bridge-cross-section.svg]] ^os-tool001
