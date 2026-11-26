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
status: Done
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-26T18:46:00.000Z
date_start_scheduled: 2026-11-24T00:22:32.000Z
date_start_actual: 2026-11-24T00:22:32.000Z
date_end_scheduled: 2026-11-26T18:46:00.000Z
date_end_actual: 2026-11-26T18:46:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/53
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

## What was implemented

Shipped in [PR #53](https://github.com/SawyerRensel/Osmosis/pull/53) → `release/0.0.6` (batch 15, commit `79b20af`).

### The cause

Not the horizontal scrollbar the survey above suspected: the **30em height cap**. `.osmosis-cosmos-near-panel` had `max-height: 30em; overflow: hidden`, and `panelBoxEm` capped its estimate at the same 30em (`PANEL_MAX_EM.height`). Measured from the screenshot: the panel is drawn 558 px wide for a ~450 px layout (scale ≈ 1.24), and its rows are 26 px apart on screen, so 21 px laid out (Obsidian's 14 px code text at 1.5 line height). 30em is 480 px; less the panel's 4 px top padding and the `pre`'s 12 px, 464 px holds 22.1 rows. The screenshot shows exactly 22 lines, and the 23rd, the closing `}`, is cut off. The block needs about 32.2em. No line in that block was wider than the code-fit width (the longest is ~46 columns), so nothing scrolled sideways. The `var elem = …` line wraps in edit mode only because the editor draws code at the panel's 16 px, not Obsidian's smaller code size.

### The fix

- The panel has no height cap: no `max-height` in CSS, and `panelBoxEm` returns the uncapped estimate. A panel is as tall as its content, as a 2D map node is (T88). Its width is unchanged (`panelWidthRule`), so it still matches the edit box.
- The panel body gets the 2D map's "nothing scrolls" rule: `pre`, `.callout-content`, `.table-wrapper` and `mjx-container` get `overflow: visible; max-height: none`, and `pre` gets `overflow-wrap: anywhere`. A token wider than the panel (a URL, minified code) breaks as CodeMirror breaks it, instead of opening a scrollbar over the last line.

### Decisions worth remembering

- **No cap at all, rather than a bigger one.** Any cap clips some block, and the acceptance criteria want every line shown. If a 200-line block (~280em extent) pushes neighbours too far in a big vault, the fix belongs in spacing (for example, extent from width only), not in clipping.
- **`panelBoxEm` is uncapped too**, so layout spacing and T113's boundaries match what is drawn. Do not reintroduce a clamp: a capped estimate would put boundaries inside the drawn panel.
- `PANEL_MAX_EM` is now `{ width: 20 }`; the `height` constant was removed rather than left unused.
- Embed selectors (`.markdown-embed-content`, `.markdown-preview-view`) are left out of the Cosmos rule, because `nearMarkdown` turns note embeds into links.
- The panel keeps `overflow: hidden`. It clips nothing vertically now, but still clips at the rounded corners and catches anything wider than `max-width`.

### Surface map

| File | Change |
|---|---|
| `src/cosmos/near.ts` | `PANEL_MAX_EM` loses `height`; `panelBoxEm` no longer clamps the height; doc comments |
| `src/cosmos/near.test.ts` | Cap tests rewritten as exact sums; new tests: 100/120-line blocks grow, a 23-line block is at least its measured 32.2em, a 120-column line fits at 100 columns and takes two rows |
| `styles.css` | `.osmosis-cosmos-near-panel` loses `max-height: 30em`; new no-scroll and `overflow-wrap: anywhere` rules under `.osmosis-cosmos-near-body` |
| `e2e/fixtures/graph3d/Long Code Plates.md` | New fixture (copy in `vault/tests/graph3d/`) |

### Test fixture

`vault/tests/graph3d/Long Code Plates.md` (master `e2e/fixtures/graph3d/Long Code Plates.md`): a 25-line JS block with lines of ~60, ~80 and ~120 characters, a long prose paragraph, and a 140-character unbreakable token in a `text` block. No cards, so nothing to back-date.

### Follow-ups

- Not verified by the worker: that `overflow-wrap: anywhere` reaches the `code` inside `pre` (it should, the property inherits), the spacing around very tall panels in a large vault, and the GPU memory of a very tall panel layer (a 200-line block is roughly 4,000 px tall). Sawyer's manual test passed; none of these has a measurement behind it.
- Spacing for very tall blocks is untouched. See the decision above if it looks wrong.
