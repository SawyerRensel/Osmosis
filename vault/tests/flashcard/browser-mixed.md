---
osmosis-cards: true
osmosis-deck: geography
osmosis-schedule:
  os-brwln01:
    due: 2026-08-08T11:33:45
    stability: 1.2931
    difficulty: 5.1122
    lastReview: 2026-08-08T11:27:45
    reps: 1
    lapses: 0
    state: learning
    learningSteps: 0
  os-brwln02:
    due: 2026-08-08T11:37:46
    stability: 2.3065
    difficulty: 2.1181
    lastReview: 2026-08-08T11:27:46
    reps: 1
    lapses: 0
    state: learning
    learningSteps: 1
  os-brwln03:
    due: 2026-08-16T11:27:47
    stability: 8.2956
    difficulty: 1
    lastReview: 2026-08-08T11:27:47
    reps: 1
    lapses: 0
    state: review
    learningSteps: 0
  os-brwln04:
    due: 2026-08-08T11:28:48
    stability: 0.212
    difficulty: 6.4133
    lastReview: 2026-08-08T11:27:48
    reps: 1
    lapses: 0
    state: learning
    learningSteps: 0
---

# Rivers and Borders

One note that expands into many browser rows: an explicit card, a
bidirectional card, a cloze card with two groups, a code cloze, a suspended
fence, and several line cards.

## Explicit

```osmosis
id: brw-basic1
due: 2026-08-08T15:28:39.822Z
stability: 0.2120
difficulty: 6.4133
reps: 1
lapses: 0
state: learning
last-review: 2026-08-08T15:27:39.822Z
learning-steps: 0

Which river flows through ten countries, more than any other?
***
The Danube
```

## Bidirectional

```osmosis
id: brw-bidi01
bidi: true
due: 2026-08-08T15:33:41.416Z
stability: 1.2931
difficulty: 5.1122
reps: 1
lapses: 0
state: learning
last-review: 2026-08-08T15:27:41.416Z
learning-steps: 0
r-due: 2026-08-08T15:37:42.102Z
r-stability: 2.3065
r-difficulty: 2.1181
r-reps: 1
r-lapses: 0
r-state: learning
r-last-review: 2026-08-08T15:27:42.102Z
r-learning-steps: 1

Longest river in Africa
***
The Nile
```

## Cloze, two groups

```osmosis
id: brw-cloze1
c1-due: 2026-08-16T15:27:43.010Z
c1-stability: 8.2956
c1-difficulty: 1.0000
c1-reps: 1
c1-lapses: 0
c1-state: review
c1-last-review: 2026-08-08T15:27:43.010Z
c1-learning-steps: 0
c2-due: 2026-08-08T15:28:45.012Z
c2-stability: 0.2120
c2-difficulty: 6.4133
c2-reps: 1
c2-lapses: 0
c2-state: learning
c2-last-review: 2026-08-08T15:27:45.012Z
c2-learning-steps: 0

The ==Danube== rises in the Black Forest and empties into the ==Black Sea==.
```

## Code cloze

````osmosis
id: brw-code01
exclude: true

```python
def river_length(name):
    return LENGTHS[name]  # osmosis-cloze
```
````

## Suspended fence

This one carries `exclude: true`. It should stay out of study and out of every
deck count, but still be reachable — and unsuspendable — from the browser.

```osmosis
id: brw-susp01
exclude: true

Which strait separates Europe from Asia at Istanbul?
***
The Bosphorus
```

## Line cards

- The Amazon carries more water than the next seven rivers combined. ^os-brwln01
- The Caspian Sea is the largest inland body of water on Earth. ^os-brwln02
- The Congo is the deepest river, reaching over 200 metres. ^os-brwln03
- Lake Baikal holds roughly a fifth of the world's unfrozen fresh water. ^os-brwln04
