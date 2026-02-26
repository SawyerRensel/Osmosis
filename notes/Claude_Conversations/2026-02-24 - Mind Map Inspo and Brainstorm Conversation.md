## User

Hey, Claude.  I have an idea for a new Obsidian plugn I call "Osmosis": 'Absorb information better and faster with unified notes, flashcards, and mind mapping'.  Right now I'm in the inspiration phase.  Would you get familiar with `CLAUDE.MD` and then check out my `inspo.md` so we can continue to ideate?

## Assistant



I'll read through those files now.

**Tool Call: Read /home/sawyer/Osmosis/notes/00_inspiration/inspo.md**
Status: Completed

```
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
```

## Assistant

Great stuff — I've read through both `CLAUDE.md` and `inspo.md`. You've got a really compelling vision here. Let me share some thoughts and questions to help push the ideation forward.

**What stands out to me:**

The core insight — that notes, mind maps, and flashcards are three views of the *same knowledge* — is powerful. Most tools treat these as separate workflows. Osmosis would let you author once and study in multiple modes. That's the real value prop.

**Some thoughts on what you've captured:**

1. **Mind map as editor, not just viewer** — This is ambitious but is what would set Osmosis apart. Editing nodes that write back to markdown means the mind map is a first-class authoring mode, not a read-only visualization. That's a big differentiator from `obsidian-mind-map` and similar plugins.

2. **Embedded mind maps (`![[]]` transclusion)** — This is genuinely novel. I haven't seen another tool do recursive/nested mind maps like you're describing with the Animals/Cats/Dogs example. It plays perfectly with Obsidian's linking philosophy.

3. **"Zero-effort" card generation** — The idea that `==highlights==`, `**bold**`, headings, and even linked notes become flashcard material *without extra markup* is a huge friction reducer. The obsidian-spaced-repetition plugin requires explicit card syntax; yours could work with what people already write.

4. **Bases for mind mapping** — I'd be cautious here. Bases is optimized for tabular/structured data. A mind map is fundamentally a tree/graph, and forcing it through Bases might constrain the rendering and interaction model. Worth prototyping, but I'd keep it as an option rather than a foundation.

**Questions to explore further:**

- **Scope priority**: If you had to ship v0.1 with just *one* of {mind mapping, spaced repetition, zero-effort cards}, which would you pick? This might help identify the core wedge feature.
- **Markmap as a starting point**: Markmap renders markdown-to-mindmap well, but its editing capabilities are limited. Are you thinking of forking/extending it, or building a custom renderer? This is probably the biggest technical decision.
- **SR data storage**: Frontmatter per-note is clean and user-visible, but it could get noisy for notes with many cards (e.g., 20 cloze deletions from one note). A hybrid approach — frontmatter for note-level metadata, a centralized store for per-card scheduling data — might balance visibility with practicality.
- **Mobile**: How important is mobile for v1? Obsidian mobile has real constraints (no Canvas API in some contexts, performance limits). Scoping mobile as "study mode works, editing is desktop-first" could simplify things significantly.

What would you like to dig into first?

## User

- **Scope priority**: If you had to ship v0.1 with just *one* of {mind mapping, spaced repetition, zero-effort cards}, which would you pick? This might help identify the core wedge feature.

> We can't build one in isolation without the other.  This is a unified, interdependent system where the functionality of one affects the other. 

- **Markmap as a starting point**: Markmap renders markdown-to-mindmap well, but its editing capabilities are limited. Are you thinking of forking/extending it, or building a custom renderer? This is probably the biggest technical decision.

> I'm open to either forking or simply using it as an inspiration.  If we have to build our own "engine" that we would publish and version control separately, I'm open to that as well.

- **SR data storage**: Frontmatter per-note is clean and user-visible, but it could get noisy for notes with many cards (e.g., 20 cloze deletions from one note). A hybrid approach — frontmatter for note-level metadata, a centralized store for per-card scheduling data — might balance visibility with practicality.

> Good idea.

- **Mobile**: How important is mobile for v1? Obsidian mobile has real constraints (no Canvas API in some contexts, performance limits). Scoping mobile as "study mode works, editing is desktop-first" could simplify things significantly.

> Mobile is important.  Mobile and Desktop are both considered first-class citizens for Studying and Editing modes.

## Assistant



Good answers — these sharpen the vision a lot. Let me react to each and then push further.

**On the unified system:** You're right that these aren't independent features. The mind map *is* the note *is* the flashcard material. That said, you'll still need to build them in some sequence — the question becomes "what's the thinnest vertical slice that demonstrates the unified concept?" Maybe something like: a single markdown note with headings and highlights renders as a mind map, and you can enter study mode where nodes get hidden for recall. That touches all three pillars without fully building any one of them.

**On the mind map engine:** This is the highest-risk technical decision. A few considerations:

- **Markmap** is a rendering library (markdown → SVG mind map). It's good at layout but has no editing, no node interaction, no animation for study mode. You'd be bolting a lot onto it.
- **Building custom** gives you full control over editing, study-mode node hiding, transclusion rendering, and mobile performance — but it's a much larger undertaking.
- A middle path: use Markmap's *layout algorithm* (tree positioning math) but build your own rendering and interaction layer. You get good node placement without being locked into its SVG output.

**On hybrid SR storage:** Glad that resonates. To sketch it out: frontmatter could hold note-level flags like `sr-enabled: true` and maybe deck tags, while a `.osmosis/` data folder (or single JSON file) holds per-card scheduling state keyed by a stable card identifier (e.g., `noteId:heading:clozeIndex`). This keeps notes clean and SR data manageable.

**On mobile as first-class:** This is a strong stance and it has real implications. It probably rules out Canvas API and any heavy DOM manipulation approaches. SVG or a lightweight rendering approach (maybe even a simple CSS-driven tree for mobile with a richer experience on desktop?) would help. Worth thinking about whether the mobile mind map needs to be *identical* to desktop or just *functional*.

**Next questions to dig into:**

1. **Editing in mind map mode** — When you add a node in the mind map, what happens in the markdown? A new bullet under the parent heading? A new heading? How deep does the heading-to-node mapping go before it switches to bullets?
2. **What does "feature parity with Xmind" actually mean to you?** Xmind has dozens of features (themes, stickers, relationships, boundaries, summaries, slide-based presentations...). Which Xmind features do you *actually use* and would miss?
3. **Study mode interaction** — When studying a mind map, do you envision it as a sequential card-by-card flow (like Anki) or a spatial exercise where you're looking at the map and filling in blanks in-place?

## User

1. If the user prefixes a new node with hashtags, add the corresponding heading.  If a user prefixes with a hyphen, treat a new node like a bulleted list.  If a user prefixes with a number, treat like an ordered list.  If a user doesn't prefix with anything, treat as a new paragraph.  I like the idea of the mind map having a "source mode" toggle like Obsidian and the editing experience to match one to one in Markdown. 

2. Would you study the Xmind docs and create a Markdown checklist of all the features you can find, and I can go down through and check which ones I need-to-have vs. nice-to-have?

3. Spatial exercise when launching study mode from Mind Map.  Sequential exercise when launching study mode from Obsidian editor.

## Assistant



On #1 — that's a clean mapping. So the mind map node type is driven by markdown syntax, and there's a 1:1 correspondence. The "source mode" toggle is smart — you could even do a split view (map on one side, markdown on the other) where edits in either side sync live.

On #3 — that's a great distinction. The study *mode* adapts to the study *context*. Spatial recall when you're in the map (fill in the blanks on the tree), sequential Anki-style when you're in the editor. Same SR engine underneath, different UX.

On #2 — let me go through the Xmind docs now.

**Tool Call: Fetch https://xmind.com/user-guide**
Status: Completed

# Mind Mapping Tutorial Features & Capabilities

Based on the webpage content provided, this appears to be a **Framer-built landing page** for a "Complete Mind Mapping Tutorial for Beginners." However, the HTML/CSS code shared consists primarily of styling, font declarations, and layout structure rather than detailed feature descriptions.

## Observable Elements:

**Layout & Design:**
- Responsive design (supports 1440px, 1120px, 520px, and mobile breakpoints)
- Navigation sidebar with scrollable content (85vh height)
- Grid-based layout system with flexible components
- Custom font stack (NeverMind, Inter, Patua One, Fragment Mono)

**Visual Structure:**
- Hero section with typography hierarchy
- Multi-column content layout
- Card-based component system
- Overlay navigation system (fixed positioning)

**Technical Features:**
- Google Analytics integration (GA-Q6GYPWTE4B)
- Framer editor integration capabilities
- CSS custom properties for theming
- Support for light/dark color tokens

## Limitation:

The provided content is **primarily front-end styling code** without explicit descriptions of mind mapping features (like node creation, branching, export formats, collaboration tools, etc.). To comprehensively list actual functionality, the page's body content or documentation would be needed.

**Tool Call: Fetch https://xmind.com/user-guide/topics**
Status: Failed

```
Request failed with status code 404
```

**Tool Call: "Xmind features complete list site:xmind.com user guide"**
Status: Completed

Web search results for query: "Xmind features complete list site:xmind.com user guide"

Links: [{"title":"Complete Mind Mapping Tutorial for Beginners","url":"https://xmind.com/user-guide"},{"title":"Xmind Features: Visual Mind Mapping, AI & Team Collaboration","url":"https://xmind.com/features"},{"title":"Power User Techniques & Hidden Features","url":"https://xmind.com/user-guide/advanced-features"},{"title":"The Ultimate Guide to Mind Mapping with Xmind","url":"https://xmind.com/blog/the-ultimate-guide-to-mind-mapping-with-xmind"},{"title":"Essential Mind Mapping Skills & Core Features","url":"https://xmind.com/user-guide/xmind-basics"},{"title":"Quick Start Guide - Create Your First Mind Map","url":"https://xmind.com/user-guide/getting-started"},{"title":"What Is Xmind? - Xmind","url":"https://xmind.com/user-guide/intro-new"},{"title":"AI Assistant Guide - Automate Your Brainstorming","url":"https://xmind.com/user-guide/xmind-ai"},{"title":"Import, Export & Manage Mind Map Files","url":"https://xmind.com/user-guide/working-with-files"},{"title":"Learn and Master Xmind: Tutorials, Workflows, and Real-World Use Cases","url":"https://xmind.com/academy"}]

Here are the search results for **"Xmind features complete list site:xmind.com user guide"**:

## Xmind Features & User Guide Overview

### What Is Xmind?
Xmind is a full-featured mind mapping and brainstorming tool that effectively helps you clear your mind and generate ideas. With a refined design, smooth operation, powerful functions, and years of evolution, it provides the ultimate user experience.

### User Guide Categories
The Xmind User Guide (at [xmind.com/user-guide](https://xmind.com/user-guide)) is organized into these sections:
It offers step-by-step guides to master every Xmind feature — from basic maps to advanced techniques. The guide covers:
Getting Started, Xmind Basics, Enriching a Topic, Styling Mind Maps, Applying Global Format, Browsing and Viewing, Working with Files, Sharing and Collaborating, Managing Your Team, Mind Mapping with Xmind AI, and Exploring Advanced Features.

### Core Features
- Xmind provides 9 mind mapping structures, abundant templates and color themes, beautiful stickers and illustrations, and powerful features such as Pitch Mode, ZEN Mode, and Outliner.
- Xmind is available on macOS, Windows, iOS, iPadOS, Android, and Linux versions and adapts to various devices.
- You can tag topics with labels for better classification and expand topics with notes for detailed explanations.
- Turn mind maps into trackable to-do lists and highlight key points with markers.
- Quickly redirect to web pages for online resources and navigate to specific topics for increased efficiency.

### Advanced Features
- Xmind provides an excellent way to organize your thoughts for lists, notes, idea organizing, and project management. Switching between Outliner mode and Mind Map mode helps more efficiently organize and sort ideas.
- Xmind's ZEN Mode offers a distraction-free environment, stripping away excess interface elements for focused work.
- Xmind's Quick Entry feature enables you to jot down ideas instantly without needing to open the application first, with quick conversion of notes into a structured mind map with just a click.
- Map Shot is a feature designed to help users easily capture and enhance the appearance of their mind maps.

### AI Features
- Xmind AI turns your mind map into a clear to-do list, helping you manage and track tasks effortlessly. Just select "To-Do" under Create with AI, and watch your ideas turn into actionable steps.
- Instantly generate project plans, timelines, and task lists with Xmind AI — upload materials and get prioritized steps in minutes.

### File Import/Export
- Xmind currently supports exporting PNG, SVG, PDF, Excel, Word, OPML, TextBundle, PowerPoint, Markdown, and other file formats, and you can also share mind maps with others by email.
- Xmind supports setting passwords for your files for absolute privacy protection.
- Xmind supports converting Markdown files or Markdown text into mind maps.

### Collaboration
- Xmind allows multiple people to brainstorm, add notes, and refine ideas together in real time, so teams stay aligned and productive.
- Xmind's cloud sync feature allows easy access to your maps across devices, making it simple to collaborate with teammates remotely.

### Pricing
You can download Xmind for free and explore core features right away. Premium features like AI Mindmap and advanced project management are available on paid plans.

For the full, detailed user guide, visit: **[xmind.com/user-guide](https://xmind.com/user-guide)**


REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.

**Tool Call: Fetch https://xmind.com/features**
Status: Completed

# Xmind Features and Capabilities Inventory

Based on the webpage content provided, here is the comprehensive list of features and tools mentioned:

## Primary Features
- **Visual Mind Mapping** - Core capability for creating mind maps
- **AI Integration** - Artificial intelligence features (specific applications not detailed in visible content)
- **Team Collaboration** - Multi-user collaborative functionality

## Technical Infrastructure
The page contains extensive CSS styling and font definitions suggesting:
- Responsive design across multiple breakpoints (mobile, tablet, desktop)
- Custom typography system with multiple font families (NeverMind, Inter, Fragment Mono, Patua One, Sedgwick Ave)
- Advanced layout system with flexbox arrangements
- Color token system for theming

## Analytics & Tracking
- Google Analytics integration ("G-Q6GYPWTE4B" tracking ID)
- Data layer implementation for event tracking

## Design Components
The CSS reveals support for:
- Gradient backgrounds
- Responsive containers
- Border and corner styling options
- Text formatting with multiple weight/style options
- Aspect ratio support for media elements
- Overflow handling capabilities

## Platform Details
- Built on Framer technology (evident from CSS class naming)
- Supports multiple device sizes and orientations
- Accessibility features for text rendering

**Note:** The visible HTML/CSS content emphasizes design and layout infrastructure rather than detailed feature descriptions. A complete feature list would require access to actual page content and product documentation.

## Assistant

The features page isn't rendering its content well for scraping. Let me hit the specific user guide sections to get the real details.

**Tool Call: Fetch https://xmind.com/user-guide/xmind-basics**
Status: Completed

# XMind Features and Capabilities

Based on the webpage content provided, I can identify the following about XMind:

## Core Offering
The page title indicates **"Essential Mind Mapping Skills & Core Features,"** suggesting XMind is a mind mapping tool focused on fundamental capabilities.

## Observable Elements
The content appears to be a Framer-built website with:
- Navigation structure with scrollable sidebar content
- Feature cards with images (aspect ratio 1.81951)
- Text hierarchies using custom fonts (NeverMind font family in various weights)
- Responsive design supporting mobile, tablet, and desktop breakpoints
- Interactive components suggesting an educational or product showcase layout

## Limitations of Available Data
Unfortunately, the provided HTML/CSS code contains primarily **styling and structural markup** rather than actual feature descriptions. The substantive content about XMind's specific capabilities, tools, and features is not visible in the provided source material—only the page framework and design system are present.

To provide a comprehensive list of XMind features, I would need the actual text content describing the mind mapping tool's functionality, which isn't included in this technical markup.

**Tool Call: Fetch https://xmind.com/user-guide/advanced-features**
Status: Completed

# Features, Tools, and Capabilities

Based on the page content, this appears to be a Framer-built website about "Power User Techniques & Hidden Features." However, the provided HTML is primarily composed of:

## Technical Infrastructure
- **Font System**: Multiple custom fonts including Fragment Mono, Patua One, Sedgwick Ave, NeverMind family (Extrabold, DemiBold, Bold, Medium, Regular, ExtraLight, Hand Bold), and Inter
- **Analytics**: Google Analytics integration (GA-Q6GYPWTE4B)
- **Design Framework**: Framer platform with responsive design capabilities

## Design/Layout Elements
- Responsive breakpoints for multiple screen sizes (mobile, tablet, desktop up to 1440px)
- Custom CSS variables for theming and styling
- Typography presets with varying font weights and sizes
- Text styling capabilities (color, decoration, alignment, transformation)
- Border and spacing systems

## Notable Mentions
The page title references "Power User Techniques & Hidden Features," suggesting the site covers:
- Advanced feature documentation
- Hidden capabilities guidance
- User optimization tips

**Note**: The actual content describing specific features and tools appears to be dynamically loaded or not fully captured in this HTML dump. The excerpt primarily contains stylesheet and infrastructure code rather than descriptive feature content.

**Tool Call: Fetch https://xmind.com/blog/the-ultimate-guide-to-mind-mapping-with-xmind**
Status: Completed

I appreciate your request, but I need to be transparent about what I can extract from the provided content.

The web page content you've shared appears to be primarily **CSS styling code, font definitions, and HTML structure markup** from a Framer-built website. The actual textual content about Xmind features is extremely limited in this raw HTML/CSS dump.

From what's visible in the provided material, I can only identify:

**Title mentioned:** "The Ultimate Guide to Mind Mapping with Xmind"

Unfortunately, the substantive content describing Xmind's features, capabilities, tools, modes, and structure types is not present in the code you've provided. The document consists almost entirely of:

- Font-face declarations (@font-face rules)
- CSS class definitions and styling rules
- Layout and flexbox configurations
- Color token variables
- Google Analytics setup
- HTML/CSS framework code for Framer

**To provide the comprehensive inventory you're requesting, I would need:**
- The actual page text content (not just styling markup)
- The body copy describing Xmind's functionality
- Feature descriptions and capability lists

Could you provide the extracted text content from the webpage rather than the raw HTML/CSS markup? That would allow me to deliver the thorough feature inventory you need.

## Assistant

The Xmind site is heavily JavaScript-rendered, so the content isn't accessible through direct fetching. Let me try a different approach — searching for comprehensive Xmind feature breakdowns and also checking their documentation more directly.

**Tool Call: "Xmind complete feature list all capabilities mind mapping structures topics labels markers boundaries relationships summary notes"**
Status: Completed

Web search results for query: "Xmind complete feature list all capabilities mind mapping structures topics labels markers boundaries relationships summary notes"

Links: [{"title":"Xmind Features: Visual Mind Mapping, AI & Team Collaboration","url":"https://xmind.com/features"},{"title":"Xmind Review 2026: Pricing, Features & Alternatives","url":"https://work-management.org/project-management/xmind-review/"},{"title":"XMind Features & Capabilities | GetApp","url":"https://www.getapp.com/collaboration-software/a/xmind-1/features/"},{"title":"XMind - Wikipedia","url":"https://en.wikipedia.org/wiki/XMind"},{"title":"Xmind: The Best AI Brainstorming & Mind Mapping Tool","url":"https://app.xmind.com/"},{"title":"What's New - Xmind - Mind Mapping App","url":"https://xmind.app/whats-new/"},{"title":"Xmind - Mind Mapping App","url":"https://xmind.app/mindmapping/"},{"title":"XMind Review: An All-In-One Brainstorming Tool","url":"https://mindmappingsite.com/mindmapping-software/xmind-review/"},{"title":"Power User Techniques & Hidden Features","url":"https://xmind.com/user-guide/advanced-features"},{"title":"Complete Mind Mapping Tutorial for Beginners","url":"https://xmind.app/user-guide/xmind/"}]

Based on the web search results, here's a comprehensive overview of XMind's complete feature list and capabilities:

## Core Mind Mapping Features

XMind offers 10 professionally-designed map structures like fishbone, timeline, and others, with the ability to switch between structures with a single click and combine multiple structures on one branch.

## Topic Elements & Organization

Topic elements include relationship, summary, boundary, note, label, sticker, image, and more. More specifically:

- Tag topics with labels for better classification and expand topics with notes for detailed explanations
- Turn mind maps into trackable to-do lists and highlight key points with markers
- Use Relationship to connect two relevant ideas with customizable line style and text description, and add a conclusion or recap to a group of ideas using a Summary

## Visual & Content Features

- 310 AI original illustrations to visualize concepts with the ability to search for illustrations by entering keywords
- Rich text styles within topics to emphasize information and improve readability, with numbering styles for organization
- Insert unlimited images directly into your mind map
- LaTeX command allows you to present mathematical and chemical formulas

## Presentation & View Modes

- Pitch Mode automatically converts your mind map into a slide deck where each branch becomes a slide, complete with smooth transitions, perfect for client presentations or team briefings
- Zen Mode provides a full-screen view that removes interface distractions, letting you focus entirely on brainstorming
- Outliner allows you to switch from a visual map to a structured list view, ideal for turning your mind map into an agenda or task list

## Collaboration Features

The Premium plan unlocks true collaborative editing where multiple users can work on the same map simultaneously, follow each other's view, and comment directly on nodes.

## AI Capabilities

Turn text, files, videos, or links into structured maps, co-edit with AI to expand, refine, and restructure content live, with built-in brainstorming sessions and auto map polish.

## Platform Availability

Xmind is available on desktop (Windows, macOS, Linux), mobile (iOS, Android), and web, so you can access your ideas anywhere, anytime.


REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.

**Tool Call: Fetch https://xmind.app/user-guide/xmind/**
Status: Completed

REDIRECT DETECTED: The URL redirects to a different host.

Original URL: https://xmind.app/user-guide/xmind/
Redirect URL: https://xmind.com/user-guide
Status: 301 Moved Permanently

To complete your request, I need to fetch content from the redirected URL. Please use WebFetch again with these parameters:
- url: "https://xmind.com/user-guide"
- prompt: "List every single feature, capability, tool, structure type, topic element, styling option, view mode, and functionality mentioned anywhere on this page. Be exhaustive. I need a complete inventory of everything Xmind can do."

**Tool Call: Fetch https://work-management.org/project-management/xmind-review/**
Status: Completed

# Comprehensive List of Xmind Features and Capabilities

## Map Structures
- Mind Map
- Logic Chart
- Brace Map
- Org Chart
- Fishbone Diagram
- Timeline
- Tree Chart
- Tree Table
- Matrix

## Core Features
- "Unlimited topics, maps, and structures" (Free plan)
- Professionally designed templates
- Theme library with color schemes
- Shape insertion
- Sticker placement
- Image insertion
- Audio note recording
- Link attachment (web pages and local files)
- Document attachment
- LaTeX equation support
- Password protection for maps
- Map-wide styling application

## AI Capabilities (Xmind AI)
- Text-to-map generation from sentences, web links, PDFs, or documents
- Brainstorming hub with idea-generation modes
- Concept suggestion and branch expansion
- Map reorganization and summarization
- Language switching and translation
- Content refinement assistance
- AI-driven task generation

## Presentation & Focus Modes
- Pitch Mode (converts maps to slide decks automatically)
- Zen Mode (distraction-free full-screen view)
- Outliner view (hierarchical list format)
- Slide reordering capability
- Smooth transitions between slides

## Collaboration Features
- Asynchronous sharing via links
- Real-time co-editing (Premium plan)
- User avatars showing active editors
- View-following functionality
- Node-level comments
- Task assignment to team members
- Deadline setting
- Priority assignment
- Basic version history (3 days in Free plan)
- Extended version history (30 days in Premium plan)
- Team spaces

## Export Formats
- PNG
- SVG
- PDF
- Markdown
- Microsoft Word
- Excel
- OPML
- Textbundle
- Interactive HTML presentations
- Batch export capability

## Integrations
- Dropbox sync
- Google Drive sync
- Microsoft OneDrive sync
- iCloud sync
- Evernote connection
- Google Calendar export
- CSV file import/export
- Microsoft Office compatibility
- Google Workspace compatibility
- Calendar synchronization

## Import Capabilities
- Legacy Xmind version files
- MindManager format
- FreeMind format
- OPML files

## Project Management Elements
- Gantt chart view
- Task conversion from topics
- Calendar export functionality
- Deadline tracking
- Priority marking

## Customization Options
- Theme Editor
- Custom color scheme creation
- Font selection
- Layout adjustment
- Smart Color Themes with automatic palette generation
- Topic highlighting with boundaries
- Label addition
- Marker functionality (priority flags)
- Icon categorization

## Platform Support
- Windows desktop app
- macOS desktop app
- Linux desktop app
- iOS mobile app
- Android mobile app
- Web browser version (Xmind.works)
- Offline functionality

## Additional Capabilities
- Drag-and-drop topic placement
- Branch collapsing/expanding
- Node repositioning
- Keyboard shortcuts (Tab for child topics, Enter for siblings)
- Wallet walkthroughs for new users
- Map library and template access
- Multi-sheet file organization
- Rich content embedding
- File size optimization for large maps

**Tool Call: Fetch https://mindmappingsite.com/mindmapping-software/xmind-review/**
Status: Completed

# XMind Features and Capabilities from Review

## Core Mind Mapping Features
- **Topics and Subtopics**: Created via TAB and ENTER keyboard shortcuts
- **Notes**: "add more info to your subtopics as notes"
- **Icons and Stickers**: Accessible from top-right toolbar corner
- **Formatting Options**: Multiple styling capabilities mentioned throughout

## Visualization Structures ("Skeletons")
The review identifies seven distinct diagram types:
1. **Mind Map**: Traditional branching structure
2. **Logic Chart**: For logical reasoning visualization
3. **Timeline**: Chronological sequence representation
4. **Org Chart**: Organizational hierarchy display
5. **Fishbone**: "Cause-and-effect diagram" for problem analysis
6. **Matrix**: For comparative analysis
7. **Tree Table**: "nested rectangles" presenting "subtopics horizontally"

## Interface Modes
- **Standard View**: Full toolbar with all options
- **Outliner Mode**: "Topics and sub-topics organized into headings in linear fashion"
- **ZEN Mode**: Hides toolbars for distraction-free editing with keyboard shortcuts
- **Pitch Mode**: "generates presentations with animated transitions"

## Export Formats
PNG, PDF, Word, Excel, OPML, TextBundle, SVG

The review emphasizes ease-of-use and cross-platform compatibility but lacks detailed documentation of relationship connectors, boundaries, summaries, or advanced styling options.

**Tool Call: "Xmind boundary summary relationship topic elements how to use guide"**
Status: Completed

Web search results for query: "Xmind boundary summary relationship topic elements how to use guide"

Links: [{"title":"Xmind - Mind Mapping App","url":"https://beta.xmind.app/user-guide/xmind/relationship-boundary-and-summary/"},{"title":"Insert a Summary/Relationship – Xmind Support Forum","url":"https://support.xmind.net/hc/en-us/articles/900000773746-Insert-a-Summary-Relationship"},{"title":"Relationship - Xmind","url":"https://xmind.com/user-guide/relationship-new"},{"title":"Boundary - Xmind","url":"https://xmind.com/user-guide/boundary-new"},{"title":"Summary - Xmind","url":"https://xmind.com/user-guide/summary-new"},{"title":"XMind Help Center","url":"https://xmind-help.github.io/en/relationship.html"},{"title":"Topic - Xmind","url":"https://xmind.com/user-guide/topic-editing-new"},{"title":"What are boundaries and how can they increase the effectiveness of your mind maps? - Mind Mapping Software Blog","url":"https://mindmappingsoftwareblog.com/what-are-boundaries/"},{"title":"Essential Mind Mapping Skills & Core Features","url":"https://xmind.com/user-guide/xmind-basics"},{"title":"Extending XMind to Design-Thinking and Decision-Making","url":"https://jrdelisle.com/spatial_resources/JRD_XMind%20Tutorial_v14.pdf"}]

I found comprehensive information about Xmind's boundary, summary, relationship, and topic elements. Here's a guide to using these features:

## **Topics**

In Xmind, a topic refers to the central idea or concept around which the mind map is organized. Xmind includes Central Topic, Main Topic, Subtopic, Floating Topic, and Summary Topic.

## **Boundaries**

Boundaries serve as defined frames around subject matter and are utilized to underscore and spotlight the content within specific areas or to introduce unique concepts to the reader. By encasing these subjects within such 'bounding boxes', you can effectively annotate and emphasize them.

**How to add a boundary:**
- After selecting one or more topics, click Boundary in the toolbar to add
- After clicking on one or more topics, add boundary by clicking Boundary in Insert on the top menu bar

## **Relationships**

Relationship connects 2 related topics and you can change up the styles for line, color, arrow, text, and etc.

**How to add a relationship:**
- Select a topic or boundary, click Relationship in the toolbar, or choose Relationship from the Insert menu, then click on another topic to add successfully

## **Summary**

Summary are used to add summary text to selected topics, and can be utilized to condense multiple topics and ensure a more detailed description.

**How to add a summary:**
- After selecting one or multiple topics, click Summary in the toolbar to add
- After selecting one or multiple topics, click Insert > Summary in the menu bar to add


REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.

**Tool Call: "Xmind markers labels notes callout stickers images topic styling formatting all features"**
Status: Completed

Web search results for query: "Xmind markers labels notes callout stickers images topic styling formatting all features"

Links: [{"title":"Add Images, Notes & Links to Mind Map Topics","url":"https://xmind.com/user-guide/enrich-a-topic"},{"title":"Xmind Features: Visual Mind Mapping, AI & Team Collaboration","url":"https://xmind.com/features"},{"title":"How to Make the Best out of Icon in XMind?","url":"https://xmind.com/blog/how-to-make-the-best-out-of-icon-in-xmind"},{"title":"XMind Help Center","url":"https://xmind-help.github.io/en/marker.html"},{"title":"How to add my own markers/clip arts into XMind 8 Pro? – Xmind Support Forum","url":"https://support.xmind.net/hc/en-us/articles/360028232572-How-to-add-my-own-markers-clip-arts-into-XMind-8-Pro"},{"title":"How to add custom Stickers / Markers – Xmind Support Forum","url":"https://support.xmind.net/hc/en-us/community/posts/900003292943-How-to-add-custom-Stickers-Markers"},{"title":"Xmind Markers Markers are image icons used to represent spec | All About Seeds | Carpe Diem Ardeche","url":"https://www.carpediem-ardeche.com/group/all-about-seeds/discussion/be918169-8e84-4fab-810e-5f2d42f1eff2"},{"title":"Sticker and Illustration - Xmind - Mind Mapping App","url":"https://xmind.app/user-guide/xmind/sticker-illustration-new/"},{"title":"Use Navigation Panel to Filter Your Mind Map Information","url":"https://xmind.com/blog/use-navigation-panel-to-filter-your-mind-map-information"},{"title":"Marker - Xmind","url":"https://xmind.app/user-guide/xmind/marker-new/"}]

Based on the search results, here's a comprehensive overview of XMind's features for enriching mind maps:

## Markers and Labels

Markers serve as an instrumental tool in schedule planning and project management for mind maps, effectively highlighting task priorities, sequence of execution, and completion status, thereby ensuring a smooth workflow. You can tag topics with labels for better classification and expand topics with notes for detailed explanations.

## Stickers and Illustrations

XMind offers an impressive catalogue of nearly 500 distinctive stickers and illustrations, thoughtfully designed by professional artists, catering to diverse needs across various scenarios including business, education, or travel. Stickers are similar to images and can be placed above or below the text, and zoomed in or out freely.

## Notes and Comments

Within notes, you're free to expound upon your ideas extensively, with support for ordered or unordered lists for itemized explanation, and text can be emboldened, italicized, or underlined for emphasis.

## Topic Styling and Formatting

You can turn mind maps into trackable to-do lists and highlight key points with markers. When presenting or showing mind maps, legend helps everyone to understand the meaning of icons on the mind map.

## Navigation and Filtering

The Navigation Panel can filter information based on Topic, Note, or Marker & Label.


REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.

## Assistant

Now I have a comprehensive picture. Let me compile this into a checklist for you.

**Tool Call: Read /home/sawyer/Osmosis/notes/00_inspiration/inspo.md (2 - 11)**
Status: Completed

```
# Inspiration Phase Template

## Project: Osmosis

**Created**: 2026-02-21  
**Owner**: Sawyer Rensel 
**Current Status**: Raw Concept

---

```

## Assistant



Here's the comprehensive Xmind feature checklist. Go through and mark each as must-have, nice-to-have, or not needed — that'll directly feed into the PRD.

---

## Xmind Feature Inventory for Osmosis

### Map Structures
- [ ] Mind Map (classic radial branching)
- [ ] Logic Chart
- [ ] Brace Map
- [ ] Org Chart
- [ ] Fishbone Diagram (cause-and-effect)
- [ ] Timeline
- [ ] Tree Chart
- [ ] Tree Table (nested rectangles, subtopics horizontal)
- [ ] Matrix

### Topic Types
- [ ] Central Topic (root node)
- [ ] Main Topic (first-level branches)
- [ ] Subtopic (deeper branches)
- [ ] Floating Topic (unconnected node placed anywhere)
- [ ] Summary Topic (generated from summary element)

### Topic Elements
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

### Topic Editing
- [ ] Add child topic (Tab)
- [ ] Add sibling topic (Enter)
- [ ] Drag-and-drop repositioning
- [ ] Branch collapsing/expanding
- [ ] Rich text formatting within topics (bold, italic, colors, etc.)
- [ ] Topic shape customization

### Styling & Theming
- [ ] Theme library (pre-built color schemes)
- [ ] Smart Color Themes (auto-generated palettes)
- [ ] Theme Editor (create custom themes)
- [ ] Custom font selection
- [ ] Layout/structure adjustment per branch
- [ ] Topic shape styling (rounded, rectangle, etc.)
- [ ] Branch line styling (curved, straight, etc.)
- [ ] Legend (key explaining markers/icons used in the map)

### View Modes
- [ ] Standard mind map view
- [ ] Outliner mode (hierarchical list view, switchable to/from map)
- [ ] Zen Mode (distraction-free full-screen editing)
- [ ] Pitch Mode (auto-convert map to slide deck with transitions)

### Navigation & Filtering
- [ ] Navigation panel
- [ ] Filter by topic content
- [ ] Filter by notes
- [ ] Filter by markers/labels
- [ ] Search within map
- [ ] Navigate/jump to specific topic

### File & Export
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

### Collaboration
- [ ] Share via link
- [ ] Real-time co-editing
- [ ] User avatars/cursors showing active editors
- [ ] View-following (follow another user's view)
- [ ] Node-level comments
- [ ] Task assignment to team members
- [ ] Deadline/priority assignment
- [ ] Version history

### AI Features
- [ ] Text/URL/PDF to mind map generation
- [ ] AI brainstorming / idea expansion
- [ ] AI-driven map reorganization/summarization
- [ ] AI content refinement
- [ ] AI language translation

### Platform & Performance
- [ ] Desktop (Windows, macOS, Linux)
- [ ] Mobile (iOS, Android)
- [ ] Web version
- [ ] Offline functionality
- [ ] Cloud sync across devices
- [ ] Keyboard shortcuts throughout

---

Some of these won't apply to Osmosis since it lives inside Obsidian (e.g., export formats are handled by Obsidian itself, cloud sync is handled by the user's vault sync). And some Xmind features like collaboration and AI are really separate product categories.

I'd suggest focusing your must-have/nice-to-have assessment on the **Map Structures**, **Topic Types**, **Topic Elements**, **Topic Editing**, **Styling & Theming**, and **View Modes** sections — those are the core mind mapping experience. The rest you can largely mark as "not applicable" or "future" without losing the vision.

Want me to add this checklist directly to `inspo.md`, or would you prefer it as a separate file in `notes/00_inspiration/`?

Sources:
- [Xmind Features](https://xmind.com/features)
- [Xmind Review 2026](https://work-management.org/project-management/xmind-review/)
- [Xmind User Guide - Basics](https://xmind.com/user-guide/xmind-basics)
- [Xmind User Guide - Advanced Features](https://xmind.com/user-guide/advanced-features)
- [Xmind - Enrich a Topic](https://xmind.com/user-guide/enrich-a-topic)
- [Xmind - Relationship](https://xmind.com/user-guide/relationship-new)
- [Xmind - Boundary](https://xmind.com/user-guide/boundary-new)
- [Xmind - Summary](https://xmind.com/user-guide/summary-new)

## User

Thanks for researching.  Let's add it to `inspo.md`

**Tool Call: Read /home/sawyer/Osmosis/notes/00_inspiration/inspo.md**
Status: Completed

```
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
```

**Tool Call: Edit `/home/sawyer/Osmosis/notes/00_inspiration/inspo.md`**
Status: Completed

Diff: /home/sawyer/Osmosis/notes/00_inspiration/inspo.md
```
## Feature Brainstorm

*What are the possible features or capabilities? Claude is great at "what could this include?" conversations. Capture those ideas here.*

### Xmind Feature Parity Checklist

*Go through each feature and mark: [x] must-have, [~] nice-to-have, or [N/A] not applicable for Osmosis. Leave [ ] for undecided.*

#### Map Structures
- [ ] Mind Map (classic radial branching)
- [ ] Logic Chart
- [ ] Brace Map
- [ ] Org Chart
- [ ] Fishbone Diagram (cause-and-effect)
- [ ] Timeline
- [ ] Tree Chart
- [ ] Tree Table (nested rectangles, subtopics horizontal)
- [ ] Matrix

#### Topic Types
- [ ] Central Topic (root node)
- [ ] Main Topic (first-level branches)
- [ ] Subtopic (deeper branches)
- [ ] Floating Topic (unconnected node placed anywhere)
- [ ] Summary Topic (generated from summary element)

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

```


## Assistant

Done. The Xmind feature checklist is now in `inspo.md` under the **Feature Brainstorm** section. 

The marking convention is:
- `[x]` — must-have
- `[~]` — nice-to-have
- `[N/A]` — not applicable for Osmosis
- `[ ]` — undecided

Note that some sections like **Collaboration**, **File & Export**, and **Platform & Performance** are largely handled by Obsidian itself (vault sync, file management, platform support), so many of those will likely be `[N/A]`. The sections that matter most for Osmosis's identity are **Map Structures**, **Topic Types**, **Topic Elements**, **Topic Editing**, **Styling & Theming**, and **View Modes**.

Take a pass through it when you're ready and we can use your selections to start shaping the PRD.

## User

I've updated inspo.md with my selections.  Do any stand out to you as difficult to implement/we need to brainstorm deeply about?

**Tool Call: Read /home/sawyer/Osmosis/notes/00_inspiration/inspo.md**
Status: Completed

```
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
- [x] Timeline
- [N/A] Tree Chart
- [N/A] Tree Table (nested rectangles, subtopics horizontal)
- [N/A] Matrix

#### Topic Types
- [x] Central Topic (root node)
- [x] Main Topic (first-level branches)
- [x] Subtopic (deeper branches)
- [x] Floating Topic (unconnected node placed anywhere)
- [x] Summary Topic (generated from summary element)

#### Topic Elements
- [x] Relationship lines (connect two related topics with customizable line style, color, arrow, text)
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
```

## Assistant

Good selections. Your annotations are thoughtful — I especially like the idea of using the Obsidian note itself as the "outliner mode" and syncing cursor position between note and map. A few things stand out as technically challenging:

**1. The Mind Map Editor itself (the big one)**

You've marked almost every editing feature as must-have: drag-and-drop, multi-select, rich text, shape customization, collapsing/expanding, keyboard shortcuts — plus 6 different map structures (radial, logic chart, brace map, org chart, fishbone, timeline). Each structure requires its own layout algorithm. This is essentially building a full diagramming application inside an Obsidian view. The core question remains: **custom rendering engine vs. extending something like Markmap**. Given that you need editing, multi-select, drag-and-drop, and multiple layout structures, I think you're past what Markmap can provide — you're likely building a custom engine. We should brainstorm the rendering approach (SVG vs. Canvas vs. HTML/CSS) and how it interacts with Obsidian's view system.

**2. Bidirectional sync between Markdown and Mind Map**

The map is an editor that writes back to markdown, and editing the markdown updates the map. This is a real-time two-way binding problem. The hard parts:
- **Parsing ambiguity**: How do you round-trip markdown features like blockquotes, callouts, code blocks, and LaTeX back and forth without losing fidelity?
- **Conflict resolution**: If the user has both the note and the map open in a split view and edits both simultaneously, who wins?
- **Non-tree structures in markdown**: Relationship lines and floating topics don't have a natural markdown representation. Where do they get stored? Hidden frontmatter? HTML comments? A sidecar file?

**3. Embedded/Transclusion Mind Maps (`![[]]`)**

Rendering a linked note as a sub-branch of the parent map means you need to recursively parse and lay out multiple files. The challenges:
- **Circular references**: `A.md` embeds `B.md` which embeds `A.md` — need cycle detection.
- **Performance**: A note that embeds 10 other notes, each with their own trees, could produce hundreds of nodes. When does it become too heavy? Do you lazy-load collapsed branches?
- **Editing**: If I edit a node that belongs to an embedded note, does that write to the embedded file? That's powerful but needs clear UX boundaries.

**4. Relationship Lines**

These are the most "non-markdown" feature you've marked as must-have. A relationship connects two arbitrary nodes that aren't parent-child. Markdown has no native way to represent this. Options:
- Frontmatter array (e.g., `relationships: [{from: "heading-1", to: "heading-3", label: "causes"}]`)
- HTML comments inline (e.g., `<!-- osmosis-rel: heading-3, "causes" -->`)
- Sidecar `.osmosis` file next to the note

Each has tradeoffs around portability, readability, and ease of parsing. This needs a decision early because it affects the data model.

**5. Floating Topics**

Similar problem to relationships — a floating topic is a node that isn't connected to the tree. Where does it live in the markdown? A separate section at the bottom? A special callout? This also needs an early data model decision.

**6. Six Map Structures**

Each of radial, logic chart, brace map, org chart, fishbone, and timeline requires a different layout algorithm that positions nodes differently. That's a significant amount of layout code. Worth considering: do you need all six at launch, or could you ship with radial + one or two others and add more over time?

---

The items I'd want to brainstorm most deeply before writing any code are **#1** (rendering engine choice), **#2** (bidirectional sync model), and **#4** (how non-tree data like relationships and floating topics are stored in markdown). These are foundational decisions that everything else builds on. Want to dig into any of these?

## User

1. Let's build our own engine, even if it means publishing it as a separate repo.  What's the Cost Benefit Analysis look like for SVG vs. Canvas vs. HTML/CSS?
2. Obsidian auto-saves an edited file in near realtime.  This should solve the synchronization question, shouldn't it?  Thus there shouldn't be any conflicts.  My apologies, I misunderstood "relationship lines" to be parent-child lines.  I understand now they are custom line connections.  Let's put them on the backburner as a nice to have.
3. Let's build such an amazingly robust and fast engine that we can embed 100 notes together and there's no perceptible lag.  As for editing a linked note, if I edit a node that belongs to an embedded note, write to the embedded file.
4. Let's abandon floating topics and relationship lines.  
5. Let's abandon floating topics
6. Good point.  What are the distinctions between each one?  

Random idea (I've added to inspo.md as well):  What if we could leverage footnotes so that hovering or clicking on a Node in Mind Map view presented a popup with the footnote, similar to how many blogs do this today.  I often find I want to add more context to a Node but don't want it visible until I hover.

## Assistant



Good calls on scoping down relationships and floating topics — that removes two of the hardest data model problems. Let me address your questions.

**On #2 — Bidirectional sync via Obsidian's auto-save:**

It simplifies things but doesn't fully solve it. The issue isn't file-level conflicts — it's *parsing direction*. When the user edits the markdown, you need to re-parse and update the map's in-memory tree. When the user edits the map, you need to serialize back to markdown. If both views are open and the user types in the markdown editor, Obsidian saves the file, your plugin detects the change, re-parses, and updates the map — that's a tight loop that needs to be fast and not cause cursor jumps or flicker. The solution is likely a shared in-memory model that both views read/write to, with the markdown file as the persistence layer. Doable, but the parser and serializer need to be rock solid.

**On the footnote idea:** Love it. It maps perfectly to markdown footnotes (`[^1]`) which are already part of the spec. A node shows its content, and the footnote pops up on hover as a tooltip or card. Clean, zero new syntax needed.

Now for the big questions:

---

## Rendering Engine: SVG vs. Canvas vs. HTML/CSS

**SVG**

| Pros | Cons |
|------|------|
| Each node is a DOM element — easy to attach click handlers, hover states, tooltips (great for your footnote idea) | Performance degrades with thousands of nodes since each is a DOM element |
| CSS styling works natively — transitions, animations, theming are straightforward | Complex text handling (wrapping, rich text, code blocks inside nodes) requires manual work with `<foreignObject>` or `<text>` elements |
| Built-in hit detection (click a node, get the event) | Mobile touch interactions need manual handling |
| Scales cleanly at any zoom level (vector) | Large maps with many nodes can cause layout thrashing |
| Obsidian's existing ecosystem (Mermaid, Markmap) uses SVG — patterns to follow | |
| Easy to export to SVG/PNG/PDF natively | |
| Inspector/debugging is trivial — just look at the DOM | |

**Canvas (HTML5 `<canvas>`)**

| Pros | Cons |
|------|------|
| Fastest rendering for large node counts — draw thousands of nodes without DOM overhead | No built-in hit detection — you have to manually calculate "did the user click on this node?" with coordinate math |
| Smooth pan/zoom is simpler to implement | Text rendering is primitive — no rich text, no markdown rendering inside nodes, no wrapping without manual calculation |
| Consistent rendering across platforms | Accessibility is essentially nonexistent (screen readers can't see canvas content) |
| Good for animations/transitions | Can't use CSS for styling — everything is imperative drawing code |
| | Blurry on zoom unless you manage DPI/retina scaling manually |
| | Exporting to SVG/PDF requires a separate rendering path |
| | Debugging is painful — it's just pixels, no inspectable elements |
| | Code blocks and LaTeX inside nodes would be extremely difficult |

**HTML/CSS (DOM-based)**

| Pros | Cons |
|------|------|
| Richest text and content support — markdown rendering, code blocks, LaTeX, images all "just work" inside `<div>` nodes | Drawing lines/curves between nodes requires either SVG overlay or CSS tricks |
| Full CSS theming, transitions, animations | Pan/zoom at scale is harder — transforming hundreds of positioned divs |
| Obsidian's rendering pipeline can be reused (markdown-to-HTML is already built in) | Performance ceiling is lower than SVG for node count |
| Accessibility is native | Precise positioning for layout algorithms is more finicky |
| Mobile touch events work naturally | You end up needing SVG anyway for the connection lines |
| Easiest to develop and debug | |

---

## My recommendation: **SVG for structure + `<foreignObject>` for node content**

This is a hybrid approach. The map skeleton (lines, curves, layout) is pure SVG — fast, scalable, exportable. Each node's *content* is rendered inside `<foreignObject>`, which lets you embed HTML/CSS inside an SVG element. This means:

- Connection lines, branches, and layout use SVG's strengths
- Node content gets full HTML — markdown rendering, code blocks, LaTeX, images, footnote tooltips all work naturally
- CSS theming applies to both the structure and content
- Export to SVG/PNG/PDF comes almost for free
- Click/hover events work on individual nodes
- You can reuse Obsidian's markdown rendering inside nodes

The risk with `<foreignObject>` is mobile browser inconsistencies — some mobile WebViews have historically had quirks with it. This would need early prototyping on iOS/Android Obsidian to validate. But modern Obsidian mobile uses a recent enough WebView that it should be fine.

---

## Map Structure Distinctions

Here's what differentiates each of your six must-have structures — they all use the same data (a tree), just laid out differently:

| Structure | Layout | Use Case | How It Differs |
|-----------|--------|----------|---------------|
| **Mind Map** | Central node, branches radiate outward in all directions (left + right) | General brainstorming, note-taking | Balanced layout, nodes spread evenly around center |
| **Logic Chart** | Root on the left, everything flows rightward in a horizontal tree | Step-by-step processes, decision flows | Unidirectional (left-to-right), more structured/linear feel |
| **Org Chart** | Root on top, everything flows downward | Hierarchies, taxonomies, classifications | Top-down vertical tree, like a family tree |
| **Brace Map** | Root on the left, child groups are enclosed in curly braces `{` | Part-whole relationships, decomposition | Like logic chart but with brace delimiters grouping siblings |
| **Fishbone** | Central spine (horizontal line), branches angle off diagonally | Root cause analysis, categorized causes | Spine + angled ribs, very distinct visual shape |
| **Timeline** | Nodes arranged along a horizontal or vertical time axis | Sequential/chronological information | Linear axis with nodes branching off at intervals |

The good news: these are all trees with the same underlying data. The difference is purely in the **layout algorithm** — how you assign x,y coordinates to each node. You could implement this as swappable layout strategies that plug into the same rendering engine. The core engine draws nodes and lines; the layout strategy just tells it *where*.

Fishbone and timeline are the most unique layouts. The other four (mind map, logic chart, org chart, brace map) are variations on tree layout with different direction and grouping rules. Starting with mind map + logic chart + org chart would cover the most ground with the least layout code, then adding brace map, fishbone, and timeline incrementally.

---

Want to dig deeper into the SVG + foreignObject approach, or shift to brainstorming the Anki/spaced repetition side of things?

## User

On #2: Perhaps check out the Markwhen Parser [@README.md](file:///home/sawyer/Osmosis/ref/parser/README.md) and Markwhen Timeline [@README.md](file:///home/sawyer/Osmosis/ref/timeline/README.md) for inspiration?  Markwhen's parser feels blazingly fast.

On Rendering Engine: Let's go with your hybrid approach of SVG for structure + `<foreignObject>` for node content

On Map Structure Distinctions, let's go with Mind Map and Timeline, with the caveat that Mind Map has three toggles - one that toggles whether the map branches left/right or up/down, another that toggles whether nodes get placed on both sides or on one side, and a third toggle to flip the side.

Unless you have further questions resulting from my responses, would you add notes in inspo.md detailing our ideas/decisions/conversation so far?  I want to thoroughly document what we've come up with so far.  Then let's begin brainstorming about the Anki/spaced repetition side of things

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/README.md**
Status: Completed

````
# Markwhen parser

Parse markwhen documents. Outputs a list of events given plain text.

See [markwhen.com](https://markwhen.com), [the documentation](https://docs.markwhen.com), and the [changelog](./CHANGELOG.md).

```js
import { parse } from "@markwhen/parser";

const markwhen = parse(`
title: this is my title
timezone: America/New_York

#neat:
  color: blue
  timezone: -3

2022: event

group My Group #neat
2024: another event

`);

console.log(markwhen);
```
````

**Tool Call: Read /home/sawyer/Osmosis/ref/timeline/README.md**
Status: Completed

````
# Markwhen timeline

## Installation and running

Requirements:

Node > 18, `npm`

```
git clone https://github.com/mark-when/timeline.git
cd timeline
npm i
npm run dev
```

The timeline will run from port 6180 and will automatically be detected by Meridiem, whether it's the web app or the desktop app. Any port between 6180 and 6280 will be picked up - Meridiem looks for a `mw.json` file at all of these ports and if it finds one adds it to the list of available views. If it's not detected you can rescan for it or add it directly with the `Add by url` form.

![](/timeline.png)

If you wanted to change this preview panel you can merely edit `public/mw.json`.

## Building

`npm run build`

Aside from assets like the screenshots and `mw.json`, this bundles all html/css/js into a single index.html file at `dist/index.html`

[More documentation](https://docs.markwhen.com)

[Parser](https://github.com/mark-when/parser)

[View client](https://github.com/mark-when/view-client)
````

## Assistant

Good reference — Markwhen's architecture of "fast parser → intermediate representation → swappable view" is exactly the pattern Osmosis should follow. Parse markdown into an AST/tree model, then let different views (mind map, timeline, study mode) consume that same model.

Let me look at the parser source to understand their approach better, then I'll update inspo.md.

**Tool Call: Explore Markwhen parser source**
Status: Completed

Perfect! I now have a comprehensive understanding of the Markwhen parser. Let me compile my findings into a thorough report.

## Markwhen Parser Architecture Analysis

### 1. Overall Architecture & Entry Points

The Markwhen parser is located at `/home/sawyer/Osmosis/ref/parser/` and follows a modular TypeScript architecture with these key entry points:

**Main exports** (`src/index.ts`):
- `parse()` - Primary full-document parser
- `parseDateRange()` - Standalone date range parser
- `parseHeader()` - Parse just the YAML frontmatter/header
- `parseICal()` - Convert iCalendar format to Markwhen
- `incrementalParse()` - Incremental parsing for editor integration
- `profileParse()` - Parse with performance timings

**Core flow**:
```
Input string/Text → linesAndLengths() → parseTimeline()
                                        ├── _parseHeader() [YAML]
                                        └── parsePastHeader() [events]
                                            ├── checkEvent()
                                            ├── checkGroupStart()
                                            └── checkNonEvents()
                                                ├── checkComments()
                                                ├── checkTags()
                                                └── checkGroupEnd()
```

---

### 2. Parsing Pipeline: Text → Structured Representation

**Phase 1: Text Preprocessing**
- `linesAndLengths()` (`src/lines.ts`) converts input to lines + cumulative position offsets
- Handles three input types: `string`, `string[]`, or CodeMirror `Text` objects
- Computes `lengthAtIndex[]` array for O(1) position tracking

**Phase 2: Header/Metadata Parsing** (`src/parseHeader.ts`)
- Parses YAML frontmatter (between `---` delimiters)
- Extracts key metadata: `title`, `timezone`, `description`
- Handles tag definitions with color properties
- Returns line index where header ends

**Phase 3: Event Detection Loop** (`src/parse.ts` → `parsePastHeader()`)
```typescript
while (i < lines.length) {
  // Fast skip: non-events quickly eliminated
  if (checkNonEvents(line)) continue;
  
  // Group handling
  if (checkGroupStart()) { handle group; continue; }
  
  // CRITICAL OPTIMIZATION: Fast early exit
  if (!line.includes(":")) { i++; continue; } // ← No colon = not an event
  
  // Full event parsing
  checkEvent(line, lines, i, lengthAtIndex, context);
}
```

**Phase 4: Event Parsing** (`src/lineChecks/checkEvent.ts`)

For each event line, parser tries three date format parsers in order:
1. **EDTF regex** - Extended Date-Time Format (ISO 8601 variants, ranges, etc.)
2. **Casual regex** - "Jan 1 2022", "2022-01-01", natural language
3. **BCE regex** - Historical dates with BC/BCE notation

Once a date range is found, continues collecting lines until:
- Next event marker detected
- Group start/end detected
- EOF reached

Extracts supplementary data:
- Tags (extracted from `#tag` syntax)
- List items (indented lines starting with `-`)
- Comments (lines starting with `--`)
- Event ID, completion status, progress percentage

---

### 3. Output AST/Data Structure

**Root type**: `Timeline`
```typescript
interface Timeline {
  ranges: Range[];              // Text position metadata
  foldables: { [index: number]: Foldable };  // Editor folding regions
  events: EventGroup;           // Root event tree
  header: any;                  // Parsed YAML
  ids: IdedEvents;              // Event ID → path mapping
  parseMessages: ParseMessage[]; // Parse errors/warnings
  documentMessages: DocumentMessage[];
}
```

**Event Tree** (hierarchical):
```typescript
class EventGroup {
  children: Array<Event | EventGroup> = [];  // Tree structure
  title: string;
  properties: any;              // From properties block
  propOrder: string[];          // Property definition order
  range?: GroupRange;           // Date bounds of all children
  tags: string[];
  style?: "section" | "group";
}

class Event {
  firstLine: {
    full: string;
    datePart?: string;
    rest: string;
    restTrimmed: string;
  };
  dateRangeIso: DateRangeIso;   // {fromDateTimeIso, toDateTimeIso}
  recurrence?: Recurrence;      // Repeat pattern
  tags: string[];
  supplemental: MarkdownBlock[]; // Images, lists, checkboxes
  matchedListItems: Range[];
  id?: string;
  percent?: number;
  completed?: boolean;
  properties: any;
  textRanges: {
    whole: Range;
    datePart: Range;
    definition: Range;
    recurrence?: Range;
    properties?: Range;
  };
}
```

**Range metadata** (for editor integration):
```typescript
type Range = {
  from: number;      // Character position in input
  to: number;
  type: RangeType;   // "event", "tag", "comment", "dateRange", etc.
  content?: any;     // Type-specific data
};
```

**Tree traversal utilities**:
- `iter(node)` - Generator for depth-first traversal with paths
- `get(root, path)` - O(depth) node access by path
- `push(node, onto, path)` - Insert node at path
- `flat()` - Flatten to event array
- `flatMap(node, mapper)` - Functional mapping

---

### 4. What Makes It Fast

**Strategic optimizations**:

1. **Lazy regex matching** (`src/parse.ts:parsePastHeader`)
   ```typescript
   if (!line.includes(":")) {
     i++;
     continue;  // Skip expensive regex if no colon
   }
   ```
   This single check eliminates ~90% of non-event lines before regex evaluation.

2. **Three-tier date parser** (tries cheap → expensive)
   - EDTF first (most common structured format)
   - Casual regex second (natural language, slower)
   - BCE regex third (rare historical dates)
   - Short-circuits on first match

3. **LRU Caching** (`src/Cache.ts`)
   ```typescript
   class Caches {
     zones: LRUCache<string, Zone>;       // Timezone parsing cache
     yaml: LRUCache<string, any>;         // YAML parse cache
     caches: [Zone, Cache][];             // Per-zone caches
   }
   
   class Cache {
     slashDate: LRUCache<string, GranularDateTime>;  // Date calculations
     roundDateUp: LRUCache<string, string>;
     ranges: LRUCache<string, DateRangeIso>;
   }
   ```
   Uses `lru-cache` (max 1000 entries) for computed results. Cache is reusable across parses.

4. **Incremental parsing** (`src/incremental.ts`)
   - Tracks which parts of tree changed based on CodeMirror `ChangeSet`
   - Reuses unchanged portions of AST
   - Computes minimal diff: `affectedEvents` → reparse only that range
   - Preserves cache between incremental updates

5. **Position tracking optimization** (`src/lines.ts`)
   - Pre-computed `lengthAtIndex[]` array
   - O(1) lookup of character positions
   - No string concatenation or slicing in hot path

6. **Early-exit patterns**
   - `checkNonEvents()` with array of quick checks
   - Group end detection prevents unnecessary parsing
   - Fast path for comments, group markers

7. **Luxon timezone caching** (`src/zones/parseZone.ts`)
   - Timezone objects are expensive to instantiate
   - Cached at context level to avoid re-parsing "America/New_York" multiple times

---

### 5. Tech Stack

**Language & Build**:
- **TypeScript 5.8.3** (strict mode enabled - `tsconfig.json`)
- **Vite 6.3.5** - bundler (generates both ESM and CommonJS)
- **tsc-watch** - development mode with auto-push to yalc

**Core Dependencies**:
| Package | Purpose |
|---------|---------|
| `luxon ^3.7.2` | DateTime/timezone handling (replaces moment.js) |
| `@markwhen/rrule ^2.8.2` | RFC 5545 recurrence rule parsing |
| `ical.js ^2.1.0` | iCalendar format import/export |
| `yaml ^2.8.0` | YAML frontmatter parsing |
| `@codemirror/state ^6.5.2` | Integration with CodeMirror 6 editor |
| `lru-cache ^11.2.2` | Performance caching |

**Dev Stack**:
- **Jest 29.7.0** - test runner
- **ts-jest** - TypeScript test preprocessing
- **vite-plugin-dts** - auto-generate `.d.ts` type definitions

**Version**: 0.16.8 (Semantic versioning, CI/CD-driven with bump scripts)

---

### 6. Key Modules Breakdown

| Module | Purpose |
|--------|---------|
| `parse.ts` | Main parsing orchestration |
| `Types.ts` | AST node classes (Event, EventGroup, Range, etc.) + tree utilities |
| `ParsingContext.ts` | Mutable parsing state (current path, accumulated events, messages) |
| `Cache.ts` | LRU caches for performance |
| `lines.ts` | Input line splitting + position tracking |
| `parseHeader.ts` | YAML/properties parsing |
| `incremental.ts` | Diff-based re-parsing for editors |
| `profile.ts` | Timing instrumentation |
| **dateRange/** | Date format detection (EDTF, casual, BCE) |
| **lineChecks/** | Individual line type validators (event, group, tag, comment, etc.) |
| **utilities/** | Helper functions (date formatting, URLs, recurrence expansion, YAML) |
| **zones/** | Timezone parsing with caching |

---

### 7. Notable Design Patterns

**Path-based tree navigation**:
- Paths are `number[]` representing indices: `[0, 2, 1]` = group 0, child 2, child 1
- Enables efficient undo/redo and persistent references

**Generator-based traversal**:
- `iter()` uses `Generator` for lazy tree walks
- Memory-efficient for large timelines

**Parsing context accumulation**:
- Single `ParsingContext` object mutated throughout parse
- Collects events, metadata, error messages, range positions all in one pass

**Regex library organization**:
- `regex.ts` exports 40+ RegExp patterns
- Named capture group indices exported as constants (e.g., `edtfDatePartMatchIndex`)
- Enables rapid fallthrough matching

**Range tracking**:
- Every syntactic element gets a `Range` object with character positions
- Enables source map for editor features (syntax highlighting, refactoring, etc.)

---

### 8. Performance Characteristics

From `src/profile.ts`:
```typescript
export type ParseTimings = {
  total: number;
  lines: number;   // Line splitting
  header: number;  // YAML parsing
  body: number;    // Event parsing
};
```

**Complexity**:
- **Line splitting**: O(n) where n = document length
- **Header parsing**: O(h) where h = header lines (typically <50)
- **Body parsing**: O(e × m) where e = events, m = avg lines per event
  - With colon-check optimization: effectively O(n) due to early skips
- **Incremental**: O(c × m) where c = changed lines

**Memory**:
- AST is proportional to document size + metadata
- LRU caches bounded to 1000 entries each
- Tree structures share DateTime objects (Luxon instances are immutable)

---

### Summary

**What makes Markwhen Parser stand out**:
1. **Resilient**: Three date parsers handle diverse date formats
2. **Fast**: Pre-computed line positions + colon-check early exit + LRU caching
3. **Editor-aware**: Incremental parsing, range tracking, foldable metadata
4. **Well-architected**: Clean separation of concerns (line checks, date ranges, utilities)
5. **Timezone-savvy**: Full Luxon integration with caching
6. **Testable**: 15 test files covering dates, recurrence, iCal, timezones, performance

The parser is production-grade and suitable as a reference for building specialized timeline DSL parsers.

agentId: a02854a (for resuming to continue this agent's work if needed)
<usage>total_tokens: 44979
tool_uses: 21
duration_ms: 65364</usage>

**Tool Call: `find /home/sawyer/Osmosis/ref/parser -type f -name "*.json" -o -name "*.ts" -o -name "*.js" | head -30`**
Status: Completed

Terminal:
```
/home/sawyer/Osmosis/ref/parser/package-lock.json
/home/sawyer/Osmosis/ref/parser/src/incremental.ts
/home/sawyer/Osmosis/ref/parser/src/Cache.ts
/home/sawyer/Osmosis/ref/parser/src/ical.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/yaml.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/header.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/dateRangeToString.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/properties.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/recurrence.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/urls.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/html.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/utils.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/getDateRangeFromCasualRegexMatch.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/getDateRangeFromEDTFRegexMatch.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/getDateRangeFromBCEDateRegexMatch.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/checkRecurrence.ts
/home/sawyer/Osmosis/ref/parser/src/profile.ts
/home/sawyer/Osmosis/ref/parser/src/lines.ts
/home/sawyer/Osmosis/ref/parser/src/parse.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkTags.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkGroupEnd.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkEvent.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkTagColors.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkNonEvents.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkListItems.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkTitle.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkDescription.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkComments.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkGroupStart.ts
/home/sawyer/Osmosis/ref/parser/src/Types.ts

```


**Tool Call: `ls -la /home/sawyer/Osmosis/ref/parser/`**
Status: Completed

Terminal:
```
total 420
drwxrwxr-x  8 sawyer sawyer   4096 Jan  7 21:59 .
drwxrwxr-x 13 sawyer sawyer   4096 Feb 24 19:15 ..
drwxrwxr-x  7 sawyer sawyer   4096 Feb 24 19:26 .git
drwxrwxr-x  2 sawyer sawyer   4096 Jan  7 21:59 .github
-rw-rw-r--  1 sawyer sawyer    127 Jan  7 21:59 .gitignore
drwxrwxr-x  2 sawyer sawyer   4096 Jan  7 21:59 .vscode
-rw-rw-r--  1 sawyer sawyer   3441 Jan  7 21:59 CHANGELOG.md
-rw-rw-r--  1 sawyer sawyer   1049 Jan  7 21:59 LICENSE
-rw-rw-r--  1 sawyer sawyer    467 Jan  7 21:59 README.md
-rw-rw-r--  1 sawyer sawyer    318 Jan  7 21:59 jest.config.cjs
-rw-rw-r--  1 sawyer sawyer 357820 Jan  7 21:59 package-lock.json
-rw-rw-r--  1 sawyer sawyer   1628 Jan  7 21:59 package.json
drwxrwxr-x  2 sawyer sawyer   4096 Jan  7 21:59 scripts
drwxrwxr-x  6 sawyer sawyer   4096 Jan  7 21:59 src
drwxrwxr-x  2 sawyer sawyer   4096 Jan  7 21:59 tests
-rw-rw-r--  1 sawyer sawyer   6680 Jan  7 21:59 tsconfig.json
-rw-rw-r--  1 sawyer sawyer    375 Jan  7 21:59 vite.config.mjs

```


**Tool Call: Read /home/sawyer/Osmosis/ref/parser/package.json**
Status: Completed

```
{
  "name": "@markwhen/parser",
  "version": "0.16.8",
  "description": "Markwhen parser",
  "type": "module",
  "main": "cjs/index.js",
  "exports": {
    "require": "./cjs/index.js",
    "import": "./lib/index.js"
  },
  "scripts": {
    "test": "jest",
    "test:verbose": "jest --verbose false --silent false",
    "test:profile": "node --inspect-brk ./node_modules/jest/bin/jest.js",
    "build": "tsc && vite build && echo '{\"type\": \"commonjs\"}' > cjs/package.json",
    "prepublish": "tsc && jest",
    "watch": "tsc-watch --onSuccess \"yalc push --update\"",
    "bump": "node scripts/bumper.js patch",
    "bump:major": "node scripts/bumper.js major",
    "bump:minor": "node scripts/bumper.js minor",
    "bump:patch": "node scripts/bumper.js patch"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/mark-when/parser.git"
  },
  "keywords": [
    "markwhen",
    "parser",
    "timeline"
  ],
  "author": "Rob Koch",
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/mark-when/parser/issues"
  },
  "homepage": "https://github.com/mark-when/parser#readme",
  "dependencies": {
    "@codemirror/state": "^6.5.2",
    "@markwhen/rrule": "^2.8.2",
    "ical.js": "^2.1.0",
    "lru-cache": "^11.2.2",
    "luxon": "^3.7.2",
    "yaml": "^2.8.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/luxon": "^3.7.1",
    "@types/node": "^24.10.4",
    "jest": "^29.7.0",
    "ts-jest": "^29.4.4",
    "tsc-watch": "^7.1.1",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vite-plugin-dts": "^3.9.1"
  },
  "files": [
    "lib/**/*",
    "cjs/**/*"
  ]
}
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/README.md**
Status: Completed

````
# Markwhen parser

Parse markwhen documents. Outputs a list of events given plain text.

See [markwhen.com](https://markwhen.com), [the documentation](https://docs.markwhen.com), and the [changelog](./CHANGELOG.md).

```js
import { parse } from "@markwhen/parser";

const markwhen = parse(`
title: this is my title
timezone: America/New_York

#neat:
  color: blue
  timezone: -3

2022: event

group My Group #neat
2024: another event

`);

console.log(markwhen);
```
````

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/parse.ts**
Status: Completed

```
import {
  Timeline,
  DateRangePart,
  ParseResult,
  emptyTimeline,
} from "./Types.js";
import { getDateRangeFromCasualRegexMatch } from "./dateRange/getDateRangeFromCasualRegexMatch.js";
import { getDateRangeFromEDTFRegexMatch } from "./dateRange/getDateRangeFromEDTFRegexMatch.js";
import { getDateRangeFromBCEDateRegexMatch } from "./dateRange/getDateRangeFromBCEDateRegexMatch.js";
import { Caches } from "./Cache.js";
import { checkEvent } from "./lineChecks/checkEvent.js";
import { ParseMessage, ParsingContext } from "./ParsingContext.js";
import { checkNonEvents } from "./lineChecks/checkNonEvents.js";
import { parseHeader as _parseHeader } from "./parseHeader.js";
import ICAL from "ical.js";
import { DateTime } from "luxon";
import {
  DateFormap,
  ISOMap,
  dateRangeToString,
} from "./utilities/dateRangeToString.js";
import { checkGroupStart } from "./lineChecks/checkGroupStart.js";
import { Text } from "@codemirror/state";
import { linesAndLengths } from "./lines.js";

// The bump script looks for this line specifically,
// if you edit it you need to edit the bump script as well
const version = "0.16.8";

export function parseDateRange(
  dateRangeString: string
): DateRangePart | undefined {
  const parsingContext = new ParsingContext();
  let dateRange = getDateRangeFromEDTFRegexMatch(
    dateRangeString,
    0,
    [],
    parsingContext
  );
  if (!dateRange) {
    dateRange = getDateRangeFromCasualRegexMatch(
      dateRangeString,
      0,
      [],
      parsingContext
    );
  }
  if (!dateRange) {
    dateRange = getDateRangeFromBCEDateRegexMatch(
      dateRangeString,
      0,
      [],
      parsingContext
    );
  }
  return dateRange;
}

export function parse(
  timelineString?: string | string[] | Text,
  cache?: Caches | true,
  now?: DateTime | string
): ParseResult {
  if (cache === true) {
    cache = new Caches();
  }
  const parser = {
    version,
  };
  if (!timelineString) {
    return { ...emptyTimeline(), cache, parser, parseMessages: [] };
  }
  const { lines, lengthAtIndex } = linesAndLengths(timelineString);
  return {
    ...parseTimeline(lines, lengthAtIndex, cache, now),
    cache,
    parser,
  };
}

export function parseHeader(timelineString: string) {
  const { lines, lengthAtIndex } = linesAndLengths(timelineString);
  const context = new ParsingContext();
  const headerEndLineIndex = _parseHeader(lines, lengthAtIndex, context);
  return { ...context, lines, lengthAtIndex, headerEndLineIndex };
}

export function parsePastHeader(
  from: number,
  context: ParsingContext,
  lines: string[],
  lengthAtIndex: number[],
  to?: number
) {
  let i = from;
  const upTo = to || lines.length;
  while (i < lines.length && i < upTo) {
    const line = lines[i];
    if (checkNonEvents(line, i, lengthAtIndex, context)) {
      i++;
      continue;
    }
    const possibleGroup = checkGroupStart(lines, i, lengthAtIndex, context);
    if (possibleGroup) {
      i = possibleGroup.end;
      continue;
    }
    // Fast skip: event lines must contain a ':' separating date and title; avoid expensive regex if absent
    if (!line.includes(":")) {
      i++;
      continue;
    }
    i = checkEvent(line, lines, i, lengthAtIndex, context) + 1;
  }

  if (to === undefined) {
    const lastLineIndex = i - 1;
    while (context.currentPath.length > 1) {
      context.endCurrentGroup(
        lengthAtIndex[lastLineIndex] + lines[lastLineIndex].length,
        { line: lastLineIndex, index: lines[lastLineIndex].length }
      );
    }
  }
  return context;
}

export function parseTimeline(
  lines: string[],
  lengthAtIndex: number[],
  cache?: Caches,
  now?: DateTime | string
): Timeline & { parseMessages: ParseMessage[] } {
  const context = new ParsingContext(now, cache);
  const headerEndLineIndex = _parseHeader(lines, lengthAtIndex, context);
  parsePastHeader(headerEndLineIndex, context, lines, lengthAtIndex);
  return context.toTimeline();
}

export function parseICal(
  ical: string,
  options?: {
    output?: "markwhen" | "json";
    formap?: DateFormap;
  }
) {
  let markwhenText = "";
  const icalParse = ICAL.parse(ical);
  const component = new ICAL.Component(icalParse);
  const vevents = component.getAllSubcomponents("vevent");
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    // @ts-ignore
    const timezone: string =
      component
        .getFirstSubcomponent("vtimezone")
        ?.getFirstPropertyValue("tzid") || "";

    const fromDateTime = timezone
      ? DateTime.fromISO(event.startDate.toString(), { zone: timezone })
      : DateTime.fromMillis(event.startDate.toUnixTime() * 1000);

    const toDateTime = timezone
      ? DateTime.fromISO(event.endDate.toString(), { zone: timezone })
      : DateTime.fromMillis(event.endDate.toUnixTime() * 1000);

    markwhenText += `${dateRangeToString(
      {
        fromDateTime,
        toDateTime,
      },
      options?.formap ?? ISOMap
    )}: ${event.summary}\n`;
    if (event.description) {
      const adjustedDescription = event.description
        .split("\n")
        .map((line) => {
          if (parseDateRange(line)) {
            return `. ${line}`;
          }
          return line;
        })
        .join("\n");
      markwhenText += `${adjustedDescription}\n\n`;
    }
  }
  if (options?.output === "json") {
    const result = parse(markwhenText);
    return result;
  }
  return markwhenText;
}
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/Types.ts**
Status: Completed

```
import { DateTime, DurationLikeObject, DurationUnit } from "luxon";
import { Caches } from "./Cache.js";
import { Recurrence, RecurrenceInText } from "./dateRange/checkRecurrence.js";
import { DocumentMessage, Foldable, ParseMessage } from "./ParsingContext.js";
import {
  AMOUNT_REGEX,
  COMMENT_REGEX,
  EVENT_ID_REGEX,
  TAG_REGEX,
} from "./regex.js";
import { addHttpIfNeeded } from "./utilities/html.js";

export type DateTimeGranularity =
  | "instant"
  | "year"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute";

export type GranularDateTime = {
  dateTimeIso: DateTimeIso;
  granularity: DateTimeGranularity;
};

export type DateFormat =
  | typeof AMERICAN_DATE_FORMAT
  | typeof EUROPEAN_DATE_FORMAT;
export const AMERICAN_DATE_FORMAT = "M/d/y";
export const EUROPEAN_DATE_FORMAT = "d/M/y";

export const DATE_TIME_FORMAT_MONTH_YEAR = "M/y";
export const DATE_TIME_FORMAT_YEAR = "y";

export class RelativeDate {
  /**
   * Note that this does not accurately work for week days as
   * we would otherwise need to know the date that this is
   * being diffed from.
   * @param raw
   */
  static diffFromString(raw: string) {
    const matches = raw.matchAll(AMOUNT_REGEX);
    let match = matches.next();
    const diffObj = {} as DurationLikeObject;
    while (match.value) {
      const value = match.value as RegExpMatchArray;
      const amount = parseInt(value[2]);
      const duration: DurationUnit | undefined = !!value[4]
        ? "milliseconds"
        : !!value[5]
        ? "seconds"
        : !!value[6]
        ? "minutes"
        : !!value[7]
        ? "hours"
        : !!value[9]
        ? "days"
        : !!value[10]
        ? "weeks"
        : !!value[11]
        ? "months"
        : !!value[12]
        ? "years"
        : undefined;
      if (duration) {
        diffObj[duration] = (diffObj[duration] ?? 0) + amount;
      }
      match = matches.next();
    }
    return diffObj;
  }

  static fromPlus(raw: string, priorDate: DateTime) {
    return this.from(raw, priorDate, "plus");
  }

  static fromMinus(raw: string, priorDate: DateTime) {
    return this.from(raw, priorDate, "minus");
  }

  static from(
    raw: string,
    priorDate: DateTime,
    plusOrMinus: "plus" | "minus" = "plus"
  ): DateTime {
    const matches = raw.matchAll(AMOUNT_REGEX);
    let match = matches.next();
    const sign = match && match.value && match.value[1] ? "minus" : plusOrMinus;
    while (match.value) {
      const value = match.value as RegExpMatchArray;
      const amount = parseInt(value[2]);
      if (value[4]) {
        priorDate = priorDate[sign]({ milliseconds: amount });
      } else if (value[5]) {
        priorDate = priorDate[sign]({ seconds: amount });
      } else if (value[6]) {
        priorDate = priorDate[sign]({ minutes: amount });
      } else if (value[7]) {
        priorDate = priorDate[sign]({ hours: amount });
      } else if (value[8]) {
        priorDate =
          sign === "minus"
            ? removeWeekdays(amount, priorDate)
            : addWeekdays(amount, priorDate);
      } else if (value[9]) {
        priorDate = priorDate[sign]({ days: amount });
      } else if (value[10]) {
        priorDate = priorDate[sign]({ weeks: amount });
      } else if (value[11]) {
        priorDate = priorDate[sign]({ months: amount });
      } else if (value[12]) {
        priorDate = priorDate[sign]({ years: amount });
      }
      match = matches.next();
    }
    return priorDate;
  }
}

function removeWeekdays(amount: number, fromDate: DateTime): DateTime {
  const currentWeekday = fromDate.weekday - 1;
  const lessThisWeek = amount - currentWeekday;

  if (lessThisWeek <= 0) {
    // We have enough this week, just subtract the days
    return fromDate.minus({ days: amount });
  }

  const numDaysInWeekend = 2;
  const numDaysInWeek = 7;
  const numWorkDaysInWeek = 5;

  const firstWeek = currentWeekday;

  const weeks = ~~(lessThisWeek / numWorkDaysInWeek);
  const remainder = lessThisWeek % numWorkDaysInWeek;

  const days = weeks * numDaysInWeek;
  const lastWeek = remainder ? numDaysInWeekend + remainder : 0;
  return fromDate.minus({ days: firstWeek + days + lastWeek });
}

function addWeekdays(amount: number, toDate: DateTime): DateTime {
  const currentWeekday = toDate.weekday;

  const saturday = 6;
  const thisWeek = saturday - currentWeekday;

  const lessThisWeek = amount - thisWeek;
  if (lessThisWeek <= 0) {
    // We have enough this week, just add the days
    return toDate.plus({ days: amount });
  } else {
    const numDaysInWeekend = 2;
    const numDaysInWeek = 7;
    const numWorkDaysInWeek = 5;

    const firstWeek = thisWeek;

    const weeks = ~~(lessThisWeek / numWorkDaysInWeek);
    const remainder = lessThisWeek % numWorkDaysInWeek;

    // Get up through Friday
    const days = weeks * numDaysInWeek;

    // If there's a remainder, add the last weekend back
    const lastWeek = remainder ? numDaysInWeekend + remainder : 0;
    return toDate.plus({ days: firstWeek + days + lastWeek });
  }
}

export interface DateRange {
  fromDateTime: DateTime;
  toDateTime: DateTime;
}

export type DateTimeIso = string;

export class DateRangePart implements DateRange {
  fromDateTime: DateTime;
  toDateTime: DateTime;
  originalString?: string;
  eventText: string;
  dateRangeInText: Range;
  definition: Range;
  recurrence?: Recurrence;
  isRelative: boolean;
  recurrenceRangeInText?: Range;
  fromRelativeTo?: { path: Path; dt: DateTime };
  toRelativeTo?: { path: Path; dt: DateTime };

  constructor({
    from,
    to,
    originalString,
    dateRangeInText,
    eventText,
    definition,
    isRelative,
    recurrence,
    fromRelativeTo,
    toRelativeTo,
  }: {
    from: DateTime;
    to: DateTime;
    originalString: string;
    dateRangeInText: Range;
    eventText: string;
    definition: Range;
    isRelative: boolean;
    recurrence?: RecurrenceInText;
    fromRelativeTo?: { path: Path; dt: DateTime };
    toRelativeTo?: { path: Path; dt: DateTime };
  }) {
    this.fromDateTime = from;
    this.toDateTime = to;
    this.originalString = originalString;
    this.dateRangeInText = dateRangeInText;
    this.eventText = eventText;
    this.recurrence = recurrence?.recurrence;
    this.recurrenceRangeInText = recurrence?.range;
    this.definition = definition;
    this.isRelative = isRelative;
    this.fromRelativeTo = fromRelativeTo;
    this.toRelativeTo = toRelativeTo;
  }
}

export const LINK_REGEX =
  /\[([^\]\<\>]+)\]\(((https?:\/\/)?[\w\d./\&\?=\-#:,_]+)\)/g;
export const LOCATION_REGEX = /\[([^\]]+)\]\((location|map)\)/g;
export const IMAGE_REGEX =
  /!\[([^\]\<\>]*)\]\(((https?:\/\/)?[\w\d./\&\?=\-#:,_]+)\)/;
export const AT_REGEX = /@([\w\d\/]+)/g;
const PERCENT_REGEX = /(?:\s|^)(\d{1,3})%(?:\s|$)/;

export enum BlockType {
  TEXT = "text",
  LIST_ITEM = "listItem",
  CHECKBOX = "checkbox",
  IMAGE = "image",
}

export interface MarkdownBlock {
  type: BlockType;
}

export class Block implements MarkdownBlock {
  type: BlockType;
  value?: any;
  raw: string;

  constructor(raw: string) {
    this.raw = raw;
    if (raw.startsWith("- []")) {
      this.type = BlockType.CHECKBOX;
      this.value = false;
      this.raw = raw.substring(4).trim();
    } else if (raw.startsWith("- [ ]")) {
      this.type = BlockType.CHECKBOX;
      this.value = false;
      this.raw = raw.substring(5).trim();
    } else if (raw.startsWith("- [x]")) {
      this.type = BlockType.CHECKBOX;
      this.value = true;
      this.raw = raw.substring(5).trim();
    } else if (raw.startsWith("- ")) {
      this.type = BlockType.LIST_ITEM;
      this.raw = raw.substring(2);
    } else {
      this.type = BlockType.TEXT;
    }
  }
}

export class Image implements MarkdownBlock {
  type = "image" as BlockType;

  altText: string;
  link: string;

  constructor(altText: string, link: string) {
    this.altText = altText;
    this.link = link;
  }
}

export class EventDescription {
  eventDescription: string;
  tags: string[] = [];
  supplemental = [] as MarkdownBlock[];
  matchedListItems: Range[];
  locations: string[] = [];
  id?: string;
  percent?: number;
  completed?: boolean;

  constructor(lines: string[], matchedListItems: Range[], completed?: boolean) {
    this.matchedListItems = matchedListItems;
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.match(COMMENT_REGEX)) {
        continue;
      }
      // only get the image if it's on the first line, others will be scooped up by supplemental
      if (i === 0) {
        line = line.replace(
          IMAGE_REGEX,
          (match, altText: string, link: string) => {
            this.supplemental.push(new Image(altText, addHttpIfNeeded(link)));
            return "";
          }
        );
      }
      line = line.replace(LOCATION_REGEX, (match, locationString) => {
        this.locations.push(locationString);
        return "";
      });
      line = line.replace(TAG_REGEX, (match, tag) => {
        if (!this.tags.includes(tag)) {
          this.tags.push(tag);
        }
        return "";
      });
      if (i === 0) {
        line = line.replace(EVENT_ID_REGEX, (match, id) => {
          if (!this.id) {
            this.id = id;
            return "";
          }
          return id;
        });
      }
      if (!this.percent) {
        const percent = line.match(PERCENT_REGEX);
        if (percent) {
          this.percent = parseInt(percent[0]);
        }
      }
      lines[i] = line;
    }
    this.eventDescription = lines[0];
    this.supplemental = this.supplemental.concat(
      lines
        .slice(1)
        .filter((l) => !l.match(COMMENT_REGEX) && !!l.trim())
        .map((raw) => {
          raw = raw.replace(TAG_REGEX, (match, tag) => {
            if (!this.tags.includes(tag)) {
              this.tags.push(tag);
            }
            return "";
          });
          const image = raw.match(IMAGE_REGEX);
          if (image) {
            return new Image(image[1], addHttpIfNeeded(image[2]));
          } else {
            return new Block(raw.trim());
          }
        })
    );
    this.completed = completed;
  }
}

export enum RangeType {
  Comment = "comment",
  CheckboxItemIndicator = "checkboxItemIndicator",
  listItemIndicator = "listItemIndicator",
  ListItemContents = "listItemContents",
  Tag = "tag",
  tagDefinition = "tagDefinition",
  Title = "title",
  View = "view",
  Viewer = "viewer",
  Description = "description",
  Section = "section",
  DateRange = "dateRange",
  DateRangeColon = "dateRangeColon",
  Event = "event",
  Edit = "edit",
  Editor = "editor",
  Recurrence = "recurrence",
  FrontmatterDelimiter = "frontMatterDelimiter",
  HeaderKey = "headerKey",
  HeaderKeyColon = "headerKeyColon",
  HeaderValue = "headerValue",
  PropertyKey = "propertyKey",
  PropertyKeyColon = "propertyKeyColon",
  PropertyValue = "propertyValue",
  EventDefinition = "eventDefinition",
  SectionDefinition = "sectionDefinition",
  Properties = "properties",
}

export type Range = {
  from: number;
  to: number;
  type: RangeType;
  content?: any;
};

export interface DateRangeIso {
  fromDateTimeIso: DateTimeIso;
  toDateTimeIso: DateTimeIso;
}

export const toDateRangeIso = (dr: DateRange): DateRangeIso => ({
  fromDateTimeIso: dr.fromDateTime.toISO()!,
  toDateTimeIso: dr.toDateTime.toISO()!,
});

export const toDateRange = (dr: DateRangeIso) => ({
  fromDateTime: DateTime.fromISO(dr.fromDateTimeIso, { setZone: true }),
  toDateTime: DateTime.fromISO(dr.toDateTimeIso, { setZone: true }),
});

export type Eventy = Event | EventGroup;
export function isEvent(eventy: Eventy): eventy is Event {
  return !(eventy as EventGroup).children;
}
export function isGroup(eventy: Eventy): eventy is EventGroup {
  return !isEvent(eventy);
}
export type GroupRange = DateRange & { maxFrom: DateTime };
export class EventGroup {
  textRanges!: {
    whole: Range;
    definition: Range;
    properties?: Range;
  };
  properties: any;
  propOrder: string[] = [];
  propRange?: Range;
  tags: string[] = [];
  title: string = "";
  range?: GroupRange;
  startExpanded?: boolean;
  style?: GroupStyle;

  children: Array<Event | EventGroup> = [];
}

export class Event {
  firstLine: {
    full: string;
    datePart?: string;
    rest: string;
    restTrimmed: string;
  };
  textRanges: {
    whole: Range;
    datePart: Range;
    definition: Range;
    recurrence?: Range;
    properties?: Range;
  };
  properties: any;
  propOrder: string[];
  dateRangeIso: DateRangeIso;
  recurrence?: Recurrence;
  tags: string[];
  supplemental: MarkdownBlock[];
  matchedListItems: Range[];
  isRelative: boolean;
  fromRelativeTo?: { path: Path; dt: DateTimeIso };
  toRelativeTo?: { path: Path; dt: DateTimeIso };
  id?: string;
  percent?: number;
  completed?: boolean;

  constructor(
    firstLine: string,
    properties: any,
    propOrder: string[],
    propRange: Range | undefined,
    dateRange: DateRangePart,
    rangeInText: Range,
    dateRangeInText: Range,
    eventDescription: EventDescription
  ) {
    this.firstLine = {
      full: firstLine,
      datePart: dateRange.originalString,
      rest: dateRange.eventText,
      restTrimmed: eventDescription.eventDescription,
    };
    this.properties = properties;
    this.propOrder = propOrder;
    this.textRanges = {
      whole: rangeInText,
      datePart: dateRangeInText,
      definition: dateRangeInText,
      recurrence: dateRange.recurrenceRangeInText,
      properties: propRange,
    };
    this.dateRangeIso = toDateRangeIso(dateRange);
    this.recurrence = dateRange.recurrence;
    this.tags = eventDescription.tags;
    this.supplemental = eventDescription.supplemental;
    this.matchedListItems = eventDescription.matchedListItems;
    this.id =
      (typeof properties.id === "string" ? properties.id : undefined) ||
      eventDescription.id;
    this.percent = eventDescription.percent;
    this.completed = eventDescription.completed;
    this.isRelative = dateRange.isRelative;
    this.fromRelativeTo = dateRange.fromRelativeTo
      ? {
          path: dateRange.fromRelativeTo.path,
          dt: dateRange.fromRelativeTo.dt.toISO()!,
        }
      : undefined;
    this.toRelativeTo = dateRange.toRelativeTo
      ? {
          path: dateRange.toRelativeTo.path,
          dt: dateRange.toRelativeTo.dt.toISO()!,
        }
      : undefined;
  }
}

export type Tags = { [tagName: string]: string };
export type IdedEvents = { [id: string]: number[] };
export interface Timeline {
  ranges: Range[];
  foldables: { [index: number]: Foldable };
  events: EventGroup;
  header: any;
  ids: IdedEvents;
  parseMessages: ParseMessage[];
  documentMessages: DocumentMessage[];
}

export function emptyTimeline(): Timeline {
  const now = DateTime.now();
  return {
    events: new EventGroup(),
    ranges: [],
    foldables: [],
    ids: {},
    header: {},
    parseMessages: [],
    documentMessages: [],
  };
}

export type ParseResult = Timeline & {
  cache?: Caches;
  parser: {
    version: string;
    incremental?: boolean;
  };
};

export type GroupStyle = "section" | "group";

export type Path = number[];

export const toArray = (node: Eventy) => {
  const array = [] as { path: Path; eventy: Eventy }[];
  for (const pathAndNode of iter(node)) {
    array.push(pathAndNode);
  }
  return array;
};

// We don't need 3 versions of iterating
export function* iterateTreeFromPath(
  root: EventGroup,
  path: Path
): Generator<{ eventy: Eventy; path: Path }, void, unknown> {
  // If path is empty, start from root
  if (path.length === 0) {
    yield* iter(root, []);
    return;
  }

  // Traverse to the parent of the node at path
  let parent: EventGroup = root;
  let parentPath: Path = [];

  for (let i = 0; i < path.length - 1; i++) {
    const index = path[i];
    if (!isGroup(parent) || index < 0 || index >= parent.children.length)
      return;
    const child = parent.children[index];
    if (!isGroup(child)) return; // invalid path — can't go deeper
    parent = child;
    parentPath.push(index);
  }

  const startIndex = path[path.length - 1];

  if (startIndex < 0 || startIndex >= parent.children.length) return;

  // Start DFS from this index in parent's children
  for (let i = startIndex; i < parent.children.length; i++) {
    const child = parent.children[i];
    yield* iter(child, [...parentPath, i]);
  }
}

// export function* iterFrom(
//   root: EventGroup,
//   path: number[]
// ): Generator<{ eventy: Eventy; path: Path }, void, unknown> {
//   let current: Eventy = root;
//   let currentPath: number[] = [];

//   for (let i = 0; i < path.length; i++) {
//     if (!isGroup(current)) return; // invalid path
//     const index = path[i];
//     if (index < 0 || index >= current.children.length) return;
//     current = current.children[index];
//     currentPath = [...currentPath, index];
//   }

//   yield* iter(current, currentPath);
// }

export function* iter(
  eventy: Eventy,
  path: Path = []
): Generator<{ eventy: Eventy; path: number[] }> {
  yield { eventy, path };
  if (eventy && isGroup(eventy)) {
    for (let i = 0; i < eventy.children.length; i++) {
      yield* iter(eventy.children[i], [...path, i]);
    }
  }
}

export const push = (
  node: Event | EventGroup,
  onto: EventGroup,
  path?: Path,
  tail?: Event
): { path: number[]; tail?: Event } => {
  if (!path || !path.length) {
    onto.children.push(node);
    if (!isEvent(node)) {
      return {
        path: [onto.children.length - 1, node.children.length],
        tail,
      };
    } else {
      return {
        path: [onto.children.length - 1],
        tail: node,
      };
    }
  } else {
    const { tail: newTail, path: newPath } = push(
      node,
      onto.children[path[0]] as EventGroup,
      path.slice(1),
      tail
    );
    return {
      path: [path[0], ...newPath],
      tail: newTail,
    };
  }
};

export const get = (root: Eventy, path: Path): Eventy | undefined => {
  if (!path.length) {
    return root;
  }
  // If it wasn't us and we don't have any nodes to offer,
  // return undefined
  const arr = root as EventGroup;
  if (!arr.children.length || arr.children.length - 1 < path[0]) {
    return undefined;
  }
  return get(arr.children[path[0]], path.slice(1));
};

export const getLast = (node: Eventy): { node: Eventy; path: Path } => {
  if (isEvent(node)) {
    return { node, path: [] };
  }
  if (!node.children.length) {
    return { node, path: [] };
  }
  const indexOfLast = node.children.length - 1;
  const result = getLast(node.children[indexOfLast]);
  return {
    node: result.node,
    path: [indexOfLast, ...result.path],
  };
};

export const flat = (node: Eventy) => flatMap(node, (n) => n) as Array<Event>;

export const flatMap = <T>(
  node: Eventy,
  mapper: (n: Eventy) => T
): Array<T> => {
  if (isEvent(node)) {
    return [mapper(node)];
  }
  return node.children.flatMap((n) => flatMap(n, mapper));
};

export const eventRange = (e: Event) => toDateRange(e.dateRangeIso);

export const ranges = (root?: Eventy): GroupRange | undefined => {
  if (!root) {
    return undefined;
  }

  if (isEvent(root)) {
    return {
      ...eventRange(root),
      maxFrom: eventRange(root).fromDateTime,
    };
  }

  const childRanges: GroupRange | undefined = root.children.reduce(
    (prev: GroupRange | undefined, curr) => {
      const currRange = ranges(curr);
      if (!prev) {
        return currRange;
      }
      if (!currRange) {
        return currRange;
      }

      const min =
        +currRange.fromDateTime < +prev.fromDateTime
          ? currRange.fromDateTime
          : prev.fromDateTime;
      const max =
        +currRange.toDateTime > +prev.toDateTime
          ? currRange.toDateTime
          : prev.toDateTime;
      const maxFrom =
        +currRange.maxFrom > +prev.maxFrom ? currRange.maxFrom : prev.maxFrom;

      const range = {
        fromDateTime: min,
        toDateTime: max,
        maxFrom,
      };
      return range;
    },
    undefined
  );

  return childRanges;
};
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/lineChecks/checkEvent.ts**
Status: Completed

```
import { getDateRangeFromCasualRegexMatch } from "../dateRange/getDateRangeFromCasualRegexMatch.js";
import { getDateRangeFromEDTFRegexMatch } from "../dateRange/getDateRangeFromEDTFRegexMatch.js";
import { getDateRangeFromBCEDateRegexMatch } from "../dateRange/getDateRangeFromBCEDateRegexMatch.js";
import {
  EDTF_START_REGEX,
  EVENT_START_REGEX,
  BCE_START_REGEX,
  GROUP_START_REGEX,
  GROUP_END_REGEX,
  COMPLETION_REGEX,
} from "../regex.js";
import {
  RangeType,
  EventDescription,
  Event,
  Range,
  DateRangePart,
  Path,
} from "../Types.js";
import { checkComments } from "./checkComments.js";
import { checkListItems } from "./checkListItems.js";
import { ParsingContext } from "../ParsingContext.js";
import { checkTags } from "./checkTags.js";
import { parseZone } from "../zones/parseZone.js";
import { parseProperties } from "../parseHeader.js";

function updateParseMetadata(
  event: Event,
  path: Path,
  dateRange: DateRangePart,
  context: ParsingContext
) {
  if (event.id && !context.ids[event.id]) {
    context.ids[event.id] = [...path];
  }

  if (!context.earliest || dateRange.fromDateTime < context.earliest) {
    context.earliest = dateRange.fromDateTime;
  }
  if (!context.latest || dateRange.toDateTime > context.latest) {
    context.latest = dateRange.toDateTime;
  }
  const eventDuration = +dateRange.toDateTime - +dateRange.fromDateTime;
  if (
    typeof context.maxDuration === "undefined" ||
    eventDuration > context.maxDuration
  ) {
    context.maxDuration = eventDuration;
  }
}

function checkCompletion(
  dateRange: DateRangePart,
  line: string,
  context: ParsingContext
) {
  const completionMatch = dateRange.eventText.match(COMPLETION_REGEX);
  const indexOfEventText = line.indexOf(dateRange.eventText);
  let completed = undefined;
  if (completionMatch) {
    const from =
      indexOfEventText + dateRange.eventText.indexOf(completionMatch[0]);
    const to =
      from +
      dateRange.eventText.indexOf(completionMatch[1]) +
      completionMatch[1].length;
    completed = ["X", "x"].some((x) => completionMatch.includes(x));

    const indicator: Range = {
      type: RangeType.CheckboxItemIndicator,
      from: dateRange.dateRangeInText.from + from,
      to: dateRange.dateRangeInText.from + to,
      content: completed,
    };
    context.ranges.push(indicator);
  }
  return completed;
}

export function checkEvent(
  line: string,
  lines: string[],
  i: number,
  lengthAtIndex: number[],
  context: ParsingContext
): number {
  let dateRange = getDateRangeFromEDTFRegexMatch(
    line,
    i,
    lengthAtIndex,
    context
  );
  if (!dateRange) {
    dateRange = getDateRangeFromCasualRegexMatch(
      line,
      i,
      lengthAtIndex,
      context
    );
  }
  if (!dateRange) {
    dateRange = getDateRangeFromBCEDateRegexMatch(
      line,
      i,
      lengthAtIndex,
      context
    );
  }
  if (!dateRange) {
    return i;
  }

  const {
    properties,
    i: from,
    propOrder,
    range: propRange,
  } = parseProperties(lines, lengthAtIndex, i + 1, context);

  const matchedListItems = [];
  let end = from - 1;
  let nextLine;

  while (true) {
    nextLine = lines[++end];
    if (
      typeof nextLine !== "string" ||
      nextLine.match(EDTF_START_REGEX) ||
      nextLine.match(EVENT_START_REGEX) ||
      nextLine.match(BCE_START_REGEX) ||
      nextLine.match(GROUP_START_REGEX) ||
      (context.currentPath.length > 1 && nextLine.match(GROUP_END_REGEX))
    ) {
      break;
    }

    checkComments(nextLine, end, lengthAtIndex, context);
    checkTags(nextLine, end, lengthAtIndex, context);

    const listItems = checkListItems(nextLine, end, lengthAtIndex, context);
    if (listItems) {
      matchedListItems.push(...listItems);
    }
  }

  const eventGroup = lines.slice(from - 1, end);

  const completed = checkCompletion(dateRange, line, context);

  eventGroup[0] = dateRange.eventText.trim();
  const eventDescription = new EventDescription(
    eventGroup,
    matchedListItems,
    completed
  );

  const tz = properties.timezone || properties.tz;
  if (tz) {
    if (typeof tz === "string" || typeof tz === "number") {
      const zone = parseZone(tz, context.cache);
      if (zone) {
        dateRange.fromDateTime = dateRange.fromDateTime.setZone(zone, {
          keepLocalTime: true,
        });
        dateRange.toDateTime = dateRange.toDateTime.setZone(zone, {
          keepLocalTime: true,
        });
      } else {
        context.parseMessages.push({
          type: "error",
          message: `Unable to parse timezone "${tz}"`,
          pos: [dateRange.dateRangeInText.from, dateRange.dateRangeInText.to],
        });
      }
    } else if (typeof tz === "object") {
      const from = tz.from;
      const to = tz.to;
      if (!from && !to) {
        context.parseMessages.push({
          type: "error",
          message:
            "Unable to parse distinct from and to timezones. Specify 'timezone.from' and/or 'timezone.to' to set zones for the start or end of ranges, respectively.",
          pos: [dateRange.dateRangeInText.from, dateRange.dateRangeInText.to],
        });
      }
      if (from) {
        const zone = parseZone(from, context.cache);
        if (zone) {
          dateRange.fromDateTime = dateRange.fromDateTime.setZone(zone, {
            keepLocalTime: true,
          });
        } else {
          context.parseMessages.push({
            type: "error",
            message: `Unable to parse 'from' timezone "${from}"`,
            pos: [dateRange.dateRangeInText.from, dateRange.dateRangeInText.to],
          });
        }
      }
      if (to) {
        const zone = parseZone(to, context.cache);
        if (zone) {
          dateRange.toDateTime = dateRange.toDateTime.setZone(zone, {
            keepLocalTime: true,
          });
        } else {
          context.parseMessages.push({
            type: "error",
            message: `Unable to parse 'to' timezone "${to}"`,
            pos: [dateRange.dateRangeInText.from, dateRange.dateRangeInText.to],
          });
        }
      }
    } else {
      context.parseMessages.push({
        type: "error",
        message: `Unable to parse timezone "${tz[1]}"`,
        pos: [dateRange.dateRangeInText.from, dateRange.dateRangeInText.to],
      });
    }
  }

  const eventRange: Range = {
    from: lengthAtIndex[i],
    to: lengthAtIndex[end],
    type: RangeType.Event,
  };

  const event = new Event(
    line,
    properties,
    propOrder,
    propRange,
    dateRange,
    eventRange,
    dateRange.dateRangeInText,
    eventDescription
  );

  if (event) {
    const path = context.push(event);
    updateParseMetadata(event, path, dateRange, context);
    if (end - i > 1 && eventRange.to - lengthAtIndex[i + 1] > 0) {
      context.foldables[lengthAtIndex[i]] = {
        startIndex: lengthAtIndex[i + 1] - 1,
        endIndex: eventRange.to - 1,
        type: "event",
        foldStartIndex: lengthAtIndex[i + 1] - 1,
        startLine: i,
      };
    }
  }
  return end - 1;
}
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/Cache.ts**
Status: Completed

```
import { LRUCache } from "lru-cache";
import { DateRangeIso, GranularDateTime } from "./Types.js";
import { Zone } from "luxon";

const newLru = <K, V extends {}>() => new LRUCache<string, V>({ max: 1000 });

export class Cache {
  slashDate: LRUCache<string, GranularDateTime> = newLru();
  roundDateUp: LRUCache<string, string> = newLru();
  ranges: LRUCache<string, DateRangeIso> = newLru();
}

export class Caches {
  zones: LRUCache<string, Zone> = newLru();
  yaml: LRUCache<string, any> = newLru();
  caches: [Zone, Cache][] = [];

  zone(timezone: Zone): Cache {
    for (let i = 0; i < this.caches.length; i++) {
      if (this.caches[i][0].equals(timezone)) {
        return this.caches[i][1];
      }
    }
    const cache = new Cache();
    this.caches.push([timezone, cache]);
    return cache;
  }
}
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/ParsingContext.ts (1 - 100)**
Status: Completed

```
import { DateTime, SystemZone, Zone } from "luxon";
import {
  Path,
  IdedEvents,
  AMERICAN_DATE_FORMAT,
  Timeline,
  Range,
  EventGroup,
  Eventy,
  push,
  get,
  Event,
  toDateRange,
} from "./Types.js";
import { parseZone } from "./zones/parseZone.js";
import { Caches } from "./Cache.js";

export interface Foldable {
  endIndex: number;
  type: "comment" | "section" | "header" | "event";
  startLine: number;
  startIndex?: number;
  foldStartIndex?: number;
}

export interface DocumentMessage {
  type: "error" | "warning";
  message: string;
}

export type ParseMessage = DocumentMessage & {
  pos: [number, number];
};

export class ParsingContext {
  now: DateTime;

  events: EventGroup;
  head?: Eventy;
  tail?: Event;
  currentPath: Path;

  ids: IdedEvents;
  title: string | undefined;
  description: string | undefined;
  paletteIndex: number;
  earliest: DateTime | undefined;
  latest: DateTime | undefined;
  maxDuration: number | undefined;
  foldables: {
    [F in number | string]: Foldable;
  };
  foldableSections: Foldable[];
  ranges: Range[];
  header: Record<string, any>;
  parseMessages: ParseMessage[] = [];
  documentMessages: DocumentMessage[] = [];
  cache?: Caches;

  constructor(
    now?: DateTime | string,
    cache?: Caches,
    getPriorEvent?: (c: ParsingContext) => Event | undefined
  ) {
    this.events = new EventGroup();
    this.ids = {};
    this.paletteIndex = 0;
    this.earliest = undefined;
    this.latest = undefined;
    this.maxDuration = undefined;
    this.currentPath = [];
    this.foldables = {};
    this.foldableSections = [];
    this.ranges = [];
    this.header = {};
    this.cache = cache;

    if (typeof now === "string") {
      const parsed = DateTime.fromISO(now);
      if (parsed.isValid) {
        this.now = parsed;
      } else {
        this.now = DateTime.now();
      }
    } else if (!now) {
      this.now = DateTime.now();
    } else {
      this.now = now;
    }

    if (getPriorEvent) {
      this.priorEvent = () => getPriorEvent(this);
    }
  }

  get zonedNow(): DateTime {
    return this.now.setZone(this.timezone);
  }

  public get timezone(): Zone {
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/lines.ts**
Status: Completed

```
import { Text } from "@codemirror/state";

export const linesAndLengths = (timelineString: string | string[] | Text) => {
  const lines: string[] = [];

  if (timelineString instanceof Text) {
    // Use Text.iterLines when available to avoid serializing the entire document
    if (typeof (timelineString as any).iterLines === "function") {
      for (const line of (timelineString as any).iterLines()) {
        lines.push(line as string);
      }
    } else {
      lines.push(...timelineString.toJSON());
    }
  } else if (Array.isArray(timelineString)) {
    lines.push(...timelineString);
  } else {
    lines.push(...timelineString.split("\n"));
  }

  const lengthAtIndex: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      lengthAtIndex.push(0);
    }
    lengthAtIndex.push(
      (i === lines.length - 1 ? 0 : 1) +
        lines[i].length +
        lengthAtIndex[lengthAtIndex.length - 1] || 0
    );
  }
  return { lines, lengthAtIndex };
};
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/incremental.ts (1 - 150)**
Status: Completed

```
import { ChangeSet, Text } from "@codemirror/state";
import { DateTime } from "luxon";
import {
  type Event,
  type EventGroup,
  type Eventy,
  get,
  isEvent,
  isGroup,
  iter,
  iterateTreeFromPath,
  type ParseResult,
  type Path,
  type Range,
} from "./Types.js";
import { parse, parsePastHeader } from "./parse.js";
import { Foldable, ParseMessage, ParsingContext } from "./ParsingContext.js";

function touchesRanges(
  rangeA: [number, number] | Range,
  [fromB, toB]: [number, number]
) {
  let fromA: number;
  let toA: number;
  if (Array.isArray(rangeA)) {
    [fromA, toA] = rangeA;
  } else {
    fromA = rangeA.from;
    toA = rangeA.to;
  }
  return toA >= fromB && toB >= fromA;
}

type EventyIterator = Generator<{ eventy: Eventy; path: Path }>;

const next = (it: EventyIterator) => {
  let {
    done,
    value,
  }: { done?: boolean; value: { eventy: Eventy; path: Path } } = it.next();
  return done ? { done } : { done, eventy: value.eventy, path: value.path };
};

type ChangedRange = {
  fromA: number;
  toA: number;
  fromB: number;
  toB: number;
  inserted: Text;
};

function getPreviousEventPath(root: EventGroup, path: Path): Path | undefined {
  let previousPath: Path | undefined;
  const target = path.join(",");

  for (const { eventy, path: currentPath } of iter(root)) {
    if (!isEvent(eventy)) {
      continue;
    }

    if (currentPath.join(",") === target) {
      return previousPath ? [...previousPath] : undefined;
    }

    previousPath = currentPath;
  }

  return undefined;
}

function asArray(changes: ChangeSet) {
  const c: ChangedRange[] = [];
  changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    c.push({ fromA, toA, fromB, toB, inserted });
  });
  return c;
}

// skip this subtree and go to next sibling or up to next uncle
function skip(root: Eventy, p: Path) {
  let path = [...p];
  const last = path.at(-1);
  if (last === undefined) {
    return;
  }
  path = [...path.slice(0, -1), last + 1];
  while (!get(root, path)) {
    // We can't just pop because we don't want to just go up,
    // that would just put us at our parent's and liable
    // to reenter the node we're trying to skip.
    path.pop();
    const last = path.at(-1);
    if (last === undefined) {
      return;
    }
    path = [...path.slice(0, -1), last + 1];
  }
  return path;
}

function getCommonAncestor(arrays: Path[]): Path {
  if (arrays.length === 0) return [];

  let prefix: Path = [];

  // Use the first array as a base for comparison
  const firstArray = arrays[0];

  for (let i = 0; i < firstArray.length; i++) {
    const currentValue = firstArray[i];

    // Check if this value is present at the same position in all other arrays
    for (let j = 1; j < arrays.length; j++) {
      if (i >= arrays[j].length || arrays[j][i] !== currentValue) {
        return prefix;
      }
    }

    // If all arrays have the same value at position i, add it to the prefix
    prefix.push(currentValue);
  }

  return prefix;
}

function getFromAndTo(
  change: ChangeSet,
  affected: Eventy[],
  preChange: boolean = true
) {
  let min = Number.POSITIVE_INFINITY,
    max = -1;

  if (!affected.length) {
    change.iterChangedRanges((fromA, toA, fromB, toB) => {
      if (fromB < min) {
        min = fromB;
      }
      if (toB > max) {
        max = toB;
      }
    });
    return [min, max];
  }

  for (let i = 0; i < affected.length; i++) {
    const { from, to } = affected[i].textRanges.whole;
    if (from < min) {
      min = from;
    }
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/dateRange/getDateRangeFromEDTFRegexMatch.ts (1 - 100)**
Status: Completed

```
import { DateTime, WeekdayNumbers, Zone } from "luxon";
import { ParsingContext } from "../ParsingContext.js";
import {
  EDTF_START_REGEX,
  edtfDatePartMatchIndex,
  from_edtfDateIndex,
  from_edtfDateMonthPart,
  from_edtfDateDayPart,
  to_edtfIndex,
  to_edtfDateIndex,
  to_edtfDateMonthPart,
  to_edtfDateDayPart,
  from_edtfBeforeOrAfterMatchIndex,
  to_edtfBeforeOrAfterMatchIndex,
  from_edtfRelativeMatchIndex,
  to_edtfRelativeMatchIndex,
  from_edtfNowMatchIndex,
  to_edtfNowMatchIndex,
  from_edtfRelativeEventIdMatchIndex,
  to_edtfRelativeEventIdMatchIndex,
  edtfEventTextMatchIndex,
  from_edtfDateTimePartMatchIndex,
  from_edtfDateTime24HourMinuteMatchIndex,
  from_edtfDateTimeMeridiemMeridiemMatchIndex,
  from_edtfDateTime24HourHourMatchIndex,
  from_edtfDateTimeMeridiemHourMatchIndex,
  to_edtfDateTimePartMatchIndex,
  to_edtfDateTime24HourHourMatchIndex,
  to_edtfDateTime24HourMinuteMatchIndex,
  to_edtfDateTimeMeridiemHourMatchIndex,
  to_edtfDateTimeMeridiemMeridiemMatchIndex,
  from_edtfDateTimeMeridiemMinuteMatchIndex,
  to_edtfDateTimeMeridiemMinuteMatchIndex,
  from_edtfRelativeEventIdStartOrEndMatchIndex,
  from_edtfRelativeEventStartOrEndMatchIndex,
  to_edtfRelativeEventIdStartOrEndMatchIndex,
  to_edtfRelativeEventStartOrEndMatchIndex,
  ISO_WEEK_DATE_PART,
} from "../regex.js";
import {
  DateRangePart,
  DateTimeGranularity,
  RelativeDate,
  RangeType,
  Range,
  toDateRange,
  isEvent,
  Path,
  Event,
} from "../Types.js";
import { getTimeFromRegExpMatch, roundDateUp } from "./utils.js";
import { checkEdtfRecurrence } from "./checkRecurrence.js";

const ISO_WEEK_REGEX = new RegExp(`^${ISO_WEEK_DATE_PART}$`, "i");

function parseISOWeekDate(
  raw: string,
  zone: string | Zone
): { dateTime: DateTime; granularity: DateTimeGranularity } | undefined {
  if (!ISO_WEEK_REGEX.test(raw)) {
    return;
  }
  const isoWeekMatch = raw.match(/^(\d{4})-?W(\d{2})(?:-?([1-7]))?$/i);
  if (!isoWeekMatch) {
    return;
  }
  const [, yearPart, weekPart, weekdayPart] = isoWeekMatch;
  const weekYear = parseInt(yearPart, 10);
  const weekNumber = parseInt(weekPart, 10);
  const weekday: WeekdayNumbers = (weekdayPart
    ? parseInt(weekdayPart, 10)
    : 1) as WeekdayNumbers;
  const dateTime = DateTime.fromObject(
    {
      weekYear,
      weekNumber,
      weekday,
    },
    { zone }
  );
  if (!dateTime.isValid) {
    return;
  }
  const granularity: DateTimeGranularity = weekdayPart ? "day" : "week";
  return { dateTime, granularity };
}

export function getDateRangeFromEDTFRegexMatch(
  line: string,
  i: number,
  lengthAtIndex: number[],
  context: ParsingContext
): DateRangePart | undefined {
  const eventStartLineRegexMatch = line.match(EDTF_START_REGEX);
  if (!eventStartLineRegexMatch) {
    return;
  }
  const datePart = eventStartLineRegexMatch[edtfDatePartMatchIndex];

  const edtfFrom = eventStartLineRegexMatch[from_edtfDateIndex];
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/regex.ts (1 - 80)**
Status: Completed

```
// Amounts
export const MILLISECOND_AMOUNT_REGEX = /(milliseconds|ms)/i;
export const SECOND_AMOUNT_REGEX = /(seconds|second|secs|sec|s)/i;
export const MINUTE_AMOUNT_REGEX = /(minutes|minute|mins|min)/i;
export const HOUR_AMOUNT_REGEX = /(hours|hour|h)/i;
// export const DAY_AMOUNT_REGEX = /(?:work\s*)?(days|day|d)/i;
export const DAY_AMOUNT_REGEX =
  /(?:(week\s*|work\s*|business\s*)?(days|day|d))/i;
export const WEEK_AMOUNT_REGEX = /(weeks|week|w)/i;
export const MONTH_AMOUNT_REGEX = /(months|month)/i;
export const YEAR_AMOUNT_REGEX = /(years|year|y)/i;
export const AMOUNT_REGEX = new RegExp(
  `(-)?(\\d+\\W*)(${MILLISECOND_AMOUNT_REGEX.source}|${SECOND_AMOUNT_REGEX.source}|${MINUTE_AMOUNT_REGEX.source}|${HOUR_AMOUNT_REGEX.source}|${DAY_AMOUNT_REGEX.source}|${WEEK_AMOUNT_REGEX.source}|${MONTH_AMOUNT_REGEX.source}|${YEAR_AMOUNT_REGEX.source})(?:\\s*,\\s*|\\s*)`,
  "g"
);

export const EVENT_ID_REGEX =
  /(?:\W|^)(?:!(\w+)(\.(start|end))?|\.(start|end))/;
// So this regex is kind of wrong - we're using the global flag here to make multiple matches for the
// whole regex, even though we just want any repeated amounts (e.g., 3 days, 4 hours, 6 seconds).
// This works because the entire front part (`after !eventId plus`) is optional
export const RELATIVE_TIME_REGEX = new RegExp(
  `(by|before|after)?(\\s*${EVENT_ID_REGEX.source}\\s*)?(?:plus|\\+)?\\s*(${AMOUNT_REGEX.source})*`
);

export const FULL_MONTH_REGEX =
  /january|february|march|april|may|june|july|august|september|october|november|december/;
export const ABBR_MONTH_REGEX =
  /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/;
export const HUMAN_MONTH_REGEX = new RegExp(
  `(?:(${FULL_MONTH_REGEX.source})|(${ABBR_MONTH_REGEX.source}))`
);
export const DAY_FIRST_MONTH_REGEX = new RegExp(
  `(([0-3]?[0-9])\\s+${HUMAN_MONTH_REGEX.source})`
);
export const MONTH_FIRST_MONTH_REGEX = new RegExp(
  `(${HUMAN_MONTH_REGEX.source}\\s+([0-3]?[0-9](?!\\d)))`
);
export const TIME_REGEX =
  /((1|2|3|4|5|6|7|8|9|10|11|12)(:\d{2})?([ap]m)|([012]?[0-9])(:\d{2})?)/;
export const CASUAL_MONTH_REGEX = new RegExp(
  `(?:(?:${DAY_FIRST_MONTH_REGEX.source}|${MONTH_FIRST_MONTH_REGEX.source}),?(?:\\s+(\\d{4}),?)?(?:\\s+${TIME_REGEX.source})?)|(${HUMAN_MONTH_REGEX.source}(?:\\s+(\\d{1,4}))?)`
);

export const ISO_WEEK_DATE_PART = `\\d{4}-?W\\d{2}(?:-?[1-7])?`;

export const ISO8601_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2,}(?:\.\d*)?Z/;
export const NOW_REGEX = /now/;
export const DATE_REGEX = new RegExp(
  `(${ISO_WEEK_DATE_PART}|\\d{1,5}(\\/\\d{1,5}(\\/\\d{1,5}(?:(?:,|\\s)+${TIME_REGEX.source})?)?)?)`
);

export const START_OR_END_TIME_REGEX = new RegExp(
  `(${ISO8601_REGEX.source})|(${NOW_REGEX.source})|${TIME_REGEX.source}|(${DATE_REGEX.source})|(${RELATIVE_TIME_REGEX.source})|${CASUAL_MONTH_REGEX.source}`
);

export const RECURRENCE_AMOUNT_REGEX = new RegExp(
  `(?:(\\d+|other)?\\s*)(${MILLISECOND_AMOUNT_REGEX.source}|${SECOND_AMOUNT_REGEX.source}|${MINUTE_AMOUNT_REGEX.source}|${HOUR_AMOUNT_REGEX.source}|${DAY_AMOUNT_REGEX.source}|${WEEK_AMOUNT_REGEX.source}|${MONTH_AMOUNT_REGEX.source}|${YEAR_AMOUNT_REGEX.source})`,
  "g"
);

export const REPETITIONS_REGEX = new RegExp(
  `((\\s+for\\s+(\\d+\\W*)(${MILLISECOND_AMOUNT_REGEX.source}|${SECOND_AMOUNT_REGEX.source}|${MINUTE_AMOUNT_REGEX.source}|${HOUR_AMOUNT_REGEX.source}|${DAY_AMOUNT_REGEX.source}|${WEEK_AMOUNT_REGEX.source}|${MONTH_AMOUNT_REGEX.source}|${YEAR_AMOUNT_REGEX.source}|(times)))|(\\s+x\\s*(\\d+)))?`
);

export const UNTIL_REGEX = new RegExp(
  `(\\s+(?:(?:(?:un)?til)|(?:to)|(?:\\|))\\s+(${START_OR_END_TIME_REGEX.source}))?`
);

export const RECURRENCE_REGEX = new RegExp(`\\s*every[^:]+`);

export const DATE_RANGE_REGEX = new RegExp(
  `((${START_OR_END_TIME_REGEX.source})(?:(?:(?:\\s*-\\s*)|(?:\\s+to\\s+))(${START_OR_END_TIME_REGEX.source}))?)(${RECURRENCE_REGEX.source})?\\s*:`
);

export const EVENT_START_REGEX = new RegExp(
  `^(\\s*)${DATE_RANGE_REGEX.source}(.*)`,
  "i"
);

```

**Tool Call: `find /home/sawyer/Osmosis/ref/parser/src -type f -name "*.ts" | sort`**
Status: Completed

Terminal:
```
/home/sawyer/Osmosis/ref/parser/src/Cache.ts
/home/sawyer/Osmosis/ref/parser/src/ColorUtils.ts
/home/sawyer/Osmosis/ref/parser/src/ParsingContext.ts
/home/sawyer/Osmosis/ref/parser/src/Types.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/checkRecurrence.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/getDateRangeFromBCEDateRegexMatch.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/getDateRangeFromCasualRegexMatch.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/getDateRangeFromEDTFRegexMatch.ts
/home/sawyer/Osmosis/ref/parser/src/dateRange/utils.ts
/home/sawyer/Osmosis/ref/parser/src/ical.d.ts
/home/sawyer/Osmosis/ref/parser/src/ical.ts
/home/sawyer/Osmosis/ref/parser/src/incremental.ts
/home/sawyer/Osmosis/ref/parser/src/index.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkComments.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkDescription.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkEvent.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkGroupEnd.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkGroupStart.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkListItems.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkNonEvents.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkTagColors.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkTags.ts
/home/sawyer/Osmosis/ref/parser/src/lineChecks/checkTitle.ts
/home/sawyer/Osmosis/ref/parser/src/lines.ts
/home/sawyer/Osmosis/ref/parser/src/parse.ts
/home/sawyer/Osmosis/ref/parser/src/parseHeader.ts
/home/sawyer/Osmosis/ref/parser/src/profile.ts
/home/sawyer/Osmosis/ref/parser/src/regex.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/dateRangeToString.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/header.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/html.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/properties.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/recurrence.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/urls.ts
/home/sawyer/Osmosis/ref/parser/src/utilities/yaml.ts
/home/sawyer/Osmosis/ref/parser/src/zones/parseZone.ts

```


**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/index.ts**
Status: Completed

```
import { parse, parseDateRange, parseHeader, parseICal } from "./parse.js";
import { incrementalParse } from "./incremental.js";
import { profileParse, type ParseTimings } from "./profile.js";
import { Cache, Caches } from "./Cache.js";
import {
  COLORS,
  HUMAN_COLORS,
  hexToRgb,
  rgbStringToHex,
} from "./ColorUtils.js";
import {
  type Foldable,
  ParsingContext,
  type ParseMessage,
} from "./ParsingContext.js";
import {
  AMERICAN_DATE_FORMAT,
  AT_REGEX,
  Block,
  BlockType,
  type DateTimeIso,
  type DateTimeGranularity,
  type DateFormat,
  type DateRange,
  type DateRangeIso,
  DATE_TIME_FORMAT_MONTH_YEAR,
  DATE_TIME_FORMAT_YEAR,
  DateRangePart,
  EUROPEAN_DATE_FORMAT,
  Event,
  EventDescription,
  IMAGE_REGEX,
  Image,
  LINK_REGEX,
  LOCATION_REGEX,
  type Path,
  RangeType,
  RelativeDate,
  emptyTimeline,
  toDateRange,
  toDateRangeIso,
  type ParseResult,
  type Timeline,
  type Range,
  type MarkdownBlock,
  type Eventy,
  EventGroup,
  type GroupRange,
  eventRange,
  flat,
  flatMap,
  get,
  getLast,
  isEvent,
  push,
  ranges,
  toArray,
  iter,
} from "./Types.js";
import { expand } from "./utilities/recurrence.js";
import {
  COMPLETION_REGEX,
  RECURRENCE_AMOUNT_REGEX,
  RELATIVE_TIME_REGEX,
  EVENT_ID_REGEX,
} from "./regex.js";
import type { Recurrence } from "./dateRange/checkRecurrence.js";
import { dateRangeToString } from "./utilities/dateRangeToString.js";
import { mapUrls, toArray as toArraySorted } from "./utilities/urls.js";
import { set as headerSet } from "./utilities/header.js";
import { entrySet } from "./utilities/properties.js";
import { toICal } from "./ical.js";

export {
  parse,
  parseDateRange,
  parseHeader,
  parseICal,
  Cache,
  Caches,
  COLORS,
  HUMAN_COLORS,
  hexToRgb,
  rgbStringToHex,
  Eventy,
  EventGroup,
  GroupRange,
  eventRange,
  flat,
  flatMap,
  get,
  getLast,
  isEvent,
  push,
  ranges,
  toArray,
  iter,
  Foldable,
  ParsingContext,
  AMERICAN_DATE_FORMAT,
  AT_REGEX,
  Block,
  BlockType,
  DATE_TIME_FORMAT_MONTH_YEAR,
  DATE_TIME_FORMAT_YEAR,
  DateRangePart,
  EUROPEAN_DATE_FORMAT,
  Event,
  EventDescription,
  IMAGE_REGEX,
  Image,
  LINK_REGEX,
  LOCATION_REGEX,
  Path,
  RangeType,
  RelativeDate,
  emptyTimeline,
  toDateRange,
  toDateRangeIso,
  dateRangeToString,
  DateTimeGranularity,
  DateFormat,
  DateRange,
  DateRangeIso,
  DateTimeIso,
  ParseResult,
  Timeline,
  Range,
  expand,
  COMPLETION_REGEX,
  Recurrence,
  MarkdownBlock,
  RECURRENCE_AMOUNT_REGEX,
  RELATIVE_TIME_REGEX,
  EVENT_ID_REGEX,
  mapUrls,
  toArraySorted,
  headerSet,
  ParseMessage,
  incrementalParse,
  profileParse,
  ParseTimings,
  toICal,
  entrySet,
};
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/parseHeader.ts (1 - 80)**
Status: Completed

```
import { Foldable, ParsingContext } from "./ParsingContext.js";
import * as YAML from "yaml";
import {
  AMERICAN_DATE_FORMAT,
  EUROPEAN_DATE_FORMAT,
  Range,
  RangeType,
} from "./Types.js";
import { checkComments } from "./lineChecks/checkComments.js";
import {
  BCE_START_REGEX,
  EDTF_START_REGEX,
  EVENT_START_REGEX,
  GROUP_START_REGEX,
} from "./regex.js";
import { parseZone } from "./zones/parseZone.js";
import {
  checkHeaderTags,
  propertyHexReplacer,
} from "./lineChecks/checkTags.js";

const stringEmailListToArray = (s: string) =>
  s
    .trim()
    .split(/ |,/)
    .filter(
      (email) =>
        (!!email && email.includes("@")) || email === "*" || email === "\\*"
    );

const headerKeyRegex = /^([^:]+)(:)(?:\s|$)/;
const propertyKeyRegex = /^(?!-)\s*([\w\-\.]+)(:)(?:\s|$)/;
const headerValueRegex = /(:)\s+(.+)$/;

const eventsStarted = (line: string) =>
  !!line.match(EDTF_START_REGEX) ||
  !!line.match(EVENT_START_REGEX) ||
  !!line.match(BCE_START_REGEX) ||
  !!line.match(GROUP_START_REGEX);

const threeDashRegex = /^---/;

export function parseProperties(
  lines: string[],
  lengthAtIndex: number[],
  i: number,
  context: ParsingContext
) {
  let propertiesStartLineIndex = i;
  let propertiesEndLineIndex = propertiesStartLineIndex;

  let firstPropertiesLineIndexWithText = -1;
  let lastPropertiesLineIndexWithText = -1;

  const propertyRanges = [];
  const propertyLines = [];

  let hasThreeDashStart = false;
  const threeDashRanges = [];

  let line = lines[propertiesStartLineIndex];
  while (typeof line !== "undefined") {
    if (!hasThreeDashStart && eventsStarted(line)) {
      break;
    }

    const isThreeDash = line.match(threeDashRegex);
    if (isThreeDash) {
      const range = {
        type: RangeType.FrontmatterDelimiter,
        from: lengthAtIndex[propertiesEndLineIndex],
        to: lengthAtIndex[propertiesEndLineIndex] + 4,
      };
      threeDashRanges.push(range);
      if (!hasThreeDashStart) {
        propertiesStartLineIndex = propertiesEndLineIndex;
        hasThreeDashStart = true;
      } else {
        if (threeDashRanges.length === 2) {
          context.ranges.push(threeDashRanges[0]);
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/profile.ts**
Status: Completed

```
import { Text } from "@codemirror/state";
import { DateTime } from "luxon";
import { linesAndLengths } from "./lines.js";
import { ParsingContext } from "./ParsingContext.js";
import { parseHeader as parseHeaderImpl } from "./parseHeader.js";
import { parsePastHeader } from "./parse.js";
import { Caches } from "./Cache.js";
import { emptyTimeline, type ParseResult } from "./Types.js";

export type ParseTimings = {
  total: number;
  lines: number;
  header: number;
  body: number;
};

const perfNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export function profileParse(
  timelineString?: string | string[] | Text,
  cache?: Caches | true,
  now?: DateTime | string
): { parseResult: ParseResult; timings: ParseTimings } {
  const startTotal = perfNow();

  if (cache === true) {
    cache = new Caches();
  }

  if (!timelineString) {
    const total = perfNow() - startTotal;
    return {
      parseResult: { ...emptyTimeline(), cache, parser: { version: "0.0.0" } },
      timings: { total, lines: 0, header: 0, body: 0 },
    };
  }

  const startLines = perfNow();
  const { lines, lengthAtIndex } = linesAndLengths(timelineString);
  const linesMs = perfNow() - startLines;

  const context = new ParsingContext(now, cache);

  const startHeader = perfNow();
  const headerEndLineIndex = parseHeaderImpl(lines, lengthAtIndex, context);
  const headerMs = perfNow() - startHeader;

  const startBody = perfNow();
  parsePastHeader(headerEndLineIndex, context, lines, lengthAtIndex);
  const bodyMs = perfNow() - startBody;

  const parseResult: ParseResult = {
    ...context.toTimeline(),
    cache,
    parser: { version: "0.0.0" },
  };

  const total = perfNow() - startTotal;
  return {
    parseResult,
    timings: { total, lines: linesMs, header: headerMs, body: bodyMs },
  };
}
```

**Tool Call: Find `/home/sawyer/Osmosis/ref/parser/tests/*.test.ts`**
Status: Completed

/home/sawyer/Osmosis/ref/parser/tests/entryProperties.test.ts
/home/sawyer/Osmosis/ref/parser/tests/dates.test.ts
/home/sawyer/Osmosis/ref/parser/tests/foldables.test.ts
/home/sawyer/Osmosis/ref/parser/tests/ical.test.ts
/home/sawyer/Osmosis/ref/parser/tests/header.test.ts
/home/sawyer/Osmosis/ref/parser/tests/ids.test.ts
/home/sawyer/Osmosis/ref/parser/tests/incremental.test.ts
/home/sawyer/Osmosis/ref/parser/tests/regex.test.ts
/home/sawyer/Osmosis/ref/parser/tests/perf.test.ts
/home/sawyer/Osmosis/ref/parser/tests/relative.test.ts
/home/sawyer/Osmosis/ref/parser/tests/recurrence.test.ts
/home/sawyer/Osmosis/ref/parser/tests/main.test.ts
/home/sawyer/Osmosis/ref/parser/tests/zones.test.ts
/home/sawyer/Osmosis/ref/parser/tests/timezones.test.ts
/home/sawyer/Osmosis/ref/parser/tests/urls.test.ts

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/lineChecks/checkGroupStart.ts**
Status: Completed

```
import { ParsingContext } from "../ParsingContext.js";
import { parseGroupFromStartTag } from "../dateRange/utils.js";
import { GROUP_START_REGEX } from "../regex.js";
import { RangeType } from "../Types.js";
import { parseZone } from "../zones/parseZone.js";
import { parseProperties } from "../parseHeader.js";

export function checkGroupStart(
  lines: string[],
  i: number,
  lengthAtIndex: number[],
  context: ParsingContext
): { end: number } | false {
  const line = lines[i];
  const groupStart = line.match(GROUP_START_REGEX);
  if (groupStart) {
    // We're starting a new group here.
    // Use the path to determine where it goes.
    const range = {
      from: lengthAtIndex[i],
      to: lengthAtIndex[i] + groupStart[0].length,
      type: RangeType.Section,
    };
    context.ranges.push(range);

    // This should create a new Array<Node> that we can push
    const group = parseGroupFromStartTag(line, groupStart, range);
    const {
      properties,
      i: end,
      propOrder,
      range: propRange,
    } = parseProperties(lines, lengthAtIndex, i + 1, context);

    group.properties = properties;
    group.propOrder = propOrder;
    group.textRanges.properties = propRange;
    let tz = properties.timezone || properties.tz;
    if (typeof tz !== "string" && typeof tz !== "number") {
      tz = undefined;
    }
    if (tz) {
      const zone = parseZone(tz, context.cache);
      // We're not saving it on the group but instead looking it up when needed. Parsing
      // it now will save it in the cache
      // We can, though, indicate whether the zone is erroneous with a parse message.
      if (!zone) {
        context.parseMessages.push({
          type: "error",
          message: `Unable to parse timezone "${tz}"`,
          pos: [range.from, range.to],
        });
      }
    }

    context.push(group);
    context.startFoldableSection({
      type: RangeType.Section,
      startLine: i,
      startIndex: lengthAtIndex[i],
      endIndex: lengthAtIndex[i] + line.length,
      foldStartIndex: lengthAtIndex[i] + line.length,
    });

    return { end };
  }
  return false;
}
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/lineChecks/checkNonEvents.ts**
Status: Completed

```
import { Caches } from "../Cache.js";
import { ParsingContext } from "../ParsingContext.js";
import { checkComments } from "./checkComments.js";
import { checkGroupEnd } from "./checkGroupEnd.js";
import { checkTags } from "./checkTags.js";

export function checkNonEvents(
  line: string,
  i: number,
  lengthAtIndex: number[],
  context: ParsingContext
): boolean {
  return [checkComments, checkTags, checkGroupEnd].some((f) =>
    f(line, i, lengthAtIndex, context)
  );
}
```

**Tool Call: Read /home/sawyer/Osmosis/ref/parser/src/utilities/yaml.ts**
Status: Completed

```
export function findLine(
  lines: string[],
  regex: RegExp,
  searchRange: SearchRange
) {
  for (let i = searchRange.startLine; i < searchRange.endLine; i++) {
    if (regex.test(lines[i])) {
      return i;
    }
  }
  return -1;
}

export type SearchRange = {
  startLine: number;
  endLine: number;
};

export const objFromKeysAndValue = (keys: string[], value: any) => {
  const last = keys.pop()!;
  let obj = { [last]: value };
  for (let i = keys.length - 1; i >= 0; i--) {
    obj = { [keys[i]]: obj };
  }
  return obj;
};

export const parentAndFlowReplacer = (s: string) =>
  parenReplacer(s).replace(/(^|\W+)'(\[.*\])'(?:$|\W+)/g, "$1$2");

export const parenReplacer = (s: string) =>
  s.replace(
    /(^|\W+)\)(\w+)/g,
    (
      match: string,
      preHashWhitespace: string,
      tagName: string,
      offset: number,
      str: string
    ) => `${preHashWhitespace}#${tagName}`
  );

export const hashReplacer = (s: string) =>
  s.replace(
    /(^|\W+)#(\w+)/g,
    (
      match: string,
      preHashWhitespace: string,
      tagName: string,
      offset: number,
      str: string
    ) => `${preHashWhitespace})${tagName}`
  );

export function deepMergeAtPath(
  existingData: any,
  keyPath: string[],
  newValue: any
): any {
  if (keyPath.length === 0) {
    if (
      typeof existingData === "object" &&
      existingData !== null &&
      typeof newValue === "object" &&
      newValue !== null
    ) {
      return { ...existingData, ...newValue };
    }
    return newValue;
  }

  const [currentKey, ...remainingPath] = keyPath;
  const existingObj =
    typeof existingData === "object" && existingData !== null
      ? existingData
      : {};

  return {
    ...existingObj,
    [currentKey]: deepMergeAtPath(
      existingObj[currentKey],
      remainingPath,
      newValue
    ),
  };
}

export function getMergedValue(
  existingData: any,
  keyPath: string[],
  newValue: any,
  merge: boolean
): any {
  if (!merge || !existingData) {
    return newValue;
  }

  let current = existingData;
  for (const segment of keyPath) {
    if (current && typeof current === "object" && segment in current) {
      current = current[segment];
    } else {
      return newValue;
    }
  }

  if (
    typeof current === "object" &&
    current !== null &&
    typeof newValue === "object" &&
    newValue !== null
  ) {
    return { ...current, ...newValue };
  }

  return newValue;
}

function _hashReplacer(obj: any): any {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return obj;
  }

  const result = { ...obj };

  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === "string") {
      result[k] = hashReplacer(obj[k]);
    } else if (typeof obj[k] === "object" && obj[k] !== null) {
      result[k] = _hashReplacer(obj[k]);
    } else {
      result[k] = obj[k];
    }
  }

  return result;
}

// Helper function to deeply merge objects
export function setValue(existing: any, newObject: any, merge: boolean): any {
  // If not merging, just return the new object
  if (!merge) {
    return _hashReplacer(newObject);
  }

  // If either value is not an object, return the new value
  if (
    typeof existing !== "object" ||
    existing === null ||
    typeof newObject !== "object" ||
    newObject === null
  ) {
    return newObject;
  }

  const result = { ...existing };

  for (const key in newObject) {
    if (newObject.hasOwnProperty(key)) {
      const newValue = newObject[key];

      const correctedValue =
        typeof newValue === "string" ? hashReplacer(newValue) : newValue;

      if (
        merge &&
        typeof result[key] === "object" &&
        result[key] !== null &&
        typeof correctedValue === "object" &&
        correctedValue !== null
      ) {
        result[key] = setValue(result[key], correctedValue, merge);
      } else {
        result[key] = correctedValue;
      }
    }
  }

  return result;
}
```

## Assistant



Excellent reference. Markwhen's architecture is a great blueprint. Key takeaways for Osmosis:

- **"Fast parser → intermediate representation → swappable view"** — parse markdown into a tree model once, then mind map view, timeline view, and study mode all consume the same model
- **Early-exit optimizations** — like Markwhen's "no colon, skip the line" trick, we'd do "no heading/bullet/number prefix, skip expensive parsing"
- **Incremental parsing** — critical for the bidirectional sync. When the user edits one line in the markdown, don't re-parse the entire file. Markwhen tracks changed ranges via CodeMirror and only re-parses affected sections
- **Range tracking on every node** — every AST node knows its character position in the source. This is how we'd sync cursor position between the markdown editor and the mind map
- **LRU caching** — cache parsed results so repeated operations (like switching views) are near-instant

Now let me update inspo.md with everything we've discussed.

**Tool Call: Read /home/sawyer/Osmosis/notes/00_inspiration/inspo.md**
Status: Completed

```
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
- [x] Timeline
- [N/A] Tree Chart
- [N/A] Tree Table (nested rectangles, subtopics horizontal)
- [N/A] Matrix

#### Topic Types
- [x] Central Topic (root node)
- [x] Main Topic (first-level branches)
- [x] Subtopic (deeper branches)
- [x] Floating Topic (unconnected node placed anywhere)
- [x] Summary Topic (generated from summary element)

#### Topic Elements
- [~] Relationship lines (connect two related topics with customizable line style, color, arrow, text)
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
```

## Assistant

I notice the checklist still shows Floating Topic as `[x]` and Relationship lines as `[~]`, and I don't see the footnote idea yet. You mentioned you'd added it — let me check if there's a newer version, or if those updates haven't been saved yet. Either way, let me update the document comprehensively with all our decisions.

**Tool Call: Edit `/home/sawyer/Osmosis/notes/00_inspiration/inspo.md`**
Status: Completed

Diff: /home/sawyer/Osmosis/notes/00_inspiration/inspo.md
```
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

```


## Assistant

Now let me update the checklist to reflect our decisions (floating topics removed, relationship lines to nice-to-have, map structures narrowed) and add the footnote idea, plus fill in the Technology Thoughts section.

**Tool Call: Edit `/home/sawyer/Osmosis/notes/00_inspiration/inspo.md`**
Status: Completed

Diff: /home/sawyer/Osmosis/notes/00_inspiration/inspo.md
```

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
```


**Tool Call: Edit `/home/sawyer/Osmosis/notes/00_inspiration/inspo.md`**
Status: Completed

Diff: /home/sawyer/Osmosis/notes/00_inspiration/inspo.md
```
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
```


**Tool Call: Edit `/home/sawyer/Osmosis/notes/00_inspiration/inspo.md`**
Status: Completed

Diff: /home/sawyer/Osmosis/notes/00_inspiration/inspo.md
```
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
```


## Assistant

Done. The `inspo.md` now has comprehensive documentation of all our decisions in three updated sections:

- **Claude Brainstorm Session** — full write-up of every decision and its rationale (engine choice, rendering approach, map structures, sync model, study modes, data storage, what we abandoned and why)
- **Feature Brainstorm** — updated checklist reflecting our scoping (floating topics → N/A, relationship lines → nice-to-have, map structures narrowed to Mind Map + Timeline with others as future), plus the new feature ideas and organized must-have/nice-to-have/future lists
- **Technology Thoughts** — filled in with our tech decisions

Now — let's brainstorm the Anki/spaced repetition side. The key questions I'd want to explore:

1. **Card types**: Anki supports Basic (front/back), Cloze, Reversed, and custom note types. Which of these does Osmosis need? And how do they map to markdown?
2. **FSRS integration**: Use the `ts-fsrs` npm package directly, or implement the algorithm from scratch?
3. **Study session flow**: What does a study session look like end-to-end? How do you start one, how do cards get queued, what happens when you rate a card?
4. **Card identity and stability**: When the user edits a heading that's also a card, does the card's review history follow it or reset? This is the "stable card identifier" problem.

Want to start with any of these, or do you have a different angle you want to explore first?
