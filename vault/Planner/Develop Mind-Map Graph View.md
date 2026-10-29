---
title: Spaced Repetition for 3D Graph View with content-level connections
summary: "What if we combined Mind Mapping with Obsidian's Graph View? or better, yet Three.js graph view?  https://github.com/vasturiano/3d-force-graph"
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: To-Do
priority:
progress_current:
progress_total:
date_created: "2026-08-03T17:30:27.346Z"
date_modified: "2026-10-22T23:25:39.350Z"
date_start_scheduled: "2026-08-06T21:29:43.106Z"
date_start_actual:
date_end_scheduled:
date_end_actual:
all_day: true
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
  - "[[3D Graph Phase 1 - Graph model]]"
  - "[[3D Graph Phase 2 - View shell]]"
  - "[[3D Graph Phase 3 - Streaming and stability]]"
  - "[[3D Graph Phase 4 - Near tier]]"
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[3D Graph Phase 6 - Relational study mode]]"
  - "[[3D Graph Phase 7 - Editing]]"
  - "[[3D Graph Phase 8 - 2D-3D toggle]]"
blocked_by:
cover:
color:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

Traditional mind mapping has it all wrong.  Hierarchical, structured maps are arbitrary elevations of merely *one* particular "thing", but human learning is unstructured.  It's a messy, dynamic network.  Why don't we study it that way?

What if we took the best of traditional mind mapping + the best of Obsidian's graph view + spaced repetition?  What if a note was truly spatial where every line/block of content is rendered as a node in 3D space just like how we render the content of a note as a 2D mindmap?  What if links between content formed a 3D web of knowledge?  What if learning and studying and spaced repetition were less about memorizing little chunks of isolated facts or organizing them under a temporal arbitrary hierarchy of understanding and instead more about exploring connections and traversing paths of the mind?  What if learning was like taking a ball of yarn through the Minotaur's lair and *studying* was like walking the line back and committing the connections and paths to memory?

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

The 2D mind map is bound to one document's hierarchy. Transclusion can render maps inside maps, but only by hanging them off that hierarchy. A plain `[[link]]` from one line to a line in another note is invisible to it. Obsidian's graph view shows those connections, but only between whole notes, and it has no idea what you know. Nothing lets you see, walk, or study knowledge as the network it actually is, down to the line.

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*

The 2D mind map for structure, plus Obsidian's local graph for note-to-note links. The two don't share a view, and neither works at line level.

## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

- Obsidian TagRoutes Plugin
- `ref/3d-force-graph` (MIT; Three.js plus d3-force-3d). Examples that map onto this spec:
  - `html-nodes`: DOM in 3D, the near tier
  - `text-nodes`: sprite labels, the middle tier
  - `expandable-nodes`: add and remove nodes at runtime
  - `click-to-focus`: camera flies to a node
  - `controls-fly`, `controls-orbit`: navigation
  - `emit-particles`: a particle runs along a link
  - `highlight`: neighbourhood emphasis
  - `bloom-effect`: lookdev
  - `fix-dragged-nodes`: pinning
- Blender's viewport Overlays and Shading menus (matcaps, lookdev lighting), the model for the Overlays menu
- Open-world streaming (Skyrim's cell loading), the model for how the loaded area follows you

---

# Spec

*Brainstormed with Claude on 2026-10-28. Rows in the decisions table are Sawyer's answers. Anything marked **Proposed** is Claude's suggestion and still open to change. Remaining open questions are at the end.*

## Concept

The 3D Graph View draws every line of a note as a node in 3D space. Inside a note, lines are held together by their hierarchy: the same tree the 2D mind map draws. Across notes, lines are joined by links, embeds, property links, tags and attachments. Hierarchy becomes one force among several.

You never see the whole vault. You stand somewhere and see a local neighbourhood N hops deep. It streams in as you move toward it and streams out behind you. Distance fades into mist, then darkness.

Studying in 3D is a **new study mode**, not a new card type. It works like 2D spatial study: a due line card's node is hidden in place, and that hidden node *is* the card. You recall it with its neighbourhood around you, reveal it, and rate it. The schedule is the same FSRS schedule every other mode uses, and stats count the mode separately.

## Decisions

| Topic | Decision |
|---|---|
| Node unit | **Every line** is a node, the same as the 2D map |
| Hop unit | **Note-to-note link**, like Obsidian's local graph. Loading a note brings all of its lines |
| Scope | **Local only:** N hops from a starting point. The whole vault only on the user's explicit request |
| Embeds `![[…]]` | **Strong edge.** Embedded content lives once, in its own note's cluster, and is never duplicated inline |
| Extra edge kinds | **All of them:** frontmatter/property links, tags as hub nodes, unresolved links as ghost nodes, attachments as nodes |
| Travel | **Both:** click or tap to fly to a node, *and* free flight (WASD + mouse on desktop; orbit, pinch and tap on mobile) |
| Entry points | **Both:** a standalone view opened from a note, *and* a 2D/3D toggle inside the Mind Map view |
| Follow active note | **Optional, off by default.** The view stays put until you hop; a pin/follow toggle makes it follow the editor |
| Node positions | **Saved, in plugin data** (`data.json`), so the world keeps its shape between sessions |
| Background | **Follow Obsidian's theme:** mist into darkness in dark mode, into white in light mode |
| Colour | **All four modes** (note, memory strength, tag, node type), **by note as default**, chosen from a Blender-style **Overlays menu** |
| Near nodes | **Face the camera** (CSS2D billboards) |
| Theming | **Reuse** the mind map's themes, shapes and per-node styles |
| What is studied | **The hidden node is the card.** Existing line, fence and occlusion cards, with no link cards. Links shape the world and the path |
| Path modes | **All three:** due-driven, free exploration, authored trails, chosen in a study panel in the viewport |
| Ratings | **Per hop, shared FSRS**, the same schedules decks and 2D study use |
| v1 editing | **Full editing:** inline node editing like 2D edit mode, plus drag-to-link |
| Mobile | **In v1**, with touch controls and lower detail budgets; tested on iOS and Android before shipping |
| Memory | The Android WebView memory note is **not** a constraint (it came from a crash that turned out to have another cause). Still write memory-conscious code |
| Tag and attachment hops | **Shown, but they don't count as hops.** They appear when connected to a loaded note but never pull in further notes |
| Saved-position key | **Cluster plus offsets.** Each note's cluster position is keyed by path; line offsets are keyed within it. An edited line with no block ID re-settles near its parent while the note stays put |
| Authored trails | **Vault notes.** A trail is a Markdown note listing its stops as links |
| Study mode name | **`relational`**, next to `sequential`, `contextual`, `spatial` |
| Due-driven routing | **The horizon follows you.** Due cards anywhere within the configured depth of the start note are included, and the loaded area streams along as you travel |
| Long notes | **Always every line.** No folding fallback; the engine has to cope |
| Note node | **A larger core:** a bigger, brighter node at the cluster's centre showing the note title, which the lines orbit |
| v1 structural edits | **All four:** add child or sibling, delete, move or reparent (within a note and across notes), retype |
| Undo/redo | **One shared history per file** across the 2D map and the 3D view |
| Tracking | **One child task note per phase**, linked through `children`; this note stays the parent spec |

## World model

All of this is pure logic in `src/graph3d/`, with no `obsidian` import, so Vitest can test it.

### Nodes

| Kind | Source | Notes |
|---|---|---|
| Note | The parse tree's `root` node | Cluster anchor and hop unit. Drawn as a larger, brighter core showing the note title |
| Line | Every `OsmosisNode` under the root | `id`, `range`, `blockId`, `type` come from the existing parser via `ParseCache` |
| Tag hub | Each `#tag` on a loaded line or note | One node per tag, shared by everything carrying it |
| Attachment | Linked or embedded non-Markdown files | Image, PDF, audio, video; rendered as media in the near tier |
| Ghost | An unresolved link target | Dimmed; no lines |

### Edges

| Kind | Source → target | Feel |
|---|---|---|
| Hierarchy | parent line → child line, note → top-level lines | Short, stiff: keeps each note looking like a mind map up close |
| Link | the line containing `[[…]]` → target | Longer, looser: the organic web |
| Embed | the line containing `![[…]]` → target | Strong: pulls clusters together |
| Property | note → frontmatter link target | Distinct line style |
| Tag | line or note → tag hub | Hub spokes |
| Attachment | line → attachment node | Same as a link |

**Resolving a link to lines.** Obsidian's `metadataCache.getFileCache(file)` gives `links`, `embeds` and `frontmatterLinks` with source positions, so nothing has to be re-parsed to find them. The *source* line is the `OsmosisNode` whose `range` contains `position.start.offset`. The *target* is resolved as follows:
- `[[Note#^id]]` → the line with that `blockId`
- `[[Note#Heading]]` → that heading's node
- `[[Note]]` → the note node

This vault has 241 wikilinks, but only 1 block reference and 1 heading reference, so most edges land on a note node today. Drag-to-link (see Editing) is what makes line-to-line links practical to create.

## Streaming: the loaded area

- **Hops are counted over notes.** A breadth-first search over `metadataCache.resolvedLinks` plus frontmatter links, starting from the focused node's note, out to depth N.
- **Depth:** **Proposed** default 2, with a per-platform maximum (**Proposed:** desktop 5, mobile 3). Whole-vault mode only behind an explicit setting, desktop only.
- **Tag hubs and attachments** are *shown* when they connect to a loaded note, but they don't *extend* the hop horizon. A popular tag would otherwise pull in half the vault in one hop.
- **Three rings:**
  - **Loaded** (≤ N): parsed, simulated, rendered.
  - **Prefetch** (N + 1): only the link cache is read; nothing is parsed. This makes the next hop instant.
  - **Unloaded:** everything else.
- **On a hop:** recompute the search from the new focus and diff the loaded sets. Departing nodes fade out, then leave the graph data and free their DOM. Arriving nodes fade in.
- **Stability:** the world must not rearrange itself as you walk. Settled nodes are pinned (`fx/fy/fz`). Only new arrivals are simulated, against the pinned structure, and they're pinned once they cool. A newly loaded note is seeded next to the loaded neighbour that pulled it in.
- **Saved positions** (plugin data) use cluster plus offsets:
  - Each note's cluster position is keyed by file path. It's always stable, and it's updated on rename and pruned on delete.
  - Each line's offset from its note core is keyed by `blockId` where one exists, otherwise by `OsmosisNode.id`.
  - After an edit, a line whose `id` no longer matches loses only its own offset. It re-settles near its parent while the rest of the note stays put.
- **Every line, always.** There is no folding fallback for long notes, so the engine has to scale. That means instanced meshes for the far tier, a single sprite atlas for the middle tier, and simulating only unpinned nodes. Measure on the largest note in the vault.

## Detail tiers

The tier is chosen by **camera distance**, inside the loaded area:

| Tier | Render | Notes |
|---|---|---|
| Near | Live Obsidian DOM through `MarkdownRenderer.render()` in a `CSS2DObject` | Callouts, code, video, audio, embeds. Capped by a budget (**Proposed:** 24 nodes on desktop, 12 on mobile; the nearest win). Media pauses when its node leaves this tier |
| Middle | Text sprite of the line's first words | GPU-drawn |
| Far | A glowing point or sphere | Coloured by the active colour mode. Instanced if counts demand it |
| Beyond | Mist | — |

- **Hysteresis** at every tier boundary, so a node hovering at a boundary doesn't flicker between tiers.
- **Mist:** `scene.fog = FogExp2` fades the WebGL tiers. Fog doesn't affect DOM, so the near tier gets a matching opacity fade by distance, tuned so the two read as one fade.
- **Theme:** background and fog colours come from Obsidian's CSS variables (`--background-primary`) and are recomputed on the workspace `css-change` event.
- **Reuse:** the near tier reuses the mind map's rendered-HTML cache approach and its themes, shapes and per-node styles (`src/styles.ts`, `src/themes.ts`).

## Navigation

- **Hop:** click or tap a node. The camera flies to it (`cameraPosition(pos, lookAt, ms)`), the node becomes the focus, and the loaded area recentres on its note.
- **Free flight:** `3d-force-graph` fixes `controlType` at construction. **Proposed:** orbit controls plus our own WASD/QE translation of both the camera and the orbit target. That gives orbiting and flying with one set of controls, without rebuilding the graph.
- **Mobile:** orbit, pinch and tap-to-hop.
- **Keys** go through the view's `Scope`. Global user hotkeys otherwise eat keys before the view sees them (see how the mind map handles this).
- **Follow active note:** a toggle, off by default.
- **Depth control:** in the viewport header, like the local graph's depth slider.

## Entry points

- **Standalone view** (`VIEW_TYPE_GRAPH3D`): opened by a command ("Open 3D graph for current note"), the file menu, and the mind map context menu.
- **2D/3D toggle in the Mind Map view**, with a "lift-off" transition: the 2D layout (`computeLayout`) seeds the positions at z = 0, then the forces are released. **Proposed:** the toggle swaps the leaf's view type and carries the focused node and camera across.

## Overlays menu

A viewport header menu, in the spirit of Blender's Overlays and Shading menus:

- **Colour by:** note (default), memory strength, tag, node type
- **Edges:** show or hide each kind (hierarchy, link, embed, property, tag, attachment, unresolved)
- **Forces:** a hierarchy ⟷ organic slider that scales hierarchy edge strength against cross-note edge strength
- **Lookdev:** mist density, bloom, link particles, label visibility
- **Proposed:** overlay state is saved per view in plugin data

## 3D study mode

- **A new `StudyMode` value, `"relational"`**, added to:
  - the type in `src/database/types.ts`
  - `parseStudyMode` in `src/store/ReviewLog.ts`
  - `studyModeTotals` in `src/stats/aggregate.ts`
  - `src/stats/detail.ts`
  - anywhere stats list the modes
- **Card matching reuses `src/study/spatial-study.ts`.** Its card keys (`${notePath}#^${blockId}`) are already multi-note, because the mind map shares a canvas with transcluded notes. That's exactly the 3D case.
- **Parity with 2D spatial study:** line cards, fence cards and occlusion cards behave as they do there.
- **Rating** goes through `plugin.createSessionManager(mode)`, the same as 2D spatial study.
- **Path modes**, chosen in a study panel in the viewport:
  - **Free exploration:** due cards in the loaded area are hidden; you reveal and rate one when you arrive at it.
  - **Due-driven:** Osmosis orders the due cards and flies you between them along graph paths, drawing the travelled path as a persistent thread (Ariadne's). It includes due cards anywhere within the configured depth of the start note, not only what's loaded right now; the loaded area streams along with you as you travel.
  - **Authored trails:** saved, ordered paths through the graph, studied in order. A trail is a **vault note** whose stops are links (`[[Note#^id]]`, `[[Note#Heading]]`, `[[Note]]`) in order. It syncs, can be edited by hand, and shows up in the graph itself. The exact trail note format is part of the study phase.

## Editing (v1: full editing)

- **Inline node editing** in the near tier, matching 2D edit mode: the same `raw` bytes and the same `nodeEditText` / `restoreEditedLine` / `reattachBlockId` helpers in `src/mindmap-edit.ts`.
- **Drag-to-link:** drag line A onto line B. Osmosis inserts a link to B at the end of A. If B has no block ID, it gets one from `generateBlockId` first. The link text comes from `app.fileManager.generateMarkdownLink`, so it honours the user's wikilink and Markdown-link settings.
- **Structural edits, all four in v1:** add child or sibling, delete, move or reparent (within a note and across notes), and retype. They mirror 2D edit mode and reuse its `src/mindmap-edit.ts` helpers.
- **Prerequisite refactor.** Edit *application* lives inside `MindMapView.ts` (9,882 lines): `applySnapshot`, the undo/redo history, and the `vault.modify` / `processFrontMatter` paths around lines 7660–7990. It has to move into a shared module that both views use, before 3D can edit without duplicating it. This is behaviour-neutral: 2D edit mode has to work exactly as before.
- **One shared undo/redo history per file.** The extracted module owns the history, keyed by file path, rather than each view owning its own. Undo in 3D can undo an edit made in 2D, and vice versa.

## Engine and bundle

- **Dependencies:** `3d-force-graph` and `three`, plus `three-spritetext` if its sprites are good enough for the middle tier. Pin exact versions.
- **Three.js has to be bundled into `main.js`.** Community plugin releases ship only `main.js`, `manifest.json` and `styles.css`, so a lazily loaded side file isn't an option. `main.js` is **542,138 bytes** today. Three.js is estimated to add 600–700 KB minified: measure the real delta once it's added, along with the startup time cost (related: "Osmosis causes slow app startup and freezes app"). Nothing gets constructed until the view opens.
- **Use `d3` as the force engine,** not `ngraph`: programmatic pinning and dragging only work with d3.

## Phases

Each phase ends with a build, a fixture, and Sawyer's manual test before the next one starts.

1. **Graph model (pure):** nodes and edges from parse trees plus link caches; link-position-to-line resolution; the hop search; loaded-set diffing. Unit-tested.
2. **View shell:** the `ItemView`, a `3d-force-graph` mount, far and middle tiers, mist, theme following, hop navigation, depth control, desktop and mobile touch.
3. **Streaming and stability:** fade in and out, prefetch ring, pin-on-settle, saved positions.
4. **Near tier:** live DOM Markdown, media lifecycle, budget, hysteresis.
5. **Overlays menu.**
6. **3D study mode:** the `relational` `StudyMode` and stats, then free exploration → due-driven → authored trails.
7. **Editing:** extract the edit pipeline and shared undo history from `MindMapView`; then inline editing; then drag-to-link; then the four structural edits.
8. **2D/3D toggle** with the lift-off transition.

Each phase has its own child task note:

1. [[3D Graph Phase 1 - Graph model]]
2. [[3D Graph Phase 2 - View shell]]
3. [[3D Graph Phase 3 - Streaming and stability]]
4. [[3D Graph Phase 4 - Near tier]]
5. [[3D Graph Phase 5 - Overlays menu]]
6. [[3D Graph Phase 6 - Relational study mode]]
7. [[3D Graph Phase 7 - Editing]]
8. [[3D Graph Phase 8 - 2D-3D toggle]]

## Open questions

All nine questions from the first draft were settled on 2026-10-28; their answers are in the Decisions table. Items still marked **Proposed** are Claude's defaults and can be changed at any time:

- depth defaults and per-platform maximums
- near-tier budgets
- the controls approach
- how the toggle hands over between views
- per-view overlay state

## Planned surface map

| File | Change |
|---|---|
| `package.json` | Add `3d-force-graph`, `three` (and maybe `three-spritetext`), exact versions |
| `src/graph3d/model.ts` (new) | Node and edge construction, link-to-line resolution |
| `src/graph3d/horizon.ts` (new) | Hop search, rings, loaded-set diffing |
| `src/graph3d/lod.ts` (new) | Tier choice with hysteresis and budgets |
| `src/graph3d/positions.ts` (new) | Pinning and saved-position keying and pruning |
| `src/graph3d/trails.ts` (new) | Due-driven ordering and authored trail model |
| `src/views/Graph3DView.ts` (new) | The `ItemView`: mount, render, navigation, overlays, study panel |
| `src/views/MindMapView.ts` | 2D/3D toggle; edit pipeline and undo history moved out |
| `src/` edit pipeline module (new, name open) | Shared edit application and per-file undo/redo, used by both views |
| `src/graph3d/trail-note.ts` (new) | Parse and serialize authored trail notes |
| `src/main.ts` | Register the view, commands, menus |
| `src/settings.ts` | Depth defaults and maximums, whole-vault opt-in, saved positions, overlay state |
| `src/database/types.ts`, `src/store/ReviewLog.ts`, `src/stats/*` | New `StudyMode` |
| `styles.css` | Viewport header, overlays menu, study panel, near-tier panels |

## Test plan

- **Unit (Vitest):**
  - link-position-to-line resolution (block ref, heading ref, bare link, embed, property link, unresolved)
  - hop search and rings
  - tag and attachment hubs not extending the horizon
  - loaded-set diffs on a hop
  - tier choice with hysteresis and budgets
  - saved-position keying and pruning across edits and renames
  - due-driven ordering
  - trail note parsing and serialization
  - the shared undo history across views
  - the new `relational` `StudyMode` in stats aggregation
- **Manual fixtures:** `e2e/fixtures/graph3d/` → `vault/tests/graph3d/`. A small web of five or six notes in a neutral domain, containing:
  - block refs, heading refs, embeds, property links, tags, an attachment and an unresolved link
  - a callout, a code block, video and audio
  - back-dated line cards

  The fixture must be at least three hops deep so streaming can be tested. After writing fixtures, reload Obsidian (Ctrl+R).
- **Platforms:** desktop, iOS and Android, before shipping.

## Conventions for the build session

- Branch `feature/3d-graph-view`, cut from the current release branch. Confirm which one exists (`release/0.0.6` at the time of writing).
- Keep pure logic out of `src/views/`, because Vitest can't import `obsidian`.
- View keys go through the view's `Scope`.
- Use `grep -a` on `MindMapView.ts` and `mindmap-edit.ts`; they contain NUL bytes.
- Commit code by explicit path and check `git diff --cached --stat` first. Never `git stash`.
- No biology examples in fixtures or tests.