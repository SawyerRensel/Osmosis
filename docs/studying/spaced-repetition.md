---
icon: lucide/bar-chart-3
---

# Spaced Repetition

Osmosis uses the **Free Spaced Repetition Scheduler** (FSRS) for all card scheduling. FSRS is the modern successor to SM-2 (used by classic Anki) and produces more accurate scheduling intervals based on memory research.

## Ratings

After revealing a card's answer, rate your recall:

| Rating | Key | Meaning | Effect |
|--------|-----|---------|--------|
| **Again** | ++1++ | Forgot or wrong | Card re-enters learning; interval resets |
| **Hard** | ++2++ | Recalled with difficulty | Shorter next interval |
| **Good** | ++3++ | Recalled correctly | Standard next interval |
| **Easy** | ++4++ | Instant, effortless recall | Longer next interval |

## Card States

| State | Description |
|-------|-------------|
| **New** | Never studied — shown as "new" count in Dashboard |
| **Learning** | Recently introduced, reviewed at short intervals |
| **Review** | In long-term rotation, intervals growing |
| **Relearning** | Previously known but forgotten, back to short intervals |

## Daily Limits

Configure in **Settings > Osmosis**:

| Setting | Default | Description |
|---------|---------|-------------|
| Daily new card limit | 20 | Maximum new cards introduced per day (0 = unlimited) |
| Daily review card limit | 200 | Maximum reviews per day (0 = unlimited) |

!!! tip
    Start with the defaults. If you're adding many cards at once, consider lowering the new card limit to avoid overwhelming yourself. Review limits rarely need changing.

## Data Storage

All scheduling data lives **in your markdown files** — no external database. Fence cards store it inside the fence itself; [line cards](../flashcards/line-cards.md) store it in the note's frontmatter.

### Fence Cards

Scheduling fields are written into the fence metadata:

````markdown
```osmosis
id: abc123
due: 2026-03-15T00:00:00.000Z
stability: 4.5
difficulty: 5.2
reps: 3
lapses: 0
state: review
last-review: 2026-03-10T00:00:00.000Z

What is the capital of France?
***
Paris
```
````

### Line Cards

[Line card](../flashcards/line-cards.md) schedules are stored in the note's frontmatter under `osmosis-schedule`, keyed by block ID:

```yaml
---
osmosis-cards: true
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
---
```

The key appears after a card's first review (never at ID-generation time), and writes are debounced — a run of ratings during a study session produces a single frontmatter write, flushed when the session ends. Timestamps are ISO 8601 local datetimes so the source view stays human-readable. Frontmatter is hidden in reading view, and the Properties panel shows the key as a single non-editable property.

### Why This Matters

- **No external database** — Everything lives in your markdown files
- **Sync just works** — Obsidian Sync, iCloud, Dropbox, or any file sync service carries your scheduling data automatically
- **Portable** — Your review history travels with your notes
- **Transparent** — You can inspect (but shouldn't edit) scheduling data directly

### Derived Card Schedules

Bidirectional and cloze cards store scheduling data for each derived card with prefixed keys:

| Prefix | Card |
|--------|------|
| `r-` | Reverse (bidirectional) |
| `c1-` | Cloze deletion 1 |
| `c2-` | Cloze deletion 2 |
| `c3-` | Cloze deletion 3, and so on |

For example, a bidirectional card might have both `due: ...` (forward schedule) and `r-due: ...` (reverse schedule) in the same fence.
