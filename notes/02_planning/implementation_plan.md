# Implementation Plan

**Project**: Osmosis — An Obsidian Plugin
**Version**: 1.0
**PRD Locked**: Yes (`notes/01_requirements/prd.md`)
**Created**: 2026-02-28

---

## Project Overview

Osmosis is an Obsidian plugin that unifies mind mapping, linked note-taking, and spaced repetition into a single learning system. Users author knowledge once in standard markdown and study it in multiple modes: as an interactive mind map (spatial), as inline flashcards within notes (contextual), or as classic Anki-style card-by-card review (sequential). The core insight is that markdown structure *is* the mind map — headings, bullets, and lists map directly to nodes — and the same content can simultaneously serve as flashcard material without extra authoring effort.

The implementation follows a bottom-up approach: parser first (the shared foundation), then mind map engine, then spaced repetition, then study modes that tie everything together. Each phase produces a working, testable artifact.

---

## Development Phases & Milestones

### Phase 1: Foundation & Parser [Estimated Duration: 1–2 weeks]

**Goals**: Set up the Obsidian plugin scaffold, build the incremental markdown parser, and establish the shared data model that all subsequent features consume.

**Key Tasks**:
1. Initialize the Obsidian plugin project (esbuild, TypeScript strict mode, ESLint, manifest)
2. Design and implement the shared AST / intermediate tree representation
3. Build the incremental markdown parser (headings, bullets, numbered lists, paragraphs)
4. Add range tracking (every AST node knows its character position in source)
5. Add LRU caching for parse results
6. Add early-exit optimizations (skip lines without heading/bullet/number prefixes)
7. Add transclusion link detection (`![[note]]` and `![](path)`)
8. Write parser unit tests with performance benchmarks

**Deliverables**:
- [ ] Working Obsidian plugin that loads and unloads cleanly
- [ ] `OsmosisParser` class with full and incremental parse methods
- [ ] AST types (`OsmosisNode`, `OsmosisTree`) shared across all features
- [ ] Parser benchmarks: < 20ms full parse for 1,000 lines, < 2ms incremental single-line

**Success Criteria for Phase 1**:
- [ ] Plugin loads in Obsidian (desktop) without errors
- [ ] Parser correctly converts markdown headings, bullets, and numbered lists into a tree
- [ ] Incremental parse updates only affected subtrees
- [ ] All parser unit tests pass
- [ ] `npm run lint` and `npm run build` succeed

**Dependencies & Blockers**: None — this is the starting point.

---

### Phase 2: Mind Map Engine [Estimated Duration: 2–3 weeks]

**Goals**: Build the custom SVG-based mind map renderer and editor with bidirectional markdown sync.

**Key Tasks**:
1. Implement the SVG mind map layout algorithm (tree layout with left-right and top-down modes)
2. Implement node rendering with `<foreignObject>` for rich content (markdown, code, LaTeX, images)
3. Implement branch line rendering (curved, straight, angular, rounded-elbow)
4. Add pan and zoom (Scroll/Shift+Scroll = pan, Ctrl+Scroll = zoom, pinch = zoom, drag = pan)
5. Add branch expand/collapse with animation
6. Implement keyboard shortcuts (Tab = add child, Enter = add sibling, Delete, arrow navigation)
7. Implement node editing (click to edit, inline text input)
8. Build bidirectional sync: markdown → map and map → markdown (using parser range tracking)
9. Add cursor sync between markdown editor and map view
10. Implement drag-and-drop node repositioning
11. Implement multi-node selection
12. Register the Mind Map View as an Obsidian `ItemView`
13. Add viewport culling (don't render off-screen nodes)
14. Mobile touch gesture support (tap, pinch zoom, drag)
15. Move nodes up/down (Alt+Up/Down, matching Obsidian's move-line hotkeys)
16. Copy/cut/paste nodes (Ctrl+C/X/V with subtree serialization)
17. Undo/redo for mind map operations (integrated with Obsidian's undo system)
18. Indent/outdent nodes — reparent via Alt+Right/Alt+Left
19. Duplicate node (Ctrl+D deep-copies subtree as sibling)
20. Fold/unfold toggle via keyboard (matching Obsidian's fold hotkeys)
21. Insert parent topic (Ctrl+Enter wraps selected node(s) under a new parent)
22. Shift+Arrow multi-node selection (extend selection across siblings, children, cousins)
23. Mind Map Tool Ribbon: sticky toolbar at the bottom of the mind map view with GUI buttons for existing hotkey actions. View Mode shows: Fit to view, Zoom in/out, Collapse all, Expand all, Center on root, Add sibling, Add child, Insert parent, Move up/down, Indent/Dedent, Undo/Redo, Copy/Paste. Edit Mode (editing a node) shows Obsidian's native editor formatting toolbar (bold, italic, heading, link, etc.). Always visible on desktop, tablet, and mobile. Rendered inside the view (not injected into Obsidian's chrome).

**Deliverables**:
- [ ] `MindMapView` registered as an Obsidian view
- [ ] Interactive SVG mind map that renders from parser AST
- [ ] Bidirectional sync between markdown editor and map
- [ ] 60fps pan/zoom for maps up to 500 nodes on desktop and mobile

**Success Criteria for Phase 2**:
- [ ] Opening a markdown note in Mind Map View shows a correct tree
- [ ] Editing a heading in markdown updates the map node within one frame (< 16ms)
- [ ] Editing a node in the map updates the markdown within one frame (< 16ms)
- [ ] Keyboard shortcuts work (Tab, Enter, Delete, arrows)
- [ ] Cold render < 100ms for 200 nodes on desktop
- [ ] Works on mobile (touch gestures, no layout breakage)

**Dependencies & Blockers**: Phase 1 parser must be complete.

---

### Phase 3: Transclusion [Estimated Duration: 1 week]

**Goals**: Render embedded note links (`![[note]]`, `![](path)`) as sub-branches in the mind map.

**Key Tasks**:
1. Resolve transclusion links to vault files using Obsidian Vault API
2. Parse embedded notes and attach as sub-trees in the AST
3. Implement cycle detection (A embeds B embeds A → visual indicator)
4. Implement lazy loading (collapsed transclusion branches don't parse until expanded)
5. Add visual distinction for transcluded branches (icon/border style)
6. Implement edit propagation (editing a transcluded node writes to the source file)
7. Performance testing with 10, 50, 100 embedded notes (use `e2e/fixtures/transclusion/` subfolder)

**Deliverables**:
- [ ] Transclusion rendering in mind map view
- [ ] Cycle detection with graceful visual indicator
- [ ] Lazy loading for collapsed transcluded branches

**Success Criteria for Phase 3**:
- [ ] Both `![[note]]` and `![](path)` render as sub-branches
- [ ] Recursive embedding works (A → B → C)
- [ ] Circular references display a "circular reference" indicator (no infinite loops)
- [ ] Editing a transcluded node writes to the source file
- [ ] 10 embedded notes resolve in < 50ms
- [ ] 50 embedded notes resolve in < 200ms (with lazy loading)

**Dependencies & Blockers**: Phase 2 mind map engine must be complete.

---

### Phase 4: Mind Map Styling & View State [Estimated Duration: 3–4 weeks]

**Goals**: Implement the full LCVRT styling cascade (all five levels), theme system with custom theme creation, per-node format panel, style classes & variants, copy/paste style, custom color picker, font selection with cross-device fallback, and view state persistence.

**Design References**: Xmind (format panel, "Extract Theme", "Update Style" affordance, Smart Color Themes), Freeplane (9-layer cascading precedence, conditional styles), Minder (StyleAffects scoping, style copy/paste as first-class, live theme preview, level-based style defaults). See `notes/00_inspiration/inspo.md` for full ideation sessions.

**Key Tasks**:
1. Heading-level typography: replace the accent-colored border on heading nodes with typographic styling (font size + weight scaled by heading depth, matching Obsidian's editor).
2. Define the stylable property schema (shape, fill, border, text, branch line, background).
3. Implement the full LCVRT cascade resolver (Local > Class > Variant > Reference > Theme — all five levels ship in v1.0).
4. Build 10–15 preset themes from iTerm2-Color-Schemes + auto-generated palettes.
5. Implement per-depth-level styling (themes define defaults per heading level).
6. Implement colored branches toggle (auto-assign distinct colors per top-level branch).
7. Implement per-node style overrides via frontmatter (`osmosis:` key, tree path and stable ID selectors).
8. Implement node targeting: tree paths (human-facing) and stable IDs (content-position hash).
9. Apply composition encapsulation for transcluded notes (host theme applies, internal cascade preserved).
10. Implement lazy style resolution (defer for collapsed/off-screen transcluded branches).
11. Build view state persistence: save/load fold state, pan, zoom to sidecar JSON files (`.obsidian/plugins/Osmosis/views/`). Support named view states (multiple saved views per note, switchable like Obsidian workspaces).
12. Implement topic shapes (~15–20 shapes: rect, rounded-rect, ellipse, diamond, hexagon, underline, pill, etc.) as SVG path generators.
13. Markdown & OFM rendering parity: ensure all Markdown/OFM syntax renders in mind map nodes identically to Obsidian's note view (code blocks, callouts, math, Mermaid, tables, media, task lists, third-party plugins). Editing hotkeys (Ctrl+B, Ctrl+I, etc.) work on nodes.
14. Node height auto-fit: height always expands to fit content, never clips.
15. Per-node width customization: drag right edge of any node to set custom width; height reflows to fit.
16. Per-map min/max node width: configurable floor and ceiling for node width.
17. Justify topic alignment: per-map toggle that enforces consistent node width across the whole map.
18. Mind Map Properties Sidebar: register an Obsidian right-leaf "View" with **two tabs**: "Map" (map-level settings) and "Format" (per-node styling). Per-map settings persist per-note. **Build this first** so subsequent Phase 4 features have a UI home.
19. Pin/Lock Toggle: toggle in mind map header to "pin" the current map.
20. **Format Panel (Per-Node Styling UI)**: "Format" tab in the Properties Sidebar, contextual to the selected node(s). Controls grayed out when no selection. Sections: Style Class dropdown, Shape visual grid, Fill color picker, Border (color/width/style), Text (font family/size/weight/color/alignment), Branch Line (color/thickness/style). Multi-select shows shared values or "mixed". All overrides stored as frontmatter via stable IDs (`_n:xxxx`). Includes Minder-inspired "Changes affect" scoping (Selected Nodes / All Level N / All Nodes).
21. **Custom Color Picker**: Built-in color picker with three sections: (a) Theme palette — colors extracted from the active theme, updates on theme change; (b) Custom palette — user-saved colors that persist across sessions, "+" to add, right-click to remove; (c) Hex/RGB input + gradient/hue selector for freeform picking. Used by all color controls in Format and Map tabs.
22. **Font Family Selection**: Font picker dropdown populated via `queryLocalFonts()` on desktop, curated list on mobile. Bundle Inter (~20KB WOFF2) as guaranteed cross-device fallback. Power users can drop WOFF2 files in `.obsidian/plugins/Osmosis/fonts/` for portable custom fonts (loaded via base64 `@font-face`, same technique as obsidian-custom-font plugin). Use `document.fonts.check()` to detect unavailable fonts with subtle indicator. Store as CSS fallback chain.
23. **Style Classes (C level in LCVRT)**: Named, reusable style bundles defined in frontmatter (`osmosis.classes`) or at theme level. Assign to nodes via Format panel dropdown. Update a class → all nodes using it update. Theme-level classes shared across maps; note-level classes override same-named theme classes.
24. **Style Variants (V level in LCVRT)**: Switchable style configurations per note (e.g., presentation / study / print). Defined in frontmatter (`osmosis.variants`). Variant switcher in Map tab. Variants change styling (shapes, colors); view states change viewport (fold, pan, zoom). Wildcard `"*"` selector applies to all nodes.
25. **Copy/Paste Style**: Ctrl+Shift+C copies selected node's explicitly-set style properties (not inherited theme defaults). Ctrl+Shift+V pastes as local overrides on selected node(s). Dedicated buttons in the tool ribbon. Minder-inspired first-class treatment — not buried in menus.
26. **"Apply to Level N" Affordance**: After changing any property on a node, a contextual link appears: "Apply to all Level N". Clicking prompts the user to either (a) create a copy of the current theme with the change applied to that depth level, or (b) save over the current theme's depth-level defaults. Shipped preset themes include a "Reset to default" action with confirmation dialog to recover original settings.
27. **Theme Editor (Custom Theme Creation)**: Opens a full Obsidian view showing a sample mind map with all heading levels (H1–H6), bullet/ordered lists, paragraphs — a comprehensive preview of every node type. User styles nodes using the same Format tab controls. Changes apply live to the preview. "Save as theme" names it and adds it to the Theme dropdown alongside presets. Live preview during editing (Minder-inspired). Custom themes stored in plugin settings as `ThemeDefinition` JSON.
28. **"Extract Theme from Map"**: Complementary to the theme editor — user clicks "Save current map as theme" to snapshot the active map's styling (theme + all per-node overrides + depth-level patterns) into a new named theme. Accessible from the Map tab.
29. **"Reset to Theme Defaults" (Per-Node)**: Button in Format tab that clears all local style overrides from the selected node(s), reverting to theme defaults. Confirmation dialog: "Remove all local style overrides from this node?"
30. **Smart Color Themes**: Each preset theme auto-generates 6 color variations (Xmind-inspired): Rainbow (multicolor branches), Light, Dark, Mono, Complementary, Print-friendly. Algorithmically calculated from base palette.
31. **CSS Snippet Support**: Advanced users can write `.osmosis-node[data-depth="2"] { ... }` custom CSS, leveraging the SVG's `data-depth` and `data-path` attributes. Works like Obsidian CSS snippets — drop a file in a folder, toggle it on.

**Deliverables**:
- [ ] Full LCVRT cascade resolving all five levels (L, C, V, R, T)
- [ ] Working theme system with 13+ preset themes + Smart Color Theme variations
- [ ] Custom theme creation (theme editor view + "Extract from map")
- [ ] Format Panel (per-node styling) in Properties Sidebar "Format" tab
- [ ] Custom color picker with theme palette + custom palette + hex input
- [ ] Font family selection with cross-device fallback and WOFF2 bundling
- [ ] Style classes (define, assign, edit, propagate)
- [ ] Style variants (presentation / study / print, switchable)
- [ ] Copy/paste style (Ctrl+Shift+C/V + ribbon buttons)
- [ ] "Apply to Level N" with theme copy/overwrite prompt
- [ ] Per-node frontmatter overrides via stable IDs
- [ ] View state save/load with named view states
- [ ] "Reset to theme defaults" per-node with confirmation
- [ ] Preset theme "Reset to default" with confirmation
- [ ] Pin/Lock toggle for map view

**Success Criteria for Phase 4**:
- [ ] Heading nodes use typographic styling (size/weight by depth) instead of border color
- [ ] Themes apply consistent styling across nodes by depth level
- [ ] Per-node overrides in frontmatter work (both tree path and stable ID selectors)
- [ ] Colored branches auto-assign and children inherit
- [ ] Users can select a node and change its shape, fill, border, text, and branch line via the Format tab
- [ ] Multi-select styling works (shared values shown, changes apply to all)
- [ ] Style classes can be defined, assigned, and edited; changes propagate
- [ ] Style variants can be switched; map re-renders immediately
- [ ] Copy/paste style works via keyboard shortcuts and ribbon buttons
- [ ] "Apply to Level N" prompts for theme copy vs overwrite
- [ ] Custom themes can be created via theme editor and "Extract from map"
- [ ] Custom color picker shows theme palette, custom palette, and hex input
- [ ] Font family selection works on desktop (system fonts) and mobile (curated list + fallback)
- [ ] View state (fold, pan, zoom) persists across sessions via explicit save
- [ ] Named view states can be saved, loaded, and switched
- [ ] Transcluded branches use host theme, internal cascade untouched
- [ ] Style resolution cost scales with visible nodes, not total nodes
- [ ] Properties sidebar has Map and Format tabs, both always accessible
- [ ] Pin toggle prevents map from switching when active note changes
- [ ] Shipped preset themes can be reset to defaults with confirmation

**Dependencies & Blockers**: Phase 3 transclusion must be complete (for composition encapsulation and lazy resolution).

---

### Phase 5: Spaced Repetition Engine [Estimated Duration: 1–2 weeks]

**Goals**: Build the FSRS scheduling engine, SQLite card database, and card generation pipeline.

**Key Tasks**:
1. Set up sql.js (WASM SQLite) with the card database schema (`.osmosis/cards.db`)
2. Implement card database operations (create, read, update, soft-delete, query due cards)
3. Integrate FSRS algorithm (ts-fsrs library or port from Python reference)
4. Implement card identity system (`<!--osmosis-id:abc123-->` inline comments)
5. Build the card generation pipeline:
   a. Heading-paragraph cards (heading = front, body = back)
   b. Cloze cards from `==highlights==`
   c. Cloze cards from `**bold**`
   d. Explicit cards from ` ```osmosis ` code fences
6. Implement note opt-in detection (`osmosis: true` in frontmatter)
7. Implement deck organization (tag hierarchy, folder hierarchy, explicit frontmatter, mind map branch)
8. Handle orphaned cards (soft-delete when source content is deleted)
9. Implement session quotas (daily new card limit + daily review limit)
10. Implement heading auto-generation toggle and heading vs. cloze conflict resolution
11. Write unit tests for FSRS scheduling and card generation

**Deliverables**:
- [ ] `CardDatabase` class wrapping sql.js
- [ ] `FSRSScheduler` class
- [ ] `CardGenerator` class consuming parser AST
- [ ] Card generation from all four card types

**Success Criteria for Phase 5**:
- [ ] Notes with `osmosis: true` generate cards automatically
- [ ] FSRS schedules correctly (intervals increase after successful recall)
- [ ] Card DB opens in < 100ms
- [ ] Due card query < 20ms for single deck
- [ ] Card IDs remain stable across file edits
- [ ] Orphaned cards are soft-deleted, not destroyed
- [ ] All SR unit tests pass

**Dependencies & Blockers**: Phase 1 parser must be complete (for card generation from AST). Can be developed in parallel with Phases 2–4 by a separate developer.

---

### Phase 6: Study Modes & Dashboard [Estimated Duration: 1–2 weeks]

**Goals**: Build the three study modes (sequential, contextual, spatial) and the sidebar dashboard.

**Key Tasks**:
1. **Sequential mode**: Build the Anki-style modal (show front → flip → rate)
   - Deck scoping (single deck, parent deck, all decks)
   - Entry points: sidebar dashboard click, command palette
2. **Contextual mode**: In-note study in Obsidian reading view
   - Hide answers in `osmosis` fences (replace with `░░░░░░`)
   - Click to reveal, optional FSRS rating via inline bubble
   - "Start studying" activation button
   - Progress indicator floating widget
   - MarkdownPostProcessor for reading view integration
3. **Spatial mode**: Mind map node hide/reveal
   - Tap node to reveal
   - "Show children" (+) button
   - Rating bubble after reveal
   - Entry: Mind Map View menu, right-click branch
4. **Sidebar dashboard**: Anki-style panel
   - Deck list with sub-deck hierarchy
   - New / Learn / Due counts per deck
   - Click to start sequential study
   - "Study All" button
5. **FSRS review tagging**: Tag every review with study mode (`contextual`, `sequential`, `spatial`)
6. **Command palette commands**: Insert card skeletons (unidirectional, bidirectional, type-in, bidirectional type-in)
7. Mobile testing for all study modes

**Deliverables**:
- [ ] Sequential study modal
- [ ] Contextual in-note study via reading view
- [ ] Spatial study in mind map view
- [ ] Sidebar dashboard with deck list and counts
- [ ] Command palette card insertion commands

**Success Criteria for Phase 6**:
- [ ] All three study modes functional and update the same FSRS database
- [ ] Sequential mode supports deck scoping
- [ ] Contextual mode activates in reading view on opted-in notes
- [ ] Spatial mode hides/reveals nodes in mind map
- [ ] Study session starts in < 200ms
- [ ] Dashboard shows correct counts, updates after sessions
- [ ] Works on desktop and mobile

**Dependencies & Blockers**: Phases 2 (mind map), 4 (styling), and 5 (SR engine) must be complete.

---

### Phase 7: Integration, Polish & Launch [Estimated Duration: 1–2 weeks]

**Goals**: End-to-end testing, performance optimization, mobile polish, and v1.0 release preparation.

**Key Tasks**:
1. End-to-end testing of all user flows (first-time setup, daily study, mind map authoring, transclusion)
2. Performance profiling and optimization against all targets
3. Mobile-specific testing and polish (touch gestures, responsive layout, performance)
4. Zen Mode implementation (distraction-free full-screen mind map editing)
5. Search within map and jump-to-node navigation
6. Split view (side-by-side map + markdown with live sync)
7. Source mode toggle (visual map vs. raw markdown within Mind Map View)
8. Boundary and Summary annotations on mind map
9. Edge case handling and error recovery
10. Documentation: README, settings descriptions, keyboard shortcut reference
11. Final lint, build, and manual testing pass
12. Plugin submission preparation (manifest, versions, community plugin requirements)

**Deliverables**:
- [ ] All v1.0 features functional and tested
- [ ] All performance targets met
- [ ] Plugin ready for community submission

**Success Criteria for Phase 7**:
- [ ] All launch criteria from PRD met (see Launch Criteria section)
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` succeeds
- [ ] Manual testing in Obsidian desktop and mobile passes all acceptance criteria
- [ ] Plugin loads in < 500ms on mobile

**Dependencies & Blockers**: All previous phases must be complete.

---

## Feature Implementation Sequence

```
Phase 1: Parser           ──────► Shared foundation for everything
Phase 2: Mind Map Engine   ──────► Core differentiator, highest complexity
Phase 3: Transclusion      ──────► Builds on mind map, competitive advantage
Phase 4: Styling/View State ─────► Builds on transclusion (composition encapsulation)
Phase 5: SR Engine         ──────► Can parallel with Phases 2-4
Phase 6: Study Modes       ──────► Requires mind map + SR engine
Phase 7: Polish & Launch   ──────► Integration testing, final push
```

### Implementation Order Rationale

1. **Parser first** because every other feature depends on it. The parser AST is consumed by the mind map renderer, the card generator, and the transclusion resolver. Getting this right (and fast) is the highest-leverage investment.

2. **Mind map engine second** because it's the highest-complexity feature and the core differentiator. If the mind map doesn't work well, the whole product fails. Building it early gives maximum time for iteration and performance tuning.

3. **Transclusion third** because it builds directly on the mind map engine and parser, and is the most novel feature (no existing tool does this). It also needs to be in place before styling, since the LCVRT cascade has transclusion-specific behavior.

4. **Styling fourth** because it depends on transclusion being in place for composition encapsulation and lazy resolution. The theme system also needs the mind map renderer to be stable before layering styling on top.

5. **SR engine in parallel** because it's relatively independent — it only needs the parser (Phase 1), not the mind map. A second developer could build Phase 5 while Phases 2–4 are in progress. We sequence it after Phase 4 for a solo developer simply because the mind map is higher-risk.

6. **Study modes sixth** because they're the integration layer — they need both the mind map (spatial mode) and the SR engine (all modes). The dashboard is low complexity but needs the deck/card data.

7. **Polish last** because everything needs to be functionally complete before we can do meaningful end-to-end testing and optimization.

---

## Architecture & Technical Design

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | TypeScript (strict mode) | Obsidian plugin standard; type safety catches bugs early |
| Build | esbuild (via obsidian-sample-plugin template) | Standard Obsidian build pipeline, fast builds |
| Linting | ESLint + eslint-plugin-obsidianmd | Obsidian-specific rules catch common plugin mistakes |
| Rendering | SVG + `<foreignObject>` hybrid | SVG for map structure (lines, layout); foreignObject for rich node content (HTML/CSS rendering of markdown, code, LaTeX, images). Exportable. |
| Parser | Custom incremental parser | Inspired by Markwhen Parser. Fast parse → intermediate tree → swappable view consumers. Range tracking. LRU caching. |
| SR Algorithm | FSRS (ts-fsrs library) | Modern, open-source, well-validated. Better than SM-2 (used by OSR plugin). |
| SR Database | SQLite via sql.js (WASM) | No native dependencies, runs in Obsidian's WebView on desktop + mobile. Single-file database. |
| SR Data Location | `.osmosis/cards.db` | Centralized. Never touches markdown files. Travels with vault sync. |
| Themes | JSON files in `.osmosis/themes/` | Structured, parseable, user-editable |
| View State | JSON sidecar files in `.obsidian/plugins/Osmosis/views/` | Per-note, lightweight, explicit save |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Obsidian Plugin API                    │
│  (lifecycle, views, settings, commands, workspace, fs)   │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                     OsmosisPlugin                        │
│  (main.ts — registers views, commands, settings, events) │
└───┬──────────┬───────────┼──────────┬───────────┬───────┘
    │          │           │          │           │
    ▼          ▼           ▼          ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐
│ Parser │ │MindMap │ │  Card  │ │ Study  │ │  Sidebar   │
│        │ │ Engine │ │Database│ │ Modes  │ │ Dashboard  │
│ • full │ │        │ │        │ │        │ │            │
│ • incr │ │ • SVG  │ │ • sql  │ │ • seq  │ │ • deck     │
│ • AST  │ │ • fObj │ │ • FSRS │ │ • ctx  │ │   tree     │
│ • range│ │ • sync │ │ • gen  │ │ • sptl │ │ • counts   │
│ • LRU  │ │ • edit │ │ • deck │ │ • rate │ │ • study    │
└───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────────────┘
    │          │           │          │
    └──────────┴───────────┴──────────┘
                    │
              ┌─────┴─────┐
              │ Shared AST │
              │(OsmosisTree)│
              └───────────┘
```

**Data flow**:
1. **Parser** reads markdown → produces `OsmosisTree` (AST with range tracking)
2. **Mind Map Engine** consumes the AST → renders SVG → edits flow back through AST to markdown
3. **Card Generator** consumes the AST → detects card-worthy patterns → writes to CardDatabase
4. **Study Modes** query CardDatabase for due cards → present them in different UX modes → write ratings back
5. **Sidebar Dashboard** queries CardDatabase for deck counts → provides study entry points

### Data Model / Schema (Conceptual)

```
OsmosisNode (in-memory AST)
  - id: string                    # Stable content-position hash
  - type: heading | bullet | ordered | paragraph | transclusion
  - depth: number                 # Heading level or nesting depth
  - content: string               # Raw markdown content of this node
  - children: OsmosisNode[]
  - range: { start: number, end: number }  # Character positions in source
  - sourceFile: string            # For transcluded nodes, the source file path
  - isTranscluded: boolean

Card (SQLite — cards.db)
  - id: TEXT PRIMARY KEY           # Matches <!--osmosis-id:...-->
  - note_path: TEXT                # Source note file path
  - deck: TEXT                     # Deck path (e.g., "python/functions")
  - card_type: TEXT                # heading | cloze_highlight | cloze_bold | explicit | explicit_bidi
  - front: TEXT                    # Front content (markdown)
  - back: TEXT                     # Back content (markdown)
  - created_at: INTEGER            # Unix timestamp
  - updated_at: INTEGER
  - deleted_at: INTEGER            # Soft-delete timestamp (NULL = active)

CardSchedule (SQLite — cards.db)
  - card_id: TEXT                  # FK to Card
  - stability: REAL               # FSRS stability
  - difficulty: REAL               # FSRS difficulty
  - due: INTEGER                   # Next due timestamp
  - last_review: INTEGER           # Last review timestamp
  - reps: INTEGER                  # Total reviews
  - lapses: INTEGER                # Total lapses
  - state: TEXT                    # new | learning | review | relearning

ReviewLog (SQLite — cards.db)
  - id: INTEGER PRIMARY KEY
  - card_id: TEXT                  # FK to Card
  - rating: INTEGER                # 1=Again, 2=Hard, 3=Good, 4=Easy
  - study_mode: TEXT               # sequential | contextual | spatial
  - reviewed_at: INTEGER           # Unix timestamp
  - elapsed_days: REAL             # Days since last review
  - scheduled_days: REAL           # Days that were scheduled

Theme (JSON — .osmosis/themes/*.json)
  - name: string
  - levels: { [depth: number]: NodeStyle }
  - branchColors: string[]
  - coloredBranches: boolean
  - background: string

NodeStyle
  - shape: string                  # rect, rounded-rect, ellipse, diamond, etc.
  - fill: string                   # Hex color
  - border: { color, width, style }
  - text: { font, size, weight, color, alignment }
  - branchLine: { style, color, thickness, tapering }

ViewState (JSON — .obsidian/plugins/Osmosis/views/*.view.json)
  - noteFile: string
  - foldState: { [nodeId: string]: boolean }
  - pan: { x: number, y: number }
  - zoom: number
  - selectedNodes: string[]
```

### Key Integration Points

| Integration | Purpose | Implementation Notes |
|-------------|---------|----------------------|
| Obsidian Vault API | Read/write note files, resolve `![[]]` links | `app.vault.read()`, `app.metadataCache.getFirstLinkpathDest()` |
| Obsidian Workspace | Register Mind Map View, sidebar panel | `registerView()`, `addRibbonIcon()`, `detachLeavesOfType()` |
| Obsidian Settings | Plugin configuration | `PluginSettingTab`, `Setting` class |
| Obsidian Commands | Command palette integration | `addCommand()` for study, card insertion, view toggle |
| Obsidian MarkdownRenderer | Rich content in nodes and cards | `MarkdownRenderer.renderMarkdown()` inside foreignObject |
| Obsidian MarkdownPostProcessor | Contextual mode (reading view) | `registerMarkdownCodeBlockProcessor('osmosis', ...)` + post-processor for cloze |
| sql.js (WASM) | Card database | Bundled as WASM, loaded lazily on first SR access |
| ts-fsrs | Scheduling algorithm | npm dependency, pure TypeScript |

### Deployment Architecture

- **Development**: Local dev with `npm run dev` (esbuild watch mode). Build output to `e2e-vault/.obsidian/plugins/Osmosis/`. Test in Obsidian desktop vault.
- **Testing**: Manual testing in Obsidian desktop + mobile. Unit tests via `npm test`. Performance benchmarks for parser and renderer.
- **Production**: Community plugin submission via GitHub release + Obsidian plugin registry. Single `main.js` + `manifest.json` + `styles.css`.

---

## Detailed Task Breakdown

### Phase 1 Tasks

**Task 1.1: Plugin Scaffold**
- Description: Initialize the Obsidian plugin project from obsidian-sample-plugin template. Set up esbuild, TypeScript strict mode, ESLint with obsidian-plugin rules, manifest.json, and build output to `e2e-vault/.obsidian/plugins/Osmosis/`.
- Acceptance Criteria: `npm run build` produces `main.js` in build output dir. Plugin loads in Obsidian. `npm run lint` passes.
- Estimated Effort: 2–4 hours
- Dependencies: None
- Owner: Claude + Sawyer

**Task 1.2: AST Type Definitions**
- Description: Define the shared AST types (`OsmosisNode`, `OsmosisTree`, `NodeType`, `Range`) that all features consume. Design for extensibility (card metadata, style metadata can be attached later).
- Acceptance Criteria: Types compile. Represent headings, bullets, ordered lists, paragraphs, and transclusion placeholders.
- Estimated Effort: 2–4 hours
- Dependencies: Task 1.1

**Task 1.3: Full Parser**
- Description: Build the markdown-to-AST parser. Parse headings (levels 1–6), bullet lists (`- `), numbered lists (`1. `), paragraphs, and nested structure. Track heading hierarchy and list nesting depth.
- Acceptance Criteria: Correctly parses a representative markdown note into a tree. Handles nested lists, mixed headings and lists, empty lines.
- Estimated Effort: 1–2 days
- Dependencies: Task 1.2

**Task 1.4: Range Tracking**
- Description: Every AST node records its start/end character positions in the source markdown. Enables cursor sync and targeted re-parsing.
- Acceptance Criteria: Given a character position, can find the corresponding AST node. Given an AST node, can find its source range.
- Estimated Effort: 4–8 hours
- Dependencies: Task 1.3

**Task 1.5: Incremental Parser**
- Description: Given a text change (insert/delete at position), re-parse only the affected subtree. Use range tracking to identify the minimal re-parse scope.
- Acceptance Criteria: Single-line change re-parses in < 2ms. Multi-line paste (100 lines) re-parses in < 10ms. Produces identical AST to a full re-parse.
- Estimated Effort: 1–2 days
- Dependencies: Task 1.4

**Task 1.6: LRU Cache**
- Description: Cache parse results keyed by file path + content hash. Near-instant view switching for recently parsed files.
- Acceptance Criteria: Second parse of same content returns cached result in < 1ms. Cache evicts least-recently-used entries when capacity exceeded.
- Estimated Effort: 4–8 hours
- Dependencies: Task 1.3

**Task 1.7: Transclusion Link Detection**
- Description: Detect `![[note]]` and `![](path)` patterns during parsing. Create transclusion placeholder nodes in the AST (resolved later by the transclusion system in Phase 3).
- Acceptance Criteria: Both wikilink and markdown-style transclusion links are detected and represented in the AST.
- Estimated Effort: 2–4 hours
- Dependencies: Task 1.3

**Task 1.8: Parser Tests & Benchmarks**
- Description: Comprehensive unit tests for all parser features. Performance benchmarks against PRD targets.
- Acceptance Criteria: All tests pass. 1,000-line note parses in < 20ms. Single-line incremental parse in < 2ms.
- Estimated Effort: 1 day
- Dependencies: Tasks 1.3–1.7

---

### Phase 2 Tasks

**Task 2.1: Mind Map View Registration**
- Description: Register `MindMapView` as an Obsidian `ItemView`. Add ribbon icon and command to open Mind Map View for the current note. Handle view lifecycle (open, close, navigation).
- Acceptance Criteria: Can open Mind Map View from command palette and ribbon icon. View displays for the active note. Switching notes updates the view.
- Estimated Effort: 4–8 hours
- Dependencies: Phase 1 complete

**Task 2.2: SVG Layout Algorithm**
- Description: Implement the tree layout algorithm that positions nodes in 2D space. Support left-right layout (default) and top-down layout. Handle variable node sizes.
- Acceptance Criteria: Nodes are positioned without overlap. Layout respects hierarchy (children are visually subordinate to parents). Layout computation < 50ms for 500 nodes.
- Estimated Effort: 2–3 days
- Dependencies: Task 2.1

**Task 2.3: Node Rendering with foreignObject**
- Description: Render each AST node as an SVG group containing a shape (rect, etc.) and a `<foreignObject>` element. Use `MarkdownRenderer.renderMarkdown()` for rich content inside nodes.
- Acceptance Criteria: Nodes display markdown content (bold, italic, code, LaTeX, images). Node sizes adapt to content.
- Estimated Effort: 1–2 days
- Dependencies: Task 2.2

**Task 2.4: Branch Line Rendering**
- Description: Draw connecting lines/curves between parent and child nodes. Support curved (default), straight, angular, and rounded-elbow styles.
- Acceptance Criteria: Lines connect parent to children correctly. Line style is configurable.
- Estimated Effort: 1 day
- Dependencies: Task 2.2

**Task 2.5: Pan and Zoom**
- Description: Implement viewport pan and zoom using SVG `viewBox` transformation. Target 60fps. Input mapping: Scroll and Shift+Scroll pan the view (vertical and horizontal respectively; trackpad two-finger gestures produce natural diagonal panning). Ctrl+Scroll zooms. Pointer drag also pans. Pinch gesture zooms on mobile/trackpad. This mapping feels intuitive on laptop trackpads and allows unconstrained diagonal movement.
- Acceptance Criteria: Scroll/Shift+Scroll pans, Ctrl+Scroll zooms. Trackpad two-finger gesture pans freely (diagonal). Pinch zooms. Smooth 60fps for maps up to 500 nodes on desktop and mobile.
- Estimated Effort: 1–2 days
- Dependencies: Task 2.3

**Task 2.6: Branch Expand/Collapse**
- Description: Click a toggle on a node to collapse/expand its children. Animate the transition (< 100ms on desktop, < 150ms on mobile).
- Acceptance Criteria: Collapse hides all descendants. Expand reveals them. Animation is smooth.
- Estimated Effort: 1 day
- Dependencies: Task 2.3

**Task 2.7: Keyboard Navigation & Editing**
- Description: Implement keyboard shortcuts: Tab (add child), Enter (add sibling), Delete (remove node), arrow keys (navigate between nodes), F2/Enter to edit node content.
- Acceptance Criteria: All listed shortcuts work. Node selection is visible. Editing a node shows an inline text input.
- Estimated Effort: 1–2 days
- Dependencies: Task 2.3

**Task 2.8: Bidirectional Sync (Markdown → Map)**
- Description: When the markdown source changes, re-parse (incrementally) and update the map. Use range tracking to update only affected nodes.
- Acceptance Criteria: Typing in the markdown editor updates the corresponding map node within one frame (< 16ms). Adding/removing headings or list items updates the tree structure.
- Estimated Effort: 2–3 days
- Dependencies: Tasks 2.3, 1.5 (incremental parser)

**Task 2.9: Bidirectional Sync (Map → Markdown)**
- Description: When the user edits a node in the map (rename, add child, add sibling, delete, reorder), write the change back to the markdown source using range tracking.
- Acceptance Criteria: Map edits reflect in markdown within one frame. No cursor jumps, flicker, or undo history loss.
- Estimated Effort: 2–3 days
- Dependencies: Task 2.8

**Task 2.10: Cursor Sync**
- Description: Cursor position in the markdown editor syncs to selected node in map, and vice versa. Toggle-able.
- Acceptance Criteria: Clicking a node in the map moves the cursor to the corresponding position in markdown. Moving the cursor in markdown highlights the corresponding node.
- Estimated Effort: 1 day
- Dependencies: Task 2.9

**Task 2.11: Drag-and-Drop Node Repositioning**
- Description: Drag a node to reorder it among siblings or reparent it under a different node. Update markdown accordingly.
- Acceptance Criteria: Drag-and-drop works on desktop (mouse) and mobile (touch). Markdown updates correctly.
- Estimated Effort: 1–2 days
- Dependencies: Task 2.9

**Task 2.12: Multi-Node Selection**
- Description: Shift-click or rubber-band select multiple nodes. Support bulk operations (delete, move, collapse).
- Acceptance Criteria: Multiple nodes can be selected and operated on as a group.
- Estimated Effort: 1 day
- Dependencies: Task 2.7

**Task 2.13: Viewport Culling**
- Description: Don't render nodes that are outside the visible viewport. Re-render as the viewport changes (pan/zoom).
- Acceptance Criteria: Maps with 1,000+ nodes maintain 60fps on desktop. Only visible nodes are in the DOM.
- Estimated Effort: 1–2 days
- Dependencies: Task 2.5

**Task 2.14: Mobile Touch Support**
- Description: Ensure all interactions work with touch: tap to select, long-press for context menu, pinch zoom, drag to pan, touch to edit.
- Acceptance Criteria: All mind map interactions work on Obsidian mobile (iOS and Android).
- Estimated Effort: 1–2 days
- Dependencies: Tasks 2.5–2.12

**Task 2.15: Move Nodes Up/Down**
- Description: Move selected node(s) up or down among siblings, equivalent to Obsidian's "move line up" / "move line down" commands. Should use the same hotkeys the user has configured in Obsidian for those commands (default: Alt+Up / Alt+Down). Works with single or multiple selected nodes. Updates markdown source accordingly.
- Acceptance Criteria: Alt+Up/Down (or user-configured hotkey) reorders the selected node(s) among siblings. Markdown source updates correctly. Works with multi-selection.
- Estimated Effort: 4–8 hours
- Dependencies: Task 2.9, Task 2.12

**Task 2.16: Copy/Cut/Paste Nodes**
- Description: Support Ctrl+C / Ctrl+X / Ctrl+V for copying, cutting, and pasting selected nodes in the mind map. Copy/cut serializes the node subtree. Paste inserts as sibling(s) below the currently selected node. Works with multi-selection. Updates markdown source accordingly. Clipboard supports both internal (within mind map) and external (paste as markdown text) formats.
- Acceptance Criteria: Copy/cut/paste works for single and multi-selected nodes. Pasted nodes appear as siblings below selection. Markdown source updates correctly. Can paste mind map nodes as markdown text in the editor.
- Estimated Effort: 1–2 days
- Dependencies: Task 2.9, Task 2.12

**Task 2.17: Undo/Redo for Mind Map Operations**
- Description: Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) should undo/redo mind map operations including node edits, moves, deletes, adds, and reordering. Should integrate with Obsidian's undo system where possible so that undo in the editor and undo in the map are coherent.
- Acceptance Criteria: All mind map operations are undoable/redoable. Undo stack is coherent with Obsidian's editor undo.
- Estimated Effort: 1–2 days
- Dependencies: Task 2.9

**Task 2.18: Indent/Outdent Nodes (Reparent)**
- Description: Alt+Right on a selected node reparents it as a child of its previous sibling (indent / move right). Alt+Left promotes it to its parent's level (outdent / move left). Consistent with Alt+Up/Down for reordering — all four Alt+Arrow keys form a unified spatial movement system. Works with multi-selection. Updates markdown heading levels or list nesting accordingly.
- Acceptance Criteria: Alt+Right indents (reparents under previous sibling), Alt+Left outdents (promotes to parent level). Markdown heading levels / list nesting update correctly. Works with multi-selection.
- Estimated Effort: 4–8 hours
- Dependencies: Task 2.9, Task 2.12

**Task 2.19: Duplicate Node**
- Description: Ctrl+D duplicates the selected node(s) as sibling(s) immediately below. Deep-copies the entire subtree including all children. Updates markdown source accordingly.
- Acceptance Criteria: Ctrl+D duplicates selected node(s) with full subtree. Duplicates appear as siblings below the original. Markdown source updates correctly.
- Estimated Effort: 4–8 hours
- Dependencies: Task 2.9

**Task 2.20: Fold/Unfold Toggle via Keyboard**
- Description: Use the same hotkeys Obsidian uses for fold/unfold (default: Ctrl+Shift+[ / Ctrl+Shift+]) to collapse/expand the selected node's branch via keyboard. Should respect the user's configured Obsidian keybindings for these commands.
- Acceptance Criteria: Fold/unfold hotkeys toggle branch collapse/expand. Respects user-configured Obsidian keybindings.
- Estimated Effort: 2–4 hours
- Dependencies: Task 2.6

**Task 2.21: Insert Parent Topic**
- Description: Ctrl+Enter on a selected node inserts a new parent node between the selected node and its current parent. The selected node (and its siblings if multi-selected) become children of the new node. Updates markdown source accordingly (adjusts heading levels or list nesting). Works with single and multi-selection.
- Acceptance Criteria: Ctrl+Enter creates a new parent node above the selection. Selected node(s) become children of the new node. Markdown heading levels / list nesting adjust correctly. Works with multi-selection.
- Estimated Effort: 4–8 hours
- Dependencies: Task 2.9

**Task 2.22: Shift+Arrow Multi-Node Selection**
- Description: Shift+Arrow Keys extend the current selection to adjacent nodes. Shift+Down/Up selects the next/previous sibling. Shift+Right selects into children. Shift+Left selects up to the parent. Selection can span across depth levels — siblings, children, cousins, etc. depending on starting point. Complements existing Shift+click and rubber-band selection methods.
- Acceptance Criteria: Shift+Arrow extends selection in the corresponding direction. Can select across depth levels (children, cousins). Works from any starting node. Visual selection highlight updates immediately.
- Estimated Effort: 4–8 hours
- Dependencies: Task 2.12

**Task 2.23: Rich Node Editing via Embedded Obsidian Editor**
- Description: Replace the plain textarea node editor with an embedded Obsidian MarkdownView inside a WorkspaceLeaf to provide a first-class editing experience. When the user enters edit mode (double-click, F2, etc.), create a floating overlay container positioned over the node, embed a WorkspaceLeaf hosting a MarkdownView in Live Preview mode, and populate it with only the node's markdown content. The editor supports all Obsidian editing hotkeys (Ctrl+B, Ctrl+I, Ctrl+K, etc.), `[[link]]` autocomplete, syntax highlighting, and shows Obsidian's built-in mobile editing ribbon on mobile. The overlay auto-resizes: width grows up to pane/screen width, then height grows up to available vertical space (accounting for mobile virtual keyboard). Enter inserts a newline. Ctrl+Enter saves and exits edit mode. Escape discards changes and exits. Blur (clicking away) saves and exits. Edits are written back to the source file (respecting transclusion). Falls back to enhanced textarea if WorkspaceLeaf embedding is unavailable.
- Acceptance Criteria: Node editor renders in Live Preview mode with syntax highlighting. Ctrl+B/I/K and other Obsidian hotkeys work. `[[link]]` autocomplete works. Mobile editing ribbon appears on mobile. Editor auto-resizes horizontally then vertically within pane bounds. Virtual keyboard doesn't obscure the editor on mobile. Ctrl+Enter saves, Escape cancels, blur saves. Transcluded node edits write to source file. Fallback to textarea works if embedding fails.
- Estimated Effort: 2–3 days
- Dependencies: Task 2.7

---

### Phase 3 Tasks

**Task 3.1: Transclusion Link Resolution**
- Description: Resolve `![[note]]` and `![](path)` placeholder nodes to actual vault files using Obsidian's `metadataCache` and `vault` APIs.
- Acceptance Criteria: Both wikilink and markdown-style links resolve to the correct file. Handles missing files gracefully.
- Estimated Effort: 4–8 hours
- Dependencies: Phase 2 complete, Task 1.7

**Task 3.2: Embedded Sub-Tree Rendering**
- Description: Parse the resolved file and attach its AST as children of the transclusion node. Render in the mind map as a collapsible sub-branch.
- Acceptance Criteria: Transcluded content appears as a sub-branch. Recursive embedding (A → B → C) works.
- Estimated Effort: 1 day
- Dependencies: Task 3.1

**Task 3.3: Cycle Detection**
- Description: Detect circular references during tree construction. Display a visual "circular reference" indicator instead of recursing infinitely.
- Acceptance Criteria: A embeds B embeds A → no infinite loop, indicator shown. Detection < 1ms.
- Estimated Effort: 4–8 hours
- Dependencies: Task 3.2

**Task 3.4: Lazy Loading**
- Description: Collapsed transclusion branches don't parse the embedded file until expanded. Parse on first expand, cache result.
- Acceptance Criteria: Initial render only parses visible/expanded transclusions. Expanding a collapsed transcluded branch triggers parse + render.
- Estimated Effort: 1 day
- Dependencies: Task 3.2

**Task 3.5: Visual Distinction**
- Description: Transcluded branches have a subtle visual indicator (icon, border style, or color) distinguishing them from local content.
- Acceptance Criteria: Users can visually identify which branches come from another file.
- Estimated Effort: 4 hours
- Dependencies: Task 3.2

**Task 3.6: Edit Propagation**
- Description: When the user edits a node in a transcluded branch, the edit writes to the source file (not the parent note).
- Acceptance Criteria: Editing a transcluded node modifies the source file. Parent note is unchanged.
- Estimated Effort: 1 day
- Dependencies: Task 3.2, Task 2.9

**Task 3.7: Transclusion Performance Testing**
- Description: Performance testing for transclusion with varying numbers of embedded notes. Use `e2e/fixtures/transclusion/` subfolder for test fixtures. Verify performance targets from Phase 3 success criteria.
- Acceptance Criteria: 10 embedded notes resolve in < 50ms. 50 embedded notes resolve in < 200ms (with lazy loading). 100 embedded notes remain responsive with no perceptible lag.
- Estimated Effort: 4–8 hours
- Dependencies: Tasks 3.1–3.6

---

### Phase 4 Tasks

**Task 4.0: Heading-Level Typography**
- Description: Replace the accent-colored border on heading nodes with typographic styling that reflects heading depth. H1 nodes should use larger, bolder text; H2 slightly smaller; etc. — mirroring Obsidian's editor. Remove `.osmosis-node-heading` border override so it doesn't conflict with the selection highlight (which also uses border color). Use `data-depth` attribute + CSS to scale `font-size` and `font-weight` per heading level.
- Acceptance Criteria: Heading nodes are visually distinguishable from list/paragraph nodes via font size and weight (not border). Selection border is clearly distinct from heading styling. H1–H6 have progressively decreasing size/weight.
- Estimated Effort: 2–4 hours
- Dependencies: None (can be done immediately, before the full theme system)

**Task 4.1: Stylable Property Schema**
- Description: Define the TypeScript interfaces for all stylable properties (NodeStyle, BranchLineStyle, ThemeDefinition) and the LCVRT cascade resolution function. All five cascade levels (Local, Class, Variant, Reference, Theme) ship in v1.0.
- Acceptance Criteria: Types cover all properties from PRD (shape, fill, border, text, branch line, background). Cascade function resolves a property by checking L → C → V → R → T in order, returning first non-undefined value. All five levels are functional.
- Estimated Effort: 4–8 hours
- Dependencies: Phase 3 complete

**Task 4.2: Theme System**
- Description: Implement theme loading, switching, and per-depth-level defaults. Build 10–15 preset themes.
- Acceptance Criteria: Themes apply to all nodes. Switching themes updates the map immediately. Presets cover a range of styles.
- Estimated Effort: 2–3 days
- Dependencies: Task 4.1

**Task 4.3: Topic Shapes**
- Description: Implement ~15–20 node shapes (rect, rounded-rect, ellipse, diamond, hexagon, underline, pill, parallelogram, etc.) as SVG path generators.
- Acceptance Criteria: Each shape renders correctly. Shapes adapt to content size.
- Estimated Effort: 1–2 days
- Dependencies: Task 4.1

**Task 4.4: Per-Node Frontmatter Overrides**
- Description: Parse `osmosis:` frontmatter key for style overrides. Support tree path (`"## Architecture"`) and stable ID (`_n:a3f2`) selectors.
- Acceptance Criteria: Frontmatter overrides apply to targeted nodes. Tree paths and stable IDs both work.
- Estimated Effort: 1 day
- Dependencies: Task 4.1

**Task 4.5: Colored Branches**
- Description: Auto-assign distinct colors per top-level branch when enabled. Children inherit parent branch color.
- Acceptance Criteria: Toggle works. Colors are distinct and readable. Child nodes inherit their branch color.
- Estimated Effort: 4–8 hours
- Dependencies: Task 4.2

**Task 4.6: Composition Encapsulation**
- Description: Implement transclusion style cascade: transcluded note's internal LCVRT resolves first; host theme applies at T level; host can override at R level; cannot alter internal cascade.
- Acceptance Criteria: Transcluded branches pick up host theme. Host overrides work via `"![[Note B]]/## Intro"`. Note B's internal styles are preserved.
- Estimated Effort: 1 day
- Dependencies: Tasks 4.1, 3.2

**Task 4.7: Lazy Style Resolution**
- Description: Defer LCVRT resolution for collapsed/off-screen transcluded branches until they become visible.
- Acceptance Criteria: Style resolution cost scales with visible nodes, not total nodes.
- Estimated Effort: 4–8 hours
- Dependencies: Tasks 4.6, 3.4

**Task 4.8: View State Persistence**
- Description: Save and load view state (fold state, pan, zoom, selected nodes) to JSON sidecar files. Explicit save via UI button.
- Acceptance Criteria: "Save view" persists state. Re-opening a note restores the last saved view. Files stored in `.obsidian/plugins/Osmosis/views/`.
- Estimated Effort: 4–8 hours
- Dependencies: Task 2.6

**Task 4.9: Node Height Auto-Fit**
- Description: Node height must always expand to fit its rendered content — never clip or overflow. Current bug: paragraph nodes with long content are visibly cut off (content overflows the node box). Fix `<foreignObject>` sizing so height is derived from the rendered content height, not a fixed value. Height recomputes whenever content changes (on edit, zoom, or width change).
- Acceptance Criteria: No node clips its content at any zoom level. Long paragraph nodes expand to show all text. Height recomputes on content change and on node width change.
- Estimated Effort: 4–8 hours
- Dependencies: Task 2.3

**Task 4.10: Per-Node Width Customization**
- Description: User can drag the right edge of any node to set a custom width. Height automatically reflows to fit content at the new width. Custom width is persisted in view state. Live preview during drag. Resizing one node does not affect siblings.
- Acceptance Criteria: Right-edge drag handle appears on hover/select. Dragging resizes width and reflows height. Custom width persists across sessions (saved in view state). Sibling nodes are unaffected.
- Estimated Effort: 1 day
- Dependencies: Tasks 4.9, 4.8

**Task 4.11: Per-Map Min/Max Node Width**
- Description: Per-map settings for minimum and maximum node width. Min width prevents nodes from collapsing too narrow (e.g., single-word nodes). Max width caps how wide a node can grow before wrapping content. Configurable in map settings or frontmatter. Per-node manual width (Task 4.10) can override these bounds.
- Acceptance Criteria: Min/max width settings apply across the whole map. Per-node override takes precedence. Settings persist with the map.
- Estimated Effort: 4–8 hours
- Dependencies: Task 4.10

**Task 4.12: Justify Topic Alignment**
- Description: Per-map toggle that enforces a consistent node width across the entire map (or optionally per depth level), giving the map a clean, presentation-like appearance. When enabled, all nodes share the same width. Works alongside min/max width constraints and is toggled in map settings or frontmatter.
- Acceptance Criteria: Justify alignment toggle forces uniform node width. Per-depth-level option available. Interacts correctly with min/max width settings.
- Estimated Effort: 4–8 hours
- Dependencies: Task 4.11

**Task 4.13: Markdown & OFM Rendering Parity**
- Description: Mind map nodes must render all Markdown and Obsidian-flavored Markdown (OFM) syntax equivalently to how it appears in an Obsidian note. This is a comprehensive parity effort covering: code blocks with syntax highlighting, Obsidian callouts/admonitions, Obsidian Bases, Dataview tables, Map View embeds, math/LaTeX blocks, Mermaid diagrams, embedded images/videos, tables, blockquotes, footnotes, task lists, and all inline formatting. Additionally, editing commands that work in Obsidian's editor should work in the mind map — e.g., Ctrl+B on a selected node makes its contents bold, Ctrl+B while editing a node makes the selected text bold. Use `e2e/fixtures/rendering/` subfolder for test fixtures. Subtasks:
  - 4.13.1: Code blocks — render with syntax highlighting (use Obsidian's built-in Prism.js). Fix current bug where code blocks are split across multiple nodes.
  - 4.13.2: Callouts/Admonitions — render callout blocks within nodes matching Obsidian's styling.
  - 4.13.3: Math/LaTeX — render `$inline$` and `$$display$$` math within nodes via MathJax/KaTeX.
  - 4.13.4: Mermaid diagrams — render mermaid code blocks as diagrams within nodes.
  - 4.13.5: Tables — render markdown tables within nodes.
  - 4.13.6: Embedded media — images, videos, audio within nodes.
  - 4.13.7: Task lists — render `- [ ]` / `- [x]` with interactive checkboxes.
  - 4.13.8: Blockquotes & footnotes — render blockquotes and footnote tooltips within nodes.
  - 4.13.9: Third-party plugin content — Dataview tables, Obsidian Bases, Map View, etc. via `MarkdownRenderer.renderMarkdown()`.
  - 4.13.10: Inline formatting hotkeys — Ctrl+B (bold), Ctrl+I (italic), Ctrl+K (link), Ctrl+` (inline code), etc. work on selected nodes or within node edit mode.
- Acceptance Criteria: Every Markdown and OFM syntax element renders in mind map nodes identically to how it appears in an Obsidian note. Code blocks show syntax highlighting. Editing hotkeys (bold, italic, link, code) work both at node level and within edit mode. Third-party plugin content renders via Obsidian's MarkdownRenderer.
- Estimated Effort: 3–5 days
- Dependencies: Task 2.3 (node rendering), Task 2.7 (keyboard editing)

**Task 4.14: Properties Sidebar Tabs (Map + Format)**
- Description: Refactor the existing Properties Sidebar (`PropertiesSidebarView.ts`) from a single scrollable panel into a two-tab layout: "Map" tab (existing map-level settings) and "Format" tab (per-node styling, new). Both tabs remain accessible regardless of node selection. Format tab controls are grayed out when no node is selected. Uses Obsidian's built-in tab/section UI patterns. This task creates the tab structure and the Format tab skeleton — individual controls are wired up in subsequent tasks.
- Acceptance Criteria: Properties Sidebar displays two tabs: "Map" and "Format". Map tab contains all existing settings (theme, shape, layout, spacing, etc.). Format tab shows placeholder sections for Shape, Fill, Border, Text, Branch Line, Style Class. Format controls are disabled/grayed when no node is selected. Switching tabs preserves state. Sidebar updates when node selection changes.
- Estimated Effort: 4–8 hours
- Dependencies: Task 4.18 (Properties Sidebar — already complete)

**Task 4.15: Custom Color Picker**
- Description: Build a reusable custom color picker component for use throughout the Format and Map tabs. Three sections: (a) **Theme palette** — swatches extracted from the active theme's fills, branch colors, and text colors; updates when theme changes. (b) **Custom palette** — user-saved colors that persist in plugin settings; "+" button to add the current color, right-click/long-press to remove. (c) **Hex/RGB input field** + a gradient/hue area for freeform color selection. The picker is a dropdown/popover triggered by clicking any color swatch in the sidebar. Returns the selected color to the caller.
- Acceptance Criteria: Color picker renders with all three sections. Theme palette auto-populates from active theme. Custom palette persists across sessions. Hex input accepts and validates hex colors. Gradient/hue selector allows freeform picking. Picker integrates as a reusable component callable from any Setting control.
- Estimated Effort: 1–2 days
- Dependencies: Task 4.2 (Theme System — already complete)

**Task 4.16: Font Family Selection**
- Description: Build a font family picker for the Format tab's Text section. On desktop (Electron), use `queryLocalFonts()` to enumerate all installed system fonts and populate a searchable dropdown. On mobile or when the API is unavailable, show a curated list of common fonts (system defaults, web-safe families). Bundle **Inter** (~20KB WOFF2) in the plugin as a guaranteed cross-device fallback. Support power-user WOFF2 drop-in: users can place `.woff2` files in `.obsidian/plugins/Osmosis/fonts/` — these are loaded via base64 `@font-face` injection (same technique as obsidian-custom-font plugin) and appear in the font dropdown. Store font preference as a CSS fallback chain (`font-family: 'User Choice', 'Inter', sans-serif`). Use `document.fonts.check()` to detect when a chosen font is unavailable on the current device; show a subtle "(fallback)" indicator. Font CSS is scoped to `.osmosis-mind-map` container, not global.
- Acceptance Criteria: Font dropdown shows system fonts on desktop. Curated fallback list on mobile. Inter bundled and always available. WOFF2 files in fonts/ directory are discovered, loaded, and appear in dropdown. Unavailable fonts show fallback indicator. Font changes apply immediately to selected node(s). Font scoped to mind map only.
- Estimated Effort: 1–2 days
- Dependencies: Task 4.14 (Sidebar Tabs)

**Task 4.17: Format Panel — Per-Node Styling Controls**
- Description: Wire up the Format tab with full per-node styling controls. When one or more nodes are selected, the Format tab enables and shows the node's current resolved style (from LCVRT cascade) with controls to override each property. Sections (collapsible): **Style Class** (dropdown of defined classes + "New class" button), **Shape** (visual grid of ~15 shape thumbnails from Task 4.3), **Fill** (color picker from Task 4.15), **Border** (color picker, width stepper 0–8, style dropdown: solid/dashed/dotted/none), **Text** (font family from Task 4.16, size stepper, weight dropdown 100–900, color picker, alignment toggle group: left/center/right), **Branch Line** (color picker, thickness slider 1–8, style dropdown: curved/straight/angular/rounded-elbow). Multi-select behavior: shared values displayed normally, differing values shown as "Mixed" or blank; changes apply to all selected nodes. Overrides stored in frontmatter as `osmosis.styles._n:xxxx` using stable IDs. Includes Minder-inspired "Changes affect" scoping selector at the top: "Selected Nodes" (default) / "All Level N" / "All Nodes". The "All Level N" option triggers Task 4.26's prompt flow.
- Acceptance Criteria: All property sections render with correct controls. Selecting a node populates controls with its resolved style. Changing any property updates the node immediately (live preview). Multi-select shows shared/mixed values. Changes persist as frontmatter overrides with stable IDs. "Changes affect" selector scopes the change correctly.
- Estimated Effort: 2–3 days
- Dependencies: Tasks 4.14, 4.15, 4.16, 4.3, 4.4

**Task 4.20: Style Classes (C Level in LCVRT)** ✅
- Description: Implement the Class level of the LCVRT cascade. Style classes are named, reusable style bundles. A class is defined once and referenced by any number of nodes. Updating the class definition updates all nodes using it. Classes defined in frontmatter under `osmosis.classes`. In the Format tab, a "Style class" dropdown lists available classes. Selecting a class assigns it to the node (`osmosis.styles._n:xxxx.class = "className"`). Copy/paste style preserves class assignments so targets stay linked to the class definition.
- Acceptance Criteria: Classes can be defined in frontmatter. Assigning a class to a node applies its properties (shape, fill, border, text, etc.). Local overrides (L level) still win over class values. Updating a class definition propagates to all nodes using it. Format tab dropdown shows available classes. Copy/paste style copies class assignment, not expanded properties.
- Estimated Effort: 1–2 days
- Dependencies: Tasks 4.1, 4.17

**Task 4.20.1: Style Class Editor**
- Description: Build a class management UI in the Format tab's Style Class section. Provides "New class" button that prompts for a name and creates an empty class definition in frontmatter `osmosis.classes`. "Edit" button on the class dropdown opens an inline editor where users can set class properties (fill, shape, border, text, branch line) using the same controls as the Format tab. "Delete" button removes the class definition and clears `class` assignments from all nodes using it (with confirmation). Editing a class definition propagates changes to all nodes using it immediately.
- Acceptance Criteria: "New class" button creates a named class in frontmatter. Inline editor allows setting all NodeStyle properties for a class. Changes propagate live to all nodes using the class. "Delete" removes class definition and clears assignments with confirmation. UI is accessible from the Style Class section in the Format tab.
- Estimated Effort: 1 day
- Dependencies: Task 4.20

**Task 4.20.2: Global Style Classes**
- Description: Style classes can also be defined at plugin-settings level (global), available across all mind maps regardless of which note is open. Global classes are stored in plugin settings under a `globalClasses` record. Per-note frontmatter classes override same-named global classes (note-level wins). The Format tab dropdown shows both global and per-note classes, with a visual indicator (e.g., globe icon or "(global)" suffix) for global ones. The class editor (Task 4.20.1) includes a "Scope" toggle: "This note" vs "Global" when creating or editing a class. Moving a note-level class to global (or vice versa) is supported.
- Acceptance Criteria: Global classes are stored in plugin settings and available in all maps. Per-note classes override same-named globals. Dropdown shows both with scope indicator. Class editor supports creating/editing at both scopes. Scope can be changed after creation.
- Estimated Effort: 4–8 hours
- Dependencies: Task 4.20.1

**Task 4.21: Style Variants (V Level in LCVRT)**
- Description: Implement the Variant level of the LCVRT cascade. Style variants are switchable style configurations per note (inspired by USD VariantSets). Each variant is a named set of style overrides defined in frontmatter under `osmosis.variants`. A variant switcher dropdown in the Map tab allows instant switching. Variants are orthogonal to view states — a variant changes *styling* (shapes, colors), a view state changes *viewport* (fold, pan, zoom). They combine freely. Local overrides still win over variant values. The `"*"` wildcard selector applies variant styles to all nodes (useful for print/accessibility variants). Variant switching is instant — no re-parse needed, just re-resolve styles and re-render.
- Acceptance Criteria: Variants can be defined in frontmatter with named sets of style overrides. Variant switcher in Map tab switches instantly. Active variant is persisted (`osmosis.activeVariant`). Wildcard `"*"` selector works. Local overrides take precedence over variant values. Variants compose correctly with the full LCVRT cascade.
- Estimated Effort: 1–2 days
- Dependencies: Tasks 4.1, 4.17

**Task 4.22: Copy/Paste Style**
- Description: Implement style copy/paste as a first-class feature (inspired by Xmind and Minder). **Ctrl+Shift+C** captures the selected node's explicitly-set style properties (local overrides only — not inherited theme defaults). **Ctrl+Shift+V** applies the copied style as local overrides on the currently selected node(s). Add dedicated "Copy style" and "Paste style" buttons to the tool ribbon (`ToolRibbon.ts`). Only copies properties that were explicitly set (sparse — unset properties are not included, so paste doesn't overwrite the target's other inherited styles). Visual feedback on copy (brief highlight or toast). Paste is undoable.
- Acceptance Criteria: Ctrl+Shift+C copies style from selected node. Ctrl+Shift+V pastes style onto selected node(s). Ribbon buttons work identically. Only explicitly-set properties are copied (not theme defaults). Paste is undoable. Works with multi-select (paste to all selected).
- Estimated Effort: 4–8 hours
- Dependencies: Tasks 4.17, 4.4

**Task 4.23: Theme Editor View**
- Description: Implement a full Obsidian view for creating and editing custom themes (inspired by Xmind's "Extract Theme" + Minder's live theme preview). Opened via an "Edit theme..." button next to the Theme dropdown in the Map tab. The view displays a **sample mind map** with all heading levels (H1–H6), bullet lists, ordered lists, paragraphs, code blocks — a comprehensive preview of every node type at every depth. The user styles nodes in the preview using the same Format tab controls (the Properties Sidebar contextualizes to the preview map). Changes apply live to the preview. The view has a header with: theme name input, "Save as theme" button, "Cancel" button, "Delete theme" button (for custom themes only). Custom themes are stored in plugin settings as `ThemeDefinition` JSON objects. Editing a built-in preset theme always creates a copy ("Save as new theme"). Built-in presets cannot be overwritten but can be **reset to defaults** — a "Reset to default" action with confirmation dialog restores the original shipped theme definition.
- Acceptance Criteria: Theme editor opens as a full view with a sample mind map. All heading levels, lists, and paragraphs are represented. User can style the preview using Format tab controls. Changes preview live. "Save as theme" persists to plugin settings and appears in Theme dropdown. Editing a preset creates a copy. "Delete theme" removes custom themes. "Reset to default" restores shipped preset themes with confirmation dialog.
- Estimated Effort: 2–3 days
- Dependencies: Tasks 4.14, 4.17, 4.2

**Task 4.24: Extract Theme from Map**
- Description: Complementary to the Theme Editor (Task 4.23). A "Save current map as theme" action accessible from the Map tab. Snapshots the active map's complete styling — theme base + all per-depth-level patterns + per-node overrides (generalized into depth-level defaults where patterns are detected) — into a new named `ThemeDefinition`. User is prompted for a theme name. The new theme appears in the Theme dropdown. This provides a design-by-example workflow: style a real map the way you want, then extract it as a reusable theme.
- Acceptance Criteria: "Save current map as theme" action in Map tab. Prompts for theme name. Extracts styling into a valid ThemeDefinition. New theme appears in dropdown and can be applied to other maps. Per-node overrides that follow depth patterns are generalized into depth-level defaults.
- Estimated Effort: 4–8 hours
- Dependencies: Tasks 4.2, 4.17

**Task 4.25: Reset to Theme Defaults (Per-Node)**
- Description: A "Reset to theme defaults" button in the Format tab. When clicked, shows a confirmation dialog: "Remove all local style overrides from this node? It will revert to the theme defaults." On confirm, clears the node's entry from `osmosis.styles` in frontmatter, removing all local (L-level) overrides. The node reverts to its resolved appearance from C → V → R → T cascade levels. Works with multi-select — clears overrides from all selected nodes. Undoable.
- Acceptance Criteria: "Reset to theme defaults" button appears in Format tab when a styled node is selected. Confirmation dialog shown on click. On confirm, all local overrides are removed from frontmatter. Node reverts to theme appearance. Works with multi-select. Action is undoable.
- Estimated Effort: 2–4 hours
- Dependencies: Tasks 4.17, 4.4

**Task 4.26: "Apply to Level N" Affordance**
- Description: After changing any style property on a node via the Format tab, a contextual link/button appears: "Apply to all Level N" (where N is the node's depth). Clicking it presents a prompt with two options: (a) **Create a copy** of the current theme with the change applied to that depth level's defaults — names the copy and adds it to the Theme dropdown; (b) **Save over** the current theme's depth-level defaults for that level — modifies the active theme in place. For shipped preset themes, option (b) is labeled "Save as custom theme" and always creates a copy (presets cannot be permanently overwritten). The "Reset to default" action (from Task 4.23) can restore any shipped preset.
- Acceptance Criteria: "Apply to all Level N" link appears after styling a node. Prompt offers copy vs overwrite options. Creating a copy adds a new theme to the dropdown. Overwriting modifies the theme's depth-level defaults. Preset themes force a copy. Changes apply immediately to all nodes at that depth.
- Estimated Effort: 4–8 hours
- Dependencies: Tasks 4.17, 4.23

**Task 4.27: Smart Color Themes**
- Description: Each preset theme auto-generates 6 color variations (inspired by Xmind's Smart Color Theme): (a) **Rainbow** — multicolor branches with distinct colors per top-level branch; (b) **Light** — lighter tones derived from base palette; (c) **Dark** — darker tones; (d) **Mono** — monochromatic using a single hue; (e) **Complementary** — complementary color scheme; (f) **Print-friendly** — high contrast, suitable for printing. Colors are algorithmically calculated from the base theme palette using HSL transformations. Variations appear as sub-options when selecting a theme in the Map tab (e.g., "Ocean" expands to show "Ocean — Rainbow", "Ocean — Light", etc.).
- Acceptance Criteria: Each preset theme generates 6 algorithmically-derived color variations. Variations are accessible as sub-options in the Theme dropdown. Each variation produces visually distinct, harmonious colors. Print-friendly variation has sufficient contrast for black-and-white printing.
- Estimated Effort: 1–2 days
- Dependencies: Task 4.2

**Task 4.28: CSS Snippet Support**
- Description: Advanced users can write custom CSS targeting mind map nodes using data attributes already present in the SVG (`data-depth`, `data-path`, `data-node-id`). CSS snippets work like Obsidian's native CSS snippet system — users drop a `.css` file in a designated folder (`.obsidian/plugins/Osmosis/snippets/` or reuse Obsidian's own snippet folder with an `.osmosis-` prefix convention), and toggle snippets on/off in the Map tab. Snippets apply at the lowest priority (below Theme level), so they serve as a base layer that themes and local overrides can override.
- Acceptance Criteria: CSS snippets can target mind map nodes via data attributes. Snippets are discoverable and togglable in the Map tab. Snippets apply below theme priority in the cascade. Changes are reflected immediately on toggle.
- Estimated Effort: 4–8 hours
- Dependencies: Task 4.2

---

### Phase 5 Tasks

**Task 5.1: sql.js Setup & Database Schema**
- Description: Bundle sql.js WASM. Create the card database schema (cards, card_schedule, review_log tables). Implement lazy initialization (load on first SR access, not plugin startup).
- Acceptance Criteria: Database creates and opens in < 100ms. Schema supports all fields from data model.
- Estimated Effort: 4–8 hours
- Dependencies: Phase 1 complete

**Task 5.2: Card Database Operations**
- Description: CRUD operations for cards: create, read, update, soft-delete, query due cards by deck, query all due cards.
- Acceptance Criteria: Due card query < 20ms for single deck. < 50ms for all decks. Soft-delete preserves history.
- Estimated Effort: 1 day
- Dependencies: Task 5.1

**Task 5.3: FSRS Integration**
- Description: Integrate ts-fsrs library (or port from reference). Implement rating → schedule update flow.
- Acceptance Criteria: FSRS computation < 1ms per card. Intervals increase after successful recall. Again resets appropriately.
- Estimated Effort: 1 day
- Dependencies: Task 5.1

**Task 5.4: Card Identity System**
- Description: Generate stable card IDs as `<!--osmosis-id:abc123-->` inline comments. Detect existing IDs during parsing. Handle ID-less content (generate new ID).
- Acceptance Criteria: IDs are stable across file edits (content changes don't break them). Deleted IDs gracefully regenerate.
- Estimated Effort: 4–8 hours
- Dependencies: Task 1.3

**Task 5.5: Card Generation — Heading-Paragraph**
- Description: Detect `## Heading` + body text → generate card (heading = front, body = back).
- Acceptance Criteria: Correct cards generated. Heading auto-generation toggle works. Card IDs assigned.
- Estimated Effort: 4–8 hours
- Dependencies: Tasks 5.4, 5.2

**Task 5.6: Card Generation — Cloze (Highlight & Bold)**
- Description: Detect `==highlighted==` and `**bold**` text → generate cloze cards.
- Acceptance Criteria: Cloze cards generated with term blanked on front. Both highlight and bold syntax work.
- Estimated Effort: 4–8 hours
- Dependencies: Tasks 5.4, 5.2

**Task 5.7: Card Generation — Explicit Fences**
- Description: Parse ` ```osmosis ` code fences. Extract metadata (bidi, type-in, deck, hint), front/back content split on `***`.
- Acceptance Criteria: All fence variants parse correctly. Metadata keys applied. Bidi generates two cards.
- Estimated Effort: 1 day
- Dependencies: Tasks 5.4, 5.2

**Task 5.8: Note Opt-In & Deck Organization**
- Description: Detect `osmosis: true` in frontmatter. Implement deck organization via tag hierarchy, folder hierarchy, explicit frontmatter (`osmosis-deck:`), and mind map branch.
- Acceptance Criteria: Only opted-in notes generate cards. Decks organized correctly by all four methods.
- Estimated Effort: 1 day
- Dependencies: Tasks 5.5–5.7

**Task 5.9: Orphaned Cards & Session Quotas**
- Description: Handle deleted source content (soft-delete cards). Implement daily new card limit and review limit.
- Acceptance Criteria: Orphaned cards archived, not destroyed. Session quotas enforced.
- Estimated Effort: 4–8 hours
- Dependencies: Task 5.2

**Task 5.10: Heading vs. Cloze Conflict & Exclusion**
- Description: Implement configurable behavior when a section has both heading card and cloze. Implement `<!-- osmosis-exclude -->` suppression.
- Acceptance Criteria: Conflict resolution configurable (Both / Cloze only / Heading only). Exclude comment prevents card generation.
- Estimated Effort: 4–8 hours
- Dependencies: Tasks 5.5, 5.6

**Task 5.11: SR Unit Tests**
- Description: Tests for FSRS scheduling, card generation (all types), deck organization, orphaned cards, conflict resolution.
- Acceptance Criteria: All tests pass. Coverage of edge cases.
- Estimated Effort: 1 day
- Dependencies: Tasks 5.1–5.10

---

### Phase 6 Tasks

**Task 6.1: Sequential Study Mode**
- Description: Anki-style modal: show front → tap to flip → rate (Again/Hard/Good/Easy). Deck scoping (single, parent, all).
- Acceptance Criteria: Modal works. Flip animation. Rating updates FSRS. Deck scoping filters correctly.
- Estimated Effort: 1–2 days
- Dependencies: Phase 5 complete

**Task 6.2: Contextual Study Mode**
- Description: In-note study in reading view. Register `MarkdownCodeBlockProcessor` for `osmosis` fences to hide answers. Implement cloze blanking in reading view via post-processor. "Start studying" button, inline rating bubble, progress widget.
- Acceptance Criteria: Reading view hides answers. Click reveals. Rating bubble appears when studying. Progress indicator shows X/Y.
- Estimated Effort: 2–3 days
- Dependencies: Phase 5 complete

**Task 6.3: Spatial Study Mode**
- Description: Mind map node hide/reveal. Tap to reveal. "Show children" (+) button. Rating bubble after reveal. Entry points: Mind Map View menu, right-click branch.
- Acceptance Criteria: Nodes hide in study mode. Tap reveals and shows rating. Branch study scopes correctly.
- Estimated Effort: 1–2 days
- Dependencies: Phases 2 and 5 complete

**Task 6.4: Sidebar Dashboard**
- Description: Anki-style sidebar panel with deck tree, New/Learn/Due counts, click-to-study, "Study All" button.
- Acceptance Criteria: Dashboard loads in < 200ms. Counts are accurate. Click starts sequential study.
- Estimated Effort: 1 day
- Dependencies: Phase 5 complete

**Task 6.5: FSRS Review Tagging**
- Description: Tag every review log entry with the study mode that produced it.
- Acceptance Criteria: ReviewLog entries include `study_mode` field correctly.
- Estimated Effort: 2–4 hours
- Dependencies: Tasks 6.1–6.3

**Task 6.6: Command Palette Card Insertion**
- Description: Register commands for inserting card skeletons: basic, bidirectional, type-in, bidirectional type-in. Place fence at cursor with `***` separator.
- Acceptance Criteria: All four commands insert correct skeleton. Cursor positioned on front line.
- Estimated Effort: 4–8 hours
- Dependencies: Phase 1 complete

---

### Phase 7 Tasks

**Task 7.1: End-to-End User Flow Testing**
- Description: Test all five user flows from PRD: first-time setup, daily study, mind map authoring + spatial study, in-note contextual study, transclusion knowledge tree.
- Acceptance Criteria: All flows work end-to-end on desktop and mobile.
- Estimated Effort: 1–2 days
- Dependencies: Phases 1–6 complete

**Task 7.2: Performance Profiling & Optimization**
- Description: Profile against all performance targets. Optimize hot paths (parser, layout, render, DB queries).
- Acceptance Criteria: All performance targets from PRD met (see Performance Requirements table).
- Estimated Effort: 2–3 days
- Dependencies: Task 7.1

**Task 7.3: Mobile Polish**
- Description: Dedicated mobile testing pass. Fix touch gesture issues, responsive layout, performance on mid-tier devices.
- Acceptance Criteria: All features work on Obsidian mobile. 60fps for maps up to 500 nodes. Plugin load < 500ms.
- Estimated Effort: 1–2 days
- Dependencies: Task 7.1

**Task 7.4: Zen Mode**
- Description: Distraction-free full-screen mind map editing mode.
- Acceptance Criteria: Zen mode hides Obsidian UI chrome. Escape exits. Works on desktop and mobile.
- Estimated Effort: 4–8 hours
- Dependencies: Phase 2 complete

**Task 7.5: Search Within Map**
- Description: Search bar that finds nodes by text content and jumps to them. Highlight matches.
- Acceptance Criteria: Search finds nodes. Jump-to-node animates pan/zoom. Matches highlighted.
- Estimated Effort: 4–8 hours
- Dependencies: Phase 2 complete

**Task 7.6: Split View**
- Description: Side-by-side layout with mind map on one side, markdown on the other, with live sync.
- Acceptance Criteria: Split view shows both representations. Edits in either side sync to the other.
- Estimated Effort: 1 day
- Dependencies: Task 2.9

**Task 7.7: Source Mode Toggle**
- Description: Toggle between visual mind map and raw markdown within the Mind Map View.
- Acceptance Criteria: Toggle switches views. State preserved across toggles.
- Estimated Effort: 4–8 hours
- Dependencies: Phase 2 complete

**Task 7.8: Boundary & Summary Annotations**
- Description: Boundary: visual frame around a group of topics. Summary: condense multiple topics into an annotation.
- Acceptance Criteria: Users can create boundaries and summaries. They render correctly in the map.
- Estimated Effort: 1–2 days
- Dependencies: Phase 2 complete

**Task 7.9: Documentation & Release Prep**
- Description: README, settings descriptions, keyboard shortcut reference. manifest.json and versions.json for community plugin submission.
- Acceptance Criteria: Documentation is complete. Plugin meets Obsidian community plugin requirements.
- Estimated Effort: 1 day
- Dependencies: All features complete

---

## Testing & Quality Assurance

### Testing Strategy

- **Unit Tests**: Parser (all node types, edge cases, incremental parsing), FSRS scheduling, card generation (all types), deck organization, style cascade resolution. Coverage target: 80%+ for parser and SR engine.
- **Integration Tests**: Bidirectional sync (edit markdown → check map, edit map → check markdown), transclusion resolution, card generation from real markdown files.
- **Manual Testing**: All five user flows on Obsidian desktop and mobile. Mind map interactions (pan, zoom, edit, drag, collapse). Study modes. Dashboard. Theme switching.
- **Performance Benchmarks**: Automated benchmarks for parser speed, layout computation, render time, DB query time. Run as part of CI.

### Quality Thresholds

- **Test Coverage**: 80%+ for parser and SR engine modules
- **Performance**: All targets from PRD Performance Requirements section met
- **Lint**: `npm run lint` passes with zero errors
- **Build**: `npm run build` succeeds with no warnings
- **Mobile**: All features functional on Obsidian mobile (iOS + Android)
- **Memory**: Base plugin < 5 MB, 500-node map < 6 MB

---

## Risk Mitigation

### High-Risk Items

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|-----------|--------|----------------------|
| Mind map engine complexity exceeds estimates (bidir sync, layout, mobile touch) | High | High | Build simplest working prototype first. Ship with limited editing if sync proves too complex. |
| Mobile foreignObject rendering quirks (blurry text, broken CSS, touch conflicts) | Medium | Medium | Test on real devices early (Phase 2). Fallback: plain SVG `<text>` for mobile nodes. |
| Performance targets too aggressive for mobile (200+ node maps lag) | Medium | Medium | Viewport culling and lazy loading built in from day one, not bolted on later. |
| FSRS scheduling conflicts between devices (multi-device sync) | Medium | Low | Last-write-wins for card state. Reviews are append-only. FSRS recomputes from full log if needed. |
| Scope creep — v1.0 feature list is already substantial | High | High | MVP scope explicitly defined. Cut from bottom of v1.0 list if needed. |
| sql.js WASM performance on mobile | Low | Medium | Benchmark early. Queries are simple and indexed. 10K cards is well within WASM SQLite capability. |

### Dependency Management

| Dependency | Risk | Mitigation |
|------------|------|------------|
| ts-fsrs (FSRS library) | Library may be incomplete or buggy | Validate against reference implementation. If issues, port from Python. |
| sql.js (WASM SQLite) | WASM loading on mobile | Test early on real devices. Lazy-load on first SR access. |
| Obsidian API | API changes across versions | Pin minimum Obsidian version. Use stable APIs only. |
| eslint-plugin-obsidianmd | Plugin may not cover all rules | Supplement with manual review. |

---

## Development Approach & Guardrails

### Code Standards

- **TypeScript strict mode**: No `any` types. Proper interfaces for all data structures. Type all function parameters and returns.
- **Single-purpose functions**: Each function does one thing. Complex operations decomposed.
- **Meaningful names**: Variables, functions, and types named for clarity, not brevity.
- **Comments**: Only where logic is non-obvious. No commented-out code.
- **Error handling**: Catch at system boundaries (file I/O, DB access, user input). Log errors. Graceful degradation.
- **Logging**: Console logging for debugging (gated behind a debug flag in settings).

### Version Control & Collaboration

- **Repository**: `/home/sawyer/Osmosis` (Git)
- **Branching Strategy**: Feature branches off `main`. Branch naming: `feat/<feature>`, `fix/<bug>`, `refactor/<area>`.
- **Commit Conventions**: Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `perf:`.
- **Code Review**: Claude reviews for spec compliance. Manual review in Obsidian for UX.

### Tool Setup

- [x] Git repository initialized
- [ ] npm project initialized (package.json, tsconfig.json, esbuild.config.mjs)
- [ ] ESLint configured with obsidian-plugin rules
- [ ] Build pipeline outputting to `e2e-vault/.obsidian/plugins/Osmosis/`
- [ ] Test framework (vitest or jest)
- [ ] Beads for task tracking

---

## Timeline & Milestones

### Gantt View (Simplified)

```
Week 1-2   [Phase 1: Parser & Foundation]
Week 2-4   [Phase 2: Mind Map Engine]
Week 5     [Phase 3: Transclusion]
Week 5-6   [Phase 4: Styling & View State]
Week 6-7   [Phase 5: SR Engine] (can overlap with Phases 2-4 if parallelized)
Week 7-8   [Phase 6: Study Modes & Dashboard]
Week 8-9   [Phase 7: Integration, Polish & Launch]
```

Total estimated duration: **8–10 weeks** for a solo developer. Can compress to **6–7 weeks** if parser and SR engine are developed in parallel.

### Key Milestones

- **Milestone 1** (End of Week 2): Parser complete with tests and benchmarks. Plugin scaffold builds and loads.
- **Milestone 2** (End of Week 4): Mind map renders from markdown with bidirectional sync. Editable. Works on mobile.
- **Milestone 3** (End of Week 6): Transclusion, styling, and view state complete. Full mind map experience.
- **Milestone 4** (End of Week 7–8): SR engine and all three study modes functional. Dashboard shows decks.
- **Milestone 5** (End of Week 9–10): v1.0 ready. All launch criteria met. Performance targets hit.

---

## Success Criteria for Planning Phase

- [x] Architecture is documented (AST, data model, integration points)
- [x] Tasks are broken down into manageable pieces (nothing bigger than 2–3 days)
- [x] Timeline is realistic (padded for unknowns)
- [x] Risks are identified and mitigated
- [x] Feature implementation sequence is justified
- [x] Testing strategy is clear
- [x] Deployment approach is documented
- [ ] Beads issues created for Phase 1 tasks (next step)

---

## Open Questions & Decisions Needed

- [x] **Mind map engine as separate package?** Build as internal module with clean boundaries. Extract later if there's demand.
- [x] **Transcluded node card IDs**: Card ID stays with the content in the source file. The transclusion is a view, not ownership transfer.
- [x] **Bold as cloze — excessive bold notes**: Per-note toggle in frontmatter (`osmosis-cloze-bold: false`). Global setting as default.
- [x] **Incremental parser Web Workers**: Not for v1.0. Profile first. The < 20ms target for 1,000 lines is achievable on the main thread.
- [x] **Minimum Obsidian version**: Target the current stable version at time of release. Document in manifest.json.
- [x] **Card generation from templates**: Generate on first edit or explicit trigger, not on template insertion.
- [x] **Spatial mode animation**: Fade (opacity 0→1, ~200ms). Simple, performant, consistent.

---

## Appendix: Reference Documents

- **PRD**: `notes/01_requirements/prd.md`
- **Inspiration Phase**: `notes/00_inspiration/inspo.md`, `notes/00_inspiration/core_concept.md`
- **Reference Plugins**: `ref/obsidian-sample-plugin`, `ref/obsidian-spaced-repetition`, `ref/decks`, `ref/markmap`, `ref/obsidian-map-view`
- **Parser Reference**: `ref/parser` (Markwhen-inspired parser)
- **Obsidian Plugin API reference**: `ref/obsidian-api`

---

## Sign-Off

This plan represents the agreed-upon approach to building Osmosis v1.0. Major changes should be documented and tracked in Beads.

**Review Date**: 2026-02-28
**Reviewed By**: _Pending review_
**Status**: Needs Review
