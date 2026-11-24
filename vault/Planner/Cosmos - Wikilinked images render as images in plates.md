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
