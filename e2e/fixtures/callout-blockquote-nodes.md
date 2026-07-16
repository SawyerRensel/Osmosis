---
osmosis: true
osmosis-cards: true
---

# Callouts and Blockquotes as Single Nodes

This note verifies that Obsidian callouts and blockquotes render as one mind-map node and generate one line card each.

> [!quote] A single callout
> The title and this body line should be **one** node in the mind map — and one card when flashcards are generated.

## Multi-paragraph callout

> [!note] Reveal order
> First paragraph inside the callout.
>
> Second paragraph, separated by a `>` empty line. Still the same node.

## Plain blockquote

> A plain blockquote with no callout type.
> It spans two lines and stays a single node.

## Two stacked blockquotes

> First quote — its own node.

> Second quote — a separate node, because a blank line divides them.

## Callout containing a list

> [!summary] Cascade
> - Geography and biology
> - Food production and surpluses
> - Dense populations and specialists

## Regular content still works

A normal paragraph node.

- A bullet node
- Another bullet node
