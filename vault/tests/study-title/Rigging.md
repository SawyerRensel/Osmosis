---
osmosis-cards: true
osmosis-deck: Rigging
osmosis-schedule:
  os-rigocc1:
    occlude:
      mode: hide-one-guess-one
      shapes:
        - group: c1
          kind: rect
          x: 0.3163
          y: 0.865
          w: 0.115
          h: 0.075
  os-mastoc1:
    occlude:
      mode: hide-one-guess-one
      shapes:
        - group: c1
          kind: rect
          x: 0.0413
          y: 0.865
          w: 0.155
          h: 0.075
---

# Rigging

T109 fixture. The deck, the file and the H1 all say **Rigging**, so the word
must appear exactly once while studying: in the tab title. Every card is new or
overdue, so the deck reads 5 waiting. Reset this file from `e2e/fixtures/`
between runs, then reload Obsidian.

![[span-elevation.svg]] ^os-rigocc1

The occluded line above sits straight under the H1, so its lead-in
("Rigging › Rigging") only repeats the tab title: no lead-in on either side,
and the diagram must not move when the answer shows.

```osmosis
id: rg-halyard
due: 2026-11-10T09:00:00.000Z
stability: 3.2000
difficulty: 5.5000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-06T09:00:00.000Z
learningSteps: 0

Which line hoists a sail?
***
The **halyard**.
```

```osmosis
id: rg-chart
due: 2026-11-12T09:00:00.000Z
stability: 2.4000
difficulty: 6.1000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-09T09:00:00.000Z
learningSteps: 0

Tall card: scroll it. The progress strip stays pinned and the chart fades
under it. What is the last item on the chart?

![[study-tab-tall-chart.svg]]
***
The **lighthouse** (item 24).
```

## Mast

![[span-elevation.svg]] ^os-mastoc1

This occluded line sits under **Mast**, so both sides lead in with "Mast" and
nothing moves on reveal.

- The shrouds hold the mast up from the sides ^os-rigline
