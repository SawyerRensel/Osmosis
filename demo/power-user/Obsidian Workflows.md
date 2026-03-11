---
osmosis-cards: true
osmosis-deck: obsidian/workflows
osmosis-styles:
  theme: Catppuccin Mocha
  branchLineStyle: angular
  balance: both-sides
  baseStyle:
    text:
      size: 15
      weight: 500
---

# Obsidian Workflows

Obsidian's power comes from combining its core features with community plugins into personalized workflows. Here are the most impactful workflows and how to set them up.

[My Obsidian Workflow — Nicole van der Hoeven](https://www.youtube.com/watch?v=wKNWMBeGCuU)

## Templates

Templates eliminate repetitive formatting and ensure consistency across your vault.

### Core Templates
- Daily note template
	- Date header with `{{date}}`
	- Sections for tasks, journal, and links
	- Metadata in frontmatter
- Meeting note template
	- Attendees, agenda, action items
	- Link to project note
	- Date and context fields
- Literature note template
	- Source metadata (author, title, URL)
	- Key takeaways section
	- Connection prompts

### Template Best Practices
- Keep templates in a dedicated folder (`_templates/`)
- Use Templater plugin for dynamic content
- Include prompts that encourage linking
- Version your templates as your system evolves

## Daily Notes

The daily note is the entry point for most Obsidian workflows.

### Recommended Structure
1. Morning review (5 min)
	- Check yesterday's open tasks
	- Set today's priorities
	- Review calendar
2. Capture throughout the day
	- Quick thoughts and ideas
	- Meeting notes (link to dedicated notes)
	- Task updates
3. Evening processing (10 min)
	- Process inbox items
	- Move tasks to appropriate projects
	- Write brief reflection

### Daily Note Integrations
- **Calendar plugin**: Navigate daily notes by date
- **Tasks plugin**: Query tasks across all daily notes
- **Dataview**: Aggregate data from daily notes into dashboards

## Essential Plugins

### Navigation & Organization
- **Quick Switcher++**: Enhanced file switching with symbol search
- **Graph Analysis**: Find clusters and orphan notes
- **Tag Wrangler**: Rename and merge tags across vault
- **Omnisearch**: Full-text search with OCR support

### Writing & Editing
- **Templater**: Advanced templates with JavaScript
- **Linter**: Auto-format Markdown on save
- **Natural Language Dates**: Type "next Tuesday" and get a date link
- **Excalidraw**: Freehand drawing and diagrams

### Productivity
- **Tasks**: Task management with due dates and recurrence
- **Kanban**: Visual project boards
- **Periodic Notes**: Weekly, monthly, quarterly note templates
- **Dataview**: Query your vault like a database

### Knowledge Management
- **Osmosis**: Mind maps and spaced repetition from your notes
- **Strange New Worlds**: See how notes connect
- **Breadcrumbs**: Navigate note hierarchies
- **Zotero Integration**: Academic reference management

## Keyboard Shortcuts

Master these shortcuts to move through Obsidian at the speed of thought.

| Action | Shortcut (Mac) | Shortcut (Windows/Linux) |
|--------|----------------|--------------------------|
| Quick Switcher | `Cmd+O` | `Ctrl+O` |
| Command Palette | `Cmd+P` | `Ctrl+P` |
| Search in vault | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Toggle edit/preview | `Cmd+E` | `Ctrl+E` |
| Create new note | `Cmd+N` | `Ctrl+N` |
| Open link under cursor | `Cmd+Enter` | `Ctrl+Enter` |
| Navigate back | `Cmd+Opt+Left` | `Ctrl+Alt+Left` |
| Navigate forward | `Cmd+Opt+Right` | `Ctrl+Alt+Right` |
| Toggle left sidebar | `Cmd+Shift+L` | `Ctrl+Shift+L` |
| Split pane right | `Cmd+\` | `Ctrl+\` |

### Custom Hotkey Recommendations
- Map `Ctrl+Shift+T` to insert template
- Map `Ctrl+D` to open today's daily note
- Map `Ctrl+Shift+G` to open graph view
- Map `Ctrl+M` to open Osmosis mind map

## Workspaces

Workspaces save and restore your entire pane layout.

### Recommended Workspace Setups
- **Writing**: Single pane, distraction-free, outline in right sidebar
- **Research**: Source on left, notes on right, graph in floating window
- **Review**: Daily note center, tasks sidebar, calendar sidebar
- **Planning**: Kanban board center, project note sidebar

---

## Flashcards

```osmosis
id: pkm-obsidian-001
c1-stability: 30.5
c1-difficulty: 0.25
c1-due: 2026-03-30T10:00:00.000Z
c1-last-review: 2026-03-08T10:00:00.000Z
c1-reps: 15
c1-lapses: 0
c1-state: review
c2-stability: 18.2
c2-difficulty: 0.35
c2-due: 2026-03-22T10:00:00.000Z
c2-last-review: 2026-03-08T10:00:00.000Z
c2-reps: 10
c2-lapses: 1
c2-state: review
c3-stability: 12.0
c3-difficulty: 0.30
c3-due: 2026-03-20T10:00:00.000Z
c3-last-review: 2026-03-08T10:00:00.000Z
c3-reps: 8
c3-lapses: 0
c3-state: review

==Cmd+O== (Mac) or ==Ctrl+O== (Windows) opens the ==Quick Switcher== in Obsidian
```

```osmosis
id: pkm-obsidian-002
c1-stability: 0.3
c1-difficulty: 0.68
c1-due: 2026-03-10T16:00:00.000Z
c1-last-review: 2026-03-10T12:00:00.000Z
c1-reps: 9
c1-lapses: 2
c1-state: relearning
c2-stability: 4.2
c2-difficulty: 0.45
c2-due: 2026-03-15T10:00:00.000Z
c2-last-review: 2026-03-10T12:00:00.000Z
c2-reps: 6
c2-lapses: 1
c2-state: review
c3-stability: 1.5
c3-difficulty: 0.55
c3-due: 2026-03-12T10:00:00.000Z
c3-last-review: 2026-03-10T12:00:00.000Z
c3-reps: 4
c3-lapses: 0
c3-state: learning

==Cmd+P== (Mac) or ==Ctrl+P== (Windows) opens the ==Command Palette== in Obsidian
```

```osmosis
id: pkm-obsidian-003
stability: 1.0
difficulty: 0.52
due: 2026-03-10T20:00:00.000Z
last-review: 2026-03-10T12:00:00.000Z
reps: 3
lapses: 0
state: learning

What are the three phases of a recommended daily note workflow?
***
1) Morning review (check tasks, set priorities, review calendar), 2) Capture throughout the day (thoughts, meetings, task updates), 3) Evening processing (process inbox, move tasks, write reflection)

![Mind map — daily workflow overview](https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/MindMapGuidlines.svg/300px-MindMapGuidlines.svg.png)
```

```osmosis
id: pkm-obsidian-004

What is the Templater plugin and how does it differ from core Templates?
***
Templater is a community plugin that extends Obsidian's core template functionality with JavaScript execution, dynamic date calculations, file manipulation, and conditional logic within templates.
```
