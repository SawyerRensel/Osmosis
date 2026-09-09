---
title: Obsidian's WebView renderer holds 0.6-1.4 GB on this vault
summary: On Android, Obsidian's renderer process reaches 660 MB–1.4 GB RSS with a mind map open, against 70–225 MB for every other app's WebView on the same device. Measured, not inferred. Split out of the study-mode crash investigation, which it turned out not to cause.
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Study mode stops before transcluded reviews are finished.]]"
status: To-Do
priority:
progress:
date_created: 2026-09-07T16:23:20-04:00
date_modified: 2026-09-07T16:23:20-04:00
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

The Mind Map view's memory footprint on Android, measured as the RSS of
Obsidian's WebView renderer process.

This is defect 8 of the eight found during
[[Study mode stops before transcluded reviews are finished.]]. It is split out
because it is far larger than the other seven and it is **not** what caused that
crash — the crash was a live `<a>` default action on the touch path, fixed in
`d27dfdf`. The footprint is a real, separately-measured problem that outlived the
investigation.

## What's slow or frustrating about it?

Nothing is visibly slow. The problem is headroom: a process this large is the
first thing Android's low-memory killer reaps, so an unrelated memory spike on
the phone can take Obsidian down mid-session.

### The measurements

From two Android bug reports (Settings → Developer options → Take bug report),
read with `dumpsys activity exit-info md.obsidian` and `dumpsys meminfo`.
Device: 7.7 GB total RAM, timezone `America/New_York`.

Renderer RSS at the moment the OS killed it, across five crashing sessions:

| Session (device local) | WebView renderer RSS |
|---|---|
| 09-06 22:34 | **1.4 GB** |
| 09-06 22:45 | **1.2 GB** |
| 09-06 22:52 | **880 MB** |
| 09-06 22:43 | 642 MB |
| 09-07 08:31 | 0.00 — already dead |

**For scale, every other app's WebView renderer on this device runs
70–225 MB.** Obsidian's ran 320 MB–1.4 GB. `lmkd` was separately observed
killing five processes in one burst.

Removing the three image embeds from the map's host note roughly halved both
processes:

| Run | Browser RSS | Renderer RSS |
|---|---|---|
| With images (09-06 22:34) | 571 MB | **1.4 GB** |
| With images (09-07 09:00) | 605 MB | **0.90 GB** |
| Images removed (09-07 13:28) | 272 MB | **660 MB** |
| Images removed (09-07 15:05) | 271 MB | **805 MB** |

`dumpsys meminfo` on the live renderer with images removed:

- `Unknown` **167 MB RSS / 166 MB private dirty** — and this same process
  reached 805 MB during the crashing run.
- `Native Heap` 8.5 MB. `Graphics` 0.
- The browser process separately holds **151 MB of GPU memory** (EGL 81 + GL 70)
  — the largest graphics allocation of any process on the device.

`Unknown` private-dirty anonymous memory is where V8's heap and Blink's
PartitionAlloc live, including discardable memory (decoded images, raster
tiles). It is exactly the region `performance.memory` cannot see.

### Two things that must not be re-derived

- **`performance.memory` is quantized on this device.** It reported a constant
  167/177 MB across every session and never moved, while the process it lives in
  went to 805 MB. It is not evidence of a flat heap. On desktop Electron it is
  precise (fractional MB). Do not build an argument on a mobile heap reading.
- **`dumpsys activity exit-info` is the tool.** Retroactive — run it *after* a
  crash, no cable and no `adb` on the phone; the bug-report flow above is
  sufficient. It gives the per-process kill reason and RSS at death, and it
  covers the renderer child process rather than just the app.

## What would "better" look like?

A renderer that sits in the same range as other apps' WebViews on the same
device — low hundreds of MB with a map open — verified the same way it was
measured, by RSS in a fresh bug report rather than by crash/no-crash roulette.

### Start by re-measuring

**No measurement has been taken since the crash was fixed.** Every number above
predates two changes that landed on `fix/study-mode-transclusion-crash`:

- the `mapCards()` hoist in `applySpatialState`, which removed ~30,000 calls per
  session, each allocating a `Set` plus ~15 arrays — a large allocation-rate
  reduction, and V8 grows its heap to absorb allocation rate;
- the seven other defects from that task.

So the first step is a fresh bug report on the current build, studying the same
map for the same duration. The footprint may already be materially lower, and
the size of what is left decides whether this is worth pursuing at all.

### Candidate levers, if it is still large

Ordered by the evidence, not by ease:

1. **Image decode at display size.** Images were measured to account for roughly
   half the footprint and were then ruled out as the *crash* mechanism — but not
   as a footprint contributor. A pasted screenshot decodes at source resolution
   regardless of display size (a 2160×1620 PNG is ~14 MB of bitmap shown at
   `![141]`), and Chromium caches a decode **per drawn scale** — the map's
   auto-zoom stepped through seven distinct scales in one session. Any fix must
   preserve the `<img>` element and its `alt`, because `applyFenceHidden`'s
   occlusion path depends on them.
2. **GPU memory in the browser process** — 151 MB of EGL/GL. The map pans by CSS
   transform, so the composited layer is the SVG's box times the scale. The SVG
   box itself was measured constant (387×770 CSS px), so this is not an
   unbounded layer, but it is still the device's largest graphics allocation.
3. **Cached render output.** `nodeHtmlCache` holds rendered markdown per node;
   fence nodes never populate it at all (defect 2 of the parent task, fixed
   there). Worth re-checking what the cache retains across a long session once
   that fix is in.

### Not worth doing

Another JS-side census. The parent task's rounds 1–5 counted DOM nodes,
foreignObjects, `<img>` elements, cull passes, draws, markdown renders and
spatial passes; every one was flat while the process grew to 805 MB. The
consumer is not visible from JS, which is the whole reason this needs `dumpsys`.
