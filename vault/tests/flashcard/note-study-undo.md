---
osmosis-cards: true
osmosis-deck: Testing/Note Study Undo
---

# Note study undo (T119)

Eight questions, all overdue or new: one basic card, three cloze groups, two
directions of a bidirectional pair, and two shape groups on a diagram. Start
note study on this note; the progress strip should read **0/8**.

Each card's undo button (top right, left of the hide toggle) takes back **that
card's** latest rating. **Ctrl+Z** takes back the note's latest rating, whichever
card it was on. Either way the card goes back to the question just rated, hidden
behind **Show answer**, and the strip count drops by one.

## Basic

Reveal, rate **Good**, then press undo: Show answer is back and the strip drops
from 1/8 to 0/8. The undo button hides again, since nothing is left to undo here.

```osmosis
id: nsu-bowline
due: 2026-11-10T09:00:00.000Z
stability: 4.0000
difficulty: 5.0000
reps: 3
lapses: 0
state: review
lastReview: 2026-11-03T09:00:00.000Z
learningSteps: 0

Which knot makes a fixed loop that will not slip or jam?
***
The bowline.
```

## Three-group cloze

Rate `1/3` Good: the card moves to `2/3`. Press undo: back on `1/3`, the first
group blanked again, Show answer showing. Rate all three until the card reads
**Rated**, then undo: back on `3/3`.

```osmosis
id: nsu-galley
c1:
  due: 2026-11-09T09:00:00.000Z
  stability: 4.2000
  difficulty: 5.9892
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-11-05T09:00:00.000Z
  learningSteps: 0
c2:
  due: 2026-11-10T09:00:00.000Z
  stability: 3.1000
  difficulty: 5.4000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-11-07T09:00:00.000Z
  learningSteps: 0
c3:
  due: 2026-11-11T09:00:00.000Z
  stability: 1.8000
  difficulty: 7.2000
  reps: 1
  lapses: 0
  state: review
  lastReview: 2026-11-10T09:00:00.000Z
  learningSteps: 0

A ==c1:roux== is equal parts ==c2:flour== and ==c3:fat==, cooked together.
```

## Bidirectional

Rate the forward card, then press **Ctrl+Z** with the mouse over the note: the
card is back on the forward question, `1/2`.

```osmosis
id: nsu-capital
bidi: true
due: 2026-11-09T09:00:00.000Z
stability: 5.4000
difficulty: 5.1000
reps: 3
lapses: 0
state: review
lastReview: 2026-11-04T09:00:00.000Z
learningSteps: 0
r:
  due: 2026-11-08T09:00:00.000Z
  stability: 9.1000
  difficulty: 4.8000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-11-06T09:00:00.000Z
  learningSteps: 0

Which city is the capital of Portugal?
***
Lisbon.
```

## Occlusion — two shape groups

New cards. Rate `1/2`, then press undo: back on `1/2` with the first group
masked as the question and Show answer showing. This card had no undo button
before T119.

```osmosis
id: nsu-bridge
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

Name the marked parts of the bridge section.
![[bridge-cross-section.svg]]{a}
```

## Two cards, one undo each

Rate the basic card above, then rate the cloze card's `1/3`. Press undo on the
**basic** card: only the basic card goes back to Show answer; the cloze card
stays on `2/3`. Ctrl+Z after that undoes the cloze rating.
