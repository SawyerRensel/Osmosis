---
osmosis-cards: true
osmosis-deck: Engineering/Bridges
osmosis-schedule:
  os-plain01:
    due: 2026-08-12T09:00:00
    stability: 4.21
    difficulty: 5.5
    reps: 3
    lapses: 0
    state: review
    learningSteps: 0
  os-elev001:
    occlude:
      mode: hide-one-guess-one
      shapes:
        - { group: c1, kind: rect, x: 0.3163, y: 0.865, w: 0.115, h: 0.075 }
        - { group: c2, kind: rect, x: 0.0413, y: 0.865, w: 0.155, h: 0.075 }
        - { group: c3, kind: ellipse, x: 0.5, y: 0.1225, rx: 0.1, ry: 0.05 }
    c1:
      due: 2026-08-14T09:00:00
      stability: 2.5
      difficulty: 6
      reps: 1
      lapses: 0
      state: review
      learningSteps: 0
---

# Image occlusion fixture

Phase 1 shipped the format, parser, and storage; phase 2 adds the mask renderer
and wires it into sequential study. So the cards below now paint their masks
when studied — the editor (phase 3) and the contextual/spatial surfaces
(phase 5) are still to come.

What this note checks is that the cards come out right, that the two carriers
both work, that the masks land where the shapes say they do, and that a note
written before occlusion existed still loads exactly as it did.

## Fence card — two labelled diagrams, three shape kinds

The `{a}` and `{b}` labels bind each embed to its own shape set. They must never
appear as text anywhere a card is rendered, and must survive in this file.

```osmosis
id: bridge-parts
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - { group: c1, kind: rect, x: 0.1188, y: 0.5225, w: 0.1375, h: 0.08 }
    - { group: c1, kind: rect, x: 0.6675, y: 0.365, w: 0.045, h: 0.385 }
    - { group: c2, kind: ellipse, x: 0.825, y: 0.56, rx: 0.065, ry: 0.05 }
occlude-b:
  mode: hide-one-guess-one
  shapes:
    - { group: c3, kind: poly, points: [[0.395, 0.505], [0.605, 0.505], [0.5, 0.36]] }

![[bridge-cross-section.svg]]{a}
![[span-elevation.svg]]{b}
```

Expected: **three** cards — `bridge-parts-c1`, `bridge-parts-c2`,
`bridge-parts-c3`. The first two belong to the cross-section, the third to the
elevation. `c1` has two shapes but is still one card.

In study, `bridge-parts-c1` covers the "Web plate" label *and* the right-hand
web plate in the question colour, with the "Parapet" ellipse also covered (a
different colour) because this set is hide-all-guess-one. Flipping lifts both
`c1` masks and rings them, leaving `c2` covered. `bridge-parts-c3` covers only
its triangle over the centre arch, because that set is hide-one-guess-one.

## Line card — occluded, no label needed

The block ID identifies the line and the line holds one embed, so the shape set
sits in this note's frontmatter under `os-elev001` with no `image:` field.

![[span-elevation.svg]] ^os-elev001

Expected: **three** cards from this one line — one per group — with `c1` already
carrying a review schedule and the other two new. Each covers exactly one label
("Pier", "Abutment", "Main span"), since the set is hide-one-guess-one.

## Line card — plain, written before occlusion existed

This entry keeps its schedule fields directly on the block ID, the shape every
note used before occlusion. It must keep loading unchanged.

- A suspension bridge carries its deck from cables in tension. ^os-plain01

Expected: one ordinary line card, `reps: 3`, still scheduled for 2026-08-12.
