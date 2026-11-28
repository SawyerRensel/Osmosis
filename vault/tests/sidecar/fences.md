---
osmosis-cards: true
osmosis-deck: Testing/Sidecar fences
---

# Sidecar fences (T126)

This note starts with **no Osmosis data** in its properties, so with *Data
location* set to **Sidecar file** (the default) it is a sidecar-mode note.
Rating, burying or suspending any fence card below writes to the sidecar's
`osmosis-fences` (in `Osmosis/Schedule/`), keyed by the fence `id`. The fence
text in this note must stay **byte-for-byte unchanged**: no `due:`, `r:`,
`c1:`, `buriedUntil:` or `exclude:` lines ever appear in it.

A basic fence:

```osmosis
id: sdfen001

Which knot makes a fixed loop that will not slip?
***
A bowline
```

A bidi fence (two cards: forward and reverse, each with its own schedule):

```osmosis
id: sdfen002
bidi: true

Port
***
The left side of a boat, facing forward
```

A two-group cloze fence (two cards, `c1` and `c2`):

```osmosis
id: sdfen003

To reef a sail, tie in the ==c1:reef points== and haul down the ==c2:reefing line==.
```

An old fence that already holds a review in its header (due in the past, so it
is studiable). Its first sidecar write copies that review into the sidecar;
after that the header lines below are stale and ignored, and stay as they are.

```osmosis
id: sdfen004
due: 2026-11-20T09:00:00.000Z
stability: 4.2000
difficulty: 5.1000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-16T09:00:00.000Z
learningSteps: 0

Which way does a clove hitch slip under load?
***
Along the spar, unless backed up with a half hitch
```
