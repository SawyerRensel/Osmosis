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

**Every card, asked in place.** A fence asks each of its due cards in turn —
three cloze groups are three questions, a bidirectional pair is two — each with
its own reveal and its own rating, and the pill counts questions rather than
fences. What this fixture checks is that every question put is one the store
actually holds, and that answering it moves *that card's* schedule in this file.

Seven questions are due in this note: three cloze groups, two directions, and
two basic cards. The pill should read `0/7`.

## Three-group cloze — the review that used to vanish

All three groups are due, so this fence is **three** questions: `1/3`, `2/3`,
`3/3`, each blanking only its own group while the other two stay readable. Until
phase 3 it asked `c1` and stopped there, leaving `c2` and `c3` reachable in
sequential study alone.

Before anyone starts, though, the passage reads as the source wrote it: every
group blanked above, the whole thing filled in below, exactly as live preview
draws it. Blanking is a question, and nobody has asked one yet.

```osmosis
id: fct-rivers
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

After answering all three and pressing **Stop**, `c1:`, `c2:` and `c3:` should
*each* carry a new `due` and an incremented `reps`. Before phase 3 only `c1:`
moved; before phase 2 none of them did, because the rating went to a card ID the
store has never held.

## Bidirectional — forward first

Both directions are due, so this fence is **two** questions. Forward first —
"Which river is the longest in Africa?" — then the reverse, "The Nile.", in the
same spot. The reverse used to be reachable in sequential study and nowhere
else.

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

Rating the two should move the **top-level** schedule and `r:` separately, each
by its own answer.

## Basic fence — the control

One card, one ID, one question — and therefore **no step counter**, since "1/1"
says nothing the card does not already show.

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

Scheduled well into 2027, so a session should render it fully readable — both
groups blanked above, filled in below — offer no rating, and not count it in the
pill.

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

## A fence the store has only just met

**This fixture cannot hold an unsynced fence.** Sync stamps an `id:` onto every
fence it finds, within a second of the file being written — so a fence saved
without one has a card by the time you can open the note, which is why the `id:`
below is not the one this section was first written with. The fallback for a
fence the store has no card for (render its own text, no rating, not a target)
is covered by unit tests instead.

What is left here is the next-best thing: a fence with an ID and no schedule.
That is a **new** card, so the scheduler asks it — one question, no step
counter, and a fresh schedule written under the `id:` when you press Stop.

```osmosis
id: 55099465

Which data structure gives O(1) average lookup by key?
***
A hash table.
```
