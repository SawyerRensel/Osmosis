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
status: In-Review
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
date_start_scheduled: 2026-11-24T00:22:32.000Z
date_start_actual: 2026-11-24T00:22:32.000Z
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

## Batch implementation notes (awaiting manual test)

Code commit: `79b20af` on `batch/15-plates-study-polish`.

### Cause
Not the horizontal scrollbar the survey suspected: the **30em height cap**. `.osmosis-cosmos-near-panel` had `max-height: 30em; overflow: hidden`, and `panelBoxEm` capped its estimate at the same 30em (`PANEL_MAX_EM.height`). Measured from the screenshot: the panel is drawn 558 px wide for a ~450 px layout (scale ≈ 1.24), and its rows are 26 px apart on screen, so 21 px laid out (Obsidian's 14 px code text on 1.5 rows). 30em is 480 px; less the panel's 4 px top padding and the `pre`'s 12 px, 464 px holds 22.1 rows. The screenshot shows exactly 22 lines, and the 23rd, the closing `}`, is cut off. The block needs (23 × 21 + 24 + 8) px ≈ 32.2em. No line in that block was wider than the code-fit width (its longest line is ~46 columns), so nothing scrolled sideways. The `var elem = …` line wraps in edit mode only because the editor draws code at the panel's 16 px, not Obsidian's smaller code size.

### Approach
- The panel has no height cap: no `max-height` in CSS, and `panelBoxEm` returns the uncapped estimate. A panel is as tall as its content, as a 2D map node is (T88). Its width is unchanged: still `panelWidthRule`, so it matches the edit box (`CosmosNear.setEditing` already passes the same rule as `maxWidth`).
- The panel body gets the 2D map's "nothing scrolls" rule. `pre`, `.callout-content`, `.table-wrapper` and `mjx-container` get `overflow: visible; max-height: none`, and `pre` gets `overflow-wrap: anywhere`. A token wider than the panel, such as a URL or minified code, now breaks as CodeMirror breaks it. Before, it opened a scrollbar over the block's last line.

### Decisions
- **No cap at all, rather than a bigger one.** Any cap clips some block. The acceptance criteria want every line shown. The 2D map already shows all content.
- **`panelBoxEm` is uncapped too**, so layout spacing (`extentFor`, `flatSize`) matches what is drawn. The trade-off is that a 200-line code block now gets a ~280em spacing extent and pushes its neighbours that far out. That is the honest size. If it looks wrong in a big vault, the fix belongs in spacing (for example, extent from width only), not in clipping.
- `PANEL_MAX_EM` is now `{ width: 20 }`. Its `height` was removed, not left behind as an unused constant.
- The embed selectors (`.markdown-embed-content`, `.markdown-preview-view`) were left out of the Cosmos rule, because `nearMarkdown` turns note embeds into links. Only media embeds render.
- The panel keeps `overflow: hidden`. It clips nothing vertically now. It still clips at the rounded corners, and catches anything wider than `max-width`.

### For T112 (inline images) and T113 (boundaries wrap `panelBoxEm`)
- `panelBoxEm(node)` → `{ width, height }` in panel ems is now exactly "estimated drawn size, leaning large". There is no clamp to undo. Image rows are budgeted in `contentBoxEm` at `PANEL_MEDIA_MAX_EM` (15em) per image, and that matches the CSS `max-height: 15em` on `img`/`video`. T112 should keep the two in step. It should also keep `contentBoxEm` free of any total cap, because a capped estimate would put T113's boundaries inside the drawn panel.
- Once a panel is measured, `CosmosNear.panelPx`/`liveBoxWorld` use its measured size. T113 can prefer those for loaded panels.

### Surface map
| File | Change |
|---|---|
| `src/cosmos/near.ts` | `PANEL_MAX_EM` loses `height`; `panelBoxEm` no longer clamps the height; doc comments |
| `src/cosmos/near.test.ts` | Cap tests rewritten as exact sums; new tests: a 100/120-line block grows, a 23-line block ≥ its measured 32.2em, a 120-column line fits at 100 columns and takes two rows |
| `styles.css` | `.osmosis-cosmos-near-panel` loses `max-height: 30em`; new no-scroll + `overflow-wrap: anywhere` rules under `.osmosis-cosmos-near-body` |
| `e2e/fixtures/graph3d/Long Code Plates.md` (+ `vault/tests/graph3d/` copy) | New fixture |

### Fixture
`vault/tests/graph3d/Long Code Plates.md` (master copy in `e2e/fixtures/graph3d/`) contains:
- a 25-line JS block with lines of ~60, ~80 and ~120 characters;
- a long prose paragraph;
- a 140-character unbreakable token in a `text` block.

It has no cards, so there was nothing to back-date.

### Manual test
1. Reload Obsidian (Ctrl+R). Open `tests/graph3d/Long Code Plates.md` in Cosmos and fly to near tier on the "Galley script" block.
   - Expect all 25 lines inside the plate, down to the closing `}`, with padding below it.
   - Expect the ~120-character `label.dataset.checklist = …` line to wrap onto a second row.
   - Expect no scrollbar.
2. Check the passage paragraph and the long token. The paragraph should wrap fully inside its plate. The token should break across lines instead of spilling out or scrolling.
3. Enter edit mode on the code block, then leave it. The box keeps the same width. The edit box may be taller, because it draws code at 16 px rather than Obsidian's 14 px.
4. Look at a note with a very long code block. Its neighbours should sit clear of the now-taller panel.
5. Repeat on the phone.

### Not verified
- Nothing was checked in Obsidian. I did not confirm that `overflow-wrap: anywhere` reaches the `code` inside `pre`; it should, since the property inherits.
- I did not measure how the spacing looks around very tall panels in a large vault.
- I did not measure the GPU memory of a very tall panel's layer. A 200-line block is roughly 4,000 px tall at raster scale 1.
