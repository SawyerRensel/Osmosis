---
title: Cosmos - Wikilinked images render as images in plates
summary: "T112. In Cosmos, a line like 'Object ![[img.png|314]]' renders as a link labelled 314. Render the image inside the plate at the given width, and drop the separate attachment node for media embedded in a text line."
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Cosmos - Long code blocks overflow their plate]]"
status: Done
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-26T18:46:00.000Z
date_start_scheduled: 2026-11-24T00:27:00.000Z
date_start_actual: 2026-11-24T00:27:00.000Z
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

# Cosmos - Wikilinked images render as images in plates (T112)

## What Sawyer asked
> `![[Pasted image 20261123085856.png|314]]` wikilinked images are displaying as text (in this example as `314` instead of rendering as images with a certain size). Wikilink embedded images don't render as images.

Screenshot `ref/screenshots/Pasted image 20261123090239.png`: the plate reads "Object <u>314</u>".

## Settled with Sawyer
- **Render the image inside the plate, and drop the attachment node.** Media embedded in a text line is drawn inline in that line's plate at the `|size` width, capped to the plate. Such media no longer gets its own separate attachment node, or the edge to one.
- Links to media (`[[img.png]]`, not embedded) and anything else that creates attachment nodes today keep doing so. Decide whether a note that is only a bare `![[img]]` line node still needs an attachment node, and record the reasoning.

## Current state
- **Cause:** `src/cosmos/near.ts` `nearMarkdown` 83–99 runs a plain line node through `unembed` (50–52), which turns every `![[x]]` into `[[x]]`. So `![[img.png|314]]` becomes a link with the alias "314".
- Line groups (T75) use `unembedNotes` (55–58), which keeps media embeds. The comment and spec say embeds become links because attachment nodes already show the media. `near.test.ts` 12–25 asserts the old behaviour (`![[clip.mp4|300]]` → `[[clip.mp4|300]]`), so update those tests.
- Attachment nodes: `src/cosmos/model.ts` (387 lines). `attachmentNodeId` 126, link target creation 230–250, and attachment/embed edge kinds 280–290. Find where line-node embeds feed `linkTargets`.
- Plate sizing: `contentBoxEm` / `panelBoxEm` in `near.ts` must budget for the image height (use the `|W` or `|WxH` size; otherwise a sensible default), or the plate clips it. T111 (run just before this ticket) reworks plate sizing; read its implementation notes in `vault/Planner/Cosmos - Long code blocks overflow their plate.md` first.
- `isMediaEmbed` in `src/line-groups.ts` 40–51 already recognises media embeds and strips the `|size`.

## Acceptance criteria
- `Object ![[img.png|314]]` shows "Object" and the image 314 px wide (scaled with the plate), in the near-tier plate.
- `![[img.png]]` with no size shows the image at a capped default width.
- No attachment node and no attachment edge for media embedded in a line. Note embeds keep their current behaviour.
- The plate fits the image: nothing is clipped, and the layout reserves the space.
- Unit tests updated or added for `nearMarkdown` and the model change.

## Test plan
Fixture with a sized image line, an unsized image line, a `[[img.png]]` plain link, and a note embed. In Cosmos: images draw inline at the right size; no attachment planet for the embedded images; the plain link still makes one; the note embed is unchanged.

## Context budget (~45k tokens)
- `src/cosmos/near.ts` whole; `src/cosmos/near.test.ts` 1–60; `src/cosmos/model.ts` 80–130, 220–300; `src/line-groups.ts` 30–60; `src/views/CosmosNear.ts` 840–900.

## Conventions
- Batch 15 ticket: commit `feat(T112): …`/`fix(T112): …` plus one `docs(T112)` note commit setting `status: In-Review` with a "Batch implementation notes (awaiting manual test)" section (approach, decisions, surface map, fixture, test steps, what was not verified). Stage by explicit path; `git diff --cached --stat` before each commit; never `git stash`; don't push.
- Lint → test → build, one at a time (7 GB RAM). Pure logic goes outside `src/views/` (vitest cannot import obsidian) and gets unit tests.
- Fixtures: master copy in `e2e/fixtures/`, copied to `vault/tests/`; back-date every fixture card; neutral subject domains (no biology).

## What was implemented

Shipped in [PR #53](https://github.com/SawyerRensel/Osmosis/pull/53) → `release/0.0.6` (batch 15, commits `c93e89c` and the fix round `0c5fcdf`).

### The cause

**Round 0.** `nearMarkdown` ran every plain line node through `unembed`, which turned every `![[x]]` into `[[x]]`. `![[img.png|314]]` therefore became a link whose alias was "314". It was a deliberate rule (the attachment node was meant to show the media), but it read as broken.

**Fix round 1** (Sawyer: "Images aren't fitting inside plates"; the `|314` tree ran past the panel's right edge). The hypothesis written into the ticket (an inline-block `span.internal-embed` taking the picture's natural width) was **wrong**: in reading view that span is `display: inline`, so a wrapper cap would do nothing. The cause is the cascade. Our cap `.osmosis-cosmos-near-body img` has specificity (0,1,1), which only ties `.markdown-rendered img`. A stylesheet that loads after Osmosis (a theme, snippet or other plugin) and loosens image `max-width` at that weight wins. Obsidian's own `.internal-embed img:not([width])` (0,2,1) still re-caps embeds without a size, so only `|W` embeds escaped, which matches the screenshot.

### The fix

- **Render.** One `unembed` (the old line-group `unembedNotes`): images, audio and video stay embeds, while note embeds and PDFs become links. Plain lines and line groups both use it. Obsidian draws `![[img|314]]` at `width=314`, and the existing panel CSS caps it to the plate.
- **Model.** `buildGraph` skips an embed whose source is a **line** node and whose resolved target is panel media (`isPanelMedia`: image, audio, video): no attachment node, no attachment edge. Plain links (`[[img.png]]`), embedded PDFs, unresolved media (still a ghost), embeds on the note core, and note embeds are unchanged.
- **Sizing.** `contentBoxEm` budgets each image with `mediaBoxEm`: `|W` sets the width (W/16 em, capped at `PANEL_MAX_EM.width`), `|WxH` also the height (capped at `PANEL_MEDIA_MAX_EM`, 15em); an unsized image keeps the full 15em, leaning large. No overall cap, following T111.
- **Round 1 CSS.** The image and video caps are scoped under the panel (`.osmosis-cosmos-near-panel .osmosis-cosmos-near-body img/video`, specificity (0,2,1)), with `max-height: 15em` and `object-fit: contain` moved along so a theme cannot lift the height cap either. The occlusion override (0,3,0) still wins.

### Decisions worth remembering

- **A bare `![[img]]` line node also drops its attachment node.** Its panel draws the image itself, so an attachment planet would show it twice. Cost: the same image embedded in two notes no longer joins them through a shared attachment planet, and the Attachments overlay toggle no longer hides embedded images (they are line content now). A plain `[[img]]` link still makes the planet, so that is the way to show a file.
- **The rule applies to line groups and occlusion lines** (`![[span.svg]] ^os-…`) too: a group cover was already drawn in its panel, and an occlusion panel draws the diagram.
- **PDFs keep their attachment node**, because panels render a PDF embed as a link.
- **The source must be a line node, not just "not the core"**: a sole H1 that is the note's root takes the core's ID and has a panel.
- **No wrapper cap and no `!important` in round 1.** The wrapper was measured to be inert. A later rule weighing (0,2,1) or more, such as `.markdown-rendered img[width]`, would still beat the cap; the next step then is to name the rule in DevTools rather than escalate blindly.
- The layout estimate and the measured panel still agree: the overflow was clipped by `overflow: hidden` and never widened the measured box (320 × 502 px before and after), so `near.ts` needed no change in round 1.

### Surface map

| File | Change |
|---|---|
| `src/cosmos/near.ts` | `isPanelMedia` exported; `unembed` keeps media embeds; `nearMarkdown` uses it for plain lines; `mediaBoxEm` size-aware image budget in `contentBoxEm` |
| `src/cosmos/model.ts` | Embed pass skips media embedded in a line node (`embedsPanelMedia`) |
| `src/cosmos/near.test.ts` | `unembed` and `nearMarkdown` expectations updated; tests for `\|W`, `\|WxH`, Markdown `![alt\|WxH](…)`, the cap, text beside a small image, audio |
| `src/cosmos/model.test.ts` | Attachment test split into link (node), line embed (none, bare line included), PDF embed (node) |
| `src/cosmos/transcluded.test.ts` | Depth-0 expectation: an embedded image adds no node |
| `styles.css` | Round 1: near-panel `img` / `video` caps scoped under `.osmosis-cosmos-near-panel` |
| `e2e/fixtures/graph3d/Inline Images.md` | New fixture (copy in `vault/tests/graph3d/`) |

### Test fixture

`vault/tests/graph3d/Inline Images.md` (master `e2e/fixtures/graph3d/`): a sized line `Object ![[flag-echo.svg|314]]`, a `|120x80` line, a bare unsized `![[flag-foxtrot.svg]]`, a plain `[[knot-diagram.svg]]` link, and a note embed `![[Knots#Bends]]`. Open Cosmos at **Depth 1** (at depth 0 a plain link adds no attachment node). No cards.

### Follow-ups

- **The round 1 fix was not reproduced in the repo vault.** The bug only appears when a later stylesheet loosens image `max-width`; headless Chromium with Obsidian's `app.css` plus a synthetic override reproduced it, and the repo vault has no such override. The overriding rule in Sawyer's setup was inferred, never identified. Sawyer confirmed the fix works for him, but if images overflow again, check for a rule heavier than (0,2,1).
- Whether `object-fit: contain` letterboxes a `|W` image taller than 15em is unchanged, pre-existing CSS.
