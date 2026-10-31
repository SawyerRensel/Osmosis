---
title: 3D Graph Phase 5 - Overlays menu
summary: "Blender-style Overlays menu in the 3D viewport: colour mode, edge-kind visibility, hierarchy-organic force slider, and lookdev options."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Edge direction and taper]]"
status: In-Review
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-10-29T01:03:06.000Z"
date_start_scheduled: "2026-10-31T15:49:06.000Z"
date_start_actual: "2026-10-31T15:49:06.000Z"
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
  - "[[3D Graph Phase 2 - View shell]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

A viewport header menu in the spirit of Blender's Overlays and Shading menus:

- **Colour by:** note (default), memory strength (FSRS retrievability), tag, node type.
- **Edges:** show or hide each kind (hierarchy, link, embed, property, tag, attachment, unresolved).
- **Forces:** a hierarchy ⟷ organic slider that scales hierarchy edge strength against cross-note edge strength.
- **Lookdev:** mist density, bloom, link particles, label visibility.
- **Persistence:** overlay state saved per view in plugin data (**Proposed**).

**Acceptance:**
- Every option changes the scene live.
- Settings survive a reload.
- The menu works with touch on mobile.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.

## Batch implementation notes (awaiting manual test)

Built on `feature/3d-graph-phase-5`, stacked on `fix/3d-graph-batch-1`. Code commit b35606b.

### Approach

- **Menu:** an "Overlays" button (layers icon) in the viewport header opens a panel under the header, built from Obsidian `Setting` rows (dropdowns, toggles, sliders), so it is styled like the rest of Obsidian and taps work as clicks on mobile. A press anywhere else in the view closes it. The panel scrolls (max 60% of the screen height) and keeps touch scrolling inside itself.
- **Color by:** `overlayNodeColor` in `src/graph3d/overlays.ts`. The view builds a colouring function per model (`Graph3DView.coloring`) and hands it to the scene with `setColoring`, which recolours plates and the outlines of open near-tier panels.
  - *Note:* the existing colours.
  - *Memory strength:* FSRS retrievability of the line's cards (`cardStore.getCardsByNote` + `FSRSScheduler.retrievability`). The weakest card wins on an occluded line, which has one card per shape group. A note's core shows the mean of its reviewed lines. Red at 50% or below, through amber, to green at 100%. Blue means a card that was never reviewed; grey means no card. Disabled cards don't count.
  - *Tag:* a hue per tag. A node takes its own first tag, else its nearest tagged ancestor's (so a tagged heading colours its branch, and a frontmatter tag colours the note). Untagged nodes are grey.
  - *Node type:* lines by parse type (heading, bullet, ordered, paragraph, code, table, quote, transclusion). Note cores are light grey; tags, attachments and ghosts keep their own colours.
- **Edges:** each kind can be hidden, plus "Unresolved links", which hides any edge that reaches a ghost node. This is drawing only (`edgeShown`, used by `writeEdges`).
- **Forces:** a 0–1 slider. `linkStrengthScale` scales d3's default link strength (1 / the fewer links at either end, rebuilt in `pushData` as `degree`). At 0.5 every link pulls as before. Toward hierarchy, cross-note links loosen down to ×0.1; toward organic, hierarchy edges do. Nothing ever goes above d3's default: that is already 1 for a leaf, and more than 1 overshoots.
- **Lookdev:**
  - *Mist density:* a ×¼ to ×4 multiplier on `MIST`, on a log₂ slider.
  - *Bloom:* `UnrealBloomPass` + `OutputPass`, added to 3d-force-graph's post-processing composer only while it is on, and disposed when it is turned off.
  - *Link particles:* one `Points` object, one particle per drawn edge. They run from source to target at 25 world units a second, each edge with a stable phase. They dim with the focus, like the edges.
  - *Labels:* "Plates and panels" (default), "Plates only" (no near tier), or "Hidden" (blank plates, no panels).
- **Persistence:** `settings.graph3dOverlays`, read through `normalizeOverlays`, so a missing or malformed field takes its default. `plugin.setGraph3DOverlays` stores the change, writes data.json on a 500 ms debounce (flushed in `onunload`), and calls `refreshOpenGraph3DControls()`, which now pushes the overlays to every open view as well as the controls.

### Decisions worth remembering

- **The force slider never moves a settled node.** The spec only says the slider "scales hierarchy edge strength against cross-note edge strength", and settled nodes never move (Phase 3). So a change re-weights the links without reheating the simulation: it shapes nodes still settling and every note that arrives afterwards. The menu says so in the slider's description. So for this one option, "changes the scene live" means the next arrivals, not the settled world. If Sawyer wants a "re-settle with this balance" action, it would need to unpin nodes, which goes against Phase 3. That is his call.
- **Hidden edges still pull.** Visibility only affects drawing, so hiding a kind doesn't rearrange anything. The slider is how you change forces.
- **Overlays are global, not per view.** They are one setting shared by every 3D graph view, as the orchestrator directed ("Settings that persist go through the plugin settings"). Per-leaf plugin data has no stable key. Per-view state could live in `getState` (workspace.json) later if wanted. The spec marked this **Proposed**.
- **Saved with `saveData`, not `saveSettings()`.** `saveSettings()` re-syncs every card, and a slider fires on every step.
- **The open menu doesn't rebuild itself from its own change.** `applyControlSettings` skips the menu when `settings.graph3dOverlays` is the same object the menu sent. A rebuild would end a slider drag. Menus in other views do refresh.
- **Bloom is off by default and only allocated while on.** It costs render targets and a full-screen blur every frame. Rendering through the composer's targets also loses the canvas's multisampling, so plate edges may look more jagged with bloom on.
- **The memory ramp starts at 50%**, because a reviewed card rarely sits much lower, and a 0–100% ramp would paint nearly everything green.
- **"Unresolved links" hides edges, not the ghost nodes themselves.** The spec lists it under Edges. A ghost with its edges hidden still floats where it settled.
- **Room for edge styling** ([[3D Graph - Edge direction and taper]]): the Edges section is per kind, and the Lookdev section is the natural home for a future "Edge style: lines / tapered / arrows" dropdown (a new field in `Graph3DOverlays`, with a default in `normalizeOverlays`). Link particles already show each edge's direction, which may cover part of that idea.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/overlays.ts` (new) | Overlay types and defaults, `normalizeOverlays`, `edgeShown`, `linkStrengthScale`, the mist slider mapping, `overlayNodeColor` / `memoryColor` / `typeColor`, `nodeTags`, `memoryStrengths` |
| `src/graph3d/overlays.test.ts` (new) | 12 unit tests |
| `src/views/Graph3DOverlays.ts` (new) | The header button and its panel |
| `src/views/Graph3DScene.ts` | `SceneOptions.overlays`, `setOverlays`, `setColoring`, link strength from the force balance, mist multiplier, bloom passes, link particles, edge visibility; the focus-dim shader patch shared by edges and particles (`dimWithFocus`) |
| `src/views/Graph3DView.ts` | Menu in the header, close on an outside press, colouring per model (tags, memory strength), overlays pushed in `applyControlSettings` |
| `src/views/Graph3DPlates.ts` | `setLabelsVisible` (hides the glyph layers) |
| `src/views/Graph3DNear.ts` | `setEnabled`, `refreshColors` |
| `src/settings.ts` | `graph3dOverlays` setting and default |
| `src/main.ts` | `normalizeOverlays` in `loadSettings`, `setGraph3DOverlays`, debounced save flushed on unload |
| `src/graph3d/appearance.ts` | Header comment only |
| `styles.css` | Overlays button and panel |
| `e2e/fixtures/graph3d/Crew Drills.md` → `vault/tests/graph3d/` (new) | Fixture |

### Fixture

`vault/tests/graph3d/Crew Drills.md` (master in `e2e/fixtures/graph3d/`). It links to Sailing Basics and to a missing "Crew Roster" note, and has `#drills` and `#safety` headings, a `crew` frontmatter tag, and a heading, bullets, an ordered list, a quote and a paragraph. Its line cards are back-dated to give a spread of retrievability: drill1 ≈100%, drill2 ≈90%, drill3 ≈45%, drill4 very low, drill5 new, and one line has no card.

### Not verified (no Obsidian here)

Everything visual: the bloom strength and threshold (0.8 / 0.5 / 0.6) are untuned, and in light mode the white background is above the threshold. Also unverified: particle size and speed, the panel layout on a phone, whether the card store has this fixture's cards (it depends on Sawyer's include/exclude folder settings), and the exact FSRS retrievability values above. Memory colours are read once per model, so a review done elsewhere shows at the next hop or reload, or when the color mode is switched away and back. Bundle: `main.js` went from 1,402,133 to 1,427,418 bytes (+25 KB: bloom and output passes, plus the menu).
