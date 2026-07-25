---
osmosis-styles:
  balance: both-sides
  theme: Gruvbox Dark
  branchLineTaper: fade
  styles:
    _n:7a5dc356:
      shape: circle
      border:
        width: 5
    _n:5952f2e5:
      shape: circle
      border:
        width: 4
    _n:865f4b9b:
      shape: circle
      text:
        alignment: center
        size: 29
    _n:841e64e4:
      shape: circle
      text:
        alignment: center
        size: 22
      border:
        width: 4
      branchLine:
        thickness: 4
---

# Markdown Mind Mapping with Osmosis

## Getting Started

This section introduces the core concepts. Osmosis transforms your Markdown notes into interactive mind maps, letting you visualize the structure of your ideas at a glance.  blah

- First bullet point
- Second bullet point
- Third bullet point with more detail to see how longer text wraps in a node.  

## Numbered Steps

1. Open a Markdown file in Obsidian
2. Click the icon on the tool shelf
3. Explore your note as a visual tree
4. Edit nodes directly on the map

## Nested Lists

- Animals
	- Mammals
		- Dogs
		- Cats
	- Birds
		- American Robin
		- Penguins
- Plants
  - Trees
		- Pine
		- Oak
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

The purpose of this section is to test how the mind map handles a large block of text. When a heading has a substantial amount of content beneath it without any sub-structure, the **entire** paragraph becomes a single node. This is useful for testing text overflow, node sizing, and readability. The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.

## Empty Section

## Multiple Paragraphs

First paragraph under this heading. It has a couple of sentences to give it some body.

Second paragraph with different content. This tests whether multiple paragraphs under the same heading create separate nodes or merge together.

## Inline Formatting

- **Bold text** in a bullet
- *Italic text* in a bullet
- `Code snippet` in a bullet
- A bullet with a [link](https://example.com)
- ~~Strikethrough~~ text
- ==Highlighted== text

## Code blocks

```python
def function():
	print("Hello, World")
```

## Checkboxes

- [ ] Another unchecked
- [ ] Unchecked item
	- [ ] Another
	- [ ] Another nother
- [x] Checked item
	- [ ] Another
	- [ ] Another nother

## Tables

| Products | Price | Quantity |                         |
| -------- | ----- | -------- | ----------------------- |
| Apple    | 4     | 3        | ![[pine_tree.webp\|99]] |
| Banana   | 2     | 1        |                         |

## Images

![[pine_tree.webp|169]]

- A pine tree
	- ![[pine_tree.webp|186]]

## Audio

![[rain_storm_freesound.mp3]]

## Video

### Online Video

![https://www.youtube.com/watch?v=Hm3JodBR-vs](https://www.youtube.com/watch?v=Hm3JodBR-vs)

### Local Video

![004_Pied_kingfisher_at_Queen_Elizabeth_National_Park_Video_by_Giles_Laurent](004_Pied_kingfisher_at_Queen_Elizabeth_National_Park_Video_by_Giles_Laurent.webm)

## Excalidraw

![Drawing 2026-03-07 19.36.10.excalidraw|200](Drawing%202026-03-07%2019.36.10.excalidraw.md)

## Final Thoughts

This fixture covers headings at multiple levels, bulleted lists, numbered lists, nested structures, plain paragraphs, and inline formatting. It should exercise most of the mind map rendering paths.

