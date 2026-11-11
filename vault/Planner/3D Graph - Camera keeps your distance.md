---
title: 3D Graph - Camera keeps your distance
summary: "Arrow-key node navigation (and edge-click rides) must never change the camera's distance; root-cause which path snaps it to a fixed stand-off."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[3D Graph - Arrow-key navigation]]"
  - "[[3D Graph - Smooth hover arrival in Planets]]"
  - "[[3D Graph - Hop to another note lands on a stale position]]"
  - "[[3D Graph - Lane clicks in Planets don't fly]]"
  - "[[3D Graph - Focus changes only on purpose]]"
status: In-Review
priority:
progress:
date_created: "2026-11-10T12:00:00.000Z"
date_modified: "2026-11-11T00:20:00.000Z"
date_start_scheduled: "2026-11-11T00:06:29.000Z"
date_start_actual: "2026-11-11T00:06:29.000Z"
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

## What happened?

Sawyer: "when I select a node, zoom to a distance I like, then navigate with arrow keys, it zooms to a fixed distance away." He picks a viewing distance he likes (zooming in or out after selecting a node), then presses an arrow key to move to a neighbouring node, and the camera snaps to a fixed distance instead of keeping his.

Also: clicking an edge rides along it (`rideAlong`) and arrives at a fixed stand-off distance instead of the distance he already had. This applies across note hops too.

## What should have happened?

The camera's distance to its target is unchanged by arrow-key navigation, including hops to a node in another note, and by edge-click rides. The distance the user chose (by zooming) is the distance they keep.

## Steps to Reproduce

1. Open a graph, select a node, zoom in or out to a distance you like.
2. Press an arrow key to move to a neighbouring node (same note, then a different note).
3. Click an edge to ride it.

In each case the camera ends at a different, fixed distance.

## Batch and checkpoint

Round 7, Batch A (fixes). Checkpoint: checkpoint 1 (A + B) (checkpoint 1 = A + B, checkpoint 2 = C, checkpoint 3 = D).

## Decisions (settled with Sawyer, 2026-11-10 design session; not to be re-decided)

> Camera NEVER changes distance on arrow-key nav (Sawyer sees it snap to fixed distance — find the path); edge-ride arrival keeps current distance too.

The first step is **root-causing** which path snaps. The code reading says `glideTo` keeps distance, so the culprit is likely one of the other paths listed under code facts. Do not guess: reproduce (log the camera-to-target distance before and after each path) and report which path it is before fixing.

## Code facts (from the round 7 scout, 2026-11-10)

Refs are as of the scout; spot-check them before relying on a line number.

- Arrow keys: `glideTo` keeps distance on paper; Planets `hoverPose` keeps distance on paper.
- Cross-note hops use `flyTo` with fixed stand-offs: `NOTE_STAND_OFF = 160` / `LINE_STAND_OFF = 70` (`src/views/Graph3DScene.ts:282-283`); used at `:1312` (`distance = isNoteRoot(node.graph) ? NOTE_STAND_OFF : LINE_STAND_OFF`) and `:1542` (`standOff = isNoteRoot(to.graph) ? ...`).
- Edge click `rideAlong` arrives at the same fixed stand-offs.
- Pure helpers live in `src/graph3d/arrow-nav.ts`, `flight.ts`, `framing.ts`, `pivot.ts` (with tests); the scene is `src/views/Graph3DScene.ts`, the key handling `src/views/Graph3DView.ts`.

## Acceptance criteria

- Arrow-key navigation within a note leaves the camera-to-target distance exactly as the user left it, in every layout (including Planets).
- Arrow-key navigation that hops to a node in a different note also keeps the distance (no snap to NOTE_STAND_OFF / LINE_STAND_OFF).
- Edge-click `rideAlong` arrives at the current distance, not a fixed stand-off.
- The root cause is named in the note's close-out (which path snapped, and why the reading was wrong).
- Programmatic framing that is NOT navigation (initial open, Home/fit, follow a link from a panel) may still use stand-offs; only arrow keys and edge rides are in scope.

## Test plan

Unit tests (pure logic, in `flight.test.ts` / `arrow-nav.test.ts` / `framing.test.ts` as fits): extract the arrival-pose computation so "keep current distance" is a pure function, and test it for same-note, cross-note and ride-along inputs: the returned pose's distance equals the input distance.

Manual test (fixture: `vault/tests/graph3d/`, the Sailing notes, which link to each other; also open the Anchor notes for Planets):
1. Open `Sailing Basics.md` in the 3D graph. Click a node, scroll to a distance you like (note it, e.g. by eye against a plate).
2. Press arrow keys through siblings and children: the apparent size of the plates must not change as you move.
3. Navigate across a link into another note with the arrow keys: same distance.
4. Click an edge between two nodes: the ride arrives at the same distance.
5. Repeat in Planets layout and in Flat slices.

## Out of scope

- Changing what clicking a node (not arrow keys) does; first-selection framing may keep its stand-off.
- Mouse-look easing, inertia (see [[3D Graph - Globe drag and inertia]]).
- Changing the stand-off constants themselves.

## Working conventions

Conventions: follow CLAUDE.md. Branch `feature/...` or `fix/...` cut from the current release branch (stacked on the previous ticket's branch if the batch workflow says so). `npm run lint`, `npm test`, `npm run build` after each change. Do NOT run Playwright E2E tests. Write unit tests for pure logic (vitest cannot import `obsidian`, so keep pure logic out of `src/views/`). Some src files contain NUL bytes: use `grep -a`. Never `git stash`. Fixtures go in `e2e/fixtures/` and are copied to `vault/`; Obsidian must be reloaded (Ctrl+R) after a fixture is written, and every fixture card must be back-dated. Use neutral domains (no biology) in fixtures and tests. After implementing, STOP and give Sawyer manual test steps; do not mark the note Done or open a PR until he confirms.

## Batch implementation notes (awaiting manual test)

Branch `fix/3d-camera-keeps-distance`, code commit 4954604.

### Which path snapped (found by tracing the code, not measured in Obsidian)

Every arrow-key move goes through one path. The handler calls `navigate({ focus: this.focusPath, … }, …, glide = true)`. The focus note never changes, so `stepTo` always returns a `fly` step, and `travel` calls `Graph3DScene.glideTo`. That holds for a neighbour in another note too: arrow keys never refocus, so the `flyTo` stand-offs at the hop path are never reached. `glideTo` either glides or, in Planets, calls `hoverOver`. No `flyTo` follows the selection change. Neither the near tier nor focus dimming moves the camera.

The reading that "`glideTo` keeps distance" was right about the wrong distance. It kept the **camera-to-orbit-target** distance. But a wheel zoom (`dolly`) re-seats the orbit target at the view depth of the point the cursor aimed at (`aimPoint`), and that point is often not the selected node:
- **Cursor on empty space:** the point is on the ray at `lastDepth`, which was last set when the node was pressed. That is the distance you clicked from, before the click's flight brought you to 70. Zoom from there and the target sits at roughly that old depth. The next arrow press glides you out to it. This is the "fixed distance" (the click-time depth).
- **Cursor on another plate:** the target goes to that plate's depth.
- **Planets, cursor on a surface plate:** `aimPoint` swaps in the planet's core, so the target sits about one radius behind the plate. The first arrow press then hovers about one radius further out.

Edge rides (`rideAlong`) always used `NOTE_STAND_OFF` / `LINE_STAND_OFF`.

### Fix

New pure helpers in `src/graph3d/flight.ts`:
- `viewingDistance(camera, target, focused, heading, minimum)` returns the distance to keep, chosen in this order:
  1. the end distance of a move under way (`heading`);
  2. otherwise, the focused node's depth along the view direction;
  3. otherwise, when there is no focused node or it is behind the camera or closer than `MIN_DEPTH`, the orbit target's distance.
- `glideEnd(camera, target, node, distance)` returns the glide's end pose: looking at the node from that distance, along the current view direction.

`Graph3DScene.viewingDistance()` supplies the heading: a glide's end distance, a flight's offset length, a hover flight's distance, or a ride's stand-off. `glideTo` passes the result to `hoverOver` (Planets) or `glideEnd`. `rideAlong` uses it as the trip's `standOff`, so a Planets ride that lands in a hover view lands at that distance too.

### Decisions worth remembering

- **View depth, not straight-line distance:** the apparent size of a plate depends on its depth along the view, and the test plan checks that "plate size doesn't change". For a node in the centre of the screen the two are the same.
- **A move under way passes on its end distance.** Holding an arrow key repeats faster than a 400 ms glide. Mid-glide the newly focused node is not yet at the viewing distance, so measuring it would make the distance drift with each press. For the same reason, an arrow press during a click's flight lands at that flight's stand-off.
- **Unchanged:** node clicks, refocus flights, search and study flights, and first framing still use the stand-offs (out of scope). The constants are untouched; their comment now says arrows and rides don't use them.
- **Zoomed through a node:** if you zoom past the focused node (it is behind you, or closer than 10), the fallback is the orbit target's distance, which is the old behaviour.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/flight.ts` | `viewingDistance`, `glideEnd`; Trip `standOff` doc |
| `src/graph3d/flight.test.ts` | Tests: focused-node depth vs re-seated target, off-centre depth, fallbacks, heading; same-note and far (cross-note) glides and a ride all end at the kept distance |
| `src/views/Graph3DScene.ts` | `viewingDistance()` (supplies the heading); `glideTo` uses it with `glideEnd` / `hoverOver`; `rideAlong` uses it instead of the stand-offs; doc comments |

### Fixture

Existing: `vault/tests/graph3d/Sailing Basics.md` (links to other Sailing notes) and `Anchor Radial.md` / `Anchor Balance.md` for Planets. No new fixture.

### Not verified

I could not see Obsidian, so I did not log the distances in the live view. The cause comes from reading the code, and the unit tests cover only the pure geometry. Sawyer's manual test is the check. Scrolling with the cursor on empty space just after clicking a node from far away should be the clearest case of the old bug.
