---
osmosis-cards: true
osmosis-deck: Testing/Study Tab
---

# Study tab (T91)

Sequential study now opens as a tab rather than a modal. Every card in this
note is new or already due, so the whole deck is studyable: the dashboard row
**Testing › Study Tab** should read 6 waiting.

What each card exercises:

1. **Bowline** — a plain card, already due. Press `1`–`4` after flipping.
2. **Tall chart** — a 600×1800 image. It should be readable at full width and
   scroll with the card, with the buttons still pinned to the bottom of the tab.
3. **Long answer** — a back long enough to scroll; nothing should be clipped.
4. **Type-in** — `Enter` checks the answer; letter keys (`e`, `g`) must type
   into the box rather than excluding the card or opening the note.
5. **Cloze** — the answer fills in place.
6. **Learning step** — rate it **Again** to see the "Waiting for next card"
   screen and its countdown.

## Bowline (due)

```osmosis
id: st-bowline
due: 2026-11-10T09:00:00.000Z
stability: 3.2000
difficulty: 5.5000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-06T09:00:00.000Z
learningSteps: 0

Which knot makes a fixed loop at the end of a line?
***
A **bowline**.
```

## Tall chart (due)

```osmosis
id: st-chart
due: 2026-11-12T09:00:00.000Z
stability: 2.4000
difficulty: 6.1000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-09T09:00:00.000Z
learningSteps: 0

What is the last item on the harbour pilotage chart?

![[study-tab-tall-chart.svg]]
***
The **lighthouse** (item 24).
```

## Long answer (new)

```osmosis
id: st-points

What are the points of sail, from closest to the wind to dead downwind?
***
1. **In irons** — head to wind; the sails luff and the boat stops.
2. **Close-hauled** — as close to the wind as the boat will sail, sails sheeted
   hard in.
3. **Close reach** — a little further off the wind, sails eased slightly.
4. **Beam reach** — wind across the beam; usually the fastest point of sail.
5. **Broad reach** — wind on the quarter, sails well out.
6. **Running** — wind from dead astern; watch for an accidental gybe.

Each step away from the wind means easing the sheets; each step towards it
means trimming them in. A boat that is pointing too high stalls; one that bears
away too far without easing loses drive and heels. Practise the sequence on a
calm day before relying on it in a breeze.
```

## Type-in (new)

```osmosis
id: st-typein
type-in: true

What is the left-hand side of a boat called, facing forward?
***
Port
```

## Cloze (new)

```osmosis
id: st-cloze

A ==c1:spring line== stops a moored boat surging fore and aft.
```

## Learning step (new)

```osmosis
id: st-learn

What does a flashing yellow light on a buoy usually mark?
***
A **special mark** — a spoil ground, cable, or similar.
```
