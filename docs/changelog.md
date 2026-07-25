---
title: Changelog
---

# Changelog

All notable changes to Osmosis will be documented in this page.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2]

### Added

#### Notes as Flashcards (Line Cards)
- **Generate flashcards from note** command (palette + file menu) tags eligible lines with native `^os-` block IDs behind a confirmation modal; re-runs are incremental
- Every tagged line is its own FSRS card — front is the ancestor breadcrumb (plus configurable preceding-sibling context in sequential study), back is the line
- Line-card schedules stored in `osmosis-schedule` note frontmatter (atomic `processFrontMatter` writes, debounced and flushed at session end)
- Line cards count in decks and sequential study, with per-note (`osmosis-line-cards: false`) and global opt-out
- Deleted block IDs soft-delete their cards; history re-links when the ID reappears

#### Study Modes
- Reading view **Peek** and **Study** header actions: hide all line-card lines for casual review, or study due/new lines top-down with an inline rating bubble, progress pill, and completion toast
- Spatial study reworked: only **due or new** line-card nodes hide behind `?` placeholders (the map stays expanded), tap to reveal, rate via a bubble anchored to the node (keys ++1++–++4++), progress pill + Stop, completion toast
- Spatial **peek mode** on the mind map — hide all line-card nodes, reveal freely, nothing recorded
- **Study this branch** now scopes spatial study to a subtree's due cards
- Transcluded notes are studiable on the host map: their nodes hide/reveal in spatial study and peek, and ratings write to the embedded note's own `osmosis-schedule`

#### Line Card Control
- **Add / Remove line cards** by editor selection or mind map node — editor commands, editor context menu, and node context menu. Removing an ID you authored yourself is confirmed behind a link-break warning
- **Exclude from study / Include in study** pauses a card without losing its FSRS history: skipped by peek, study, the sequential queue, and dashboard counts. Stored as `disabled: true` on the card's `osmosis-schedule` entry; rating never clears the flag, and re-including never clears the schedule
- The sequential study modal's exclude button now routes line cards through the schedule store (fence cards keep their `exclude:` metadata)
- Multi-line prose runs are split into one block — and one card — per line, matching the mind map's save convention

#### Cloze Syntax
- **Unified cloze grammar** across prose and code. `:::text:::` joins `==text==` and `**text**` as a third prose delimiter — its markers are stripped from both sides, leaving no visual residue
- **`c<N>:` grouping** works on any delimiter (`==c1:Paris==`, `**c1:Paris**`, `:::c1:Paris:::`). Occurrences sharing a number blank and reveal together as a single card, including across the prose/code boundary inside one fence
- **Inline code clozes** — `:::c<N>:token:::` blanks individual tokens *inside* a line of code, instead of whole lines only
- Line- and region-level code markers gained the parallel `-c<N>` suffix: `# osmosis-cloze-c1`, `# osmosis-cloze-start-c1` / `# osmosis-cloze-end-c1`
- Group numbers you write are preserved verbatim on card IDs, so adding a cloze later never renumbers existing schedules. Unlabeled clozes are numbered above the highest labeled one, in source order

#### Study Sessions
- **Intra-session learning and relearning steps.** Cards rated *Again*, or still working through their learning steps, reappear within the same session after a timer-based delay, matching Anki's behavior. When only pending timers remain, a "Waiting for next card" countdown appears
- New **Learning steps** and **Relearning steps** settings (e.g. `1m, 10m`); step position persists in the fence's scheduling metadata
- **Multi-level undo** in sequential and contextual study via ++ctrl+z++ or the undo button — reverts ratings (restoring the previous FSRS schedule) as well as excludes
- **Exclude card** toggle in both sequential (++e++) and contextual study, written as `exclude:` fence metadata, with eye / eye-off icons
- **Go to card** (++g++) opens the source note and scrolls to the card's line
- Contextual study keeps the answer visible after you rate it, rather than collapsing it away

#### Study Modal
- Action icons (open note, exclude card, undo) moved into the modal's top-left header strip, aligned with Obsidian's close button as round 42 px buttons
- Optional **deck breadcrumb** showing the deck of the card currently on screen — **Settings > Osmosis > Show deck breadcrumb in study modal**, off by default
- Cloze reveal now **replaces the front in place** instead of stacking the back beneath it, so your eye stays anchored on the same text and only the blanks fill in. Basic front/back cards keep the stacked layout, and live preview still shows both sides for editing
- Obsidian-style language labels on code blocks in sequential and contextual study cards
- Rating buttons share equal widths across the bar, are taller on desktop with softer 8 px corners, and the flip button is pill-shaped; **Show answer** matches the rating buttons' height

#### Dashboard
- **Decks auto-indent to mirror your folder hierarchy.** Cards without an explicit deck use their full folder path (`Study/Math/Algebra`) rather than just the parent folder name, and intermediate folders holding no cards are pruned so only meaningful levels appear. Explicit deck assignments keep their full slash-separated hierarchy without pruning

#### Mind Mapping
- **Reading mode for the Mind Map View**, mirroring the Markdown view's reading toggle. The map is safe to explore but cannot be mutated: every mutation path is guarded (keyboard, ribbon, context menu, double-click), node drags pan the viewport instead, resize handles hide, the ribbon collapses to navigation actions, and context menus keep only Copy / fold / Study this branch. Spatial study and peek stay fully available — ratings are study metadata, not map edits
- Toggle reading mode via the header action, ++ctrl+e++, or the **Toggle mind map reading mode** command. Mode persists per pane; the new **Default mind map mode** setting (Editing / Reading / Reading on mobile only) decides how new maps open
- **Callouts and blockquotes are one node**: consecutive `>`-prefixed lines (callout title + body, multi-paragraph quotes, callouts containing lists) collapse into a single node and a single line card, the way code blocks and tables already did. Stacked callouts stay separate
- **Expand transclusions** setting (default on): embedded branches load expanded when a map opens; turn off to restore lazy collapsed loading
- Embedding the same note twice no longer confuses the map — each embed instance gets independent nodes (fixes selection jumping to the other copy and study/peek hiding only one)

#### Mind Map Undo / Redo
- Mind map edits now have **self-contained undo/redo**. Map writes bypass CodeMirror, so ++ctrl+z++ previously did nothing on a standalone map; every mutation is now recorded as a file snapshot with one undo per map operation
- Map-level style changes (theme, layout, direction, balance, side, background, branch line, default fill/border/text/shape/width, and the reset buttons) undo alongside node-level changes, and ++ctrl+z++ works while the properties sidebar holds focus
- A color-picker drag coalesces into a **single** undo step instead of dozens
- New **Undo history** settings group: **Undo steps** (default 50) and **Undo memory cap (MB)** (default 20). Whichever limit is reached first drops the oldest edits

#### Styling
- Block-ID style selectors (`^os-a1b2c3`) in `osmosis-styles`, preferred over stable IDs and tree paths; the format panel writes them automatically and migrates legacy `_n:` entries

### Changed

- **Minimum Obsidian version is now 1.13.0** (was 1.10.0). Osmosis adopts the declarative settings API introduced in 1.13, which makes every Osmosis setting discoverable from Obsidian's settings search
- Daily new/review card limits are proper number fields with inline validation instead of free text
- Properties sidebar dropdowns use sentence case — `(None)` and `(Inherit)`
- Card ID suffixes collapse into a single `c<N>` namespace; the separate `i<N>` namespace used by inline code clozes is gone

### Fixed

#### Cloze & Scheduling
- **Cloze-only fences silently lost review progress.** Fences producing only derived IDs (`abc-c1`) never had an `id:` line written, so the writer couldn't find the fence on review. Three interlocking causes, all fixed: the `-r` / `-c<N>` suffix is stripped when choosing what to inject; only known keys (`id`, `exclude`, `bidi`, `type-in`, `deck`, `hint`, and schedule fields) count as metadata, so a prose line shaped like `word: value` is no longer swallowed; and an injected `id:` adjacent to content gets a separating blank line
- Inline cloze cards couldn't have their schedules written at all — the ID and key regexes only matched `-r` and `-c<N>` suffixes, so the write failed silently
- `:::prose:::` clozes weren't treated as cards in reading and editing view; the contextual renderer's regex only matched `==` and `**`
- Grouped inline clozes left the `c1:` label visible on the rendered answer (the renderer matched `\d+:` instead of `c\d+:`)

#### Study
- Flashcards didn't render in reading view on first paint — the deferred render fired before the element was attached, so reading-view detection returned null. Now driven by `requestAnimationFrame`
- A deferred learning card whose timer fired while another card was on screen was spliced in at the visible card's index, pushing it down one slot — flipping then revealed the wrong card's answer
- Obsidian's built-in code-block copy button no longer appears on study cards

#### Mind Map & Plugin
- **Structural edits across a transclusion boundary** no longer corrupt the map. Moving, copying, or re-indenting a line keeps its trailing block ID (and with it, its card history); a node containing an `![[embed]]` moves, copies, and deletes as one unit instead of orphaning the `![[…]]` line; drop targets use host-file coordinates so an edit can never splice one file's offsets into another's bytes; and an edit, undo, or redo that carried an embed keeps it rendered instead of collapsing to a bare placeholder
- Reading-view study and peek hide a callout that contains a list as one block, matching the mind map (previously the two surfaces disagreed)
- Both-sides balance: the secondary group is reflected about the pivot's center, removing an extra pivot-width gap on the left side
- `versions.json` shipped a template placeholder (`{"0.1.0": "0.15.0"}`) for a version that never existed, so Obsidian could serve the wrong build to older apps
- Resolved the findings from Obsidian's Community Plugins review: 117 ESLint errors to zero, frontmatter callbacks and undocumented Obsidian internals properly typed, `createEl`/`createDiv` over raw DOM calls, window-scoped timers for popout windows, `instanceOf()` for cross-window checks, 11 deprecated `setDynamicTooltip()` calls removed, and corrected repository links in the README

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
