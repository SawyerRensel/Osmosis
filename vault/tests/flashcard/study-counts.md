---
osmosis-cards: true
osmosis-deck: Testing/Study Counts
---

# Study counts (T92)

The sequential study tab shows Anki's three counts above the card:
**new** (blue) | **learn** (red) | **due** (green). The bucket of the card on
screen is underlined, and that card counts in its own bucket.

Every card here is new or already due. At session start the dashboard row
**Testing › Study Counts** and the strip should both read **2 | 2 | 3**:

| Card | Kind | Bucket |
|---|---|---|
| Mirepoix | review, due | due |
| Roux | review, due | due |
| Brunoise | review, due | due |
| Blanching | learning, due | learn |
| Emulsion | relearning, due | learn |
| Deglazing | new | new |
| Julienne | new | new |

The tab shows due and learning cards first (oldest due first), then new ones.

## Mirepoix (review)

```osmosis
id: sc-mirepoix
due: 2026-11-08T09:00:00.000Z
stability: 4.1000
difficulty: 5.2000
reps: 3
lapses: 0
state: review
lastReview: 2026-11-04T09:00:00.000Z
learningSteps: 0

Which three vegetables make a classic mirepoix?
***
Onion, carrot and celery.
```

## Roux (review)

```osmosis
id: sc-roux
due: 2026-11-10T09:00:00.000Z
stability: 3.6000
difficulty: 5.8000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-06T09:00:00.000Z
learningSteps: 0

What is a roux made from?
***
Equal weights of fat and flour, cooked together.
```

## Brunoise (review)

```osmosis
id: sc-brunoise
due: 2026-11-12T09:00:00.000Z
stability: 2.9000
difficulty: 6.0000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-09T09:00:00.000Z
learningSteps: 0

How big is a brunoise dice?
***
About 3 mm on each side.
```

## Blanching (learning)

```osmosis
id: sc-blanch
due: 2026-11-14T09:00:00.000Z
stability: 0.4000
difficulty: 6.4000
reps: 1
lapses: 0
state: learning
lastReview: 2026-11-14T08:59:00.000Z
learningSteps: 1

Why plunge vegetables into ice water after blanching?
***
To stop the cooking and set the colour.
```

## Emulsion (relearning)

```osmosis
id: sc-emulsion
due: 2026-11-15T09:00:00.000Z
stability: 1.1000
difficulty: 7.0000
reps: 4
lapses: 1
state: relearning
lastReview: 2026-11-15T08:50:00.000Z
learningSteps: 0

What holds a mayonnaise emulsion together?
***
The lecithin in the egg yolk.
```

## Deglazing (new)

```osmosis
id: sc-deglaze

What does deglazing a pan lift into the sauce?
***
The browned bits (the fond) stuck to the bottom of the pan.
```

## Julienne (new)

```osmosis
id: sc-julienne

What shape is a julienne cut?
***
Thin matchsticks, about 2 mm × 2 mm × 5 cm.
```
