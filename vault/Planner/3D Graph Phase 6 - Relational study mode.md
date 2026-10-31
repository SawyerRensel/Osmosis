---
title: 3D Graph Phase 6 - Relational study mode
summary: "The relational study mode: due line, fence and occlusion cards hidden in place in 3D, rated per hop on shared FSRS, with free, due-driven and authored-trail paths."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: In-Review
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-10-31T16:40:00.000Z"
date_start_scheduled: "2026-10-31T16:05:29.000Z"
date_start_actual: "2026-10-31T16:05:29.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph Phase 4 - Near tier]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

- **The new `StudyMode` value `"relational"`:**
  - Add it in `src/database/types.ts`, `parseStudyMode` (`src/store/ReviewLog.ts`), `src/stats/aggregate.ts`, `src/stats/detail.ts`, and every stats surface that lists the modes.
- **Hiding and rating:**
  - The hidden node *is* the card, with parity with 2D spatial study for line, fence and occlusion cards.
  - Reuse `src/study/spatial-study.ts`; its `${notePath}#^${blockId}` keys already span several notes.
  - Rate per hop through `plugin.createSessionManager("relational")`, on the shared FSRS schedules.
- **Study panel in the viewport, with three path modes:**
  - **Free exploration:** due cards in the loaded area are hidden; reveal and rate one when you arrive.
  - **Due-driven:** includes due cards within the configured depth of the start note (the horizon follows you). It flies you between them and draws the travelled path as a persistent thread.
  - **Authored trails:** a trail is a vault note whose stops are links, in order. Parse and serialize it in `src/graph3d/trail-note.ts`.

**Acceptance:**
- Reviews made in 3D update the same schedules as the other modes.
- Stats show `relational` separately.
- All three path modes work on the fixture.
- Unit tests cover due-driven ordering, trail note parsing and serialization, and stats aggregation.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.

## Slice plan

The phase is too big for one session, so it ships in three slices, each testable on its own, in dependency order. **Status `In-Review` covers slice 1 only;** slices 2 and 3 are still to build, on branches stacked after `feature/3d-graph-phase-6`.

1. **Slice 1: the mode, stats, and free exploration** (built, awaiting manual test). The `relational` `StudyMode` everywhere stats list modes. A "Relational study" header action starts a session; due line and fence cards in the loaded area are hidden in place and follow the loaded area as you hop; click a `?` to arrive, click again (or Space) to reveal, rate 1–4 on the shared FSRS schedules; "Next" flies to the nearest hidden card.
2. **Slice 2: due-driven path with the travelled thread.**
   - Pure `src/graph3d/trails.ts` (the spec's planned file): order the due cards within the configured depth of the *start note* (not only the loaded area) along graph paths, by hop distance over `NoteAdjacency` (`horizon.ts`) from where you stand, ties broken by most overdue then by note order. Unit-test the ordering.
   - Collecting cards beyond the loaded area: card store `getCardsByNote` for every note in `computeHorizon(adjacency, start, depth, backlinks).loaded`, at session start; nodes for them don't exist until a hop loads their note, so the session must `setFocus(note)` first and then `flyTo` the card's line once the reload lands (`reload(true, "^blockId")` already lands on a block subpath; a fence needs its node ID, found in the new model with `nodeCardKey`).
   - A path-mode selector in the study panel (`Graph3DStudy.renderPanel`): Free / Due-driven / Trail. `next()` is the extension point: free picks `nearest`, due-driven takes the next stop in the order.
   - The thread: a persistent polyline through the node positions visited this session, drawn by the scene (a new `LineSegments`/`Line` in `Graph3DScene`, like `edges`, disposed in `destroy`), kept across hops while its nodes are loaded. Expose `scene.setThread(ids: string[])`.
3. **Slice 3: authored trails, and occlusion parity.**
   - `src/graph3d/trail-note.ts`: parse and serialize a trail note: a vault note whose stops are links in order (`[[Note#^id]]`, `[[Note#Heading]]`, `[[Note]]`), one per list item; propose frontmatter `osmosis-trail: true` to mark it. Unit-test parse and serialize round trips. A stop with no due card is visited and shown, not rated.
   - The trail path mode: pick a trail note (a `FuzzySuggestModal` over notes with the marker), then walk its stops with the same flight as due-driven; the thread draws the trail.
   - Occlusion cards: slice 1 leaves them *showing* (`askable` in `src/graph3d/study.ts` filters out any card with `occlusion`). Parity needs the 2D masks over the image in the near-tier panel: reuse `overlayMasks` / `removeMaskOverlays` (`src/views/OcclusionRenderer.ts`) on the panel's `<img>` in `Graph3DNear`, with `front`/`back` per asked group as `MindMapView.applySpatialHidden` does, then drop the `askable` filter.

## Batch implementation notes (awaiting manual test)

Slice 1 of 3 (see the slice plan above). Branch `feature/3d-graph-phase-6`, stacked on `feature/3d-graph-joysticks`.

**Approach.** Relational study is 2D spatial study's logic on 3D nodes, with nothing forked:
- **Card matching** is `src/study/spatial-study.ts` unchanged: `dueOrNewLineCardIds` + `dueOrNewFenceCardKeys` pick the due nodes, `spatialStudyKeys` splits a node into one key per due card in ask order, and `cardIdsForSpatialKey` maps a key to the card it rates. `nodeCardKey` in the new pure `src/graph3d/study.ts` is `MindMapView.nodeCardKey` for graph nodes (no transclusion in 3D, so a line always keys on the note it is drawn in).
- **Rating** goes through `plugin.createSessionManager("relational")`, so the schedule writes, the review log and `refreshDashboard` are the shared ones. Stopping flushes `scheduleStore` and `reviewLog` as 2D study does.
- **Hiding in place** is done in the view, not the scene: `Graph3DStudy.decorate(model)` returns a copy of the model in which each target node keeps its ID, kind, path and parse type (so its position, colour and edges stay) but says something else (`studyNode`). The scene sees an ordinary relabel through `setData`, which re-shapes only the changed plates. Every place the view hands the scene a model goes through `decorate`, so targets follow the loaded area on every hop and every edit.

**Decisions worth remembering.**
- **Arrive, then reveal.** The first click on a `?` makes it the current card (and flies and hops as any click does); a second click, the Reveal button or Space reveals it. Revealing on the first click would show the answer mid-flight, before you have stood among its neighbours, which is the point of the mode.
- **Fences never blank**, as in 2D: hidden, a fence's panel shows the asked card's front; revealed, a cloze shows its back, other kinds front, rule, back. Its plate says `?` while hidden. Line cards say `?` on plate and panel.
- **Occlusion cards are left showing** in this slice, as unstudied context, rather than hidden behind a `?` that would ask for the whole diagram. Masks in near panels are slice 3.
- **No session total.** Free exploration's area moves, so the panel shows "N reviewed · M hidden here" instead of "x/N".
- **A key rated this session is never asked again in it**, even if Again makes it due a minute later (2D spatial does the same).
- **"Next" picks the nearest hidden card to the camera in a straight line** (`nearestTarget`). Due-driven ordering along graph paths is slice 2's job, and replaces this choice only in that mode.
- Rating keys 1–4 and Space are registered on the view's `Scope` and pass through when no session is running.

**Surface map**

| File | Change |
|---|---|
| `src/database/types.ts` | `StudyMode` gains `"relational"` |
| `src/store/ReviewLog.ts` | `STUDY_MODES` and empty rollup include `relational` (so `parseStudyMode` keeps it) |
| `src/stats/aggregate.ts`, `src/stats/detail.ts` | `relational` in mode totals |
| `src/views/StatsView.ts` | "Relational" series in the Study mode chart, and in the Mode filter |
| `src/graph3d/study.ts` (new) | Pure: `nodeCardKey`, `studyTargets`, `nodeStep`, `studyNode`, `nearestTarget` |
| `src/graph3d/study.test.ts` (new) | Unit tests for the above |
| `src/views/Graph3DStudy.ts` (new) | The session: targets, reveal, rate, next, the study panel |
| `src/views/Graph3DView.ts` | "Relational study" header action, `redraw`, `nearest`, click routing, Space/1–4 on the scope, `decorate` on every `setData` |
| `src/views/Graph3DScene.ts` | `viewpoint()`: the camera position |
| `styles.css` | `.osmosis-graph3d-study` panel (top right; above the corner on phones) |
| stats tests (`aggregate`, `detail`, `ReviewLog`) | Expect `relational` |

**Fixture:** `e2e/fixtures/graph3d/Rules of the Road.md` → `vault/tests/graph3d/Rules of the Road.md`. Line cards `os-rr1` (due 2026-10-20), `os-rr2` (new), `os-rr3` (not due until 2027-03-01: the control, never hidden), a basic fence `rr-lights` and a two-group cloze fence `rr-sounds` (all due). It links to `Crew Drills` (five due drill cards one hop away) and `Sailing Basics`. Generation was checked with `processNote`: 3 fence cards, 3 line cards, fence keys `rr-lights`/`rr-sounds`.

**Manual test.** Reload Obsidian (Ctrl+R) first. Open `tests/graph3d/Rules of the Road.md`, run "Open 3D graph for current note", click the graduation-cap header action.
1. The panel appears top right. `os-rr1`, `os-rr2` read `?`; `os-rr3` and "When in doubt…" read normally. `rr-lights` shows "Which sidelight…" with no answer; `rr-sounds` shows its first blank. The Crew Drills lines read `?` too.
2. Click a `?`: the camera flies to it, hint says "Recall it, then reveal". Click it again or press Space: the line's text appears and Again/Hard/Good/Easy show. Press 3: "1 reviewed", the node stays revealed.
3. `rr-sounds`: rate the first blank; the node asks the second blank. Rate it; it shows the filled sentence normally.
4. "Next" flies to the nearest `?` (and recentres the loaded area on its note).
5. Stop. Check the note's `osmosis-schedule` for `os-rr1` moved, and Stats → Study mode shows a "Relational" bar; the Mode filter has "Relational".
6. Restart study: rated cards are no longer hidden (not due).

**Could not verify:** anything on screen (I can't run Obsidian): the panel layout on a phone, that Space/1–4 reach the view's scope while the canvas has focus, and how a fence node behaves when its schedule is written into it mid-session (its parse ID changes, so the node is re-created and re-settles; a revealed card stays current through that, but a stepping cloze fence may lose "current" after its first rating and need a click again).
