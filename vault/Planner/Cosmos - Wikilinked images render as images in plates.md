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
status: In-Review
batch: 15
priority:
progress:
date_created: 2026-11-24T00:20:16.000Z
date_modified: 2026-11-24T00:20:16.000Z
date_start_scheduled: 2026-11-24T00:27:00.000Z
date_start_actual: 2026-11-24T00:27:00.000Z
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

## Batch implementation notes (awaiting manual test)

Code commit: c93e89c (`fix(T112)`), on `batch/15-plates-study-polish`.

### Cause and approach
- **Cause:** `nearMarkdown` ran every plain line node through `unembed`, which turned every `![[x]]` into `[[x]]`. `![[img.png|314]]` became a link whose alias was "314". It was a deliberate rule (the attachment node was meant to show the media), but it read as broken.
- **Approach:** there is now one `unembed` (the old line-group `unembedNotes`): images, audio and video stay embeds, while note embeds and PDFs become links. Plain lines and line groups both use it. Obsidian's renderer draws `![[img|314]]` at `width=314`, and the existing panel CSS (`img { max-width: 100%; max-height: 15em; object-fit: contain }`) caps it to the plate. No CSS change was needed.
- **Model:** `buildGraph` skips an embed whose source is a **line** node and whose resolved target is panel media (`isPanelMedia`: image/audio/video). It makes no attachment node and no attachment edge for it. Plain links (`[[img.png]]`), embedded PDFs, unresolved media (still a ghost), and embeds placed on the note core are unchanged. Note embeds are untouched.
- **Sizing:** `contentBoxEm` budgets each image on a line with `mediaBoxEm`. A `|W` sets the width (W/16 em, capped at `PANEL_MAX_EM.width`). `|WxH` also sets the height (H/16 em, capped at `PANEL_MEDIA_MAX_EM`). An unsized image, or one with only `|W`, keeps the full 15em media height, which leans large because the aspect ratio is unknown. Audio is budgeted as its player. The line's width is the text width plus the widest image, then trimmed by the panel cap. As before, each image gets a row below the line's text. Following T111, there is still no overall cap.

### Decisions
- **A bare `![[img]]` line node also drops its attachment node.** That line's panel now draws the image itself, so an attachment planet would show the same image twice. That double display is the duplication the original "embeds become links" rule existed to avoid. One rule ("media embedded in a line draws in that line") is also simpler than special-casing a line that holds only an embed. The cost: the same image embedded in two notes no longer joins them through a shared attachment planet, and the Attachments overlay toggle no longer hides embedded images, because they are line content now. A plain `[[img]]` link still makes the planet, so that is the way to show it as a file.
- **The rule applies to line groups too.** A group's cover image was already drawn in its panel and also got an attachment node, which was the same duplication.
- **PDFs keep their attachment node.** Panels render a PDF embed as a link, so the attachment node is still the only place the PDF shows.
- **The source must be a line node, not just "not the core".** When a sole H1 is the note's root, it takes the core's ID, and it has a panel.
- **Occlusion lines** (`![[span.svg]] ^os-…`) also lose their attachment node. Outside study their panel now draws the diagram; during study it already did.
- The `unembed` behaviour change also updated `transcluded.test.ts`. At depth 0, an image embedded in a line no longer adds `file:diagram.svg`.

### Surface map
| File | Change |
|---|---|
| `src/cosmos/near.ts` | `isPanelMedia` exported. `unembed` keeps media embeds (merged with `unembedNotes`). `nearMarkdown` uses it for plain lines. `mediaBoxEm` adds a size-aware image budget in `contentBoxEm`. |
| `src/cosmos/model.ts` | Embed pass skips media embedded in a line node (`embedsPanelMedia`). |
| `src/cosmos/near.test.ts` | `unembed` and `nearMarkdown` expectations updated. Tests added for `|W`, `|WxH`, Markdown `![alt|WxH](…)`, the cap, text beside a small image, and audio. |
| `src/cosmos/model.test.ts` | The attachment test split into link (node), line embed (none, bare line included) and PDF embed (node). |
| `src/cosmos/transcluded.test.ts` | Depth-0 expectation: an embedded image adds no node. |
| `e2e/fixtures/graph3d/Inline Images.md` → `vault/tests/graph3d/Inline Images.md` | New fixture (no cards, so nothing to back-date). |

### Fixture
`vault/tests/graph3d/Inline Images.md`:
- a sized line `Object ![[flag-echo.svg|314]]`;
- a `|120x80` line;
- a bare unsized `![[flag-foxtrot.svg]]`;
- a plain `[[knot-diagram.svg]]` link;
- a note embed `![[Knots#Bends]]`.

### Test steps
1. Open `tests/graph3d/Inline Images.md` and open Cosmos at **Depth 1**. At depth 0 a plain link adds no attachment node by design.
2. Fly close to "Object". The panel shows "Object" with the blue/white flag below it, about 314 px wide (the panel's full width). Nothing is clipped.
3. "Hoist": a small flag, about 120×80, in a narrower panel.
4. The bare foxtrot line: the flag fills the panel width, at most 15em tall.
5. Confirm there is no `flag-*.svg` attachment planet and no attachment edge from those lines. "See the knot-diagram.svg" still has an attachment planet with an edge.
6. "Bends to practise": the embed edge to Knots' Bends heading is unchanged.

### Not verified
- Nothing was checked in Obsidian.
- The rendered size of the image versus the budget (`liveBoxWorld` should re-measure once the image loads, through the ResizeObserver).
- Whether `object-fit: contain` letterboxes a `|W` image taller than 15em. This is unchanged pre-existing CSS.
