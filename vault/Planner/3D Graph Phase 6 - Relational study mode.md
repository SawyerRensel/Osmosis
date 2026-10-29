---
title: 3D Graph Phase 6 - Relational study mode
summary: "The relational study mode: due line, fence and occlusion cards hidden in place in 3D, rated per hop on shared FSRS, with free, due-driven and authored-trail paths."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: To-Do
priority:
progress:
date_created: "2026-10-29T01:03:06.000Z"
date_modified: "2026-10-29T01:03:06.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
  - "[[3D Graph Phase 4 - Near tier]]"
cover:
color:
pull_request:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

One phase of [[Develop Mind-Map Graph View]]. **Read that note's `# Spec` section first:** it holds the decisions, the world model, the conventions and the full test plan. This note only scopes this phase.

- **The new `StudyMode` value `"relational"`:**
  - Add it in `src/database/types.ts`, `parseStudyMode` (`src/store/ReviewLog.ts`), `src/stats/aggregate.ts`, `src/stats/detail.ts`, and every stats surface that lists the modes.
- **Hiding and rating:**
  - The hidden node *is* the card, with parity with 2D spatial study for line, fence and occlusion cards.
  - Reuse `src/study/spatial-study.ts`; its `${notePath}#^${blockId}` keys already span several notes.
  - Rate per hop through `plugin.createSessionManager("relational")`, on the shared FSRS schedules.
- **Study panel in the viewport, with three path modes:**
  - **Free exploration:** due cards in the loaded area are hidden; reveal and rate one when you arrive.
  - **Due-driven:** includes due cards within the configured depth of the start note (the horizon follows you). It flies you between them and draws the travelled path as a persistent thread.
  - **Authored trails:** a trail is a vault note whose stops are links, in order. Parse and serialize it in `src/graph3d/trail-note.ts`.

**Acceptance:**
- Reviews made in 3D update the same schedules as the other modes.
- Stats show `relational` separately.
- All three path modes work on the fixture.
- Unit tests cover due-driven ordering, trail note parsing and serialization, and stats aggregation.

**Every phase:**
- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
- Work on the `feature/3d-graph-view…` branch, cut from the current release branch.
