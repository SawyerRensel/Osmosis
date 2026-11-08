# Osmosis

An Obsidian plugin for studying notes as mind maps and as a 3D graph of linked lines, with spaced repetition throughout.

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

**Follow a link**:
Clicking an edge to travel slowly along it to the end away from the focused node. Camera only: arriving does not change the focus note, and it is not a click on the plate, so a hidden study card stays hidden.
_Avoid_: Edge flight, link jump

**Travel speed**:
How fast every camera flight moves: following a link, flying to a clicked plate, hopping, and going to a search result.
_Avoid_: Flight scale (that is the walk/fly speed under the user's own control)

**Outline depth**:
How far a line sits below its note's title in the note's own heading and list structure. Hops between notes do not count.
_Avoid_: Hop distance, level

**Flat branch**:
A branch of a note's outline, below the flat depth, laid out as the 2D mind map lays it out, in a slice through the note's core: the map's left-to-right points straight away from the core (the branch root nearest it, deeper lines further out) and document order runs down the world. A note's slices stand in its ring.
_Avoid_: 2D subtree, petal

**Flat depth**:
The outline depth below which branches lie flat, set by the Overlays menu's flatten slider. It is continuous: between two whole depths, the lines at the deeper one are pulled part-way into their slice. Above it the note spreads in 3D, and cross-note edges always do.

**Ring**:
A note's flat branches standing round the vertical axis through its core, like apple wedges cut top to bottom: each slice has a fixed outward direction, its share of the ring weighted by its size, in document order.
