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
status: In-Progress
priority:
progress_current:
progress_total:
date_created: 2026-04-03T21:48:11.516Z
date_modified: 2026-08-06T17:21:05.784Z
date_start_scheduled:
date_start_actual:
date_end_scheduled:
date_end_actual:
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
  - "[[Review log storage]]"
cover:
color:
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