---
title: Cache the detail aggregates per shard
summary: The detail panels re-stream every in-range shard on each scope change; cache the per-shard aggregates the way the day rollup already is, and work out what to do about True Retention's per-day dedup
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Markdown review log shards that scale over years]]"
  - "[[Osmosis stats dashboard]]"
status: To-Do
priority:
progress:
date_created: 2026-08-14T11:45:00.000Z
date_modified: 2026-08-14T11:45:00.000Z
date_start_scheduled:
date_start_actual:
date_end_scheduled:
date_end_actual:
all_day: false
repeat_frequency:
repeat_interval:
repeat_until:
repeat_count:
repeat_byday:
repeat_bymonth:
repeat_bymonthday:
repeat_bysetpos:
repeat_completed_dates:
parent: "[[Osmosis Dashboard]]"
children:
blocked_by:
cover:
color:
pull_request:
---

# Optimization

## What tool or process needs improvement?

`StatsView.loadDetail()` and `DetailAccumulator`, added in
[[Markdown review log shards that scale over years]] (PR #28).

The **day rollup** is cached per shard: `ReviewLog.refreshCache()` keeps a
`Rollup` per shard filename, fingerprinted on mtime + size, so a steady-state
`getRollup()` costs one folder listing plus a stat per shard and parses nothing.

The **detail aggregates** — hourly buckets, answer buttons, true retention,
recall by mode / type / note — have no such cache. `loadDetail()` streams every
in-range shard through `DetailAccumulator` from scratch, and throws the result
away whenever the scope key changes.

## What's slow or frustrating about it?

Nothing measurable yet. This was deliberately left unbuilt in the parent task —
no acceptance criterion gated on it, and building it before the streaming pass
had ever run on real data would have been speculative. It is written down here
so the decision is recoverable rather than lost.

The cost is a full re-stream on:

- every deck-scope change
- every mode-filter change
- every history-scope change
- the first scroll to the detail panels after any of the above

At 45 days of generated fixture data the pass is ~20 ms for 777 entries, so it
is invisible today. Extrapolated to five heavy years (~900,000 entries) it is
seconds of parsing per scope change, on the main thread.

## What would "better" look like?

Per-shard cached aggregates, keyed and fingerprinted exactly like `CachedShard`,
so a scope change re-folds cached partials instead of re-parsing files.

**The hard part is not the caching — it is True Retention.** Its per-day dedup
is load-bearing and was confirmed so during the parent task:

> The maturity filter covers the lapse-then-recover case the dedup was
> originally written for, but contextual and spatial study both let you answer
> an already-passed mature card a second time the same day, so a mature card
> passed twice in one day has a mature `pi` on both answers and would be
> double-counted.

Dedup is on `cardId|dayKey`, and a card-day can span two shards (two devices
reviewing the same card on the same day). A per-shard partial therefore cannot
be summed — the union has to be taken over card-days, not over counts. Options
worth weighing:

1. Cache everything *except* retention and recall, and keep streaming those two.
   Cheapest, and the hourly / answer-button / mode panels are the ones that
   redraw most.
2. Cache a per-shard **set** of counted card-days alongside the counts, and
   merge sets on read. Correct, but the set is O(reviews) — it is the memory
   the streaming design exists to avoid, so it would need a bounded encoding.
3. Accept double-counting across shards and drop the dedup. **Rejected in the
   parent task** — see the `addRetention` docstring in `src/stats/detail.ts`
   before reopening this.

Also worth checking first: whether `scan()`'s month-range pruning already makes
this moot for the common scopes. A 12-month history opens twelve shards, and the
default view is 12 months, not All.

## Acceptance criteria

- [ ] A scope change with an unchanged log does not re-parse any shard whose
      fingerprint has not moved
- [ ] True Retention and the three Recall panels report the same numbers cached
      and uncached, including the two-devices-one-card-day case
- [ ] Cache size for five simulated years stays under the same asserted
      localStorage ceiling the day rollup is tested against
- [ ] `npm run lint` and `npm test` clean
