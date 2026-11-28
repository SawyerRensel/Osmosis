# Osmosis

An Obsidian plugin for studying notes as mind maps and as a 3D graph of linked lines, with spaced repetition throughout.

## Map views

**Layout**:
How a note's map is drawn: Mindmap (the 2D mind map), Organic (Cosmos, shaped by forces) or Planets (Cosmos, each note on a globe). It belongs to the note and is saved in its styles; which view draws it follows from it. Cosmos draws in its focus note's layout, so a hop can change it.
_Avoid_: 2D/3D, view mode, map layout (`mapLayout` is the mind map's own tree algorithm)

**Default layout**:
The setting that gives every note without a layout of its own its layout. It is never written into a note: picking it for a note removes the note's own.
_Avoid_: Last map view

## 3D graph

**Plate**:
A node in the 3D graph, drawn as an opaque rounded label outlined in its node colour. Each line of a note is one plate.
_Avoid_: Sphere, label, card (a card is a study item)

**Edge**:
A line in the 3D graph between two plates: hierarchy within a note, or link, embed, property, tag or attachment between them.
_Avoid_: Link (that word means the wikilink an edge may come from), connection line

**Focus note**:
The note the loaded area is centred on. It changes only by a hop: travelling to another note's plate, by a click or by following a link, leaves it as it is.
_Avoid_: Current note, root

**Hop**:
Making another note the focus note on purpose: "Focus this note" in a plate's menu, the F key on the selected plate, or a panel link to a note that is not loaded. The loaded area recentres on it.
_Avoid_: Jump, navigate

**Visit**:
Arriving at a plate by travel: a plate click, following a link, a panel link to a loaded plate, or a study stop. Camera only. Each visit to another plate, and each hop, is a step the tab's back and forward buttons walk through.
_Avoid_: Hop (a hop changes the focus note)

**Follow a link**:
Clicking an edge to travel slowly along it to the end away from the focused node. Camera only: arriving does not change the focus note, and it is not a click on the plate, so a hidden study card stays hidden.
_Avoid_: Edge flight, link jump

**Travel speed**:
How fast every camera flight moves: following a link, flying to a clicked plate, hopping, and going to a search result.
_Avoid_: Flight scale (that is the walk/fly speed under the user's own control)

**Outline depth**:
How far a line sits below its note's title in the note's own heading and list structure. Hops between notes do not count.
_Avoid_: Hop distance, level
