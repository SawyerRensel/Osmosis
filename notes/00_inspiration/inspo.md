# Inspiration Phase Template

## Project: Osmosis

**Created**: 2026-02-21  
**Owner**: Sawyer Rensel 
**Current Status**: Raw Concept

---

## Initial Spark

*What triggered this idea? What problem are you trying to solve or what capability do you want to build?*

What if I could combine the best of my favorite learning techniques (mind mapping, linked note taking, and spaced repetition) and their tools (Xmind, Obsidian, and Anki, respectively) into a unified learning system?  What if I could study a mind map using flashcard/cloze spaced repetition techniques?  

I've found that taking notes via mind mapping with tools like Xmind has greatly improved how I capture knowledge, and it also helps me retain that knowledge more easily by tapping into my spatial memory.  However, Xmind encodes information in a closed format and doesn't support linking maps within maps, which is why I've transitioned to using Obsidian for taking notes.  However, Obsidian's existing mind map plugins are a far cry from the experience I'm used to with Xmind.  While Obsidian has multiple spaced repetition plugins, they are designed to use note(s) dedicated as flashcard(s).  What if my raw notes themselves could serve as flashcards in addition to dedicated flashcard notes that require more advanced configuration given the style of the card?  

I've used Anki in the past, and it's worked really well for me - except for one big glaring problem.  Two, really.  One, it's not connected to the rest of my notes, which are either stored in Obsidian or in an Xmind mind map.  I would LOVE to make an Obsidian plugin that allows me to take notes "naturally" but also support Anki-like spaced repetition study feature built in.  It would be a dream to study my Markdown notes via a classic Anki-style but also combine the power of spaced repetition with a mind map, like hiding part(s)/element(s) of a mind map and testing to see if the user remembers it.  

---

## Raw Brainstorm Notes

*Use this section to capture unfiltered thoughts, questions, and possibilities. Don't worry about organization or feasibility yet.*

### Initial Thoughts

- I want to achieve feature parity with Xmind (as much as possible)
- I want to achieve feature parity with Anki (as much as possible)
- Use the Free Spaced Repetition Schedular (FSRS) for spaced repetition
- Spaced repetition heat maps
- Heading-based cards — collapse a section and quiz yourself on what's under it. Your notes already have structure; leverage it.
- Cloze from highlights or bold — any ==highlighted== or **bolded** text becomes a cloze deletion during review. Zero extra authoring effort.
- Linked concept recall — given a note, can you name what it links to? This plays beautifully with how you already use Obsidian's graph.
- Tag-based decks — #study/python or #study/javascript automatically groups cards without maintaining separate deck files.
- You have a mind map of, say, javascript fundamentals. The plugin **hides child nodes** and asks you to recall what branches off from a parent concept.
	- Or it hides **labels on connections** — you see two concepts are related but have to recall _how_.
	- Or it does **progressive disclosure** — shows the top two levels and asks you to reconstruct the third.
- Mind mapping has to support code blocks 
- Support Cloze in code blocks? (or maybe a front/back approach)
- This [Spaced Repetition plugin](https://github.com/st3v3nmw/obsidian-spaced-repetition) seems like the predominant spaced repetition plugin for Obsidian currently available.  I like it's clever ways to replicate different kinds of Anki cards and its customizability.
- I like how [this new and upcoming spaced repetition plugn "Decks"](https://github.com/dscherdi/decks) generates cards from headings and tables, but it might not always be appropriate to convert notes into cards.  I also like the heatmap it shows. 
- Need to have a way to filter what notes (Markdown files) are considered flashcards.  Maybe a combination of the following?  Need to have the tags be configurable by the user. 
	- If note is in a folder/folders configured in Osmosis settings, all notes inside are candidates for cards.
	- If note has frontmatter tag/tags configured in Osmosis settings, all notes inside are candidates for cards.
	- If a component of a note has tag/tags configured in Osmosis settings, all notes inside are candidates for cards?  (so not all the content is considered a note), just a section/heading maybe?
- Mind Map View is powered by Obsidian Bases?  Would that make sense?  I like using the Bases system because it handles large amounts of data very quickly.  You also get the benefit of visualizing/studying the same data in different views, toggleable properties, powerful view filters, grouping and sorting.  
- [obsidian-mind-map](https://github.com/lynchjames/obsidian-mind-map) is an existing implementation of creating a mind map from a Markdown note, but it's very "bare bones" and has little configuration options. 
- Perhaps we could use (or at least start from) [Markmap](https://github.com/markmap/markmap) to create our Mind Map View?
- [Minder](https://github.com/phase1geo/Minder) is probably the best open-source alternative to Xmind.  Still not as feature-rich and robust, but not bad.
- Osmosis needs to work on Desktop and Mobile
- Osmosis Mind Map View needs to be *fast* and render/update quickly.  
- I want to be able to take notes either in classic Obsidian fashion but also via the Mind Map View like a classic experience in any mind map software. 
	- Not just a mind map viewer, it's also an editor.  Editing the mind map writes the content to a markdown note.  
- Mind Map View supports showing mind maps within mind maps, like how you can link/embed an Obsidian Note into another with `![[]]` or `![]()`.  This would be a novel and powerful thing I've never seen done before.  I really want to make this work.  
	- For example, say I have three notes.  `Animals.md`, `Cats.md`, and `Dogs.md`.  `Animals.md` has some of its own notes and also embedded links (`![]()`) to both `Cats.md` and `Dogs.md`.  Both of these latter notes contain headings and bulleted lists of all the different branches/breeds of their respective kinds.  When I view `Animals.md`, It shows it's own notes as nodes and also shows the `Cats.md` mind map as its own branch and `Dogs.md` as its own branch.
- When in study/flashcard mode and using the mind map, the flashcard mode drives the visibility of nodes and/or parts of nodes (e.g. cloze) without editing the actual note content.
- How to store spaced repetition data?  Could do a centralized JSON.  I'm also a big fan of storing metadata in frontmatter.  I wonder if we could store the spaced repetition metadata in frontmatter of a given note, which would allow the user to easily edit, for example, the next time a card is shown? 

### Potential Use Cases

- Learning any academic subject (e.g. a new programming language, a spoken language, biology, history, chemistry, math, etc.)
- Taking notes from a self-help book and remembering key takeaways (e.g. *Atomic Habits*)
- Remembering birthdays and recent events of friends and family
- Quickly creating flashcards from existing notes or parts of notes to easily remember information there (even something as simple as a grocery list in a Daily Note)

### Open Questions

- ~~Is it possible to build an entire mind map viewer/editor in Obsidian?~~ → **Yes. Custom SVG + foreignObject engine.**
- ~~Does it make sense to "power" the mind map viewer/editor via Obsidian Bases?~~ → **No. Bases is optimized for tabular data, not tree/graph rendering. Could constrain interaction model.**

### Concerns or Constraints

- Must work on desktop and mobile
- Must be *fast*.  A tool is useless if it creates friction due to lag.

---

## Claude Brainstorm Session

*Recorded from initial Claude Code ideation session, 2026-02-24.*

### Conversation Summary

Claude helped clarify several foundational decisions by asking probing questions about scope priority, rendering technology, data storage, and mobile importance. The conversation covered the mind map engine, rendering approach, map structures, study modes, markdown-to-map mapping, Xmind feature audit, and spaced repetition data storage.

### Key Takeaways

#### Core Philosophy: Unified System
- Notes, mind maps, and flashcards are three views of the *same knowledge* — not separate workflows.  Author once, study in multiple modes.
- You cannot build one pillar in isolation; they are interdependent.  The thinnest vertical slice that demonstrates the concept: a single markdown note with headings and highlights renders as a mind map, and you can enter study mode where nodes get hidden for recall.

#### Mind Map Engine Decision: Custom Engine
- Markmap is a rendering library only (markdown → SVG). It has no editing, no node interaction, no animation for study mode. Bolting everything onto it would be harder than building custom.
- **Decision**: Build a custom mind map engine, potentially published as a separate repo/package.
- Architecture inspired by Markwhen Parser: **fast parser → intermediate representation → swappable views** (mind map, timeline, study mode all consume the same tree model).

#### Rendering Approach: SVG + foreignObject Hybrid
- **SVG** handles the map skeleton: lines, curves, layout. Fast, scalable, exportable.
- **`<foreignObject>`** inside SVG nodes embeds full HTML/CSS for node content: markdown rendering, code blocks, LaTeX, images, footnote tooltips.
- This gives us the best of both worlds: SVG's layout/export strengths + HTML's rich content rendering.
- **Risk**: `<foreignObject>` has historically had quirks on mobile WebViews. Needs early prototyping on iOS/Android Obsidian to validate. Modern Obsidian mobile should be fine.
- CSS theming applies to both structure and content. Export to SVG/PNG/PDF comes nearly for free.

#### Map Structures: Mind Map + Timeline
- Decided on two structures for v1: **Mind Map** and **Timeline**.
- Mind Map has three toggles:
  1. Branch direction: left/right vs. up/down
  2. Node placement: both sides vs. one side
  3. Flip side toggle
- All structures share the same underlying tree data — the difference is purely the **layout algorithm** (how x,y coordinates are assigned to nodes). Swappable layout strategies plug into the same rendering engine.
- Abandoned: Logic Chart, Brace Map, Org Chart, Fishbone (can be added later since they're just layout algorithms on the same data).

#### Markdown ↔ Mind Map Node Mapping
- Node type is driven by markdown syntax with a 1:1 correspondence:
  - `#` prefix → heading node
  - `-` prefix → bulleted list node
  - `1.` prefix → ordered list node
  - No prefix → paragraph node
- "Source mode" toggle in the mind map (like Obsidian's reading/source toggle) where the editing experience matches markdown exactly.
- Split view possible: map on one side, markdown on the other, with live sync between them.

#### Bidirectional Sync Model
- Obsidian auto-saves in near-realtime, which handles file-level persistence.
- The real challenge is the **parsing loop**: user edits markdown → re-parse → update map (and vice versa). Needs to be fast and not cause cursor jumps or flicker.
- Solution: **shared in-memory model** that both views read/write to, with the markdown file as the persistence layer.
- Inspired by Markwhen Parser's approach:
  - **Incremental parsing**: track changed ranges, only re-parse affected sections (not the entire file).
  - **Range tracking**: every AST node knows its character position in the source. This enables cursor position sync between markdown editor and mind map.
  - **LRU caching**: cache parsed results so repeated operations (switching views, etc.) are near-instant.
  - **Early-exit optimizations**: skip expensive parsing for lines that clearly aren't relevant (e.g., Markwhen skips lines without `:` — we'd skip lines without heading/bullet/number prefixes).

#### Study Mode: Context-Driven UX
- **Spatial study** when launching from Mind Map View: fill in blanks on the tree, recall hidden nodes in-place.
- **Sequential study** when launching from Obsidian editor: classic Anki-style card-by-card flow.
- Same FSRS scheduling engine underneath, different UX.

#### Footnote Tooltips (New Idea)
- Leverage markdown footnotes (`[^1]`) so that hovering or clicking a node in Mind Map View shows a popup with the footnote content.
- Allows adding context to a node without cluttering the visible map.
- Zero new syntax — uses standard markdown footnotes.

#### Data Storage: Hybrid Approach
- **Frontmatter** for note-level metadata: `sr-enabled: true`, deck tags, etc.
- **Centralized data store** (e.g., `.osmosis/` folder or single JSON file) for per-card scheduling state, keyed by stable card identifiers (e.g., `noteId:heading:clozeIndex`).
- Keeps notes clean while making SR data manageable for notes with many cards.

#### Scope Decisions: What We Abandoned
- **Floating Topics**: No natural markdown representation. Removed from scope.
- **Relationship Lines** (custom cross-connections between non-parent-child nodes): Moved to nice-to-have/backburner. No natural markdown representation and adds significant complexity to the data model.
- **Obsidian Bases for mind map rendering**: Cautious — Bases is optimized for tabular/structured data, not tree/graph rendering. Could constrain the interaction model. Keep as an option, not a foundation.

#### Embedded/Transclusion Mind Maps
- Rendering `![[linked-note]]` or `![linked-note](path-to-linked-note)` as a sub-branch in the parent map is a must-have. Both wikilink-style and markdown-style links are supported.
- Needs: cycle detection (A embeds B embeds A), lazy-loading of collapsed branches for performance, and clear UX for editing nodes that belong to embedded files (edits write to the embedded file).
- Goal: embed 100 notes together with no perceptible lag.

#### Navigation Sync
- The Obsidian note itself serves as the "navigation panel" — cursor position in the note syncs to selected node in the map, and vice versa. This sync can be toggled on/off.

### Refined Understanding

Osmosis is a custom mind map engine + spaced repetition system built as an Obsidian plugin.  The core insight is that markdown structure *is* the mind map — headings, bullets, and lists map directly to nodes.  The same content can be studied spatially (in the map) or sequentially (in the editor).  The engine needs to be fast enough to handle large transclusion trees (100+ embedded notes) and support incremental parsing for real-time bidirectional sync.  The rendering approach (SVG + foreignObject) gives us rich content in nodes while keeping the map exportable and performant.

---

## Feature Brainstorm

*What are the possible features or capabilities? Claude is great at "what could this include?" conversations. Capture those ideas here.*

### Xmind Feature Parity Checklist

*Go through each feature and mark: [x] must-have, [~] nice-to-have, or [N/A] not applicable for Osmosis. Leave [ ] for undecided.*

#### Map Structures
- [x] Mind Map (classic radial branching) — with three toggles: branch direction (L/R vs U/D), node placement (both sides vs one side), flip side
- [~] Logic Chart — future: just a layout algorithm swap on the same tree data
- [~] Brace Map — future: just a layout algorithm swap on the same tree data
- [~] Org Chart — future: just a layout algorithm swap on the same tree data
- [~] Fishbone Diagram (cause-and-effect) — future: just a layout algorithm swap on the same tree data
- [x] Timeline — v1 alongside Mind Map
- [N/A] Tree Chart
- [N/A] Tree Table (nested rectangles, subtopics horizontal)
- [N/A] Matrix

#### Topic Types
- [x] Central Topic (root node)
- [x] Main Topic (first-level branches)
- [x] Subtopic (deeper branches)
- [N/A] Floating Topic (unconnected node placed anywhere) — abandoned, no natural markdown representation
- [x] Summary Topic (generated from summary element)

#### Topic Elements
- [~] Relationship lines (connect two related topics with customizable line style, color, arrow, text) — backburner, no natural markdown representation
- [x] Boundary (visual frame around a group of topics to highlight/emphasize)
- [x] Summary (condense multiple topics into a summary annotation)
  - Achieved by an "Abstract" Obsidian callout?
- [x] Notes (rich text attached to a topic — bold, italic, underline, lists)
- [x] Labels (text tags on topics for classification)
  - Achieved by Obsidian tags
- [N/A] Markers/Icons (priority flags, progress indicators, task status icons)
- [N/A] Stickers/Illustrations (decorative images from a built-in library)
- [x] Images (insert custom images into topics)
- [x] Links (web URLs or internal file links attached to topics)
- [x] Audio notes (record audio attached to a topic)
- [x] Document attachments (attach files to topics)
- [x] LaTeX equations (render math/chemistry formulas in topics)
- [x] Numbering (automatic numbering styles for topics)
- [x] Task/To-do checkboxes (turn topics into trackable tasks)
- [~] Comments (collaborative annotations on nodes)
  - Achieved via Obsidian quotes ("> Lorem ipsum")?

#### Topic Editing
- [x] Add child topic (Tab)
- [x] Add sibling topic (Enter)
- [x] Drag-and-drop repositioning
- [x] Multi topic selection, formatting, repositioning, etc.
- [x] Branch collapsing/expanding
- [x] Rich text formatting within topics (bold, italic, colors, etc.)
- [x] Topic shape customization

#### Styling & Theming
- [x] Theme library (pre-built color schemes)
  - Use https://github.com/mbadolato/iTerm2-Color-Schemes
- [x] Smart Color Themes (auto-generated palettes) 
- [~] Theme Editor (create custom themes)
- [~] Custom font selection
- [x] Layout/structure adjustment per branch
- [x] Topic shape styling (rounded, rectangle, etc.)
- [x] Branch line styling (curved, straight, etc.)
- [N/A] Legend (key explaining markers/icons used in the map)

#### View Modes
- [x] Standard mind map view
- [N/A] Outliner mode (hierarchical list view, switchable to/from map)
  - This is achieved naturally by an Obsidian Note
- [x] Zen Mode (distraction-free full-screen editing)
- [N/A] Pitch Mode (auto-convert map to slide deck with transitions)

#### Navigation & Filtering
- [x] Navigation panel
  - Could use the Obsidian Note itself to accomplish this by "syncing" Note with Mind Map and vis versa depending on where the mouse cursor is/what node is selected.  This sync could be toggled on and off.
- [~] Filter by topic content
- [~] Filter by notes
- [N/A] Filter by markers/labels
- [x] Search within map
- [x] Navigate/jump to specific topic

#### File & Export
- [x] Export to PNG
- [x] Export to SVG
- [x] Export to PDF
- [N/A] Export to Markdown
  - It's already stored as a Markdown file
- [N/A] Export to Word
- [N/A] Export to Excel
- [N/A] Export to PowerPoint
- [N/A] Export to OPML
- [N/A] Export to TextBundle
- [N/A] Import from Markdown
- [N/A] Import from OPML
- [N/A] Import from FreeMind
- [N/A] Import from MindManager
- [x] Multi-sheet files (multiple maps in one file)
  - Yes, if this refers to linking notes within notes
- [x] Map Shot (capture/screenshot of map region)
  - I call this a "Mini Map"
- [N/A] Batch export
- [N/A] Password protection

#### Collaboration
- [N/A] Share via link
- [N/A] Real-time co-editing
- [N/A] User avatars/cursors showing active editors
- [N/A] View-following (follow another user's view)
- [N/A] Node-level comments
- [N/A] Task assignment to team members
- [N/A] Deadline/priority assignment
- [N/A] Version history

#### AI Features
- [N/A] Text/URL/PDF to mind map generation
- [N/A] AI brainstorming / idea expansion
- [N/A] AI-driven map reorganization/summarization
- [N/A] AI content refinement
- [N/A] AI language translation

#### Platform & Performance
- [x] Desktop (Windows, macOS, Linux)
- [x] Mobile (iOS, Android)
- [N/A] Web version
- [x] Offline functionality
- [N/A] Cloud sync across devices
- [x] Keyboard shortcuts throughout

### Additional Feature Ideas (from brainstorm session)
- **Footnote tooltips**: Hover/click a node in Mind Map View to see a popup with footnote content (`[^1]`). Adds context without cluttering the visible map. Uses standard markdown footnotes — zero new syntax.
- **Source mode toggle**: Switch between visual mind map and raw markdown within the mind map view, like Obsidian's reading/source toggle.
- **Split view**: Map on one side, markdown on the other, with live bidirectional sync.
- **Embedded/transclusion mind maps**: `![[linked-note]]` or `![linked-note](path)` renders as a sub-branch. Recursive, with cycle detection and lazy-loading.

### Must-Have Features
- Custom mind map engine (SVG + foreignObject hybrid rendering)
- Mind Map view (with direction/side toggles) and Timeline view
- Bidirectional markdown ↔ mind map sync with incremental parsing
- Embedded/transclusion mind maps (`![[]]` and `![]()` render linked notes as sub-branches)
- Spaced repetition with FSRS scheduling
- Zero-effort card generation (headings, highlights, bold → cards)
- Spatial study mode (in mind map) + sequential study mode (in editor)
- Desktop and mobile as first-class citizens
- Footnote tooltips in mind map view

### Nice-to-Have Features
- Relationship lines (custom cross-connections)
- Additional map structures (Logic Chart, Brace Map, Org Chart, Fishbone)
- Theme editor for custom themes
- Custom font selection
- Filter by topic content / notes
- Comments via Obsidian quotes
- Spaced repetition heatmap
- Anki import/export (.apkg/.colpkg) — see Anki Import/Export Ideation Session

### Future Possibilities
- AI-assisted mind map generation
- Collaborative editing (if Obsidian adds native support)
- Additional layout algorithms as the engine matures
- Plugin API for third-party layout strategies

---

## Technology Thoughts

*Initial ideas about tech stack, language, or platforms. These are rough and will be refined in Planning phase.*

- **Language**: TypeScript (strict mode), consistent with Obsidian plugin ecosystem
- **Rendering**: SVG for map structure (lines, curves, layout) + `<foreignObject>` for node content (HTML/CSS — enables markdown rendering, code blocks, LaTeX, images)
- **Parser architecture**: Inspired by Markwhen Parser — fast parser → intermediate tree representation → swappable view consumers. Incremental parsing for real-time sync, range tracking for cursor sync, LRU caching for performance.
- **Spaced repetition algorithm**: FSRS (Free Spaced Repetition Scheduler) — open-source, well-documented, actively maintained
- **Mind map engine**: Custom-built, potentially published as a separate package/repo. Layout algorithms are swappable strategies that plug into the same rendering engine.
- **Build**: Obsidian plugin standard (esbuild via obsidian-sample-plugin template)
- **Linting**: ESLint with `eslint-plugin-obsidianmd`
- **Image occlusion editor**: Fabric.js or Konva.js (modern canvas/SVG drawing library; replaces Anki's embedded SVG-Edit 2.6)
- **SR database**: SQLite via sql.js (embedded, no native dependency, works in Obsidian's WebView)
- **Reference repos in `/ref/`**: Markwhen Parser (parser architecture), Markwhen Timeline (timeline view), Markmap (mind map rendering inspiration), obsidian-spaced-repetition, Decks, obsidian-sample-plugin, Anki source, Minder, image-occlusion-enhanced

---

---

## Flashcard / Spaced Repetition Ideation Session

*Recorded from Claude Code ideation session, 2026-02-26. Builds on the Mind Map session above. References studied: `ref/decks`, `ref/obsidian-spaced-repetition`, `ref/image-occlusion-enhanced`.*

### Reference Plugin Analysis

#### Decks (modern, FSRS-based)
- SQLite database (centralized, queryable, merge-before-save for multi-device sync)
- Deterministic hash of front text as card ID — stable across devices
- Card types: header-paragraph (H2 = front, content = back) and markdown tables
- FSRS scheduling; comprehensive review logging; session quotas with daily limits
- Rich stats: heatmap, forecast chart, interval distribution
- Single-pass efficient parser; keyboard shortcuts (Space to flip, 1–4 to rate)
- **Weaknesses**: No cloze, no graph features, hardcoded FSRS profiles, no daily limit customization

#### Obsidian-Spaced-Repetition (SM-2, FSRS migration planned)
- Scheduling data embedded as HTML comments in markdown (`<!--SR:!2025-01-20,3,260-->`) — clutters notes
- Card types: single-line (`Q::A`), multi-line (`Q / ? / A`), reversed (`:::`), cloze (`==highlight==`, `**bold**`, `{{curly}}`)
- Graph-aware OSR scheduling: PageRank boosts ease of highly-connected concepts
- Full markdown rendering (images, audio, video, LaTeX)
- **Weaknesses**: SM-2 (older than FSRS), file-embedded clutter, no session quotas, hash-based IDs break on text edit

#### Anki — Image Occlusion Enhanced
- SVG-based masks stored in media folder (three files per card: Original, Question, Answer)
- Each drawn shape → one card; grouped shapes → one card
- Two modes: **Hide-All, Guess-One** (harder — all regions masked, only target revealed on back) and **Hide-One, Guess-One** (easier — only target masked, full context visible)
- Card ID: UUID + sequential shape index, stable across edits
- Editor: embedded SVG-Edit 2.6 (old); Osmosis will modernize with Fabric.js or Konva.js

### Key Decisions

#### Card Identity
- **Inline comment co-located with the card**: `<!--osmosis-id:abc123-->` placed adjacent to the card source in markdown
- One note can contain many cards — frontmatter can't cleanly map IDs back to specific headings/cloze/table rows
- Frontmatter used for **note-level** metadata only: `osmosis: true`, `osmosis-deck:`
- Image occlusion card IDs stored as `id` attributes on SVG shape elements
- If an `osmosis-id` comment is deleted, re-generate and treat as new card (graceful degradation)

#### Note Opt-In
- `osmosis: true` in frontmatter opts a note into card generation
- `osmosis-deck: programming/python` in frontmatter sets explicit deck assignment
- Nothing in the vault is indexed by default — user must opt in

#### Card Types

| Type | Syntax | Cards generated |
|---|---|---|
| Heading-paragraph | `## Heading` + body below | 1 (heading = front, body = back) |
| Table | 2-column markdown table | 1 per data row |
| Cloze — highlight | `==term==` | 1 per highlighted term |
| Cloze — bold | `**term**` | 1 per bolded term |
| Bidirectional | `Q:::A` | 2 (forward + reverse) |
| Code block — single line | `# osmosis-hide` or `// osmosis-hide` appended to line | 1 per hidden line/region |
| Code block — multi-line | `# osmosis-hide-start` / `# osmosis-hide-end` block | 1 per hidden region |
| Image occlusion | SVG masks drawn over image via editor | 1 per shape/group |

**Code block cloze details:**
- Language detected from fence tag (` ```python `, ` ```javascript `) to determine comment style (`#` vs `//`)
- Unknown languages fall back to accepting both
- Hidden lines replaced by `░░░░░░` on front; full block revealed on back
- Multiple hidden regions in one block = multiple cards (one per region)

**Heading vs. cloze conflict:**
- When a section has both a heading card and a cloze in the same paragraph, default: **Cloze only**
- Configurable in Osmosis Settings: `[Both] [Cloze only*] [Heading only]`

#### Deck Organization — Four Layers (all opt-in)
1. **Tag hierarchy** — `#study/python/functions` → deck path mirrors tag path
2. **Folder hierarchy** — notes in `Learning/Python/` → automatically in `Python` deck
3. **Explicit frontmatter** — `osmosis-deck: python/functions`
4. **Mind map branch as deck** — studying a branch studies that subtree as a unit

Osmosis Settings has explicit include/exclude lists for folders and tags. Nothing indexed by default.

#### Scheduling & Storage
- **Algorithm**: FSRS — no question
- **Storage**: `.osmosis/cards.db` (SQLite via sql.js) for all card state + review logs
- **Multi-device sync**: SQL merge-before-save (from Decks)
- **FSRS weights**: Exposed as advanced settings option (neither reference plugin does this)
- Frontmatter stores note-level metadata only; SR state never touches markdown files

#### Orphaned Cards
- **Soft-delete**: SR history preserved, card archived. If source is re-created, card can be re-linked.

#### Excluding Cards
- `<!-- osmosis-exclude -->` above any heading, highlight, or code block suppresses that card
- Card is soft-deleted; removing the comment re-activates it
- Configurable globally or per-card

#### Study Session UX

**Entry points (all supported):**
- Left sidebar Osmosis icon → dashboard panel
- Command palette: `Osmosis: Study current note`
- Note "More options" (⋯) menu → "Study this note"
- Mind Map "More options" menu → "Study this map"
- Right-click branch in Mind Map View → "Study this branch"
- Floating "due cards" badge on map branches → click to start

**Session flow:**
- Default: straight into review (no preamble)
- Optional pre-session summary screen (Settings toggle): "You have 23 cards due. Estimated 12 min. [Start]"
- Rating: Again / Hard / Good / Easy (standard FSRS)
- Session quotas: daily new card limit + daily review limit

**Three study modes (same FSRS engine, different UX):**
- **Sequential mode** (deck study): classic Anki-style modal, card by card
- **Contextual mode** (in-note study): activates in reading view; cards studied in-place within the note in document order; casual peek or FSRS-rated study (see Explicit Card Syntax session below)
- **Spatial mode** (from Mind Map View): nodes hide/reveal in-place on the map; supports both full node hiding AND inline cloze blanking within visible nodes

#### Image Occlusion
- **Editor**: Fabric.js or Konva.js (modern replacement for Anki's embedded SVG-Edit 2.6)
- **Authoring**: Right-click image → "Create occlusion cards"; also batch mode via command palette (`Osmosis: Create occlusions for images in this note`) and note ⋯ menu
- **Two modes**: Hide-All (harder, all regions masked) + Hide-One (easier, context visible)
- **Mask storage**: `.osmosis/masks/{noteUUID}-{shapeId}-{Q|A|O}.svg`
- **Spatial integration**: Image occlusion cards render as masked thumbnails inline in Mind Map View; clicking expands to full reviewer in-place

#### Osmosis Sidebar Dashboard
- Anki-style: deck list + sub-deck list with New / Learn / Due counts per deck
- Expandable sections per deck for heatmap and charts (forecast, stability distribution, etc.)
- Navigate from here to start a study session for any deck

#### Card Authoring Transparency
- **Gutter indicators**: small icon in editor margin next to every line that generated a card
  - Hover: tooltip showing card type and count
  - Click: inline preview of front/back, with [Exclude] and [Edit] options
- **"Cards in this note" panel**: full list of all cards from the current note, with card type, due date, front/back preview, and per-card exclude button
  - Accessible from note ⋯ menu → "View cards for this note" and from Osmosis sidebar
- See `notes/00_inspiration/card_authoring_example.md` for a concrete worked example

#### Graph-Aware Ease Boosting (from OSR)
- Studying a concept boosts ease of linked/connected concepts
- In spatial mode: revealing a parent node gives small ease boost to its children
- Configurable link contribution factor in Osmosis Settings

### Refined Understanding

The flashcard system is not a bolt-on to the mind map — it is the same data viewed differently. A heading in a note is simultaneously a mind map node and a card front. A cloze deletion is simultaneously inline text and a testable blank. Image occlusion is simultaneously an embedded image and a spatial quiz. The SR engine schedules what to study; the view layer (sequential modal or spatial map) determines *how* you study it. This is the core value of Osmosis: author once, study in any mode.

---

## Explicit Card Syntax & Card Type Expansion Ideation Session

*Recorded from Claude Code ideation session, 2026-02-27. Builds on the Flashcard/SR session above. References studied: `ref/obsidian-spaced-repetition/docs/docs/en/flashcards/q-and-a-cards.md`, `ref/admonitions/`, Anki source code (`ref/anki/`).*

### Anki Feature Parity Audit

Compared all Anki stock note types against Osmosis's planned card types. Three gaps identified:

1. **Basic (optional reversed card)** — Anki allows conditionally generating a reverse card via an "Add Reverse" field. Resolved: Osmosis uses `bidi: true` boolean on any card, which is easier to toggle than Anki's field-based approach.
2. **Basic (type in the answer)** — Anki's `{{type:FieldName}}` shows a text input for typed recall. Resolved: Osmosis adds `type-in: true` boolean flag (see below).
3. **Custom notetype templates** — Anki allows arbitrary multi-field notetypes with custom templates. Decision: **Skip for now.** Osmosis's markdown-native card types cover the common cases; custom templates add complexity without clear value for the target workflow.

### Key Decisions

#### Heading Auto-Generation Toggle
- New setting in Osmosis Settings: **"Auto-generate cards from headings"** (on by default)
- When **off**, headings are not automatically interpreted as card fronts — only explicit card declarations (code fences, clozes, tables) generate cards
- When off, heading structure is **still used as context/metadata** for cloze cards within that section (e.g., a cloze under `## Photosynthesis` is tagged with that heading for context)
- Use case: students who take extensive notes under headings and don't want every section to become a card

#### Explicit Card Syntax: Code Fences

**Decision**: Use code fences (`` ```osmosis ``) for explicit card declarations. Rejected callout syntax (`> [!flashcard]`) — code fences are cleaner, and the Admonitions plugin (`ref/admonitions/`) proves that code fences can render full markdown content (images, math, links, embeds) via `MarkdownRenderer.renderMarkdown()`. Osmosis will build its own post-processor using the same technique — no Admonitions dependency.

**Why code fences over OSR's separator syntax (`::`, `?`, `??`)**:
- No collision risk — `osmosis` is a unique language tag
- Structured metadata via key-value lines in the body (deck, hints, flags)
- Full markdown rendering inside the fence (via custom post-processor)
- Extensible — new fields are just new keys, no syntax redesign
- One consistent system instead of mixing inline separators with other syntax

**Decided against keeping `::` / `:::` inline syntax alongside fenced cards** — one system only, for simplicity and consistency.

#### Card Syntax Specification

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

**Bidirectional type-in card:**
````
```osmosis
bidi: true
type-in: true

Bonjour
***
Hello
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

**Rich content (math, images — all rendered by post-processor):**
````
```osmosis
deck: biology/cell-structure
hint: Powerhouse of the cell

What organelle produces ATP?
![[mitochondria.png]]
***
Mitochondria
```
````

**Syntax rules:**
- Language tag is `` ```osmosis `` — Osmosis registers a `MarkdownCodeBlockProcessor` for this tag
- Metadata lines (`key: value`) must appear at the top of the fence body, before any blank line
- `***` separates front from back (one `***` always, regardless of direction)
- `bidi: true` makes the card bidirectional (generates two cards: forward + reverse)
- `type-in: true` enables typed recall mode (text input + diff comparison on review)
- Flags compose: `bidi: true` + `type-in: true` = bidirectional type-in card
- All standard markdown renders inside the fence: bold, links, images, LaTeX, code, embeds

#### Command Palette Commands

Commands for inserting cards via command palette, reducing manual typing:

**Separate commands** (for hotkey binding):
- `Osmosis: Insert card` — basic unidirectional skeleton
- `Osmosis: Insert bidirectional card` — with `bidi: true`
- `Osmosis: Insert type-in card` — with `type-in: true`
- `Osmosis: Insert bidirectional type-in card` — with both flags

**Submenu command** (for command palette search):
- `Osmosis: Insert card...` → submenu with all four types (plus any user-defined templates)

**Behavior on insert:**
- Inserts the fence skeleton at cursor with `***` already placed
- Cursor lands on the first line (front side), ready to type
- Metadata lines pre-populated based on context (e.g., if the current note has `osmosis-deck:` in frontmatter, auto-fill `deck:`)
- User-defined templates (see below) appear as additional submenu options

#### Card Templates

**Storage**: In Osmosis Settings UI (stored in `data.json` alongside other plugin settings).

**Settings UI**:
- A list of named templates ("Basic", "Vocab Bidirectional", "Code Quiz", etc.)
- Each template defines: which metadata keys to include, default values, and the skeleton structure
- Users can add, remove, reorder, and edit templates
- Templates appear as command palette submenu options: `Osmosis: Insert card... → Vocab Bidirectional`

**Built-in defaults** (user can modify or delete):
- "Basic" — no metadata, just front/back
- "Bidirectional" — `bidi: true`
- "Type-in" — `type-in: true`
- "Bidirectional Type-in" — `bidi: true` + `type-in: true`

**Export/import**: Templates can be exported as JSON and imported by other users.

#### Three Study Modes

**Updated from two to three study modes** (same FSRS engine, different UX):

1. **Sequential mode** (deck study): Classic Anki-style modal, card by card. Cards drawn from a deck regardless of source note. Entry points: sidebar dashboard, command palette (`Osmosis: Study deck`).

2. **Contextual mode** (in-note study): Cards studied in-place within the note, in document reading order. **Activates automatically when the student switches to Obsidian's reading view** on an opted-in note. No extra commands or menu options needed — reading view *is* study mode.
   - The Osmosis post-processor hides the answer side of every `osmosis` fence (replaced by a "Reveal" button or `░░░░░░` placeholder). Front side stays visible.
   - Clicking "Reveal" shows the answer. A "Start studying" button at the top of the note activates FSRS rating — after each reveal, inline rating buttons (Again / Hard / Good / Easy) appear below the card.
   - Without clicking "Start studying", reveals are casual peeks — no FSRS recording.
   - **All cards in the note participate regardless of FSRS schedule** (unlike sequential/spatial which respect due dates).
   - **Inline cloze participation**: Whether `==highlighted==` and `**bolded**` clozes in surrounding prose also blank out in contextual mode is **configurable in Osmosis Settings** (default: off).
   - Progress indicator: small floating widget or status bar showing "3/7 cards reviewed in this note".

3. **Spatial mode** (mind map study): Nodes hide/reveal in-place on the map. Supports both full node hiding and inline cloze blanking within visible nodes. Entry points: Mind Map View menu, right-click branch, floating due-cards badge.

#### FSRS Review Tagging by Study Mode

Every FSRS review is tagged with the study mode that produced it (`contextual`, `sequential`, `spatial`). Stored as an extra column in `cards.db` review logs.

**Rationale**: Contextual mode provides surrounding text as cues, which may inflate ease ratings compared to sequential mode (isolated recall). Tagging the source allows:
- **Short term**: All reviews count equally. Simple, no wasted effort.
- **Long term**: If data shows contextual reviews inflate ease, a configurable **contextual difficulty adjustment** multiplier (e.g., 0.8×) can discount contextual ratings.
- **Analytics**: Students can see study mode distribution — "You review 60% of your cards contextually."

### Updated Card Types Table

| Type | Syntax | Cards generated |
|---|---|---|
| Heading-paragraph | `## Heading` + body below (auto-gen, toggleable in settings) | 1 (heading = front, body = back) |
| Table | 2-column markdown table | 1 per data row |
| Cloze — highlight | `==term==` | 1 per highlighted term |
| Cloze — bold | `**term**` | 1 per bolded term |
| Explicit card | `` ```osmosis `` code fence with `***` separator | 1 (or 2 if `bidi: true`) |
| Type-in card | `` ```osmosis `` code fence with `type-in: true` | 1 (or 2 if `bidi: true`) |
| Code block — single line | `# osmosis-hide` or `// osmosis-hide` appended to line | 1 per hidden line/region |
| Code block — multi-line | `# osmosis-hide-start` / `# osmosis-hide-end` block | 1 per hidden region |
| Image occlusion | SVG masks drawn over image via editor | 1 per shape/group |

*Note: The old `Q:::A` bidirectional inline syntax has been replaced by `` ```osmosis `` fences with `bidi: true`. All explicit card creation uses the unified code fence syntax.*

---

## Anki Import/Export Ideation Session

*Recorded from Claude Code ideation session, 2026-02-28. Builds on the Flashcard/SR and Explicit Card Syntax sessions above. References studied: `ref/anki/` (import/export code, protobuf schemas, database schema).*

### Motivation

Anki is the dominant spaced repetition tool with millions of users and a massive shared deck ecosystem. Providing import/export between Anki packages and Osmosis serves two purposes:

1. **Onboarding** — Users can bring their existing Anki decks (with years of scheduling history) into Osmosis without starting over. This is the higher-value direction.
2. **Sharing** — Users can export Osmosis decks as .apkg files to share with the broader Anki community, or with collaborators who haven't adopted Osmosis.

**Scope**: Nice-to-have, Phase 2+. The core value of Osmosis (unified notes-maps-flashcards) does not depend on Anki interop. This is an adoption accelerator.

### Anki Package Format Analysis

Both **.apkg** (deck package) and **.colpkg** (full collection package) are **ZIP archives** containing:

| Component | Legacy (.anki2/.anki21) | Modern (.anki21b) |
|---|---|---|
| **Database** | SQLite, uncompressed | SQLite, zstd-compressed |
| **Media manifest** | `media` file: JSON object `{"0": "image.jpg", ...}` | `media` file: protobuf `MediaEntries` (zstd-compressed) |
| **Media files** | Numbered entries (0, 1, 2...), stored as-is | Numbered entries, zstd-compressed |
| **Metadata** | None | `meta` file: protobuf `PackageMetadata` with version enum |
| **Schema version** | V11 (Anki 2.0–2.1.49) | V18 (Anki 2.1.50+, supports FSRS) |

**Key database tables:**
- `notes`: id, guid, notetype_id, modification_time, tags, fields (separated by `\x1f`)
- `cards`: id, note_id, deck_id, ordinal, type, queue, due, interval, ease_factor, reps, lapses
- `revlog`: id (timestamp), card_id, usn, ease, interval, last_interval, factor, time, type
- `notetypes` (models): Card templates, field definitions, CSS styling
- `decks`: Deck names, configs, hierarchy

**Protobuf schemas** (in `anki/import_export.proto`):
- `MediaEntry`: name, size, sha1_hash
- `MediaEntries`: repeated MediaEntry
- `PackageMetadata`: version enum (LEGACY_1, LEGACY_2, LATEST)

### Import: .apkg → Osmosis

#### Process

1. **Unzip** the .apkg and detect format version (check for `meta` file → modern; `media` as JSON → legacy)
2. **Open the SQLite database** and read notes, cards, decks, notetypes, and optionally revlog
3. **Map Anki notetypes → Osmosis card types** (see mapping table below)
4. **Convert Anki HTML → Markdown** for card content (using a library like turndown.js)
5. **Generate markdown files** with Osmosis card syntax (````osmosis` fences, cloze markup, etc.)
6. **Import media** — copy images/audio into the vault, rewrite references in generated markdown
7. **Import SR state** — map Anki scheduling data into `.osmosis/cards.db`
8. **Set frontmatter** — add `osmosis: true` and `osmosis-deck:` to generated files

#### Notetype Mapping

| Anki Notetype | Osmosis Card Type | Notes |
|---|---|---|
| Basic | ````osmosis` fence (unidirectional) | Front field → front, Back field → back |
| Basic (and reversed card) | ````osmosis` fence with `bidi: true` | Always generates both directions |
| Basic (optional reversed card) | ````osmosis` fence, `bidi: true` if reverse field non-empty | Check the "Add Reverse" field |
| Basic (type in the answer) | ````osmosis` fence with `type-in: true` | |
| Cloze | `==cloze==` syntax in markdown prose | Convert `{{c1::text}}` → `==text==`; multiple cloze indices → multiple highlights |
| Image Occlusion | SVG masks imported into `.osmosis/masks/` | Requires mask format conversion (see below) |
| Custom notetypes | ````osmosis` fence (best-effort) | Multi-field templates flattened to front/back with warning |

#### Cloze Conversion Details

Anki cloze syntax: `{{c1::answer::hint}}`
- `{{c1::mitochondria}}` → `==mitochondria==`
- `{{c1::mitochondria::powerhouse}}` → `==mitochondria==` with `hint:` metadata preserved in an adjacent `<!--osmosis-hint:powerhouse-->` comment
- Multiple cloze indices (`c1`, `c2`, `c3`) in one note → each becomes a separate highlighted term, each generating its own card (matches Osmosis's one-card-per-highlight behavior)
- Nested cloze (rare) → flattened with warning

#### SR State Import

Two options presented to the user at import time:

1. **Reset scheduling** (recommended for SM-2 decks): All imported cards start as new. Clean slate, FSRS schedules from scratch. Simplest and most correct.
2. **Best-effort conversion** (for FSRS decks or users with significant history):
   - Import `interval`, `ease_factor`, `reps`, `lapses` from Anki's cards table
   - Import `revlog` entries into `.osmosis/cards.db` review log
   - FSRS can use review history to compute optimal parameters via its optimizer
   - SM-2 ease factors don't map cleanly to FSRS stability/difficulty — the FSRS optimizer handles this by re-deriving parameters from the raw review log

**Anki V18 (2.1.50+) decks with FSRS enabled** already store FSRS-compatible data (stability, difficulty, desired_retention). These can be imported directly with minimal conversion.

#### Import UX

- **Entry point**: Command palette → `Osmosis: Import Anki deck (.apkg)`, or via Osmosis Settings → Import/Export tab
- **File picker**: Standard OS file dialog filtered to `.apkg` / `.colpkg`
- **Import wizard** (modal):
  1. Preview: show deck name, card count, notetype breakdown, media count
  2. Options:
     - Target folder for generated markdown files (default: `Anki Import/{deck-name}/`)
     - Scheduling: "Reset (recommended)" vs "Import history"
     - Deck mapping: import as Osmosis deck tag, folder, or frontmatter `osmosis-deck:`
     - Media folder location (default: vault attachments folder)
  3. Import progress bar with per-card status
  4. Summary: cards imported, cards skipped (with reasons), warnings

#### Edge Cases

- **Anki's HTML content**: Cards can contain arbitrary HTML/CSS (tables, colored text, custom fonts, audio/video embeds). The HTML→markdown conversion is inherently lossy. Strategy: convert what we can, preserve the rest as raw HTML blocks in markdown (which Obsidian renders), and flag heavily-styled cards for manual review.
- **Sound/video tags**: Anki uses `[sound:filename.mp3]` syntax. Convert to Obsidian's `![[filename.mp3]]` embed syntax.
- **LaTeX**: Anki renders LaTeX to images at review time. Import the LaTeX source (stored in the field) as `$...$` / `$$...$$` in markdown, which Obsidian renders natively. Discard the pre-rendered images.
- **Duplicate detection**: If importing a deck that overlaps with existing Osmosis cards, match by content hash. Options: skip duplicates, overwrite, or create duplicates with warning.
- **Deck hierarchy**: Anki uses `::` as deck separator (`Parent::Child::Grandchild`). Map to Osmosis deck paths (`parent/child/grandchild`).

### Export: Osmosis → .apkg

#### Process

1. **Select scope**: User chooses what to export — a deck, a tag, a folder, a single note, or a mind map branch
2. **Collect cards** from the selected scope, reading from `.osmosis/cards.db`
3. **Map Osmosis card types → Anki notetypes** (reverse of the import mapping)
4. **Convert markdown → HTML** for Anki fields (via Obsidian's `MarkdownRenderer` or a standalone library)
5. **Build the SQLite database** with Anki's schema (notes, cards, decks, models tables)
6. **Package media** — gather all images/audio referenced by exported cards, number them sequentially, write the media manifest
7. **Write the .apkg** ZIP file

#### Card Type Mapping (Export)

| Osmosis Card Type | Anki Notetype | Notes |
|---|---|---|
| ````osmosis` fence (unidirectional) | Basic | |
| ````osmosis` fence with `bidi: true` | Basic (and reversed card) | |
| ````osmosis` fence with `type-in: true` | Basic (type in the answer) | |
| `==cloze==` / `**cloze**` | Cloze | Convert `==text==` → `{{c1::text}}`; auto-increment cloze index |
| Heading-paragraph | Basic | Heading → front field, body → back field |
| Table row | Basic | Column 1 → front, Column 2 → back |
| Code block cloze | Cloze | Hidden lines → `{{c1::code}}` with surrounding code as context |
| Image occlusion | Image Occlusion Enhanced | Convert mask format; export SVG masks as media |

#### Export UX

- **Entry points**:
  - Command palette → `Osmosis: Export deck as Anki package (.apkg)`
  - Osmosis sidebar → right-click deck → "Export as .apkg"
  - Note ⋯ menu → "Export cards as .apkg"
  - Mind Map View → right-click branch → "Export branch as .apkg"
- **Export dialog** (modal):
  1. Scope confirmation: "Exporting 47 cards from deck 'Python/Functions'"
  2. Options:
     - Include scheduling data (yes/no — default no, since the recipient likely has their own schedule)
     - Include media (yes/no — default yes)
     - Target Anki schema version (V11 for broad compatibility vs V18 for FSRS data)
  3. File save dialog
  4. Summary: cards exported, media files included, any conversion warnings

#### Lossy Export Considerations

Some Osmosis features have no Anki equivalent:
- **Mind map spatial context** — exported cards lose their spatial relationships. The heading hierarchy is preserved as deck structure, but the visual layout is gone.
- **Footnote tooltips** — exported as part of the back field content, losing their hover/popup behavior.
- **Transclusion context** — cards from embedded notes lose their transclusion relationship. Exported as standalone cards.
- **Graph-aware ease boosting** — Anki has no concept of linked-note ease contribution. Scheduling data exported as-is.
- **Contextual mode** — the in-note study experience doesn't translate. Cards become standard Anki review cards.

These losses are acceptable — the goal is data portability, not feature parity. A warning summary at export time lists what won't transfer.

### Image Occlusion Format Conversion

Anki (Image Occlusion Enhanced) and Osmosis use different mask formats:

| Aspect | Anki IOE | Osmosis |
|---|---|---|
| **Editor** | SVG-Edit 2.6 (embedded) | Fabric.js or Konva.js |
| **Mask storage** | 3 SVGs per card in media folder: Original, Question mask, Answer mask | `.osmosis/masks/{noteUUID}-{shapeId}-{Q\|A\|O}.svg` |
| **Shape IDs** | UUID + sequential index | UUID + sequential index (compatible) |
| **Mask format** | Raw SVG with rect/ellipse/polygon elements | Fabric.js/Konva.js JSON serialized to SVG |

**Import conversion**: Parse Anki's SVG masks, extract shape geometries (rect, ellipse, polygon, path), convert to Osmosis's mask format. Shape positions and dimensions are preserved. The SVG primitives are standard — this is a straightforward geometric conversion.

**Export conversion**: Reverse the above. Generate Anki-compatible SVG masks from Osmosis's mask data. Include the three SVG variants (Original, Question, Answer) that Anki IOE expects.

### Bulk Operations

Beyond single-deck import/export:

- **Import .colpkg** (full Anki collection): Imports all decks, all notetypes, all media, all scheduling. This is a "migration" workflow for users switching from Anki to Osmosis entirely.
- **Batch export**: Export multiple Osmosis decks as separate .apkg files, or as a single .colpkg containing all of them.
- **Shared deck compatibility**: Imported shared decks (from AnkiWeb) work the same as any other .apkg — the format is identical.

### Dependencies & Technical Requirements

- **JSZip** or similar — for ZIP read/write in the browser/Obsidian environment
- **sql.js** — already planned for `.osmosis/cards.db`; reuse for reading/writing Anki's SQLite databases
- **turndown.js** (or similar) — HTML → markdown conversion for import
- **Obsidian's MarkdownRenderer** — markdown → HTML conversion for export (or a standalone library for cases where Obsidian's renderer isn't available)
- **protobuf.js** (optional) — for reading modern Anki package metadata; could also just support legacy format only for v1

### Scope & Phasing

**Phase 2a — Import (higher priority):**
- .apkg import with Basic, Cloze, and Basic (reversed) notetype mapping
- HTML → markdown conversion
- Media import
- SR state: reset only (no history import)
- Import wizard with preview and options

**Phase 2b — Export:**
- .apkg export for explicit cards, cloze, heading-paragraph, and table cards
- Markdown → HTML conversion
- Media packaging
- Export dialog with scope selection

**Phase 2c — Advanced:**
- SR history import (best-effort FSRS conversion)
- Image occlusion mask conversion (both directions)
- .colpkg full collection import/export
- Custom notetype best-effort handling
- Duplicate detection and merge strategies

### Refined Understanding

Anki import/export is a data portability feature, not a core pillar of Osmosis. Its value is reducing friction: users don't have to choose between Anki and Osmosis, and they don't lose years of scheduling history when they switch. The import path (.apkg → Osmosis) is more valuable than export because it enables onboarding. The export path (Osmosis → .apkg) enables sharing and acts as an escape hatch. Both directions involve lossy conversion — Osmosis features like spatial study, transclusion, and graph-aware scheduling have no Anki equivalent, and Anki's arbitrary HTML templates don't map cleanly to markdown. The goal is "good enough" conversion with clear warnings about what doesn't transfer.

---

## Scope Reality Check

*Early thinking about scope: Is this a weekend project, a month-long effort, or something larger?*

**Rough Time Estimate**: Large — months of focused development. This is not a weekend project.

**Known Scope Creep Risks**: Mind map engine complexity (bidirectional sync, transclusion, mobile WebView quirks); FSRS implementation correctness; image occlusion SVG editor; mobile performance at scale.

**Ways to Start Small**: The value proposition requires both pillars (mind map + SR) working together. The thinnest viable slice is: a single markdown note renders as a mind map AND you can enter study mode where nodes get hidden for recall. Everything else builds on that foundation.

---

## MVP Definition, Performance Targets & Gap Resolution Ideation Session

*Recorded from Claude Code ideation session, 2026-02-28. Addresses six open gaps identified during pre-PRD review: MVP scope, performance budgets, study mode UX details, mobile feasibility, transclusion scope, and image occlusion library choice.*

### 1. MVP Definition

The MVP must demonstrate Osmosis's core thesis: **author once, study in multiple modes**. It must include both pillars (mind map + spaced repetition) working together — neither is valuable in isolation. The thinnest slice that proves the concept:

**MVP Scope (v1.0):**

| Feature | In MVP | Rationale |
|---|---|---|
| Custom mind map engine (SVG + foreignObject) | Yes | Core differentiator |
| Mind Map view with direction/side toggles | Yes | Core UX |
| Timeline view | No — v1.1 | Just a layout algorithm swap; mind map view is sufficient to prove concept |
| Bidirectional markdown ↔ mind map sync | Yes | Core value — "your notes ARE the map" |
| Incremental parser with range tracking | Yes | Required for non-laggy sync |
| Embedded/transclusion mind maps (`![[]]`) | Yes | Core competitive advantage (see gap #5) |
| FSRS scheduling engine | Yes | Core SR functionality |
| Card types: heading-paragraph, cloze (highlight + bold), explicit (`osmosis` fences) | Yes | Covers the 80% case for card generation |
| Card types: table rows, code block cloze, bidirectional, type-in | No — v1.1 | Nice-to-have; explicit fences cover these use cases in a less automated way |
| Image occlusion | No — v1.1 | Significant sub-feature (Fabric.js editor); not needed to prove core thesis |
| Sequential study mode (Anki-style modal) | Yes | Familiar, proven study UX |
| Contextual study mode (in-note reading view) | Yes | Unique to Osmosis, low implementation cost on top of post-processor |
| Spatial study mode (on mind map) | Yes | The "killer feature" — studying a mind map with SR |
| Card identity via inline comments | Yes | Required for stable SR scheduling |
| SQLite storage (.osmosis/cards.db via sql.js) | Yes | Required for card state |
| Osmosis sidebar dashboard (deck list + counts) | Yes — minimal | Just deck list with New/Learn/Due counts; no heatmap/charts yet |
| Gutter indicators + "Cards in This Note" panel | No — v1.1 | Polish feature; not needed for core functionality |
| Graph-aware ease boosting | No — v1.1 | Interesting but needs data to tune; ship without and add later |
| Anki import/export | No — v2.0 | Phase 2 feature as already scoped |
| Command palette card insertion commands | Yes | Low effort, high UX value |
| Card templates in settings | No — v1.1 | The 4 built-in types are sufficient for MVP |
| Footnote tooltips in mind map | No — v1.1 | Nice-to-have polish |
| Export to PNG/SVG/PDF | No — v1.1 | Comes nearly free from SVG but needs polish |
| Spaced repetition heatmap/charts | No — v1.1 | Analytics layer; not needed to study |
| Desktop + mobile | Yes | Mobile is a hard requirement from day one |

**MVP acceptance criteria (what "done" means for v1.0):**
1. A markdown note with headings, bullets, and `==highlights==` renders as an interactive mind map
2. Editing the map updates the markdown; editing the markdown updates the map
3. A note with `osmosis: true` in frontmatter generates cards from headings and clozes
4. You can study those cards in all three modes (sequential, contextual, spatial)
5. FSRS schedules cards correctly across sessions
6. `![[linked-note]]` or `![linked-note](path)` renders the linked note's mind map as a sub-branch
7. Works on desktop AND mobile with no perceptible lag for maps up to 500 nodes

### 2. Performance Targets

Excellent performance under heavy load is non-negotiable. A tool that creates friction through lag is useless.

#### Mind Map Rendering

Real-world context: even a "small" mind map routinely reaches 200 nodes. Large maps can easily hit 1,000–2,000+ nodes. The performance targets must treat 200 nodes as the comfortable baseline, not a stretch case.

| Metric | Target (Desktop) | Target (Mobile) | Measurement |
|---|---|---|---|
| Initial render (cold) — 200 nodes | < 100ms | < 200ms | Time from view open to fully painted SVG |
| Initial render (cold) — 500 nodes | < 150ms | < 300ms | Same, viewport culling active |
| Initial render (cold) — 1,000 nodes | < 250ms | < 500ms | Viewport culling + collapsed deep branches |
| Initial render (cold) — 2,000 nodes | < 500ms | < 1000ms | Viewport culling + level-of-detail + lazy expand |
| Initial render (cold) — 5,000+ nodes | < 1000ms | < 2000ms | Full optimization stack; DOM virtualization |
| Pan/zoom frame rate (≤1,000 nodes) | 60fps | 60fps | Measured during continuous pan gesture |
| Pan/zoom frame rate (1,000–5,000 nodes) | 60fps | 30fps minimum, 60fps target | With viewport culling |
| Node expand/collapse animation | < 100ms | < 150ms | Time from click to animation complete |
| Incremental re-render (single node edit) | < 16ms | < 33ms | Only affected subtree re-rendered (one frame) |

#### Parser & Sync

| Metric | Target | Measurement |
|---|---|---|
| Full parse — 1,000-line note | < 20ms | Time from markdown string to tree model |
| Full parse — 5,000-line note | < 80ms | Same; scales sub-linearly with caching |
| Full parse — 10,000-line note | < 150ms | Same; may be needed for large transclusion trees |
| Incremental parse — single line change | < 2ms | Time to update tree model after one-line edit |
| Incremental parse — multi-line paste (100 lines) | < 10ms | Time to update tree model after bulk edit |
| Markdown → map sync latency | < 16ms (one frame) | User types in editor, map updates within one frame |
| Map → markdown sync latency | < 16ms (one frame) | User edits map node, markdown updates within one frame |

#### Transclusion

| Metric | Target | Measurement |
|---|---|---|
| Transclusion resolve — 10 embedded notes | < 50ms | Time to load and parse all embedded note trees |
| Transclusion resolve — 50 embedded notes | < 200ms | With lazy loading of collapsed branches |
| Transclusion resolve — 100 embedded notes | < 500ms | With lazy loading; deep branches loaded on expand |
| Transclusion resolve — 500 embedded notes | < 1500ms | Full lazy loading + DOM virtualization |
| Cycle detection | < 1ms | Checked during tree construction, not at render time |

#### Spaced Repetition

| Metric | Target | Measurement |
|---|---|---|
| Card database open | < 100ms | Time to load sql.js + open .osmosis/cards.db |
| Card query (due cards for a deck) | < 20ms | SQL query for cards due now in a single deck |
| Card query (all due cards across all decks) | < 50ms | For dashboard counts |
| FSRS schedule computation | < 1ms per card | Single card scheduling after rating |
| Study session start (from click to first card) | < 200ms | Including DB query + UI render |

#### Memory

| Metric | Budget | Notes |
|---|---|---|
| Base plugin load | < 5 MB | Plugin code + sql.js WASM + initial state |
| Per-node memory (mind map) | < 1.5 KB | SVG elements + tree model node (lean to support large maps) |
| 500-node map total | < 6 MB | Base + nodes + DOM overhead |
| 2,000-node map total | < 10 MB | With viewport culling (only visible nodes in DOM) |
| 5,000-node map total | < 15 MB | With DOM virtualization; off-screen nodes removed |
| Card database (10,000 cards) | < 10 MB | SQLite in memory via sql.js |

#### Mobile-Specific

| Metric | Target | Notes |
|---|---|---|
| Plugin load time contribution | < 500ms | Must not noticeably slow Obsidian startup; use lazy initialization |
| Touch gesture response | < 100ms | From finger contact to visible response |
| Battery impact | Minimal when idle | No background polling or animation when view is not active |

### 3. Study Mode UX Details

**Contextual mode (in-note study):**
- Activates when switching to Obsidian reading view on an opted-in note
- All `osmosis` fences show the front side; back side is replaced with `░░░░░░` placeholder
- **Clicking/tapping a card or cloze reveals the answer**
- **Rating buttons appear as a comment bubble attached to the card or cloze** after reveal — Again / Hard / Good / Easy
- Without clicking "Start studying" at the top, reveals are **casual peeks** — no FSRS rating buttons shown, no scheduling recorded
- After "Start studying", every reveal shows the rating bubble
- Progress: floating widget showing "3/7 cards reviewed"
- Inline cloze participation (whether `==highlights==` and `**bold**` also blank out) configurable in settings (default: off)

**Spatial mode (mind map study):**
- Nodes are hidden/revealed by **tapping the node** to show its content
- **"Show children" plus "(+)" button attached to each node** expands hidden children, exactly like Xmind's expand/collapse UX
- Supports both full node hiding AND inline cloze blanking within visible nodes
- Rating bubble appears after node reveal (same pattern as contextual mode)
- Entry: Mind Map View menu, right-click branch, floating due-cards badge on branches

**Sequential mode (deck study):**
- Classic Anki-style modal: show front → tap to flip → rate
- **Deck scoping** (matches Anki behavior):
  - Study a single deck (leaf deck — only its own cards)
  - Study a parent deck (includes its own cards + all children/subdeck cards, recursively)
  - Study all decks (master study — all due cards across the entire collection)
- Cards drawn from the selected scope regardless of source note
- Entry: sidebar dashboard (click any deck or "Study All"), command palette

### 4. Mobile Feasibility — Validated

**Verdict: FEASIBLE.** SVG + foreignObject rendering in Obsidian's mobile WebView is proven and viable.

**Key findings:**
- Obsidian mobile uses **Capacitor.js** wrapping native WebViews: **WKWebView on iOS** (Safari engine), **Android System WebView** (Chromium-based) on Android
- **markmap** (in `ref/markmap/`) already demonstrates SVG + foreignObject + d3-zoom working in production — this is exactly our architecture
- Multiple community plugins ship with `isDesktopOnly: false` and do heavy custom rendering: Map View (Leaflet.js), Maps/Bases (Leaflet), Excalidraw (Canvas). All work on mobile.
- **d3-zoom natively supports touch** — pinch-to-zoom, single-finger pan, tap on elements all work out of the box
- `Platform.isMobile` / `Platform.isPhone` APIs available for mobile-specific adaptations

**foreignObject gotchas (all solvable):**
- Must set explicit `width` and `height` (no auto-sizing) — markmap already shows the measurement pattern
- CSS inheritance inside foreignObject can differ between Safari and Chromium — scope styles to `.markmap` class
- Touch event propagation: stop propagation on touch events within our view to prevent conflicts with Obsidian's swipe navigation (Map View shows this pattern in `mapContainer.ts`)
- Text can appear blurry at extreme zoom on some devices — use `will-change: transform` on SVG container

**Performance tiers:**
- **≤500 nodes**: 60fps on all supported devices, viewport culling active but no special optimizations needed
- **500–1,000 nodes**: Viewport culling mandatory + collapsed branches by default for deep trees
- **1,000–2,000 nodes**: Level-of-detail rendering (abbreviated labels when zoomed out) + progressive disclosure
- **2,000–5,000 nodes**: DOM virtualization — off-screen nodes removed from DOM and re-added on scroll (Obsidian Canvas pattern)
- **5,000+ nodes**: All of the above + consider Web Worker for layout computation to keep main thread free

**Decision: Set `isDesktopOnly: false` in manifest.json from day one. Mobile is first-class.**

### 5. Transclusion: Confirmed v1 (Core Competitive Advantage)

Transclusion (embedding `![[linked-note]]` or `![linked-note](path)` as a sub-branch in the parent mind map) is **confirmed as a v1 must-have**. This is a core competitive advantage that sets Osmosis apart from all existing mind mapping software.

**Implementation requirements for v1:**
- `![[linked-note]]` or `![linked-note](path)` renders the linked note's entire heading/bullet tree as a sub-branch (both wikilink-style and markdown-style embeds are supported)
- Cycle detection: A embeds B embeds A → detected at tree construction time, broken with a visual indicator ("circular reference")
- Lazy loading: collapsed transclusion branches don't parse the embedded file until expanded
- Edit propagation: editing a transcluded node writes to the source file (the embedded note), not the parent
- Visual distinction: transcluded branches have a subtle indicator (icon or border style) showing they come from another file
- Performance: see transclusion targets above (10 embeds < 50ms, 50 embeds < 200ms, 100 embeds < 500ms)

### 6. Image Occlusion Library: Fabric.js v6

**Decision: Use Fabric.js v6** for the image occlusion editor.

**Rationale (in priority order):**

1. **Anki uses Fabric.js** (v5.3) for its image occlusion editor. The entire reference implementation is in `ref/anki/ts/routes/image-occlusion/`. Using the same library makes Anki SVG mask import/export dramatically easier — same shape primitives, same serialization format, `loadSVGFromString()` / `toSVG()` work natively.

2. **SVG is the interchange format.** Osmosis stores masks as SVG in `.osmosis/masks/`. Fabric.js has native `toSVG()` and `loadSVGFromString()`. Konva.js has **no SVG support at all** — it renders to `<canvas>` only. With Konva, we'd need to build and maintain a custom SVG serialization layer from scratch.

3. **The bundle size difference is manageable.** Fabric.js v6: ~90 KB gzipped. Konva.js: ~45 KB gzipped. The extra 45 KB is acceptable given the engineering time saved by sharing Anki's library choice.

4. **Fabric.js v6 is modernized.** Proper ESM modules, built-in TypeScript support (no more `@types/fabric`), better tree-shaking, dropped legacy browser support. Since Obsidian uses modern Chromium, v6 is the right version.

**Konva.js advantages we're declining:**
- Better mobile touch support (mitigated: use HammerJS ~7KB alongside Fabric, as Anki does)
- Smaller bundle (mitigated: 45KB difference is not the deciding factor)
- Cleaner API (mitigated: isolate Fabric behind a `MaskEditor` abstraction, as Anki does with `MaskEditorAPI`)
- Built-in snap/transform tools (mitigated: Anki's alignment code can be adapted)

**Other libraries considered and rejected:**
- Paper.js (~220 KB, less maintained, no TypeScript)
- Rough.js (hand-drawn style only, no editor)
- Plain Canvas API (months of work to build selection, resize, hit testing)
- SVG.js (no interactive drawing editor)
- Two.js (weak interactive editing)

**Implementation approach** (adapted from Anki's architecture in `ref/anki/ts/routes/image-occlusion/`):
- Shape model: abstract shape classes (Rect, Ellipse, Polygon) with normalized coordinates (0-1) for storage
- Tool system: separate modules per tool (rect draw, ellipse draw, select/move, zoom/pan)
- Undo/redo: JSON state stack via `canvas.toJSON()` / `canvas.loadFromJSON()`
- SVG export: `canvas.toSVG()` for Anki-compatible output
- Mobile: HammerJS for pinch-zoom alongside Fabric's pointer events

**Note: Image occlusion is scoped for v1.1, not MVP. This decision locks the library choice for when we get there.**

---

## Next Steps

- [x] Initial brainstorm and ideation
- [x] Mind Map ideation session (2026-02-24)
- [x] Flashcard / Spaced Repetition ideation session (2026-02-26)
- [x] Explicit Card Syntax & Card Type Expansion ideation session (2026-02-27)
- [x] Anki Import/Export ideation session (2026-02-28)
- [x] MVP Definition, Performance Targets & Gap Resolution session (2026-02-28)
- [ ] Final review of inspiration doc
- [ ] Move to Requirements phase — generate PRD

---

## Notes

- See `notes/00_inspiration/card_authoring_example.md` for a worked example of gutter indicators and the "Cards in this note" panel
- Reference repos studied: `ref/decks`, `ref/obsidian-spaced-repetition`, `ref/image-occlusion-enhanced`, `ref/anki` (import/export formats)
- Mobile feasibility validated via: `ref/markmap` (SVG+foreignObject proof), `ref/obsidian-map-view` (mobile touch patterns), `ref/obsidian-maps` (first-party mobile plugin), `ref/obsidian-api` (Platform detection APIs)
