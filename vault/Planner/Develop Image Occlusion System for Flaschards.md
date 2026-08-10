---
title: Develop Image Occlusion System for Flaschards
summary: Hide image content as flashcards
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: In-Progress
priority:
progress_current: 2
progress_total: 6
date_created: 2026-08-03T15:38:04.268Z
date_modified: 2026-08-10T13:05:00.000Z
date_start_scheduled: 2026-08-09T17:34:17
date_start_actual: 2026-08-09T17:34:17
date_end_scheduled:
date_end_actual:
all_day: true
repeat_frequency:
repeat_interval:
repeat_until:
repeat_count:
repeat_byday:
repeat_bymonth:
repeat_bymonthday:
repeat_bysetpos:
repeat_completed_dates:
parent: "[[Osmosis Dashboard]]"
children:
blocked_by:
cover:
color:
---

# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

A system for creating image occlusion flashcards and studying them in sequential, contextual, or spatial study modes.  

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

A way to study information that is encoded as pixels. 

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*

There is no current workaround. 

## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

Anki's built-in [Image Occlusion Editor](https://docs.ankiweb.net/editing.html#image-occlusion)

![](Pasted%20image%2020260806161855.png)

---

# PRD

**Scope: full Anki parity in one pass.** This is by a wide margin the largest of
the milestone's children — realistically more work than the other three
combined. The phases below are for sequencing and review, not for shipping
partially.

## Storage: reuse the card carriers, do not invent a new one

Masks *are* card data, so they live wherever that card's data already lives. No
`osmosis-occlusion` fence type, no SVG sidecar, no parallel storage system.

### The cloze parallel

Occlusion maps onto the existing cloze model almost exactly. In
`src/card-gen/explicit.ts`, cloze markers sit inline in content with optional
`cN:` group labels; occurrences sharing a label collapse into **one** card; IDs
derive as `<fenceId>-cN` with prefixed schedule keys in the fence header
(`src/store/FenceWriter.ts:198`).

**A shape group is a cloze group.** Several shapes sharing a label become one
card — which *is* Anki's shape-grouping feature, arriving for free. `-cN` ID
derivation and prefixed header schedules carry over untouched.

The one thing that cannot be inline is geometry: nobody hand-writes
coordinates, a visual editor emits them. So shapes live in the header, bound to
their embed by an inline label.

### Explicit fence

> **Updated 2026-08-10 by [[Improve cloze data storage]] (PR #20).** The example
> below is the *current* format. Phases 1–2 shipped flat `c1-due:` schedule keys
> and flow-mapping shapes; both changed. Everything written before still reads —
> migration happens on write — so nothing here needs converting by hand.

```osmosis
id: bridge
c1:
  due: 2026-08-12T09:00:00
  stability: 4.21
  state: review
c2:
  due: 2026-08-14T09:00:00
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.31
      y: 0.22
      w: 0.14
      h: 0.06
    - group: c2
      kind: ellipse
      x: 0.55
      y: 0.40
      rx: 0.08
      ry: 0.05
occlude-b:
  mode: hide-one-guess-one
  shapes:
    - group: c3
      kind: poly
      points: [[0.20, 0.18], [0.42, 0.18], [0.31, 0.34]]

![[bridge-cross-section.png]]{a}
![[span-elevation.png]]{b}
```

### ⚠️ A shape is a *block* mapping — never bare `key: value` runs on one line

This spec originally wrote a shape as
`- group: c1   kind: rect   x: .31 y: .22 …`. That is **not valid YAML** — a
plain scalar cannot contain `: `, so `group`'s value swallows `  kind` and then
chokes on the second colon.

The fence carrier could have survived it, since its header is hand-parsed text.
The line-card carrier could not: it lives in real frontmatter, so Obsidian's own
YAML parser reads it, and one malformed shape line would fail the parse of the
**whole note's** frontmatter — not just the occlusion entry.

Phases 1–2 satisfied that constraint with a one-line flow mapping
(`- { group: c1, kind: rect, … }`). The writer now emits a multi-line block
mapping instead, which is equally valid YAML, is what Obsidian's own dumper
produces, and matches the frontmatter carrier. **The reader accepts both
spellings and must keep doing so** — every note written during phases 1–2 uses
flow mappings. The rejected form is only the single-line bare-`key: value` one;
that has not become legal.

The `{a}` label binds an embed to its shape set. Filename binding breaks on
duplicate images; positional binding breaks silently when embeds are reordered.
An explicit label survives both. `c1` above has two shapes and is therefore
**one** card.

### ⚠️ The label must be stripped before rendering

Fence content is rendered through `MarkdownRenderer`, so a raw `{a}` would
appear as literal stray text beside the image in every study surface. It must be
stripped at render time, exactly as `stripInlineClozeMarkers()` in
`src/card-gen/explicit.ts` already strips `:::` markers.

This means **every** render path strips it — sequential, contextual, and
spatial. A path that forgets shows users a `{a}` next to their diagram. Pin it
with a test per surface, not just one.

The label stays in the source file; only the rendered output is cleaned.

### Line card

No `image:` field and no label — the block ID already identifies the line, and
the line holds exactly one embed:

```yaml
osmosis-schedule:
  os-ek322j:
    occlude:
      mode: hide-all-guess-one
      shapes:
        - group: c1
          kind: rect
          x: 0.31
          y: 0.22
          w: 0.14
          h: 0.06
    c1:
      due: 2026-08-12T09:00:00
      stability: 4.21
      state: review
```

Cards derive `<notePath>#^<blockId>-cN`, but schedules are keyed
`<blockId>/<group>` internally (`scheduleKey()` in `ScheduleStore.ts`). The
separator is `/` because a block ID cannot contain one — a `-cN` split rule
would have mangled a hand-written `^diagram-c1`.

⚠️ **Compatibility.** Existing entries carry schedule fields directly at the
block-ID level (`os-ek322j: {due, stability, …}`). An occlusion entry instead
nests per-group schedules under group keys. The parser distinguishes the two by
the presence of `occlude:`; existing notes must keep loading unchanged, and
`src/store/ScheduleStore.test.ts` should pin that.

### Coordinates

Normalised 0–1 against image dimensions, so masks survive resizing, retina
variants, and the `|300` sizing suffix. `rect` uses `x y w h`; `ellipse` uses
`x y rx ry`; `poly` uses a `points` list.

## Rename handling

Obsidian's metadata cache **deliberately does not index links inside code
fences** — that is why `[[example]]` in a code block renders literally. So an
embed inside an ```osmosis fence is invisible to rename, whether written as a
bare path or a proper wikilink.

Extend the existing `vault.on("rename")` handler at `src/main.ts:262` to scan
```osmosis fences for embeds resolving to the old path and rewrite them. Line
cards need nothing — their embed is ordinary Markdown outside any fence, so
Obsidian already handles it.

## Editor

Right-click an image → **Create image occlusion**. This is why
[[Flashcard creator wizard]] could be cancelled: the one card type Obsidian
cannot author reaches its editor contextually, with no hub button and no
general-purpose creation dialog.

Right-clicking an image that already has occlusions opens the editor on the
existing shape set instead.

Full Anki toolset: select, rectangle, ellipse, polygon, text annotation, undo,
redo, zoom in/out, zoom-to-fit, toggle translucency, delete, duplicate, group,
ungroup, align. Plus the two modes and Anki's three fields — Header (above the
image), Back Extra (below, answer side), and Comments (never shown).

## Study rendering

| Mode | Surface | Behaviour |
|---|---|---|
| Sequential | `SequentialStudyModal` | Front: image with masks per mode. Back: target group revealed, others per mode. Header above, Back Extra below. |
| Contextual | `ContextualStudyProcessor` | Same masking, in place in the note |
| Spatial | `MindMapView` | Occluded image inside the node |

**Hide All, Guess One** — every mask painted on the front, the target marked.
**Hide One, Guess One** — only the target mask painted; everything else visible.

## Phases

1. **Format + parser.** Fence and frontmatter shapes, group→card derivation,
   rename rewriting. Pure logic, fully unit-testable, no UI.
2. **Renderer.** Image + mask overlay as a reusable component; wire into
   sequential study.
3. **Editor.** Canvas modal, rect and ellipse, grouping, both modes.
4. **Full toolset.** Polygon, text annotations, translucency, duplicate, align,
   zoom, undo/redo.
5. **Remaining surfaces.** Contextual and spatial study.
6. **Touch.** Mobile drawing and handle manipulation — `isDesktopOnly` is
   `false`, so this cannot be skipped, and it is the least predictable phase.

## Progress

Branch `feature/image-occlusion`, cut from `release/0.0.4`, **pushed**. No PR to
the release branch — this note closes only when all six phases are done.

| Phase | State | Commits |
|---|---|---|
| 1. Format + parser | Done, manually verified | `267e91f`, `237cd3f` |
| 2. Renderer | Done, manually verified | `d651112`, `8719ab5` |
| — | [[Improve cloze data storage]] merged in ([PR #20](https://github.com/SawyerRensel/Osmosis/pull/20)) | `9dae548` |
| 3. Editor | Not started | |
| 4. Full toolset | Not started | |
| 5. Remaining surfaces | Not started | |
| 6. Touch | Not started | |

Because PR #20 landed *here* rather than on `release/0.0.4`, the fence schedule
format change reaches the release branch only when this branch merges.

### Phase 2 decisions worth remembering

- **The overlay measures nothing.** The wrapper shrinks to the image and an SVG
  with `viewBox="0 0 1 1"` and `preserveAspectRatio="none"` is pinned to its
  edges, so normalised coordinates land on the right pixels at any size with no
  `ResizeObserver` and no load handler. The image is `object-fit: fill`, not the
  study card's `contain`: paired with `preserveAspectRatio="none"`, picture and
  masks then stretch together if anything ever hands the image a box that is not
  its own aspect ratio. Changing either half alone silently misaligns the masks.
- **Mask selection is pure and lives outside `src/views/`**
  (`src/study/occlusion-masks.ts`), because vitest cannot import `obsidian` —
  same reason `splitFenceHeader` sits in `card-gen/explicit.ts`.
- **A `|300` sizing suffix is deliberately not honoured in study.** Masks stay
  aligned regardless, which is what the acceptance criterion asks; but the
  diagram renders at the card's own fit rather than 300px, as Anki does.
  Shrinking an occluded diagram to a thumbnail inside the study modal would make
  it harder to answer. `CardOcclusion` carries no width — add one only if
  phase 5's in-note rendering needs it.
- **Colours are the docs site's button palette**, as custom properties on
  `.osmosis-occlusion`: amber `#ffaa00` (`--md-accent-fg-color`) for the group
  being asked, deep purple `#7e56c2` (`--md-primary-fg-color`) for its siblings.
  Gold is the eye-catching one, so it marks the question.
- **`createSvg` hands `cls` to `classList.add()`**, which throws on a token
  containing a space. Mask role classes are therefore arrays. The first cut used
  a string, threw on the very first mask, and took the rest of the card render
  with it — the card showed an unmasked image that would not flip.
  `OcclusionRenderer.dom.test.ts` reproduces the strict behaviour rather than
  stubbing it away.

### Fixed in phase 2, but a phase 1 bug

`StudySessionManager` routed schedule writes on `cardType === "line"`. An
occluded line card fans out into one card *per shape group* carrying
`cardType: "occlusion"` while still living on its line, so its reviews took the
fence branch, where `writeSchedule` looked for a fence called `os-elev001-c2`,
found none, and dropped the schedule silently; exclude was a no-op for the same
reason. The block ID is the routing signal — every other router in the codebase
already had it that way.

### Known consequence — resolved by [[Improve cloze data storage]]

`FileManager.processFrontMatter` re-dumps the whole frontmatter block through
Obsidian's YAML serializer, which does not emit flow style. So the first time an
occluded *line* card was reviewed, its shapes expanded from one-line flow
mappings to block mappings, and the compact form survived only in the fence
carrier, which `FenceWriter` edits as text.

**Resolved in PR #20**, the other way round: the fence carrier now matches
frontmatter, so both carriers write block mappings and the divergence is gone.
Confirmed in practice — studying the line card in `occlusion.md` produced exactly
the block mappings the fence writer now emits.

## Surface map

| File | Change |
|---|---|
| `src/card-gen/occlusion.ts` | New — parse shape sets, derive one card per group |
| `src/card-gen/explicit.ts` | Recognise `occlude-*` keys and `{label}` embed markers; strip labels alongside cloze markers |
| `src/store/ScheduleStore.ts` | Nested per-group schedules under a block ID |
| `src/store/FenceWriter.ts` | Write per-group schedules to `occlude-*` fences |
| `src/views/OcclusionEditorModal.ts` | New — the canvas editor |
| `src/views/OcclusionRenderer.ts` | New — image + mask overlay, shared by all three modes |
| `src/views/SequentialStudyModal.ts` | Render occlusion cards |
| `src/views/ContextualStudyProcessor.ts` | Render occlusion cards in place |
| `src/views/MindMapView.ts` | Render occlusion cards in nodes |
| `src/main.ts` | Image context-menu item; rename rewriting |
| `src/database/types.ts` | `occlusion` card type; shape types |

## Acceptance criteria

- [ ] Right-clicking an image offers "Create image occlusion"
- [ ] Rect, ellipse, and polygon can be drawn, moved, resized, and deleted
- [ ] Shapes sharing a group produce exactly one card
- [ ] Both modes render correctly on front and back
- [ ] One fence with two labelled embeds keeps its shape sets distinct
- [ ] Reordering embeds within a fence does not move masks between images
- [ ] The `{a}` label never appears as text in sequential, contextual, or spatial study
- [ ] The label is preserved in the source file after any render or write cycle
- [ ] Occlusion cards study correctly in all three modes
- [ ] Header, Back Extra, and Comments behave as in Anki
- [ ] Renaming an occluded image rewrites the fence; line cards are handled by Obsidian
- [ ] Masks stay aligned when the image is resized or given a `|300` suffix
- [ ] Reopening the editor restores the existing shape set exactly
- [ ] Pre-existing `osmosis-schedule` entries still load unchanged
- [ ] Shapes can be drawn and manipulated by touch on mobile
- [ ] `npm run lint` and `npm test` clean

## Test plan

Unit is where correctness is won, since geometry and derivation are pure:
`src/card-gen/occlusion.test.ts` — shape round-trip through fence and
frontmatter, group→card derivation, ID derivation matching cloze's `-cN`,
coordinate normalisation, label binding with multiple embeds, rename rewriting,
and backwards compatibility of existing schedule entries.

Manual fixture — `e2e/fixtures/flashcard/occlusion.md`, copied to `vault/`:
one fence with two labelled embeds and mixed shape kinds, one occluded line
card, and one pre-existing non-occlusion line card in the same note to prove the
compatibility path.

## Follow-ups

- [[Spaced Repetition for Excalidraw]] and
  [[Spaced Repetition for Obsidian Canvas]] share the mask-overlay renderer
- Occlusion cards in the [[Create Card Browser - Editor]] type filter
---

# Prompt — Phase 3: Editor

Written 2026-08-10 at `9dae548`, as a standalone brief for a fresh session.

## Where things stand

Branch `feature/image-occlusion`, pushed, at `9dae548`. Work on this branch
directly — phases share a branch and the note closes only when all six land.
`npm run lint`, `npm test` (**1329 passing**), and `npm run build` are clean.

Phases 1 and 2 are done and manually verified: the format, parser, group→card
derivation, rename rewriting, and the mask renderer wired into sequential study.

**Read the "Phase 2 decisions worth remembering" section above before touching
the renderer.** Two of those decisions constrain phase 3 directly.

**The storage format changed after phase 2 shipped** — [[Improve cloze data
storage]] merged into this branch as PR #20. The PRD above has been updated, but
if you find flow-mapping shapes or `c1-due:` keys anywhere, they are pre-PR-#20
notes, and they are supposed to still read. Do not "fix" them.

## What phase 3 must deliver

From the PRD phase list: **canvas modal, rect and ellipse, grouping, both
modes.** Polygon, text annotation, translucency, duplicate, align, zoom, and
undo/redo are **phase 4** — do not pull them forward. The three Anki fields
(Header, Back Extra, Comments) are not phase 3 either; the block parser ignores
unknown keys precisely so they can arrive later with no migration.

Acceptance criteria this phase should satisfy:

- Right-clicking an image offers "Create image occlusion"
- Rect and ellipse can be drawn, moved, resized, and deleted
- Shapes sharing a group produce exactly one card
- Reopening the editor restores the existing shape set exactly
- One fence with two labelled embeds keeps its shape sets distinct

## The gap that is the actual work

**Neither carrier has a writer for shape sets.** `serializeOccludeBlock()` and
`occlusionSetToYamlValue()` exist, are tested, and are called by **nothing** —
phase 3 is their first caller. Do not delete them as dead code; build onto them.

You need, roughly:

- **Fence carrier.** Something like `writeOcclusion(content, cardId, label, set)`
  in `src/store/FenceWriter.ts`, splicing `serializeOccludeBlock()` lines into
  the header — replacing an existing `occlude-<label>:` block whole, or inserting
  one. `writeNestedSchedule()` in that file is the worked precedent: it locates a
  block via `indentedBlockKey()`, takes its extent via `blockEnd()`, and splices
  the replacement in at the same position.
- **Line-card carrier.** A setter on `ScheduleStore` for the `occlude` key
  alongside the existing `setSchedule`/`setDisabled`, writing
  `occlusionSetToYamlValue()` through `processFrontMatter`. `ScheduleStore`
  currently only *reads* shapes (`parseOcclusionFrontmatter`).
- **A fence to write into at all.** Right-clicking an image in a note that has
  no ```osmosis fence means the editor must be able to *create* one wrapping
  that embed, assign it an `id:`, and add the `{label}` marker. Decide and record
  whether a right-click on a bare image creates a fence card or an occluded line
  card — the PRD supports both carriers but does not say which the context menu
  should reach for. **This is the one genuinely open question in phase 3.**

## Traps

- **The coordinate contract is load-bearing and split across two files.** The
  wrapper shrinks to the image; an SVG with `viewBox="0 0 1 1"` and
  `preserveAspectRatio="none"` is pinned to its edges; the image is
  `object-fit: fill`. That trio is why normalised coordinates need no
  `ResizeObserver` and no load handler. The editor canvas must use the same
  contract, or shapes drawn in the editor will not land where the study renderer
  paints them. Changing either half alone silently misaligns masks.
- **The editor must emit normalised 0–1 coordinates**, not pixels. Convert on
  pointer input, against the image's rendered box.
- **`createSvg` hands `cls` to `classList.add()`**, which throws on a token
  containing a space. Class arrays, not strings. This already took out a whole
  card render once.
- **`vitest` cannot import `obsidian`.** Anything you want unit-tested — hit
  testing, resize-handle maths, shape mutation, normalisation — must live outside
  `src/views/`. `src/study/occlusion-masks.ts` and `splitFenceHeader` in
  `card-gen/explicit.ts` exist for exactly this reason. Put the editor's geometry
  in something like `src/study/occlusion-geometry.ts` and keep
  `OcclusionEditorModal.ts` a thin shell over it.
- **The `{a}` label must never render.** `stripEmbedLabels()` handles it; if the
  editor adds a label to an embed, every render path must already be stripping
  it. Pin with a test per surface.
- **`FenceWriter`'s metadata scans stop at any line they do not recognise.**
  `opensIndentedBlock()` already covers `occlude*:`, `cN:` and `r:`. If the
  editor introduces a new valueless header key, it must be added there too, or
  the separator blank line lands inside the block and severs it. This is
  invisible in the text and has bitten this codebase twice.

## Existing surface to build on

| What | Where |
|---|---|
| Parse / serialize shape sets | `src/card-gen/occlusion.ts` |
| Which masks to paint, per mode and side | `src/study/occlusion-masks.ts` |
| Image + mask overlay for study | `src/views/OcclusionRenderer.ts` |
| Shape / set / card types | `src/database/types.ts` |
| Modal patterns | `src/views/ConfirmModal.ts`, `GenerateFlashcardsModal.ts`, `PromptModal.ts` |
| Context-menu registration | `src/main.ts` — `file-menu` ~276, `editor-menu` ~917 |
| Mask colours as custom properties | `styles.css` — `.osmosis-occlusion` ~1315 |

## Test plan

Unit, in a file that does not import `obsidian`: normalisation round-trip
(pointer px → 0–1 → px), hit testing for rect and ellipse, resize-handle maths,
group assignment, and set mutation (add / move / resize / delete). Plus
`FenceWriter` round-trip — write a set, reparse the fence, assert on the parsed
`OcclusionSet` rather than on strings, and confirm a second write replaces the
block instead of appending a second one.

`src/parser.test.ts` carries wall-clock benchmarks that fail under load; re-run
before investigating a failure there.

## Manual fixture

`e2e/fixtures/occlusion.md` (copied to `vault/tests/flashcard/`) already carries
a two-embed fence, an occluded line card, and a pre-occlusion plain line card.
`e2e/fixtures/cloze-schedule-migration.md` carries pre-PR-#20 formats. The vault
copy of `occlusion.md` is currently dirty from manual testing — reset it from
`e2e/fixtures/` before you start, and **back-date every card in any new fixture**:
deck Total is `new + learn + due`, so a future-dated `review` card cannot be
studied and looks exactly like a card that failed to generate.

## Conventions

`CLAUDE.md` governs. In short: lint → test → build, then hand over manual test
steps and **stop** for confirmation before committing. Commit code by explicit
path, never `git add .`. This note gets its own commit, separately. Do not mark
the note `Done` — phases 4–6 are still outstanding; update the Progress table and
add a "Phase 3 decisions worth remembering" section instead.
