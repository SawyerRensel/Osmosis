---
icon: lucide/layout-dashboard
---

# Dashboard

The Osmosis dashboard is a sidebar panel: your decks, what's waiting in each of
them, and two buttons that open the wide surfaces — the [Card Browser](card-browser.md)
and [Statistics](statistics.md) — in the main area.

Open it by clicking the :lucide-brain-circuit: **Osmosis dashboard** icon in the
left ribbon, or run **Open dashboard** from the command palette.

![The Osmosis dashboard sidebar beside the card browser](../assets/media/osmosis_browser_table_layout.png)

## The Operator Bar

Two buttons sit at the top of the panel:

| Operator | Opens |
|----------|-------|
| :lucide-search: **Browse** | The [Card Browser](card-browser.md) — every card in the vault, as a Bases view |
| :lucide-bar-chart: **Stats** | The [Statistics](statistics.md) dashboard — heatmap, graphs, and retention |

Both open as ordinary Obsidian tabs, so they can be pinned, split, dragged into
a side panel, and restored across restarts. If the tab is already open, the
button reveals it instead of opening a second copy.

!!! note "There's no Add button"
    That's on purpose: Obsidian *is* the card editor. Cards are written in
    your notes — as [fences](../flashcards/card-types.md),
    [line cards](../flashcards/line-cards.md), or with
    [Rapid Flashcard Mode](../flashcards/rapid-capture.md) — and
    [image occlusion](../flashcards/image-occlusion.md) starts from an image's
    own context menu.

## Deck Counts

Below the operator bar, **Study all** and the deck tree share four columns:

| Column | Meaning |
|--------|---------|
| **New** | Cards you haven't seen yet |
| **Learn** | Cards in learning or relearning |
| **Due** | Review cards due now |
| **Total** | New + Learn + Due |

**Total is what's waiting now, not how many cards the deck holds.** A card
scheduled for next week is in none of the three columns, so it isn't in the
total either.

Click any deck to study just that deck and its sub-decks; click **Study all** for
everything. Counts respect your [daily limits](spaced-repetition.md#daily-limits),
and [excluded cards](../flashcards/line-cards.md#exclude-from-study) never appear
in them.

## The Deck Tree

Decks nest to mirror your vault's folder structure, and intermediate folders that
hold no cards of their own are pruned away, so you only see levels that mean
something. See [Decks](../flashcards/decks.md) for how a card is assigned to one.

If the panel is empty, no note has opted in yet — add `osmosis-cards: true` to a
note's frontmatter, or set up [include folders and tags](../flashcards/decks.md#automatic-inclusion).

## Guides

<div class="grid cards" markdown>

-   [:octicons-search-24: __Card Browser__](card-browser.md)

    Find, filter, and fix any card in your vault — suspend, reset, re-deck, delete

-   [:octicons-graph-24: __Statistics__](statistics.md)

    Seventeen panels of review history, retention, and scheduling load

</div>
