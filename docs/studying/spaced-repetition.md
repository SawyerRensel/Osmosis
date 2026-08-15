---
icon: lucide/bar-chart-3
---

# Spaced Repetition

Osmosis uses the **Free Spaced Repetition Scheduler** (FSRS) for all card scheduling. FSRS is the modern successor to the SM-2 algorithm and produces more accurate scheduling intervals based on memory research.

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

## Learning Steps

New and lapsed cards don't leave the session after one look. A card rated **Again**, or one still working through its learning steps, comes back **within the same study session** after a short delay.

Configure the delays in **Settings > Osmosis**:

| Setting | Default | Applies to |
|---------|---------|------------|
| Learning steps | `1m, 10m` | New cards working toward their first real interval |
| Relearning steps | `10m` | Review cards you rated *Again* |

Enter a comma-separated list of intervals (`m` for minutes, `h` for hours). A card advances one step each time you rate it **Good** or better, and graduates to a normal FSRS interval after the last step. Rating **Again** sends it back to the first step.

If every remaining card is waiting on a timer, the study modal shows a **"Waiting for next card"** countdown rather than ending the session. A card's position in the steps is saved with its schedule, so closing the modal mid-session doesn't lose progress.

!!! tip
    Leave the steps short. They exist to give a card a second look while it's still fresh — long steps just stall the session behind a countdown.

## Daily Limits

Configure in **Settings > Osmosis**:

| Setting | Default | Description |
|---------|---------|-------------|
| Daily new card limit | 20 | Maximum new cards introduced per day (0 = unlimited) |
| Daily review card limit | 200 | Maximum reviews per day (0 = unlimited) |

!!! tip
    Start with the defaults. If you're adding many cards at once, consider lowering the new card limit to avoid overwhelming yourself. Review limits rarely need changing.

## Fixing a Card's Schedule

FSRS handles scheduling on its own, but sometimes a card needs a hand. The
[card browser](card-browser.md#mutations) is where that happens:

| Situation | Do this |
|-----------|---------|
| A card keeps failing and its schedule is nonsense | **Reset** it — scheduling clears, review history is kept |
| A card isn't relevant right now | **Suspend** it — the schedule is preserved for later |
| A card is wrong | Fix the note; the card follows |
| A card shouldn't exist | **Delete** it from the browser |

Everything except deleting is reversible, and deleting is undoable within the
session.

## Data Storage

All scheduling data lives **in your markdown files** — no external database.
Fence cards store it inside the fence; [line cards](../flashcards/line-cards.md)
store it in the note's frontmatter under `osmosis-schedule`.

A fence that produces several cards gives each one a nested block named for the
card it belongs to — `r:` for a bidirectional reverse, `c1:`, `c2:` … for cloze
deletions and [occlusion](../flashcards/image-occlusion.md) groups — while the
fence's own card stays at the top level.

[Data Storage](../reference/data-storage.md) has the complete format, including
the [review log](../reference/data-storage.md#review-history) that records every
answer you give and feeds the
[statistics dashboard](statistics.md).

### Why This Matters

- **No external database** — Everything lives in your markdown files
- **Sync just works** — Obsidian Sync, iCloud, Dropbox, or any file sync service carries your scheduling data automatically
- **Portable** — Your review history travels with your notes
- **Transparent** — You can inspect (but generally shouldn't edit) scheduling data directly
