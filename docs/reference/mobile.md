---
icon: lucide/smartphone
---

# Mobile

Osmosis runs on Obsidian for iOS and Android — the same plugin, the same files,
the same schedules. This page collects what's different when there's no mouse.

## Gestures

### Mind map

| Action | Gesture |
|--------|---------|
| Pan | One-finger drag |
| Zoom | Pinch |
| Select | Tap a node |
| Edit | Double-tap a node |
| Context menu | Long-press a node or the canvas |
| Reveal a card | Tap a hidden node in study or peek |

In [reading mode](../mind-mapping/index.md#reading-mode) a one-finger drag pans
from *anywhere*, including on top of a node — which is what makes the map
usable on a phone, where a tap-drag on a node would otherwise move it.

### Elsewhere

| Surface | Gesture |
|---------|---------|
| Card browser | Long-press to start a selection, then tap to extend |
| Stats dashboard | Drag a panel by its grip to reorder (grips are always visible on touch) |
| Occlusion editor | The :lucide-hand: **Pan** tool moves a zoomed canvas; a one-finger drag on the image draws |
| Study | Tap to reveal, tap a rating button to grade |

## Settings Worth Changing on a Phone

| Setting | Suggested | Why |
|---------|-----------|-----|
| **Default mind map mode** | *Reading on mobile only* | Maps open safe to explore on the phone and editable on the desktop |
| **Max node width** | Lower | Narrower nodes fit more of the map on a small screen |
| **Expand transclusions** | Off | Embedded notes load collapsed, so a big map opens faster |

## Capturing Cards on a Phone

[Rapid Flashcard Mode](../flashcards/rapid-capture.md) exists for this: turn it
on from the note's ⋯ menu — two taps — and every pair of text blocks separated
by a blank line becomes a card when you press ++enter++ twice. No command
palette, no placeholder text to select.

[Image occlusion](../flashcards/image-occlusion.md) works from the phone too:
long-press an image, **Create image occlusion**, and draw.

## Syncing

Everything Osmosis writes is Markdown or frontmatter inside your notes,
including the [review log](data-storage.md#review-history). Any sync that
carries your vault carries your study data — no "sync all other file types"
toggle to find, and no per-device setup.

Each device writes its **own** review log files, so two devices studying the
same day never fight over one file. If your devices end up with the same
auto-detected name, set **Settings > Osmosis > Device name** on one of them.

## Known Differences

- **The mind map pans by CSS transform on iOS.** WebKit strands rendered
  markdown inside a panned SVG, which showed up as nodes vanishing or ghosting
  mid-drag. Panning is done differently there as a result; nothing changes in
  how you use it.
- **Touch reordering on the stats dashboard is lightly tested.** It's built on a
  known-working touch drag implementation, but hasn't been exercised on every
  device.
- **Large maps are heavier on a phone.** Viewport culling keeps rendering cheap,
  but a very large transcluded map is still best explored collapsed.
