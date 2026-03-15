---
osmosis-cards: true
osmosis-deck: pkm/sharing
osmosis-styles:
  theme: Catppuccin Mocha
  mapLayout: radial
  branchLineStyle: curved
---

# Digital Garden

A digital garden is a publicly shared collection of evolving ideas — somewhere between a personal blog and a wiki. Unlike traditional blogs, digital gardens emphasize growth and connection over chronological publishing.

[Digital Gardening — Maggie Appleton](https://www.youtube.com/watch?v=RXXXHN516qc)

## Philosophy

### Learning in Public
- Share ideas before they're "finished"
- Invite feedback and collaboration
- Build credibility through transparency
- Reduce the pressure of perfectionism

### Divergence from Blogging
- Blogs are **streams** — chronological, polished, finished
- Gardens are **topographies** — interconnected, evolving, messy
- Blog posts are announced; garden notes are discovered
- Blog posts have a publish date; garden notes have a last-tended date

### Core Values
- Growth over perfection
- Connection over categorization
- Curiosity over authority
- Revision over publication

## Maturity Stages

Every note in a digital garden has a maturity level that signals its development stage to readers.

### Seedling
- Raw, unprocessed ideas
- May be just a title and a few bullet points
- Not yet connected to other notes
- Signal to reader: "This is early thinking, take it with a grain of salt"
- Characteristics
	- Less than 100 words
	- Few or no outgoing links
	- No synthesis or personal opinion yet
	- May contain only quotes or references

### Budding
- Ideas that have been revisited and expanded
- Starting to connect with other notes
- Contains your own thinking, not just captured content
- Signal to reader: "I've thought about this but it's still developing"
- Characteristics
	- 100-500 words
	- Several outgoing links
	- Mix of source material and personal synthesis
	- Structure is emerging but not final

### Evergreen
- Mature, well-developed notes
- Thoroughly connected to the knowledge graph
- Represent your current best understanding
- Signal to reader: "I'm confident in this, but open to updating"
- Characteristics
	- 500+ words (or concise and complete)
	- Multiple incoming and outgoing links
	- Clear structure and argument
	- Regularly reviewed and updated
	- Could stand alone as a mini-essay

## Publishing Workflows

### Obsidian to Digital Garden

#### Using Obsidian Digital Garden Plugin
1. Install the Digital Garden plugin
2. Connect to a GitHub repository
3. Add `dg-publish: true` to frontmatter of notes to publish
4. Use the plugin's publish command
5. Notes are rendered as a static site via a template

#### Using Quartz
1. Export selected notes to a Quartz project directory
2. Quartz renders Obsidian-flavored Markdown
3. Supports wikilinks, backlinks, graph view
4. Deploy to GitHub Pages, Netlify, or Vercel

#### Manual Workflow
1. Write in Obsidian
2. Export mature notes to a CMS or static site generator
3. Maintain links manually or with build scripts
4. More control, more maintenance

### What to Publish
- Notes at budding or evergreen maturity
- Topics you want to be known for
- Ideas that benefit from public feedback
- Learning journeys that help others

### What to Keep Private
- Fleeting and unprocessed thoughts
- Personal journal entries
- Notes with sensitive or proprietary information
- Half-formed opinions on controversial topics

## Tending Your Garden

### Daily Tending (5 min)
- Add new seedlings from your private vault
- Promote one seedling to budding if ready
- Fix one broken link or outdated reference

### Weekly Tending (30 min)
- Review analytics to see which notes resonate
- Update evergreen notes with new insights
- Add "related notes" sections where missing
- Respond to comments or feedback

### Seasonal Pruning
- Archive notes that are no longer relevant
- Merge notes that cover the same topic
- Update maturity indicators
- Review your garden's overall structure and balance

## Design Principles

### Navigation
- Provide multiple entry points (not just an index page)
- Include a graph visualization for exploration
- Use tags and backlinks for discovery
- Feature "start here" notes for new visitors

### Transparency
- Show last-updated dates prominently
- Display maturity indicators
- Include a "how this garden works" page
- Link to sources and references

---

## Flashcards

```osmosis
id: pkm-garden-001
stability: 5.5
difficulty: 0.40
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 7
lapses: 1
state: review

What are the three maturity stages in a digital garden?
***
Seedling (raw, unprocessed ideas), Budding (revisited and expanding, starting to connect), and Evergreen (mature, well-developed, thoroughly connected)
```

```osmosis
id: pkm-garden-002
stability: 30.5
difficulty: 0.25
due: 2026-03-30T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 15
lapses: 0
state: review

How does a digital garden differ from a traditional blog?
***
Blogs are chronological streams of polished, finished posts. Digital gardens are interconnected topographies of evolving ideas — notes are discovered rather than announced, and emphasis is on growth over perfection.

![Mind map — digital gardens grow like interconnected webs](https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/MindMapGuidlines.svg/300px-MindMapGuidlines.svg.png)
```

```osmosis
id: pkm-garden-003
c1-stability: 20.0
c1-difficulty: 0.28
c1-due: 2026-03-28T10:00:00.000Z
c1-last-review: 2026-03-08T10:00:00.000Z
c1-reps: 11
c1-lapses: 0
c1-state: review
c2-stability: 8.5
c2-difficulty: 0.42
c2-due: 2026-03-19T10:00:00.000Z
c2-last-review: 2026-03-10T10:00:00.000Z
c2-reps: 6
c2-lapses: 1
c2-state: review
c3-stability: 3.2
c3-difficulty: 0.50
c3-due: 2026-03-14T10:00:00.000Z
c3-last-review: 2026-03-10T10:00:00.000Z
c3-reps: 4
c3-lapses: 0
c3-state: learning

==Digital gardens== emphasize ==growth over perfection== and ==connection over categorization==
```

```osmosis
id: pkm-garden-004
stability: 1.0
difficulty: 0.52
due: 2026-03-10T20:00:00.000Z
last-review: 2026-03-10T12:00:00.000Z
reps: 3
lapses: 0
state: learning

What are the characteristics of an evergreen note in a digital garden?
***
500+ words (or concise and complete), multiple incoming and outgoing links, clear structure and argument, regularly reviewed and updated, and could stand alone as a mini-essay.
```
