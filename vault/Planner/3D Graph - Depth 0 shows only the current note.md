---
title: 3D Graph - Depth 0 shows only the current note
summary: "A Depth 0 on the 3D graph's Depth control, and the new default: only the focus note's own lines plus the content of the notes it transcludes with ![[...]] (the whole note, a heading section or a block, nested embeds included). Plain links load nothing."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph Phase 5 - Overlays menu]]"
status: Done
priority:
progress:
date_created: "2026-11-07T13:08:24.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-07T13:08:24.000Z"
date_start_actual: "2026-11-07T13:08:24.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Feature Request

## What do you need built?

Sawyer, 2026-11-07, settled:

- Add **depth 0** to the 3D graph's Depth control. It shows only the current note's own content (its lines), **plus** the content of any note it transcludes with `![[...]]`. Only the part the embed renders counts: the whole note, a heading section, or a block. Plain `[[links]]` (and frontmatter links) to other notes must **not** load those notes.
- **Depth 0 is the default** for a newly opened 3D graph (it was 2). Saved view state with a depth keeps its value. `setState` clamped depth to a minimum of 1; it now allows 0.
- Depth 1 and above behave exactly as before.

## What problem does this solve?

A fresh 3D graph on a well-linked note pulls in a whole neighbourhood before you have looked at the note. Depth 0 starts from the note itself, as the 2D mind map does (which also expands transclusions), and the Depth slider then widens it.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Commit `d3f8d54` on `feature/3d-graph-depth-zero` (cut from `feature/3d-graph-flatten` at ae3625a). Not pushed.

### Approach

- `computeHorizon` is untouched: at depth 0 it already yields the focus alone as `loaded` and the focus's outgoing links as the `prefetch` ring (text read ahead only, nothing parsed). The view calls it with backlinks off at depth 0 and then adds the embedded notes with the new `withEmbedded` (`src/graph3d/horizon.ts`): they join `loaded` and `hops` (distance along embeds) and `via` (the note whose embed reached them), and leave `prefetch`. Because they are in `hops`, an edit to an embedded note reloads the graph, as for any loaded note.
- `collectEmbedded` (`src/graph3d/transcluded.ts`, new, pure, with an injected async reader and the link resolver) walks the focus note's cached `embeds` breadth-first. For each embed whose offset lies on a shown line it resolves the target and reads the note once. The subpath decides the scope: none means the whole note; a heading means that heading's node and its subtree; a `^id` means that block's node and its subtree. A subpath that matches nothing falls back to the whole note, as `buildGraph` already does for links. Scopes only grow (a section, then the whole note, merges to whole), so the walk ends on cycles.
- `buildGraph` (`src/graph3d/model.ts`) learned two things. `NoteInput.only` is the set of section roots to show for a partially shown note; such a note gets **no core node**, and its roots have no hierarchy parent and hang from the `embed` edge. `BuildOptions.contentOnly` (set at depth 0) stops plain links and property links from creating attachment or ghost nodes. `subpathKey` is now exported.
- `placeNodes` seeds a rootless section beside the line that embeds it, a note-seed distance away, instead of at the origin.

### Decisions worth remembering

- **Tags**: shown. They are text inside the note's lines, and a hub only appears when a shown line carries the tag. A tag hub never pulls a note in. Frontmatter tags show for the focus and for wholly embedded notes (their core exists), not for a partially embedded one.
- **Attachments**: shown only when embedded (`![[image.svg]]`), as that is a transclusion. An attachment reached by a plain `[[file.pdf]]` link or a property is dropped at depth 0.
- **Ghosts**: an unresolved plain link or property link adds no ghost. An unresolved **embed** still shows a ghost: the embed is content and the ghost is how a broken one reads.
- **Plain-link edges**: a link out of the shown content to a note that is not shown has no edge (the target is not loaded, as at any depth). A link between two shown things (for example a line in an embedded section that links back to the focus) does get its edge, as it does at depth 1.
- **Nested embeds follow**, also through a cycle once. This matches the 2D mind map's chain-with-visited-set, with one difference: the mind map leaves an embed at the *top level* of an embedded note unexpanded (a parse-tree quirk, see `permeable-embed-boundaries` memory), and 3D follows it, since that is what Obsidian renders. An embed that sits outside the shown part of a partly embedded note does not follow.
- **Section scope vs the mind map**: the mind map ignores the `#fragment` and embeds the whole note; 3D honours it, per the spec.
- **Partial notes are not flattened**: the flatten slider slices branches through a note's core, and a partly shown note has none, so its lines stay on the ordinary force layout.
- **Hops** (click a plate in an embedded section, or an edge ride, `onNodeArrived` to `hop`) recentre on that note at depth 0. The note is shown whole with its own embeds, so the graph is never empty and the clicked line is still in the new model. The embedder's content leaves the graph unless the new focus embeds it.
- **Due-driven study** collects its route at **one hop** when depth is 0 (`routeNotes()` in the view: the loaded area plus the focus's linked notes), because at depth 0 a note with no due cards of its own would find nothing. Each stop already recentres the graph through `goTo` when its note is not loaded. Free study and relational study use the model as shown.
- The **2D to 3D toggle** hands over the 3D state only if the 3D view has been used before; a first toggle passes none and now lands at depth 0, which is the same content the 2D map shows. The Ctrl/Cmd-click "new 3D tab" passes the current depth through, so 0 is carried.
- The **Overlays Depth slider** runs 0 to max (the mobile ceiling is unchanged); at 0 its description reads "Only the focus note and the notes it embeds". The Backlinks toggle has no effect at 0.
- Old saved views keep their depth: `getState` always wrote it. A state with no depth gets the new default.

### Surface map

| File | Change |
| --- | --- |
| `src/graph3d/transcluded.ts` | New. `collectEmbedded`: the focus plus embedded notes and sections, nested, cycle-safe. |
| `src/graph3d/transcluded.test.ts` | New. Whole, heading, block, nested, cycles, outside-the-part, merge, fallback, plain links excluded, placement. |
| `src/graph3d/horizon.ts` | `withEmbedded`. |
| `src/graph3d/horizon.test.ts` | Depth 0 horizon tests. |
| `src/graph3d/model.ts` | `NoteInput.only`, `BuildOptions.contentOnly`, nullable core, `subpathKey` exported. |
| `src/graph3d/positions.ts` | Seed a rootless section near its embedder. |
| `src/views/Graph3DView.ts` | Default depth 0, `setState` allows 0, `reload` branches on depth 0, `readNote` extracted, `routeNotes()`. |
| `src/views/Graph3DOverlays.ts` | Slider minimum 0, depth 0 label. |
| `src/views/Graph3DStudy.ts` | Comment for `loadedNotes`. |

### Fixture

`e2e/fixtures/graph3d/Depth Zero.md`, copied to `vault/tests/graph3d/Depth Zero.md`. It embeds `Weather` (whole), `Knots#Bends` (heading), `Knots#^bowline` (block) and `Sail Care#Links` (whose section embeds `Rigging`: the nested case), and links plainly to `Navigation` and `Tide Cards`. It uses existing sailing fixtures. Reload Obsidian (Ctrl+R) after the build.

### Manual test steps

1. Build, Ctrl+R. Open `tests/graph3d/Depth Zero`, run the open-3D-graph command (a fresh tab). Expect the Depth slider at 0 ("Only the focus note and the notes it embeds").
2. Expect: Depth Zero's own lines and `#pre-departure`; a `Weather` title plate with all its lines; under "Heading section", only "Bends" and "Sheet bend" (no `Knots` title plate, no "Clove hitch"); under "Block", only the "Bowline" line; under "Nested", the "Links" heading and its two lines, and the whole `Rigging` note hanging from the embed. No `Navigation`, no `Tide Cards`, and no ghost for `Tide Tables` (that link is inside `Weather`).
3. Slide Depth to 1: `Navigation` and `Tide Cards` (and the rest of `Knots`) appear. Slide to 2 to 5: as before. Back to 0: they leave.
4. At 0, click a plate in the `Weather` section: the graph recentres on `Weather` (its own embeds, if any, and itself), the camera lands on the clicked plate, the graph is not empty. Do the same for the "Bends" plate (the graph becomes `Knots`, whole).
5. Ride an edge (the embed edge from "Heading section" down to "Bends") with the edge-ride gesture: same as a click, it arrives and recentres.
6. Toggle 2D and back (header action): at 3D it should come back at the depth it left (first time: 0), with the 2D map's note.
7. Study: at depth 0 on a note with no due cards of its own but a linked note with some, start Due-driven. It should find the linked note's cards (one hop) and fly there. Free and relational study on the depth 0 graph show only what is shown.
8. Ctrl/Cmd-click a link in a near-tier panel: the new 3D tab opens at depth 0.
9. Old saved view: a 3D tab saved at depth 3 (reload Obsidian with it open) reopens at 3.
10. Regression: at depths 1 to 3 on `Sailing Basics`, the graph looks as before (the flatten slider, the near tier, the edge ride).

### Not verified (no Obsidian here)

Everything visual and every interaction above. In particular the camera landing after a hop at depth 0, how a rootless section reads next to its embedder, and the slider showing 0. Unit tests cover the collection, scoping and model output only.

### Follow-ups

- A partly shown note could get a faint core (the note's title) for context. Left out because the spec said only the embedded part counts.
