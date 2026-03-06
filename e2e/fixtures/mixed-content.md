# Mixed Content Test

## Getting Started

This section introduces the core concepts. Osmosis transforms your Markdown notes into interactive mind maps, letting you visualize the structure of your ideas at a glance.

- First bullet point
- Second bullet point
- Third bullet point with more detail to see how longer text wraps in a node

## Numbered Steps

1. Open a Markdown file in Obsidian
2. Run the "Open Mind Map" command
3. Explore your note as a visual tree
4. Edit nodes directly on the map

## Nested Lists

- Animals
  - Mammals
    - Dogs
    - Cats
  - Birds
    - Eagles
    - Penguins
- Plants
  - Trees
    - Oak
    - Pine
  - Flowers

## Mixed List Types

Here is a paragraph before the list. It provides context for what follows and tests how plain text siblings interact with list nodes.

- Unordered item A
- Unordered item B

1. Ordered item one
2. Ordered item two
3. Ordered item three

Another paragraph after the lists. This tests whether paragraphs between lists are handled correctly as separate nodes.

## Deep Nesting

- Level 1
  - Level 2
    - Level 3
      - Level 4
        - Level 5

1. First
   1. First-A
      1. First-A-i
   2. First-B
2. Second
   1. Second-A

## Long Paragraph

The purpose of this section is to test how the mind map handles a large block of text. When a heading has a substantial amount of content beneath it without any sub-structure, the entire paragraph becomes a single node. This is useful for testing text overflow, node sizing, and readability. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.

## Empty Section

## Multiple Paragraphs

First paragraph under this heading. It has a couple of sentences to give it some body.

Second paragraph with different content. This tests whether multiple paragraphs under the same heading create separate nodes or merge together.

Third paragraph rounds things out. Three blocks of text should be enough to verify the behavior.

## Inline Formatting

- **Bold text** in a bullet
- *Italic text* in a bullet
- `Code snippet` in a bullet
- A bullet with a [link](https://example.com)
- ~~Strikethrough~~ text

## Final Thoughts

This fixture covers headings at multiple levels, bulleted lists, numbered lists, nested structures, plain paragraphs, and inline formatting. It should exercise most of the mind map rendering paths.
