---
icon: lucide/move
---

# Navigation

## Keyboard Navigation

Arrow keys navigate between nodes. Their behavior adapts to the map's layout direction:

=== "Left-Right Layout"

    | Key | Action |
    |-----|--------|
    | ++left++ | Go to parent |
    | ++right++ | Go to first child |
    | ++up++ | Previous sibling |
    | ++down++ | Next sibling |

=== "Top-Down Layout"

    | Key | Action |
    |-----|--------|
    | ++up++ | Go to parent |
    | ++down++ | Go to first child |
    | ++left++ | Previous sibling |
    | ++right++ | Next sibling |

### Following the outline

Hold ++ctrl++ (++cmd++ on macOS) to move strictly by the outline, whatever the layout direction or the side of the map a node is on. Siblings stop at the first and last; they do not jump to a cousin.

| Key | Action |
|-----|--------|
| ++ctrl+up++ | Previous sibling |
| ++ctrl+down++ | Next sibling |
| ++ctrl+left++ | Go to parent |
| ++ctrl+right++ | Go to first child (expands a collapsed node first) |
| ++ctrl+shift+arrow++ | Extend the selection the same way |

While you edit a node's text, ++ctrl+arrow++ jumps by words as usual.

## Selection

| Action | Input |
|--------|-------|
| Select node | Click |
| Extend selection | ++shift+arrow++ or ++shift++ + Click |
| Select all | ++ctrl+a++ |
| Rubber-band select | Drag on empty canvas |

## Viewport

| Action | Input |
|--------|-------|
| Pan | Scroll (up/down) or ++shift+++scroll (left/right), or Drag on empty canvas |
| Zoom | ++ctrl+++Scroll wheel, or pinch |
| Fit all content | Right-click canvas > "Fit to view" |
| Center on root | Right-click canvas > "Center on root" |

The map auto-frames all content when the view first opens.

!!! tip "Pan from anywhere in reading mode"
    In [reading mode](index.md#reading-mode) you can start a pan by dragging *any*where — including on top of a node — instead of hunting for empty canvas. This is what makes one-finger panning practical on a phone, where a tap-drag would otherwise grab a node.

## Collapse / Expand

| Action | Keyboard |
|--------|----------|
| Toggle collapse | ++space++ |
| Fold deepest level | ++ctrl+bracket-left++ |
| Collapse all children | ++ctrl+shift+bracket-left++ |
| Unfold shallowest level | ++ctrl+bracket-right++ |
| Expand all children | ++ctrl+shift+bracket-right++ |

!!! tip
    Use ++ctrl+bracket-left++ repeatedly to progressively fold the map from the leaves inward. Use ++ctrl+bracket-right++ to unfold one level at a time.
