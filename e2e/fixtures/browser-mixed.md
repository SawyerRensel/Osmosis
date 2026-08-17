---
osmosis-cards: true
osmosis-deck: geography
---

# Rivers and Borders

One note that expands into many browser rows: an explicit card, a
bidirectional card, a cloze card with two groups, a code cloze, a suspended
fence, and several line cards.

## Explicit

```osmosis
id: brw-basic1
Which river flows through ten countries, more than any other?
***
The Danube
```

## Bidirectional

```osmosis
id: brw-bidi01
bidi: true
Longest river in Africa
***
The Nile
```

## Cloze, two groups

```osmosis
id: brw-cloze1
The ==Danube== rises in the Black Forest and empties into the ==Black Sea==.
```

## Code cloze

````osmosis
id: brw-code01

```python
def river_length(name):
    return LENGTHS[name]  # osmosis-cloze
```
````

## Suspended fence

This one carries `exclude: true`. It should stay out of study and out of every
deck count, but still be reachable — and unsuspendable — from the browser.

```osmosis
id: brw-susp01
exclude: true

Which strait separates Europe from Asia at Istanbul?
***
The Bosphorus
```

## Line cards

- The Amazon carries more water than the next seven rivers combined. ^os-brwln01
- The Caspian Sea is the largest inland body of water on Earth. ^os-brwln02
- The Congo is the deepest river, reaching over 200 metres. ^os-brwln03
- Lake Baikal holds roughly a fifth of the world's unfrozen fresh water. ^os-brwln04
