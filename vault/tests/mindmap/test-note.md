# Test Note

## Section A
- Item one
- Item two

## Section B
- Item three
  - Sub-item

## Project Overview

Osmosis is an Obsidian plugin that unifies mind mapping, linked note-taking, and spaced repetition into a single learning system. Users author knowledge once in standard markdown and study it in multiple modes: as an interactive mind map (spatial), as inline flashcards within notes (contextual), or as classic Anki-style card-by-card review (sequential). The core insight is that markdown structure *is* the mind map — headings, bullets, and lists map directly to nodes — and the same content can simultaneously serve as flashcard material without extra authoring effort.

The implementation follows a bottom-up approach: parser first (the shared foundation), then mind map engine, then spaced repetition, then study modes that tie everything together. Each phase produces a working, testable artifact.