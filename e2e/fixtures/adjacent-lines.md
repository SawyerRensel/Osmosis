# Adjacent lines form one node

Each section below is one test case. A blank line separates nodes; lines with no blank line between them are ONE node.

## Cover image above a heading

![[r9-create-move-icons.png]]
### Rigging

- Check the halyard
- Coil the sheets

## Caption below a heading

### Mooring
Pick up the buoy from downwind, then make fast at the bow cleat.

## Blank line keeps them apart

![[r9-create-move-icons.png]]

### Anchoring

- Pay out three times the depth

## Two headings in one run

### Tides
#### Spring and neap
Spring tides follow the full and new moon.

## Hard-wrapped paragraph

A reach is any point of sail between close-hauled
and running, with the wind roughly across the boat,
which is usually the fastest and most comfortable.

## A horizontal rule does not break a run

Above the rule
***
Below the rule

## Breakers stay as today

Prose right above a list
- a list item
- another item

Prose right above a table
| Knot | Use |
|------|-----|
| Bowline | Fixed loop |

Prose right above a callout
> [!note] Callout
> Still its own node.

Prose right above a code block
```
tack(port)
```

Prose right above a note embed
![[sailing-glossary]]

<!-- osmosis-exclude -->
This run is guarded by the comment above
and stays one node.

## A carded run

Heave to by backing the jib
and easing the main. ^os-adjl01

## A run with two card IDs

First line with its own card ^os-adjl02
Second line with its own card ^os-adjl03

## Carded heading groups (reveal and study)

![[r9-create-move-icons.png]]
### Reefing ^os-adjl04

### Trimming
Ease the sheet until the luff just stops shaking. ^os-adjl05
