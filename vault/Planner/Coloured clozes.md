---
title: Coloured clozes
summary: A highlight cloze takes a colour from the emoji straight after the opening ==, so ==🔴text== blanks and reveals in red. The emoji is not part of the answer.
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[Improve cloze data storage]]"
status: In-Review
priority:
progress:
date_created: "2026-11-09T22:49:08.000Z"
date_modified: "2026-11-09T22:49:08.000Z"
date_start_scheduled: "2026-11-09T22:49:08.000Z"
date_start_actual: "2026-11-09T22:49:08.000Z"
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

# Feature Request

## What do you need built?

Six emoji give a highlight cloze its colour: 🔴 red, 🟠 orange, 🟡 yellow, 🟢 green, 🔵 blue, 🟣 purple. This is Obsidian's own highlight-colour syntax (https://obsidian.md/help/syntax#Highlight%20colors: "add a color emoji immediately after the opening `==`"). `==🔴text==` stays a cloze exactly as `==text==` is today, but the blank and the revealed answer are drawn in that colour. The answer is `text`, without the emoji. An uncoloured cloze looks exactly as before.

## What problem does this solve?

Colour lets a learner tell blanks apart at a glance (and matches how they already colour highlights in the note).

## What's your current workaround?

None. Before this, `==🔴text==` was a cloze whose answer included the emoji.

## Reference Attachments/Screenshots

Fixture: `vault/tests/flashcard/coloured-clozes.md` (master `e2e/fixtures/coloured-clozes.md`).

## Batch implementation notes (awaiting manual test)

### Approach

The colour has to survive from card generation to every place card Markdown is rendered, and those places are many (reading-view fence processor, study modal, 2D map nodes, 3D panels, card browser). So the generators carry it in the card text itself, as a class:

- A coloured blank is `<span class="osmosis-cloze-blank osmosis-cloze-red">░░░░░░░░</span>`.
- A coloured answer is `<mark class="osmosis-cloze-mark osmosis-cloze-red">text</mark>`.
- An uncoloured cloze produces the same text it always has (`░░░░░░░░` and `==text==`), asserted in unit tests.

`styles.css` maps each class to Obsidian's palette: `rgba(var(--color-red-rgb), 0.3)` for the tint (blank and answer) and `var(--color-red)` for the blank's glyphs. No hard-coded hex, so a theme recolours them.

All parsing is in the pure module `src/card-gen/cloze-colour.ts` (`parseHighlightBody`, `colourBlank`, `colourAnswer`). The emoji counts only straight after `==`, or straight after a `cN:` label (`==🔴c1:x==` and `==c1:🔴x==` both colour, Sawyer's spelling being the first). An emoji mid-text, a non-colour emoji, or an emoji with nothing after it stays part of the text. Only `==` clozes colour; `**` and `:::` have no colour spelling.

### Cause of the shape of the change

The cloze token regexes took `==(c\d+:)?([^=]+)==`, so `==🔴c1:x==` would have put `c1:` into the answer and lost the group. The emoji is now matched by a non-capturing `(?:🔴|🟠|…)?` ahead of the label, so group numbers and card identity are unchanged. Card IDs come from the fence `id:` plus the group number, so no existing card changes identity or dedup.

### Where clozes are parsed or drawn, and whether it applies

| Place | Applies? |
|---|---|
| `src/card-gen/explicit.ts` prose clozes (card generation, `renderClozeCard`) | Yes. Feeds the study modal, the card browser and 3D study. |
| `ContextualStudyProcessor.parseFenceContent` (reading view, the fence's own front/back) | Yes. |
| `MindMapView.parseOsmosisCloze` (2D map node, all clozes blanked) | Yes. The 2D map's per-step study text comes from the generator, so it is covered too. Its regex already matched the emoji inside `[^=]+`, so only the front and back builders changed. |
| `:::` inline code clozes, `# osmosis-cloze` code clozes, `**bold**` clozes | No: no highlight, no colour spelling. |
| Image occlusion, line cards, `src/mindmap-edit.ts` (`grep -a`) | No `==` cloze handling there. |
| 3D near-tier panels | Yes, for free. A cloze fence's panel is the raw fence rendered with `MarkdownRenderer`, so the `ContextualStudyProcessor` draws it. Under 3D study the panel text is the generator's `card.front`/`card.back`, which carry the classes. |
| 3D plates | Not applicable. A plate is one single-colour glyph-atlas line (`spriteLabel`), with no per-span styling, so no blank or answer is drawn on a plate at all. `spriteLabel` strips `==` but not the emoji, so a plate whose first line is a coloured cloze shows the emoji glyph (a coloured dot). Left as is: it hints the colour and changing plate text was out of scope. |

### Decisions worth remembering

- **Colour travels as HTML classes in the card Markdown**, not as a side field or a DOM post-process. A side field would have needed every render site (five) to learn about it; a global post-processor would have competed with Obsidian's own handling of `==🔴x==`, whose DOM I could not inspect. Cost: stored `card.front`/`back` of coloured cards contain the tags, so the browser's text search for "red"/"span" matches them. Not worth a fix now; uncoloured cards are untouched.
- **Class only, no `data-` attribute**, because `class` is the attribute Obsidian's sanitizer is known to keep.
- The tint is on the blank too (not only coloured glyphs), so a coloured blank looks like the highlight it will become.

### Surface map

| File | Change |
|---|---|
| `src/card-gen/cloze-colour.ts` | New. Colour table, parsing, blank/answer markup. |
| `src/card-gen/explicit.ts` | Token regex accepts the emoji; front/back builders use the helpers; occurrence text excludes the emoji. |
| `src/views/ContextualStudyProcessor.ts` | Same, for the fence's own front/back. |
| `src/views/MindMapView.ts` | `parseOsmosisCloze` front/back use the helpers. |
| `styles.css` | `.osmosis-cloze-blank`/`-mark` with six colour classes, at the end of the file. |
| `src/card-gen/cloze-colour.test.ts` | New. Parsing (six emoji, plain, mid-text, non-colour, lone emoji, label order) and generated cards (ids unchanged, plain text unchanged, coloured markup). |
| `src/views/ContextualStudyProcessor.dom.test.ts` | Two cases for the fence's front/back. |
| `e2e/fixtures/coloured-clozes.md`, `vault/tests/flashcard/coloured-clozes.md` | Fixture. |

### Test fixture

`vault/tests/flashcard/coloured-clozes.md`, deck `tests/coloured-clozes`. One cloze per colour, a plain one, a mixed fence (red, plain, blue), and edge cases (mid-text emoji, a star emoji, a `c1` group with red and green). No schedules, so every card is new and studyable (nothing to back-date). Reload Obsidian (Ctrl+R) before testing, per the reset hazard.

### What I could not verify

I cannot see Obsidian. Two things rest on knowledge rather than a check: that Obsidian's Markdown sanitizer keeps `class` on a `<span>` and `<mark>` (widely used by snippets), and that `--color-*-rgb` exist in the theme in use (they do in the default theme). If the colours do not show in a render, look at the DOM for the class first. Also unchecked: how Obsidian's native renderer draws `==🔴x==` in Live Preview, which is outside this feature.

### Manual test

1. Reload Obsidian, open `tests/flashcard/coloured-clozes.md` in Reading view. Each coloured fence shows its blank in that colour (tinted background, coloured glyphs); the plain fence looks as it did.
2. Study deck `tests/coloured-clozes`. Reveal: the answer is a `<mark>` in the same colour, with no emoji. The mixed fence's three cards blank one at a time with the others shown in their own colours.
3. Open the note as a mind map: the cloze nodes show the same colours. Step through a study on it.
4. Open the 3D graph on the note and zoom in on a cloze node: the near panel shows the coloured blanks. Plates stay plain text.
5. Edge cases: `==red 🔴 buoy==` and `==⭐ star mark==` are plain clozes with the emoji in the answer; the `c1` group is one card with a red and a green blank.
6. Switch theme (light and dark): colours follow the theme.

### Results

`npm run lint` clean; `npx vitest run --maxWorkers=2` 98 files, 2714 tests pass; `npm run build` succeeds.
