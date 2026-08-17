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
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-07T00:00:00.000Z
date_modified: 2026-08-07T22:12:12.000Z
date_start_scheduled: 2026-08-07T19:21:05.000Z
date_start_actual: 2026-08-07T19:21:05.000Z
date_end_scheduled: 2026-08-07T22:12:12.000Z
date_end_actual: 2026-08-07T22:12:12.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/15
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

---

# What was implemented

## Where it shipped

PR [#15](https://github.com/SawyerRensel/Osmosis/pull/15), branch
`feature/review-log-storage` → `release/0.0.4`. The log begins at this install;
everything before it is gone, as expected.

## The cause

Not a bug — an absence. `ScheduleData` is a *snapshot*: stability, difficulty,
due, lastReview, reps, lapses, state. Every answer overwrites it. `reps: 40`
says forty reviews happened and nothing about *when*, so half the dashboard was
unbuildable and no amount of later work could recover the missing days. That is
why this shipped first in the milestone.

## The fix

Every answer appends one JSONL line to a shard in the vault, named by month
**and device** — `Osmosis/Reviews/2026-08.pixel-10a.jsonl`. Per-device shards
mean no file ever has two writers, so Sync has nothing to reconcile; readers
take the union of every shard. Writes are appends, never whole-file rewrites.

## Decisions worth remembering

**Volume aggregation never looks a card up.** `aggregateRollup` takes entries
and nothing else — no `CardStore`, no resolver. That is what makes a deleted
deck unable to retroactively empty the heatmap: true by construction, not by
remembering to handle it. `aggregateAnswerButtons` *does* need the card
(maturity is a property of the current schedule), so unresolvable IDs land in
its `excluded` count. Do not "tidy" these into one function with an optional
resolver; the asymmetry is the design.

**Study mode is a constructor argument** on `StudySessionManager`, not a
per-call one. Each surface builds its own manager and has exactly one mode, so
`createSessionManager(mode)` makes it impossible for a new study surface to log
unattributed reviews. A fifth call site cannot forget.

**`deviceLabelCandidate(label, attempt)` takes the attempt number** rather than
parsing a trailing number off the label. Parsing would bump a device
legitimately named `nexus-5` to `nexus-6`, silently renaming its shard.

**The slug deviates from the PRD's example.** `Sawyer's MacBook Pro` →
`sawyers-macbook-pro`, not the note's illustrative `sawyers-macbook`. The
stated *rule* (lowercase, non-alphanumerics to `-`, cap ~32) is normative and
19 chars is well under the cap; the arrow example was inexact. Apostrophes are
stripped rather than hyphenated, which is what the example does show.

**`foldIntoCache` only folds when the cache provably held the shard's whole
contents before the append**, comparing a pre-append stat against the cached
fingerprint. Otherwise it deletes the cache entry so the next `getRollup()`
rebuilds from the file. Without that check, appending to a shard the cache
had never seen would stamp a current fingerprint over a partial rollup and hide
the earlier reviews forever.

**Undo drops an entry only while it is still buffered.** Rewriting a shard to
delete a line would break the append-only property that makes concurrent
devices safe, and a review that reached disk did happen.

**Elapsed time anchors differ by surface, deliberately.** Sequential measures
from question render (Anki's semantics). The three in-place surfaces have no
"question shown" moment — the card sits inline among ordinary content — so they
measure from reveal. Slightly undercounts there; the alternative is a
fabricated number.

**The rollup cache is in `app.saveLocalStorage`** (key `osmosis-review-rollup`),
not a file. Vault-local, per-device, cannot sync by construction rather than by
convention.

## A note rename orphans that note's line-card history

Line-card IDs embed the note path (`notes/bridges.md#^os-rlbul1`).
`CardSyncService.handleRename` re-keys cards in the store, but entries already
on disk keep the old ID. Volume graphs are unaffected — they never join — so
the heatmap stays correct; maturity-split graphs lose those reviews to
`excluded`. This is the PRD's "or its ID is regenerated" case working as
specified.

**Do not "fix" this by rewriting shards on rename.** That would destroy the
append-only property the whole cross-device design rests on. If it ever needs
addressing, the answer is an ID-alias map, not a rewrite.

## Obsidian Sync's "all other types" toggle is not readable — notice, not detection

The PRD asks for a callout when Sync is detected *and* the toggle is off.
**That state is not reachable from the plugin.** Checked against Sync internal
version 5280:

| Probe | Result |
|---|---|
| `instance.allowTypes` | does not exist |
| `instance.filter.allowTypes` | `{}` with the toggle both on and off |
| `instance.canSyncPath(path)` | `true` for `.jsonl` *and* `.png` in both states — it tests path filters only |

Two attempts at inferring it each shipped a notice that contradicted the user's
real configuration. It therefore informs rather than detects: shown whenever
Sync is enabled, worded so it does not claim to know the setting, with a
Dismiss button (`reviewLogSyncNoticeDismissed`).

**Do not add a third guess.** The one lead not yet followed is
`instance.loadData()` — the Sync plugin's own persisted config, which is where
per-device type toggles would have to live. If that pans out, replace the
notice with a real conditional and drop the Dismiss.

## Surface map

| File | Change |
|---|---|
| `src/store/ReviewLog.ts` | New — serialisation, shard naming, collision guard, union reads, rollups, the local cache |
| `src/store/ReviewLog.test.ts` | New — 127 tests, incl. an in-memory `FakeFs` |
| `src/study/StudySessionManager.ts` | `mode` + `reviewLog` constructor args; logs in `recordReview`, discards in `revertReview`; `now`/`elapsedMs` moved into a `ReviewContext` |
| `src/main.ts` | Constructs the log; `resolveDeviceLabel`, `generateInstallId`, `changeReviewLogFolder`, `setReviewLogDeviceLabel`, `shouldShowSyncNotice`, `dismissSyncNotice`; flushes on unload |
| `src/settings.ts` | "Review history" group: folder, device name, Sync notice; `buildPathInput` (commits on blur/Enter, not per keystroke) |
| `src/obsidian-internals.d.ts` | `internalPlugins.plugins.sync`, and a record of what was ruled out |
| `src/views/SequentialStudyModal.ts` | `cardShownAt` at question render |
| `src/views/LineRevealProcessor.ts` | `pendingRatingAt`; contextual mode; flush on session end |
| `src/views/ContextualStudyProcessor.ts` | `revealedAt`; contextual mode |
| `src/views/MindMapView.ts` | `spatialPendingRatingAt`; spatial mode; flush on session end |
| `src/views/DashboardSidebarView.ts` | Sequential mode; flush on session end |
| `styles.css` | `.osmosis-settings-notice` |
| `.gitignore` | `vault/**/*.jsonl` — shards are generated and would churn every session |

## Test fixture

`e2e/fixtures/review-log-test.md` → `vault/tests/flashcard/`. Bridge types
(neutral domain): 4 due line cards, 2 new, 1 fence card, deck
`tests/review-log`. Enough to exercise all three study surfaces in one note.

Manual verification went further than the checklist: the resulting shard was
round-tripped back through the production reader, and its `iv` values
independently cross-check against FSRS stability (72.03→72d, 16.78→17d,
227.88→228d) with learning cards following the configured steps.

## What was deliberately not done

- No archive/compaction (see Follow-ups) — retention is unconditional.
- No stats UI. `getRollup()` and `readAll()` exist for
  [[Osmosis stats dashboard]] to consume; nothing reads them yet.
- No dedup of a hand-duplicated shard *file* in the rollup path. `readAll()`
  dedups on `t|c|r`, but per-shard cached rollups would double-count a file
  copied under a new name. Single-writer shards make this unreachable without
  the user manually copying files.
