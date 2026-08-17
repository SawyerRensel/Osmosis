---
title: Fold every platform onto the mind map's transform pan path
summary: The mind map pans two different ways — CSS transform on iOS, SVG viewBox everywhere else. One path would be less code and would put the iOS path under daily desktop use.
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Fix issues on iOS]]"
status: Ideas
priority:
progress:
date_created: 2026-08-14T01:10:08.000Z
date_modified: 2026-08-14T01:10:08.000Z
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

# Optimization

## What tool or process needs improvement?

Mind Map View's pan/zoom. Since [[Fix issues on iOS]]
([PR #25](https://github.com/SawyerRensel/Osmosis/pull/25)) it has two
implementations of the same viewport:

- **iOS** — the SVG carries no `viewBox`; a `.osmosis-mindmap-host` wrapper
  clips and a CSS `transform` on the SVG does the panning. Chosen because
  WKWebView never re-transforms a composited layer inside a `<foreignObject>`,
  so node bodies stranded on screen.
- **Everywhere else** — the SVG's `viewBox` attribute is rewritten, as it
  always was.

`this.viewBox` is the source of truth for both, so culling, layout, hit-testing
and the edit overlay are shared. The split is confined to `updateViewBox`,
`screenToSvg`, `renderSvg`, and the mobile-keyboard pin in `MindMapView.ts`,
plus two CSS rules.

## What's slow or frustrating about it?

**The iOS path only ever runs on an iPad.** Nothing in day-to-day desktop use
exercises it, so a regression in it surfaces only when Sawyer next tests on
device — the slowest feedback loop in the project. `src/mindmap-viewport.ts`
has unit tests proving the transform is pixel-identical to the `viewBox`
mapping, which covers the maths, but not the DOM plumbing around it.

It is also two things to keep in step. Anything future work does to the
viewport — a minimap, an "export as image", smooth-scroll animation, a
different `preserveAspectRatio` — has to be reasoned about twice, and the
second reasoning is the one nobody can test.

## What would "better" look like?

One path: every platform pans by CSS transform. Delete the `viewBox` branch,
`panByTransform`, and the null checks on `viewportHost`; the host wrapper and
the transform become unconditional. Desktop use then exercises the same code
iOS depends on.

Worth knowing before starting:

- **Obsidian's Canvas already works this way on every platform** —
  `.canvas-wrapper` clips, `.canvas` is `transform-origin: 0 0` with a
  JS-written `translate(…) scale(…)`. This is not an experiment.
- **Panning should get cheaper, not dearer.** A `viewBox` rewrite invalidates
  and repaints the SVG; a transform change is a compositor move. Worth
  measuring on `large-map.md` before and after rather than assuming.
- **`screenToSvg` stops using `getScreenCTM()`** and becomes the arithmetic in
  `clientToUser`. Already unit-tested as equivalent, but rubber-band selection,
  node dragging and pinch zoom all run through it, so they are the regression
  surface.
- **The mobile-keyboard pin** (`position: fixed` on the host while the virtual
  keyboard is open) currently targets the host on iOS and the SVG on Android.
  Unifying means Android switches to pinning the host — test the Android edit
  overlay specifically.
- **Check `will-change: transform` on `.osmosis-spatial-rating` is still
  wanted.** It exists to stop the rating bubble smearing on iOS; if Chromium
  never smeared, it is a spare layer on desktop rather than a fix.

Not urgent. The split is documented and the tests pin the maths, so this is
about reducing the surface rather than repairing anything.
