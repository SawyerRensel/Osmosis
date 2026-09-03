---
title: Anchor rating buttons under the revealed occlusion shape
summary: On an occlusion card, put Again/Hard/Good/Easy directly beneath the shape just revealed, the way spatial study anchors them beneath a node
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Sequential study as a view instead of a modal]]"
  - "[[Larger zoomable images during review]]"
  - "[[Peek mode image occlusion click each shape to reveal]]"
status: Ideas
priority:
progress_current:
progress_total:
date_created: "2026-09-03T01:47:54.000Z"
date_modified: "2026-09-03T01:47:54.000Z"
date_start_scheduled:
date_start_actual:
date_end_scheduled:
date_end_actual:
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

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

When an occlusion card is revealed, render the Again/Hard/Good/Easy buttons
**directly underneath the revealed shape**, floating over the image, instead of
in the fixed bar at the bottom of the study surface.

The model already exists: spatial study in mind map view anchors a rating bubble
below the node just answered — `MindMapView.ensureRatingBubble`
(`src/views/MindMapView.ts:1481`) positions a `foreignObject` at
`node.rect.y + node.rect.height + 6`, at least 240px wide, centred on the node.
Same idea, with the target group's bounding box standing in for the node's rect.

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

On a tall image the answer and the rating buttons end up far apart. You reveal a
line near the top of a 1191×3401 page, then have to travel to the bottom of the
surface to rate it, then travel back for the next card — and on a phone that is a
scroll, not a glance. The reporter in
[issue #34](https://github.com/SawyerRensel/Osmosis/issues/34) described the same
cost in terms of "following the lines" to find where the answer was.

Worth being precise about what is *already* right, so it doesn't get "fixed":
**the occlusion answer already reveals in place.** `renderOcclusionSide`
(`src/views/SequentialStudyModal.ts:333`, and the comment at line 418) redraws
the same image with the target mask outlined instead of filled, rather than
appending a second copy of the picture below the first. So the mask genuinely
does just disappear where it stood. What is still far away is the *rating
control*, and that is what this note is about.

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*

Scroll down, rate, scroll back. Or use the `1`–`4` keyboard shortcuts, which is
no help on mobile.

## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

See the reporter's masked page in
[issue #34's first comment](https://github.com/SawyerRensel/Osmosis/issues/34#issuecomment-5484691941).

---

## Design

### Where the anchor comes from

Everything needed is already pure and tested:

- `shapeBox(shape)` (`src/study/occlusion-geometry.ts:138`) — a shape's bounding
  box in normalised 0–1 image space, for rect, ellipse, and poly alike
- `unionBox(boxes)` (line 755) — the box around a whole group, since a card's
  target is a *group* and may be several shapes
- the target group is whichever shapes `maskElements` gave role `target`
  (`src/study/occlusion-masks.ts:78`)

So: union the target group's boxes → anchor at `left: x·100%`, `top: (y + h)·100%`
of `.osmosis-occlusion`, which is already `position: relative` and shrink-to-fit
around the image (`styles.css:1401`). No measurement, no resize listener — the
same property that lets masks survive resizing lets the bubble do it too.

The bubble itself is styled already: `.osmosis-contextual-rating` is shared by
the note-view bubble (`LineRevealProcessor.showRatingBubble`,
`src/views/LineRevealProcessor.ts:464`) and the spatial one, with the colour
rules at `styles.css:1795+`. Reuse the class; do not invent a third look.

### The cases the geometry has to survive

- **Group near the bottom edge** — the bubble would hang off the image, or be
  clipped by the scroll surface. Flip it *above* the shape, as tooltips do.
- **Group near the left or right edge** — the bubble is ~240px wide and the shape
  may be 20px. Clamp horizontally into the image's box rather than centring
  blindly.
- **A group whose shapes are scattered across the whole picture** — the union box
  is then most of the image and "underneath" is meaningless. Fall back to the
  fixed bar past some size threshold.
- **A tiny image** where 240px of buttons is wider than the picture.
- **Zoom and pan**, once [[Larger zoomable images during review]] lands — the
  bubble is positioned in percentages of the wrapper, so it should scale with it;
  confirm it does not also *scale in size*, which would be wrong.
- **`hide-one-guess-one` mode**, where no other mask is painted, so the bubble has
  no visual context to sit against.

### Decisions to make

- **Does the fixed bar go away, or stay as a fallback?** Recommend: keep the
  fixed bar for non-occlusion cards (there is no shape to anchor to), and use the
  anchored bubble only when `card.occlusion` is set — which is exactly the
  branch `renderOcclusionSide` already keys off.
- **Which surfaces?** Sequential first, since that is where the fixed bar lives.
  Note-view study already uses an anchored bubble for line cards, so occlusion
  cards there should match. Spatial study already anchors to the node — decide
  whether an occlusion inside a node anchors to the *shape* or stays on the node.
- **Does the bubble block the answer?** It sits under the shape it revealed, so
  it will cover whatever is immediately below — likely the next line of the same
  page. Offset, translucency, or dismissal after rating all worth trying.

### Surface map (expected)

| File | Change |
|---|---|
| `src/study/occlusion-geometry.ts` | Helper for "box of the target group", plus the edge-flip/clamp arithmetic — pure, and unit-tested here rather than in the view, since Vitest cannot import `obsidian` |
| `src/views/OcclusionRenderer.ts` | Expose the target group's box (or an anchor slot) to callers; it already knows the roles |
| `src/views/SequentialStudyModal.ts` | `renderOcclusionSide` (~333) / `flip` (~418) mount the anchored bubble instead of showing `ratingBar` |
| `src/views/ContextualStudyProcessor.ts`, `src/views/LineRevealProcessor.ts` | Note-view occlusion cards, to match |
| `styles.css` | New anchored-bubble rules next to `.osmosis-spatial-rating` / `.osmosis-contextual-rating` (~1795) |

### Test plan

- Unit: anchor arithmetic in `occlusion-geometry.test.ts` — bottom edge flips up,
  side edges clamp, scattered group falls back, single-shape group centres.
- DOM: extend `OcclusionRenderer.dom.test.ts`.
- Fixture: an image with target groups at top-left, bottom-right, dead centre, and
  one scattered group, in `e2e/fixtures/` → `vault/`. Back-date the cards so they
  are due, and reload Obsidian after writing the fixture — the vault is live, and
  a note Obsidian holds open silently reverts a rewrite from disk.
- Manual: reveal each group in turn on phone and desktop; buttons land under the
  shape, stay on screen, and rate the right card; `1`–`4` still work; the fixed
  bar still appears for ordinary cards.
