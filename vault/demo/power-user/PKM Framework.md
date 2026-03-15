---
osmosis-cards: true
osmosis-deck: pkm/frameworks
osmosis-styles:
  theme: Catppuccin Mocha
  layoutSide: right
  mapLayout: classic
  balance: alternating
  styles:
    "# PKM Framework/## PARA Method":
      fill: "#89b4fa"
      text:
        color: "#1e1e2e"
        weight: 700
      branchLine:
        color: "#89b4fa"
        thickness: 2
    "# PKM Framework/## Zettelkasten Method":
      fill: "#a6e3a1"
      text:
        color: "#1e1e2e"
        weight: 700
      branchLine:
        color: "#a6e3a1"
        thickness: 2
    "# PKM Framework/## Maps of Content (MOCs)":
      fill: "#f9e2af"
      shape: hexagon
      text:
        color: "#1e1e2e"
        weight: 700
      branchLine:
        color: "#f9e2af"
        thickness: 2
    "# PKM Framework/## Hybrid Approaches":
      fill: "#cba6f7"
      text:
        color: "#1e1e2e"
        weight: 700
      branchLine:
        color: "#cba6f7"
        thickness: 2
---

# PKM Framework

Personal Knowledge Management (PKM) is the practice of capturing, organizing, and retrieving information to support thinking, creativity, and decision-making. Several frameworks have emerged to help knowledge workers build effective systems.

[Building a Second Brain — Tiago Forte](https://www.youtube.com/watch?v=OP3dA2GcAh8)

## PARA Method

Tiago Forte's PARA method organizes information by **actionability** rather than topic.

### Projects
- Have a clear goal and deadline
- Active work with defined outcomes
- Examples
	- Launch new product feature
	- Write quarterly report
	- Plan team offsite

### Areas
- Ongoing responsibilities without end dates
- Standards to maintain over time
- Examples
	- Health and fitness
	- Professional development
	- Home maintenance

### Resources
- Topics of ongoing interest
- Reference material for future use
- Examples
	- Design inspiration
	- Industry research
	- Cooking recipes

### Archives
- Completed or inactive items from the above
- Preserved for future reference
- Never deleted, only moved

## Zettelkasten Method

Niklas Luhmann's slip-box method emphasizes **connections** over categories.

### Core Principles
- One idea per note (atomicity)
- Write in your own words (elaboration)
- Connect notes with explicit links (association)
- Use unique identifiers for each note
- Let structure emerge organically

### Note Types
- Fleeting notes
	- Quick captures during the day
	- Processed within 24 hours
	- Discarded after processing
- Literature notes
	- Summaries of source material
	- Written in your own words
	- Include bibliographic reference
- Permanent notes
	- Fully developed ideas
	- Connected to existing notes
	- Written for your future self

### Advantages Over Folder Systems
- No need to decide "where" a note goes
- Ideas connect across domains
- Supports serendipitous discovery
- Scales without reorganization

## Maps of Content (MOCs)

Nick Milo's MOC approach uses **index notes** to create flexible structure.

### How MOCs Work
- A note that links to related notes on a topic
- Not a folder — a lens for viewing connections
- Multiple MOCs can reference the same note
- Created when a cluster of notes feels overwhelming

### MOC Hierarchy
- Home note
	- Top-level dashboard
	- Links to major MOCs
- Topic MOCs
	- Domain-specific collections
	- Example: "Productivity MOC", "Writing MOC"
- Project MOCs
	- Temporary, goal-oriented
	- Archived when project completes

### When to Create a MOC
- You have 5+ notes on a topic
- You keep searching for the same cluster
- You want to see relationships at a glance

## Comparing Frameworks

| Feature | PARA | Zettelkasten | MOCs |
|---------|------|-------------|------|
| Organization | Folders | Links | Index notes |
| Scalability | Moderate | High | High |
| Learning curve | Low | High | Medium |
| Best for | Action-oriented work | Research & writing | Flexible thinking |
| Maintenance | Regular reviews | Ongoing linking | As-needed |

## Hybrid Approaches

Many practitioners combine elements from multiple frameworks:

- **PARA + Zettelkasten**: Use PARA folders at the top level, Zettelkasten linking within notes
- **Zettelkasten + MOCs**: Atomic notes with MOCs as navigational aids
- **All three**: PARA for project management, Zettelkasten for permanent knowledge, MOCs for navigation

---

## Flashcards

```osmosis
id: pkm-para-001
bidi: true
stability: 30.5
difficulty: 0.25
due: 2026-03-30T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 15
lapses: 0
state: review

PARA
***
Projects, Areas, Resources, Archives — a folder organization system by Tiago Forte
```

```osmosis
id: pkm-zk-001
stability: 30.5
difficulty: 0.25
due: 2026-03-30T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 15
lapses: 0
state: review

What are the three types of notes in the Zettelkasten method?
***
Fleeting notes (quick captures), literature notes (source summaries), and permanent notes (fully developed ideas)

![Zettelkasten slip-box](https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Zettelkasten_%28514941699%29.jpg/300px-Zettelkasten_%28514941699%29.jpg)
```

```osmosis
id: pkm-moc-001
stability: 5.5
difficulty: 0.40
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 7
lapses: 1
state: review

What is a Map of Content (MOC) and when should you create one?
***
An index note that links to related notes on a topic. Create one when you have 5+ notes on a topic or keep searching for the same cluster.

![Mind map guidelines](https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/MindMapGuidlines.svg/300px-MindMapGuidlines.svg.png)
```

```osmosis
id: pkm-zk-002
c1-stability: 25.4
c1-difficulty: 0.3
c1-due: 2026-03-25T10:00:00.000Z
c1-last-review: 2026-03-08T10:00:00.000Z
c1-reps: 12
c1-lapses: 1
c1-state: review
c2-stability: 6.1
c2-difficulty: 0.5
c2-due: 2026-03-18T10:00:00.000Z
c2-last-review: 2026-03-10T10:00:00.000Z
c2-reps: 5
c2-lapses: 0
c2-state: review
c3-stability: 0.8
c3-difficulty: 0.6
c3-due: 2026-03-12T18:00:00.000Z
c3-last-review: 2026-03-10T10:00:00.000Z
c3-reps: 2
c3-lapses: 0
c3-state: learning

==Zettelkasten== emphasizes ==atomic== notes connected by ==links==
```

```osmosis
id: pkm-hybrid-001
stability: 1.0
difficulty: 0.52
due: 2026-03-10T20:00:00.000Z
last-review: 2026-03-10T12:00:00.000Z
reps: 3
lapses: 0
state: learning

What is the key difference between PARA and Zettelkasten in how they organize information?
***
PARA organizes by actionability using folders, while Zettelkasten organizes by connections using links between atomic notes.
```
