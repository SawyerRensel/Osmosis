---
osmosis-cards: true
osmosis-deck: tests/coloured-clozes
---

# Coloured clozes

A highlight cloze takes its colour from the emoji straight after `==`. The
answer is the text without the emoji. Every fence below has an `id:` and no
schedule, so all of its cards are new and studyable.

## One cloze per colour

```osmosis
id: colcl-red

The harbour light on the left is ==🔴red==.
```

```osmosis
id: colcl-orange

A buoy marking a hazard is ==🟠orange==.
```

```osmosis
id: colcl-yellow

A caution flag at the club is ==🟡yellow==.
```

```osmosis
id: colcl-green

The light on the starboard side is ==🟢green==.
```

```osmosis
id: colcl-blue

Shallow water on the chart is shaded ==🔵blue==.
```

```osmosis
id: colcl-purple

The racing mark on the sample course is ==🟣purple==.
```

## Plain, for comparison

```osmosis
id: colcl-plain

The tide table lists the ==high water== time and the ==low water== time.
```

## Mixed in one fence

Three clozes, three cards: red, plain, and blue. Each card blanks one and shows
the other two as highlights in their own colour.

```osmosis
id: colcl-mixed

The ==🔴bow== leads, the ==stern== follows, and the ==🔵keel== sits below.
```

## Edge cases

An emoji mid-text, a non-colour emoji, and a group label beside a colour. The
first two must stay plain clozes with the emoji left in the text; the third
makes one card with two blanks (red and green).

```osmosis
id: colcl-edge

Stop at the ==red 🔴 buoy== and keep the ==⭐ star mark== to port.
```

```osmosis
id: colcl-group

The ==🔴c1:port== side and the ==c1:🟢starboard== side share one card.
```
