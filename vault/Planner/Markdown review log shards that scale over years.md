---
title: Markdown review log shards that scale over years
summary: Move review shards to Markdown so they sync by default, guard them out of card sync, and replace the whole-log read with a streaming pass that survives five years of heavy use
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Review log storage]]"
  - "[[Osmosis stats dashboard]]"
  - "[[Cache the detail aggregates per shard]]"
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-14T00:00:00.000Z
date_modified: 2026-08-14T11:45:00.000Z
date_start_scheduled: 2026-08-14T10:25:00.000Z
date_start_actual: 2026-08-14T10:25:00.000Z
date_end_scheduled: 2026-08-14T11:45:00.000Z
date_end_actual: 2026-08-14T11:45:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/28
---

# Feature Request

## What do you need built?

Three changes to the review log shipped by [[Review log storage]], as one piece
of work because they interlock:

1. Shards become Markdown (`2026-08.pixel-10a.md`) instead of `.jsonl`, so
   Obsidian Sync carries them without per-device configuration.
2. A folder guard keeps those Markdown files out of `CardSyncService` and the
   vault event listeners, which would otherwise parse them as notes.
3. `readAll()` is replaced by a bounded-memory streaming pass, so the stats
   dashboard still opens after years of history.

## What problem does this solve?

**The `.jsonl` extension made syncing the user's problem.** Obsidian ignores
non-Markdown files unless *Settings → Sync → Sync all other types* is on; it is
off by default and [does not propagate between
devices](https://help.obsidian.md/sync/settings). [[Review log storage]] tried
three ways to read that toggle against Sync internal version 5280 — `allowTypes`
absent, `filter.allowTypes` `{}` in both states, `canSyncPath` `true` regardless
— and shipped a dismissible notice instead of real detection. Markdown deletes
that whole problem class.

**`readAll()` does not survive long-term use.** It is live today:
`StatsView.loadEntries` (`src/views/StatsView.ts:287`) calls it when a detail
plot scrolls into view. This corrects the "nothing reads them yet" line in
[[Review log storage]] — that was true when the log shipped and stopped being
true when the dashboard landed in PR #17.

## What's your current workaround?

None. Both problems are latent: the sync notice misinforms today, and the
scaling ceiling is invisible until a user accumulates enough history.

---

# PRD

## The measured shape of the problem

Sizes are computed from the real `serializeEntry` output, not the PRD's
illustrative example. Line-card IDs embed the note path
(`notes/bridges.md#^os-rlbul1`), so entries are larger than that example
suggested: **111 bytes** for a fence card, **129 bytes** for a line card, ~125
blended.

Five years at 500 reviews/day:

| | |
|---|---|
| Total entries | 912,500 |
| Total on disk | 108 MB |
| Shard files | 60 (one device), 120 (two) |
| Any single shard | **1.8 MB — constant** |

Monthly sharding is doing its job: per-file cost does not grow with history,
only the aggregate does. That is what makes a streaming pass viable.

## Part 1 — Markdown shards

### File shape

```markdown
Osmosis review log — pixel-10a, 2026-08. Generated file; do not edit.

```osmosis-reviews
{"device":"pixel-10a","install":"a3f9","v":2}
{"t":1754500000000,"c":"os-wcfb3w","r":3,"s":"review","iv":345600,"pi":86400,"st":12.3,"d":6.4,"e":4200,"m":"sequential"}
```

**The fence is never closed.** CommonMark specifies that an unclosed fence runs
to the end of the document, so the file is well-formed at every moment and every
write stays a pure append. Closing it would mean moving the terminator on each
flush — the same whole-file-rewrite cost the design exists to avoid.

This is the first thing to verify in the whole task: **does
`registerMarkdownCodeBlockProcessor` fire on an unterminated fence?** The shard
renderer under Decisions depends on it, and it is the one point where that
feature and pure-append could conflict.

**The header stays a JSON line inside the fence, not frontmatter.**
`src/store/ReviewLog.ts` is deliberately Obsidian-free so it is testable against
`FakeFs`; reading YAML would mean importing `obsidian` (which Vitest cannot) or
hand-rolling a parser for three keys.

**The fence tag must not be `osmosis`.** That is claimed by the card processor
at `src/views/ContextualStudyProcessor.ts:141`, so shards would be parsed as
flashcards.

### `parseShard` needs no changes

Its contract is already "anything that doesn't parse is skipped, never thrown
on", and the header branch is guarded on `header === null && entries.length ===
0`. The preamble and fence opener fail both `parseHeader` and `parseEntry` and
are dropped; the real header is still found. Verify with a test rather than
changing the function.

### Clean break — no `.jsonl` compatibility

0.0.4 is unreleased, so nothing outside dev vaults holds shards. Set
`SHARD_EXTENSION = ".md"` and stop reading `.jsonl` entirely. Existing dev
shards become inert (`parseShardFileName` stops matching them) and can be
deleted by hand.

`SHARD_NAME_PATTERN` at `ReviewLog.ts:292` hardcodes `\.jsonl$` instead of
interpolating `SHARD_EXTENSION`. **Changing the constant alone silently breaks
shard discovery.** Fix the duplication while here.

`.gitignore` needs no new rule — `vault/Osmosis/` already covers the default
folder. Remove the now-dead `vault/**/*.jsonl` line and its comment.

### Delete the sync notice

`shouldShowSyncNotice`, `dismissSyncNotice`, `reviewLogSyncNoticeDismissed`, the
settings block at `settings.ts:373`, and `.osmosis-settings-notice` in
`styles.css` (that setting is its only consumer). The post-mortem in
[[Review log storage]] should be amended to record that the notice was deleted
rather than fixed.

## Part 2 — The folder guard

Without it, shards are Markdown files and therefore card-sync input:

| Site | What happens |
|---|---|
| `CardSyncService.syncAll` (`src/card-gen/CardSyncService.ts:55`) | `getMarkdownFiles()` feeds **108 MB** to the flashcard parser at every launch |
| `vault.on("modify")` (`src/main.ts:504`) | Each flush re-parses its 1.8 MB shard, plus `refreshDashboard()` and `refreshChrome()` |
| `vault.on("create")` (`src/main.ts:512`) | Same, when a month rolls over |
| `vault.on("delete")` (`src/main.ts:520`) | `handleDelete` on a non-note |
| `vault.on("rename")` (`src/main.ts:529`) | `handleRename` on a non-note |

**One shared predicate, not five inline checks.** A sixth call site must not be
able to forget — the same reasoning that made study mode a constructor argument
on `StudySessionManager`. The failure mode is silent: no error, just a slow
startup and a card parser chewing JSON.

`settings.ts:34` (`TagSuggest`) also walks every Markdown file, but reads only
the metadata cache for tags; shards have none. Harmless, leave it.

### What the guard cannot fix

Obsidian's own metadata cache parses every `.md` file before the plugin gets a
vote — a full parse on first index, then a re-parse per flush. Bounded by
monthly sharding to ~1.8 MB a few times a day; tens of ms, worse on mobile.
Obsidian's search index will also hold the shard text. Adding the folder to
*Settings → Files & Links → Excluded files* suppresses the result noise, not the
parse. Accepted as the price of syncing by default.

## Part 3 — A review log that scales

### What breaks

`readAll()` (`ReviewLog.ts:659`) pushes every shard's entries into one array,
then `mergeShards` builds a `Set` of 912,500 dedup keys plus a second
912,500-element array, then sorts. Projection: **300–400 MB of heap and 10–20
seconds**, most of it in 912,500 individual `JSON.parse` calls. `StatsView`
holds the result in `this.entries` for the view's lifetime, and `scopedEntries()`
re-filters it into fresh arrays on every render and resize. Desktop freezes;
mobile almost certainly OOMs.

The rollup path is already fine and is the model to copy: `refreshCache`
re-parses only shards whose `mtime`/`size` moved, so steady state is 60 stats
and one 1.8 MB parse.

### The design

**1. Replace `readAll()` with a streaming scan.** One shard open at a time,
entries handed to accumulators and released. Peak memory becomes one shard
(~5 MB) instead of the whole log.

```ts
scan(visit: (e: ReviewLogEntry) => void, range?: {from: string; to: string}): Promise<void>
```

**2. Prune shards by month before opening them.** `parseShardFileName` already
returns the month, so a twelve-month view opens 12 files instead of 60, for
free.

**3. Drop the global dedup Set on the scan path.** Its docstring says it absorbs
"a shard that got copied or replayed"; [[Review log storage]] then records that
single-writer shards make that unreachable short of the user copying files by
hand. Paying 100+ MB on every read to defend against a manual file copy is the
wrong trade. Keep `mergeShards` for any caller that genuinely needs a
materialised list.

**4. Add previous-interval to the entry schema — bump `v` to 2. Decided; see
"The three maturities" below for why.** `pi` is the card's scheduled interval
*before* the answer, in seconds, `0` for a card with no prior schedule. It costs
a measured **11 bytes an entry — 8.5%, or 9.6 MB across five heavy years**.

**5. Then extend the per-shard cache to hold detail aggregates**, the way it
already holds `days`. Hourly Breakdown becomes 24 hour-of-day buckets per shard;
True Retention and Answer Buttons become small fixed accumulators once (4) lands.
Steady state then costs zero shard parsing, exactly like the day rollup.

**Deck scope stays streamed.** `entriesInScope` resolves card → deck through
`CardStore`, which is mutable, so scoped aggregates cannot be precomputed per
shard. Cache the unscoped case; fall back to a streaming pass when a deck filter
is active. Do not try to cache per (shard × deck).

**One wrinkle in caching True Retention.** Its first-review-per-card-per-day
filter dedups on `${entry.c}|${dayKey(entry.t)}`. A day belongs to exactly one
month, so that is shard-local on a single device — but two devices reviewing the
same card on the same day put the two entries in two shards, and independent
per-shard accumulators would count both. Resolved under Decisions: the dedup
looks redundant against the maturity filter and should be removed if a test
agrees, which makes True Retention shard-local. The streaming pass in step 1 is
correct either way.

### The three maturities — why `pi` is decided, not optional

Investigated 2026-08-14. The dashboard currently splits on "mature" in **three
graphs using three different definitions**:

| Graph | Definition of mature | Mechanism |
|---|---|---|
| Reviews, Review Time | Interval the answer *produced* | `classifyReview` reads `entry.iv` — entry-local |
| Answer Buttons | Card's interval **right now** | `aggregateAnswerButtons` joins `CardStore`, `(due - lastReview)` |
| True Retention | Interval the card was answered *at* | `withPriorIntervals` reconstructs it from the preceding entry |

Same word on the same dashboard, three answers. Only the third is Anki's, and
the code already had to work to get it.

**Answer Buttons is the one that is actually wrong.** Reading the *current*
schedule means the split mutates retroactively: a card reviewed 100 times while
young and matured last week reports all 100 of those reviews as mature today.
The graph is supposed to answer "when I see a mature card, how often do I press
Again" — it currently answers a question about cards that are mature *now*.
Deleted and reset cards land in `excluded` for the same structural reason.

**And it cannot be fixed by reusing `iv`.** That was the obvious cheap
alternative — `classifyReview` already does it, no format change. It is wrong
here in a worse way, because on this graph the rating *determines* the interval:
press Again on a mature card and `iv` collapses to minutes, so every lapse on a
mature card would file under *young*. The Again bar on mature cards — the entire
point of the graph — would read zero. Circular, so it is out.

That leaves prior interval, which is what `trueRetention` already reconstructs.

**The reconstruction is also the thing blocking Part 3.** `withPriorIntervals`
(`src/stats/aggregate.ts:645`) sorts every entry and walks a `Map` of last-seen
interval per card, so a card's predecessor may sit in any earlier shard. That is
inherently global: it cannot stream and it cannot be cached per shard. The
docstring on `retentionByPeriod` (`aggregate.ts:730-737`) records the same tax
from the other side — the five windows must share one annotated pass, because
filtering to a window first would strip the predecessor and silently reclassify
the oldest review in every window. Storing `pi` makes all of that disappear.

`pi` is also strictly *more* accurate than reconstruction: after a manual
reschedule or reset the card's real interval no longer matches the last logged
`iv`, and a card whose history predates the log has no predecessor at all —
that is what `unknownInterval` counts, and the docstring notes it "on a young
log can be most of them."

**The earlier rejection was correct when written and its premise is now void.**
`ReviewLog.ts:378-393` weighed storing the prior interval and declined it as "a
permanent cost for a one-review boundary difference" against a format that
"cannot be backfilled." That reasoning only ever considered `classifyReview`,
where the stake genuinely is one review at the boundary. It did not weigh
`trueRetention` needing the value badly enough to rebuild it, or Answer Buttons
using a third definition entirely — and the clean break removes the backfill
cost it was pricing.

**Therefore:** store `pi`; switch `aggregateAnswerButtons` and `trueRetention`
to read it; delete `withPriorIntervals`, `unknownInterval`, and
`AnswerButtonCounts.excluded`; and switch `classifyReview` to `pi` as well so
all three graphs finally agree and match Anki. Keep its state checks ahead of
the interval test — a lapse on a mature card belongs in the relearning bar,
which is Anki's behaviour too.

**Update the `classifyReview` docstring in the same commit.** It currently
argues *against* the change being made; left as-is it would invite a future
session to undo this.

### Storage budget

The cache lives in `app.saveLocalStorage`. A day bucket holds 19 counters
(4 ratings + 4 states + 3 modes + 4 classes + 4 times) — roughly 380 bytes
serialised, so five years is ~700 KB. Comfortable, but only one order of
magnitude from trouble.

**Therefore: never key a cached bucket by day × hour.** Hour-of-day aggregated
over the shard is 24 buckets; per-day-per-hour would be ~13 MB and would blow
the quota. Measure the real serialised size and assert a ceiling in a test.

## Acceptance criteria

- [x] Shards are `.md`, open with a preamble and an unclosed `osmosis-reviews` fence
- [x] `parseShard` reads them unchanged; a test covers preamble and fence-line skipping
- [x] `SHARD_NAME_PATTERN` derives from `SHARD_EXTENSION` rather than duplicating it
- [x] Sync notice and its setting, CSS, and dismiss state are gone
- [x] Opening a shard renders a summary, not 15,000 lines, and does not `JSON.parse` the body to do it
- [x] Settings mention *Excluded files* as an option; nothing writes `userIgnoreFilters`
- [x] A single shared predicate excludes the review folder at all five sites in `main.ts` and `CardSyncService`
- [x] Studying does not trigger card sync, a dashboard refresh, or chrome refresh
- [x] Startup does not read shard contents — only the cached rollup loads eagerly
- [x] `readAll()` is gone; `scan()` holds at most one shard in memory
- [x] A month range opens only the shards in range
- [x] Entries carry `pi`; header `v` is 2
- [x] All three graphs split maturity on `pi`; `withPriorIntervals`, `unknownInterval`, and `AnswerButtonCounts.excluded` are gone
- [x] Answer Buttons no longer consults `CardStore`, and its numbers do not change when an unrelated card matures
- [x] The `classifyReview` docstring records the reversal instead of arguing against it
- [x] Deleting a card changes no graph that does not need its deck
- [x] Cached rollup for five simulated years stays under an asserted localStorage ceiling
- [x] `npm run lint` and `npm test` clean

## Test plan

**Unit** (`src/store/ReviewLog.test.ts`, extending the existing `FakeFs`):
round-trip through the Markdown wrapper; preamble, fence opener, and a stray
closing fence all skipped; `v: 2` entries with `pi`; maturity-at-review-time
aggregation with no `CardStore`; month-range pruning opens only the expected
files; `scan` over a synthetic 900K-entry log stays under a memory ceiling and
never materialises more than one shard.

**The regression test that matters most:** *Again on a mature card files under
mature.* That is the case the discarded `iv` approach would have silently
inverted, and nothing else in the suite would have caught it. Pair it with: a
review of a card that was young at answer time stays young after the card
matures — the retroactive-mutation bug, which is currently reproducible.

`src/stats/aggregate.test.ts` needs rework alongside — its `trueRetention`
block (~line 842) and the `excluded` cases (~527, ~541, ~558) assert the
behaviour being replaced. Add the lapse-then-recover case there, since it is the
gate on removing the per-day dedup.

**Manual**, additionally: open a shard from the file explorer and confirm the
summary renders instead of the raw block, and that it appears at all — an
unterminated fence that the processor ignores is the failure mode to watch for.

**Guard**: a unit test asserting the predicate matches the configured folder and
its subpaths and rejects a same-named folder elsewhere.

**Manual**: study in all three surfaces, confirm the `.md` shard appears with
preamble and fence and renders sanely; confirm the console shows no card sync on
flush; open Stats and confirm detail graphs populate. Generate a synthetic
five-year log into the folder, reload, and confirm startup and first paint stay
responsive and the Stats tab opens without freezing.

Per the reset hazard in `CLAUDE.md`: write fixtures from `e2e/fixtures/`, then
reload Obsidian before testing.

## Decisions

*Everything previously open was resolved 2026-08-14. Recorded with reasons so a
future session does not reopen them by accident.*

### Shard renderer — build it, minimal, in this task

**Yes.** It belongs here rather than in a follow-up, because it mitigates a
hazard *this task creates*: before the switch a shard could not be opened as a
note at all, and after it there are sixty openable 1.8 MB files in the explorer.

`registerMarkdownCodeBlockProcessor("osmosis-reviews", …)` replaces the block's
rendering entirely, so the 15,000-line DOM is never built. Render three facts:
device, month, entry count, plus "generated file, do not edit."

**Do not parse the source to produce that count.** The processor receives the
whole 1.8 MB string; `JSON.parse` per line would cost 100 ms+ on every open, to
display one number. Count newlines, parse only the header line, take the month
from `ctx.sourcePath`. That is a single O(bytes) pass, ~1 ms.

No charts, no summary statistics. That is what the Stats view is for, and
anything richer would require exactly the full parse just avoided.

**Verify first that the processor fires on an unterminated fence.** CommonMark
says an unclosed fence runs to end of document, and Obsidian should treat it as
a code block with our language tag — but this is the one place where "never
close the fence" and "render a summary" could conflict. If the processor does
*not* fire, the choice is to close the fence (giving up pure-append, which is
not worth it) or to accept raw rendering and drop the renderer. **Check this
before building either half.**

### `userIgnoreFilters` — no

**Do not write to it.** The benefit is cosmetic: less search noise. The costs
are not.

`setConfig("userIgnoreFilters", …)` is undocumented internal API, and *Excluded
files* is user-facing configuration the user may have set deliberately. Silently
rewriting it is more invasive than the read-only Sync probes that failed here
before — and this task exists partly to delete the last feature built on
undocumented Sync internals. Adding a fresh dependency on undocumented internals
in the same change is the wrong direction. An entry written this way would also
outlive the plugin if it were ever uninstalled.

A settings button that does it on an explicit click was considered and rejected
too: it still needs the internal API, and it saves the user roughly three clicks
in Obsidian's own settings.

**Instead:** one line of settings help text saying the folder can be added to
*Settings → Files & Links → Excluded files* to keep shards out of search. The
user decides; nothing is written on their behalf.

**Excluding does not replace the folder guard.** `userIgnoreFilters` filters
search, graph, and unlinked mentions — it does not remove files from
`vault.getMarkdownFiles()`, so `CardSyncService` would still parse them. The two
are unrelated mechanisms and Part 2 is required either way.

### True Retention's per-day dedup — likely already redundant; test before keeping

The wrinkle in step 5 was whether per-shard caching double-counts a card
reviewed on the same day on two devices. Working through it, the dedup itself
looks unnecessary.

Its stated job is to stop a lapse-then-recover from raising retention. But the
recovery is already excluded by the maturity filter: fail a mature card and it
drops to relearning with an interval of minutes, so the re-answer's prior
interval is minutes, far below the 21-day line, and `priorIv <
MATURE_INTERVAL_SECONDS` skips it. That holds under reconstruction *and* under
`pi` — the filter does the dedup's job in both.

If that is right, `trueRetention` becomes a pure per-entry filter: fully
shard-local, cacheable, and the cross-device concern dissolves. So:

1. Write a test asserting the lapse-then-recover case yields the same numbers
   with the dedup removed.
2. If it passes, delete the dedup and cache True Retention per shard.
3. If it fails, there is a case this reasoning missed — keep the dedup, keep
   True Retention on the streaming path, and record what the case was.

This is reasoning about the code, not a measurement. **Do not delete the dedup
without step 1 passing** — the docstring calls the filter load-bearing, and it
may be defending against something not visible here (a manual reschedule making
a card mature again the same day).

*Also resolved: whether `aggregateAnswerButtons` reads current schedule — it
does, and settled more than it asked. See "The three maturities".*

## Follow-ups

- FSRS parameter optimisation genuinely needs every entry across all history.
  It is a bulk job, not a page render — chunk it or move it off the main thread.
  Belongs to [[Review FSRS implementation]], but `scan()` is the API it should
  use.
- Archive/compaction of shards older than N years remains deliberately unbuilt.
  A streaming scan plus the aggregate cache should make it unnecessary.
- Per-shard caching of the detail aggregates — step 5 of the design — is
  deliberately unbuilt. See [[Cache the detail aggregates per shard]] and
  "Step 5, and why it did not ship" below.

## What was implemented

**Where it shipped.** PR [#28](https://github.com/SawyerRensel/Osmosis/pull/28),
branch `feature/markdown-review-log-shards` → `release/0.0.4`.

### The cause

Three separate problems shared one root: the log was designed as a data file
that happened to live in a vault, rather than as vault content.

- **It did not sync.** Obsidian Sync carries non-Markdown files only when *Sync
  all other types* is on. That toggle is off by default and does not propagate
  between devices, so a `.jsonl` shard could silently never reach a second
  device. The toggle's state is also **not readable from the Sync instance** —
  `filter.allowTypes` stays `{}` in both states and `canSyncPath()` tests only
  path filters (checked against Sync internal 5280) — so the plugin could not
  even warn accurately. That dead end is what forced the format change; it is
  recorded in `obsidian-internals.d.ts` so it is not re-investigated.
- **Reading it did not scale.** `readAll()` materialised every entry. Five heavy
  years is ~900,000 objects, each from an individual `JSON.parse` — hundreds of
  megabytes of heap, a frozen desktop, and very likely an OOM on mobile.
- **Maturity meant three different things.** `classifyReview` split on `iv`,
  `aggregateAnswerButtons` joined `CardStore` and read the card's schedule *as
  it stands today*, and `trueRetention` reconstructed the prior interval by
  walking every entry. One dashboard, one word, three definitions.

### The fix

`SHARD_EXTENSION = ".md"`. A shard opens with a preamble line and an
**unclosed** ` ```osmosis-reviews ` fence. CommonMark runs an unclosed fence to
the end of the document, so the file is well-formed at every moment *and* every
write stays a pure append — closing it would mean moving a terminator on each
flush, the whole-file rewrite this design exists to avoid. `parseShard` needed
no change: its existing tolerance drops the wrapper on its own.

Because shards are Markdown they are card-sync input by default, so
`isReviewLogPath` guards the four vault listeners in `main.ts` and
`CardSyncService.syncFile`. One shared predicate, not five inline checks — the
failure mode is silent (no error, just a slow start and a card parser chewing
JSON), so a sixth call site must not be able to forget.

`readAll()` → `scan(visit, range?)`, one shard open at a time, month-pruned
before a file is opened. `DetailAccumulator` feeds every detail panel from that
single pass.

Entries gained `pi`, the interval a card was answered *at*, and every maturity
split now reads it.

### Decisions worth remembering

- **`pi`, not `iv`.** The old `classifyReview` docstring argued *for* `iv`; that
  reversed and the docstring now records the reversal so it is not undone. `iv`
  is actively wrong here — the rating sets the interval, so answering Again on a
  mature card collapses `iv` to minutes and files the lapse under *young*.
- **Answer Buttons must not consult `CardStore`.** Reading the live schedule
  made the split mutate retroactively: a card reviewed a hundred times while
  young and matured last week reported all hundred as mature. With `pi` there is
  no card lookup, so a deleted card no longer changes the graph — which is also
  why `AnswerButtonCounts.excluded` is gone.
- **True Retention's per-day dedup stays.** Its original lapse-then-recover
  justification *is* redundant against the maturity filter, and there is a test
  saying so. But contextual and spatial study let you answer a card that is not
  due, so a mature card **passed** twice in one day carries a mature `pi` on
  both answers and would be double-counted. Load-bearing for a different reason
  than the one it was written for.
- **`scan()` yields shard order, not timestamp order, and does not dedup.**
  Sorting or deduping means holding the whole log. Every aggregate it feeds is
  order-independent, and there is a test for that. `mergeShards` remains for any
  caller that genuinely needs a materialised, ordered list.
- **`pi` is captured before `store.updateSchedule`.** `CardStore.updateSchedule`
  mutates the stored card in place, so by the time the log entry is built
  `card.due` is already the interval the answer produced. Do not move it.
- **`pi` falls back to FSRS stability when a card has `due` but no
  `lastReview`.** Found during manual testing. `serializeScheduleEntry` omits
  `lastReview` when it is null, and a hand-authored `osmosis-schedule` block may
  never have carried it, so this is reachable — not a fixture artifact. The old
  condition disagreed with `currentSchedule`, which tests `due` alone; the
  result was that a genuinely scheduled card logged as brand new and dropped out
  of the retention and recall panels. Stability is the fallback because it is
  what FSRS derived the interval from, not an invented constant.
- **The Stats view refresh is pre-existing, fixed here anyway.** `onOpen` runs
  once per leaf, but `activateMainView` *reveals* an existing tab, and the view
  registered no vault events — so a Stats tab left open across a study session
  showed the numbers it loaded when it was created, including a memoized detail
  pass whose scope key had not changed so `invalidateDetail` could not see it
  was stale. Not a regression from this task, but it made the whole change look
  broken. A rollup fingerprint keeps the unchanged case free of a chart rebuild.

### Step 5, and why it did not ship

Step 5 of the design — extend the per-shard cache to hold the detail aggregates
— is the one step not built. No acceptance criterion gated on it, but the real
reason is that **its own stated resolution collapsed**. Step 5 assumed the True
Retention dedup would be removed as redundant, making retention shard-local.
The dedup turned out to be load-bearing (above), so per-shard partials cannot
simply be summed: a card-day can span two shards, so the union has to be taken
over card-days, not counts. That needs an O(reviews) set — exactly the memory
the streaming design exists to avoid. It is a genuinely unsolved design problem
rather than deferred work, and it costs nothing measurable today (~20 ms over
777 entries). Written up in [[Cache the detail aggregates per shard]].

### Surface map

| File | Change |
|---|---|
| `src/store/ReviewLog.ts` | `.md` shards, preamble + unclosed fence, `SHARD_NAME_PATTERN` derived from `SHARD_EXTENSION`, `isReviewLogPath`, `summarizeShardSource`, `readAll()` → `scan()`, `pi` on the entry, `classifyReview`/`aggregateAnswerButtons` split on `pi`, `SHARD_FORMAT_VERSION` 2, `CACHE_VERSION` 3 |
| `src/stats/detail.ts` | New — `DetailAccumulator`, one pass feeding all six detail panels |
| `src/stats/aggregate.ts` | Removed the entry-list aggregators the accumulator replaced; `entryInScope` remains |
| `src/views/ReviewShardProcessor.ts` | New — renders a shard as device/month/count without parsing entries |
| `src/views/StatsView.ts` | `entries` → `detail` + `detailScope`; `active-leaf-change` refresh; `rollupFingerprint` |
| `src/study/StudySessionManager.ts` | `priorIntervalSeconds` with the stability fallback; `pi` captured before `updateSchedule` |
| `src/card-gen/CardSyncService.ts` | `isLogPath` constructor param; `syncFile` guard |
| `src/main.ts` | `isNoteFile` + log-folder guard on the four vault listeners |
| `src/settings.ts` | Sync notice and its setting gone; folder setting mentions *Excluded files* |
| `src/obsidian-internals.d.ts` | Sync-toggle finding rewritten — it justified a deleted notice, now records why shards are Markdown |
| `styles.css` | Sync notice CSS removed |
| `e2e/fixtures/generate-review-log.mjs` | Emits `.md` shards with preamble/fence/`v: 2`/`pi`; `--clean` matches `.md`; skips the log folder when harvesting card IDs |
| `.gitignore` | `vault/**/*.jsonl` rule retired |

### Test fixture

`e2e/fixtures/review-log/2026-08.fixture-desktop.md` — a Markdown shard with 40
entries, 24 of them graduated and 11 mature, which is what makes True Retention,
the mature half of Answer Buttons, and all three Recall panels testable. Copy it
into the configured log folder and reload.

`generate-review-log.mjs` covers the bulk case: `--days 400` writes a year of
history into whatever folder the settings point at, `--clean` removes it.

### Not done

- Step 5, above.
- The 16 pre-migration `.jsonl` shards in the dev vault were deleted by hand.
  `parseShardFileName` no longer matches `.jsonl` — an intended clean break, so
  there is no migration path and pre-migration history is not readable.
