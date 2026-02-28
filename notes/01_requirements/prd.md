# Product Requirements Document (PRD)

**Project**: Osmosis — An Obsidian Plugin
**Version**: 1.0
**Created**: 2026-02-28
**Owner**: Sawyer Rensel
**Last Updated**: 2026-02-28

---

## Executive Summary

Osmosis is an Obsidian plugin that unifies mind mapping, linked note-taking, and spaced repetition into a single learning system. Users author knowledge once in standard markdown and study it in multiple modes: as an interactive mind map with spatial recall, as inline flashcards within their notes, or as a classic Anki-style card-by-card review. The core insight is that markdown structure *is* the mind map — headings, bullets, and lists map directly to nodes — and the same content can simultaneously serve as flashcard material without any extra authoring effort.

Osmosis solves the fragmentation problem: today, serious learners juggle separate tools for note-taking (Obsidian), mind mapping (Xmind), and spaced repetition (Anki), with no connection between them. Osmosis collapses these into one workflow where notes, maps, and flashcards are three views of the same knowledge.

---

## Problem Statement

### The Problem

Learners who use best-in-class techniques — mind mapping for capture, linked notes for organization, spaced repetition for retention — are forced to use separate, disconnected tools. Knowledge captured in Xmind can't be linked to other knowledge. Notes in Obsidian can't be studied as a mind map. Flashcards in Anki are divorced from the source material. This fragmentation creates three specific pain points:

1. **Duplicate effort**: The same knowledge must be authored multiple times — once as notes, again as mind map nodes, again as flashcard fronts/backs.
2. **Broken context**: Studying a flashcard in Anki provides no spatial or relational context. You can't see where a concept sits in the larger knowledge structure.
3. **Sync decay**: Over time, notes evolve but the corresponding flashcards and mind maps don't. The three representations drift apart.

### Who Experiences It

**Primary**: Knowledge workers and students who already use Obsidian for note-taking and want mind mapping and/or spaced repetition integrated into their existing workflow.

**Secondary**: Anki users who want their flashcards connected to their source material rather than floating in isolation. Xmind users who want their mind maps stored in an open, linkable format.

### Current State

- **Obsidian + Anki**: Users write notes in Obsidian, then manually create flashcards in Anki. The two systems are completely disconnected. Some users use the Anki-Connect plugin to export cards, but the workflow is one-directional and lossy.
- **Obsidian-Spaced-Repetition plugin**: The most popular SR plugin for Obsidian. Embeds scheduling data as HTML comments in markdown files (clutters notes). Uses the older SM-2 algorithm. No mind map integration. No spatial study.
- **Decks plugin**: A newer FSRS-based SR plugin. Generates cards from headings and tables. No cloze support. No mind map integration.
- **Obsidian mind map plugins**: obsidian-mind-map renders a read-only mind map from markdown. No editing, no bidirectional sync, no study mode, no interactivity beyond viewing.
- **Xmind**: Excellent mind mapping UX but closed format, no linking between maps, no spaced repetition, no integration with note-taking systems.

The common frustration: none of these tools connect the three learning modalities. Users are forced to choose which technique to invest in, or waste time maintaining parallel systems.

### Why It Matters

When these three techniques work together, learning becomes dramatically more effective:

- **Spatial memory** (from mind maps) reinforces conceptual relationships
- **Active recall** (from flashcards) strengthens retention
- **Linked notes** (from Obsidian) provide context and interconnection

Osmosis makes it possible to author knowledge once and leverage all three techniques without additional effort. A student studying for an exam can take notes naturally, see them as a mind map to understand structure, and study them via spaced repetition to retain details — all within the same tool, on the same data.

---

## Goals & Success Metrics

### Primary Goals

1. **Goal**: Enable "author once, study in multiple modes"
   - **Success Metric**: A user can write a single markdown note and study it as a mind map (spatial), inline in the note (contextual), and via classic card review (sequential) — without creating any duplicate content
   - **Target**: All three study modes functional and usable for MVP

2. **Goal**: Deliver a mind map experience that is genuinely useful for both viewing AND editing
   - **Success Metric**: Bidirectional sync between markdown editor and mind map view with no perceptible lag
   - **Target**: < 16ms sync latency (one frame) for single-line edits; < 100ms cold render for 200-node maps on desktop

3. **Goal**: Provide spaced repetition that works without disrupting the note-taking workflow
   - **Success Metric**: Zero-effort card generation from standard markdown (headings, highlights, bold text) with opt-in per note
   - **Target**: Cards generated automatically from opted-in notes with stable identity across edits

4. **Goal**: Work on both desktop and mobile as a first-class experience
   - **Success Metric**: All features functional on Obsidian mobile; mind maps interactive via touch
   - **Target**: 60fps on mobile for maps up to 500 nodes; 30fps minimum up to 2,000 nodes

### Secondary Goals

1. Support transclusion (`![[linked-note]]` and `![](path-to-linked-note)`) as embedded sub-branches in mind maps — a capability no existing mind map tool offers
2. Provide an escape hatch to/from Anki via .apkg import/export for users migrating between tools
3. Offer card authoring transparency (gutter indicators, "Cards in This Note" panel) so users always know what has become a flashcard

### Out of Scope / Non-Goals

- **AI-generated mind maps or flashcards** — Osmosis is a tool for human-authored knowledge, not AI-generated content
- **Real-time collaboration** — Osmosis is a single-user plugin; collaboration depends on Obsidian's future capabilities
- **Cloud sync** — Osmosis relies on Obsidian's existing sync mechanisms (Obsidian Sync, iCloud, etc.)
- **Standalone application** — Osmosis is an Obsidian plugin, not a separate app
- **Custom Anki-style note type templates** — Osmosis's markdown-native card types cover common cases; arbitrary multi-field templates add complexity without clear value
- **Pitch mode / slide generation** — Mind maps are for learning, not presentations

---

## User Personas

### Primary Persona: The Obsidian Student

**Role**: University student or self-directed learner
**Characteristics**: Takes extensive notes in Obsidian using headings, bullets, and links. Familiar with spaced repetition concepts. Currently uses or has used Anki. Wants their notes to "do more" without extra work.
**Pain Points**: Has hundreds of notes but no systematic way to review them. Creating Anki cards from notes feels like double work. Existing SR plugins are clunky or clutter their notes.
**How They'll Use This**: Adds `osmosis: true` to frontmatter of notes they want to study. Uses `==highlights==` for key terms. Opens Mind Map View to see the big picture. Studies due cards via the sidebar dashboard each morning.
**Success Looks Like**: Their daily review habit is sustained because cards come from their existing notes with zero extra effort. They retain more because spatial context from the mind map reinforces relationships.

### Secondary Persona: The Visual Thinker

**Role**: Knowledge worker, researcher, or creative professional
**Characteristics**: Thinks in mind maps. Currently uses Xmind or similar. Frustrated that mind maps are stored in closed formats and can't link to other documents. May or may not care about spaced repetition.
**Pain Points**: Xmind can't link maps to other maps. Mind map data is locked in proprietary formats. Existing Obsidian mind map plugins are view-only and lack interactivity.
**How They'll Use This**: Primarily uses Mind Map View for authoring and organizing knowledge. Appreciates that mind maps are stored as standard markdown. Uses transclusion to build hierarchical knowledge structures across multiple notes.
**Success Looks Like**: They've replaced Xmind with Osmosis for daily mind mapping. Their maps are interconnected via Obsidian links. They may discover the spaced repetition features as a bonus.

### Tertiary Persona: The Anki Migrator

**Role**: Long-time Anki user exploring Obsidian
**Characteristics**: Has years of scheduling history and thousands of cards in Anki. Wants to consolidate tools but doesn't want to lose their review progress.
**Pain Points**: Anki flashcards exist in isolation from source material. Maintaining both Anki and Obsidian is redundant. Switching costs are high (losing scheduling history).
**How They'll Use This**: Imports existing Anki decks via .apkg import. Gradually authors new cards in Osmosis using explicit card syntax. Uses sequential study mode which feels familiar.
**Success Looks Like**: Their Anki decks are now in Obsidian, connected to their notes. New cards are authored directly in markdown. They discover spatial and contextual study modes as unique advantages over Anki.

---

## Core Features & Requirements

### Feature 1: Custom Mind Map Engine

**User Story**: As a visual thinker, I want to see my markdown notes rendered as an interactive mind map, so that I can understand the structure and relationships of my knowledge at a glance.

**Description**: Osmosis includes a custom-built mind map engine that renders markdown structure as an interactive SVG-based mind map. The map is not just a viewer — it is a full editor. Markdown elements map directly to node types:

| Markdown Syntax | Node Type |
|---|---|
| `#` headings | Heading nodes (depth = heading level) |
| `- ` bullet items | Bulleted list nodes |
| `1. ` numbered items | Ordered list nodes |
| Paragraphs (no prefix) | Paragraph nodes |

The engine uses **SVG for map structure** (lines, curves, layout) and **`<foreignObject>`** for node content (enabling full HTML/CSS rendering of markdown, code blocks, LaTeX, images inside nodes).

**Mind Map view includes:**
- Three layout toggles: branch direction (left-right vs up-down), node placement (both sides vs one side), flip side
- Branch collapsing/expanding
- Drag-and-drop node repositioning
- Multi-node selection
- Rich text formatting within nodes
- Topic shape and branch line styling (3-layer styling architecture: themes → per-note overrides → view state)
- Theme support (pre-built color schemes from iTerm2-Color-Schemes library + smart auto-generated palettes + custom themes)
- Zen Mode (distraction-free full-screen editing)
- Search within map and jump-to-node navigation
- Keyboard shortcuts throughout (Tab = add child, Enter = add sibling)
- Boundary (visual frame around a group of topics)
- Summary (condense multiple topics into an annotation)
- Labels via Obsidian tags
- Images, links, audio notes, document attachments, LaTeX equations, numbering, task checkboxes in nodes

**Acceptance Criteria**:
- [ ] Markdown headings, bullets, and numbered lists render as interactive mind map nodes
- [ ] Nodes display rich content (bold, italic, code, LaTeX, images) via foreignObject
- [ ] Map supports pan and zoom with 60fps on desktop and mobile up to 1,000 nodes
- [ ] Branch expand/collapse works with animation < 100ms on desktop, < 150ms on mobile
- [ ] Keyboard shortcuts (Tab, Enter, Delete, arrow keys) work for editing
- [ ] Theme system applies consistent styling across nodes and branches
- [ ] Cold render < 100ms for 200 nodes on desktop, < 200ms on mobile
- [ ] Cold render < 250ms for 1,000 nodes on desktop, < 500ms on mobile
- [ ] Maps with 2,000+ nodes remain usable with viewport culling and level-of-detail rendering

**Constraints**: Must use SVG + foreignObject hybrid approach (not Canvas) to maintain exportability and rich content rendering. Must work in Obsidian's WebView on both desktop and mobile.

**Priority**: Must-Have
**Estimated Complexity**: High

---

### Feature 2: Bidirectional Markdown ↔ Mind Map Sync

**User Story**: As a note-taker, I want changes in my markdown to instantly appear in the mind map and vice versa, so that I can work in whichever mode is most natural at the moment.

**Description**: The mind map and the markdown editor share an in-memory model. Editing in either view updates the other in real-time. The markdown file is the persistence layer — the mind map is a live view of it.

**Architecture:**
- **Incremental parser**: Only re-parses changed sections, not the entire file. Tracks changed ranges and updates affected subtrees.
- **Range tracking**: Every AST node knows its character position in the source markdown. Enables cursor position sync between editor and map.
- **LRU caching**: Cached parse results for near-instant view switching.
- **Early-exit optimizations**: Skips lines without heading/bullet/number prefixes during parsing.

**Source mode toggle**: Switch between visual mind map and raw markdown within the mind map view (like Obsidian's reading/source toggle).

**Split view**: Optional side-by-side layout with map on one side, markdown on the other, with live sync.

**Navigation sync**: Cursor position in the markdown editor syncs to the selected node in the map, and vice versa. This sync can be toggled on/off.

**Acceptance Criteria**:
- [ ] Editing a heading in the markdown editor updates the corresponding node in the mind map within one frame (< 16ms)
- [ ] Editing a node label in the mind map updates the markdown source within one frame (< 16ms)
- [ ] Adding/deleting/reordering nodes in either view reflects immediately in the other
- [ ] Full parse of a 1,000-line note completes in < 20ms
- [ ] Incremental parse of a single-line change completes in < 2ms
- [ ] Cursor sync between editor and map works bidirectionally when enabled
- [ ] No cursor jumps, flicker, or loss of undo history during sync

**Constraints**: Obsidian auto-saves in near-realtime, which handles file persistence. The challenge is the parsing loop speed.

**Priority**: Must-Have
**Estimated Complexity**: High

---

### Feature 3: Embedded/Transclusion Mind Maps

**User Story**: As a knowledge organizer, I want embedded note links to render the linked note's content as a sub-branch in my mind map, so that I can build hierarchical knowledge structures that span multiple notes.

**Description**: When a markdown note contains an embedded note link — either wikilink-style (`![[linked-note]]`) or markdown-style (`![](path-to-linked-note)`) — Osmosis renders the linked note's entire heading/bullet tree as a sub-branch of the parent map. Both link syntaxes are supported because Obsidian users configure their vaults for one or the other. This is recursive — embedded notes can embed other notes. This feature has no equivalent in any existing mind mapping software.

**Implementation requirements:**
- Both `![[linked-note]]` and `![](path-to-linked-note)` render the linked note's tree as a sub-branch
- **Cycle detection**: A embeds B embeds A → detected at tree construction time (< 1ms), broken with a visual "circular reference" indicator
- **Lazy loading**: Collapsed transclusion branches don't parse the embedded file until expanded
- **Edit propagation**: Editing a transcluded node writes to the source file (the embedded note), not the parent
- **Visual distinction**: Transcluded branches have a subtle indicator (icon or border style) showing they come from another file

**Acceptance Criteria**:
- [ ] `![[note]]` and `![](path-to-note)` both render the linked note's tree as a collapsible sub-branch
- [ ] Recursive embedding works (A embeds B embeds C)
- [ ] Circular references are detected and displayed gracefully (not infinite loops)
- [ ] Editing a transcluded node modifies the source file
- [ ] 10 embedded notes resolve in < 50ms
- [ ] 50 embedded notes resolve in < 200ms (with lazy loading)
- [ ] 100 embedded notes resolve in < 500ms (with lazy loading)
- [ ] 500 embedded notes resolve in < 1500ms (with lazy loading + DOM virtualization)
- [ ] Transcluded branches are visually distinguishable from local content

**Constraints**: Performance depends on lazy loading of collapsed branches. Deep transclusion trees must not block initial render.

**Priority**: Must-Have
**Estimated Complexity**: High

---

### Feature 4: Spaced Repetition Engine (FSRS)

**User Story**: As a student, I want my notes to automatically become flashcards that are scheduled for review using a modern SR algorithm, so that I can retain what I learn without manually creating and maintaining a separate flashcard deck.

**Description**: Osmosis uses the **Free Spaced Repetition Scheduler (FSRS)** algorithm for all card scheduling. Cards are stored in a centralized SQLite database (`.osmosis/cards.db` via sql.js). Scheduling state never touches the markdown files — notes stay clean.

**Note opt-in**: A note must have `osmosis: true` in frontmatter to generate cards. Nothing in the vault is indexed by default.

**Deck organization** (four opt-in layers):
1. **Tag hierarchy**: `#study/python/functions` → deck path mirrors tag path
2. **Folder hierarchy**: Notes in `Learning/Python/` → automatically in `Python` deck
3. **Explicit frontmatter**: `osmosis-deck: python/functions`
4. **Mind map branch as deck**: Studying a branch studies that subtree as a unit

Osmosis Settings provides explicit include/exclude lists for folders and tags.

**Card identity**: Each card has an inline comment ID (`<!--osmosis-id:abc123-->`) placed adjacent to its source in markdown. If deleted, a new ID is generated (graceful degradation). Image occlusion IDs are stored as `id` attributes on SVG shape elements.

**Orphaned cards**: When source content is deleted, cards are soft-deleted (SR history preserved, card archived). If source is re-created, card can be re-linked.

**Session quotas**: Daily new card limit + daily review limit (configurable).

**Rating**: Again / Hard / Good / Easy (standard FSRS).

**Acceptance Criteria**:
- [ ] Notes with `osmosis: true` generate cards automatically
- [ ] FSRS schedules cards correctly across sessions (intervals increase after successful recall)
- [ ] Card database opens in < 100ms
- [ ] Due card query for a single deck completes in < 20ms
- [ ] FSRS computation completes in < 1ms per card
- [ ] Card IDs remain stable across file edits (content changes don't break scheduling history)
- [ ] Orphaned cards are soft-deleted, not destroyed
- [ ] Deck organization works via tags, folders, frontmatter, and mind map branches

**Constraints**: sql.js (WASM-based SQLite) runs entirely in the browser — no native dependencies. Multi-device sync uses merge-before-save strategy.

**Priority**: Must-Have
**Estimated Complexity**: High

---

### Feature 5: Zero-Effort Card Generation

**User Story**: As a note-taker, I want cards to be generated from my existing markdown syntax (headings, highlights, bold text) without any special markup, so that my notes can become study material with zero extra effort.

**Description**: Osmosis automatically generates flashcards from standard markdown patterns in opted-in notes:

| Card Type | Syntax | Cards Generated |
|---|---|---|
| Heading-paragraph | `## Heading` + body below | 1 (heading = front, body = back) |
| Cloze — highlight | `==term==` | 1 per highlighted term |
| Cloze — bold | `**term**` | 1 per bolded term |

**Heading auto-generation toggle**: A setting controls whether headings automatically become cards (on by default). When off, only explicit cards, clozes, and tables generate cards. Heading structure is still used as context/metadata for cloze cards within that section.

**Heading vs. cloze conflict**: When a section has both a heading card and a cloze in the same paragraph, the behavior is configurable: `[Both] [Cloze only*] [Heading only]` (default: Cloze only).

**Excluding cards**: `<!-- osmosis-exclude -->` above any element suppresses card generation for that element. The card is soft-deleted; removing the comment re-activates it.

**Acceptance Criteria**:
- [ ] `## Heading` with body text below generates a heading-paragraph card (front = heading, back = body)
- [ ] `==highlighted text==` generates a cloze card (term blanked on front, revealed on back)
- [ ] `**bold text**` generates a cloze card (same as highlight)
- [ ] `<!-- osmosis-exclude -->` prevents card generation for the following element
- [ ] Heading auto-generation can be toggled off in settings
- [ ] Heading vs. cloze conflict resolution is configurable
- [ ] Cards are generated without requiring any syntax beyond standard markdown

**Constraints**: Card generation must be deterministic — the same note always produces the same cards. Card identity must be stable so SR history is preserved across re-parses.

**Priority**: Must-Have
**Estimated Complexity**: Medium

---

### Feature 6: Explicit Card Syntax (Code Fences)

**User Story**: As a learner, I want to author specific flashcards with full control over front, back, and metadata, so that I can create cards that don't fit the auto-generation patterns.

**Description**: Osmosis provides a code fence syntax (` ```osmosis `) for explicit card declarations. This is the single syntax for all explicit cards — no inline separators (`::`, `?`, etc.).

**Basic unidirectional card:**
````
```osmosis
What is the capital of France?
***
Paris
```
````

**Bidirectional card:**
````
```osmosis
bidi: true

Paris
***
Capital of France
```
````

**Type-in-the-answer card:**
````
```osmosis
type-in: true

Spell the capital of France
***
Paris
```
````

**Card with metadata:**
````
```osmosis
bidi: true
type-in: true
deck: vocabulary/french
hint: A greeting

Bonjour
***
Hello
```
````

**Syntax rules:**
- Language tag ` ```osmosis ` — registers a `MarkdownCodeBlockProcessor`
- Metadata lines (`key: value`) at the top, before any blank line
- `***` separates front from back
- `bidi: true` → generates two cards (forward + reverse)
- `type-in: true` → text input with diff comparison on review
- Flags compose: `bidi: true` + `type-in: true` = bidirectional type-in card
- Full markdown renders inside the fence (bold, links, images, LaTeX, code, embeds)

**Command palette commands** for insertion:
- `Osmosis: Insert card` — basic unidirectional skeleton
- `Osmosis: Insert bidirectional card`
- `Osmosis: Insert type-in card`
- `Osmosis: Insert bidirectional type-in card`
- `Osmosis: Insert card...` → submenu with all types

Insertion places the fence at cursor with `***` already placed, cursor on front line, metadata auto-filled from note context.

**Acceptance Criteria**:
- [ ] ` ```osmosis ` fences render as styled cards in reading view (front visible, back hidden until reveal)
- [ ] `***` correctly separates front from back content
- [ ] `bidi: true` generates two cards (forward and reverse)
- [ ] `type-in: true` shows a text input during review with diff comparison
- [ ] Metadata keys (`deck:`, `hint:`) are parsed and applied correctly
- [ ] Full markdown (images, LaTeX, links, embeds) renders inside fences
- [ ] Command palette commands insert correct skeletons at cursor position

**Constraints**: Only the ` ```osmosis ` fence syntax is supported for explicit cards. No inline separator syntax.

**Priority**: Must-Have
**Estimated Complexity**: Medium

---

### Feature 7: Three Study Modes

**User Story**: As a learner, I want to study my cards in the mode that fits my current context — browsing notes, viewing a mind map, or doing focused review — so that studying integrates naturally into whatever I'm already doing.

**Description**: Three study modes share the same FSRS scheduling engine but offer different UX:

#### 7a. Sequential Mode (Deck Study)
Classic Anki-style modal: show front → tap to flip → rate (Again / Hard / Good / Easy).

**Deck scoping** (matches Anki behavior):
- Study a single (leaf) deck — only its own cards
- Study a parent deck — includes its own cards + all children/subdeck cards, recursively
- Study all decks — all due cards across the entire collection

Cards drawn from the selected scope regardless of source note.

**Entry points**: Sidebar dashboard (click any deck or "Study All"), command palette (`Osmosis: Study deck`).

#### 7b. Contextual Mode (In-Note Study)
Cards studied in-place within the note, in document reading order. **Activates automatically when switching to Obsidian's reading view** on an opted-in note.

- All `osmosis` fences show front side; back side replaced with `░░░░░░` placeholder
- Clicking/tapping a card or cloze reveals the answer
- A "Start studying" button at the top activates FSRS rating — after reveal, inline rating buttons appear as a comment bubble attached to the card
- Without "Start studying", reveals are casual peeks — no scheduling recorded
- All cards in the note participate regardless of FSRS schedule (unlike sequential/spatial which respect due dates)
- Inline cloze participation (whether `==highlights==` and `**bold**` blank out) configurable in settings (default: off)
- Progress indicator: floating widget showing "3/7 cards reviewed"

#### 7c. Spatial Mode (Mind Map Study)
Nodes hide/reveal in-place on the map. Supports both full node hiding and inline cloze blanking within visible nodes.

- Nodes hidden/revealed by **tapping the node**
- **"Show children" (+) button** on each node expands hidden children (Xmind-style UX)
- Rating bubble appears after node reveal
- **Entry points**: Mind Map View menu, right-click branch → "Study this branch", floating due-cards badge on branches

#### FSRS Review Tagging
Every review is tagged with the study mode that produced it (`contextual`, `sequential`, `spatial`). Stored in `cards.db` review logs. Enables future analytics and potential contextual difficulty adjustment.

**Acceptance Criteria**:
- [ ] Sequential mode displays cards in a modal with flip and rating interaction
- [ ] Sequential mode supports deck scoping (single deck, parent deck, all decks)
- [ ] Contextual mode activates in reading view on opted-in notes
- [ ] Contextual mode hides answers until tap/click, with optional FSRS rating
- [ ] Spatial mode hides/reveals nodes in the mind map view
- [ ] Spatial mode supports both full node hiding and inline cloze blanking
- [ ] All three modes use the same FSRS engine and update the same card database
- [ ] Study session starts in < 200ms from click to first card
- [ ] Review tags are recorded per study mode in the database

**Constraints**: Contextual mode must not modify the note content — answer hiding is purely visual (reading view post-processing).

**Priority**: Must-Have
**Estimated Complexity**: High

---

### Feature 8: Osmosis Sidebar Dashboard

**User Story**: As a student, I want a dashboard showing my deck structure with due card counts, so that I can quickly see what needs review and start studying.

**Description**: An Anki-style sidebar panel accessible from a left sidebar icon:
- Deck list with sub-deck hierarchy
- New / Learn / Due counts per deck
- Click any deck to start sequential study
- "Study All" button for full collection review

**Acceptance Criteria**:
- [ ] Sidebar shows all decks in a hierarchical tree
- [ ] Each deck displays New, Learn, and Due card counts
- [ ] Clicking a deck opens sequential study mode for that deck
- [ ] Counts update after each study session
- [ ] Dashboard loads in < 200ms

**Constraints**: MVP version is minimal — just the deck list with counts and study entry point. Heatmaps, charts, and analytics are v1.1.

**Priority**: Must-Have
**Estimated Complexity**: Low

---

### Feature 9: Mind Map Styling & View State

**User Story**: As a visual thinker, I want to style my mind map's nodes, branches, and colors to match my preferences, and save the current view state (collapsed branches, zoom level) so I can return to it later.

**Description**: Osmosis provides a 3-layer styling and view state architecture, with an internal composition model inspired by Pixar's OpenUSD system:

#### Style Resolution: LCVRT Ordering

Every stylable property on every node resolves via a deterministic cascade (strongest to weakest):

| Priority | Level | Description |
|---|---|---|
| 1 (strongest) | **L — Local** | Per-node frontmatter overrides (stable ID or tree path) |
| 2 | **C — Class** | Style class applied to the node (`class: "important"`) |
| 3 | **V — Variant** | Active style variant selection (`activeVariant: "presentation"`) |
| 4 | **R — Reference** | Transcluded note's own frontmatter styles |
| 5 (weakest) | **T — Theme** | Theme defaults (per-depth-level shapes, colors, fonts) |

All overrides are **sparse**: only changed properties need to be specified. Unspecified properties fall through to the next level.

#### Layer 1: Themes (Map-Wide Defaults)

A theme is a named, reusable JSON object defining defaults for every stylable property at each depth level. Properties include: topic shape (~15-20 shapes: rect, rounded-rect, ellipse, diamond, hexagon, underline, pill, parallelogram, etc.), fill color, border (color, width, style), text (font, size, weight, color, alignment), branch line (style: curved/straight/angular/rounded-elbow, color, thickness, tapering), and background.

Themes ship as 10-15 presets derived from the iTerm2-Color-Schemes library + smart auto-generated palettes. Users can create custom themes via "Save current styles as theme" or a dedicated theme editor in the format panel.

**Colored branches**: A theme-level toggle that auto-assigns distinct colors per top-level branch. Children inherit their parent branch's color.

**List-editing operations**: Notes can non-destructively customize theme list properties (e.g., branch color palettes) using `prepend`, `append`, and `remove` operations instead of replacing values wholesale.

#### Layer 2: Per-Note Style Overrides (Frontmatter)

Individual notes override theme defaults via frontmatter under the `osmosis:` key. This layer encompasses three LCVRT levels: Local overrides, Class references, and Variant selections.

**Basic per-node overrides (Local):**

```yaml
---
osmosis:
  theme: "Ocean"
  coloredBranches: false
  styles:
    "## Architecture":
      shape: "diamond"
      fill: "#e94560"
    _n:a3f2:
      fill: "#533483"
---
```

**Style classes (Class):**

Named, reusable style bundles — define once, apply to many nodes. Updating a class definition updates all nodes that use it.

```yaml
osmosis:
  classes:
    important:
      shape: "rounded-rect"
      fill: "#e94560"
      border: { color: "#ff0000", width: 2 }
      text: { weight: 700 }
    definition:
      shape: "underline"
      fill: "#2d6a4f"
      text: { style: "italic" }
  styles:
    "## Key Concepts":
      class: "important"
      text: { color: "#ffffff" }   # Local override — stronger than class
    _n:b7c1:
      class: "definition"
```

Classes can be defined at **theme-level** (shared across notes, weakest) or **note-level** (scoped to one note, stronger). Same-name note-level classes override theme-level classes.

**Style variants (Variant):**

Switchable style configurations per note — activate a named set of style overrides with a single selection.

```yaml
osmosis:
  variants:
    presentation:
      "## Architecture": { shape: "diamond", fill: "#e94560", text: { size: 18 } }
      "## Testing": { fill: "#999", text: { color: "#666" } }
    study:
      "## Architecture": { fill: "#333" }
    print:
      "*": { fill: "#ffffff", text: { color: "#000000" }, border: { color: "#333" } }
  activeVariant: "presentation"
```

Variants are **orthogonal to view states**: variants change *styling* (shapes, colors), view states change *viewport* (fold, pan, zoom). They combine freely (e.g., "presentation" variant + "overview" view state). The `"*"` wildcard applies to all nodes. Variant switching is instant (no re-parse, just re-resolve and re-render).

**Node targeting** uses a **hybrid B+C approach**:
- **Tree paths** (human-facing): `"Architecture/Unit Tests"` — readable, writable by hand, breaks on rename
- **Stable IDs** (GUI-generated): `_n:a3f2` — content-position hash, survives renames/reordering, generated by the format panel

The format panel always writes stable IDs. Tree paths are a power-user escape hatch for hand-editing frontmatter. Orphaned path selectors trigger a "style target not found" warning.

**Transclusion targeting**: `"![[Note B]]/## Intro"` scopes a selector into a transcluded subtree.

#### Layer 3: View State (Ephemeral, Stored Separately)

View state is not part of the document. It includes fold/collapse state, pan position, zoom level, selected nodes, and spatial mode hidden/revealed state. Stored in sidecar files:

```
.obsidian/plugins/Osmosis/views/
  my-note.view.json
```

**Explicit save**: Users click "Save view" to persist. No auto-save (avoids file churn). Users can save **multiple named view states** per note (e.g., "Presentation" with branches collapsed, "Working" fully expanded) and switch between them.

#### Transclusion Style Cascade & Composition Encapsulation

When note A transcludes note B, styles resolve via the LCVRT cascade with **composition encapsulation** (inspired by USD's reference model):

1. Note B's internal LCVRT cascade (Local > Class > Variant) **resolves first** as a self-contained unit
2. Transcluded content inherits the **host map's theme** (T level)
3. Note A can **override properties** on transcluded nodes by targeting `"![[Note B]]/## Intro"` (these apply at the R level)
4. Note A **cannot** alter Note B's internal cascade — cannot change which classes B's nodes use or modify B's variant definitions
5. View state for transcluded content **belongs to the host** (A's view file, not B's)

This ensures transcluded notes behave predictably regardless of where they're embedded.

**Lazy style resolution**: Styles for collapsed or off-screen transcluded branches are **deferred** — no LCVRT resolution happens until the branch is expanded. Style resolution cost scales with *visible* nodes, not *total* nodes.

#### Format: JSON + CSS

- **JSON** for structured theme definitions (levels, branch colors, shapes)
- **CSS** for advanced overrides — power users write `.osmosis-node[data-depth="2"] { ... }` custom CSS via Obsidian-style CSS snippets, leveraging SVG `data-depth` and `data-path` attributes

#### Format Panel

A sidebar panel for interactive styling: select a node → see shape, fill, border, text, branch options → changes preview in real-time → stored as frontmatter overrides with stable IDs. The panel also exposes class assignment and variant switching.

**Acceptance Criteria**:
- [ ] LCVRT cascade resolves every property deterministically (Local > Class > Variant > Reference > Theme)
- [ ] Themes apply consistent styling (shapes, colors, fonts, branch lines) across all nodes by depth level
- [ ] 10-15 preset themes ship with the plugin
- [ ] Users can create, save, and switch custom themes
- [ ] Per-node style overrides work via frontmatter (both tree path and stable ID selectors)
- [ ] Style classes can be defined (theme-level and note-level) and applied to nodes; updating a class updates all nodes using it
- [ ] Style variants can be defined, switched, and combined with view states
- [ ] Format panel allows interactive per-node styling, class assignment, and variant switching with live preview
- [ ] Colored branches toggle auto-assigns distinct branch colors with child inheritance
- [ ] List-editing operations (prepend/append/remove) work on theme list properties
- [ ] Composition encapsulation: host map can override transcluded node properties but cannot alter internal cascade
- [ ] Lazy style resolution defers LCVRT computation for collapsed/off-screen transcluded branches
- [ ] View state (fold, pan, zoom) saves/loads from sidecar files on explicit user action
- [ ] Named view states can be created, switched, and deleted
- [ ] CSS snippet overrides apply via `data-depth` and `data-path` attributes on SVG elements
- [ ] Orphaned style selectors (renamed nodes) produce a warning in the format panel

**Constraints**: Styling metadata in frontmatter must not interfere with other Obsidian plugins or standard frontmatter. View state files must be lightweight (< 50 KB for a 2,000-node map). Sparse overrides — only changed properties stored; unspecified properties always fall through.

**Priority**: Must-Have (theme system + LCVRT cascade + basic per-node styling for v1.0; style classes, style variants, format panel, named view states, and CSS snippets for v1.1)
**Estimated Complexity**: Medium–High

---

## Feature List: Priority & Scope Matrix

| Feature | Must-Have | Complexity | Version | Notes |
|---------|-----------|-----------|---------|-------|
| Custom mind map engine (SVG + foreignObject) | Yes | High | v1.0 | Core differentiator |
| Bidirectional markdown ↔ mind map sync | Yes | High | v1.0 | Core value proposition |
| Embedded/transclusion mind maps | Yes | High | v1.0 | Core competitive advantage |
| FSRS spaced repetition engine | Yes | High | v1.0 | Core SR functionality |
| Zero-effort card generation | Yes | Medium | v1.0 | 80% case for card creation |
| Explicit card syntax (osmosis fences) | Yes | Medium | v1.0 | For cards that don't fit auto-gen |
| Three study modes (sequential, contextual, spatial) | Yes | High | v1.0 | "Author once, study in multiple modes" |
| Osmosis sidebar dashboard | Yes | Low | v1.0 | Minimal: deck list + counts |
| Desktop + mobile support | Yes | Medium | v1.0 | Mobile first-class from day one |
| Command palette card insertion | Yes | Low | v1.0 | Low effort, high UX value |
| Mind map theme system + LCVRT cascade | Yes | Medium | v1.0 | 3-layer architecture, LCVRT resolution, preset themes, per-node overrides |
| Mind map view state persistence | Yes | Low | v1.0 | Explicit save of fold/pan/zoom to sidecar files |
| Style classes + style variants | | Medium | v1.1 | Reusable style bundles, switchable configurations |
| Format panel + named view states | | Medium | v1.1 | Interactive styling GUI, class/variant switching, multiple saved views |
| CSS snippet styling support | | Low | v1.1 | Advanced user customization via data-depth/data-path |
| List-editing theme operations | | Low | v1.1 | Non-destructive prepend/append/remove on theme lists |
| Timeline view layout | | Low | v1.1 | Just a layout algorithm swap |
| Table row cards | | Low | v1.1 | Nice-to-have card type |
| Code block cloze cards | | Medium | v1.1 | Nice-to-have card type |
| Image occlusion (Fabric.js v6) | | High | v1.1 | Significant sub-feature |
| Gutter indicators + Cards panel | | Medium | v1.1 | Card authoring transparency |
| Graph-aware ease boosting | | Medium | v1.1 | Needs data to tune |
| Card templates in settings | | Low | v1.1 | 4 built-in types sufficient for MVP |
| Footnote tooltips in mind map | | Low | v1.1 | Polish feature |
| Export to PNG/SVG/PDF | | Low | v1.1 | Nearly free from SVG but needs polish |
| SR heatmap and charts | | Medium | v1.1 | Analytics layer |
| Anki import (.apkg) | | High | v2.0 | Adoption accelerator |
| Anki export (.apkg) | | Medium | v2.0 | Data portability / escape hatch |

---

## Technical Considerations

### Architecture & Tech Stack

- **Language**: TypeScript (strict mode)
- **Build**: Obsidian plugin standard (esbuild via obsidian-sample-plugin template)
- **Linting**: ESLint with `eslint-plugin-obsidianmd`
- **Rendering**: SVG for map structure + `<foreignObject>` for node content (HTML/CSS)
- **Parser**: Custom incremental parser inspired by Markwhen Parser — fast parse → intermediate tree representation → swappable view consumers. Range tracking for cursor sync. LRU caching.
- **SR Algorithm**: FSRS (Free Spaced Repetition Scheduler)
- **SR Database**: SQLite via sql.js (WASM, no native dependencies, runs in Obsidian's WebView)
- **SR Data Location**: `.osmosis/cards.db` — centralized, never touches markdown files
- **Mind Map Engine**: Custom-built, potentially publishable as a separate package
- **Image Occlusion** (v1.1): Fabric.js v6 — chosen for Anki compatibility and native SVG support

### Integration Points

- **Obsidian API**: Plugin lifecycle, views, settings, commands, workspace, markdown rendering, file operations
- **Obsidian Markdown Renderer**: `MarkdownRenderer.renderMarkdown()` for rich content inside mind map nodes and card fences
- **Obsidian File System**: Vault API for reading/writing notes, resolving `![[]]` and `![]()` links for transclusion
- **Obsidian Mobile**: Capacitor.js WebView (WKWebView on iOS, Android System WebView on Android)

### Data & Privacy

- **All data is local**: No cloud services, no telemetry, no external API calls
- **SR data**: Stored in `.osmosis/cards.db` within the vault — included in whatever sync mechanism the user has (Obsidian Sync, iCloud, Git, etc.)
- **Media** (image occlusion masks): Stored in `.osmosis/masks/` within the vault
- **Themes**: Custom themes stored in `.osmosis/themes/` within the vault (JSON format)
- **View state**: Stored in `.obsidian/plugins/Osmosis/views/` (per-note sidecar JSON files — fold state, pan, zoom, named views)
- **Per-note styles**: Stored in note frontmatter under the `osmosis:` key (travels with the note)
- **Note content**: Never modified for SR purposes — scheduling data stays in the database, not in frontmatter or inline comments (except for card IDs which are lightweight `<!--osmosis-id:...-->` comments)

### Performance Requirements

See detailed targets in the Performance Targets section below. Summary:

| Area | Key Target |
|---|---|
| Mind map cold render (200 nodes, desktop) | < 100ms |
| Mind map cold render (200 nodes, mobile) | < 200ms |
| Mind map cold render (1,000 nodes, desktop) | < 250ms |
| Pan/zoom frame rate (≤1,000 nodes, desktop + mobile) | 60fps |
| Pan/zoom frame rate (1,000–5,000 nodes, mobile) | 30fps minimum |
| Markdown ↔ map sync latency | < 16ms (one frame) |
| Full parse (1,000-line note) | < 20ms |
| Incremental parse (single line) | < 2ms |
| Card DB open | < 100ms |
| Due card query (single deck) | < 20ms |
| Study session start | < 200ms |
| Plugin base load | < 5 MB memory |
| Mobile plugin load contribution | < 500ms |

---

## User Experience & Design

### Key User Flows

#### Flow 1: First-Time Setup
1. Install Osmosis from Obsidian Community Plugins
2. Open an existing note
3. Add `osmosis: true` to frontmatter (or use command palette: `Osmosis: Enable for this note`)
4. Optionally add `osmosis-deck: my-subject` to set a deck
5. Open Mind Map View from the "More options" menu or command palette
6. The note renders as an interactive mind map immediately

#### Flow 2: Daily Note-Taking + Study
1. Take notes naturally using headings, bullets, and `==highlights==` for key terms
2. When ready to study, click the Osmosis sidebar icon
3. Dashboard shows decks with due card counts
4. Click a deck → sequential study mode begins
5. Rate cards (Again / Hard / Good / Easy)
6. FSRS schedules next review

#### Flow 3: Mind Map Authoring + Spatial Study
1. Open a note in Mind Map View
2. Add/edit/reorganize nodes using keyboard shortcuts or drag-and-drop
3. Changes sync to markdown in real-time
4. Right-click a branch → "Study this branch"
5. Nodes hide; tap to reveal and rate

#### Flow 4: In-Note Contextual Study
1. Open an opted-in note
2. Switch to reading view → answer sides are automatically hidden
3. Browse the note; click any hidden card to peek at the answer
4. Click "Start studying" for FSRS-rated review
5. Rate each card after revealing

#### Flow 5: Building a Knowledge Tree via Transclusion
1. Create topic notes: `Python.md`, `Functions.md`, `Classes.md`
2. In `Python.md`, embed the notes (`![[Functions]]` / `![[Classes]]` or `![](Functions.md)` / `![](Classes.md)`)
3. Open `Python.md` in Mind Map View
4. Functions and Classes appear as expandable sub-branches
5. Edit a node in the Functions branch → `Functions.md` is updated

### Design Principles

1. **Notes are the source of truth**: The markdown file is always the canonical representation. The mind map and flashcards are views of it, not separate artifacts.
2. **Zero-friction by default, full control on demand**: Auto-generated cards work without any special syntax. Explicit fences give full control when needed.
3. **Spatial context enriches learning**: The mind map isn't decoration — it's a learning tool. Seeing where a concept lives in a hierarchy aids retention.
4. **Performance is a feature**: A tool that lags is a tool that gets abandoned. Every interaction must feel instant.
5. **Opt-in, not opt-out**: Nothing is indexed until the user explicitly enables it per note. No surprise behavior.
6. **Desktop and mobile are equal**: Mobile is not a degraded experience. Touch interactions are first-class.

---

## Performance Targets

### Mind Map Rendering

Real-world context: even a "small" mind map routinely reaches 200 nodes. Large maps can easily hit 1,000–2,000+ nodes. The performance targets treat 200 nodes as the comfortable baseline, not a stretch case.

| Metric | Desktop | Mobile |
|---|---|---|
| Cold render — 200 nodes | < 100ms | < 200ms |
| Cold render — 500 nodes | < 150ms | < 300ms |
| Cold render — 1,000 nodes | < 250ms | < 500ms |
| Cold render — 2,000 nodes | < 500ms | < 1000ms |
| Cold render — 5,000+ nodes | < 1000ms | < 2000ms |
| Pan/zoom frame rate (≤1,000 nodes) | 60fps | 60fps |
| Pan/zoom frame rate (1,000–5,000 nodes) | 60fps | 30fps minimum, 60fps target |
| Node expand/collapse animation | < 100ms | < 150ms |
| Incremental re-render (single node edit) | < 16ms (one frame) | < 33ms (one frame) |

### Parser & Sync

| Metric | Target |
|---|---|
| Full parse — 1,000-line note | < 20ms |
| Full parse — 5,000-line note | < 80ms |
| Full parse — 10,000-line note | < 150ms |
| Incremental parse — single line change | < 2ms |
| Incremental parse — multi-line paste (100 lines) | < 10ms |
| Markdown → map sync latency | < 16ms (one frame) |
| Map → markdown sync latency | < 16ms (one frame) |

### Transclusion

| Metric | Target |
|---|---|
| 10 embedded notes | < 50ms |
| 50 embedded notes | < 200ms (with lazy loading) |
| 100 embedded notes | < 500ms (with lazy loading) |
| 500 embedded notes | < 1500ms (with lazy loading + DOM virtualization) |
| Cycle detection | < 1ms |

### Spaced Repetition

| Metric | Target |
|---|---|
| Card database open | < 100ms |
| Due card query (single deck) | < 20ms |
| Due card query (all decks) | < 50ms |
| FSRS computation | < 1ms per card |
| Study session start | < 200ms |

### Memory

| Metric | Budget |
|---|---|
| Base plugin load | < 5 MB |
| Per-node memory | < 1.5 KB (lean to support large maps) |
| 500-node map total | < 6 MB |
| 2,000-node map total | < 10 MB (with viewport culling) |
| 5,000-node map total | < 15 MB (with DOM virtualization) |
| Card database (10,000 cards) | < 10 MB |

### Mobile-Specific

| Metric | Target |
|---|---|
| Plugin load time contribution | < 500ms (lazy initialization) |
| Touch gesture response | < 100ms |
| Battery impact | Minimal when idle (no background polling/animation) |

### Performance Tiers (Node Count Strategies)

| Tier | Strategy |
|---|---|
| ≤ 500 nodes | 60fps on all devices; viewport culling active but no special optimizations needed |
| 500–1,000 nodes | Viewport culling mandatory + collapsed branches by default for deep trees |
| 1,000–2,000 nodes | Level-of-detail rendering (abbreviated labels zoomed out) + progressive disclosure |
| 2,000–5,000 nodes | DOM virtualization — off-screen nodes removed from DOM and re-added on scroll (Obsidian Canvas pattern) |
| 5,000+ nodes | All of the above + consider Web Worker for layout computation to keep main thread free |

---

## Launch & Rollout Plan

### Launch Criteria (v1.0 MVP)

- [ ] A markdown note with headings, bullets, and `==highlights==` renders as an interactive mind map
- [ ] Editing the map updates the markdown; editing the markdown updates the map
- [ ] A note with `osmosis: true` in frontmatter generates cards from headings and clozes
- [ ] All three study modes are functional (sequential, contextual, spatial)
- [ ] FSRS schedules cards correctly across sessions
- [ ] Embedded note links (`![[linked-note]]` and `![](path)`) render as sub-branches in the mind map
- [ ] Works on desktop AND mobile with no perceptible lag for maps up to 500 nodes
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` succeeds
- [ ] Manual testing in Obsidian desktop and mobile passes all acceptance criteria
- [ ] Plugin loads in < 500ms on mobile, does not noticeably slow Obsidian startup

### Phased Launch

**Phase 1 — v1.0 (MVP):**
- Custom mind map engine with bidirectional sync
- Transclusion/embedded mind maps
- FSRS scheduling with card generation (heading-paragraph, cloze highlight/bold, explicit fences)
- Three study modes
- Minimal sidebar dashboard
- Desktop + mobile
- Command palette card insertion
- Theme system with LCVRT cascade, preset themes, per-note style overrides (frontmatter)
- View state persistence (fold/pan/zoom saved to sidecar files)
- Lazy style resolution for collapsed transcluded branches
- Composition encapsulation for transcluded note styling

**Phase 2 — v1.1:**
- Timeline view layout
- Style classes (reusable style bundles, theme-level and note-level)
- Style variants (switchable per-note style configurations)
- Format panel (interactive per-node styling, class/variant switching, live preview)
- Named view states (multiple saved views per note)
- CSS snippet styling support (data-depth/data-path attributes)
- List-editing theme operations (prepend/append/remove on theme lists)
- Additional card types (table rows, code block cloze, bidirectional, type-in)
- Image occlusion with Fabric.js v6 editor
- Gutter indicators + "Cards in This Note" panel
- Card templates in settings
- Graph-aware ease boosting
- Footnote tooltips
- Export to PNG/SVG/PDF
- SR heatmap and analytics charts

**Phase 3 — v2.0:**
- Anki import (.apkg / .colpkg)
- Anki export (.apkg)
- SR history import from Anki
- Image occlusion mask format conversion (both directions)
- Duplicate detection and merge strategies

### Metrics to Track Post-Launch

- Daily active study sessions (how many users study each day)
- Cards reviewed per session (is the UX encouraging sustained study?)
- Study mode distribution (sequential vs contextual vs spatial — which modes are people using?)
- Map size distribution (how many nodes in typical maps — are we hitting perf targets?)
- Plugin load time on mobile (does it stay under budget?)
- Error rate in Obsidian console (are things breaking?)

---

## Risks & Assumptions

### Key Assumptions

1. **Assumption**: `<foreignObject>` inside SVG works reliably in Obsidian's mobile WebViews (both WKWebView and Android System WebView)
   - **How to Validate**: Early prototype testing on iOS and Android with `<foreignObject>` containing rendered markdown. Markmap already demonstrates this works, but Osmosis's usage (editable nodes) is more complex.

2. **Assumption**: sql.js (WASM-based SQLite) performs adequately for up to 10,000 cards on mobile
   - **How to Validate**: Benchmark card queries on mid-tier mobile devices with a populated test database.

3. **Assumption**: Users will opt in notes to Osmosis via frontmatter — the opt-in friction is low enough that it doesn't prevent adoption
   - **How to Validate**: User testing during beta. If adoption is low, consider folder-level opt-in or a more prominent onboarding flow.

4. **Assumption**: Incremental parsing can maintain < 16ms sync latency for real-world editing patterns (not just single-line changes)
   - **How to Validate**: Stress test with rapid multi-line editing, large paste operations, and undo/redo sequences.

5. **Assumption**: The FSRS algorithm (ts-fsrs library or custom implementation) is available and correct for TypeScript
   - **How to Validate**: Verify ts-fsrs library exists and passes validation against FSRS reference implementation. If not, port from Python reference.

### Known Risks

1. **Risk**: Mind map engine complexity exceeds estimates — bidirectional sync, layout algorithms, and mobile touch handling are each significant challenges
   - **Likelihood**: High
   - **Impact**: High (delays MVP)
   - **Mitigation**: Build the simplest possible working prototype first (one layout, basic editing). Add polish and advanced features incrementally. Consider shipping with limited editing capabilities if sync proves too complex.

2. **Risk**: Mobile `<foreignObject>` rendering has unforeseen quirks (blurry text, broken CSS inheritance, touch event conflicts)
   - **Likelihood**: Medium
   - **Impact**: Medium (degrades mobile experience)
   - **Mitigation**: Test on real devices early and often. Map View and Markmap provide reference implementations. Have a fallback plan: simpler node rendering (plain text in SVG `<text>` elements) for mobile if `<foreignObject>` fails.

3. **Risk**: Performance targets are too aggressive — maps with 200+ nodes lag on mobile
   - **Likelihood**: Medium
   - **Impact**: Medium (limits practical map sizes)
   - **Mitigation**: Viewport culling, lazy loading, and progressive disclosure are already planned as performance tiers. Accept that very large maps may need these optimizations and build them into the architecture from day one rather than bolting them on later.

4. **Risk**: FSRS scheduling conflicts between devices (multi-device sync via .osmosis/cards.db)
   - **Likelihood**: Medium
   - **Impact**: Low (worst case: a card is reviewed slightly earlier or later than optimal)
   - **Mitigation**: Merge-before-save strategy (from Decks plugin). Card reviews are append-only — merge conflicts are rare and low-impact. Consider last-write-wins for card state, with full review log for FSRS to recompute optimal schedule.

5. **Risk**: Scope creep — the feature list is ambitious and Phase 1 alone is substantial
   - **Likelihood**: High
   - **Impact**: High (MVP never ships)
   - **Mitigation**: The MVP scope is explicitly defined. Every feature has a version assignment. If timeline pressure mounts, cut from the bottom of the v1.0 list (command palette insertion, some study modes) rather than shipping a half-working version of everything.

---

## Open Questions

- [ ] Should the mind map engine be published as a separate npm package from day one, or extracted later?
- [ ] What is the exact behavior when a user edits a transcluded node that contains card IDs from the source file? Does the ID move or stay?
- [ ] How should Osmosis handle notes that use `**bold**` extensively for emphasis (not as cloze targets)? Per-note cloze-bold toggle? Global setting?
- [ ] Should the incremental parser use Web Workers to avoid blocking the main thread during large edits?
- [ ] What is the minimum supported Obsidian version? (Determines available API features)
- [ ] How should card generation interact with Obsidian templates — if a template includes `osmosis: true`, should cards be generated immediately or wait for the user to edit?
- [ ] For spatial mode: what is the exact animation/transition for hiding and revealing nodes? Fade, slide, flip?

---

## Appendix: Inspiration Phase Reference

All inspiration phase materials are in `notes/00_inspiration/`:

- **`inspo.md`** — Complete inspiration document with raw brainstorm, five ideation sessions (mind map engine, flashcard/SR, explicit card syntax, Anki import/export, MVP/performance/gaps), Xmind feature parity audit, technology decisions
- **`card_authoring_example.md`** — Worked example of gutter indicators and "Cards in This Note" panel, demonstrating how card authoring transparency works in practice
- **`core_concept.md`** — One-paragraph project concept

**Key ideation sessions** (all in `inspo.md`):
1. **Claude Brainstorm Session** (2026-02-24): Core philosophy, mind map engine decision, rendering approach, map structures, bidirectional sync model, study mode architecture, data storage
2. **Flashcard/SR Ideation** (2026-02-26): Reference plugin analysis (Decks, OSR, Anki IOE), card identity, card types, deck organization, scheduling, study session UX, image occlusion, dashboard, card authoring transparency
3. **Explicit Card Syntax** (2026-02-27): Anki feature parity audit, code fence syntax decision, three study modes (updated from two), FSRS review tagging, contextual mode details
4. **Anki Import/Export** (2026-02-28): Package format analysis, import process, notetype mapping, SR state conversion, export process, image occlusion format conversion
5. **MVP/Performance/Gaps** (2026-02-28): MVP scope definition, performance budgets, study mode UX details, mobile feasibility validation, transclusion confirmation, Fabric.js v6 selection
6. **Mind Map Styling & View State** (2026-02-28): 3-layer styling architecture (themes → per-note overrides → view state), hybrid B+C node targeting, transclusion style cascade, JSON+CSS format, named view states, explicit save
7. **OpenUSD-Inspired Styling Refinements** (2026-02-28): LCVRT strength ordering (Local > Class > Variant > Reference > Theme), style classes, style variants, sparse overrides, composition encapsulation, lazy transclusion style resolution, list-editing operations — all inspired by Pixar's OpenUSD composition system

**Reference repos studied**: `ref/decks`, `ref/obsidian-spaced-repetition`, `ref/anki`, `ref/markmap`, `ref/obsidian-map-view`, `ref/obsidian-maps`, `ref/obsidian-api`, `ref/obsidian-sample-plugin`

---

## Sign-Off

This PRD represents a shared understanding of what we're building and why. Changes after this point should be documented and tracked.

**Reviewed by**: _Pending review_
**Date**: 2026-02-28
**Version Locked**: No
