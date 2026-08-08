---
title: Osmosis stats dashboard
summary: A dashboard including a heatmap, statistics, and graphs of study sessions
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-04-03T21:48:11.516Z
date_modified: 2026-08-08T14:38:41.000Z
date_start_scheduled: 2026-08-07T23:00:27.000Z
date_start_actual: 2026-08-07T23:00:27.000Z
date_end_scheduled: 2026-08-08T14:38:41.000Z
date_end_actual: 2026-08-08T14:38:41.000Z
all_day: true
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/17
name: Idea
about: Suggest a feature or optimization
labels: feature, optimization
assignees:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

A dashboard including stats, graphs, and a heatmap of studying info, inspired by [Anki's Stats Dashboard](https://docs.ankiweb.net/stats.html#statistics)

![](Pasted%20image%2020260806172808.png)

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

There's currently no way to see your progress of learning.  How can you make decisions about how to study without aggregating the stats about your behavior?

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*

Studying individual card scheduling data one at a time.  There's currently no way to aggregate nor visualize

## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

---

# PRD

## Blocked on [[Review log storage]]

Osmosis persists only current scheduling state — `ScheduleData` in
`src/database/types.ts` holds stability, difficulty, due, lastReview, reps,
lapses, state, and is overwritten on every answer. Nothing records that a review
*happened*.

Anki draws these from its `revlog` table. Roughly half this dashboard cannot be
built until that log exists, and **history cannot be backfilled** — a card with
`reps: 40` gives no information about *when* those 40 reviews occurred. Every
day the log is not shipped is a day of history permanently lost.

Build [[Review log storage]] first. The state-only graphs below can be built in
parallel, but the log should land first so data starts accumulating.

## Graph set — full Anki parity minus SM-2

**Card Ease is dropped.** It measures the SM-2 ease factor, which FSRS does not
have. Osmosis is FSRS-only, so the graph would be meaningless.

| Graph | Source | Notes |
|---|---|---|
| Today | log | Reviews, time, again-count %, split by learn/review/relearn |
| Future Due | state | From `due`; backlog toggle; 1 month / 3 months / 1 year / all |
| Calendar | log | Year heatmap, per-day counts, hover detail, year stepper |
| Reviews | log | Stacked bars by maturity; 1 month / 3 months / 1 year; time toggle |
| Card Counts | state | Pie: new / learning / relearning / young / mature / suspended |
| Review Time | log | Mirrors Reviews, summing `e` instead of counting |
| Review Intervals | state | Interval distribution; 1 month / 50% / 95% / all |
| Card Stability | state | FSRS stability distribution |
| Card Difficulty | state | FSRS difficulty distribution |
| Card Retrievability | state | Computed from stability + elapsed; est. total remembered |
| Hourly Breakdown | log | Volume and success rate by hour of day |
| Answer Buttons | log | Again/Hard/Good/Easy frequency by card maturity |
| True Retention | log | Mature cards only (interval ≥ 21d), first review per day |
| **Study Mode** | log | **Osmosis-native** — breakdown by sequential / contextual / spatial, from the log's `m` field. Anki has no equivalent. |

Young vs mature threshold is Anki's: interval ≥ 21 days is mature.

## Scope controls

**Deck scope** is a hierarchical picker reusing `buildDeckTree()` from
`src/study/DeckTreeBuilder.ts` — the same tree the sidebar already renders —
plus a "Whole collection" entry. Selecting a parent deck includes its children,
which `DeckScope` already models with its `parent` / `single` distinction, so
scoping needs no new concepts.

Deliberately **not** Anki's free-text `deck:current` search box: Osmosis has no
query syntax anywhere else, and introducing one here would mean designing and
parsing a language as a side effect of a stats task.

**History scope** is last 12 months / all history. Per Anki, **Today ignores the
history scope** and always means today.

Both graphs and scope apply to whatever the log holds — see
[[Review log storage]] for why history begins at install rather than being
backfilled, and why a blank early stretch is expected.

## Data access

Read the local rollup cache for everything day-bucketed (Today, Calendar,
Reviews, Review Time). Read raw shards lazily, only when a graph needs
per-review detail — Hourly Breakdown, Answer Buttons, True Retention. A user who
never opens those never pays the parse.

State-derived graphs read `CardStore` directly and need no log at all.

## Rendering

Charts must be self-contained — no CDN, no external scripts. Draw with inline
SVG built by hand, matching how the plugin already renders. Respect Obsidian
theme variables so light and dark both work, and make every graph readable at
half-window width since it lives in a main-area tab that can be split.

## Surface map

| File | Change |
|---|---|
| `src/views/StatsView.ts` | New — the main-area view, scope controls, graph layout |
| `src/stats/aggregate.ts` | New — pure functions: log entries → graph data |
| `src/stats/charts.ts` | New — SVG chart primitives (bar, pie, heatmap, histogram) |
| `src/main.ts` | Register the view; Stats command |
| `src/styles.ts` | Dashboard grid and chart styling |

## Acceptance criteria

- [ ] All 14 graphs render; Card Ease is absent
- [ ] Deck scope uses the hierarchical picker; a parent deck includes its children
- [ ] Deck / collection scope filters every graph
- [ ] 12-month / all-history scope applies everywhere except Today
- [ ] Reviews of since-deleted cards still count in volume graphs
- [ ] Today reflects reviews from today only, regardless of scope
- [ ] Calendar heatmap shows per-day counts with hover detail and a year stepper
- [ ] True Retention counts mature cards only, first review per day
- [ ] Study Mode graph attributes reviews to the correct study surface
- [ ] Empty state is graceful when no log exists yet — state-only graphs still draw
- [ ] Charts are legible in light and dark themes at half width
- [ ] Opening the view does not parse raw shards unless a log-backed graph needs them
- [ ] `npm run lint` and `npm test` clean

## Test plan

Unit (`src/stats/aggregate.test.ts`) is where the real coverage lives — every
aggregation is a pure function over a synthetic log. Cover: day bucketing across
month boundaries, maturity classification at the 21-day edge, true-retention
first-review-per-day dedup, hourly bucketing across a DST change, empty-log
behaviour for every graph.

Manual: study cards across all three modes, open Stats, confirm Today matches
what was just done and the Study Mode graph attributes them correctly.

## Follow-ups

- **Export — explicitly out of scope here.** Anki's Save PDF needs its own
  SVG→PDF or print-stylesheet path, and it is independently useful, so it gets
  its own task rather than riding along on a task already carrying 14 graphs.
- FSRS parameter optimisation from logged history — see
  [[Review FSRS implementation]]
- Per-note or per-folder breakdown, which Osmosis could offer and Anki cannot
---

# What was implemented

## Where it shipped

PR [#17](https://github.com/SawyerRensel/Osmosis/pull/17), branch
`feature/osmosis-stats-dashboard` → `release/0.0.4`. Third of the milestone's
five tasks, after [[Review log storage]] and [[Osmosis Dashboard]].

All 14 graphs, both scope controls, plus three graphs and a filter that were not
in the PRD — see *Beyond the PRD* below.

## The two conflicts in the PRD above, and how they were resolved

**Reviews could not be stacked "by maturity" as the graph table asked.** The
data-access section put Reviews on the cheap rollup path, but `DayRollup` had no
maturity or interval buckets — only `byState`. Maturity is a function of `iv`
against the 21-day line, which exists only on raw entries.

Resolved by **adding the split to the rollup**: `byClass` and `timeByClass`, a
four-way learning / young / mature / relearning breakdown — Anki's Reviews
legend. The framing that this was "the most invasive" option turned out to be
wrong, and it matters why: the **shard format is untouched**. Only the derived
localStorage rollup cache changes, and that cache already documents itself as
disposable. So `CACHE_VERSION` went 1 → 2 and a v1 cache is *discarded*, not
migrated — a zeroed split is indistinguishable from a genuinely empty day, so
backfilling zeroes would have shown flat Reviews bars across all pre-upgrade
history. One re-parse rebuilds it exactly.

Classification uses the state and interval the answer *produced*, since that is
what the log records. This differs from Anki only on the single review that
carries a card across the maturity line. Storing the prior interval to close
that gap would mean changing the append-only shard format, which cannot be
backfilled — a permanent cost for a one-review boundary difference.

**"Suspended" in the Card Counts pie** counts `disabled` and is labelled
**Excluded**, the word Osmosis's own UI already uses ("Exclude this card"). The
pie speaks the plugin's language rather than importing Anki jargon that appears
nowhere else. `excludeFromDecks` cards are counted **normally by state** — they
are out of deck totals and the sequential queue but still actively studied in
place, so filing them under "not studied" would be wrong.

## A third conflict the PRD did not anticipate

**`DayRollup` carries no card IDs, so it cannot be deck-filtered at all.** That
absence is deliberate — it is what stops a deleted deck retroactively emptying
the heatmap — but it means "deck scope filters every graph" forces a structural
split:

- **Whole collection** reads the cached rollup at zero I/O.
- **Any narrower deck scope** must read raw entries, because a review joins to a
  deck only through its card ID.

So choosing a deck is what moves a volume graph onto the expensive path, and
under a deck scope reviews of since-deleted cards correctly drop out — they
resolve to no deck. The PRD's "reviews of since-deleted cards still count" is
therefore a *whole-collection* claim, and true there.

Under a deck scope the rollup is rebuilt from the scoped entries with the same
`aggregateRollup` the cache itself uses, so every downstream graph is identical
either way and none of them knows which path it got.

## Beyond the PRD

Added during review, after the question "what can Osmosis visualise that Anki
cannot?". All three share one `recallBy()` rather than three copies of the
prior-interval and dedup logic:

- **Recall by study mode** — the graph the plugin exists to justify. Does
  meeting a card in the note that taught it retain better than drilling it out
  of context? A flat result is a real answer too.
- **Recall by card type** — which *authoring style* works. Labelled Basic /
  Bidirectional / Cloze / Code cloze / Line.
- **Weakest notes** — worst recall first, minimum 5 graduated reviews, top 10.
  A high lapse rate here is usually a writing problem, so this turns stats into
  an editing worklist.

These use a **1-day graduated bar**, not True Retention's 21-day mature bar.
Slicing mature-only reviews four ways leaves samples too thin to compare; one
day is the lowest threshold that still excludes same-session learning-step
answers. Two different bars on one dashboard is a real cost, accepted for
sample size, and the captions state which is which.

Also added: a **study-mode filter** across the whole dashboard. Log-backed
graphs filter reviews by `m`; card-state graphs restrict to cards with at least
one review on that surface, since a card carries no mode of its own. **New cards
therefore leave the state graphs under any mode filter** — an unstudied card was
not studied contextually. Weighed and accepted.

## Causes worth remembering

**One unguarded throw blanked eleven panels and killed the data refresh.** All
panels draw in one loop, so an exception aborted every panel after it *and*
propagated out of `render()` — which is called from `onOpen` on the line before
`refreshRollup()`, so the rollup never refreshed either. The visible symptom was
"most graphs empty and the numbers are all zero", which reads as a data problem
and is not. Each panel now draws inside its own guard and reports into its own
card. **Do not collapse that back into a bare loop.**

The underlying throw: `createSvg` passes `cls` to `classList.add()`, which
rejects a token containing a space — while the HTML helpers (`createDiv`,
`createEl`) accept a space-separated string. A two-class heatmap `<svg>` was
enough. The jsdom polyfill in `charts.dom.test.ts` now **deliberately
reproduces that asymmetry**; a forgiving stub is what let the bug through.

**True retention reads maturity from the previous entry's granted interval.**
Using the entry's own `iv` would be catastrophic rather than merely imprecise:
answering a mature card Again collapses its interval to minutes, so every
failure would classify as young and be filtered out, reporting retention as a
flat 100%. `withPriorIntervals` recovers the interval going in by walking each
card in timestamp order.

**Drag-to-reorder moves nothing until the drop.** Built three times; attempts 1
and 2 both moved the panel through the grid live and killed their own drag —
reparenting a drag source aborts an HTML5 drag in Chromium, and detaching a node
releases pointer capture. Attempt 2 swapped to pointer events to reach mobile,
which fixed nothing, because the grip lives inside the panel being moved. The
working version mirrors `ref/Planner/src/views/BasesKanbanView.ts`.

**Masonry needs multi-column, not grid.** Grid row height comes from the tallest
item, so `align-items: start` shrinks a number-only panel but not the row it
sits in, and the dead space survives. Multi-column packs panels down each
column, trading left-to-right reading order for the space.

## Decisions worth remembering

- **Series colours are pinned hexes, not Obsidian's `--color-*` variables.**
  Slot *order* is the colour-vision-safety mechanism and was validated pair by
  pair against both surfaces; a community theme would silently invalidate it.
  Chart chrome still uses theme variables. Worst adjacent CVD ΔE 9.1 light /
  8.4 dark; worst normal-vision 19.6 / 19.3. **Reordering `CLASS_SERIES` breaks
  the guarantee.**
- **Charts draw at a measured pixel width, not through a viewBox.** A viewBox
  would shrink axis text along with the plot, and these live in a tab that is
  routinely split to half a window. The cost is a redraw on resize, which is
  cheap because the data is already in memory.
- **Long ranges bucket.** 1 month daily, 3 months weekly (Sunday-aligned to
  match the heatmap rows), 1 year monthly. A year of one-bar-per-day is a 1px
  sliver per column. Bucketed ranges label only the column that opens a month.
- **Two drag paths, not one.** HTML5 DnD for mouse; touch events with a
  fixed-position clone for touch, because `dragstart` never fires from touch in
  Obsidian's mobile webview. Pointer events look like a tidy unification and
  are not.
- **Only the grip is a drag surface**, never the panel — panels are full of
  hoverable bars, range pickers and checkboxes.
- **`touch-action: none` is permanent on the grip**, not toggled at touchstart
  as Planner does for cards. Planner needs the toggle because a card must still
  scroll; a 16px grip never does, which sidesteps the iOS scroll-commit timing.
- **Grips are always visible under `@media (hover: none)`** — with no hover on
  touch, hover-reveal would hide the feature outright.
- **Panel order saves with `saveData`, not `saveSettings`** — the latter
  triggers a full card re-sync, irrelevant to panel order.
- **New panels append at the bottom** rather than claiming a default slot, so a
  future release never reshuffles an arrangement someone made. **Panel IDs are
  saved data: renaming one silently resets that panel to the bottom of every
  reader's layout.**
- **The tooltip hangs off the panel, not the plot.** The plot is the scroll
  container for the 53-column heatmap, so a tip inside it is clipped at the edge
  and drifts by `scrollLeft`.
- **`explicit` was not renamed to `basic`.** Only the display labels say
  "Basic". The `CardType` union is internal and never serialised, so the rename
  is safe whenever wanted — but it is an ~8-file diff across card generation,
  which a stats PR should not carry.

## Surface map

| File | Change |
|---|---|
| `src/store/ReviewLog.ts` | `byClass` / `timeByClass` on `DayRollup`; `classifyReview`; `MATURE_INTERVAL_SECONDS`; `CACHE_VERSION` 1 → 2 |
| `src/stats/aggregate.ts` | New — every aggregation as a pure function; scoping, bucketing, distributions, `withPriorIntervals`, `recallBy` |
| `src/stats/charts.ts` | New — inline-SVG primitives: bar (stacked/grouped), histogram, pie, calendar heatmap, legend, tooltip |
| `src/stats/panelOrder.ts` | New — `orderPanels()` reconciles the saved ID list against the panels that exist |
| `src/views/StatsView.ts` | The dashboard: scope bar, 17 panels, two data paths, lazy detail load, per-panel guards, drag-to-reorder |
| `src/database/FSRSScheduler.ts` | `retrievability()` over ts-fsrs' forgetting curve |
| `src/settings.ts` | `statsPanelOrder: string[]` |
| `styles.css` | Validated palette tokens, masonry, panels, charts, tooltip, legend, tiles, tables, meters, grips |
| `eslint.config.mts` | Two obsidianmd rules off for the jsdom polyfill test, which must call the raw DOM API |
| `e2e/fixtures/generate-review-log.mjs` | New — synthetic year of history for manual testing |

`src/main.ts` was **not** touched: `activateMainView` already sufficed.

## Test fixture

`e2e/fixtures/generate-review-log.mjs` — writes a deterministic synthetic year
into the *configured* log folder (read from `data.json`, not assumed), so a full
heatmap and the year stepper can be tested without waiting a year. It harvests
the vault's real card IDs, because synthetic ones leave every card-joined graph
empty; it keeps ~20 unresolvable IDs on purpose so deleted-card handling stays
visible in both directions. Output is gitignored (`vault/**/*.jsonl`).

Unit coverage is 1038 tests. `src/stats/aggregate.test.ts` carries the real
weight — every aggregation over a synthetic log, including the month-boundary,
21-day-edge, first-review-per-day, DST and empty-log cases the test plan asked
for. `src/stats/charts.dom.test.ts` smoke-renders every chart under jsdom.

## Not done, deliberately

- **No keyboard path to reordering** — grips are pointer-only.
- **No reset-to-default-order** affordance.
- **No unit tests for the drag gestures**; only the pure ordering function is
  covered. Verified by manual testing on desktop.
- **Mobile drag is untested** — the touch path was written against Planner's
  working implementation but never exercised on a device.

## Follow-ups

- **Export** — still out of scope, per the PRD above. Needs its own SVG→PDF or
  print-stylesheet path.
- **Per-folder breakdown** — Weakest notes covers the per-note half; folders are
  approximately the deck picker already.
- **Rename `explicit` → `basic`** in the `CardType` union.
- **The demo vault's `difficulty` values are on the wrong scale.** Notes under
  `vault/demo/**` hand-author `difficulty:` as 0.25–0.9; FSRS difficulty is
  1–10. 204 of 304 cards are affected, which makes Card difficulty read as a
  wall at zero. Pre-existing content bug, found here, not fixed here. Wants its
  own bug note.
- **A nameless deck row** in the dashboard sidebar — carried over from
  [[Osmosis Dashboard]], still unchased, still wants its own bug note.
- Next in the milestone: [[Create Card Browser - Editor]], then
  [[Develop Image Occlusion System for Flaschards]].
