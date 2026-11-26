---
osmosis-cards: true
osmosis-deck: Testing/Bury
osmosis-schedule:
  os-bury01:
    due: 2026-11-15T09:00:00
    stability: 4.2
    difficulty: 5.1
    lastReview: 2026-11-11T09:00:00
    reps: 2
    lapses: 0
    state: review
    learningSteps: 0
---

# Bury until tomorrow (T121)

Flashcard study's **Bury until tomorrow** (header button, or the `-` key) sets
the current card aside until the next local midnight. It leaves every deck,
count and study queue until then, and its schedule is untouched.

Every card here is new or already due. At session start the dashboard row
**Testing › Bury** and the study strip should both read **2 | 0 | 3**:

| Card | Carrier | Bucket |
|---|---|---|
| Starboard (line) | osmosis-schedule frontmatter | due |
| Close-hauled (line) | none yet | new |
| Bowline (fence) | fence header, flat | due |
| Port (bidi forward) | fence header, flat | due |
| Port (bidi reverse) | none yet | new |

Where a bury is written:

- **Line card** (`os-bury01`, `os-bury02`): `buriedUntil:` (local time) on its
  entry under `osmosis-schedule` above. A new line card gets an entry holding
  only `buriedUntil`.
- **Fence card**: a flat `buriedUntil:` (UTC ISO) line in the fence header.
- **Bidi reverse** (`bury-port-r`): `buriedUntil:` inside an `r:` block, which
  is created for it while the reverse card is still new.

To check expiry without waiting a day, edit a `buriedUntil` to a past time and
reload Obsidian (Ctrl+R): the card comes back.

## Line cards

- A sailing vessel's right-hand side, facing forward, is starboard. ^os-bury01
- Sailing as close to the wind as the boat will go is close-hauled. ^os-bury02

## Bowline

```osmosis
id: bury-bowline
due: 2026-11-16T09:00:00.000Z
stability: 3.8000
difficulty: 5.4000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-12T09:00:00.000Z
learningSteps: 0

Which knot makes a fixed loop that will not slip?
***
The bowline.
```

## Port

```osmosis
id: bury-port
bidi: true
due: 2026-11-17T09:00:00.000Z
stability: 3.1000
difficulty: 5.9000
reps: 2
lapses: 0
state: review
lastReview: 2026-11-13T09:00:00.000Z
learningSteps: 0

The left-hand side of a vessel, facing forward
***
Port
```
