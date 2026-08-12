---
title: Rating a fence card rewrites the block being read
summary: Rating an occluded fence in contextual study rewrites the fence's own source, so Obsidian re-renders that section under the reader and the note scrolls. Line cards never do this because their schedule lives in frontmatter, not in the block they render.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Develop Image Occlusion System for Flaschards]]"
  - "[[Improve cloze data storage]]"
status: In-Progress
priority:
progress_current:
progress_total:
date_created: "2026-08-12T08:45:00.000Z"
date_modified: "2026-08-12T13:00:48.000Z"
date_start_scheduled: "2026-08-12T13:00:48.000Z"
date_start_actual: "2026-08-12T13:00:48.000Z"
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

# Bug Report

## What happens

Studying `vault/tests/flashcard/occlusion-surfaces.md` in reading view: rate a
group on the **fence** card (`surface-parts`) and the card flickers, the view
jumps, and it lands back near — but not exactly at — where it was. A second or
two later the page slides again on its own, with no input.

Revealing no longer jumps. Rating still does. The occluded **line** card
(`os-elevat1`) in the same note, studied in the same session, is flawless.

## Why the line card is fine and the fence card is not

This is the finding to start from, because it is not a rendering problem and no
amount of repaint discipline in `OcclusionRenderer` can fix it.

The two card types persist a rating to different places —
`StudySessionManager.recordReview` branches on `isLineCard`:

| | Where the schedule is written | How |
|---|---|---|
| Line card | the note's `osmosis-schedule` **frontmatter** | `ScheduleStore.setSchedule`, staged in memory and flushed on a 2 s debounce, with a pending-entries overlay so reads see it immediately |
| Fence card | **inside the fence itself**, nested under the card's key in the ` ```osmosis ` block | `FenceWriter.writeSchedule` → `vault.modify`, immediately, no staging |

So rating a fence card changes the source text of the very section being
displayed. Obsidian has no choice but to re-render that section, which re-runs
the code block processor, which builds a whole new DOM tree for the card — a new
`<img>`, a new mask overlay, new handlers. A line card can never suffer this:
its block's markdown is untouched by a rating, and a frontmatter change does not
invalidate the body sections.

That asymmetry explains everything observed so far, including the older symptom
where the fence came back claiming to be "Rated" (a re-render was recomputing
the question sequence, since fixed by memoising the plan in `occlusionPlan`).

## What has already been done — do not redo it

All committed on `feature/image-occlusion` (`af947b4`). These made reveal, peek
and mode-toggle jump-free, and they reduced the rating jump to a flicker, but
they treat the collapse rather than the rewrite:

- `renderOcclusionCard` builds the card **once** and repaints it —
  `repaintOcclusion` flips masks in place instead of emptying the container.
- `OcclusionRenderer` caches each image's natural size and hands the next
  `<img>` `width`/`height`, so a rebuilt picture reserves its box before it
  decodes.
- `ContextualStudyProcessor.holdHeight` puts a `min-height` on the code block
  element equal to the height it last rendered to, released after the deferred
  render fills it.
- `refresh(notePath)` restarts tracked occlusion cards in place on a mode
  change, rather than re-rendering them.

## Directions worth weighing

**1. Stop rewriting the note mid-session (the structural fix).** Give fence
schedules the staging layer line schedules already have: buffer the write in
memory, overlay it for reads (deck counts, due filters, the card store), and
flush once when contextual study stops — which is exactly what
`LineRevealProcessor.endStudy` already does with `scheduleStore.flush()`. The
note is then rewritten once, when the reader is done with it, instead of after
every answer. `ScheduleStore` is the model to copy, including its
`getPendingEntries` overlay and its flush-on-unload calls in `main.ts`. Things
to get right: the write must still land if Obsidian quits or the leaf closes
mid-session, and the sequential/mind-map surfaces must keep writing eagerly,
since nothing is displaying the source there.

**2. Do not hand Obsidian an empty section.** The code block processor renders
inside `window.requestAnimationFrame` — the deferral exists only so
`el.closest(".is-live-preview")` has an attached element to look at. That means
a rebuilt block is inserted **empty**, laid out and measured at zero height, and
only filled a frame later. Rendering synchronously would remove that gap; the
open question is how to tell live preview from reading view without waiting for
attachment (`ctx` internals, `ctx.containerEl`, two processors, or rendering the
reading-view card immediately and correcting in the rAF only if live preview
turns out to be the case).

**3. Understand the delayed second jump.** The slide "a few seconds later" is
not the same event as the flicker at click time. Candidates: `ScheduleStore`'s
2 s debounce flushing a *line* card's frontmatter in the same note; the
metadata-cache update that follows `vault.modify`; a `CardSyncService` re-scan
on modify. Worth instrumenting before choosing a fix — log every
`vault.modify`, every processor invocation, and `scrollTop` on the reading view,
with timestamps, and watch one rating end to end.

Options 1 and 2 are independent and both defensible; 1 is the one that makes the
class of bug go away rather than the instance.

## Reproducing

1. `cp e2e/fixtures/occlusion-surfaces.md vault/tests/flashcard/` — every card
   in it is new or overdue, so all are studiable.
2. `npm run build`, reload the plugin, open the note in **reading view**.
3. Press the graduation cap ("Study this note"). The fence redraws with `c1`
   amber and `1/2` bottom-left.
4. Scroll so the diagram fills the view, click `░░░░░░`, then rate. Watch for
   ~5 s after the click, not just at the instant of it.

## Surface map

| File | What lives there |
|---|---|
| `src/study/StudySessionManager.ts` | `recordReview` — the `isLineCard` branch that picks frontmatter vs fence |
| `src/store/FenceWriter.ts` | `writeSchedule` — immediate `vault.modify` of the fence's own source |
| `src/store/ScheduleStore.ts` | the staged/debounced/overlaid model to copy, `flushDelayMs = 2000` |
| `src/views/ContextualStudyProcessor.ts` | the fence card: `renderOcclusionCard`, `holdHeight`, `refresh`, `occlusionPlan` |
| `src/views/LineRevealProcessor.ts` | the line surface that works, including `endStudy`'s flush |
| `src/views/OcclusionRenderer.ts` | `renderOcclusion` / `repaintOcclusion` / `createImage`'s size cache |
| `src/main.ts` | plugin-level `scheduleStore.flush()` calls — where a fence flush would have to join |

Tests: `src/views/ContextualStudyProcessor.dom.test.ts` (17, including the
same-`<img>`-across-reveal-and-rating and survives-a-re-render regressions),
`src/study/occlusion-steps.test.ts`.

## Conventions

- `npm run lint`, `npm test`, `npm run build` before handing back; the user
  performs manual testing and no Playwright tests are to be written or run.
- Fixture edits go in `e2e/fixtures/` and are copied into `vault/tests/`.
- Nothing is committed until the user confirms manual testing; code is staged by
  explicit path, and this note gets its own commit.
- `src/views/` cannot be imported under vitest — pure logic belongs in
  `src/study/` to be testable, as `occlusion-steps.ts` was.
