---
osmosis-cards: true
osmosis-deck: Testing/Sidecar move
osmosis-schedule:
  sdmov-l1:
    due: 2026-08-12T09:00:00
    stability: 4.21
    difficulty: 5.5
    lastReview: 2026-08-02T09:00:00
    reps: 3
    lapses: 0
    state: review
    learningSteps: 0
osmosis-styles: {"styles": {"^sdmov-l1": {"fill": "#2e86de"}, "^sdmov-l2": {"shape": "ellipse", "fill": "#10ac84"}}}
---

# Moving data in and out of a sidecar (T128)

This note starts in **note mode**: its line-card schedule and its map styles
are in the properties above, and every fence below carries its review state in
its header. Before moving anything, note this deck's counts in the Decks view
(**Testing/Sidecar move**) and open this note in the mind map: the first two
lines are filled blue and green.

Run **Move data to sidecar**. The properties shrink to `osmosis-cards` and
`osmosis-deck`, each fence header keeps only `id`, `bidi`, `type-in` and
`deck`, a new file appears in `Osmosis/Schedule/`, and the deck counts, the
mind map colours and the masks are unchanged. **Move data into note** puts
everything back where it is now.

## Line cards

- A bowline makes a fixed loop that will not slip ^sdmov-l1
- A clove hitch is quick to tie around a post ^sdmov-l2

## Fences

A two-group cloze. Both groups are due:

```osmosis
id: sdmov-cloze
c1:
  due: 2026-08-09T09:00:00.000Z
  stability: 4.2000
  difficulty: 5.9892
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-05T09:00:00.000Z
  learningSteps: 0
c2:
  due: 2026-08-10T09:00:00.000Z
  stability: 3.1000
  difficulty: 5.4000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-07T09:00:00.000Z
  learningSteps: 0

A ==c1:sheet bend== joins two ropes; a ==c2:rolling hitch== grips a spar.
```

A bidirectional fence with its own deck. The forward card is due; the reverse
is **buried** until 31 December, so it is not counted:

```osmosis
id: sdmov-bidi
bidi: true
deck: Testing/Sidecar move/Points of sail
due: 2026-08-09T09:00:00.000Z
stability: 5.4000
difficulty: 5.1000
reps: 3
lapses: 0
state: review
lastReview: 2026-08-04T09:00:00.000Z
learningSteps: 0
r:
  due: 2026-08-08T09:00:00.000Z
  stability: 9.1000
  difficulty: 4.8000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-06T09:00:00.000Z
  learningSteps: 0
  buriedUntil: 2026-12-31T04:00:00.000Z

Which point of sail has the wind directly behind?
***
A run
```

A type-in card, **excluded** from study (suspended), so it is not counted:

```osmosis
id: sdmov-basic
exclude: true
type-in: true
due: 2026-08-10T09:00:00.000Z
stability: 6.7000
difficulty: 4.6000
reps: 3
lapses: 0
state: review
lastReview: 2026-08-03T09:00:00.000Z
learningSteps: 0

Which side of a boat is port, facing forward?
***
Left
```

An occluded pair of diagrams: three cards, `c1` reviewed and due, `c2` and `c3`
new:

```osmosis
id: sdmov-bridge
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.1188
      y: 0.5225
      w: 0.1375
      h: 0.08
    - group: c2
      kind: ellipse
      x: 0.825
      y: 0.56
      rx: 0.065
      ry: 0.05
occlude-b:
  mode: hide-one-guess-one
  shapes:
    - group: c3
      kind: poly
      points: [[0.395, 0.505], [0.605, 0.505], [0.5, 0.36]]
c1:
  due: 2026-08-14T09:00:00.000Z
  stability: 2.5000
  difficulty: 6.0000
  reps: 1
  lapses: 0
  state: review
  lastReview: 2026-08-12T09:00:00.000Z
  learningSteps: 0

![[bridge-cross-section.svg]]{a}
![[span-elevation.svg]]{b}
```

A new card with no review state. Nothing of it moves:

```osmosis
id: sdmov-new

Which knot ties a boat to a ring?
***
A round turn and two half hitches
```
