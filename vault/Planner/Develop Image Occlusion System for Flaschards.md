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
progress_current: 3
progress_total: 6
date_created: 2026-08-03T15:38:04.268Z
date_modified: 2026-08-11T07:30:00.000Z
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
| 3. Editor | Done, manually verified | `a533221` |
| 4. Full toolset | Shipped; manual testing found four defects, **not yet verified** | `88db8a7` |
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

### Phase 3 decisions worth remembering

Shipped in `a533221`, manually verified 2026-08-10.

- **Carrier follows the image, and is never restructured.** An embed already
  inside an ```osmosis fence keeps its shapes in that fence's header; an image
  anywhere else becomes a line card. Wrapping prose in a fence to make it a
  fence card would rewrite the user's note *and* cost the embed Obsidian's own
  rename handling, which only reaches links outside code fences.
- **Identity is minted lazily, at save, never on open.** A fence with no `id:`,
  an embed with no `{label}`, a line with no block ID all stay as they are until
  Save. Cancelling leaves the note byte-identical — pinned by a manual step and
  by `ensureFenceIdentity`'s tests. Inserting the `id:` line shifts the embed
  down by one and the label is written to the *shifted* line; that off-by-one is
  the function's whole difficulty and has its own test.
- **A single-embed fence stays unlabelled** and uses the bare `occlude:`
  spelling. A `{label}` is text in the user's own file and only earns its keep
  once there are two diagrams to tell apart.
- **Group numbers are allocated per carrier, not per diagram.** A fence derives
  every occlusion card ID as `<fenceId>-cN` across *all* its labelled embeds, so
  two diagrams each numbering from `c1` would derive the same IDs and the second
  would overwrite the first. `usedGroupsInFence()` feeds the modal's
  `reservedGroups`. `nextGroup()` counts *above* the highest in use rather than
  filling gaps, so a reused number cannot inherit a deleted group's schedule and
  present a brand-new mask as a card deep into review.
- **The canvas reuses `.osmosis-occlusion` and `.osmosis-occlusion-image`**
  rather than defining its own layout — the wrapper/`viewBox="0 0 1 1"`/
  `preserveAspectRatio="none"`/`object-fit: fill` contract is what makes a shape
  drawn in the editor land on the same pixels in study, and sharing the classes
  is what stops the two halves drifting. `.osmosis-occlusion-editor-layer` is a
  *second* overlay, separate from `.osmosis-occlusion-masks`, because the study
  one is `pointer-events: none`.
- **Handle-grab tolerance is per-axis**, not a scalar. The 0–1 space is stretched
  to the image's aspect ratio, so one normalised unit is a different number of
  pixels on x than on y; a scalar makes handles easy to grab on the short axis
  and nearly impossible on the long one. Handles are *drawn* in per-axis
  normalised units for the same reason.
- **A drag on empty canvas keeps drawing**, in the kind last chosen. Drawing
  drops into Select on the new shape so it can be nudged or regrouped, but the
  common next action is another mask, and making the user return to the toolbar
  between every shape was the first thing that felt wrong in use. A click that
  never becomes a drag is still just a deselect, since a degenerate draw commits
  nothing.
- **All three menu registrations earn their keep** — this answers the open
  question phase 3 was left with. `file-menu` carries the item for a bare image
  in Live Preview (Obsidian 1.13's own image menu, where `setSection("image")`
  groups it with Copy image / Swap file rather than trailing after Delete
  image). `editor-menu` carries it in source mode. Neither reaches an image
  *inside a rendered fence* — that is our DOM, not the editor's — so
  `ContextualStudyProcessor` offers its own menu there, mapping the clicked
  image back to its line via the embed's `src` and `getSectionInfo`. Matching by
  counting rendered `<img>` elements would drift: front and back render into
  separate containers and an unresolved embed produces no `<img>` at all.

#### Fixed in phase 3, but older bugs

- **Line-card chrome keyed on `cardType === "line"`**, so a note whose only cards
  were occluded images got no study or peek button. An occluded line card fans
  out into one card *per shape group* typed `"occlusion"` while still sitting on
  its line. **The block ID is the signal, not the type** — the identical mistake
  to the phase 1 routing bug fixed in phase 2. Two tests in
  `spatial-study.test.ts` pinned a card shape that cannot exist (`explicit` with
  a `blockId`); they were replaced with the real occlusion case.
- **`{a}` rendered as literal text** on any fence that had both occlusion data
  and a `***` separator: stripping lived inside the occlusion branch of
  `parseFenceContent`, and the separator branch returns before it. Now stripped
  once for every branch, pinned per surface in
  `ContextualStudyProcessor.dom.test.ts`.
- **A fence with no separator, cloze, or occlusion dumped raw source**, so the
  diagram you were about to occlude was only ever shown to you as text — you had
  to switch to source mode to reach it. It now renders its markdown as a
  **draft**: no divider, no hidden back, no rating row, and nothing joins a deck.
  Deliberately *not* a card, because `generateExplicitCards` skips exactly this
  shape and the two must agree. Making front-only fences into real cards was
  considered and rejected: unfinished drafts would start appearing in decks.

#### Testing infrastructure — read before adding view tests

`vitest` still cannot load the `obsidian` package (it ships types only,
`"main": ""`), and `vi.mock` cannot paper over it — Vite fails at package
resolution first. `src/test/obsidian-stub.ts` stands in for the module behind an
alias in `vitest.config.ts`.

**This is not a licence to move logic back into `src/views/`.** Pure logic still
belongs outside it — `study/occlusion-geometry.ts` is where phase 3's arithmetic
lives, and that is why it has 46 tests. The stub exists for DOM assembly that has
nowhere else to go. Its `createSvg` hands each class token to `classList.add()`
exactly as the real one does, so it still throws on a token containing a space; a
forgiving stub would hide the bug that once took out a whole card render.

### Known consequence — peek hides the whole diagram

Now that occluded line cards register as line cards, peek and study hide the
entire image line behind a placeholder rather than masking the occluded regions.
The buttons work and study works; peek on a diagram is simply blunt until
**phase 5** paints masks in place. Deliberate, not an oversight.

### Phase 4 decisions worth remembering

Shipped in `88db8a7`. Manual testing found four defects — see the prompt at the
foot of this note — but the decisions below are settled and survive the fixes.

- **Anki's Header / Back Extra / Comments fields were deferred to phase 5**, and
  this is the answer to the open question phase 4 was handed. Their whole
  observable behaviour is rendering, and two of the three surfaces do not exist
  until phase 5, so "behave as in Anki" could not have closed here either way.
  The stronger reason: `renderOcclusionSide` in `SequentialStudyModal` already
  renders the prose *surrounding* the embed as the card body. Whether Anki's
  fields replace that, sit alongside it, or are just the line-card answer to the
  same problem is a rendering-model decision, and it should be made once, with
  contextual and spatial rendering in front of you — not twice.
- **Annotations are their own list, never a shape.** `OcclusionSet.annotations`
  is optional and omitted when empty. Keeping them out of `shapes` is what stops
  them deriving a card *by construction*: `occlusionGroups`, `occludeLineCard`
  and `usedGroupsInFence` never see them, so none of them needs a skip rule and
  none can grow a phantom card by forgetting one.
- **Annotations render as positioned HTML, not SVG `<text>`.** The mask overlay
  is deliberately stretched — `viewBox="0 0 1 1"` with
  `preserveAspectRatio="none"` — which is the whole reason normalised
  coordinates land without measuring anything. Glyphs drawn inside it would be
  stretched with it and come out squashed on any non-square image. Percentages
  of the wrapper are the same 0–1 coordinates, so `positionAnnotation` is
  exported from `OcclusionRenderer` and shared with the editor; that sharing is
  what stops the two halves drifting.
- **Annotation font size is a fixed UI size, not a fraction of the image.** A
  label is chrome on the picture rather than part of it, and one scaled to the
  image becomes illegible wherever the card renders small — which is exactly
  what phase 5's mind-map nodes will do to it. Add a `size` field only if that
  turns out to be wrong.
- **Annotation text is always double-quoted on write.** It is the one field a
  user types freely, so it can hold a `:`, a `#`, or a leading `-`, any of which
  changes the meaning of a bare scalar. In the frontmatter carrier a malformed
  line fails the parse of the *whole note's* frontmatter, not just this entry —
  the same hazard that made single-line bare `key: value` shape runs illegal.
- **A duplicate keeps its source's group.** Duplicating is how you cover a
  repeated instance of one feature; a copy that minted its own group would turn
  one card into two behind the user's back.
- **Align works on the selection's own bounding box, not the image's.** Aligning
  to the picture's border would stack every mask on the edge. Sizes never
  change, only position along the aligned axis, so a mask drawn to fit a label
  still fits it.
- **Multi-move clamps the union box, not each shape.** Clamping individually
  would let a trailing shape keep travelling after the leading one hit the
  border, quietly deforming an arrangement the user had just aligned.
- **Undo is a snapshot stack (`study/occlusion-history.ts`), not command
  objects.** Shapes number in the tens and `redraw()` already rebuilds the whole
  overlay per pointer move, so a document copy per committed change costs
  nothing and removes the class of bug where a command and its inverse disagree.
  `commit()` refuses a snapshot equal to the one in force, so a stray click
  leaves no dead step — without that the first Ctrl+Z after one appears to do
  nothing. Mode is deliberately *outside* the snapshot: a two-value dropdown
  whose previous value is visible and one click away.
- **`preventDefault()` was removed from `onPointerDown`.** Cancelling
  `pointerdown` suppresses the compatibility mouse events, and `dblclick` is
  built out of those — so preventing the default silently kills every
  double-click gesture. Text selection is held off by `user-select: none` on the
  overlay instead. **Do not put it back**; see defect 4 below, which is the
  fallout, and fix that rather than reverting this.

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

# Prompt — Phase 4 fix-up: four defects and a modal redesign

Written 2026-08-11 at `88db8a7`, as a standalone brief for a fresh session. It
replaces the phase 4 prompt, whose durable content now lives in "Phase 4
decisions worth remembering" above.

## Where things stand

Branch `feature/image-occlusion`, at `88db8a7`. Work on this branch directly —
the six phases share it and there is no PR to open yet. `npm run lint`,
`npm test` (**1546 passing**), and `npm run build` are clean.

Phase 4 shipped the full toolset: polygon authoring, text annotations,
multi-select, align, duplicate, ungroup, undo/redo, zoom, and a translucency
toggle. Manual testing then found four defects. **Three of the tools work and
are confirmed** — alt-click vertex removal, multi-select + align + duplicate +
ungroup, and undo/redo — as is reading an existing polygon and annotations in
sequential study. Do not re-litigate those.

**Read "Phase 4 decisions worth remembering" above before touching anything.**
Several of those decisions constrain this work directly, in particular the
coordinate contract, why annotations are HTML rather than SVG, and why
`preventDefault()` is *not* called on `pointerdown`. `parser.test.ts` carries
wall-clock benchmarks that fail under load; re-run before investigating a
failure there.

## Defect 1 — double-click inside a polygon does not insert a vertex

Alt-click removal works; insertion does not. `onDoubleClick` in
`OcclusionEditorModal` requires `polyDraft === null`, exactly one selected
shape, `kind === "poly"`, and `containsPoint`. Two plausible causes, and they
are not exclusive:

- **Tool state.** With the Polygon tool still held, `onPointerDown` routes to
  `addPolyVertex` and starts a *new* draft, so `onDoubleClick` takes the
  `polyDraft !== null` branch and discards it. Insertion is only reachable under
  Select.
- **The native `dblclick` never arrives.** `redraw()` destroys and rebuilds every
  mask element on each pointer release, so the two `click` events have different
  targets and the browser must fall back to their common ancestor. Add pointer
  capture and it is fragile enough not to rely on.

**Recommended fix: stop using the native `dblclick` entirely.** Detect it in
`onPointerDown` from timing and proximity — keep a `lastClick: {time, point}`,
and treat a press within ~400 ms and within `grabTolerance()` of the previous
one as a double click. That is deterministic, works regardless of what the
browser does with compatibility events, and is drivable from the existing
pointer-event helpers in the DOM test. Then delete the `dblclick` listener on
the SVG *and* the one on the annotation label, which has the same exposure.

⚠️ **The current DOM test cannot catch this.** `"inserts a vertex where a
double-click meets the outline"` dispatches a synthetic `dblclick` straight at
the SVG, bypassing the whole click chain, so it passes against broken
behaviour. Rewrite it to fire two real taps once detection moves into
`onPointerDown`.

## Defect 2 — the Text tool does nothing at all

The tool activates, but clicking the image produces no label and no input.

`DomElementInfo.value` *is* supported (`obsidian.d.ts:160`), so the `<input>` is
constructed correctly — that is not it. The likely cause is a focus race
introduced by removing `preventDefault()` from `onPointerDown`: the browser's
default mousedown focus handling now runs *after* our handler, moves focus off
the freshly created input, the `blur` listener fires, `commitAnnotationEdit`
sees empty text and deletes the annotation again. Net effect: nothing happens.

Fix by creating the annotation on pointer **up** rather than pointer down — the
default focus shuffle is over by then — and defer `input.focus()` to a
`window.setTimeout(…, 0)`. Make the blur handler defensive too: ignore a blur
that arrives before the input ever became `document.activeElement`, so a
focus-steal can never silently delete a label.

**Do not fix this by restoring `preventDefault()` on `pointerdown`** — that
re-breaks every double-click gesture. Confirm the diagnosis first (a
`console.log` in the blur handler settles it in one click).

## Defect 3 — zoom is broken three ways, from one root cause

Reported: zooming resizes the modal; zoom does nothing at all when the Obsidian
window is fullscreen; and when it does work the masks stay put while the picture
grows, so they sit offset from the features they were drawn on.

One cause. The CSS zooms with `max-height: calc(55vh * var(--zoom))` and
`max-width: calc(100% * var(--zoom))`, and `max-*` only ever *constrains*. In a
fullscreen window the image's intrinsic size is already inside both caps, so
raising them changes nothing — zoom looks dead. Where a cap does bind, the image
grows but the wrapper does not track it (`.osmosis-occlusion-stage` is
`display: flex` with the default `align-items: stretch`, so the wrapper's box is
not the image's box), and the overlay — pinned to the wrapper — desyncs from the
picture. **That is the coordinate-contract failure phases 2 and 3 both warn
about**, and it is the most important thing on this list.

**Fix: set the size rather than capping it.** Make the stage a block box with
`overflow: auto` and a `max-height`; give `.osmosis-occlusion-canvas`
`display: block; width: calc(var(--osmosis-occlusion-zoom, 1) * 100%);
max-width: none;` and the image `width: 100%; height: auto; max-height: none;`.
Zoom 1 then means fit-to-width, the wrapper is always exactly the image's box at
every zoom, and overflow scrolls the stage instead of pushing the modal wider.
Add `min-width: 0` to the modal and the stage so overflowing content cannot grow
them.

Note the knock-on: centring an overflowing flex item clips its leading edge into
territory the scrollbar cannot reach, which is why the canvas is centred with
`margin` rather than `justify-content`. A block stage removes that problem
outright, so drop the `margin: auto` with it.

**Acceptance check:** draw a mask over a named feature, zoom to maximum, and
confirm the mask has not moved relative to that feature. Repeat with the window
fullscreen, floating, and split.

## Defect 4 — right-click opens the wrong image's shapes

On the `^os-tool001` line in `occlusion-toolset.md`, right-clicking the image
opens the editor on the shapes stored in the `cross-section` *fence*. The note
embeds `bridge-cross-section.svg` twice, deliberately.

**This is not a storage bug** — shapes are per carrier, and the user's framing
("shouldn't shapes be per-card, not per-image?") is already how it works.
`findEmbedLine` (`src/main.ts:54`) returns the **first** embed in the note that
resolves to the clicked file, so a second instance opens the first one's
carrier. `editor-menu` and the command palette are both unaffected: they use
`editor.getCursor().line`. Only the `file-menu` path is wrong.

Constraint found while investigating: the bundled `obsidian` **1.13.1** `.d.ts`
exposes no `posAtMouse` or `posAtCoords` on `Editor`, so there is no typed API
for "which line did this right-click land on".

Options, best first:

1. Record the last `contextmenu` event with `registerDomEvent`, then map its
   client coordinates to a document position through the CodeMirror `EditorView`
   reached via `editorEditorField` (`obsidian.d.ts:2599` — a public export) and
   its `posAtCoords`. Exact, and the public export keeps it defensible.
2. Fall back to picking the candidate line nearest `editor.getCursor().line`.
   Cheap, but CM6 does not reliably move the cursor on right-click, so it can
   still choose wrong.
3. Offer the item only when the resolution is unambiguous. Honest, but it
   silently drops the feature on exactly the note that needs it.

Take 1 with 2 as the fallback, and only offer the item when a line is resolved.
`fenceEmbedLine` already declines rather than guessing when several embeds match
— it is worth reading for the reasoning before choosing.

## The modal redesign

Same session, from the same manual pass:

- **Drop the `<h2>Image occlusion</h2>` and the image-name subtitle.** The user
  already knows what they opened and on what; between them they waste the whole
  top band of the modal. `.osmosis-occlusion-subtitle` and its CSS become dead
  once the subtitle goes — remove both rather than leaving an orphan.
- **Make the modal wider and taller relative to the Obsidian window.** It is
  currently `width: min(900px, 92vw)` with a `55vh` image cap. The canvas is the
  point of this modal and should get most of the window.
- The toolbar wraps to two rows at narrow widths, which is fine. Check no button
  renders blank: the Lucide names in use are `pentagon`, `ungroup`, `scan`, and
  the six `align-*` icons, and a name Obsidian's bundled set lacks produces an
  empty button with a working tooltip.

## Existing surface to build on

| What | Where |
|---|---|
| Parse / serialize shape sets and annotations | `src/card-gen/occlusion.ts` |
| Editor geometry — hit test, handles, vertices, align, zoom steps | `src/study/occlusion-geometry.ts` |
| Undo/redo stack | `src/study/occlusion-history.ts` |
| Which masks to paint, per mode and side | `src/study/occlusion-masks.ts` |
| The canvas modal | `src/views/OcclusionEditorModal.ts` |
| Image, masks, annotations for study | `src/views/OcclusionRenderer.ts` |
| Editor and mask styles | `styles.css` — `.osmosis-occlusion*` |
| Image context menus and line resolution | `src/main.ts` — `findEmbedLine`, `openOcclusionEditor` |
| Obsidian stand-in for view tests | `src/test/obsidian-stub.ts` |

## Test plan

Every defect here slipped past a green suite, so each fix needs a test that
would have failed before it:

- Double-click from **two real taps**, not a synthetic `dblclick`.
- The Text tool driven through pointer up, asserting the label survives a blur
  that arrives with the input never having been focused.
- Zoom asserting the *wrapper* tracks the image, not just that a custom property
  changed — the current test only checks the property and the viewBox, which is
  why it passed against a broken zoom.
- `findEmbedLine` (or its replacement) against a note embedding one image twice.

## Manual fixture

`e2e/fixtures/occlusion-toolset.md` (copied to `vault/tests/flashcard/`) is the
phase 4 fixture and already covers every defect here: an existing polygon and
annotations to read, a bare fence to draw in, and the same image embedded twice
so defect 4 reproduces. `occlusion-editor.md` is the phase 3 fixture and
`occlusion.md` the phase 1–2 one. All three vault copies get dirty as soon as
you test; reset them from `e2e/fixtures/` before each run. **Back-date every
card in any new fixture** — deck Total is `new + learn + due`, so a future-dated
`review` card cannot be studied and looks exactly like a card that failed to
generate.

## Conventions

`CLAUDE.md` governs. Lint → test → build, then hand over manual test steps and
**stop** for confirmation before committing. Commit code by explicit path, never
`git add .`. This note gets its own commit, separately. Do **not** mark the note
`Done` — phases 5 and 6 are outstanding. On completion, update the Progress
table, fold anything durable into "Phase 4 decisions worth remembering", and
replace this prompt with one for phase 5 (contextual and spatial rendering,
plus Anki's Header / Back Extra / Comments fields — see the first bullet of that
section for why they landed there).
