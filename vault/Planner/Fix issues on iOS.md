---
title: Fix issues on iOS
summary: There are many rendering issues on iOS that do not appear on any other operating system.  Let's provide full experience parity for iOS.
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
date_created: 2026-08-03T15:32:30.793Z
date_modified: 2026-08-14T01:00:41.000Z
date_start_scheduled: 2026-08-13T23:38:59.000Z
date_start_actual: 2026-08-13T23:38:59.000Z
date_end_scheduled: 2026-08-14T01:00:41.000Z
date_end_actual: 2026-08-14T01:00:41.000Z
pull_request: https://github.com/SawyerRensel/Osmosis/pull/25
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

| Field            | Value |
| ---------------- | ----- |
| Platform         |       |
| Operating System |       |

## What happened?

*What actually happened? Describe what went wrong.*

​iOS admonitions and other nodes are ghosting in mind map view, where the node content is frozen/stuck at its originally rendered location when mind map is loaded. When the map is panned/zoomed, the content stays in the same position.

***

![](2026-08-13%20iOS%20Osmosis%20screenshot%201.png)

Admonitions are all over the place, seeming to appear randomly and freeze in place as I pan the view.

***

![343](2026-08-13%20iOS%20Osmosis%20screenshot%202.png)

There isn't enough spacing between the top menu and the "Browse" and "Stats".  Let's be sure to consider Material design standards for the right spacing. 

![204](Pasted%20image%2020260813185736.png)

It's not an issue on desktop because instead of a menu there are icons at the top. 

***

![](2026-08-13%20iOS%20Osmosis%20screenshot%203.png)

No fence flashcards appear of any kind in Mind Map view.   

![](screenshot.png)![](screenshot%201.png)
![](screenshot%202.png)

Image occlusion line cards will show fine until you activate peek or study mode.  Panning the map smears the rating buttons. 

***


![](2026-08-13%20iOS%20Osmosis%20screenshot%204.png)

In peek or study mode, headings render with ghosts until you pan the map. 

***

![](2026-08-13%20iOS%20Osmosis%20screenshot%205.png)

![](2026-08-13%20iOS%20Osmosis%20screenshot%206.png)

Same ghosting issue when rating cards.

***

![](2026-08-13%20iOS%20Osmosis%20screenshot%207.png)
![](2026-08-13%20iOS%20Osmosis%20screenshot%208.png)

Code fences have similar issue as callouts, being frozen in place when the mind map view is activated and staying there even when the mind map is panned.

***


![](2026-08-13%20iOS%20Osmosis%20screenshot%209.png)

Icons in sequential modal are super tiny for some reason

***

## What should have happened?

*What did you expect to happen instead?*

​

## Where is this file located?

*Paste the filepath location  (if the bug occurred in a test file)*



## Steps to Reproduce

### 1. Start from

(e.g. new scene / open file link)  *Attach a screenshot for this step*



### 2. Prep/settings

(e.g. setting/value changes)  *Attach a screenshot for this step* 



### 3. Do this

(e.g. click this button)  *Attach a screenshot for this step*

​

### 4. Trigger

Describe the last action you took before the problem  *Attach a screenshot for this step*

​

***

## What was implemented

### Where it shipped

[PR #25](https://github.com/SawyerRensel/Osmosis/pull/25), branch
`fix/ios-foreignobject-ghosting` into `release/0.0.4`. Three commits: the
viewport change, then the two smaller fixes found while testing it.

### The cause

The map panned and zoomed by rewriting the SVG's `viewBox`
(`MindMapView.updateViewBox`), and every node's body is HTML inside a
`<foreignObject>`. WKWebView paints those two things with different machinery:
SVG geometry is re-transformed on every `viewBox` change, but a
`<foreignObject>` descendant that WebKit has promoted to its own compositing
layer keeps the backing it was first given, in *document* coordinates, and is
never re-transformed. The layer strands — welded to the screen at the position
and the scale it first painted at, while the map slides away underneath.

Two things made this hard to recognise:

1. **Promotion propagates upward.** One promoted descendant strands the whole
   node, which is why a single animated half of a flashcard made the entire
   card invisible — the symptom reads as "the node is empty", not "part of the
   node is misplaced".
2. **A stranded ghost lands at unscaled SVG-local coordinates.** Nodes low in
   the map strand *below the viewport*, so they read as missing rather than as
   duplicated. Only ghosts from nodes near the top are visible at all.

The proof is in screenshots 7 and 8 above: between them the map pans by roughly
+577, +165 px and every node moves by exactly that — except the code fence,
which sits at identical screen pixels in both.

### The fix

**The first two rounds were wrong, and the record matters more than the code.**
They tried to suppress the promotion triggers — `animation`, `transition`,
`will-change`, `backdrop-filter`, `mix-blend-mode`, every horizontal scroller
Obsidian puts inside rendered markdown — behind an `osmosis-webkit` body class.
That approach cannot converge. The trigger list is Obsidian's CSS *plus* the
user's theme *plus* whatever the next Obsidian version adds, and each miss
strands exactly one construct and nothing else. Round 1 fixed callouts, tables
and headings; round 2 aimed at `.callout-content` and the codeblock nodes and
missed both. It also cost real behaviour: no node animations, no scrollable
code blocks, no language labels — the opposite of the parity this task is for.

What broke the deadlock was reading how Obsidian solves the same problem
itself. Canvas is an infinite pannable surface with rendered markdown inside
it, shipped and tested on iOS, and it does **not** use `foreignObject` +
`viewBox`. From `app.css`: `.canvas-wrapper` is `overflow: hidden` and stays
put; `.canvas` is `transform-origin: 0 0` and `app.js` writes
`style.transform = "translate(…) scale(…)"` to it. A CSS transform on an
ancestor *is* applied to descendant composited layers — that is the ordinary
accelerated-scrolling contract. The WebKit gap is specific to SVG `viewBox`.

So on iOS the map now moves the same way. The SVG carries no `viewBox` at all
(without one, one user unit is one CSS pixel and the origin is the element's
top-left — exactly the space the transform is written against), a host div does
the clipping the SVG can no longer do, and pan/zoom writes a CSS transform.
`this.viewBox` stays the source of truth, so culling, layout, hit-testing and
the edit overlay are untouched.

Because nothing is suppressed any more, iOS gets its animations, its
horizontally scrolling code blocks and its language labels back. It also fixed
the case the previous round had written off as unfixable: `<video>` and the
YouTube `<iframe>` are composited unconditionally in WebKit, so no CSS could
ever have reached them, and they travel with the map now like everything else.

### Decisions worth remembering

- **`src/mindmap-viewport.ts` reproduces `preserveAspectRatio="xMidYMid meet"`
  exactly**, including the centring offsets, even though the view keeps the two
  aspect ratios equal so the offsets are always 0. Reproducing the whole rule
  is what lets the tests prove the transform path is pixel-identical to the
  `viewBox` path, rather than merely asserting a formula. Do not "simplify" it
  to `scale = width / w`.
- **The maths lives outside `src/views/`** because Vitest cannot import
  `obsidian`. That is the only way this path — which runs on no machine we can
  test on — has tests at all.
- **iOS only.** Chromium (desktop Electron, Android's WebView) re-transforms
  those layers correctly. Gating keeps the blast radius on the platform being
  fixed, at the cost of the transform path being exercised only on device; the
  unit tests are the compensation. Promoting it to all platforms is a
  reasonable future step now that it exists, and would fold two paths into one.
- **`will-change: transform` on `.osmosis-spatial-rating` is deliberate.** It
  asks for a composited layer inside a `foreignObject` — the exact thing that
  stranded content before this task. It is safe *because* of the transform
  fix, and it will look like a mistake to anyone who reads the old diagnosis.
- **The `osmosis-webkit` body class is gone**, along with the whole suppression
  block. If ghosting ever returns, the answer is not to bring it back; it is to
  check whether the transform is still being applied.
- The virtual-root stub was **not** iOS-specific and its removal affects every
  platform.

### Surface map

| File | Change |
|---|---|
| `src/mindmap-viewport.ts` | new — `viewBoxFit` / `viewBoxTransform` / `clientToUser` / `userToClient`, pure, no `obsidian` import |
| `src/mindmap-viewport.test.ts` | new — 16 tests, including the proof that the transform path equals the `viewBox` path |
| `src/views/MindMapView.ts` | `panByTransform` + `viewportHost` fields; `updateViewBox` and `screenToSvg` branch on the host; `renderSvg` omits the `viewBox` attribute and wraps the SVG in the host; the mobile-keyboard pin retargeted to the host; branch lines to the virtual root dropped, and the four root special cases in `drawBranchLine` / `isBranchInViewport` with them |
| `styles.css` | `.osmosis-mindmap-host` and `.osmosis-mindmap-svg-transformed`; `will-change: transform` on `.osmosis-spatial-rating`; **removed** the `osmosis-webkit` suppression block |
| `styles.css` | `.is-mobile .osmosis-dashboard { padding-top: 16px }` — Material's 16dp step, for the cramped Browse/Stats row |
| `styles.css` | `.osmosis-study-icon-btn svg` pinned to `--icon-m` with `flex-shrink: 0` — the sequential-modal icons collapsed to dots on iOS because `--icon-size` does not resolve on `modalEl` |

### Test fixture

`vault/tests/mindmap/ios-node-ghosting.md` (master in `e2e/fixtures/`). One node
per promotion trigger: callout, code fence, wide table, `osmosis` fence
flashcard, three back-dated line cards, and a YouTube embed. The embed is the
decisive one — an `<iframe>` is composited unconditionally, so if it travels
the fix is structural rather than another lucky suppression.

On iOS: open in Mind Map View, drag a long way, and every node must travel with
the map leaving no copy behind. Then Peek, then Study — revealed nodes and the
Again/Hard/Good/Easy bubble must stay glued to their node while panning.
Reload Obsidian before testing it; see the reset hazard in CLAUDE.md.

### Technique worth keeping

When a WebKit paint bug needs Obsidian's own CSS read rather than guessed:

```
npx --yes @electron/asar extract /home/user/.config/obsidian/obsidian-1.13.7.asar ./obs
```

Then grep `obs/app.css` for the promotion triggers, and `obs/app.js` for how a
core view does the same job. Reading `.canvas-wrapper` / `.canvas` out of that
extract is what ended this task; guessing had already burned two rounds.

### Follow-ups

- [[Tapping to reveal image occlusion in Note view Peek and Study mode triggers lightbox]]
