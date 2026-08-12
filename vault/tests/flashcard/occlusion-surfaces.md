---
osmosis-cards: true
osmosis-deck: Engineering/Surfaces
osmosis-schedule:
  os-elevat1:
    occlude:
      mode: hide-one-guess-one
      header: Where does the load go?
      back-extra: The pier takes it down; the abutment takes it sideways.
      shapes:
        - group: c1
          kind: rect
          x: 0.3163
          y: 0.865
          w: 0.115
          h: 0.075
        - group: c2
          kind: rect
          x: 0.0413
          y: 0.865
          w: 0.155
          h: 0.075
        - group: c3
          kind: ellipse
          x: 0.5
          y: 0.1225
          rx: 0.1
          ry: 0.05
    c1:
      due: 2026-08-12T08:39:10
      stability: 0.212
      difficulty: 6.4133
      lastReview: 2026-08-12T08:38:10
      reps: 1
      lapses: 0
      state: learning
      learningSteps: 0
    c2:
      due: 2026-08-12T08:39:11
      stability: 0.212
      difficulty: 6.4133
      lastReview: 2026-08-12T08:38:11
      reps: 1
      lapses: 0
      state: learning
      learningSteps: 0
    c3:
      due: 2026-08-12T08:39:12
      stability: 0.212
      difficulty: 6.4133
      lastReview: 2026-08-12T08:38:12
      reps: 1
      lapses: 0
      state: learning
      learningSteps: 0
---

# Image occlusion — contextual and spatial fixture

Phase 5 fixture: the two surfaces that had no occlusion rendering, plus Anki's
three text fields. Reset this file from `e2e/fixtures/` between runs.

Every card here is **new or overdue**, so all of them are studiable. Deck Total
is new + learn + due — a future-dated `review` card counts for nothing and looks
exactly like a card that failed to generate.

The headings and bullets below are shaped so a mind map over this note gives
each card its own node.

## Fence card — two diagrams, one of them not occluded

`{a}` binds the cross-section to its shapes. `span-elevation.svg` carries **no**
shape set and must survive as an ordinary embed: occluding one diagram in a
fence must not make its neighbour vanish.

Neither label may ever appear as text — not in reading view, not in a mind-map
node — and both must still be in this file afterwards.

```osmosis
id: surface-parts
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.1188
      y: 0.5225
      w: 0.1375
      h: 0.08
    - group: c1
      kind: rect
      x: 0.6675
      y: 0.365
      w: 0.045
      h: 0.385
    - group: c2
      kind: ellipse
      x: 0.825
      y: 0.56
      rx: 0.065
      ry: 0.05
  annotations:
    - x: 0.255
      y: 0.3022
      w: 0.0411
      h: 0.0332
      text: "meow"
    - x: 0.5175
      y: 0.8122
      w: 0.229
      h: 0.0332
      rotation: 28.0409
      text: "testing a long annotation to see if it works"
  header: "Cross-section: name the covered parts"
  back-extra: "Web plate carries shear; the parapet is non-structural."
c1:
  due: 2026-08-12T12:39:01.006Z
  stability: 0.2120
  difficulty: 6.4133
  reps: 1
  lapses: 0
  state: learning
  lastReview: 2026-08-12T12:38:01.006Z
  learningSteps: 0
c2:
  due: 2026-08-12T12:39:05.576Z
  stability: 0.2120
  difficulty: 6.4133
  reps: 1
  lapses: 0
  state: learning
  lastReview: 2026-08-12T12:38:05.576Z
  learningSteps: 0

The section, then the elevation.
![[bridge-cross-section.svg]]{a}
![[span-elevation.svg]]
```

Expected in **reading view and peek**: the prose line and the plain elevation
render as markdown; the cross-section renders with **both** groups covered at
once — no amber "this one is being asked", because a reader looking at a picture
is not answering one of the questions it carries. The header sits above it, and
Back Extra is held back until you click to reveal, which rings both masks rather
than clearing them.

Expected in **contextual study**: this becomes a card player, exactly as
sequential and spatial are. It asks `c1` first — that group amber, `c2` covered
as its sibling — with a `1/2` counter in the bottom row. Clicking rings `c1`;
rating advances to `c2` and the counter reads `2/2`. After the second rating the
diagram goes back to every region ringed, marked "Rated". Each rating must move
**one** card: `surface-parts-c1`, then `surface-parts-c2`. The plain elevation
stays unmasked throughout — its pixels belong to no card here.

Starting and stopping study must reach this fence even though it is a code
block, which Obsidian does not re-run on a mode change.

Expected in **sequential study**: two cards, `surface-parts-c1` and
`surface-parts-c2`, each singling its own group out in amber — and **both
diagrams on screen**, the elevation unmasked below the cross-section, in the
order they are written here.

Expected in a **mind map**: this fence renders as a card with its masks, not as
a block of `occlude:` geometry. In peek or study the diagram is covered and the
node is never replaced by a "?"; clicking uncovers it.

## Line card — occluded, with both text fields

The block ID identifies the line and the line holds one embed, so the shape set
sits in this note's frontmatter under `os-elevat1`.

![[span-elevation.svg]] ^os-elevat1

Expected in **peek**: no rating buttons appear anywhere — peek records
nothing, so it must not offer to. The diagram stays visible with its three
labels masked,
rather than the whole line disappearing behind `░░░░░░`. Clicking gives the line
back.

Expected in **contextual study**: the line's three shape groups are asked one at
a time, `c1` → `c2` → `c3`, each with its own reveal and its own rating bubble,
and each rating moving **only that group's** card. The line stays "next" in the
top-down order until all three are answered, and only then does study move on.
The floating pill counts questions rather than lines, so this line alone takes it
from `0/4` to `3/4`.

Expected in a **mind map**: this node keeps its picture and shows the masks;
tapping reveals.

## Line card — plain, no masks at all

- A suspension bridge carries its deck from cables in tension. ^os-plainl1

Expected: unchanged behaviour — peek hides the whole line behind a placeholder,
because there is nothing on it to mask.
