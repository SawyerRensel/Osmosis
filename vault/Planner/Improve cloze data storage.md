---
title: Improve cloze data storage
summary: I like how image occlusion is using indentation to group scheduling data in frontmatter instead of the way cloze schedules are written with a prefix in flashcard fences.  Need to support backwards compatibility and reformatting when an old card is studied again.
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Develop Image Occlusion System for Flaschards]]"
status: To-Do
priority:
progress_current:
progress_total:
date_created: 2026-08-10T07:35:03.968Z
date_modified: 2026-08-10T11:35:11.036Z
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
parent:
children:
blocked_by:
cover:
color:
---
# Optimization

## What tool or process needs improvement?

*Which existing tool, script, or workflow are you referring to? Include the name if you know it.*

How a ```osmosis fence stores the scheduling data for the several cards it
generates, and how it stores occlusion shapes. Both are written flat, with
prefixes, while the frontmatter carrier writes the same information as nested
blocks. The two carriers should agree.

## What's slow or frustrating about it?

*What specifically takes too long or feels clunky?*

A cloze fence with three groups spends twenty-four lines on schedules — one key
per field per group, each carrying its own `c1-` prefix:

```
c1-due: 2026-08-10T11:53:55.956Z
c1-stability: 0.0349
c1-difficulty: 9.5929
c1-reps: 3
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-08-10T11:52:55.956Z
c1-learning-steps: 0
c2-due: 2026-08-10T11:53:59.562Z
…
```

The same three groups in frontmatter read as three blocks, and the grouping is
visible instead of inferred from a string prefix:

```yaml
    c1:
      due: 2026-08-14T09:00:00
      stability: 2.5
      difficulty: 6
      reps: 1
      lapses: 0
      state: review
      learningSteps: 0
    c2:
      …
```

The field names disagree too: the fence writes `last-review` and
`learning-steps`, frontmatter writes `lastReview` and `learningSteps`.

## What would "better" look like?

*Describe your ideal outcome. How should it work differently?*

One structure across both carriers. The fence adopts frontmatter's shape:
per-card schedules nested under their group key, camelCase field names, and
occlusion shapes as block mappings rather than flow mappings.

Old notes must keep loading. A card migrates when it is next written, not by a
sweep — so both forms will coexist in one file, and often in one fence.

---

# Prompt

## Where things stand

Cut a new `feature/…` branch from `release/0.0.4`. Do **not** build this on
`feature/image-occlusion` — that branch is mid-flight on
[[Develop Image Occlusion System for Flaschards]] (phases 3–6 outstanding) and
this work is independent of it. If image occlusion has merged by the time you
start, branch from the release branch as normal.

`npm run lint`, `npm test` (1306 passing), and `npm run build` are clean at
`8719ab5`.

## The two carriers today

**Fence header** — hand-parsed text, not YAML. Read by
`src/card-gen/explicit.ts`, written by `src/store/FenceWriter.ts`.

````
```osmosis
id: bridge-parts
deck: Engineering/Bridges
due: 2026-08-12T09:00:00        ← the fence's own card, unprefixed
stability: 4.21
c1-due: 2026-08-14T09:00:00     ← one derived card per prefix
c1-stability: 2.5
c1-last-review: 2026-08-13T09:00:00
r-due: 2026-08-15T09:00:00      ← bidi reverse card
occlude-a:                      ← already a nested block
  mode: hide-all-guess-one
  shapes:
    - { group: c1, kind: rect, x: 0.1188, y: 0.5225, w: 0.1375, h: 0.08 }
```
````

**Frontmatter** — real YAML, read and written through
`FileManager.processFrontMatter`, in `src/store/ScheduleStore.ts`. A plain line
card's schedule sits directly under its block ID; an occluded one nests a
`c1:`/`c2:`/`c3:` block per group alongside the `occlude:` shape set they share.

## The target

````
```osmosis
id: bridge-parts
deck: Engineering/Bridges
due: 2026-08-12T09:00:00
stability: 4.21
c1:
  due: 2026-08-14T09:00:00
  stability: 2.5
  lastReview: 2026-08-13T09:00:00
r:
  due: 2026-08-15T09:00:00
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.1188
      y: 0.5225
      w: 0.1375
      h: 0.08
```
````

The fence's *own* card keeps its fields flat at the top level, mirroring how a
plain line card sits directly under its block ID. Only derived cards nest.

## Decisions to make before writing code

1. **`r` nests too.** The prefix mechanism is one mechanism: `r-due` for a bidi
   reverse card comes out of the same `derivedSchedules` map as `c1-due`. The
   request names cloze, code cloze, and occlusion, but leaving `r` flat would
   preserve exactly the inconsistency this task exists to remove.
2. **camelCase wins** — `lastReview`, `learningSteps` — because frontmatter is
   the format being standardised on, and it is the one a user actually reads in
   Obsidian's property editor.
3. **Migrate on write, never sweep.** A fence is rewritten only for the card
   being reviewed, so a three-group fence will sit with `c1:` nested and
   `c2-due:`/`c3-due:` still flat until those two come up. Both forms have to
   read correctly in that mixed state, and the reader has to merge them rather
   than letting one win by position.

## The trap that will cost you a day if you miss it

When `FenceWriter` writes `c1:` as a nested block, **every metadata scan in that
file must know the block does not end at its key line.** There are five of them
(`FenceWriter.ts` ~132, ~255, ~292, ~441, ~509), each guarded by
`isRecognizedMetadataLine()` plus a special case, `isOccludeBlockLine()`.

Phase 1 of the occlusion task hit exactly this: the scans stopped at the
valueless `occlude-a:` key and inserted the metadata/content separator blank
line *inside* the shape block, severing the shapes from their header on the
first review. It is invisible in the text — the file still looks fine.
Generalise `isOccludeBlockLine` into "this key opens an indented block" and let
it cover `cN:`, `r:`, and `occlude*:` alike.

**Assert on what the fence reparses to, not on strings.** A string assertion
passes straight through this bug.

## Reading both forms

The header loop in `src/card-gen/explicit.ts` (~line 642) matches
`/^(r|c\d+)-(.+)$/` against `SCHEDULE_FIELDS` to build `metadata.derivedSchedules`.
Add the nested form beside it. `parseOccludeBlock()` in
`src/card-gen/occlusion.ts` is the working precedent for consuming an indented
block out of this same header, and `splitFenceHeader()` already has to skip past
those blocks to find where content starts.

For shapes, `parseOccludeBody()` reads `- { … }` through `parseFlowValue()`. It
must also accept a block mapping — `- group: c1` plus indented continuation
lines — because every note written before this change uses flow mappings, and
because `occlusionSetToYamlValue()` is what the frontmatter carrier already
stores.

**Do not read the flow-mapping decision in
[[Develop Image Occlusion System for Flaschards]] as forbidding this.** That
decision rejected `- group: c1   kind: rect   x: .31` — a single line of bare
`key: value` runs, which is *not valid YAML*, since a plain scalar cannot
contain `": "`. A proper multi-line block mapping is valid YAML and satisfies
the constraint that decision was protecting: both carriers must be readable by
Obsidian's own YAML parser. Writing block mappings is a change of style, not a
reversal.

## Migration on write

`buildScheduleKVs()` (`FenceWriter.ts` ~208) builds the flat key/value map and
`writeSchedule()` splices it in. Emitting a nested block instead is the easy
half. The half that will bite:

- When `c1` is written nested, the **old flat `c1-*` keys must be removed in the
  same edit.** Leaving them means the reader sees the group twice, and whichever
  form loses the merge silently reverts the review that just happened.
- `removeSchedule()` — used when a review of a previously-new card is undone —
  has to remove a whole nested block, not just flat keys. `FenceWriter.ts` ~416
  already notes that removal was historically the half that got missed.

## Browser and dashboard

Neither parses the fence format itself, so this is verification rather than new
work — but do verify it, and say so in the write-up:

- `src/browse/mutate.ts` uses `parseCardIdParts()` only to group cards by fence
  and delegates every write to `FenceWriter`, so it inherits the new format.
- `src/browse/cards.ts` and the dashboard/stats views read the in-memory store,
  which `card-gen` populates. If the parser reads both forms, so do they.
- `src/views/ContextualStudyProcessor.ts` reads `exclude:` straight out of the
  fence text — check an indented block beneath a `cN:` key does not confuse it.

Watch `FILTERABLE_CARD_TYPES` in `src/browse/cards.ts`: `readBrowseOptions`
builds the *active* type set from it, so a card type missing there is filtered
out of the browser entirely rather than merely lacking a checkbox.

## Test plan

Unit is where this is won — every carrier is a pure string or object transform.

- `src/card-gen/fence-header.test.ts` — `splitFenceHeader` finds the content
  start past a nested `cN:` block, and past a mix of nested and flat.
- `src/card-gen/explicit.test.ts` — a fence with `c1:` nested and `c2-due:` flat
  yields both cards with the right schedules; camelCase and kebab field names
  both read.
- `src/store/FenceWriter.test.ts` — writing `c1` emits a nested block *and*
  drops the old flat `c1-*` keys; a second write updates in place; removal takes
  the whole block; the separator blank line never lands inside a block. Assert
  by reparsing the fence.
- `src/card-gen/occlusion.test.ts` — shapes round-trip through block mappings,
  and existing flow mappings still parse.
- `src/browse/mutate.test.ts` — existing coverage should pass untouched. If it
  does not, format knowledge has leaked outside `FenceWriter`.

Note: `src/parser.test.ts` carries wall-clock benchmarks that fail under load.
Re-run before investigating a failure there.

## Manual fixture

`e2e/fixtures/` needs a note carrying **old-format** schedules, so migration has
something real to convert. Verbatim capture from a fence studied on 2026-08-10,
before this change:

```
c1-due: 2026-08-10T11:53:55.956Z
c1-stability: 0.0349
c1-difficulty: 9.5929
c1-reps: 3
c1-lapses: 0
c1-state: learning
c1-last-review: 2026-08-10T11:52:55.956Z
c1-learning-steps: 0
```

`e2e/fixtures/occlusion.md` (copied to `vault/tests/flashcard/`) is a good base:
it already carries a three-group occlusion fence, an occluded line card, and a
pre-occlusion plain line card. Its SVGs live in `e2e/fixtures/`; the vault
copies go in `vault/media/`, which is gitignored.

Manual test to hand over: study one card of a three-group fence, then confirm in
the source that its group migrated to a nested block, the other two are
untouched in their flat form, all three still study correctly, and the browser
lists all three with their schedules intact.

## Conventions

`CLAUDE.md` governs. In short: lint → test → build, then hand over manual test
steps and **stop** for confirmation before committing. Commit code by explicit
path, never `git add .`. This note gets its own commit, separately, and only
after the user confirms.
