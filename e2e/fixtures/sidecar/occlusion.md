---
osmosis-cards: true
osmosis-deck: Testing/Sidecar occlusion
---

# Sidecar occlusion shapes (T133)

This note starts with **no Osmosis data** in its properties, so with *Data
location* set to **Sidecar file** (the default) it is a sidecar-mode note.
In sidecar mode, occlusion shapes live in the sidecar's `osmosis-fences`
entry for the fence (in `Osmosis/Schedule/`), under `occlude` (an unlabelled
embed) or `occlude-a` / `occlude-b` (the embed marked `{a}` / `{b}`).

Every card here is new, so nothing needs back-dating.

## Fence 1: shapes still in the header (no sidecar entry yet)

Expected before any write: **two** cards, `sdocc001-c1` and `sdocc001-c2`,
masked from the header below. Open the occlusion editor on the flag, move a
mask and save: the sidecar gains `osmosis-fences.sdocc001` holding **both**
sets (`occlude-a` as edited, `occlude-b` copied from the header), and this
fence's text does **not** change. From then on the header's shape blocks are
ignored: they stay in the note as stale text until *Move to sidecar* (T128)
strips them.

```osmosis
id: sdocc001
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.1
      y: 0.1
      w: 0.35
      h: 0.35
occlude-b:
  mode: hide-one-guess-one
  shapes:
    - group: c2
      kind: ellipse
      x: 0.5
      y: 0.5
      rx: 0.2
      ry: 0.2

Name the signal flags.
![[flag-alpha.svg]]{a}
![[flag-bravo.svg]]{b}
```

## Fence 2: no shapes yet

Expected before any write: **no** occlusion cards (the fence renders as plain
content). Open the occlusion editor on the flag and draw two masks in
different groups: the sidecar gains `osmosis-fences.sdocc002.occlude` and the
fence text below stays exactly as it is (no `occlude:` block appears). Two
cards appear, `sdocc002-c1` and `sdocc002-c2`.

```osmosis
id: sdocc002

Which flag is this?
![[flag-echo.svg]]
```
