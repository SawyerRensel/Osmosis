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
| Pan | Drag on empty canvas |
| Zoom | Scroll wheel or pinch |
| Fit all content | Right-click canvas > "Fit to view" |
| Center on root | Right-click canvas > "Center on root" |

The map auto-frames all content when the view first opens.

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
