---
title: Larger zoomable images during review
summary: Images in review should use the whole study surface and be pinch-zoomable, so a tall occluded page is readable on a phone
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Sequential study as a view instead of a modal]]"
  - "[[Support zoom in sequential mode]]"
  - "[[Anchor rating buttons under the revealed occlusion shape]]"
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

Two changes to how an image renders while a card is being reviewed, on **every**
study surface — sequential, note view (Peek and Study), and mind map spatial
study:

1. **Size to the surface.** Drop the flat `max-height: 50vh` cap on study-card
   images (`styles.css:1308`) in favour of letting the image take the space the
   card actually has.
2. **Zoom and pan.** Pinch-zoom on mobile, `Ctrl`+wheel on desktop, with the
   image pannable once it is larger than its frame.

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

From [issue #34](https://github.com/SawyerRensel/Osmosis/issues/34): a 1191×3401
page of 17 occluded lines is unreadable on an iPhone. Two independent caps are
squeezing it — the modal's own `85vh` and the image's `50vh` — and even with the
container fixed by [[Sequential study as a view instead of a modal]], an image
with that aspect ratio still needs zoom to be legible. Sawyer hit the same thing
reviewing occlusion cards on his phone and wanted both larger-by-default and
zoom.

The zoom half overlaps the existing [[Support zoom in sequential mode]] idea
("zoom on images and text alike"). That note stays the owner of *text* zoom; this
one is images during review. Fold them if they end up sharing a gesture layer.

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*

Tapping an image in a note opens Obsidian's lightbox, which zooms — but that path
is unavailable during review of an occlusion card *by design*:
`.osmosis-occlusion.is-covered > img { pointer-events: none }`
(`styles.css:1434`) deliberately takes the image out of hit testing, because the
lightbox clones the `img` alone and leaves the sibling mask SVG behind — i.e. it
would pop up the unmasked answer over the card being asked. That was the fix for
[[Tapping to reveal image occlusion in Note view Peek and Study mode triggers lightbox]].
So review needs its own zoom; the platform's cannot be borrowed.

## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

See the reporter's masked Excalidraw page in
[issue #34's first comment](https://github.com/SawyerRensel/Osmosis/issues/34#issuecomment-5484691941)
— 1191×3401. Use it (or a fixture of the same proportions) as the test image.

---

## Design

### There is already a zoom/pan implementation to reuse

`OcclusionEditorModal` has the whole thing working, and its geometry helpers are
already pure and unit-tested in `src/study/occlusion-geometry.ts`:

- `zoomBy(zoom, factor)` (line 866) — clamped zoom stepping
- `fitWidth(stage, natural)` (line 886) — the fit-to-view baseline that zoom 1 means
- `anchoredScroll(scroll, focus, scale)` (line 901) — keeps a pinch anchored on
  the point between the fingers
- pinch bookkeeping in `OcclusionEditorModal` (~lines 135–141, 535–541)

**Zoom sets the wrapper's width; it never touches the SVG's `viewBox`** — see the
comment at `OcclusionEditorModal.ts:82`. That is load-bearing and must carry over:
masks live in a normalised 0–1 space stretched over the image with
`preserveAspectRatio="none"`, so scaling the image scales the masks with it for
free, while a `viewBox` change would desync mask from feature. Any zoom added to
the *review* surface must scale the `.osmosis-occlusion` wrapper the same way.

The honest first move is to lift that gesture handling out of the editor modal
into something both surfaces call, rather than writing a second one. Mind the
usual constraint: Vitest cannot import `obsidian`, so pure geometry belongs in
`src/study/` and only the DOM wiring belongs in `src/views/`.

### Sizing

`.osmosis-study-card img, .osmosis-study-card video { max-width: 100%;
max-height: 50vh; object-fit: contain }` (`styles.css:1308`). The `50vh` exists so
a card with two images cannot push the flip and rating rows off the bottom — that
concern is real and must be answered, not just deleted. Options worth weighing:

- keep a cap but express it against the card's own box rather than the viewport,
  now that the card is the scroll surface (`styles.css:1642`)
- cap only when the card holds more than one image
- let the image fill and rely on zoom-to-fit as the resting state, which is what
  Anki does

Note `.osmosis-occlusion .osmosis-occlusion-image` uses `object-fit: fill`, not
`contain` (`styles.css:1418`) — deliberately, so picture and masks distort
identically if ever handed a box off its aspect ratio. Do not "fix" that to
`contain` while changing sizing.

### Gestures that already exist on these surfaces

Mind map view owns a pinch-zoom/pan path already
([[Fold every platform onto the mind map's transform pan path]], [[Add inertia for pinch-zoom gesture on Mind Map view]]).
An image zoom inside a spatial-study node must not fight the canvas's own pinch —
decide which one claims a two-finger gesture that starts on an image, and make it
deliberate.

### Open questions

- Does zoom reset per card, or persist across a session? (Per card, probably —
  but a user grinding one big diagram may disagree.)
- Does the front's zoom/pan carry over to the back? For occlusion cards the two
  sides are the same picture, so keeping the viewport across the flip means the
  answer appears exactly where the user was looking — which is close to what the
  reporter's second ask was really after.
- Double-tap to zoom-to-fit as an escape hatch?

### Surface map (expected)

| File | Change |
|---|---|
| `src/study/occlusion-geometry.ts` | Reuse `zoomBy` / `fitWidth` / `anchoredScroll`; add pure helpers if the review case needs them |
| `src/views/OcclusionEditorModal.ts` | Extract its pinch/wheel handling into a shared module rather than duplicating |
| `src/views/OcclusionRenderer.ts` | Where the zoomable wrapper is applied, so all three study surfaces inherit it |
| `src/views/SequentialStudyModal.ts` | (or its view successor) hosting the zoom surface |
| `src/views/ContextualStudyProcessor.ts`, `src/views/LineRevealProcessor.ts` | Note-view Peek/Study surfaces |
| `src/views/MindMapView.ts` | Spatial study; gesture arbitration with the canvas pinch |
| `styles.css` | `.osmosis-study-card img` cap (~1308); occlusion wrapper sizing (~1401–1440) |

### Test plan

- Unit: geometry helpers already covered by `occlusion-geometry.test.ts` — extend
  rather than duplicate.
- Fixture: a note with a tall (roughly 1:3) occluded image plus a short wide one,
  in `e2e/fixtures/`, copied to `vault/`. Back-date the cards so they are due, and
  reload Obsidian after writing the fixture — the vault is live, and a note
  Obsidian holds open silently reverts a rewrite from disk.
- Manual: on phone and desktop, in all three study surfaces — image legible at
  rest; pinch zooms about the fingers; pan reaches every corner; **masks stay
  glued to their features at every zoom level** (the one thing that would make
  this worse than not shipping); no lightbox on tap while covered; flip still
  reachable.
