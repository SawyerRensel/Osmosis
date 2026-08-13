---
title: Cloze markers leak into the revealed half outside a session
summary: Note view and the map each re-derive a cloze fence from its source, and their readers have drifted from the generator's — a labelled `# osmosis-cloze-c1` prints on the answer, and a `:::text:::` fence is not a card node on the map at all.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Study all Osmosis flashcards in all modes]]"
status: To-Do
priority:
progress_current:
progress_total:
date_created: 2026-08-13T12:03:12.000Z
date_modified: 2026-08-13T12:03:12.000Z
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
pull_request:
---

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         | Obsidian desktop (Linux) |
| Operating System | Linux |

## What happened?

Two source-parser gaps, found while walking the type × mode matrix in
[[Study all Osmosis flashcards in all modes]]. Both are the same shape: a view
re-derives a cloze fence from its **source** and its reader has drifted from the
generator's.

1. **A labelled marker prints on the answer.** A code cloze written
   `display: flex;  /* osmosis-cloze-c1 */` renders its revealed half with the
   marker still attached. A bare `/* osmosis-cloze */` on the same line is
   stripped correctly. `MindMapView.STRIP_CLOZE_COMMENT` and
   `ContextualStudyProcessor.MARKER_COMMENT` are character-for-character the same
   regex and both end at `osmosis-cloze\s*(?:\*\/|-->)?\s*$`, which a `-c1`
   suffix defeats. The generator's own `stripCodeClozeMarker` matches
   `(?:-(?:start|end))?(?:-c\d+)?` and gets it right.

2. **A `:::text:::` fence is not a card node on the map.** MindMapView's cloze
   parser matches `==term==` and `**term**` only; `PROSE_CLOZE_REGEX` in the
   generator also accepts `:::`. So a fence whose only deletions are `:::`
   renders as raw fence text on the map, while the store holds real cards for it.

Neither is a *rating* bug — both surfaces play store cards inside a session, and
the generator's strings are correct. So the leak in (1) disappears the moment a
session asks that card and comes back when the session ends, which is the same
"wrong outside a session, right inside one" signature as the `c1:` label leak
fixed in phase 4 of the parent task.

## What should have happened?

The revealed half of a cloze fence reads as the generator writes it —
markers stripped whether or not they carry a `cN` label — and every cloze form
the generator accepts makes a card node on the map.

## Where is this file located?

- `src/views/MindMapView.ts` — `STRIP_CLOZE_COMMENT`, `CLOZE_REGEX`,
  `parseOsmosisCodeCloze`, `parseOsmosisCloze`
- `src/views/ContextualStudyProcessor.ts` — `MARKER_COMMENT` inside
  `buildCodeClozeFrontBack`, `CLOZE_REGEX`
- `src/card-gen/explicit.ts` — `stripCodeClozeMarker`, `PROSE_CLOZE_REGEX`, the
  readers these two should be borrowing

Fixture: `vault/tests/flashcard/code-cloze-study.md`, third fence
(`ccs-flex01`) exercises (1). Nothing covers (2) yet.

## Steps to Reproduce

### 1. Start from

`vault/tests/flashcard/code-cloze-study.md`, in reading view with no session
running.

### 2. Prep/settings

None. The leak is in plain reading, so no Study or Peek is needed.

### 3. Do this

Scroll to "Two lines, one card — the labelled marker". The filled-in half below
the blanks shows `display: flex;  /* osmosis-cloze-c1 */`.

### 4. Trigger

Press **Study**, rate the card: the marker vanishes, because the session is now
showing the generator's string. Press **Stop**: the fence goes back to its own
text and the marker returns. The same two states appear on a mind map node.

## Notes

The fix that matches how phase 4 handled the header scan is to stop
re-implementing the generator's readers in the views: export the strip and the
cloze regex from `src/card-gen/explicit.ts` and have both parsers call them, the
way all three fence parsers were routed through `splitFenceHeader`. Two readers
that must agree forever is what caused the parent task's original bug.
