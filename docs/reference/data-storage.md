---
icon: lucide/database
---

# Data Storage

Osmosis has no database. Every card, every schedule, every map style, and every
review you have ever recorded is text in your vault — which is what makes the
whole thing sync, back up, diff, and outlive the plugin.

This page is the complete map of what gets written where.

## What Lives Where

| Data | Written to |
|------|------------|
| Card content | The `osmosis` fence, or the note's own lines |
| Fence card schedules | The fence header |
| Line card schedules | `osmosis-schedule` in the note's frontmatter |
| Occlusion masks | The fence header, or `osmosis-schedule` |
| Map layout and node styles | `osmosis-styles` in the note's frontmatter |
| Deck assignment | Folder path, `osmosis-deck` frontmatter, or `deck:` fence metadata |
| Review history | Markdown shards in the review log folder |
| Plugin settings, custom themes, panel order | `.obsidian/plugins/osmosis/data.json` |

## Fence Cards

Metadata sits at the top of the fence, above a blank line. Scheduling fields
are added by Osmosis after the first review:

````markdown
```osmosis
id: abc123
deck: geography/europe
due: 2026-03-15T00:00:00.000Z
stability: 4.5
difficulty: 5.2
reps: 3
lapses: 0
state: review
last-review: 2026-03-10T00:00:00.000Z
learning-steps: 0

What is the capital of France?
***
Paris
```
````

### Derived cards nest

A fence can produce more than one card: a bidirectional fence makes two, a cloze
fence one per group, an occluded image one per shape group. Each of those keeps
its own schedule in a **nested block** named for the card it belongs to:

````markdown
```osmosis
id: rivers
r:
  due: 2026-08-20T09:00:00
  stability: 6.10
  state: review
c1:
  due: 2026-08-12T09:00:00
  stability: 4.21
  state: review
c2:
  due: 2026-08-14T09:00:00
  state: learning

The ==Nile== flows into the ==Mediterranean==
```
````

| Key | Card |
|-----|------|
| *(top level)* | The fence's own card |
| `r:` | The reverse card of a `bidi:` fence |
| `c1:`, `c2:`, … | Cloze deletion, code cloze, or occlusion group *N* |

!!! info "Older notes still load"
    Earlier versions wrote flat, prefixed keys (`c1-due:`, `r-stability:`).
    Those are still read, and converted to the nested form the next time that
    card's schedule is written. Nothing needs converting by hand.

## Line Cards

[Line cards](../flashcards/line-cards.md) are lines tagged with a native
Obsidian block ID, and their schedules live in the note's frontmatter keyed by
that ID:

```yaml
---
osmosis-cards: true
osmosis-deck: coffee
osmosis-schedule:
  os-a1b2c3:
    due: 2026-07-22T10:30:00
    stability: 4.2
    difficulty: 5.1
    lastReview: 2026-07-15T09:12:00
    reps: 3
    lapses: 0
    state: review
    learningSteps: 0
  os-d4e5f6:
    disabled: true
---
```

- The key is written **lazily** — after a card's first review, not when its ID
  is generated.
- Writes are debounced and coalesced: rating a run of cards produces one
  frontmatter write, flushed at the end of the session.
- Timestamps are ISO 8601 local datetimes, so the file stays readable.
- `disabled: true` marks a card [excluded from study](../flashcards/line-cards.md#exclude-from-study).
- An [occluded](../flashcards/image-occlusion.md) line nests an `occlude:` block
  plus one schedule block per group.

Obsidian hides frontmatter in reading view and shows `osmosis-schedule` as a
single non-editable property, so it stays out of your way.

## Map Styles

Everything the [properties sidebar](../mind-mapping/styling.md) sets is written
to `osmosis-styles` in the same frontmatter — layout, theme, spacing, branch
lines, and per-node overrides keyed by block ID. Because it travels in the note,
sending someone the note sends them the map.

## Review History

Every answer you give is appended to a **review log**: an append-only history
that the [stats dashboard](../studying/statistics.md) reads. It lives in
`Osmosis/Reviews` by default (**Settings > Osmosis > Review log folder**).

### Shards

The log is split into one file per month per device:

```text
Osmosis/Reviews/
  2026-07.desktop.md
  2026-08.desktop.md
  2026-08.pixel-10a.md
```

**One writer per file, ever.** That's what the device name is for: two devices
reviewing on the same day write two different files, so a sync conflict cannot
interleave them. Set the label under **Settings > Osmosis > Device name**, or
leave it empty to detect one.

A shard is Markdown holding one JSON line per review:

````markdown
Osmosis review log — pixel-10a, 2026-08. Generated file; do not edit.

```osmosis-reviews
{"device":"pixel-10a","install":"a3f9","v":2}
{"t":1754500000000,"c":"os-wcfb3w","r":3,"s":"review","iv":345600,"pi":86400,"st":12.3,"d":6.4,"e":4200,"m":"sequential"}
```
````

| Field | Meaning |
|-------|---------|
| `t` | When you answered, epoch ms |
| `c` | Card ID |
| `r` | Rating — 1 Again, 2 Hard, 3 Good, 4 Easy |
| `s` | Card state after the answer |
| `iv` | Interval the answer granted, seconds |
| `pi` | Interval the card was on *before* the answer, seconds |
| `st` / `d` | FSRS stability and difficulty after the answer |
| `e` | Milliseconds the card was on screen |
| `m` | Which study mode you answered in |

!!! note "The fence is deliberately never closed"
    An unclosed code fence runs to the end of the document, so every write is a
    pure append and the file is valid at every moment. Don't "fix" it by closing
    the fence.

**Why Markdown?** Obsidian Sync only carries non-Markdown files when *Sync all
other types* is enabled, which is off by default and doesn't propagate between
devices — a `.jsonl` log could silently never reach your phone. As Markdown, the
log syncs the way your notes do, everywhere, with no configuration.

!!! tip "Keep the log out of search"
    Add the folder to **Settings > Files & links > Excluded files**. Osmosis
    already keeps shards out of its own card scanning, but Obsidian's search
    indexes them like any note.

Deleting the log costs you the graphs, not your scheduling: card schedules live
in your notes and are unaffected.

## Why This Matters

- **No external database** — nothing to corrupt, migrate, or lose
- **Sync just works** — Obsidian Sync, iCloud, Dropbox, Git; if it moves your
  notes, it moves your study data
- **Portable** — your review history travels with the note it belongs to
- **Transparent** — you can read every byte of it (and shouldn't hand-edit the
  scheduling fields)
- **AI-native** — an assistant can read and write your cards natively, because
  they're just text
