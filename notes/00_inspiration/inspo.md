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

- Is it possible to build an entire mind map viewer/editor in Obsidian?  or would this be trying to fit a jet engine inside a Toyota Prius?
- Does it make sense to "power" the mind map viewer/editor via Obsidian Bases?  I don't want to be constrained by that system if it limits our ability to achieve feature parity with Xmind. 

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
- Rendering `![[linked-note]]` as a sub-branch in the parent map is a must-have.
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
- **Embedded/transclusion mind maps**: `![[linked-note]]` renders as a sub-branch. Recursive, with cycle detection and lazy-loading.

### Must-Have Features
- Custom mind map engine (SVG + foreignObject hybrid rendering)
- Mind Map view (with direction/side toggles) and Timeline view
- Bidirectional markdown ↔ mind map sync with incremental parsing
- Embedded/transclusion mind maps (`![[]]` renders linked notes as sub-branches)
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
- **Reference repos in `/ref/`**: Markwhen Parser (parser architecture), Markwhen Timeline (timeline view), Markmap (mind map rendering inspiration), obsidian-spaced-repetition, Decks, obsidian-sample-plugin, Anki source, Minder

---

## Scope Reality Check

*Early thinking about scope: Is this a weekend project, a month-long effort, or something larger?*

**Rough Time Estimate**: 

**Known Scope Creep Risks**: 

**Ways to Start Small**: 

---

## Next Steps

- [ ] Review this inspiration doc one more time
- [ ] Identify the core value proposition (what's the smallest version that still creates value?)
- [ ] Schedule Claude conversation to generate PRD
- [ ] Move to Requirements phase

---

## Notes

[Add any additional thoughts, references, or context that doesn't fit elsewhere]
