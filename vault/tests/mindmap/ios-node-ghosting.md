---
osmosis-cards: true
osmosis-deck: Testing/iOS Ghosting
osmosis-schedule:
  os-iosline1:
    due: 2026-08-13T20:44:31
    stability: 0.7144
    difficulty: 8.5061
    lastReview: 2026-08-13T20:34:31
    reps: 4
    lapses: 1
    state: relearning
    learningSteps: 0
  os-iosline2:
    due: 2026-08-13T20:44:46
    stability: 0.6342
    difficulty: 8.6047
    lastReview: 2026-08-13T20:34:46
    reps: 3
    lapses: 1
    state: relearning
    learningSteps: 0
  os-iosline3:
    due: 2026-08-13T20:44:48
    stability: 0.8262
    difficulty: 8.3746
    lastReview: 2026-08-13T20:34:48
    reps: 5
    lapses: 1
    state: relearning
    learningSteps: 0
---

# Map projections ^os-iosline1

Every node below is a node type that WebKit hands its own compositing layer.
On iOS before the fix, each one welded itself to the screen at the position and
the zoom it was first painted at, and stayed there while the map panned away
underneath it. Open this note in Mind Map View, drag the map a long way in one
direction, and watch what each node does: **all of them must travel with the
map, and none may leave a copy behind.**

## Callout — the `mix-blend-mode` case

> [!warning] Distortion is unavoidable
> No flat map preserves area, shape, distance and direction at once. Every
> projection gives up at least one of them, so the honest question is which
> property the map is for.

## Code fence — the `overflow-x: auto` case

The line is deliberately too wide for the node, so the `<pre>` wants a scroller.
On iOS the fence is now clipped instead of scrollable; that is the trade.

```python
def mercator_y(latitude_deg, radius=6378137.0):
    return radius * math.log(math.tan(math.pi / 4 + math.radians(latitude_deg) / 2))
```

## Table — the wide-content case

| Projection    | Preserves | Distorts        | Typical use        |
| ------------- | --------- | --------------- | ------------------ |
| Mercator      | Angle     | Area at latitude| Marine navigation  |
| Albers        | Area      | Shape           | Regional atlases   |
| Winkel tripel | Compromise| Everything a bit| World reference    |

## Fence flashcard — the case that vanished entirely

Before the fix no fence card of any kind drew in the map: the back half carries
a fade-in animation, promotion propagates upward, and the whole node stranded.
This node must show its question, a divider, and its answer.

```osmosis
id: ios-ghost-1
due: 2026-08-14T00:44:36.456Z
stability: 1.1802
difficulty: 8.3089
reps: 4
lapses: 1
state: relearning
lastReview: 2026-08-14T00:34:36.456Z
learningSteps: 0

Which projection preserves angles at the cost of area?
***
Mercator.
```

## Line cards — the reveal-animation case

These three are due, so Peek and Study both have something to reveal here. ^os-iosline2

Each reveal used to strand the node it uncovered, and the rating bubble smeared
across the map as it panned. ^os-iosline3

## Video embed — the case no CSS could reach

A YouTube `<iframe>` is composited unconditionally in WebKit; no property opts
it out, so the old CSS approach listed this node as a known limitation. If it
travels with the map now, the fix is structural rather than another lucky
suppression.

![https://www.youtube.com/watch?v=Hm3JodBR-vs](https://www.youtube.com/watch?v=Hm3JodBR-vs)
