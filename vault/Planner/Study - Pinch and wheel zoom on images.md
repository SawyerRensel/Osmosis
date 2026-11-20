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
status: To-Do
batch: 14
priority:
progress:
date_created: 2026-11-20T12:00:00.000Z
date_modified: 2026-11-20T12:00:00.000Z
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
pull_request:
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
