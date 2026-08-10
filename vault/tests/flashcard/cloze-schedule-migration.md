---
osmosis-cards: true
osmosis-deck: Engineering/Bridges
---

# Cloze schedule migration fixture

Every fence below is written in the **old** storage format — flat, prefixed
schedule keys (`c1-due:`), kebab field names (`c1-last-review:`), and flow
mappings for occlusion shapes. Nothing here has been converted by hand.

Migration happens on write: a fence is rewritten only for the card being
reviewed. So studying one group of a three-group fence should convert **that
group only**, leaving its siblings flat until they come up. Both forms have to
read correctly while the file sits half-converted.

The schedules are a verbatim capture from a fence studied on 2026-08-10, before
the format changed.

## Three-group cloze fence — the main migration case

```osmosis
id: mig-danube
deck: Engineering/Rivers
c1-due: 2026-08-10T11:53:55.956Z
c1-stability: 0.0349
c1-difficulty: 9.5929
c1-reps: 3
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-08-10T11:52:55.956Z
c1-learning-steps: 0
c2-due: 2026-08-09T11:53:59.562Z
c2-stability: 1.2000
c2-difficulty: 6.4000
c2-reps: 1
c2-lapses: 0
c2-state: review
c2-last-review: 2026-08-08T11:53:59.562Z
c2-learning-steps: 0
c3-due: 2026-08-08T11:54:03.101Z
c3-stability: 2.8000
c3-difficulty: 5.1000
c3-reps: 2
c3-lapses: 0
c3-state: review
c3-last-review: 2026-08-07T11:54:03.101Z
c3-learning-steps: 0

The ==c1:Danube== rises in the ==c2:Black Forest== and empties into the
==c3:Black Sea==.
```

Expected: **three** cards, all carrying the schedules above. Study `c1` only.
Afterwards this fence should read:

```
c1:
  due: …
  stability: …
  …
  lastReview: …
  learningSteps: …
c2-due: 2026-08-09T11:53:59.562Z
…
c3-due: 2026-08-08T11:54:03.101Z
…
```

`c2` and `c3` must be **untouched**, still flat, still due when they were.

## Bidi fence — the reverse card nests too

`r-` comes out of the same mechanism as `c1-`, so it migrates the same way.

```osmosis
id: mig-nile
bidi: true
due: 2026-08-09T09:00:00.000Z
stability: 4.5000
difficulty: 5.2000
reps: 3
lapses: 0
state: review
last-review: 2026-08-08T09:00:00.000Z
learning-steps: 0
r-due: 2026-08-08T09:00:00.000Z
r-stability: 9.1000
r-difficulty: 4.8000
r-reps: 2
r-lapses: 0
r-state: review
r-last-review: 2026-08-08T09:00:00.000Z
r-learning-steps: 0

Longest river in Africa
***
The Nile
```

Expected: **two** cards. The forward card's fields stay flat at the top level —
only its `last-review`/`learning-steps` spellings migrate to `lastReview`/
`learningSteps`. The reverse card's whole schedule moves under `r:`.

## Occlusion fence — the shape block must survive a schedule write

Flat `c1-*` schedules sitting directly beneath a flow-mapping shape set.

Note what does *not* happen here: the shapes stay flow mappings. Only the
occlusion editor rewrites a shape block, and it does not exist yet, so a
schedule write must pass the whole block through untouched. The parser reads
both spellings either way.

```osmosis
id: mig-bridge
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - { group: c1, kind: rect, x: 0.1188, y: 0.5225, w: 0.1375, h: 0.08 }
    - { group: c1, kind: rect, x: 0.6675, y: 0.365, w: 0.045, h: 0.385 }
    - { group: c2, kind: ellipse, x: 0.825, y: 0.56, rx: 0.065, ry: 0.05 }
c1-due: 2026-08-10T11:53:55.956Z
c1-stability: 0.0349
c1-difficulty: 9.5929
c1-reps: 3
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-08-10T11:52:55.956Z
c1-learning-steps: 0

![[bridge-cross-section.svg]]{a}
```

Expected: **two** cards, masks painted exactly where they were before. Studying
`c1` converts its schedule to a nested block *beneath* the shape set, which must
come through with all three shapes intact and still bound to `{a}`. This is the
case where a metadata scan that stops at a valueless key drops the separator
blank line into a block and silently orphans every mask on the image.

## Already-migrated fence — must round-trip unchanged

```osmosis
id: mig-current
c1:
  due: 2026-08-09T09:00:00.000Z
  stability: 2.5000
  difficulty: 6.0000
  reps: 1
  lapses: 0
  state: review
  lastReview: 2026-08-08T09:00:00.000Z
  learningSteps: 0

A ==truss== carries load through triangulated members.
```

Expected: one card, already scheduled for 2026-08-09. Studying it updates the
block in place — no second `c1:` key, no flat keys reappearing.
