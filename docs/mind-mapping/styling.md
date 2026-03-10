---
icon: lucide/paintbrush
---

# Styling

## Properties Sidebar

Click the :lucide-paintbrush: icon in the mind map header to open the properties sidebar. It has two tabs:

### Map Tab

Global settings for the current map:

- **Theme** — Choose from 13 presets or create your own
- **Layout direction** — Left-right or top-down
- **Layout algorithm** — Classic (tree) or radial
- **Balance** — One-side, both-sides, or alternating
- **Layout side** — Right, left, down, or up (for one-side balance)
- **Spacing** — Horizontal (parent-to-child) and vertical (sibling) spacing
- **Branch lines** — Style, pattern, thickness, taper, and color
- **Node shape** — Default shape for all nodes
- **Max node width** — Text wraps at this width
- **Background color** — Map canvas color

### Format Tab

Style the currently selected node(s):

- **Shape** and custom width
- **Fill** color
- **Border** — Color, width, style (solid/dashed/dotted)
- **Text** — Font, size, weight, color, alignment (left/center/right/justify)
- **Branch line** — Per-node overrides for color, thickness, style, pattern, taper

Each section has a reset button to clear overrides.

## Themes

Osmosis includes 13 themes:

| Theme | Style |
|-------|-------|
| Default | Inherits your Obsidian theme colors |
| Ocean | Cool blues |
| Solarized Dark / Light | Ethan Schoonover's palette |
| Nord | Arctic blue tones |
| Dracula | Dark purple and pink |
| Monokai | High-contrast dark |
| Gruvbox Dark | Retro warm tones |
| Catppuccin Mocha | Pastel dark |
| Tokyo Night | Soft dark blues |
| Rose Pine | Muted pinks and purples |
| Everforest | Soft green earth tones |
| One Light | Clean, bright |

You can create, rename, and delete custom themes from the Map tab in the properties sidebar.

## Per-Map Settings

Map styles are stored in `osmosis-styles` frontmatter, so each note can have its own layout and appearance:

```yaml
---
osmosis-styles:
  direction: top-down
  theme: Nord
  balance: both-sides
  branchLineStyle: straight
  horizontalSpacing: 100
  verticalSpacing: 12
---
```

### All Map Properties

| Property | Values | Default |
|----------|--------|---------|
| `direction` | `left-right`, `top-down` | `left-right` |
| `theme` | Any preset or custom theme name | `Default` |
| `mapLayout` | `classic`, `radial` | `classic` |
| `balance` | `one-side`, `both-sides`, `alternating` | `one-side` |
| `layoutSide` | `right`, `left`, `down`, `up` | `right` |
| `branchLineStyle` | `curved`, `straight`, `angular`, `rounded-elbow` | `curved` |
| `branchLinePattern` | `solid`, `dashed`, `dotted` | `solid` |
| `branchLineTaper` | `none`, `fade`, `grow` | `none` |
| `topicShape` | See node shapes below | `rounded-rect` |
| `collapseDepth` | `0` (none) through `6` | `0` |
| `horizontalSpacing` | Pixels | `80` |
| `verticalSpacing` | Pixels | `8` |
| `maxNodeWidth` | Pixels | — |

## Node Shapes

Osmosis supports 15 node shapes:

`rectangle` `rounded-rect` `ellipse` `circle` `diamond` `hexagon` `octagon` `triangle` `parallelogram` `trapezoid` `pill` `cloud` `arrow-right` `underline` `none`

## Branch Line Styles

**Style** controls the line geometry:

- `curved` — Smooth S-curves (default)
- `straight` — Direct lines
- `angular` — Right-angle bends
- `rounded-elbow` — Right-angle bends with rounded corners

**Pattern** controls the stroke:

- `solid` (default), `dashed`, `dotted`

**Taper** controls the line thickness variation:

- `none` (default) — Uniform thickness
- `fade` — Thinner toward children
- `grow` — Thicker toward children

## Style Cascade

When multiple style sources apply to the same node, they resolve in priority order (highest to lowest):

1. **Local** — Per-node style overrides (set via Format tab)
2. **Class** — Global style classes
3. **Variant** — Node variant overrides
4. **Reference** — Theme reference
5. **Theme** — Preset or custom theme (lowest priority)
