---
hide:
  - navigation
  - toc
---

# Osmosis

**Absorb information faster and longer with unified notes, flashcards, and mind mapping.**

Osmosis turns your markdown notes into interactive mind maps and study material. Write once, study in multiple modes. No duplicate content, no external tools, no proprietary formats.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.10.0+-purple)](https://obsidian.md)

![Osmosis — notes and mind map side by side](assets/media/osmosis_note_mind_map_split_view_zoomed.png)


## Features

- **Interactive Mind Maps** — Your headings become branches, lists become nodes. Edit the map and the Markdown updates. Edit the Markdown and the map updates.
- **Five Card Types** — Basic Q&A, bidirectional, type-in, cloze deletion, and code cloze — all defined with a simple code fence syntax
- **FSRS Spaced Repetition** — The same algorithm powering modern Anki, built right into your notes
- **Three Study Modes** — Sequential (classic card review), contextual (study inline in your notes), and spatial (study on the mind map itself)
- **Plain Markdown** — Everything lives in your files. Card scheduling data is stored in the fences themselves — no external databases, no sync issues
- **Themes and Styling** — Customize mind map appearance with built-in themes, colors, and layout options
- **Keyboard Navigation** — Full keyboard support for mind map editing and study sessions
- **Dashboard** — See all your decks, due card counts, and study statistics at a glance

## Why Osmosis?

Most mind mapping and flashcard tools force you to choose: either your notes are the source of truth, or the tool is. Osmosis refuses that tradeoff.

🗺️ **Not just a viewer — a full editor.** Tools like [Markmap](https://markmap.js.org/) render beautiful mind maps from Markdown, but they're read-only. Osmosis mind maps are fully interactive — add nodes, edit text, rearrange branches — and every change writes back to your Markdown instantly.

🔓 **Not proprietary — plain Markdown.** Tools like [Xmind](https://xmind.com/) are powerful mind mappers, but your data lives in a proprietary format. With Osmosis, Markdown *is* the format. Your notes work everywhere, with every tool, forever.

🤖 **AI-native by design.** Plain Markdown means AI assistants can read, generate, and edit your content natively — flashcards, mind maps, study material — no export, no conversion, no friction.

🧩 **Notes + mind maps + flashcards in one file.** Other tools force you to maintain these in separate apps. Osmosis unifies all three in a single Markdown file. Your headings become mind map branches. Your `osmosis` code fences become flashcards. One file, three views, zero duplication.

🧭 **Spatial study mode.** Study your flashcards *on* the mind map. Cards appear right where they belong in your knowledge structure — no other tool lets you see how each fact connects to the bigger picture while you review.

📝 **Contextual study mode.** Study cards inline in your notes, right where you wrote them. Review surrounded by your own explanations and examples instead of being yanked into a separate flashcard app.

🔗 **Mind map transclusion.** Embed one mind map inside another with `![[note]]`. Build a master map of an entire subject by transcluding individual topic maps — zoom from the 30,000-foot view down to granular detail.

## Who It's For

**The Med Student** — You're drowning in anatomy, pharmacology, and pathology. You already use Anki, but maintaining two separate systems — notes and flashcards — is killing your workflow. Osmosis lets you define flashcards right inside your lecture notes, so your study material lives where you take notes. Mind maps help you see how body systems connect. FSRS keeps you on schedule.

**The Self-Taught Developer** — You're learning a new language, framework, or codebase on your own. Code cloze cards let you drill syntax and API patterns. Mind maps give you the big-picture architecture view. Everything stays in the same Markdown files you already take notes in.

**The Lifelong Learner** — You read books, watch lectures, and take notes — but forget most of it within weeks. Spaced repetition fixes that. Osmosis lets you embed flashcards right where you take notes, so you actually retain what you learn. No separate app, no export step.

**The Obsidian Power User** — You've built your second brain in Obsidian and you want mind mapping and spaced repetition without leaving the ecosystem. No proprietary formats, no external accounts, no sync issues. Plain Markdown, full ownership.

**The Visual Thinker** — Outlines and bullet points don't click for you. You need to see the structure. Osmosis turns any Markdown file into an interactive mind map you can edit, rearrange, and study from — bridging the gap between linear notes and spatial understanding.

## Views

### Mind Map View

![Mind Map View](assets/media/osmosis_mind_map_default_theme.png){width=65%}

Your Markdown rendered as a fully interactive mind map:

- Headings become branches, lists become child nodes
- Click any node to edit — changes sync back to the Markdown instantly
- Pan, zoom, and navigate with keyboard shortcuts
- Multiple themes and color schemes
- Viewport culling for large documents (1000+ nodes)

### Flashcard View

![Flashcard Answer](assets/media/osmosis_sequential_study_flashcard_answer_frontback.png){width=45%}

Cards defined with a simple `osmosis` code fence:

- **Basic** — Question and answer
- **Bidirectional** — Study in both directions
- **Type-in** — Type your answer before revealing
- **Cloze** — Fill-in-the-blank with `==highlighted==` or `**bold**` markers
- **Code Cloze** — Cloze deletions inside code blocks

### Study Dashboard

![Study Dashboard](assets/media/osmosis_flashcard_dashboard.png){width=25%}

Central hub for all your study sessions:

- Deck overview with due card counts
- Study statistics and progress tracking
- One-click access to sequential, contextual, or spatial study modes

## How It Works

Osmosis gives you three views of the same markdown content:

1. **Mind Map View** — Your headings and lists rendered as an interactive, editable mind map with themes, styling, and keyboard shortcuts
2. **Flashcard View** — Cards defined with a simple fence syntax, scheduled by the FSRS algorithm
3. **Study Modes** — Sequential (classic Anki-style), contextual (inline in your notes), and spatial (on the mind map)

Everything lives in your markdown files. Card scheduling data is stored in the fences themselves — no external databases, no sync issues. Any file sync service works automatically.
