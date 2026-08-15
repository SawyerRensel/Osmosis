---
icon: lucide/command
---

# Commands

Every Osmosis entry in the command palette, plus the menus and header actions
that reach the same things. Any command can be bound to a hotkey under
**Settings > Hotkeys**.

## Views

| Command | Opens |
|---------|-------|
| **Open mind map view** | The [mind map](../mind-mapping/index.md) for the active note |
| **Toggle mind map reading mode** | Switches the active map between editing and [reading mode](../mind-mapping/index.md#reading-mode) (++ctrl+e++) |
| **Open mind map properties** | The [properties sidebar](../mind-mapping/styling.md#properties-sidebar) |
| **Open dashboard** | The [dashboard](../dashboard/index.md) sidebar |
| **Open card browser** | The [card browser](../dashboard/card-browser.md) |
| **Open statistics** | The [stats dashboard](../dashboard/statistics.md) |

## Studying

| Command | What it does |
|---------|--------------|
| **Study all decks** | Starts a [sequential](../studying/study-modes.md#sequential-study) session across every deck |
| **Undo last card mutation** | Reverts the last [card browser](../dashboard/card-browser.md#undo) mutation |
| **Redo last undone card mutation** | Replays it |

## Making Cards

| Command | What it does |
|---------|--------------|
| **Insert basic card** | Inserts a front/back `osmosis` fence at the cursor |
| **Insert bidirectional card** | The same, with `bidi: true` |
| **Insert type-in card** | The same, with `type-in: true` |
| **Insert bidirectional type-in card** | Both flags |
| **Toggle rapid flashcard mode** | Turns [Rapid Flashcard Mode](../flashcards/rapid-capture.md) on or off |
| **Create image occlusion** | Opens the [occlusion editor](../flashcards/image-occlusion.md) for the image on the cursor's line |
| **Generate flashcards from note** | Tags every eligible line with a block ID — see [line cards](../flashcards/line-cards.md) |

Inserting a card also adds `osmosis-cards: true` to the note if it isn't
already opted in.

## Line Cards

| Command | What it does |
|---------|--------------|
| **Add line cards from selection** | Tags the selected lines with `^os-` block IDs |
| **Remove line cards from selection** | Strips those IDs, deleting the cards |
| **Exclude line cards in selection from study** | Pauses those cards, keeping their history |
| **Include line cards in selection in study** | Resumes them |

## Menus and Header Actions

Not everything is a command. These are the surfaces that reach Osmosis directly:

| Surface | Items |
|---------|-------|
| **Ribbon** | :lucide-brain-circuit: Osmosis dashboard |
| **Note header** | :lucide-brain-circuit: Mind map view · :lucide-scan-eye: Peek mode · :lucide-graduation-cap: Study this note (whenever the note has cards) |
| **Note ⋯ menu** | Rapid flashcard mode |
| **Mind map header** | :lucide-book-open: / :lucide-pencil: Reading mode · :lucide-paintbrush: Style sidebar · :lucide-pin: Pin · :lucide-file-text: Note view · :lucide-graduation-cap: Study mode · :lucide-scan-eye: Peek mode |
| **Mind map toolbar** | [Every structural and viewport action](../mind-mapping/editing.md#toolbar) |
| **File menu** (right-click a note) | Mind map view · Generate flashcards |
| **Editor context menu** | Add / Remove line cards · Exclude / Include line cards · Create image occlusion |
| **Image context menu** | Create image occlusion |
| **Node context menu** (right-click a node) | Structure and clipboard actions · Add / Remove line card · Exclude / Include in study · Study this branch |

## Keyboard Shortcuts

The shortcut tables live with the features they belong to:

- [Mind map editing](../mind-mapping/editing.md#structure-operations) — structure, clipboard, undo
- [Mind map navigation](../mind-mapping/navigation.md) — arrows, selection, collapse/expand
- [Sequential study](../studying/study-modes.md#keyboard-shortcuts) — reveal, rate, undo, exclude
- [Occlusion editor](../flashcards/image-occlusion.md#the-editor) — duplicate, delete, undo
