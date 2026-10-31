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
date_modified: "2026-10-31T22:20:00.000Z"
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

The phase is too big for one session, so it ships in three slices, each testable on its own, in dependency order. **Status `In-Review` covers all three slices** (slice 3 is stacked on `feature/3d-graph-mobile-polish`, after slice 2).

1. **Slice 1: the mode, stats, and free exploration** (built, awaiting manual test). The `relational` `StudyMode` everywhere stats list modes. A "Relational study" header action starts a session; due line and fence cards in the loaded area are hidden in place and follow the loaded area as you hop; click a `?` to arrive, click again (or Space) to reveal, rate 1–4 on the shared FSRS schedules; "Next" flies to the nearest hidden card.
2. **Slice 2: due-driven path with the travelled thread** (built, awaiting manual test).
   - Pure `src/graph3d/trails.ts` (the spec's planned file): order the due cards within the configured depth of the *start note* (not only the loaded area) along graph paths, by hop distance over `NoteAdjacency` (`horizon.ts`) from where you stand, ties broken by most overdue then by note order. Unit-test the ordering.
   - Collecting cards beyond the loaded area: card store `getCardsByNote` for every note in `computeHorizon(adjacency, start, depth, backlinks).loaded`, at session start; nodes for them don't exist until a hop loads their note, so the session must `setFocus(note)` first and then `flyTo` the card's line once the reload lands (`reload(true, "^blockId")` already lands on a block subpath; a fence needs its node ID, found in the new model with `nodeCardKey`).
   - A path-mode selector in the study panel (`Graph3DStudy.renderPanel`): Free / Due-driven (Trail joins in slice 3; no dead button until then). `next()` is the extension point: free picks `nearest`, due-driven takes the next stop in the order.
   - The thread: a persistent polyline through the node positions visited this session, drawn by the scene (a new `LineSegments`/`Line` in `Graph3DScene`, like `edges`, disposed in `destroy`), kept across hops while its nodes are loaded. Expose `scene.setThread(ids: string[])`.
3. **Slice 3: authored trails, and occlusion parity** (built, awaiting manual test).
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

### Slice 2: the due-driven path and the travelled thread

Branch `feature/3d-graph-mobile-polish` (stacked on `feature/3d-graph-phase-6`). Built after the mobile polish, so the panel has no title or Stop button.

**First, the slice-1 risk, confirmed and fixed.** Slice 1 flagged that writing a cloze fence's schedule gives its node a new ID and the session might lose "current". Reading the code: the fence's node ID is `line:${path}#${parseId}`, the parse ID hashes the fence text, and the text includes the schedule, so the `ScheduleStore` flush (about 2 s after a rating) rewrites the fence, `resolve` fires, the view reloads (750 ms debounce) and the node comes back under a new ID. `Graph3DStudy` held `current` as a node ID, so `decorate` found it gone and fell back to "a revealed card, else null": after rating a cloze's first blank, Space did nothing and the node needed a click (arrive) and a second click (reveal). A jsdom test reproduces this against the old class (it fails there, passes now). Fix: the session now tracks the current card by its **card key** (`nodeCardKey`: a line's `path#^block`, a fence's own `id:`), which a rewrite does not change; `decorate` finds the node again with the new pure `targetNodeFor` on every model. The key is kept when no node carries it (the card may be about to load), and re-adopted when it appears. Lines were never affected (their IDs come from block IDs).

**Approach.**
- **Stops** (`src/graph3d/trails.ts`, pure): `routeStops(cards, now)` makes one stop per due-or-new node (a line, or a fence with all its due cards in ask order), reusing `dueOrNewLineCardIds`, `dueOrNewFenceCardKeys`, `spatialStudyKeys` and the `askable` filter (now exported from `study.ts`; occlusion stays out until slice 3). `nextStop(stops, rated, hops, skip)` picks by note-hop distance from where you stand, then most overdue (a new card counts as due now, so it comes after overdue ones), then note path and line. `hops` is `computeHorizon(adjacency, standing, huge, true).hops`, so unreachable notes come last.
- **The route** is collected when you choose "Due-driven": every note in `horizon.loaded` at that moment (the notes within the configured depth of the start note), their cards read from the card store. Nodes for notes beyond the loaded area don't exist yet, so `Next` calls `host.goTo(path, find)`: if the stop's node is in the model it is a plain hop; otherwise the view makes `path` the focus, awaits the reload, then `flyTo`s the node found by card key (fences included; no node ID is needed up front).
- **Only route cards are hidden** in this path (`decorate` restricts the card lookup to route notes in the model), so a loaded note outside the route is left showing. Free exploration is unchanged.
- **The thread**: `Graph3DStudy.visited` holds the start note's node ID, then each stop's card key (also a card you arrive at by clicking). `threadNodeIds` resolves them against the model on every `decorate`, `null` for a stop not loaded, and `scene.setThread(ids)` draws a `LineSegments` (amber `#ffb347`) between consecutive resolved pairs, rewritten whenever the scene is dirty so it follows settling nodes. A `null` breaks the thread instead of bridging. It is disposed in `destroy`, cleared when study stops or you go back to Free.
- **Panel**: a path row of two thumb-sized buttons (Free, Due-driven; the active one is `mod-cta`) between the progress line and the action row, hidden while a revealed card awaits its rating. Due-driven's progress reads "N reviewed . M to go" over the whole route (Free's reads "hidden here").

**Decisions worth remembering.**
- **"Start note" is the focus when you choose Due-driven**, and the route set is fixed from then on. The horizon follows you only in that the loaded area moves with each flight; it does not grow the route. Reason: a route that re-collects at every hop never ends and can't show "M to go". Choose Free then Due-driven again to re-collect from where you stand.
- **Ordering uses links in both directions** even with Backlinks off: a route is flown, not followed, and a dead-end note (like Current Cards) would otherwise make everything behind it unreachable.
- **The route is a snapshot of the card store** taken at selection; finished stops are tracked by the session's `rated` set, as in free exploration (an Again-rated card is not asked twice in a session).
- **Next skips the current stop** (it stays on the route for later), and is disabled when no other stop is left.
- **Nothing auto-advances**: after rating, you press Next. Matches free exploration; an auto-fly would also pull the camera while you read the revealed answer.
- **`setThread` takes `(string | null)[]`**, not `string[]` as the slice plan wrote, for the gap marker.
- No Trail button until slice 3.

**Surface map**

| File | Change |
|---|---|
| `src/graph3d/trails.ts` (new) | `routeStops`, `nextStop`, `stopDone`, `cardsToGo`, `threadNodeIds`, `threadSegments` |
| `src/graph3d/trails.test.ts` (new) | Ordering (distance, overdue, note order, unreachable, skip, a walked route), stops, thread resolution and segments |
| `src/graph3d/study.ts`, `.test.ts` | `targetNodeFor` (the current-card fix); `askable` exported |
| `src/views/Graph3DStudy.ts` | `currentKey`; path state, route collection, `setPath`, `nextOnRoute`, `arrive`, thread sync; path row in the panel; new host methods |
| `src/views/Graph3DStudy.dom.test.ts` (new) | jsdom: current card through a fence rewrite; route collection, hop order, beyond-loaded flights, thread, route-only hiding |
| `src/views/Graph3DView.ts` | Host methods `focusPath`, `loadedNotes`, `hopsFrom`, `goTo`, `thread` |
| `src/views/Graph3DScene.ts` | `setThread`, `writeThread`, the thread `LineSegments` (disposed in `destroy`) |
| `src/test/obsidian-stub.ts` | `Notice` stub (records messages) |

**Fixture:** `e2e/fixtures/graph3d/{Route Planning,Tide Cards,Current Cards,Buoy Cards}.md`, copied to `vault/tests/graph3d/`. `Route Planning` (start; `os-rp1` due 2026-10-21, `os-rp2` new) links to `Tide Cards` (`os-td1` due 2026-10-11, `os-td2` due 2026-10-26) and `Buoy Cards` (`os-by1` due 2026-10-28; `os-by2` not due until 2027: the control). `Tide Cards` links to `Current Cards` (`os-cu1` due 2026-10-01), which links to nothing. Nothing links back, so with Backlinks off, flying the route leaves the loaded area. Expected route at depth 2: rp1, rp2, td1, td2, cu1, by1 (the last needs the area to reload around `Buoy Cards`).

**Manual test.** Reload Obsidian (Ctrl+R) so the new notes are indexed. Open `tests/graph3d/Route Planning.md`, run "Open 3D graph for current note" (depth 2), click the graduation-cap header action.
1. The panel shows Free (highlighted) and Due-driven. Choose Due-driven: "0 reviewed . 6 to go"; the six due lines read `?`, `os-by2` ("A green buoy...") reads normally.
2. Press Next: the camera flies to the oldest due line in Route Planning. Click it again (or Space), rate 3. Next goes to the other Route Planning line (the new card).
3. Next again: flies to Tide Cards (the loaded area recentres), and an amber line runs from the start note through the stops to it. Rate it, Next: the second Tide line; Next: Current Cards (Route Planning is no longer loaded, so the thread stops at the edge); Next: Buoy Cards, the area reloads around it and the thread resumes only between loaded stops.
4. At the end the hint says the route is finished and Next is disabled. Click Free: the thread disappears; hidden cards behave as in slice 1.
5. The slice-1 risk: in `Rules of the Road.md`, in Free, arrive at `rr-sounds`, reveal, rate the first blank, wait about 3 s for the rewrite, then press Space: it should reveal the second blank without clicking again.
6. Stop (header action): the schedule changes are on disk (`os-rp1` moved), Stats shows Relational.

**Could not verify** (nothing was seen in Obsidian): that the thread is visible enough as a 1 px line (WebGL ignores line width; if it is too faint, widen it with a thin tube or a second offset line); that the amber reads against every theme; the real timing of the fence-rewrite reload against the new current-card tracking; the Backlinks-on case (ordering already counts both directions, but the loaded area then differs); and Next with a stop whose note was renamed or deleted mid-session (its node never loads, and Next then picks the same stop again until you rate or skip it by choosing another).

### Slice 3: authored trails and occlusion parity

Branch `feature/3d-graph-mobile-polish`, on top of slice 2. This is the last slice of Phase 6.

**Trails.**
- **The note.** `src/graph3d/trail-note.ts` (pure): `parseTrail(text)` reads the first wikilink of every list item (bulleted or numbered, nested too) after the frontmatter, skipping prose, embeds, empty links and code fences, into `{ target, subpath }` (`subpath` is everything after the first `#`: `^os-rr1`, `Lights and sounds`, or `""`). `serializeTrail(stops, title?)` writes the marker plus one item per stop and reads back to the same stops. `isTrail(frontmatter)` is the `osmosis-trail: true` test.
- **The steps.** `trailSteps` in `trails.ts` (pure) resolves each stop to a note (a link that resolves to nothing is dropped and counted) and attaches the due or new card at a `^block` stop (reusing `routeStops`), else `null`: the stop is visited and shown, not rated.
- **The path.** A third "Trail" button in the path row opens `Graph3DTrailPicker` (a `FuzzySuggestModal` over notes with the marker; a Notice if the vault has none) and starts walking from the top. `Graph3DStudy` keeps `trail`, `trailAt` (a cursor, -1 before the first stop) and `trailKeys`. "Next" is `nextOnTrail`: advance the cursor, `host.goTo(path, model => linkTargetNode(model, path, subpath))` (the model's own subpath resolver, so a heading, a block or the note core lands the same way a link click does, and a note beyond the loaded area is loaded first as in due-driven), and make the stop's card the current one if it has one. The thread is the stops walked so far, resolved on every model; one whose note is not loaded breaks it. Only the trail's own cards are hidden (`trailKeys`), though other cards in the same notes may be due. Progress reads "N reviewed . stop k of n"; Next is disabled at the last stop; the idle hint says when a stop is "shown, not rated".

**Occlusion parity.** `askable` is gone (it only filtered occlusion cards), so line and fence occlusion cards are targets like any other. `studyNode` now gives such a node `masks: { occlusion, side }` (new optional `GraphNode.masks`): side `front` while hidden (the asked group covered, the siblings as the diagram's mode says), `back` once revealed (ringed), `GraphNode.label` is `?` while hidden. In `Graph3DNear` a panel whose node has `masks` draws the diagram with the existing `renderOcclusion` (new `renderDiagram` constructor argument, supplied by the view, which has the app) instead of rendering Markdown; revealing or moving to the next group repaints the masks in place with `repaintOcclusion`, so the image never reloads. `nearMarkdown` returns a stand-in `![](image)` for a masked node, which keys a refill when the diagram changes and lets `panelBoxEm` size it as the image it is. A node whose groups are all rated drops out of the targets and shows its own text again.

**Decisions worth remembering.**
- **The marker is `osmosis-trail: true`**, as the slice plan proposed (a judgment call, easy to rename in `TRAIL_MARKER`).
- **Trail order is a cursor, not `nextStop`.** `nextStop` orders by hop distance, which is the opposite of an authored order; the trail reuses `goTo`, the thread and the current-card-by-key tracking, but not the ordering.
- **A trail cannot ask a fence.** A fence has no block ID to link to; its key is its `id:`. Link a heading above it for a visit-only stop. Left out rather than inventing link syntax.
- **Next does not require a rating.** Pressing it on an unrated card moves on and leaves the card hidden, as in due-driven.
- **`serializeTrail` has no caller yet.** The spec asked for it with round-trip tests; nothing in the UI writes a trail (no feature beyond the ask).
- **The masked plate says `?`** like every other hidden card, even for a line that 2D would leave showing its image. Far away you see `?`, up close the masked diagram. 2D never blanks an occluded line because there the masks are the whole node.
- **The masked panel shows only the asked diagram.** A fence that holds prose or a second, unmasked diagram (like `surface-parts`) shows just the asked diagram in its panel, not the whole fence as the 2D map does, because the panel is drawn by `renderOcclusion` from the card's `occlusion`, not rendered from Markdown (an embed rendered by `MarkdownRenderer` has no guaranteed `img` at the moment the render promise resolves, and `renderOcclusion` is what the other three surfaces use).
- CSS: `.osmosis-graph3d-near-body .osmosis-occlusion .osmosis-occlusion-image { width: auto }`, the same fix `.osmosis-study-card` has, so the panel's 15 em height cap keeps the picture's proportions and the masks stay on their regions.

**Surface map**

| File | Change |
|---|---|
| `src/graph3d/trail-note.ts`, `.test.ts` (new) | `parseTrail`, `serializeTrail`, `stopLink`, `isTrail`, `TRAIL_MARKER`; round trips, fences, embeds, frontmatter |
| `src/graph3d/trails.ts`, `.test.ts` | `TrailStep`, `trailSteps`; `routeStops` keeps occlusion cards |
| `src/graph3d/study.ts`, `.test.ts` | `askable` removed; `studyNode` sets `masks` for occlusion cards |
| `src/graph3d/model.ts` | `GraphNode.masks` |
| `src/graph3d/near.ts`, `.test.ts` | `nearMarkdown` stand-in for a masked node |
| `src/views/Graph3DNear.ts` | `NearDiagramRenderer`; masked panels draw and repaint the diagram |
| `src/views/Graph3DScene.ts` | `renderDiagram` option, passed to `Graph3DNear` |
| `src/views/Graph3DStudy.ts`, `.dom.test.ts` | Trail path, cursor, thread, hiding only trail cards; host `pickTrail`, `resolveLink`; tests for the trail and a two-group occluded line |
| `src/views/Graph3DTrailPicker.ts` (new) | `FuzzySuggestModal` over trail notes |
| `src/views/Graph3DView.ts` | `trailNotes`, `pickTrail`, host wiring, `renderDiagram` |
| `styles.css` | Occluded image in a near panel keeps its proportions |

**Fixtures.**
- Trail: `e2e/fixtures/graph3d/Harbour Trail.md` -> `vault/tests/graph3d/Harbour Trail.md`. Six stops over existing graph3d fixtures: `[[Sailing Basics]]` (plain note), `Rules of the Road#^os-rr1` (due line), `Rules of the Road#Lights and sounds` (heading), `Buoy Cards#^os-by2` (not due until 2027: visited and shown), `Tide Cards#^os-td1` (due), `Route Planning#^os-rp2` (new).
- Occlusion: no new fixture; the existing `vault/tests/flashcard/occlusion-surfaces.md` (master `e2e/fixtures/occlusion-surfaces.md`, images in `vault/media/`) has a two-group fence and a three-group line, all overdue or new.

**Manual test.** Reload Obsidian (Ctrl+R) so the new note is indexed.

*Trail.* Open `tests/graph3d/Harbour Trail.md`, run "Open 3D graph for current note" (depth 1 loads every stop's note), click the graduation-cap header action.
1. The path row reads Free, Due-driven, Trail. Click Trail: a picker lists `Harbour Trail` (and any other note with `osmosis-trail: true`). Choose it: "0 reviewed . stop 0 of 6". `os-rr1`, `os-td1` and `os-rp2` read `?`; the other due cards in those notes (e.g. `os-rp1`, the Rules of the Road fences) stay showing.
2. Next: flies to Sailing Basics; the hint says no card is due, shown not rated; there is no Reveal. Next: flies to `os-rr1`; click it or press Space, then rate 3 ("1 reviewed"). Next: the "Lights and sounds" heading. Next: `os-by2` ("A green buoy..."): shown, not rated, never `?`. Next: `os-td1`, then `os-rp2` and "stop 6 of 6"; the hint says the trail is finished and Next is disabled.
3. An amber thread runs through the stops walked so far.
4. Start from another note with a small depth (e.g. open the graph from `Weather` at depth 1) and choose the trail: stops beyond the loaded area are flown to by loading their note first, and the thread breaks where a note is not loaded.
5. Choose Free: the thread goes. Dismiss the picker (Esc): the path is unchanged.

*Occlusion.* Open `tests/flashcard/occlusion-surfaces.md` (reset it from `e2e/fixtures/` and Ctrl+R if you have rated it before), open its 3D graph, start study in Free.
6. The `os-elevat1` line (the span elevation) and the `surface-parts` fence read `?` on their plates. Fly close: their panels show the diagram with the asked group covered in purple/amber and the siblings covered too.
7. Click the line twice (or Space): the group is ringed (answer side), with Again/Hard/Good/Easy. Rate: the same node asks the next group, covered again (c1 -> c2 -> c3). After the last it goes back to its normal look. The fence asks `c1` then `c2` the same way.
8. Stop and check Stats: Relational has the ratings.

**Could not verify** (nothing was seen in Obsidian): that `renderOcclusion` finds the image in the 3D near-tier panel (it needs `getFirstLinkpathDest` to resolve the embed target from the node's note); that the masks line up with the picture inside the 15 em height cap (the CSS fix mirrors the study card's); the panel's cross-fade with the DOM image still decoding; a masked panel on a phone; that a fence's second panel group appears after the schedule rewrite re-creates its node; and the picker on a phone. The panel only draws the asked diagram, so a fence's prose and unmasked sibling are not shown there. Fences cannot be trail stops.
