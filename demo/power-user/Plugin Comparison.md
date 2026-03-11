---
osmosis-cards: true
osmosis-deck: obsidian/plugins
osmosis-styles:
  theme: Catppuccin Mocha
  branchLineStyle: straight
  balance: both-sides
---

# Plugin Comparison

Choosing the right plugins for your Obsidian workflow is critical. Too few and you're leaving power on the table. Too many and you're fighting configuration complexity. Here's a systematic comparison of plugin approaches across common workflow needs.

## Task Management

| Plugin | Approach | Strengths | Weaknesses | Best For |
|--------|----------|-----------|------------|----------|
| Tasks | Inline tasks with queries | Powerful queries, due dates, recurrence | No visual board, query syntax learning curve | GTD practitioners |
| Kanban | Visual boards | Intuitive drag-and-drop, visual progress | No cross-vault queries, limited metadata | Visual thinkers |
| Dataview | Query-based views | Maximum flexibility, custom views | Steep learning curve, no native editing | Power users |
| Projects | Table/board/calendar views | Multiple views of same data, native feel | Newer, smaller community | Structured workflows |

## Spaced Repetition

| Plugin | Algorithm | Card Types | Integration | Maturity |
|--------|-----------|------------|-------------|----------|
| Osmosis | FSRS | Basic, cloze, bidi, type-in | Mind maps + flashcards in notes | Active development |
| Spaced Repetition | SM-2 | Basic, cloze | Markdown-native cards | Established |
| Obsidian-Anki Sync | Anki's SM-2 | All Anki types | Syncs with Anki desktop | Established |
| Recall | Custom | Basic | Simple inline cards | Minimal |

### Choosing a Spaced Repetition Approach
- **Osmosis**: Best if you want mind maps and flashcards unified in your notes with modern FSRS scheduling
- **Spaced Repetition plugin**: Best for simple card creation without leaving Obsidian
- **Anki Sync**: Best if you already use Anki and want to leverage its ecosystem
- **Recall**: Best for minimal, low-friction card creation

## Note Organization

| Plugin | Purpose | How It Works | Pairs Well With |
|--------|---------|-------------|-----------------|
| Tag Wrangler | Tag management | Rename, merge, search tags | Any workflow |
| Folder Note | Folder-note hybrid | Folders that are also notes | PARA method |
| Breadcrumbs | Hierarchy navigation | Define parent/child relationships | MOC systems |
| Strange New Worlds | Connection discovery | Shows note relationship counts | Zettelkasten |

## Writing & Editing

| Plugin | Category | Key Feature | Use Case |
|--------|----------|-------------|----------|
| Templater | Templates | JavaScript in templates | Dynamic note creation |
| Linter | Formatting | Auto-format on save | Consistent Markdown style |
| Excalidraw | Drawing | Freehand diagrams | Visual thinking |
| Longform | Writing | Multi-scene projects | Long-form writing |
| Pandoc | Export | Multi-format export | Academic publishing |

## Search & Navigation

| Plugin | Approach | Best For |
|--------|----------|----------|
| Quick Switcher++ | Enhanced file switching | Fast navigation by file or heading |
| Omnisearch | Full-text + OCR | Searching across all content types |
| Graph Analysis | Graph metrics | Finding clusters and orphans |
| Recent Files | History-based | Returning to recently edited notes |
| Waypoint | Auto-generated MOCs | Folder-based navigation |

## Plugin Ecosystem Health

### Signs of a Healthy Plugin
- Regular updates (at least quarterly)
- Active GitHub issues and responses
- Clear documentation
- Compatible with latest Obsidian version
- Reasonable scope (does one thing well)

### Red Flags
- No updates in 6+ months
- Many open issues with no maintainer response
- Conflicts with core Obsidian features
- Excessive permissions or data access
- Tries to do too many things

## Recommended Plugin Stacks

### Minimalist (5 plugins)
- Templater
- Tasks
- Calendar
- Osmosis
- Linter

### Knowledge Worker (10 plugins)
- Templater
- Tasks
- Calendar
- Osmosis
- Dataview
- Tag Wrangler
- Quick Switcher++
- Linter
- Periodic Notes
- Strange New Worlds

### Power User (15+ plugins)
- All Knowledge Worker plugins, plus:
- Excalidraw
- Kanban
- Longform
- Pandoc
- Graph Analysis
- Omnisearch
- Breadcrumbs

## Migration Considerations

When switching between plugins:
- Export data before uninstalling
- Check for frontmatter or syntax differences
- Test in a separate vault first
- Migrate incrementally, not all at once
- Keep the old plugin installed (disabled) until you're confident

---

## Flashcards

```osmosis
id: pkm-plugin-001
stability: 1.0
difficulty: 0.52
due: 2026-03-10T20:00:00.000Z
last-review: 2026-03-10T12:00:00.000Z
reps: 3
lapses: 0
state: learning

What scheduling algorithm does Osmosis use for spaced repetition, and how does it differ from the Spaced Repetition plugin?
***
Osmosis uses FSRS (Free Spaced Repetition Scheduler), while the Spaced Repetition plugin uses SM-2. FSRS is a more modern algorithm that adapts more precisely to individual learning patterns.

![Zettelkasten — the original spaced review system](https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Zettelkasten_%28514941699%29.jpg/300px-Zettelkasten_%28514941699%29.jpg)
```

```osmosis
id: pkm-plugin-002

What are the five plugins in the recommended minimalist Obsidian stack?
***
Templater, Tasks, Calendar, Osmosis, and Linter
```

```osmosis
id: pkm-plugin-003
stability: 5.5
difficulty: 0.40
due: 2026-03-13T10:00:00.000Z
last-review: 2026-03-08T10:00:00.000Z
reps: 7
lapses: 1
state: review

What are the red flags that indicate an unhealthy Obsidian plugin?
***
No updates in 6+ months, many open issues with no maintainer response, conflicts with core Obsidian features, excessive permissions or data access, and trying to do too many things.
```

```osmosis
id: pkm-plugin-004
stability: 0.3
difficulty: 0.68
due: 2026-03-10T16:00:00.000Z
last-review: 2026-03-10T12:00:00.000Z
reps: 9
lapses: 2
state: relearning

What are the four main task management plugin approaches in Obsidian?
***
Tasks (inline tasks with queries), Kanban (visual drag-and-drop boards), Dataview (query-based custom views), and Projects (table/board/calendar multi-view)
```
