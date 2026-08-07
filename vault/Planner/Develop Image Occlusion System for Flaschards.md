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
progress_current:
progress_total:
date_created: 2026-08-03T15:38:04.268Z
date_modified: 2026-08-06T20:18:35.185Z
date_start_scheduled:
date_start_actual:
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



## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*



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

```osmosis
id: bridge
c1-due: 2026-08-12T09:00:00
c1-stability: 4.21
c1-state: review
c2-due: 2026-08-14T09:00:00
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - group: c1   kind: rect     x: .31 y: .22 w: .14 h: .06
    - group: c1   kind: rect     x: .62 y: .30 w: .10 h: .05
    - group: c2   kind: ellipse  x: .55 y: .40 rx: .08 ry: .05
occlude-b:
  mode: hide-one-guess-one
  shapes:
    - group: c3   kind: poly     points: [[.20,.18],[.42,.18],[.31,.34]]

![[bridge-cross-section.png]]{a}
![[span-elevation.png]]{b}
```

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
        - group: c1   kind: rect  x: .31 y: .22 w: .14 h: .06
    c1:
      due: 2026-08-12T09:00:00
      stability: 4.21
      state: review
```

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