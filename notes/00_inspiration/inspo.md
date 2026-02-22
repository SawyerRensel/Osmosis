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

*Paste relevant excerpts from your initial Claude conversation here, or note key insights Claude provided.*

### Conversation Summary
[What did Claude help clarify? What insights shifted your thinking?]

### Key Takeaways
- 
- 

### Refined Understanding
[Based on the conversation, what's your updated understanding of the problem or opportunity?]

---

## Feature Brainstorm

*What are the possible features or capabilities? Claude is great at "what could this include?" conversations. Capture those ideas here.*

### Xmind Feature Parity Checklist

*Go through each feature and mark: [x] must-have, [~] nice-to-have, or [N/A] not applicable for Osmosis. Leave [ ] for undecided.*

#### Map Structures
- [x] Mind Map (classic radial branching)
- [x] Logic Chart
- [x] Brace Map
- [x] Org Chart
- [x] Fishbone Diagram (cause-and-effect)
- [ ] Timeline
- [ ] Tree Chart
- [ ] Tree Table (nested rectangles, subtopics horizontal)
- [ ] Matrix

#### Topic Types
- [x] Central Topic (root node)
- [x] Main Topic (first-level branches)
- [x] Subtopic (deeper branches)
- [x] Floating Topic (unconnected node placed anywhere)
- [x] Summary Topic (generated from summary element)

#### Topic Elements
- [ ] Relationship lines (connect two related topics with customizable line style, color, arrow, text)
- [ ] Boundary (visual frame around a group of topics to highlight/emphasize)
- [ ] Summary (condense multiple topics into a summary annotation)
- [ ] Notes (rich text attached to a topic — bold, italic, underline, lists)
- [ ] Labels (text tags on topics for classification)
- [ ] Markers/Icons (priority flags, progress indicators, task status icons)
- [ ] Stickers/Illustrations (decorative images from a built-in library)
- [ ] Images (insert custom images into topics)
- [ ] Links (web URLs or internal file links attached to topics)
- [ ] Audio notes (record audio attached to a topic)
- [ ] Document attachments (attach files to topics)
- [ ] LaTeX equations (render math/chemistry formulas in topics)
- [ ] Numbering (automatic numbering styles for topics)
- [ ] Task/To-do checkboxes (turn topics into trackable tasks)
- [ ] Comments (collaborative annotations on nodes)

#### Topic Editing
- [ ] Add child topic (Tab)
- [ ] Add sibling topic (Enter)
- [ ] Drag-and-drop repositioning
- [ ] Branch collapsing/expanding
- [ ] Rich text formatting within topics (bold, italic, colors, etc.)
- [ ] Topic shape customization

#### Styling & Theming
- [ ] Theme library (pre-built color schemes)
- [ ] Smart Color Themes (auto-generated palettes)
- [ ] Theme Editor (create custom themes)
- [ ] Custom font selection
- [ ] Layout/structure adjustment per branch
- [ ] Topic shape styling (rounded, rectangle, etc.)
- [ ] Branch line styling (curved, straight, etc.)
- [ ] Legend (key explaining markers/icons used in the map)

#### View Modes
- [ ] Standard mind map view
- [ ] Outliner mode (hierarchical list view, switchable to/from map)
- [ ] Zen Mode (distraction-free full-screen editing)
- [ ] Pitch Mode (auto-convert map to slide deck with transitions)

#### Navigation & Filtering
- [ ] Navigation panel
- [ ] Filter by topic content
- [ ] Filter by notes
- [ ] Filter by markers/labels
- [ ] Search within map
- [ ] Navigate/jump to specific topic

#### File & Export
- [ ] Export to PNG
- [ ] Export to SVG
- [ ] Export to PDF
- [ ] Export to Markdown
- [ ] Export to Word
- [ ] Export to Excel
- [ ] Export to PowerPoint
- [ ] Export to OPML
- [ ] Export to TextBundle
- [ ] Import from Markdown
- [ ] Import from OPML
- [ ] Import from FreeMind
- [ ] Import from MindManager
- [ ] Multi-sheet files (multiple maps in one file)
- [ ] Map Shot (capture/screenshot of map region)
- [ ] Batch export
- [ ] Password protection

#### Collaboration
- [ ] Share via link
- [ ] Real-time co-editing
- [ ] User avatars/cursors showing active editors
- [ ] View-following (follow another user's view)
- [ ] Node-level comments
- [ ] Task assignment to team members
- [ ] Deadline/priority assignment
- [ ] Version history

#### AI Features
- [ ] Text/URL/PDF to mind map generation
- [ ] AI brainstorming / idea expansion
- [ ] AI-driven map reorganization/summarization
- [ ] AI content refinement
- [ ] AI language translation

#### Platform & Performance
- [ ] Desktop (Windows, macOS, Linux)
- [ ] Mobile (iOS, Android)
- [ ] Web version
- [ ] Offline functionality
- [ ] Cloud sync across devices
- [ ] Keyboard shortcuts throughout

### Must-Have Features
- 
- 

### Nice-to-Have Features
- 
- 

### Future Possibilities
- 
- 

---

## Technology Thoughts

*Initial ideas about tech stack, language, or platforms. These are rough and will be refined in Planning phase.*

- 
- 

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
