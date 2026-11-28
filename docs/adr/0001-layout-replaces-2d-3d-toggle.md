# A note's Layout replaces the 2D/3D toggle

Status: accepted (T138, batch 18)

## Context

Osmosis draws a note's map with one of two engines: the 2D mind map
(`MindMapView`) and Cosmos (`CosmosView`), which lays notes out Organic or as
Planets. Until T138 the choice was spread over three places:

- a **2D | 3D pill** in both headers (plus a "Toggle between mind map and
  Cosmos" command) that swapped the engine in the tab, with a lift-off /
  landing animation between them (`cosmos/liftoff.ts`);
- a **per-device "last map view used"** (`last-map-view.ts`, localStorage),
  which decided what the note header's brain button opened;
- a **per-vault Cosmos layout** (`graph3dOverlays.layout`).

So how a note looked depended on the device and on what was opened last, not
on the note. Sawyer wanted one choice that belongs to the note.

## Decision

A note has a **Layout**: Mindmap, Organic or Planets (`src/note-layout.ts`).

- It is saved per note as `layout` in its `osmosis-styles`, so it follows the
  note's styles into its sidecar or the note. A note without one uses the
  vault-wide **Default layout** setting (default Mindmap). The default is
  never written into a note: picking it removes the key, so changing the
  default moves every note that never chose.
- The engine follows from the layout (`engineFor`). The brain button and the
  file menu's Map view open a note in its layout; Cosmos draws in its focus
  note's layout (a Mindmap note opened in Cosmos explicitly draws Organic).
- `plugin.setNoteLayout(path, layout)` is the one entry point that changes a
  layout: it writes the styles (recorded for undo when a mind map holds the
  note) and swaps any view of the note that no longer draws it, in place.
- The swap has **no animation**. It keeps the note's undo history
  (`holdAcross`) and centres the incoming view on the focused line
  (`cosmos/swap-focus.ts`).
- Follow active note crosses engines: a following Cosmos turns into the mind
  map on a Mindmap note, and an unpinned mind map turns into Cosmos on an
  Organic or Planets note.
- The 2D | 3D pill, its command, the lift-off animation, the per-device last
  map view and the per-vault Cosmos layout are removed. Cosmos's spacing
  sliders stay per vault; only the layout choice moved to the note. The old
  per-vault layout is not migrated: Sawyer chose Mindmap as the default.

### Storage key: a new `layout`, not a widened `mapLayout`

`osmosis-styles` already has `mapLayout` (`"classic"`, with `"radial"` allowed
by its type), the mind map's own tree algorithm. We added a new `layout` key
instead of widening it, because:

- `mapLayout` describes how the mind map arranges its tree, alongside
  Direction, Side and Balance; the Layout picks the view. Mixing the two would
  make `"classic"` mean both "the tree algorithm" and "draw as a mind map".
- The style sidebar wrote `mapLayout: classic` into notes whenever a user
  picked it explicitly. Widened, those notes would read as an explicit
  Mindmap choice and ignore the Default layout, against the rule that a note
  without its own choice follows the default.

The mind map's Direction / Side / Balance and `mapLayout` are unchanged.

## Consequences

- Don't reintroduce a 2D/3D toggle, a header pill, or a per-device last view:
  they bring back a choice that isn't the note's. To show a note differently,
  change its layout.
- Changing the Default layout re-lays out open Cosmos views whose focus note
  has no layout of its own, but does not swap open views between engines; the
  next open uses the new default.
- An undo that takes back a layout write (a mind map recorded it) re-lays out
  Cosmos between Organic and Planets, but does not swap engines.
- The layout picker itself lives in the style sidebar (T139). Until then,
  Cosmos's Layout dropdown sets the focus note's layout through
  `setNoteLayout`.
