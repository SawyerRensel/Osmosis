---
osmosis-cards: true
osmosis-deck: Testing/Fence Types
---

# Fence card types in Note view

Every card in this note is an `osmosis` fence, and most of them fan out into
more than one card in the store — which is exactly what reading view used to get
wrong. It derived its own front and back from the fence text and rated the
**fence's** ID; for a cloze fence no card by that name exists, so `recordRating`
dropped the review on its "card not in store" guard and the schedule never
moved.

**One question per fence here.** A fence is asked as the first of its cards the
scheduler would ask — so the three-group cloze below is one question, not three.
Stepping a fence through all of its cards is phase 3. What this fixture checks is
that the question put is one the store actually holds, and that answering it
moves *that card's* schedule in this file.

## Three-group cloze — the review that used to vanish

All three groups are due. The session should ask `c1` and nothing else, and the
question should blank **only** `c1` — the other two stay readable. Reading view
used to blank all three at once and call that one question.

```osmosis
id: fct-rivers
c1:
  due: 2026-08-25T03:33:29.020Z
  stability: 11.6069
  difficulty: 5.9892
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-13T03:33:29.020Z
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
c3:
  due: 2026-08-11T09:00:00.000Z
  stability: 1.8000
  difficulty: 7.2000
  reps: 1
  lapses: 0
  state: review
  lastReview: 2026-08-10T09:00:00.000Z
  learningSteps: 0

The ==c1:Danube== rises in the ==c2:Black Forest== and empties into the
==c3:Black Sea==.
```

After rating this one and pressing **Stop**, `c1:` above should carry a new
`due` and a `reps` of 2. `c2:` and `c3:` must be untouched — a review that
reached the wrong card would move all of them, or none.

## Bidirectional — forward first

Both directions are due. The session asks the **forward** card (`fct-capital`),
so the question is "Which river is the longest in Africa?". The reverse
(`fct-capital-r`) is only reachable in sequential study until phase 3.

```osmosis
id: fct-capital
bidi: true
due: 2026-08-13T03:44:50.887Z
stability: 0.9049
difficulty: 8.4075
reps: 4
lapses: 1
state: relearning
lastReview: 2026-08-13T03:34:50.887Z
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

Which river is the longest in Africa?
***
The Nile.
```

Rating this should move the **top-level** schedule and leave `r:` alone.

## Basic fence — the control

One card, one ID. This is the only type whose derived front and back always
agreed with the store's, so it should behave exactly as it did before.

```osmosis
id: fct-basic
due: 2026-08-13T03:35:54.638Z
stability: 0.0834
difficulty: 8.8063
reps: 2
lapses: 0
state: learning
lastReview: 2026-08-13T03:34:54.638Z
learningSteps: 0

Which HTTP status code means the request succeeded but returned no body?
***
204 No Content.
```

## A cloze fence that is not due — context, not a question

Scheduled well into 2027, so a session should render it fully readable, offer no
rating, and not count it in the pill.

```osmosis
id: fct-indexes
c1:
  due: 2027-06-01T09:00:00.000Z
  stability: 48.0000
  difficulty: 4.1000
  reps: 9
  lapses: 0
  state: review
  lastReview: 2026-06-01T09:00:00.000Z
  learningSteps: 0
c2:
  due: 2027-06-01T09:00:00.000Z
  stability: 48.0000
  difficulty: 4.1000
  reps: 9
  lapses: 0
  state: review
  lastReview: 2026-06-01T09:00:00.000Z
  learningSteps: 0

A database index trades ==c1:write speed== and ==c2:storage== for faster reads.
```

## An unsynced fence — the fallback

No `id:`, so the store holds nothing for it. It should render its own text, both
sides, with no rating row, and it should not be one of the session's questions.

```osmosis
id: 3c593f07
due: 2026-08-13T03:36:12.123Z
stability: 0.2120
difficulty: 6.4133
reps: 1
lapses: 0
state: learning
lastReview: 2026-08-13T03:35:12.123Z
learningSteps: 0

Which data structure gives O(1) average lookup by key?
***
A hash table.
```
