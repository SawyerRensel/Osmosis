---
osmosis-cards: true
osmosis-deck: Testing/Rating Bar
osmosis-schedule:
  os-rbar01:
    due: 2026-11-20T09:00:00
    stability: 6.1
    difficulty: 5.2
    lastReview: 2026-11-14T09:00:00
    reps: 3
    lapses: 0
    state: review
    learningSteps: 0
---

# One rating bar (T136)

Every study surface draws the same rating bar: Again / Hard / Good / Easy, each
with the interval it would schedule above its label, in the dark rounded panel
the flashcard study tab uses. Keys **1–4** rate everywhere.

Every card here is new or already due. The deck **Testing › Rating Bar** should
read **2 | 0 | 4** (new | learn | due):

| Card | Carrier | Bucket | Good shows |
|---|---|---|---|
| Starboard (line) | osmosis-schedule frontmatter | due | about 1mo |
| Close-hauled (line) | none yet | new | 10m |
| Bowline (fence) | fence header | due | about 25d |
| Galley cloze, c1 | fence header, nested | due | about 1.5mo |
| Galley cloze, c2 | fence header, nested | due | about 13d |
| Jib (line) | none yet | new | 10m |

With the default scheduler settings a new card's bar reads `1m 6m 10m 8d`, and
a review card's reads `10m` over Again and days or months over the rest. The
exact figures drift a little with the day you test on.

## Line cards

- A sailing vessel's right-hand side, facing forward, is starboard. ^os-rbar01
- Sailing as close to the wind as the boat will go is close-hauled. ^os-rbar02
- The jib is the triangular sail set ahead of the mast. ^os-rbar03

## Bowline

```osmosis
id: rbar-bowline
due: 2026-11-16T09:00:00.000Z
stability: 3.8000
difficulty: 5.4000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-12T09:00:00.000Z
learningSteps: 0

Which knot makes a fixed loop that will not slip?
***
The bowline.
```

## Galley cloze

Two groups, each its own card with its own schedule. Each question's bar shows
that group's own intervals: `1/2` (c1) has the longer stability, so its Good
reads further out than `2/2`'s.

```osmosis
id: rbar-galley
c1:
  due: 2026-11-18T09:00:00.000Z
  stability: 9.5000
  difficulty: 4.8000
  reps: 3
  lapses: 0
  state: review
  lastReview: 2026-11-08T09:00:00.000Z
  learningSteps: 0
c2:
  due: 2026-11-22T09:00:00.000Z
  stability: 2.4000
  difficulty: 6.6000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-11-19T09:00:00.000Z
  learningSteps: 0

A ==c1:roux== is equal parts ==c2:flour== and fat, cooked together.
```
