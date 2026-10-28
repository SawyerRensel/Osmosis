---
osmosis-cards: true
osmosis-deck: Engineering/Width
osmosis-schedule:
  os-widthl1:
    occlude:
      mode: hide-all-guess-one
      shapes:
        - group: c1
          kind: rect
          x: 0.3163
          y: 0.865
          w: 0.115
          h: 0.075
        - group: c2
          kind: rect
          x: 0.0413
          y: 0.865
          w: 0.155
          h: 0.075
---

# Image occlusion — embed width

Every diagram below is embedded with a `|width`. In study mode each must stay
the size it is in reading view and live preview — not grow to full width.

## Line card at 250 px

![[span-elevation.svg|250]] ^os-widthl1

## Fence card at 300 px

```osmosis
id: width-fence
occlude:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.1188
      y: 0.5225
      w: 0.1375
      h: 0.08
    - group: c2
      kind: ellipse
      x: 0.825
      y: 0.56
      rx: 0.065
      ry: 0.05

Name the marked parts of the section.
![[bridge-cross-section.svg|300]]
```

## Fence card with no width (control)

```osmosis
id: width-control
occlude:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.1188
      y: 0.5225
      w: 0.1375
      h: 0.08

The same section at its natural size.
![[bridge-cross-section.svg]]
```
