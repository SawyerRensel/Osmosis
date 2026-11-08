---
title: 3D Graph - Backlinks toggle at depth 0
summary: "The Overlays menu's Backlinks toggle did nothing at Depth 0, the default. At depth 0 with Backlinks on, the notes that link to the focus note (\"what links here\") now load too, whole, one backward hop from the focus."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Depth 0 shows only the current note]]"
status: In-Review
priority:
progress:
date_created: "2026-11-08T20:10:29.000Z"
date_modified: "2026-11-08T20:25:00.000Z"
date_start_scheduled: "2026-11-08T20:10:29.000Z"
date_start_actual: "2026-11-08T20:10:29.000Z"
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

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Obsidian desktop, 3D graph view |
| Operating System | Linux |

## What happened?

Sawyer, 2026-11-08: "Backlinks toggle isn't doing anything." In the 3D graph's Overlays menu, switching Backlinks on at Depth 0 (the default) reloads the graph to exactly the same result.

## What should have happened?

With Backlinks on at depth 0, the notes that link to the focus note ("what links here") load as well. With it off, the result is the focus note plus what it embeds, as before.

## Where is this file located?

`vault/tests/graph3d/Knots.md` (linked to by six other notes in the fixture set).

## Steps to Reproduce

### 1. Start from

Open the 3D graph on `Knots` at Depth 0.

### 2. Prep/settings

Overlays, Backlinks on.

### 3. Do this

Watch the graph.

### 4. Trigger

Nothing changes; no linking note appears.

## Batch implementation notes (awaiting manual test)

Branch `fix/3d-graph-backlinks-depth-zero`, cut from `feature/3d-graph-back-forward` at d943305. Not pushed.

### Cause

Depth 0 is the default (`GRAPH3D_DEFAULT_DEPTH = 0`). The depth-0 branch of `reload` in `src/views/Graph3DView.ts` called `computeHorizon(adjacency, focus, 0, false)` with backlinks hard-coded to `false`, then added the embedded notes. The toggle (Overlays menu, `onReach`) set `this.backlinks` and reloaded, but that branch never read it. At depth 1 and above `computeHorizon(..., this.backlinks)` walks `adjacency.backward`, so the toggle worked there.

### Fix

- New pure `withBacklinkers(base, adjacency)` in `src/graph3d/horizon.ts`: adds `adjacency.backward.get(focus)` to `loaded` (hop 1, `via` the focus), skipping any note already loaded and taking the rest out of the prefetch ring.
- `reload` calls it after `withEmbedded` when `this.backlinks` is on, then reads the added notes whole (`readNote`) and appends them to `notes`. Backlinks off is the old code path, untouched.
- Unit tests in `src/graph3d/horizon.test.ts` (`withBacklinkers (depth 0 with Backlinks on)`): off = focus only (plus embeds, covered by the `withEmbedded` tests); on = plus linking notes; a note that is both embedded and linking is not duplicated; a mutual link leaves the prefetch ring; the walk is from the focus only.

### Decisions worth remembering

- **One backward hop from the focus only, not from embedded notes.** Settled by Sawyer. "What links here" is about the note you are looking at; embedded notes are content of it.
- **An embedded note that also links back stays as its embed shows it** (a heading section or block stays partial). Embedding is the stronger, more specific relationship; widening it to the whole note because of a backlink would surprise. `withBacklinkers` skips anything already loaded, and the view reads only the not-yet-read ones.
- **Linking notes load whole, but under `contentOnly`** (still `this.depth === 0`). So a plain link or property inside a backlinking note to an attachment or an unresolved target adds no attachment or ghost node, as for every other depth-0 note. Edges between shown things follow the existing rules: plain-link edges (including the linking note's line to the focus) appear because both ends are shown.
- **`routeNotes` (due-driven study pool at depth 0) needed no change.** It already unions `computeHorizon(adjacency, focus, 1, this.backlinks).loaded`, which includes the backlinkers when Backlinks is on and not when off, so a route's pool and the loaded set agree. It also still includes the forward-linked notes one hop out, unchanged.
- **History: toggling Backlinks pushes no entry.** `onReach` sets the field and calls `reload()` directly, never `navigate`/`setState`'s step path, the same as a depth change. Nothing in this fix touches that; verified by reading, not run.
- Prefetch ring: backlinkers are loaded now, not prefetched; their own outgoing links are not read ahead (they would be hop 2).

### Surface map

| File | Change |
| --- | --- |
| `src/graph3d/horizon.ts` | new pure `withBacklinkers` |
| `src/graph3d/horizon.test.ts` | five tests for it |
| `src/views/Graph3DView.ts` | depth-0 branch of `reload` applies it when `this.backlinks`, reads the added notes |

### Fixture

No new fixture. Uses `vault/tests/graph3d/Knots.md`, linked to by Deck Checklist, Harbour Links, Harbour Rules, Draft Logbook, Knot Names Abroad and Sailing Basics, and `vault/tests/graph3d/Depth Zero.md`. No fixture was written, so no reload is needed for that reason; reload Obsidian (Ctrl+R) after the build to pick up the plugin.

### Manual test steps

1. Build is in `vault/.obsidian/plugins/Osmosis`; reload Obsidian (Ctrl+R).
2. Open `vault/tests/graph3d/Knots.md`, then open the 3D graph from it (default Depth 0, Backlinks off). Expect: Knots' own lines plus the content it embeds (the diagram, the Rigging note embed), and none of the six linking notes.
3. Overlays menu, Backlinks on. Expect: the six notes that link to Knots (Deck Checklist, Harbour Links, Harbour Rules, Draft Logbook, Knot Names Abroad, Sailing Basics) load as whole notes, with link edges to the Knots plates they point at. Turn it off: they go, and the graph is back to step 2.
4. History: with Backlinks toggled on and off a few times, press the 3D graph's back arrow. Expect it to go to whatever came before the toggles, not to a "same graph again" step.
5. Regressions. Depth 1 with Backlinks on and off: same neighbourhood as before this change (Backlinks on adds linking notes at hop 1). Open `Depth Zero.md` at Depth 0 with Backlinks off: only its lines plus Weather, Knots#Bends, the `bowline` block and the Sail Care#Links section; Navigation and Tide Cards not loaded. With Backlinks on there, expect only notes that link to Depth Zero (probably none: it should look the same).
6. A study route (Study, due-driven) at depth 0 with Backlinks on: stops may be in the linking notes, which are now in view.

### What I could not verify

I cannot see Obsidian. The fix is covered by the pure unit tests; the `reload` wiring and the visual result are untested, as is the history behaviour.
