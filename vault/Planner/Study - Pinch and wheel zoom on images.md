---
title: Study - Pinch and wheel zoom on images
summary: "T104. Images in Flashcard and Note study zoom in place with pinch or Ctrl/pinch-wheel; occlusion masks zoom with them; the rating buttons stay floating over the content."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
batch: 14
priority:
progress: 100
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-21T06:37:55.000Z
date_start_scheduled: 2026-11-20T17:38:35.000Z
date_start_actual: 2026-11-20T17:38:35.000Z
date_end_scheduled: 2026-11-21T06:37:55.000Z
date_end_actual: 2026-11-21T06:37:55.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/52
---

# Study - Pinch and wheel zoom on images (T104)

## What Sawyer asked
> Need to zoom in on images in study mode

## Settled with Sawyer
- **Inline** pinch/wheel zoom in place, no lightbox. The floating study buttons stay drawn over the image.
- Where: the Flashcard study tab and Note study (images in cards, including image-occlusion images).

## Current state
- Study tab: ordinary images come from `MarkdownRenderer` into `.osmosis-study-front/-back` (styles.css `.osmosis-study-card img` ~1403). Occlusion cards: `renderOcclusionSide` (`SequentialStudyView.ts` ~627–663) → `renderOcclusion` into `.osmosis-study-media`.
- `src/views/OcclusionRenderer.ts` (383): wrapper `.osmosis-occlusion` → `img.osmosis-occlusion-image`; masks are an SVG `viewBox 0 0 1 1` stretched over the wrapper (~240), so **scaling the wrapper keeps the masks aligned**. Since T91 round 2, the width cap `--osmosis-occlusion-width` sits on the wrapper, not the img. `overlayMasks` ~193 handles inline images in Note study.
- Reusable: `OcclusionEditorModal.ts` zooms by changing the wrapper's width (Ctrl+wheel about the pointer ~535–545; pinch `beginGesture`/`updateGesture` ~1049–1090); pure maths in `src/study/occlusion-geometry.ts` 861–901 (`ZOOM_MIN/MAX/STEP`, `zoomBy`, `anchoredScroll`). `src/graph3d/wheel-input.ts` `wheelAction` tells touchpad pinch from scroll.

## Design
- Wrap each study image (and occlusion wrapper) in a scroll viewport; zoom changes the inner width (like the editor) and pans by scrolling, anchored on the pointer/pinch midpoint via `anchoredScroll`. Reuse the occlusion-geometry helpers; no new maths unless needed (then pure + tested).
- Wheel: Ctrl+wheel and touchpad pinch zoom; a plain wheel scrolls the card as now. Touch: two-finger pinch zooms; one finger pans only when zoomed, otherwise scrolls the card.
- Double-click/double-tap resets to fit. Zoom resets on the next card.
- The study tab's keys (Space, 1–4) still work while zoomed.

## Acceptance criteria
- Pinch/Ctrl-wheel zooms an image about the fingers/cursor in both modes; occlusion masks stay locked to the image at every zoom; pan works when zoomed; reset on double-tap and on the next card.
- Plain scrolling of a card is unchanged when not zoomed.

## Test plan
`tests/flashcard/occlusion-image-width.md` (Engineering › Width) and `tests/flashcard/study-tab.md` (tall chart): zoom, pan, reveal and rate while zoomed; Note study on an occlusion note; touchpad, mouse, phone.

## Context budget (~50k tokens)
- `OcclusionRenderer.ts` whole (383); `SequentialStudyView.ts` 600–670; `OcclusionEditorModal.ts` 75–90, 270–290, 530–550, 1040–1095, 1525–1545; `occlusion-geometry.ts` 855–905; styles.css 1400–1410 and 1491–1560.

## Conventions
- Batch 14 ticket: commit `feat(T104): …`/`fix(T104): …` plus one `docs(T104)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section. Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Batch 12 (T91/T92) round-2 facts: the study tab's buttons sit in one floating panel; every mode's rating row uses the shared class `osmosis-contextual-rating` (colour rules only at `.osmosis-contextual-rating button.osmosis-rate-*` in styles.css); deck-count colours come from `--osmosis-count-new/learn/due`, declared on `.osmosis-dashboard, .osmosis-study-view`.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes in `src/study/` or similar (vitest cannot import obsidian) and gets unit tests.

## What was implemented

**Where it shipped:** [PR #52](https://github.com/SawyerRensel/Osmosis/pull/52) (batch 14, branch `batch/14-study-polish-renames`), merged into `release/0.0.6`. Sawyer tested it by hand and passed it on the first test, on 2026-11-20. Round 2 added fix F2: a zoomed image fills the study area, and there is no sideways scroll. It passed Sawyer's second test.

The batch worker wrote this record when the code was committed.

Code commit `1cef1ce` on `batch/14-study-polish-renames`.

### Approach
One `ImageZoom` controller per study surface, listening on the surface's root and finding the picture under the event at event time. Nothing is attached per image, so images that render late (embeds resolving after the markdown) and an occlusion card's redrawn answer side are covered for free. A "picture" is an occluded diagram's `.osmosis-occlusion` wrapper (zoomed as a whole) or a bare `<img>`.
- **Study tab:** the root is `.osmosis-study-card`, created in `buildLayout` and destroyed in `onClose`.
- **Note study:** the root is the leaf's `.markdown-reading-view`. `LineRevealProcessor.syncBanners` already knows which reading views are in Note study (it mounts the progress strip there), so `syncZooms` attaches a controller to exactly those. A view that leaves study, closes, or is unloaded drops its controller and returns its pictures to fit.

Input:
- **Ctrl+wheel and touchpad pinch** (Chromium sends a pinch as a Ctrl+wheel) zoom about the pointer. A plain wheel is never taken, so the card scrolls as before, zoomed or not.
- **Mouse drag** pans a zoomed picture. The click that ends a drag is swallowed, so a pan never reveals or opens anything.
- **Touch:** two fingers pinch, anchored on the midpoint and following it, which is the occlusion editor's maths. One finger pans only a zoomed picture; otherwise the card scrolls.
- **Double-click / double-tap** on a zoomed picture resets it to fit.
- **Zoom range:** 1–6×, from the editor's `ZOOM_MIN`/`ZOOM_MAX`.

### Decisions worth remembering
- **CSS transform plus `clip-path`, not the editor's width-and-scroll.** The note's design said to change the inner width inside a scroll viewport. I did not, for three reasons:
  1. The study surfaces cap images (`max-width: 100%`, the `|300` cap `--osmosis-occlusion-width` on the wrapper). Every one of those caps would need overriding while zoomed.
  2. A new wrapper around `.osmosis-occlusion` brings back the cyclic-percentage bug described in styles.css: the outer box takes the picture's natural width while the capped wrapper stops short.
  3. A transform changes no layout at all. The card's scroll height, the floating rating panel and T109's no-jump-on-reveal layout all stay exactly as they were.

  The zoom lives in box fractions (`src/study/image-zoom.ts`), so applying it needs no measurement.
- **Each layer is transformed, not the wrapper.** An occluded diagram's wrapper never moves; its children (img, mask SVG, annotation layer) each get the same `translate(%) scale()`. Each is the wrapper's size, so one set of percentages fits all of them, and the masks stay locked to the picture.
- **Clip per layer, not `overflow: hidden`.** Note study floats rating buttons under a revealed shape inside the wrapper, and on a narrow picture they deliberately run past its right edge (`.osmosis-occlusion-rating-anchor`). `overflow: hidden` would cut them off. So each layer is clipped with `clip-path: inset(...)`, which also clips hit-testing.
- **The Note-study rating anchor follows the zoom.** Its `left`/`top` calcs now include `--osmosis-zoom-x/y` and `--osmosis-zoom`. With no zoom these fall back to the old values, so unzoomed placement is unchanged. `top` is clamped to the picture's box, so the buttons stay on the picture when their shape is panned out of view.
- **Reveal keeps the zoom.** In the study tab an occlusion flip redraws the diagram. `flip()` reads the question's zoom and sets it on the answer's wrapper, so revealing while zoomed does not jump; T109's same-layout-both-sides property holds. In Note study a reveal only repaints the masks inside the same wrapper, so the zoom survives on its own.
- **Not carried across reveal:** a *cloze* card's images. Cloze replaces the front with the back, and those images come back at fit. Basic cards keep the front, so their zoom stays.
- **Zoom resets on the next card** because the card's DOM is rebuilt, and in Note study when the view leaves study.
- **Note study zooms every image in the reading view**, not only those inside card elements. In Note study the note *is* the cards, and delegation at the view is far simpler than chasing each processor's elements.
- **Wheel speed:** `ln(zoom)` is 0.01 per px of wheel travel, capped at the editor's `ZOOM_STEP` (1.25×) per event. So a mouse notch is one editor step and a pinch is proportional. It is tunable via `WHEEL_GAIN`.
- **Not reused:** graph3d's `wheelAction`. It needs a physical Ctrl-key tracker on window and a touchpad classifier. A single proportional-and-capped formula serves a mouse notch and a pinch alike, so neither is needed.
- **Phone swipe:** a one-finger pan on a zoomed picture stops `touchstart` propagating, so the study tab's navbar swipe does not fire. Two fingers already cancel the swipe.

### Surface map
| File | Change |
|---|---|
| `src/study/image-zoom.ts` | New. Pure maths: `ZoomState`/`FIT`, `clampPan`, `zoomAbout` (wraps `anchoredScroll`), `panBy`, `pinchState` (wraps `zoomBy`), `wheelZoomFactor`, `isDoubleTap`, `zoomStyle` (CSS props incl. the clip inset) |
| `src/study/image-zoom.test.ts` | New. 21 tests |
| `src/views/ImageZoom.ts` | New. `ImageZoom` controller (wheel, mouse pan, dblclick, touch pinch/pan/double-tap, click swallowing, `destroy`); `zoomOf`/`setZoom` |
| `src/views/SequentialStudyView.ts` | Controller on `.osmosis-study-card`; occlusion `flip()` carries the zoom to the answer |
| `src/views/LineRevealProcessor.ts` | `zooms` map and `syncZooms`, driven by `syncBanners`; released on unload |
| `styles.css` | `.osmosis-zoomed` transform/clip/cursor rules after `.osmosis-occlusion.is-covered > img`; rating-anchor `left`/`top` follow the zoom |

### Fixtures (existing, reused)
- `vault/tests/flashcard/occlusion-image-width.md` (Engineering › Width): occluded line + fence cards with and without a `|width`.
- `vault/tests/flashcard/study-tab.md`: the tall chart.

### Not verified (no Obsidian here)
- Everything interactive. In particular:
  - whether Linux touchpad pinch speed feels right;
  - iOS/Android touch pinch, pan and double-tap;
  - whether an SVG `<img>` stays crisp when scaled by a transform. Chromium normally re-rasters a non-composited transformed image at the new scale; nothing sets `will-change`.
- If Obsidian mobile opens its image viewer on a single tap of a *plain* image, the first tap of a double-tap would open it. Covered occlusion diagrams are not affected: their `img` is untouchable.
- A double-click on a zoomed covered diagram in Note study is also two clicks on the line placeholder, so the first one reveals.

### Round-2 fix F2: zoom uses the whole study area
Code commit `65ae319`. Sawyer reported two problems. First, a zoomed image stayed clipped to its own box, which left the desktop margins and the space down to the phone's buttons empty. Second, the further you zoomed in, the further the card scrolled sideways, and the image box slid left instead of panning.

**Cause of the sideways scroll (confirmed in headless Chromium).** A CSS transform still counts towards the scroll container's scrollable overflow, and the per-layer `clip-path` does not take it out. Zoom 3× in a 400px scroller pushed `scrollWidth` from 420 to 560. Zooming alone leaves `scrollLeft` at 0. But once the card overflowed sideways, any horizontal wheel or touchpad component scrolled the card, and that was the slide. `.osmosis-study-card` has `overflow-y: auto`, so its x axis is `auto` too. The overflow grew with the zoom, which is why it got worse as you zoomed in.

**Fix.** Nothing clips the picture's layers any more. `--osmosis-zoom-clip` is gone. The study area is now an ancestor with `overflow: clip`. That clips the picture and also keeps it out of the scroller's overflow:
- **Study tab:** a new `.osmosis-study-body` wraps front, divider and back, plus the waiting and complete screens. The card is now a flex column, and the body is `flex: 1 0 auto`. So the body is at least the card's content box, down to the clearance above the buttons, and it grows with long content. While it holds a zoomed picture (`:has(.osmosis-zoomed)`), it is `overflow: clip; isolation: isolate`. A revealed back normally clips its content (`overflow: hidden`, for the reveal). While it holds a zoomed picture it becomes `display: flow-root; overflow: visible`, so a back image can use the area too. `flow-root` keeps the block formatting context, so nothing in the back moves.
- **Note study:** no element in the reading view is both as wide as the view and as tall as the note. So while it holds a zoomed picture, `.markdown-preview-view` gets `overflow-x: hidden`, which stops the sideways scroll, and `.markdown-preview-sizer` gets `overflow-y: clip; isolation: isolate`. Obsidian pads the sizer by half the view's height, so there is room below the last line.
- A zoomed picture is `position: relative; z-index: 1`, which lifts it over the text it spills onto. The isolation keeps it under the study strip and the floating buttons. Its `img` layer is painted on `--background-primary`, so text does not show through a transparent picture.

**Pan clamp.** `clampPan` now takes a `ZoomWindow`: the study area on screen, in box fractions, measured as each gesture starts. On each axis, a picture larger than the window covers it, so no gap opens; a smaller one stays inside it. The two rules meet where the picture is exactly the window's size, so nothing jumps between them. At fit the picture is its box, which is inside the window. With the window set to the box itself (`BOX`, the default), this is the old clamp exactly.
- Study tab window: the card's content box (`contentRect(cardEl)`).
- Note study window: the preview's content box across, with the height cut to the sizer (`readingArea`). A short note's sizer can end above the view's bottom, where the picture would be clipped.

**Rating anchors (Note study).** These stay locked to the shape.
- `top` is no longer clamped to the picture's box, because a zoomed shape can be drawn outside it. If the shape is panned out of view, its buttons go with it, clipped by the study area. Pan back or double-click to bring them back.
- `left` is clamped to the zoomed picture's extent, `[zoom-x, zoom-x + zoom·100% − width]`, rather than to the box. At fit that is the old `[0, 100% − width]`.
- Checked in headless Chromium: with zoom 4 at −150%/−150%, the anchor landed exactly on the shape's projected point.

Decisions:
- **Clip by an ancestor, not by `overflow-x: hidden` on the study card.** `hidden` stops the user scrolling the card sideways, but it still lets a programmatic scroll through, and it does nothing about the height the zoom adds below. Note study uses `hidden` only because Obsidian's DOM gives no better element to clip with.
- **The clip rules apply only while a picture is zoomed (`:has`).** A wide table that overflows the card today keeps behaving as it does.
- **The window is what is on screen, not the whole body.** On a long card the body runs far below the view. Clamping to the body would let a slightly zoomed picture be dragged off screen.

| File | Change |
|---|---|
| `src/study/image-zoom.ts` | `ZoomWindow`, `BOX`, `ScreenRect`, `windowIn`; `clampPan`/`zoomAbout`/`panBy`/`pinchState` take a window; `zoomStyle` drops the clip |
| `src/study/image-zoom.test.ts` | Window clamp, `windowIn`, spill/pinch-in-window tests; clip tests replaced (30 tests) |
| `src/views/ImageZoom.ts` | Constructor takes `areaOf`; pan/pinch/wheel measure the window; `contentRect` export |
| `src/views/SequentialStudyView.ts` | `bodyEl` (`.osmosis-study-body`) holds the card's contents; zoom area is the card's content box |
| `src/views/LineRevealProcessor.ts` | `readingArea(host)` passed to each Note-study `ImageZoom` |
| `styles.css` | Card is a flex column, with the body rule; the column selectors move to the body; zoom rules drop `clip-path` and gain z-index and a background; study-area clip rules; rating-anchor `left`/`top` |

Fixtures (existing): `vault/tests/flashcard/occlusion-image-width.md` (Engineering › Width, occluded line and fence cards) and `vault/tests/flashcard/study-tab.md` (Testing › Study Tab, "Tall chart", a plain image card).

Verified in headless Chromium against the real `styles.css`, using mock study-tab and reading-view DOM:
- No sideways or vertical overflow while zoomed.
- The study body fills the card.
- The card's scroll height is unchanged from before, clearance included.
- The strip stays on top.
- A sideways wheel no longer scrolls Note study.

Not verified: everything in Obsidian itself, on desktop and on a phone, and themes that restyle the reading view's scroller or sizer.
