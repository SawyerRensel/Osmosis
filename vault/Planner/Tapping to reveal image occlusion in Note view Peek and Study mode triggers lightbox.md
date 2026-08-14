---
title: Tapping to reveal image occlusion in Note view Peek and Study mode triggers lightbox
summary: It does reveal the card, but you have to tap out of the lightbox to see the answer and rate the card.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-13T19:19:11.503Z
date_modified: 2026-08-14T01:25:21.648Z
date_start_scheduled: 2026-08-13T21:34:21-04:00
date_start_actual: 2026-08-13T21:34:21-04:00
date_end_scheduled: 2026-08-13T21:50:42-04:00
date_end_actual: 2026-08-13T21:50:42-04:00
pull_request: https://github.com/SawyerRensel/Osmosis/pull/26
all_day: false
repeat_frequency:
repeat_interval:
repeat_until:
repeat_count:
repeat_byday:
repeat_bymonth:
repeat_bymonthday:
repeat_bysetpos:
repeat_completed_dates:
parent:
children:
blocked_by:
cover:
color:
---
# Bug Report

## Environment

| Field            | Value           |
| ---------------- | --------------- |
| Platform         | Mobile          |
| Operating System | Obsidian 1.13   |

## What happened?

*What actually happened? Describe what went wrong.*

Tapping an image triggers the new lightbox in Obsidian 1.13.  You have to tap to escape to see the shapes/annotations again and rate the card, then repeat.

​![](Screenshot_20260813-113138%201.png)

## What should have happened?

*What did you expect to happen instead?*

The tap uncovers the masks and the rating buttons are reachable straight away.
No viewer opens over the card.

Worse than the annoyance, and not noticed until the cause was found: the viewer
was showing the **unmasked** picture. It clones the `<img>` and the masks are a
sibling SVG, so what popped up over the covered card was the answer with every
label legible — a cheat button on every occlusion card.

## Where is this file located?

*Paste the filepath location  (if the bug occurred in a test file)*

`vault/tests/flashcard/occlusion-surfaces.md` reproduces it; first seen in a
personal note.

## Steps to Reproduce

### 1. Start from

(e.g. new scene / open file link)  *Attach a screenshot for this step*

A note in reading view holding an occluded diagram — a line card or a fence.

### 2. Prep/settings

(e.g. setting/value changes)  *Attach a screenshot for this step* 

Mobile, Obsidian 1.13.

### 3. Do this

(e.g. click this button)  *Attach a screenshot for this step*

Turn on Peek, or start study, from the note's header actions.

### 4. Trigger

Describe the last action you took before the problem  *Attach a screenshot for this step*

Tap the covered diagram to reveal it.

## What was implemented

### Where it shipped

[PR #26](https://github.com/SawyerRensel/Osmosis/pull/26), branch
`fix/occlusion-tap-opens-image-viewer`, merged into `release/0.0.4`.

### The cause

Obsidian delegates a click on **any `img`** to its image viewer — in 1.12.7's
`obsidian.asar` it is literally `t.on("click","img,video",a)`, and the handler
does `e.cloneNode()` into a `mobile-image-viewer` div.

Two things follow, and the second is the one that matters:

1. Our reveal handler sits on an **ancestor** of the image (the line's
   placeholder), so the tap did both jobs — the card revealed *and* the viewer
   opened over it. Hence "it does reveal the card, but you have to tap out".
2. The viewer clones the `<img>` **alone**. Masks are a sibling SVG pinned over
   the image, exactly as the renderer is built, so they do not travel with the
   clone. The pop-up was the unoccluded picture: the answer, on top of the card
   still asking the question. The screenshot in this note shows it — every label
   readable in the viewer, masks still down behind it.

So this was never really a lightbox bug. It was an answer leak with a lightbox
attached.

### The fix

`paintMasks` toggles `is-covered` on the wrapper whenever any painted mask still
hides something, and the stylesheet takes such an image out of hit testing:

```css
.osmosis-occlusion.is-covered > img { pointer-events: none; }
```

The tap then lands on the `.osmosis-occlusion` wrapper instead — which is where
the study surfaces are already listening — and Obsidian's `img` selector never
matches, so no viewer and no clone to leak through.

### Decisions worth remembering

- **The marker goes on the wrapper, not the image.** `overlayMasks` wraps
  images the *note* rendered, which carry none of our classes, so
  `.osmosis-occlusion-image` would have missed the line surface entirely — the
  one the bug was reported against. Selecting `.is-covered > img` covers every
  surface at once: line peek and study, contextual fences, the sequential modal,
  and mind-map nodes.
- **`pointer-events`, not `preventDefault()`.** Obsidian's handler does bail on
  `defaultPrevented`, so preventing the default in each reveal handler would
  also have worked — but it depends on minified internals staying as they are,
  and it would have needed repeating in four surfaces. Taking the image out of
  hit testing is a DOM-level guarantee and lives in one place. If a future
  Obsidian delegates on `.image-embed` rather than `img`, that assumption
  breaks and `preventDefault` + `stopPropagation` in the reveal handlers is the
  fallback.
- **An uncovered diagram keeps the viewer.** `all-revealed` and `none` — reading
  view's answer copy below the rule, an unoccluded neighbour in the same fence —
  leak nothing, because what the viewer would show is what is already on screen.
  Zooming a diagram is genuinely useful on a phone, so it is only withheld while
  it would give the answer away. Do not "simplify" this into blanking the viewer
  on all occlusion images.
- **`classList.toggle`, not Obsidian's `toggleClass`.** The DOM test polyfills
  Obsidian's element helpers by hand and does not have `toggleClass`; plain
  `classList` needs no polyfill and reads the same.
- Note that on the `hide-one-guess-one` **back** side nothing is covered — the
  target is ringed and the siblings are untouched — so the answer side of such a
  card is tappable again. That is the rule working as intended, not an oversight.

### Surface map

| File | Change |
| --- | --- |
| `src/views/OcclusionRenderer.ts` | `paintMasks` hoists its mask elements and toggles `is-covered` from their roles |
| `styles.css` | `.osmosis-occlusion.is-covered > img { pointer-events: none }`, with the reasoning above it |
| `src/views/OcclusionRenderer.dom.test.ts` | Three tests for the marker, including that a repaint clears it; one existing assertion loosened off exact `className` equality |

### Test fixture

`vault/tests/flashcard/occlusion-surfaces.md` — the line card `os-elevat1` and
the `surface-parts` fence, each verified in peek and in study, plus the
regression check that an uncovered diagram in plain reading view still opens the
viewer.

### Follow-ups

None. The mind map and the sequential modal were carried by the same rule rather
than left for later.