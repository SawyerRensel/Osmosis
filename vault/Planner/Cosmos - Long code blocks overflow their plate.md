---
title: Cosmos - Long code blocks overflow their plate
summary: "T111. A Cosmos near-tier plate showing a long code block is too short: its last line is cut off, and long lines don't wrap the way edit mode wraps them."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: To-Do
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
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

# Cosmos - Long code blocks overflow their plate (T111)

## What Sawyer asked
> Long blocks of text are still not being wrapped quite properly by a plate.

Screenshots: `ref/screenshots/Pasted image 20261123081411.png` shows the rendered plate. The `script.js` code block ends at `elem.style.fontFamily = newFont;`, so the closing `}` line is missing and the plate is too short. `…081422.png` shows the same node in edit mode. There, CodeMirror wraps `var elem = document.getElementById('logo');` onto two lines and the box holds every line.

## Current state (from the orchestrator's survey)
- `src/views/CosmosNear.ts` (952 lines):
  - A ResizeObserver at 227–237 measures each panel's border box.
  - `paint` 562–583 applies the width rules.
  - `createPanel` 609–645, `sizeLens` 703–710, `fill` 851–898 (`MarkdownRenderer.render` plus the min size), `panelPx` 368–372.
- `src/cosmos/near.ts` (310 lines):
  - `panelWidthRule` 236–260. For a code block the max-width is `codeFitColumns × 0.55em + PRE_PAD.x + 2·PAD_X`.
  - `contentBoxEm` 141–200 and `panelBoxEm` 287–310 estimate the size before render (height capped at 30em); constants at 102–136.
  - `src/code-fit.ts` (63 lines) caps at 100 columns.
- `styles.css`:
  - `.osmosis-cosmos-near-panel` 4646–4662 has `max-height: 30em; overflow: hidden`. Body margins are trimmed at 4664–4672.
  - The 2D map's "nothing scrolls" rules (`pre` with `overflow-wrap: anywhere`, ~217–240) are scoped to `.osmosis-node-content` and don't reach Cosmos panels.
- Edit mode: `src/views/CosmosEdit.ts` `setPlate` 166–175 and `fitWidth`/`measureWidth` 176–225; CSS `.osmosis-cosmos-edit-box` 4721–4736.
- **Suspected cause, not yet confirmed:** the Cosmos `pre` keeps Obsidian's `overflow-x: auto`. A line wider than the 0.55em-per-character estimate either scrolls sideways (a horizontal scrollbar covers the last line) or is clipped by `overflow: hidden` and the 30em cap. Confirm the cause before fixing: measure in the DOM test or reason from the CSS.

## Acceptance criteria
- A rendered code-block plate shows every line of the block, including the last, with nothing clipped and no scrollbar.
- Lines wider than the plate wrap, as the 2D map and edit mode do. The plate width stays close to the edit box width for the same node.
- Long prose and other blocks are also fully contained by their plate.
- Plate sizes the layout uses (`panelBoxEm`) stay consistent with what is drawn, because T115 makes boundaries wrap these sizes.

## Test plan
Fixture with a ~25-line JS block containing a line of ~60 characters and a line of ~120 characters, plus a long paragraph line node. Open it in Cosmos and zoom to near tier: every line, including the closing `}`, is inside the plate and long lines wrap. Enter edit mode and leave it: the plate size barely changes. Check on the phone.

## Context budget (~45k tokens)
- `src/cosmos/near.ts` whole (310); `src/views/CosmosNear.ts` 200–240, 360–380, 550–720, 840–900; `src/code-fit.ts` whole; `styles.css` 210–245, 4640–4740; `src/views/CosmosEdit.ts` 160–230.

## Conventions
- Batch 15 ticket: commit `feat(T111): …`/`fix(T111): …` plus one `docs(T111)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section (approach, decisions, surface map, fixture, test steps, what was not verified). Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes outside `src/views/` (vitest cannot import obsidian) and gets unit tests.
- Fixtures: master copy in `e2e/fixtures/`, copied to `vault/tests/`; back-date every fixture card; neutral subject domains (no biology).
