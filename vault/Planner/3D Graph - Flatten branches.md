---
title: 3D Graph - Flatten branches
summary: "A flatten slider in the Overlays menu: below a chosen outline depth, a note's branches lie flat as the 2D mind map lays them out (children in document order, top to bottom) in planes facing outward from the note's core, while the note's top and the links between notes stay 3D."
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
date_modified: "2026-11-04T03:05:00.000Z"
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
- **Facing:** each flat branch lies in a plane **facing outward from its note's core** (normal along core → branch root), so a note reads like a flower of flat petals from any side. Pick "up" within the plane consistently (e.g. world up projected onto the plane) so text and order read top to bottom.
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

**Design choice: rigid flat branches, placed by a force that runs last in each tick. Not springs, and not pins.**

- *Pinning* (`fx`) is how the scene marks a node as settled. `positions()`, `chargeStrengths`, the camera's `follow`, the editor and the flight wait all read it. If members were pinned while their root still moved, they would look settled, the camera would stop following a focused member, and the pins would have to be rewritten every tick anyway.
- *A spring force* toward the 2D targets leaves the members in the many-body force. That is the cost of a whole tick, and the charge pushes them out of their plane. The shape becomes a tug-of-war between forces.
- *Rigid placement* (`flattenStep`, `src/graph3d/flatten.ts`): each tick, after link and charge, every free member is set to its 2D-layout offset in its branch plane, at the spot where its root will be after integration, with zero velocity. Members leave the many-body force, and the root pushes for all of them (`flatCharges`, the same trick `settle.ts` uses for a settled note's core). Edges inside a branch get strength 0 (`sameBranch`). The pull of an edge leaving the branch (to another note, a tag, an embed) is averaged over the pulled members and handed to the root, so links between notes still pull in 3D, and the plane can't bend.
- **Spacing:** the 2D layout is `computeLayout` run on the note's tree, with each line sized as its plate, or as its near-tier panel if that is bigger (in world units, no padding). The column gap is a hierarchy edge's rest length (18) and the row gap is 1.5 (the map's 8 px against a 28 px line, at a 5-unit plate). Each note is laid out once and cached by parse, because a branch's offsets are the same wherever in the note it is cut.

**Cost budget (measured, not estimated).** `e2e/measure-graph3d-ticks.ts` runs the scene's forces headless on the stress web (30,865 nodes, every node free as on first load) and averages the d3 tick over the first 120 ticks. It also checks the result: members end up in their plane (≤ 5e-13 off it), no sibling is out of order, and nothing flies off.

| Flatten | Flat depth | Charged nodes | Branches / members | Mean tick | Median | Worst |
|---|---|---|---|---|---|---|
| 0 (off, today) | — | 30,865 | 0 | **304–332 ms** | 301–327 ms | 390–447 ms |
| 0.25 | 4 | 19,140 | 5,823 / 11,725 | 215 ms | 197 ms | 426 ms |
| 0.5 | 3 | 6,043 | 3,626 / 24,822 | 86 ms | 77 ms | 212 ms |
| **0.75 (default)** | **2** | **880** | **793 / 29,985** | **10.2–10.9 ms** | 9.4 ms | 63–70 ms |
| 1 | 1 | 87 | 41 / 30,778 | 4.4 ms | 3.7 ms | 59 ms |

Cutting the branches costs 75–133 ms the first time a set of notes is seen (the layouts), and only the tree walk after that. The budget for later slices: the default must stay within about 2× of 10 ms a tick on this measurement.

**Slices.**

1. **Rigid flat branches at whole flat depths.** *Built (this session).* Pure `flatten.ts` (flat depth from the slider, branches and their 2D offsets, the plane, the force step, the charge hand-off) and the scene wiring. The Overlays slider "Flatten branches" goes in whole steps (off, 4, 3, 2, 1), defaults to flat depth 2, and re-settles live through `reshape`. Fixture and measurement included. Meets every acceptance bullet; the one thing missing from the *what* is the gradual ramp.
2. **The ramp** (not built). Make the slider continuous (step 0.05; the saved value is already a 0–1 number, so nothing migrates). With a fractional flat depth F, a line at outline depth d gets flatness `w = clamp(d − F, 0, 1)`. Lines with w = 0 are 3D, and the deepest of them is the branch root, as now. Lines with w = 1 are rigid members, as now, placed against the branch root. A line with 0 < w < 1 (at most one depth: the *ramp depth*) stays free. It is pulled toward its flat target by an alpha-scaled spring of strength w, so the balance with link and charge doesn't change as the layout cools (an unscaled spring would always win at rest, making w meaningless). It keeps (1 − w) of its charge, its root takes the other w, and its edges keep pulling. Pure additions: `flatWeight(depth, F)` and a ramp branch in `flattenStep`, with unit tests: weights; at w → 1 the node's rest point approaches its target; a ramp node keeps its pull. Re-run the measurement at 0.6, 0.65, 0.7 and 0.75 and keep within the budget. **Sawyer's call first:** whether the default stays at flat depth 2 (a hard cut, which satisfies "list items flat out of the box") or moves into the ramp (for example F = 1.5: the title 3D, the top headings half-flattened toward the title's plane). Ask him after he has seen slice 1.
3. **Only if testing shows it: new lines inside a settled flat branch.** A line added inside a branch that has already settled (typed in the note, not in the 3D editor) arrives free and drops into its 2D slot, and the next sibling, which is pinned, may sit there already. Settled nodes may not move, so the fix can only be where the new line goes, not where the old lines are. Lines added from the 3D editor are already fine: `seedClear` puts them beside their parent and the editor pins them.

**Is slice 2 crisp enough for a Sonnet agent?** Yes, once Sawyer has picked the default. The maths and the tests are specified above, and the code touches only `flatten.ts`, the slider step, and one line of the menu label. The tuning (how the ramp depth looks) needs Sawyer's eyes either way.

## Batch implementation notes (awaiting manual test)

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
