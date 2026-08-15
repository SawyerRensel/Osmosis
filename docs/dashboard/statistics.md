---
icon: lucide/bar-chart-3
---

# Statistics

Seventeen panels over your whole review history: what you studied, how it went,
and what's coming. Open it with the :lucide-bar-chart: **Stats** button on the
[dashboard](index.md), or run **Open statistics** from the command palette.

![The Osmosis stats dashboard](../assets/media/osmosis_stats_dashboard.png)

## Scope

Three controls at the top apply to every panel at once:

| Control | Values |
|---------|--------|
| **Deck** | Whole collection, or any single deck and its sub-decks |
| **Mode** | All, Sequential, Contextual, Spatial |
| **History** | 12 months, or All |

Panels that plot volume over time carry their own range picker — **1 month**
(daily bars), **3 months** (weekly, Sunday-aligned to match the heatmap), or
**1 year** (monthly).

!!! note "New cards leave the state graphs under a mode filter"
    A card carries no study mode of its own — reviews do. So filtering by mode
    restricts card-state panels to cards with at least one review on that
    surface, and an unstudied card was not studied contextually.

## The Panels

### Right now

| Panel | Shows |
|-------|-------|
| **Today** | What you've studied today, whatever the history scope says |
| **Future due** | Cards coming up, by day — your scheduling load |
| **Calendar** | A year of study, one square per day |

### Volume

| Panel | Shows |
|-------|-------|
| **Reviews** | Answers per day, split by card maturity (learning / young / mature / relearning) |
| **Review time** | Time on screen per day |
| **Hourly breakdown** | When you study, and how it goes |
| **Answer buttons** | Which button you press, by the maturity each card had *when you answered it* |

### The collection

| Panel | Shows |
|-------|-------|
| **Card counts** | Every card in scope, by state — including an **Excluded** slice |
| **Review intervals** | How far out cards are scheduled |
| **Card stability** | FSRS stability — days until recall falls to 90% |
| **Card difficulty** | FSRS difficulty, 1 (easiest) to 10 |
| **Card retrievability** | Probability each card would be recalled right now |

### Retention

| Panel | Shows |
|-------|-------|
| **True retention** | Pass rate on mature reviews (interval ≥ 21 days) — the headline retention number |
| **Study mode** | Which surface your answers came from — unique to Osmosis |
| **Recall by study mode** | Does studying in the note that taught you beat drilling out of context? |
| **Recall by card type** | Which *authoring style* works: Basic / Bidirectional / Cloze / Code cloze / Line |
| **Weakest notes** | Worst recall first, minimum 5 graduated reviews, top 10 — an editing worklist |

!!! info "Two different maturity bars, on purpose"
    True retention uses the conventional 21-day mature bar. The three recall panels use a
    **1-day graduated bar** instead — slicing mature-only reviews four ways
    leaves samples too thin to compare, and one day is the lowest threshold that
    still excludes same-session learning-step answers. Each caption says which
    it's using.

## Rearranging Panels

Drag a panel by the :lucide-grip-vertical: grip in its top-left corner to move
it. The order is saved, and works with a mouse or by touch. New panels in a
future release append at the bottom rather than reshuffling an arrangement you
made.

## Where the Numbers Come From

Every graph reads the [review log](../reference/data-storage.md#review-history) —
an append-only history of every answer you've ever given, stored as Markdown in
your vault. Card-state panels (counts, stability, difficulty, retrievability,
future due) read your cards' current schedules instead.

Two consequences worth knowing:

- **Reviews of deleted cards still count** at whole-collection scope. Under a
  deck scope they drop out, because a review joins to a deck only through its
  card — which no longer exists.
- **Whole collection is instant**; a narrower deck scope re-reads the log, so it
  takes a moment on a long history.

!!! tip "Excluded cards are counted, not hidden"
    Cards you've [excluded from study](../flashcards/line-cards.md#exclude-from-study)
    show as **Excluded** in Card counts. Cards merely
    [kept out of decks](../flashcards/decks.md#line-cards) count normally by
    state — they're still actively studied in place.
