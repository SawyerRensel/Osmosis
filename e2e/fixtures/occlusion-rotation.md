---
osmosis-cards: true
osmosis-deck: Engineering/Rotation
osmosis-schedule:
  os-truss01:
    occlude:
      mode: hide-all-guess-one
      header: "Which member is covered?"
      back-extra: "A diagonal carries shear between the two chords."
      shapes:
        - group: c1
          kind: rect
          x: 0.7108
          y: 0.45
          w: 0.1642
          h: 0.1
          rotation: 313
      annotations:
        - x: 0.62
          y: 0.2
          rotation: 313
          text: "along the brace"
    c1:
      due: 2026-08-02T09:00:00
      stability: 2.5
      difficulty: 6
      reps: 1
      lapses: 0
      state: review
      learningSteps: 0
---

# Image occlusion — rotation fixture

The diagram is **1200×300**, four times as wide as it is tall, and that is the
whole point of this file. A rotation applied inside the mask overlay without
compensating for the image's proportions is applied *after* the overlay's own
stretch, so a tilted rectangle comes out as a **parallelogram**. On a square
picture the mistake is invisible; at 4:1 it is unmissable.

Reset this file and `gantry-truss.svg` from `e2e/fixtures/` between runs.

Every card here is **new or overdue**, so all of them are studiable. Deck Total
is new + learn + due — a future-dated `review` card counts for nothing and looks
exactly like a card that failed to generate.

## What to look for on every surface

1. Each masked diagonal is a **rectangle lying along the brace**, its corners
   square. If any mask reads as a leaning parallelogram, or its ends splay, the
   aspect compensation has been lost.
2. The masks sit **on** the members they cover, not beside them.
3. `c4` covers the centre post and is **not** rotated — it must render exactly
   as it always did, with no transform of any kind.
4. The `{a}` label never appears as text, and is still in this file afterwards.

## Fence card — four groups, three of them turned

```osmosis
id: truss-members
occlude-a:
  mode: hide-all-guess-one
  header: "Name the covered member"
  back-extra: "Diagonals take shear, posts take it vertically, chords take moment."
  shapes:
    - group: c1
      kind: rect
      x: 0.0358
      y: 0.45
      w: 0.1642
      h: 0.1
      rotation: 313
    - group: c1
      kind: rect
      x: 0.1483
      y: 0.45
      w: 0.1642
      h: 0.1
      rotation: 47
    - group: c2
      kind: ellipse
      x: 0.4554
      y: 0.5
      rx: 0.0821
      ry: 0.05
      rotation: 47
    - group: c3
      kind: poly
      points: [[0.5983, 0.45], [0.7625, 0.45], [0.7625, 0.55], [0.5983, 0.55]]
      rotation: 47
    - group: c4
      kind: rect
      x: 0.48
      y: 0.24
      w: 0.04
      h: 0.52
  annotations:
    - x: 0.2
      y: 0.12
      rotation: 340
      text: "west bay"
    - x: 0.8
      y: 0.12
      text: "east bay"

The gantry truss, in elevation.
![[gantry-truss.svg]]{a}
```

Expected in **reading view**: every group covered at once, the two turned
diagonals as clean rectangles along their braces, the ellipse as a tilted
ellipse over the third, and `c4` upright over the centre post. "west bay" reads
at a slight tilt; "east bay" is level. Clicking rings all four rather than
clearing them.

Expected in **sequential study**: four cards. The label text stays legible at
its own angle and does **not** scale with the picture.

Expected in a **mind map**: the same masks, painted in the node.

## Editing it back

Right-click the diagram → **Create image occlusion**. Then, in the editor:

- A selected shape grows a **grip on a stem above it**. Drag the grip: the shape
  turns, and the grip and the eight resize handles turn with it.
- Hold **shift** while dragging the grip: the angle snaps to 15°.
- Grab a turned shape **where it is drawn**, not where its upright box was — the
  turned diagonals are the test, since their boxes barely overlap the members.
- Drag a turned shape's corner handle: it resizes, and the opposite corner
  **stays put**. If the whole shape slides sideways as you drag, the anchoring
  has been lost.
- **Ctrl+Z** undoes a rotation and nothing else.
- Select a label and it grows a grip of its own, hanging off its anchor. Turning
  it leaves the anchor exactly where it was.
- Turn a shape back to square and **save**: its `rotation:` line must disappear
  from the fence entirely, not become `rotation: 0`.

## Line card — one turned mask and a turned label

The block ID identifies the line and the line holds one embed, so the shape set
sits in this note's frontmatter under `os-truss01`.

![[gantry-truss.svg]] ^os-truss01

Expected in **peek** and **contextual study**: the fourth diagonal covered by a
rectangle lying along it, with "along the brace" tilted to match. Rating once
moves the card.
