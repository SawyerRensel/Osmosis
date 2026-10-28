---
osmosis-cards: true
osmosis-deck: Engineering/Anchored
osmosis-schedule:
  os-sheet01:
    occlude:
      mode: hide-all-guess-one
      shapes:
        - group: c1
          kind: rect
          x: 0.05
          y: 0.05
          w: 0.27
          h: 0.025
        - group: c2
          kind: rect
          x: 0.59
          y: 0.932
          w: 0.38
          h: 0.022
        - group: c3
          kind: rect
          x: 0.05
          y: 0.193
          w: 0.6
          h: 0.022
        - group: c3
          kind: rect
          x: 0.05
          y: 0.865
          w: 0.6
          h: 0.022
---

# Image occlusion — rating buttons anchored under the revealed shape

Fixture for *Anchor rating buttons under the revealed occlusion shape*. Reset
this file from `e2e/fixtures/` between runs, then **reload Obsidian (Ctrl+R)**
before testing — a note Obsidian holds open silently reverts a rewrite.

Every card here is **new**, so all of them are studiable.

In **note view** study, on the answer side of an occlusion card,
Again/Hard/Good/Easy should float just under the group that was revealed instead
of in the card's bottom row. Where "under it" means nothing, the old placement
stays. **Sequential** keeps its fixed rating bar for every card — but its
diagram must keep its proportions, with every mask on the word it covers.

## Fence card — one tall page, five groups

```osmosis
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.05
      y: 0.05
      w: 0.27
      h: 0.025
    - group: c2
      kind: rect
      x: 0.3
      y: 0.47
      w: 0.4
      h: 0.022
    - group: c3
      kind: rect
      x: 0.59
      y: 0.932
      w: 0.38
      h: 0.022
    - group: c4
      kind: rect
      x: 0.875
      y: 0.295
      w: 0.1
      h: 0.025
    - group: c5
      kind: rect
      x: 0.05
      y: 0.193
      w: 0.6
      h: 0.022
    - group: c5
      kind: rect
      x: 0.05
      y: 0.865
      w: 0.6
      h: 0.022

![[inspection-sheet.svg]]{a}
```

| Group | Where | Expected buttons |
|---|---|---|
| `c1` | Top-left, the word "Inspection" | Under it, pinned to the image's left edge |
| `c2` | Dead centre, row 11 | Centred under it |
| `c3` | Bottom-right, the signature | **Above** it — no room below |
| `c4` | Right edge, "OK" | Under it, pinned to the image's right edge |
| `c5` | Rows 2 and 24, far apart | The usual bar / bottom row — scattered |

## Fence card — the same page shrunk to 150px

```osmosis
occlude-a:
  mode: hide-one-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.875
      y: 0.295
      w: 0.1
      h: 0.025

![[inspection-sheet.svg|150]]{a}
```

The buttons are wider than the picture: they start at its left edge and run
past its right, at their normal size.

## Line card — occluded, three groups

![[inspection-sheet.svg]] ^os-sheet01

`c1` top-left (under), `c2` the signature (above), `c3` scattered (under the
line, below the whole picture, as before).

## Ordinary card — the control

```osmosis
What does a scour survey measure at a pier?
***
How deep the riverbed has eroded around its foundation.
```

No diagram, so its rating stays in the fixed bar.
