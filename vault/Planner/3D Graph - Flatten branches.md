---
title: 3D Graph - Flatten branches
summary: "A flatten slider in the Overlays menu: below a chosen outline depth, a note's branches lie flat as the 2D mind map lays them out (children in document order), each in a slice through the note's core with its outline depth running outward, while the note's top and the links between notes stay 3D."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[3D Graph Phase 8 - 2D-3D toggle]]"
  - "[[3D Graph - Editor anchoring and overlays fixes]]"
status: In-Review
priority:
progress:
date_created: "2026-11-03T17:35:29.000Z"
date_modified: "2026-11-07T13:30:00.000Z"
date_start_scheduled: "2026-11-04T02:43:45.000Z"
date_start_actual: "2026-11-04T02:43:45.000Z"
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
cover:
color:
pull_request:
---

# Feature Request

## Why

Sawyer, 2026-11-03, paraphrased: a 2D mind map is compact and easy to read, but it's arbitrarily hierarchical; knowledge is "connections within connections", and the 3D graph shows that blend. The Hierarchy⟷organic slider leaning toward hierarchy helps, but traversing branches they still sprawl in 3D. Like a hand: the palm can curve so the fingers radiate, or lie flat. Wanted: nodes near a note's root stay 3D, and branches get flatter as they extend, to be as readable and editable as 2D while keeping 3D's connections. Also: **order matters**. An ordered list of 10 items lands in random places today, with no sense of 1, 2, 3; even unordered lists usually have a logical top-to-bottom order.

Settled in a grilling session the same day; the decisions below are Sawyer's. Terms as in `GLOSSARY.md` (outline depth, flat branch, flat depth).

## What do you need built?

- **Depth is outline depth**, counted within each note's own outline (title → headings → list items). Not hops from the focus note. Cross-note edges keep the 3D blend.
- **Flatten slider**, a *separate* slider in the Overlays menu (not folded into Hierarchy⟷organic). Its ends: far left nothing flattens (today's look); moving right, flattening starts higher in each outline; far right, everything under a note's title is flat. A gradual ramp over a depth or two, not a hard cut.
- **Default: moderate** (list items and deep headings flat out of the box), for new and existing users.
- **Live re-settle:** moving the slider unpins and re-settles the loaded nodes live, like the Hierarchy⟷organic slider (`Graph3DScene.reshape`). This is a **second deliberate exception** to "settled nodes never move", approved by Sawyer 2026-11-03. Don't extend it to any other path.
- **Shape and order:** a flat branch takes the **2D mind map's shape**: children stacked top to bottom in document order beside their parent, so a numbered list reads 1, 2, 3 down the page. Reuse the 2D `computeLayout` for the subtree rather than inventing a layout (Phase 8's lift-off also seeds 3D from `computeLayout`; share that path if it exists by then).
- **Facing:** each flat branch lies in a plane **facing outward from its note's core** (normal along core → branch root), so a note reads like a flower of flat petals from any side. Pick "up" within the plane consistently (e.g. world up projected onto the plane) so text and order read top to bottom. **Changed after Sawyer tested slice 1 (2026-11-07):** each flat branch is now a slice *through* the core, its outline depth running straight outward. See the slice plan and "Feedback round 1" below.
- Fixed at settle time; plates still billboard to the camera as now.

## Open (for the implementing session to decide and report)

- How to impose the plane and order with d3-force-3d: a custom force pulling flat-branch nodes toward their 2D-layout targets in the branch plane (strength ramped by depth), versus pinning flat branches outright once their branch root settles. Measure tick time on the stress web either way (`settle.ts` limits charge to free nodes; keep that cheap).
- How cross-note edges from a flat branch pull without bending it out of its plane.
- Plate-aware spacing (`linkDistance`, plate extents) inside a flat branch: the 2D layout's spacing is in its own units; scale it to plate sizes.

**Acceptance:**
- At default, a note with a 10-item ordered list shows the list flat, items 1–10 top to bottom beside their parent; the note title and top headings still spread in 3D; links between notes still pull in 3D.
- Slider far left reproduces today's layout; far right flattens everything under each title.
- Dragging the slider re-settles live; nothing else moves settled nodes.
- Stress web tick time is reported before and after.

## Every phase

- Add or extend the fixture web in `e2e/fixtures/graph3d/` (include an ordered list of 10, a nested list 4 deep, and a cross-note link out of a deep item), copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.

## Slice plan

Rewritten after feedback round 1 (2026-11-07). Slice 1's tangent planes are gone; the cause is under "Feedback round 1" below.

**Geometry: slices through the core, like apple slices.** A flat branch's root is an ordinary 3D node. Its plane contains the note's core and the root: the 2D map's left-to-right axis `u` points from the core through the root, so the root sits nearest the core and each deeper outline depth sits further out, like the Earth's layers in a cut-away. Document order runs along the slice, on the axis `v` across `u`. A line at 2D-layout offset (dx, dy) from its root sits at `root + dx·u + dy·v`. Its outward offset from the root is dx, which grows with depth.

**Twist.** Each slice can turn about its own `u`, and the turn is `v`. Each tick a free slice turns 10% of the way towards its *preferred twist*. This is the least eigenvector of a 2×2 tensor built from the directions, around the core, of the note's other slices (each weighted by about 1/angle², fading to nothing at a reach of 0.8 rad, or 3× the slices' typical spacing in a note of many), plus a lean towards upright (world down laid across `u`), so a slice with no close neighbours reads top to bottom. The slice ends up lying along the gap between its neighbours rather than pointing at one. Its sign follows the previous tick, so the slice never flips. The twist is kept by the slice's head ID in `FlatState`, across ticks and re-settles. A pinned slice keeps its twist, so a line that arrives later lands in the same plane. Each slice's twist is weighed every 4th tick, at the compounded rate (cost).

**No clipping between branches (no decluttering).** Each slice has a conservative footprint: a box in its own (u, v) coordinates that holds every plate's *reach* (half its larger side), both along and across the plane, because plates turn to face the camera. Each tick, two slices of one note whose oriented boxes overlap (separating-axis test) push their heads apart along the shallowest axis, by 0.5 of the overlap. Like d3's collide force, the push is not scaled by alpha, so it wins at rest: if room is short, slices spread apart rather than overlap. Only slices of the same note are compared. Notes are kept apart by the note push (next paragraph).

**Charge.** Rigid lines leave the many-body force, which keeps a tick cheap. Their strength goes to their note's core (`flatCharges`), not to the branch root. Each tick `notePush` gives every charged node of each *other* note the push that note's core feels from it (d3's law, strength × alpha / distance). So a note moves as a whole, and its own lines never feel their own core.

**Ramp: a continuous flat depth F.** The slider maps 0–1 to F = 1 + (1 − slider)·4 (off at 0). Roots are the lines at depth ⌊F⌋ that have children. Their children are *ramp lines*, with weight w = `flatWeight(⌊F⌋ + 1, F)` = 1 − frac(F). Each ramp line carries everything under it rigidly, as its *sub-slice*.
- w = 1 (a whole flat depth): the ramp lines are rigid members too, and the whole branch is one slice.
- 0 < w < 1: the ramp line stays a free node. It is pulled towards its slot in the branch with an alpha-scaled pull of alpha·w/(1 − w), capped at 0.5 a tick. The pull keeps its balance with links and charge as the layout cools, and it stiffens to rigid as w → 1. The line keeps (1 − w) of its charge, and its edge to the root pulls at (1 − w). Its sub-slice's frame turns from its own (outward from the core, with its own twist) towards the branch's by w.
- w → 0: each ramp line is a 3D root with its own slice. That is exactly the state at the next whole depth down, so dragging never jumps.
- Clash weights: a branch's box (where its ramp lines are heading) counts by w, and a sub-slice counts fully. Two sub-slices of one branch clash on a footprint that eases from every plate's reach to the plates' heights alone as w → 1, so they can settle into their slots.
- *Why not the old slice-2 plan:* it pinned the lines below the ramp depth to the shallower root's plane. At F just below a whole depth, those lines would switch from their own heading's slice to the title's, which is a jump.

**Spacing** (unchanged): `computeLayout` per note, each line sized as its plate or near-tier panel, column gap 18 and row gap 1.5, cached per parse.

**Cost budget.** Default ≤ about 2× 10 ms a d3 tick on the stress web (`e2e/measure-graph3d-ticks.ts`). Measured: 16–17 ms. The full table is under "Feedback round 1".

**Slices.**
1. Rigid flat branches at whole flat depths. Built 2026-11-04 (53f0c8b). Its geometry and charge hand-off were replaced in round 1.
2. Slices through the core, twist, anti-clipping, the continuous ramp. Built in feedback round 1 (this note, below).
3. **Only if testing shows it: new lines inside a settled flat branch** (unchanged). A line typed into a settled branch arrives free and drops into its 2D slot, where a pinned sibling may already sit. Settled nodes may not move, so the fix can only be where the new line goes.
4. **Possible follow-ups, not built:** clash between slices of different notes (measured too slow with a plain broad phase, about +20 ms a tick on the stress web), and clash protection for leaf ramp lines (charge only for now).

## Batch implementation notes (awaiting manual test)

Slice 1 is recorded first, as built. Feedback round 1 (at the end) replaced its plane orientation, its charge hand-off and its stepped slider. Where the two disagree, round 1 holds.

Built on `feature/3d-graph-flatten` (stacked on the Follow a link tip, e2b2005). Code commit 53f0c8b. Not pushed, no PR, not tested in Obsidian. Slice 1 of the plan above; slices 2 and 3 remain.

### What it does

- **Outline depth** is the line's depth in its note's parse tree: the title (H1) is 1, what sits under it is 2, and so on. A note with no H1 starts its headings at 1.
- **Flat depth** comes from the slider (`flatDepth`): off at 0, then 4, 3, 2, 1 at 0.25, 0.5, 0.75 and 1. The default is 0.75, so flat depth 2: the title and the headings under it spread in 3D, and everything deeper lies flat. `normalizeOverlays` gives the default to a data.json without the field, so existing users get it too.
- **A flat branch** hangs off each line at the flat depth that has children (its *root*, an ordinary 3D node). Everything under the root is a member, laid out as the mind map lays it out, to the right of the root, in a plane through the root whose normal runs from the note's core to the root. "Up" is world up laid into the plane (world −z for a plane facing straight up or down), and "right" is right as seen from outside, looking back at the core. So from outside a note, its petals read left to right and top to bottom.
- **The live re-settle:** `setOverlays` calls `reshape` when `flatten` changes, as it does for `forceBalance`. The `reshape` comment now names both approved exceptions. Nothing else lets go of settled nodes: `flattenStep` skips pinned members, and never hands a pull to a pinned root.

### Decisions worth remembering

- **Rigid, not a spring and not pins.** The reasons are in the slice plan. A member is still a free node (no `fx`), so the camera follows a focused member, and `settle()` pins it where the force put it.
- **The pull of edges leaving a branch is averaged, not summed.** Edges inside a branch have strength 0, so a member's velocity before the step is purely external pull. A sum is unstable: ten members linked to one hub, each pulled at d3's default strength, would overshoot the root every tick. The average behaves like one link on the root. The other end of each edge still feels its full pull.
- **The root pushes with all its members' charge** (`flatCharges`), as a settled core does in `settle.ts`. Seen from outside, the branch pushes about as hard as before.
- **Layout sizes include the near-tier panel**, as plate-aware spacing does: siblings in one plane would otherwise cover each other's panels the moment you come near. This leans large; a branch of code blocks gets tall.
- **The slider steps whole depths in this slice.** A fractional value (from a hand-edited data.json) cuts at its floor. The ramp is slice 2.
- **Far right is flat depth 1:** the H1 is the branch root and everything under it is one flat branch. Depth 0 (the core itself as root) has no outward direction, so it can't face out.
- **A leaf at the flat depth stays 3D.** A branch needs children, and a lone line has no branch to lie in.
- **The measurement script is committed** (`e2e/measure-graph3d-ticks.ts`, run with esbuild and node; instructions in its header), so later slices and the stress-web 2 fps ticket can measure the same way. **A fact for [[3D Graph - Stress web first settle runs at 2 fps]]:** the perf gauge's "tick" is the scene's own per-frame work, not d3's tick, which runs in 3d-force-graph's own loop. Headless, the d3 tick on the stress web is about 300 ms at first load, which matches that ticket's "unaccounted ~340 ms a frame". At the default flatten it is about 10 ms.
- **Lift-off (2D → 3D):** members snap from the map's seeds into their petals on the first tick, oriented core → root, while the rest lifts off as before. That is a visible jump for the deep lines. It could be smoothed by seeding members at their petal targets, but I left the lift-off code alone.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/flatten.ts` (new) | `flatDepth`, `FlatLayouts` (per-note `computeLayout` at plate sizes, `branches`), `branchOf`, `sameBranch`, `flatCharges`, `branchPlane`, `flattenStep` |
| `src/graph3d/flatten.test.ts` (new) | 16 tests: slider mapping, branch cutting at each depth, document order and plate-sized rows, a list of ten 1–10, edges inside and outside a branch, charge hand-off, plane basis (straight, tilted, vertical), the step (placement after integration, pull averaged onto the root, pinned root, pinned member) |
| `src/graph3d/overlays.ts`, `.test.ts` | `flatten` field, default 0.75, clamp 0–1 |
| `src/views/Graph3DOverlays.ts` | "Flatten branches" slider in Forces (step ¼, instant), with a description naming the flat depth |
| `src/views/Graph3DScene.ts` | The `flatten` d3 force (added last); `pushData` cuts the branches and hands charge to roots; `linkStrength` 0 inside a branch; `flatSize`; layout cache cleared on relabel and theme; `setOverlays` reshapes on a flatten change; `reshape` comment names both exceptions |
| `e2e/measure-graph3d-ticks.ts` (new) | Headless stress-web tick measurement with a plane and order check |
| `e2e/fixtures/graph3d/Passage Plan.md` → `vault/tests/graph3d/` (new) | Fixture |

### Fixture

`vault/tests/graph3d/Passage Plan.md` (master in `e2e/fixtures/graph3d/`): a numbered list of 10 under "## Before casting off" (depth 3), a list nested 4 deep under "## Route" whose deepest item links to [[Navigation]], and an H3 with bullets under "## Watch schedule". There are no code fences, so sync stamps nothing. **Reload Obsidian (Ctrl+R)** after pulling the build.

### Manual test (Sawyer)

1. Open `Passage Plan.md`, run "Open 3D graph for current note" (depth 2 is fine). **Default:** under "Before casting off", items 1–10 lie flat to the right of the heading, 1 at the top and 10 at the bottom, evenly spaced. The Route list is a flat staircase to the right of "Route". "Night watches" and its three watches are flat to the right of "Watch schedule". The title, the paragraph and the three headings still spread in 3D around the core. Orbit around the note: each flat branch faces away from the core, like petals, and reads top to bottom from outside.
2. **Cross-note pull:** Navigation's core sits towards the Route branch; the edge from "Read its light pattern in Navigation" runs to it. The Route branch stays flat.
3. **Slider far left (Off):** everything re-settles live into the old 3D look (lists in random places). **Far right:** each note's whole outline under its title lies as one flat 2D map beside the title. Step through 4, 3, 2: flattening starts higher as you go right. At 3, the numbered items spread in 3D (they have no children), and only the Route sub-lists are flat. Every step re-settles while you drag, and the camera stays on the focused node. Within about 15 s everything is still again.
4. **Nothing else moves settled nodes:** after it settles, hop to Navigation, then back, and run a search/go-to. Plates already settled stay exactly where they are; only arrivals settle.
5. **Regression, Hierarchy ⟷ organic:** drag it from 0.5 to 0 and to 1. It still re-settles live, and flat branches stay flat (they move as whole pieces). Then hop: nothing settled moves.
6. **Regression, follow a link:** click the Route → Navigation edge (off the plates). The ride runs along it and lands on the plate. Ride a hierarchy edge inside a flat branch, too.
7. **Regression, edit mode:** pencil on, double-click "Fill the water tanks", edit, Ctrl+Enter. The plate keeps its spot, and the others don't move. Press Enter on a numbered item to add a line: the new line appears beside its parent (not necessarily in its numbered slot; see slice 3) and stays put.
8. **Regression, lift-off:** open `Passage Plan.md` as a mind map and click the orbit (Switch to 3D) button. The map lifts into 3D; the deep lines jump into their flat petals at the start, which is expected (see Decisions). Switch back to 2D: the map lands on the focused line, as before.
9. **Stress web (perf):** `vault/tests/graph3d-stress/Stress Hub.md` (run `node e2e/generate-graph3d-stress.mjs` if it is missing), depth 2, with the perf gauge on. At the default, the first settle should be far smoother than the 2 fps before. Then drag Flatten to Off and watch the fps drop back while it re-settles.

### Not verified

Nothing has run in Obsidian. Unverified: how the petals look (row gap, panel-sized rows, plane orientation from every side), the camera follow during a flatten re-settle, the actual first-settle fps in Obsidian (the 300 → 10 ms is headless, with plate sizes estimated from label length), the lift-off jump, and how the averaged pull feels on a note with many cross-note links. Lint, the full suite (81 files, 2,460 tests) and the build pass.

### Feedback round 1 (2026-11-07)

Code commit b6f6e51, on `feature/3d-graph-flatten`, stacked on 4ee78c6. Not pushed, no PR, not tested in Obsidian. The ticket stays In-Review.

**Sawyer's feedback** (tested slice 1 on his large real vault notes; screenshots at Flatten 0.50 and 0.75): the graph "folds in on itself like a spider" and looks "jagged and disjointed". The child plates of different branches "clip into each other and intersect", and the branches lie "at weird planes" with no visible pattern. All plates should radiate away from the note's core, even when flattened. He confirmed the new geometry, apple or Earth cross-section slices (see the slice plan). He also asked for a smooth slider using the gradual pull, no clipping between branches and no decluttering, and a moderate default.

**The cause.** Measured on the stress web at the default (flat depth 2) with the shape checks now in `e2e/measure-graph3d-ticks.ts`:
1. **The plane orientation, the main cause.** The normal ran core → root, so each branch lay *tangent* to a sphere around the core. Its 2D left-to-right ran sideways, "right as seen from outside", with the same handedness for every branch. Deep lines swept *around* the core instead of away from it, which is the spider's folded legs. Tangent planes of neighbouring roots cross each other a short way from those roots, so branches more than a few plates long cut through their neighbours. With the charge hand-off removed (roots at their natural spacing), sibling branches cut into each other in **145,423 plate pairs** (5,021 of 12,285 sibling pairs).
2. **The charge hand-off to the root.** It was the only thing spacing branches, and it did so by throwing roots out. A root pushing for 50+ members from one point (d3's force falls off as 1/distance) flung roots to a median **1,111** units from their core (max 3,213), which are the long straight spokes in the screenshots. Even then, **9,363 plate pairs** still clashed (452 of 12,285 sibling pairs).
3. **A swinging plane.** The plane was recomputed every tick from core → root, with the root near the core and the members 100+ units away. A small move of the root swung the whole branch, so branches froze at settle in whatever orientation they had: "weird planes". Not measured on its own.
4. *Not causes:* the averaged pull hand-off (kept). Rows sized to near-tier panels make uneven gaps after long lines, a little "jagged", but they don't fold anything (kept).

**The new design.** Slices through the core, the twist, the oriented-box clash, the push from note cores and the continuous ramp. All of it is described in the slice plan above. The slider is now continuous (step 0.01), and every position re-settles live through `Graph3DScene.reshape`. That path and the Hierarchy⟷organic slider are still the only ones that let settled nodes go.

**Decisions worth remembering.**
- **The clash is within one note only.** Comparing every slice with every other across notes cost about 20 ms a tick on the stress web with a plain sweep. Notes are kept apart by `notePush`: 2.7–2.9k overlapping plate pairs in all at the default, against 15.4k with flatten off.
- **The note push moves each other note as a whole,** with the push felt at its core. A per-node version stretched notes by the difference across them, putting roots a median 1,455 units out.
- **Footprints count a plate's reach (half its larger side) in every direction,** because plates billboard. The unit test and the measurement count clashes the same way, so "0 clashes" means no two plates could cut into each other from any view.
- **Kin footprints.** If two sub-slices of one branch clashed on full footprints, their push (not alpha-scaled) beat the ramp's alpha-scaled pull at rest and inflated the note. Their footprint eases to plate heights as w → 1 instead.
- **Mid-ramp, a sub-slice's plane is tilted off the core by its blend.** It is exact at every whole depth.
- **Leaf ramp lines have no footprint** (charge only). On the stress web at 0.70 that leaves 20 clashing plate pairs (11 of 12,285 sibling pairs). It is a follow-up candidate.
- **Twist cost.** Each slice's twist is weighed every 4th tick, by turns, with an adaptive reach. Weighing every neighbour every tick cost about 30 ms in ramp positions with hundreds of sub-slices per note.
- **The default stays 0.75 (flat depth 2).** (1) It is a whole depth, so every branch is a clean slice through its core, and each heading gets its own slice ("list items and deep headings flat"). (2) It is within budget at 16–17 ms. A default between 0.5 and 0.75 keeps the depth-3 lines charged and costs 85+ ms. (3) Positions above 0.75 are cheaper (13 ms at 0.875) but fold the headings into the title's single slice, which hides the 3D spread of the note's top that the ticket keeps.
- **The first nudge right of Off** snaps lines at depth 6 and deeper flat (F goes from off to just under 5). This is rare in real notes.

**Surface map.**

| File | Change |
|---|---|
| `src/graph3d/flatten.ts` | Rewritten. Continuous `flatDepth`, `flatWeight`. `FlatLayouts.branches` builds roots → ramp lines → members, with footprints (`FlatBox`, reach and tight span). `flatIndex` and `flatLinkScale` replace `branchOf` and `sameBranch`. `flatCharges` returns per-core shares; new `notePush`. `uprightAlong`, `preferredTwist`, `obbOverlap`, `subFrame`, `FlatState`. `flattenStep(branches, bodyOf, keep, alpha, state)`: pull, twist, clash, ramp, placement |
| `src/graph3d/flatten.test.ts` | 26 tests. Among them: outward offset grows with depth, lines in a plane containing the core, no plate clashes between sibling slices of a dense note (fails with 1,673 without the clash push), the ramp rest point nears its slot as w → 1, the note push, twist, oriented-box overlap |
| `src/views/Graph3DScene.ts` | `notes` force (`notePush`) before `flatten`. `flattenStep` gets alpha and `FlatState` (pruned in `pushData`). `linkStrength` uses `flatLinkScale` |
| `src/views/Graph3DOverlays.ts` | Slider step 0.01. The label names the ramp ("lines at depth 3 are pulled 60% into their slice") |
| `e2e/measure-graph3d-ticks.ts` | Takes a web and focus note. Adds the note push, the flatten force's own time, and shape checks (sibling and overall plate clashes, root-to-core spread, in-plane, outward, order) |
| `GLOSSARY.md` | Flat branch and Flat depth redefined; new term Twist |
| `e2e/fixtures/graph3d/Galley Handbook.md` → `vault/tests/graph3d/` | New dense fixture |

**Measurements** (`node /tmp/osmosis-ticks.mjs <flatten>`, one at a time; mean d3 tick over the first 120 ticks from all-free; shapes after 300 ticks):

| Stress web | Flat depth | Charged | Mean tick (flatten force) | Sibling clashes: plate pairs (branch pairs) | All clashes | Root → core median |
|---|---|---|---|---|---|---|
| 0, off | — | 30,865 | 321 ms | — | 15,388 | 2,524 (depth-2 lines) |
| 0.70 (ramp, w 0.8) | 2.2 | 6,043 | 85 ms (41) | 20 (11 of 12,285) | 33 | 4,850 |
| **0.75 (default)** | **2** | **880** | **16.0–17.3 ms (7.8–8.5)** | **0** | 2,727–2,903 | 749–809 |
| 0.875 (ramp, w 0.5) | 1.5 | 880 | 13.2 ms (5.3) | 0 | 256 | 1,008 (titles) |
| 1 | 1 | 87 | 4.5 ms (2.8) | 0 | 644 | 465 (titles) |
| *slice 1, 0.75* | *2* | *880* | *10.4 ms* | *9,363 (452 of 12,285)* | *11,150* | *1,111* |

At every whole depth, every flat line lies in its slice's plane through the core (within 2e-12), further out than its root (0 inward), with siblings in document order (0 misordered). The default costs about 6 ms more than slice 1 (twist and clash) and stays under the 20 ms budget. Ramp positions between 0.5 and 0.75 are the expensive part of the slider: the depth-3 lines stay charged (85 ms at 0.70, still a quarter of Off's cost). On the fixture web (`e2e/fixtures/graph3d`, from Galley Handbook) every position from 0.5 to 1 has 0 sibling clashes, and ticks are 0.7–2 ms.

**Fixture.** `vault/tests/graph3d/Galley Handbook.md` (master in `e2e/fixtures/graph3d/`): nine headings with long lists (18 dry stores, 12 numbered tins, a 3-deep fresh-food list, H3s under "Cooking gear", 10 numbered menus with a nested item) and links to Passage Plan and Weather. It has no code fences, so sync stamps nothing. `Passage Plan.md` is unchanged. **Reload Obsidian (Ctrl+R)** after pulling the build.

**Manual test (Sawyer).**
1. Reload Obsidian. Open `Galley Handbook.md` and run "Open 3D graph for current note". **Default (0.75):** each heading sits close to the note core, and its list runs in a column further out. Every slice points away from the core like a cut through an apple: no branch folds back round the core, and no long spokes run out to far roots. Orbit all the way round: no plate of one heading's list cuts into another's. Each slice is a flat plane that includes the core (seen edge-on, it lines up with the core).
2. **Order:** in "Tins" and "Menus", items 1–10/12 run in order along the slice. In `Passage Plan.md`, "Before casting off" reads 1–10 along its slice, further out than its heading.
3. **Smooth slider:** drag Flatten slowly from 0.75 to 1. Nothing jumps. The label reads "…pulled N% into their slice", and the headings ease into the title's slice until, at 1, the whole note is one flat map in a plane through the core, extending away from it. Drag back down to 0.5: the sub-lists ease out into slices of their own. Far left (Off) brings back the old 3D look. Every position re-settles live, and the camera stays on the focused node.
4. **Your own notes** (the JavaScript notes from the screenshots), at 0.75 and 0.5: no spider, no intersecting branches.
5. **Regressions:** Hierarchy ⟷ organic from 0.5 to 0 and 1 re-settles live and the slices stay flat. After it settles, hop to Weather and back, and run a search: settled plates don't move. Follow a link: click the Passage Plan → Navigation edge and the ride lands on the plate. Edit mode: double-click "Rice, two kilos in a sealed tub", edit it, press Ctrl+Enter, press Enter to add a line, and drag-to-link one item onto another; the others don't move. These steps write to the fixture, so restore it from `e2e/fixtures/graph3d/` afterwards and reload. The 2D⟷3D toggle: lift off from the mind map of `Galley Handbook.md` and land back. Study mode still opens cards.
6. **Perf:** `vault/tests/graph3d-stress/Stress Hub.md`, depth 2, gauge on: the first settle at the default should be about as smooth as slice 1's. Dragging into 0.5–0.75 on the stress web is heavy (about 85 ms a tick).

**Not verified.** Nothing has run in Obsidian, so none of these have been seen: how the slices and twists look, whether the upright lean reads well, the clash's settle time in the real scene, the camera follow while dragging, and the real first-settle fps (the numbers above are headless, with estimated plate sizes). Lint, the full suite (81 files, 2,470 tests) and the build pass.
