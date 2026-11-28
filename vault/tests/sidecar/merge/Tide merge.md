---
osmosis-cards: true
osmosis-deck: Testing/Sidecar merge
osmosis-schedule:
  smrg-l1:
    due: 2026-08-14T09:00:00
    stability: 4.2
    difficulty: 5.5
    lastReview: 2026-08-10T09:00:00
    reps: 11
    lapses: 0
    state: review
    learningSteps: 0
  smrg-l2:
    due: 2026-08-08T09:00:00
    stability: 4.2
    difficulty: 5.5
    lastReview: 2026-08-01T09:00:00
    reps: 12
    lapses: 0
    state: review
    learningSteps: 0
    disabled: true
  smrg-l3:
    due: 2026-08-09T09:00:00
    stability: 4.2
    difficulty: 5.5
    lastReview: 2026-08-05T09:00:00
    reps: 13
    lapses: 0
    state: review
    learningSteps: 0
  smrg-l4:
    disabled: true
osmosis-styles: {"styles": {"^smrg-l1": {"fill": "#2e86de"}}}
---

# Most recent copy wins (T128 fix round 1)

This note holds data **in both places**: these properties and fence headers,
and a hand-written sidecar `Osmosis/Data/Tide merge.osmosis.md`. Every
copy in the note has **reps 11–19**, every copy in the sidecar **reps 21–29**,
so after a move the `reps:` value says which copy won.

## Line cards

- Spring tides follow a new or full moon ^smrg-l1
- Neap tides fall near the quarter moons ^smrg-l2
- A tide table lists high and low water times ^smrg-l3
- Slack water is the pause between ebb and flood ^smrg-l4

## Fences

```osmosis
id: smrg-bidi
bidi: true
exclude: true
due: 2026-08-09T09:00:00.000Z
stability: 4.2000
difficulty: 5.5000
reps: 14
lapses: 0
state: review
lastReview: 2026-08-04T09:00:00.000Z
learningSteps: 0
r:
  due: 2026-08-10T09:00:00.000Z
  stability: 4.2000
  difficulty: 5.5000
  reps: 15
  lapses: 0
  state: review
  lastReview: 2026-08-06T09:00:00.000Z
  learningSteps: 0
  buriedUntil: 2026-12-31T04:00:00.000Z

What is the flood tide?
***
The rising tide, flowing towards the shore.
```

```osmosis
id: smrg-cloze
c1:
  due: 2026-08-11T09:00:00.000Z
  stability: 4.2000
  difficulty: 5.5000
  reps: 16
  lapses: 0
  state: review
  lastReview: 2026-08-07T09:00:00.000Z
  learningSteps: 0
c2:
  due: 2026-08-12T09:00:00.000Z
  stability: 4.2000
  difficulty: 5.5000
  reps: 17
  lapses: 0
  state: review
  lastReview: 2026-08-02T09:00:00.000Z
  learningSteps: 0

The ==c1:ebb== runs out to sea; the ==c2:flood== runs in.
```
