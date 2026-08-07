---
title: Review log storage
summary: Append-only per-review history in the vault, sharded by month and device, so the stats dashboard has data to draw
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Setting to store flashcard scheduling data in frontmatter or sidecar or within codefence]]"
  - "[[Sidecar files for flashcard data]]"
  - "[[Review FSRS implementation]]"
status: To-Do
priority:
progress_current:
progress_total:
date_created: 2026-08-07T00:00:00.000Z
date_modified: 2026-08-07T00:00:00.000Z
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

# Feature Request

## What do you need built?

An append-only log recording every card answer, stored in the vault, so that
review *history* exists as data. Osmosis currently persists only current
scheduling *state*.

## What problem does this solve?

`ScheduleData` (`src/database/types.ts`) stores stability, difficulty, due,
lastReview, reps, lapses, state, learningSteps — a snapshot, overwritten on
every answer. Nothing records that a review *happened*. Roughly half the
[[Osmosis stats dashboard]] cannot be built without this, and FSRS parameter
optimisation is impossible without it.

## What's your current workaround?

None. The history has never been recorded, so it cannot be backfilled.

---

# PRD

## Why this is separate from scheduling state

Scheduling state stays exactly where it is — `osmosis-schedule` frontmatter for
line cards, ```osmosis fences for explicit cards. **Do not move it.** It is
bounded (one entry per card, rewritten in place) and in-note storage is what
makes cards portable: share a note and its schedule travels, a note moved
outside Obsidian cannot orphan its cards, and everything stays plain text.

The review log is the only genuinely unbounded data Osmosis produces, and that
is the sole reason it needs different storage.

## Why not `data.json`

`Plugin.saveData()` serialises the entire object and rewrites the whole file;
`loadData()` parses all of it at startup. Against an append-only log:

| Load | Entries/yr | Size/yr | Cost per card answered |
|---|---|---|---|
| Casual (50/day) | 18K | ~1.7 MB | rewrite 1.7 MB |
| Serious (200/day) | 73K | ~7 MB | rewrite 7 MB |
| Heavy (500/day) | 183K | ~17.5 MB | rewrite 17.5 MB |

A serious user at 10 cards/minute would push ~70 MB/min of disk writes and pay a
7 MB JSON parse on every plugin load. Buffering reduces write frequency but not
file size or startup cost. There is also no merge: whole-file last-writer-wins
means one device's offline session silently erases another's.

`data.json` remains correct for settings and for the local install ID. It is
wrong for a log.

## Storage layout

JSONL in a user-configurable vault folder, default `Osmosis/Reviews/`, sharded
by month **and device**.

```
Osmosis/Reviews/
  2026-07.pixel-10a.jsonl
  2026-08.pixel-10a.jsonl
  2026-08.sawyers-macbook.jsonl
```

Each shard opens with a header line, then one entry per answer:

```jsonl
{"device":"pixel-10a","install":"a3f9","v":1}
{"t":1754500000000,"c":"os-wcfb3w","r":3,"s":"review","iv":345600,"st":12.3,"d":6.4,"e":4200,"m":"sequential"}
```

| Field | Meaning |
|---|---|
| `t` | answer timestamp, epoch ms |
| `c` | card ID |
| `r` | rating 1–4 |
| `s` | card state *after* the answer |
| `iv` | interval granted, seconds |
| `st` / `d` | stability / difficulty after |
| `e` | elapsed ms the card was on screen |
| `m` | study mode (`sequential` / `contextual` / `spatial`) |

`m` is Osmosis-specific and enables a breakdown Anki cannot produce. `st`/`d`
are recorded so FSRS optimisation and retrievability reconstruction stay
possible later.

## Why shard by device

Obsidian Sync reconciles per file. Two devices appending to one shared shard
produce two versions of the same file, which Sync cannot merge — last writer
wins, or a conflicted copy lands for the user to merge by hand.

With per-device shards **no file ever has two writers**, so there is nothing to
reconcile. Every shard propagates to every device, and every device reads the
union of all of them. Sharding is what makes cross-device stats *consistent*;
it does not partition the data.

```
Monday, both devices offline:
  desktop  2026-08.sawyers-macbook.jsonl  → [50 reviews]
  phone    2026-08.pixel-10a.jsonl        → [30 reviews]

Different files → Sync has nothing to reconcile.
Both propagate. Every device reads 80 reviews. Nothing lost.
```

## Device naming

`deviceName` is **not** in the public API — it appears nowhere in
`ref/obsidian-api/obsidian.d.ts`. Resolution order:

1. `app.internalPlugins.plugins.sync?.instance?.deviceName` — undocumented
   internal. Declare it in `src/obsidian-internals.d.ts` following that file's
   existing policy, and guard with optional chaining. Only exists for Obsidian
   Sync users.
2. `Platform` fallback (public): `desktop-mac`, `desktop-win`, `desktop-linux`,
   `mobile-ios`, `mobile-android`. Covers people on Drive/Dropbox setups.
3. User override in settings — always available.

Slug the result: lowercase, non-alphanumerics to `-`, collapse repeats, trim,
cap ~32 chars. `Sawyer's MacBook Pro` → `sawyers-macbook`.

**Collision guard.** The install ID lives in `data.json` (local) and in each
shard's header line, not in the filename. On startup, if this device's target
shard carries a different `install` value, bump the label to `pixel-10a-2` and
retry. Readable filenames, collisions still harmless.

## Obsidian Sync callout

Obsidian does not sync `.jsonl` unless **Settings → Sync → Sync all other
types** is enabled, and it is off by default. Worse, [sync settings themselves
do not propagate between devices](https://help.obsidian.md/sync/settings), so it
must be enabled on every device individually.

If Obsidian Sync is detected and the toggle appears off, show a callout in
Osmosis settings explaining this, stating that it is per-device, and warning
that reviews recorded meanwhile will not travel.

## Rollup cache

Most graphs need only per-day aggregates. Maintain a rollup keyed by day with
counts by rating, state, and study mode.

**The rollup must never sync.** If every device wrote it, it would become a
shared-write file and reintroduce exactly the conflict sharding removes. Keep it
local — plugin data or a local cache file — recomputed from whatever shards the
device holds. Raw shards are read lazily, only for graphs that need them
(Hourly Breakdown, Answer Buttons, True Retention, FSRS optimisation).

## Lifecycle: keep everything, forever

**Never prune, never purge.** Entries are retained even when their card is
deleted, its note is deleted, or its ID is regenerated. A review that happened
is a fact, and Anki treats its `revlog` the same way.

Orphaned entries — those whose card ID no longer resolves — are handled by graph
class, not by deletion:

| Graph class | Orphan handling |
|---|---|
| Volume (Today, Calendar, Reviews, Review Time, Hourly) | **Included.** You studied that day; the heatmap must not retroactively empty when a deck is deleted. |
| Maturity-split or state-joined (Answer Buttons by maturity, True Retention) | **Excluded.** Maturity cannot be determined without card state. |

Aggregation code must therefore treat "card not found" as a normal case, not an
error. This is the single easiest thing to get wrong here: a naive join against
`CardStore` would silently drop history for every deleted card.

The same rule settles [[Reset card scheduling data]]: resetting a card clears its
FSRS state but **leaves its log entries untouched**. The card starts over; the
history of having studied it does not.

## Day one: start empty

**Do not backfill or synthesize.** Existing cards carry `reps`, `lapses`, and
`lastReview`, which is tempting to seed from — but a card with `reps: 40` yields
exactly one timestamp, which would render as one busy day preceded by months of
false inactivity. Invented data is worse than absent data.

The log begins at install. Every entry corresponds to an observed review.

This is survivable because the state-derived graphs — Card Counts, Future Due,
Review Intervals, Card Stability, Card Difficulty, Card Retrievability — are
fully populated from day one. The dashboard is not empty on arrival; only the
history-backed graphs start bare and fill in.

## Write path

Reviews buffer in memory during a session and flush on session end, mirroring
`ScheduleStore`'s existing debounce. Flush also on plugin unload. Appends use
`vault.append` (or read-modify-write on the single owned shard) — never a
whole-file rewrite of the collection.

## Acceptance criteria

- [ ] Every answer in all three study modes appends exactly one entry
- [ ] Entries land in the configured folder, default `Osmosis/Reviews/`
- [ ] Shard filename carries a readable device label; header carries the install ID
- [ ] A second device with a colliding label bumps to `-2` without data loss
- [ ] Reading the union of shards yields every review exactly once, ordered by `t`
- [ ] Rollup cache is local-only and never written to the shard folder
- [ ] Settings callout appears when Sync is detected and "all other types" is off
- [ ] Changing the folder in settings moves existing shards
- [ ] Plugin start does not parse raw shards; only the rollup loads eagerly
- [ ] Deleting a card leaves its entries intact and still counted in volume graphs
- [ ] Aggregation treats an unresolvable card ID as normal, never as an error
- [ ] No backfill runs on first install; the log starts empty
- [ ] `npm run lint` and `npm test` clean

## Test plan

Unit (`src/store/ReviewLog.test.ts`): entry serialisation round-trip, shard
filename slugging, collision-guard bump, union-and-sort across shards, rollup
aggregation, dedup on replayed entries, and orphan handling — entries whose card
ID is absent from `CardStore` must survive volume aggregation and drop out of
maturity-split aggregation.

Manual: review cards on desktop, confirm the shard file appears with correct
name and lines. Simulate a second device by hand-adding a shard with a different
install ID and confirm stats read both and the label bumps.

## Follow-ups

- FSRS parameter optimisation from logged history — new task, see
  [[Review FSRS implementation]]
- Optional archive setting: roll shards older than N years into a compacted
  daily aggregate. Deliberately not in v1 — retention is unconditional for now,
  and this only becomes worth building if a real user's log gets unwieldy.
