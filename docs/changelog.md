---
title: Changelog
---

# Changelog

All notable changes to Osmosis will be documented in this page.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-03-11

Initial release of Osmosis — an Obsidian plugin that unifies mind mapping, flashcards, and spaced repetition into a single learning system.

### Added

#### Mind Map View
- Interactive SVG mind map generated directly from Markdown structure (headings, lists, bullets)
- Bidirectional sync between the Markdown editor and mind map view
- Pan (scroll) and zoom (++ctrl+scroll++) navigation
- Collapse/expand nodes and keyboard navigation (arrow keys, ++tab++, ++enter++)
- Multi-node selection with ++shift+click++
- Drag-and-drop node repositioning with live Markdown updates
- Cursor sync between editor and mind map
- Viewport culling for large maps (1000+ nodes)
- Direction-aware arrow keys for indent/outdent
- Right-click context menu on nodes
- Mind map / note view toggle from icons and file menu
- Pin/lock toggle to prevent accidental edits
- Toolbar with add child, insert parent, add sibling, move up/down, delete, refresh, and properties buttons

#### Node Rendering
- Rich content rendering: images, audio, video, YouTube/Vimeo embeds, Excalidraw drawings
- Code block rendering with proper tab sizing
- Interactive checkbox toggling
- Bullets, links, tables, and ordered list renumbering
- Inline editing via embedded Obsidian editor (++f2++ / double-click)

#### Transclusion
- `![[linked-note]]` and `![](path)` embedded as sub-branches in the mind map
- Recursive expansion with cycle detection
- Lazy loading for large transclusion trees
- Visual indicator for transcluded branches
- Edit propagation — changes to transcluded nodes write back to the source file

#### Styling & Themes
- 12 preset themes with accent-colored UI
- LCVRT cascade system (Layout, Class, Variant, Role, Theme) for style resolution
- Per-node style overrides stored in `osmosis-styles` frontmatter
- Heading-level typography (H1–H6 sizing)
- Topic shapes (rectangle, rounded, ellipse, etc.) with inscribed content fitting
- Style classes with local and global scope (create, save, rename, delete)
- Style variants for quick style switching
- Copy/paste node styles
- Branch line patterns (solid, dashed, dotted) and taper modes (none, fade, grow)
- Font family picker with system font discovery and WOFF2 drop-in support
- Drag-to-resize nodes
- Color picker and alignment controls
- Properties sidebar with per-map settings and tabbed layout
- Map-level global styling controls and custom theme creation
- Reset all styles with confirmation dialog

#### Flashcards & Spaced Repetition
- FSRS scheduler for spaced repetition
- Card types: heading cards, cloze deletions (bold syntax), code cloze (comment annotations), and explicit front/back fences
- Note opt-in system for card generation (per-note, tag-based, folder-based)
- Stable card identity across edits with orphan detection and conflict resolution
- Inline scheduling data stored in code fences (no HTML comment clutter)
- Deck assignments via frontmatter

#### Study Modes
- **Sequential study**: Classic Anki-style card-by-card review modal with rating buttons
- **Spatial study**: Study cards directly on the mind map with flip-to-reveal
- **Contextual study**: Study inline within the note view
- Dashboard with deck overview and study statistics
- Scrollable study cards so rating buttons don't overlap answers
- Mobile-friendly study UI

#### General
- Works on both desktop and mobile (touch support)
- Undo/redo support for style changes and node operations
- Per-map settings stored in frontmatter
- GPL-3.0 license
