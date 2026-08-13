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
status: Done
priority:
progress_current: 6
progress_total: 6
date_created: 2026-08-03T15:38:04.268Z
date_modified: 2026-08-13T02:12:31.000Z
date_start_scheduled: 2026-08-09T00:00:00
date_start_actual: 2026-08-09T17:34:17
date_end_scheduled: 2026-08-13T00:00:00
date_end_actual: 2026-08-13T02:12:31
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/21
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
ungroup, align. Plus the two modes.

> **Updated 2026-08-12 (`51a749b`).** This originally read "plus Anki's three
> fields — Header (above the image), Back Extra (below, answer side), and
> Comments (never shown)". **All three are gone**, and the editor has no text
> inputs at all. See "Anki's text fields, reversed" below for why. Parity with
> Anki was the goal everywhere else in this note; this is the one place it was
> deliberately abandoned.

## Study rendering

| Mode | Surface | Behaviour |
|---|---|---|
| Sequential | `SequentialStudyModal` | Front: image with masks per mode. Back: target group revealed, others per mode |
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

Branch `feature/image-occlusion`, cut from `release/0.0.4`. **All six phases are
done and manually verified**, and the branch is open as
[PR #21](https://github.com/SawyerRensel/Osmosis/pull/21).

| Phase | State | Commits |
|---|---|---|
| 1. Format + parser | Done, manually verified | `267e91f`, `237cd3f` |
| 2. Renderer | Done, manually verified | `d651112`, `8719ab5` |
| — | [[Improve cloze data storage]] merged in ([PR #20](https://github.com/SawyerRensel/Osmosis/pull/20)) | `9dae548` |
| 3. Editor | Done, manually verified | `a533221` |
| 4. Full toolset | Done, manually verified | `88db8a7`, `1a21428`, `ad93112`, `0995a7d` |
| 5. Remaining surfaces | Done, manually verified | `5cc7e74`, `dd7de3e`, `b4a1392` |
| — | Anki's text fields removed, Cancel dropped, mode labels shortened | `51a749b` |
| — | Rotation for shapes and annotation labels | `ac3710f` |
| — | An occluded line's masks ring on reveal rather than clearing | `a7c8b5c` |
| — | Labels sized from a box, as a fraction of the picture | `04a09da` |
| — | Contextual study steps through a carrier's shape groups | `af947b4` |
| 6. Touch | Done, manually verified on a real device | `ad93112`, `9aa1f61` |

Rotation was scoped during phase 5 and deferred; it shipped afterwards in
`ac3710f`, and the editor is now feature-complete against Anki's toolset apart
from the text fields, which were removed deliberately.

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

### Known consequence — peek hides the whole diagram *(resolved in phase 5)*

Occluded line cards registered as line cards, so peek and study hid the entire
image line behind a placeholder rather than masking the occluded regions. Fixed
in `5cc7e74`: the placeholder now carries the masked diagram.

### Phase 4 decisions worth remembering

Shipped in `88db8a7`, then repaired across `1a21428`, `ad93112`, and `0995a7d`
after manual testing found four defects and a round of UI feedback. All of it is
verified; the decisions below are settled.

- **Anki's Header / Back Extra / Comments fields were deferred to phase 5**, and
  this is the answer to the open question phase 4 was handed. *(Superseded: all
  three were built in phase 5 and then removed entirely in `51a749b` — see
  "Anki's text fields, reversed". The deferral reasoning below is still worth
  reading, since it is where the deciding argument first appears.)* Their whole
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
- ~~**Annotation font size is a fixed UI size, not a fraction of the image.**~~
  *Reversed in `04a09da` — see "Labels became boxes" below.* The reasoning was
  that a label is chrome on the picture rather than part of it, and one scaled to
  the image becomes illegible wherever the card renders small, which is exactly
  what a mind-map node does to it. That consequence is real and was accepted
  knowingly; what outweighed it was that a label the user drags to a size has to
  keep that size relative to the picture, or it is not the same annotation on two
  surfaces.
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
  `pointerdown` suppresses the browser's own focus handling along with the
  compatibility mouse events, and the annotation input needs both — an input
  built while that handling is still pending loses focus the instant it runs.
  Text selection is held off by `user-select: none` on the overlay instead.
  **Do not put it back.**

#### The phase 4 fix-up — four defects and the UI round

- **Double clicks are detected in `onPointerDown`, from timing and proximity
  (`isDoubleClick`), never from the native `dblclick`.** `redraw()` destroys and
  rebuilds every mask element on each pointer release, so the two constituent
  clicks land on different elements and the browser falls back to their common
  ancestor; with pointer capture in play the event simply never arrived. Vertex
  insertion was dead as a result. The old DOM test dispatched a synthetic
  `dblclick` straight at the SVG and passed against the broken behaviour — the
  gesture is now driven from two real taps, which is the only way it stays
  honest. The annotation label shares the same detector for the same reason.
- **The Text tool places its label on pointer *up*.** Created on down, the input
  is built before the browser's mousedown focus handling runs, which then moves
  focus off it, the blur commits empty text, and the annotation deletes itself —
  the tool appeared to do nothing at all. `input.focus()` is also deferred a
  tick, and the blur handler ignores a blur that arrives before the field was
  ever focused, so a focus steal can never silently delete a label.
- **Zoom sizes the wrapper; the fit is measured in TypeScript.** `max-width` and
  `max-height` only ever *constrain*, so on a large window the image was already
  inside both caps and raising them did nothing — zoom looked dead — and where a
  cap did bind the picture grew while the wrapper did not, leaving the overlay
  pinned to a box the image had outgrown. The canvas width is now
  `--osmosis-occlusion-fit × --osmosis-occlusion-zoom`, where the fit is
  `fitWidth(stage, natural)`: the narrower of width-bound and height-bound.
  **CSS cannot do this itself.** `object-fit: contain` letterboxes the picture
  away from its wrapper, and a `max-height` percentage cannot resolve through a
  shrink-to-fit wrapper — and the wrapper must stay *exactly* the image's box or
  every mask lands wrong. Re-measured on image load and by a `ResizeObserver` on
  the stage; `measure()` deliberately calls `applySize()` rather than `redraw()`,
  because the observer's first delivery can arrive before the chrome exists.
- **Zoom 1 means the whole image, not fit-to-width.** Fitting the width alone is
  what put a second scrollbar on the modal: a portrait diagram overflowed the
  stage, and between the modal's scrollbar and the stage's the toolbar could be
  scrolled out of reach. The modal is a flex column with a definite height and a
  `.modal-content` that does not scroll, so the stage is the only scroll surface
  and only once the user has zoomed in.
- **The stage has no padding**, so its own content box is what the fit is
  measured against and no constant has to be kept in step with `styles.css`. It
  centres with `safe center`, with plain `center` declared first as a fallback:
  an unsupported value drops the whole declaration, and a stretched canvas is no
  longer the image's box.
- **Ctrl+wheel and pinch both zoom about a point** (`anchoredScroll`), because
  growing the canvas alone scales it from its top-left and slides the thing
  being zoomed towards out from under the pointer.
- **Touch gestures are the modal's own work.** `touch-action: none` on the
  overlay is what lets one finger draw, and it also means the browser scrolls
  nothing — hence the Pan tool and the two-finger handlers. A second pointer
  starts a gesture that pinches and pans together, both measured from where the
  gesture began rather than from the previous move, so a slow drag cannot drift.
  Whatever the first finger had started is **abandoned, not committed**: the
  opening of a pinch is not a mask. Panning moves the viewport, so it records no
  undo step and keeps the selection.
- **Every shape hotkey stands down while a label is being typed.** Obsidian's
  keymap sees a key *before* the focused input does, so claiming Backspace
  deleted the annotation being named instead of a character of its text.
  Returning nothing from the handler hands the key back to the field.
- **Escape is guarded in `close()`, not in the scope handler.** Obsidian's own
  close-on-Escape is registered on the modal's *same* scope and is evaluated
  first, so a guard in our handler never runs — the observable proof that within
  one `Scope` the earlier registration wins. Refusing the close itself is the one
  decision nothing can pre-empt. Every other route to closing (the ✕, the
  backdrop, Save) blurs the field first, which commits what was typed and clears
  `editingAnnotation`, so only the keyboard reaches the guard.
- **`file-menu` resolves *which* embed was clicked** through `pickEmbedLine`,
  fed by CodeMirror's `posAtCoords` on the view behind `editor.cm`, with a
  `contextmenu` listener registered in the capture phase holding the click's
  coordinates. The 1.13 `Editor` type exposes no `posAtMouse`. `editor-menu` and
  the command palette were never affected — they key off
  `editor.getCursor().line`, which is the cursor's line by construction. Ties go
  to the earlier embed and an unresolved line withholds the menu item, rather
  than guessing a diagram.
- **Chrome the user does not need is gone**: no `<h2>`, no image-name subtitle,
  no "Group"/"Mode" captions (the words survive as `aria-label`). Mode options
  are sentence case, as Obsidian's own UI is.

### Phase 5 decisions worth remembering

Shipped in `5cc7e74`. Manually verified except where the follow-up prompt says
otherwise.

- **The note views paint every group at once, with no target.** `OcclusionSide`
  grew `all-hidden` and `all-revealed` beside `front`/`back`. In the note nobody
  is answering one of the questions a diagram carries, so there is no group to
  single out and the *mode* is irrelevant — `hide-one-guess-one` describes how
  one card relates to its siblings, and in the note there are no siblings to
  relate to. Revealing **rings** the covered regions rather than clearing them,
  so the answer still says where the questions were and neither side reflows.
  **This does not extend to spatial study**, which asks one card at a time —
  see the follow-up prompt.
- **Contextual returns an occlusion payload, not a cleverer string.** Every
  other card type produces `front`/`back` markdown for `MarkdownRenderer`; masks
  are an SVG overlay pinned to an image and cannot be expressed that way. So
  `ParsedFence` grew an `occlusions` field and `renderSide` draws it.
- **A card keeps every diagram in its fence.** Cards used to have their siblings
  cut out by `isolateEmbed` (now deleted) on the grounds that they were not
  being asked. In practice a fence holds several diagrams because they explain
  each other, so the body keeps them all, siblings render **unmasked** — they
  are not being asked, and covering them would pose a second question the card
  never answers — and `splitAtEmbed` splits the body at the card's own embed so
  the masked picture lands where the author put it. Appending it after the prose
  reversed the authored order.
- **Fence cards are spatial study targets, keyed on the fence.** A fence is one
  node but often several cards (`-c1`, `-c2`, `-r`), so the node keys on the
  fence ID and `cardIdsForFenceKey` maps back. Fence IDs never contain `#^` and
  line keys always do, so the two key shapes cannot collide.
- **A fence node is never blanked behind a "?".** Its front *is* the question —
  prose, a cloze with its blanks, a masked diagram — so hiding the node took the
  question away along with the answer. Reading view had always worked this way;
  the map now matches.
- **A revealed node keeps its laid-out size.** Re-measuring on reveal would
  reflow the whole map under the reader's cursor. A little slack in the box is
  the better trade.
- **An occlusion fence node renders once, and repaints.** Its two sides differ
  only in whether the masks are filled, so it gets no back half at all;
  `overlayMasks` repaints any `.osmosis-occlusion` wrapper in place. Drawing a
  second copy for the back would double node height and re-request every image.
- **Ratings belong to study mode only.** Reading view showed four rating buttons
  on every fence card whatever the note was doing, so peek — which records
  nothing by definition — still wrote schedules. `isStudying()` is read at
  *reveal* time, not render time: a fence is a code block, and toggling the mode
  does not re-run its processor.
- **Anki's Comments field was dropped** after being built. It renders on no
  surface, so its only effect was to sit in the user's file. A `comments:` key
  from the interim build parses as an unknown key, which this format ignores,
  and is dropped the next time the set is written. *(Header and Back Extra
  followed it out in `51a749b`, by the same migration path — see "Anki's text
  fields, reversed".)*
- **`fenceDiagrams` lives in `card-gen/occlusion.ts`, not in a view.** Reading
  view and the mind map paint the same diagrams from the same fence text, and
  `vitest` cannot import `obsidian` — logic in `src/views/` is untestable.

#### Fixed in phase 5, but older bugs

- **`allLineCardIds` keyed on the card ID.** An occluded line's cards are
  `…#^block/c1`, `…/c2`, so no node key ever matched: those nodes were counted
  by the header buttons and then never hidden. This is the **third** time the
  card-ID-vs-line-key mistake has been made. `cardIdsForLineKey` and
  `occlusionForLineKey` exist so it need not be made a fourth.
- **Rating a line dropped the review.** `onPlaceholderClick` looked the line key
  up as a card ID, found nothing for an occluded line, and recorded nothing —
  the schedule never moved and the card returned next session as though it had
  never been answered. One reveal now rates every card the line carries.
- **Occluding an image made it impossible to right-click back into the editor.**
  A masked diagram is no longer an Obsidian embed, so `.internal-embed` found
  nothing; the link now comes from the `alt` the renderer sets to the embed
  target as authored.

### The phase 5 fix-up — two defects and the modal's scrollbars

Shipped in `dd7de3e` and `b4a1392`, manually verified 2026-08-11.

- **Spatial study asks one shape group at a time, and the key set is per card.**
  This is the answer to the design question phase 5 was handed, and it went the
  way that note preferred. A node's *identity* key is untouched —
  `nodeCardKey` still returns one key per node, because the context menu and
  "Study this branch" scope collection are built on it. What changed is that a
  session no longer targets node keys directly: `spatialNodeTargets` maps a node
  key to the units of work it carries, one per **due** shape group for an
  occluded node and one for everything else, and `spatialTargets` is the union.
  The banner therefore counts cards, which is what the reader is pacing against.
- **Peek deliberately does not split.** It reveals in any order and records
  nothing, so there is no question being asked and nothing for a target group to
  mean. `enterSpatialPeek` maps every node key to itself.
- **Occluded *line* nodes split too**, not just fences. The phase 5 prompt only
  reported the fence bug, but the reasoning — spatial study is a card player,
  with a target, a rating and a completion count — does not depend on which
  carrier the shapes sit in, and leaving lines alone would have made the same
  diagram behave differently in a fence and on a line.
- **A node whose due cards are not *all* occlusion cards stays one unit.** A
  fence can mix an occluded diagram with a caption cloze; splitting on the
  diagram alone would leave the cloze card with no key at all and drop its
  review. `spatialStudyKeys` returns the bare node key in that case, which is
  the old behaviour exactly.
- **`spatialNodeStep` derives the node's state from the two sets** rather than
  storing a cursor: the first key not revealed is the question, the first
  revealed-but-unrated key is the answer, and a node with neither is finished.
  It survives a re-render for free, which a cursor would have had to be rebuilt
  to do, and it collapses to the old two-state behaviour for an unsplit node.
- **`OcclusionSide` grew `none`** — a diagram in view that is not the one being
  asked. A fence's *other* labelled embed belongs to a different card, and
  sequential has always shown those unmasked; the map paints its diagrams in
  place rather than re-rendering a card body, so it has to say so explicitly.
- ~~**Back Extra is built on every side and hidden on the question ones**~~ —
  *obsolete as of `51a749b`, which removed both fields.* The bug it fixed is
  still worth knowing, because the shape recurs: an element that is a **sibling**
  of the wrapper `overlayMasks` repaints cannot be taken back by a repaint, so
  anything conditional living outside that wrapper has to be built always and
  toggled, never withheld. That is how a node rendered `all-revealed` came to
  show its answer text under a covered diagram.
- **One rating re-applies the whole spatial state.** `rateSpatialCard` used to
  redraw only the banner; an occluded node with groups left has to reset and ask
  the next one, which is the whole point of stepping through them.
- **The study modal is a flex column with one scroll surface.** The card's
  `max-height: calc(85vh - 120px)` guessed at the height of the surrounding
  chrome, so whenever the real chrome was taller the card sat inside its own cap
  while the column overflowed and `.modal-content` scrolled as well — and the
  flip and rating buttons live *below* the card, so between the two scrollbars
  they could be scrolled out of reach. `.modal-content` no longer scrolls, the
  card is the only row that does (`flex: 1` with an explicit `min-height`, since
  a flex item's default `min-height: auto` refuses to shrink below its content),
  and everything around it is `flex: none`. `max-height` rather than a fixed
  height, so a one-line card still gets a compact modal. This is the same shape
  `.osmosis-occlusion-modal` already used, for the same reason.

#### Known gaps, deliberately left

- ~~**An occluded *line* card's Header and Back Extra do not render on every
  surface.**~~ *Resolved in `51a749b` by removing both fields.* Worth recording
  how it was resolved, because "delete the feature" is not the usual answer: the
  gap was real and the fix was known (teach `overlayMasks` and the line-reveal
  swap about the two elements), but it was the second time the fields had cost
  work to make behave on a surface where the note's own prose already rendered
  correctly. That was the evidence that settled the reversal.
- **Spatial rendering has no automated coverage.** `MindMapView.ts` cannot be
  imported by `vitest` at all, so `spatialStudyKeys` and `cardIdsForSpatialKey`
  carry the tests and the painting itself is pinned only by manual testing.

### Anki's text fields, reversed

Shipped in `51a749b`, manually verified 2026-08-12. This **removes** working,
tested behaviour that phases 4 and 5 deliberately built, so the reasoning matters
more than usual — a future session reading the phase 4 and 5 sections above will
find them arguing the opposite case.

- **Header, Back Extra, and Comments are all gone** — from the format, the
  editor, and every study surface. The deciding argument is the one phase 4
  already half-made and then deferred: `renderOcclusionSide` renders the prose
  *surrounding* the embed as the card body, on every surface. So the note's own
  prose was already a card's text, already markdown, already editable where the
  user writes everything else. Anki's fields were a **second** text channel for
  the same job, reachable only from inside a modal, storing plain text that
  rendered nowhere else. In Anki they earn their place because there is no note
  around the card; here there always is.
- **This closes the phase 4 open question the wrong way round from how it was
  posed.** Phase 4 asked whether the fields "replace, sit alongside, or are the
  line-card answer to" the surrounding prose, and deferred it to phase 5 so the
  decision could be made with all three surfaces in front of you. Phase 5 built
  them and answered "alongside". Using them for a while is what settled it: the
  answer is **none of the three** — the prose was already sufficient.
- **The migration is the same one Comments already took.** `header:`,
  `back-extra:`, and `comments:` now all parse as unknown keys, which this format
  ignores by design, and are dropped the next time the set is written. No sweep,
  no version flag, and an old note still loads with its shapes intact. Two tests
  in `occlusion.test.ts` pin exactly that, and they are the *reason* the removal
  could be total rather than a deprecation.
- **`OcclusionSide`'s four values survive the removal**, even though Back Extra
  was the only thing `isAnswerSide` existed for. `front`/`back`/`all-hidden`/
  `all-revealed` still decide which masks paint, which is the distinction phase 5
  introduced them for. Only the helper went.
- **Cancel went with them.** The editor's close button, Escape, and a backdrop
  click all already discarded, so the button was a fourth spelling of a route
  sitting in the same dialog's corner. The discard path is unchanged and still
  pinned — `OcclusionEditorModal.dom.test.ts` now drives it through `close()`
  rather than a button click, which is the honest test either way.
- **Mode labels read "Hide all, guess 1" / "Hide 1, guess 1".** Numerals rather
  than words, to buy the dropdown ~40px so it can share a toolbar row with the
  group dropdown instead of wrapping. The toolbar needs roughly 940px to keep
  both on one row; below that it still wraps, and the next lever is the toolbar's
  own gaps rather than the labels.

### Rotation

Shipped in `ac3710f`, manually verified 2026-08-12. This was scoped in phase 5,
deferred, and built last.

- **The transform is aspect-compensated, not a plain `rotate()`.** The overlay is
  stretched by `preserveAspectRatio="none"` — the thing that lets normalised
  coordinates land without measuring anything — so a `rotate()` inside it applies
  *after* the stretch and a tilted rectangle renders as a parallelogram on any
  non-square image. This project's diagrams are wide, so it was glaring.
  `rotationTransform` emits `matrix(cos, a·sin, −sin/a, cos, e, f)` with
  `a = W/H` instead. Of the three options weighed, this was the only
  geometrically correct one that keeps a single coordinate contract.
- **The aspect reaches `maskElements` as an argument, never off the DOM.**
  `MaskElement` is what `occlusion-masks.test.ts` asserts against, so reading the
  image would have made the paint untestable. The renderer supplies it from the
  image's natural size, paints at `a = 1` before the picture loads, and repaints
  on `load` — registered **only when something is rotated**, so an unrotated card
  adds no listener and cannot loop.
- **Stored geometry stays the unrotated box.** Every editor gesture turns the
  pointer back into the shape's own frame on the way in, and the grips are drawn
  inside a group carrying the shape's transform — so the picture and the hit test
  work in one frame by construction rather than by two pieces of arithmetic
  agreeing.
- **`resizeAnchored` pins the opposite handle in screen space.** Without it,
  resizing a tilted shape slides it across the picture. 0–1 clamping is dropped
  for a rotated resize or vertex drag, because in a turned frame those axes are
  not the image's borders.
- **Labels turn through CSS and need no compensation** — they are positioned HTML
  precisely so they escape the overlay's stretch.

### Labels became boxes

Shipped in `04a09da`, manually verified 2026-08-12. **This reverses the phase 4
decision that a label is fixed-size chrome** — see the struck-through bullet in
"Phase 4 decisions worth remembering".

- **An annotation is a box like any other shape**, with normalised `w`/`h`, and
  turns about the box's centre rather than its anchor. It therefore moves,
  resizes and rotates through exactly the arithmetic a shape uses
  (`annotationBox`/`annotationWithBox`, inverse-rotated pointer) and grows the
  same eight handles and rotation grip. That sharing is the point: a second
  arithmetic for labels is what would drift.
- **The consequence phase 4 guarded against is real and accepted.** A label in a
  small mind-map node now shrinks with the picture rather than staying legible.
  It was taken knowingly, because a label the user has dragged to a size must
  keep that size relative to the picture or it is not the same annotation on two
  surfaces.
- **Glyphs are `cqh` against the annotation layer**, which is a size container
  precisely because it is pinned with `inset: 0` — so its size is the image's box
  and never its own contents. Position and box stay percentages, so a webview
  without container queries still lands and turns a label correctly and only the
  font falls back.
- **Only the editor measures text.** A label is placed before it has any text, so
  its width can then only be a guess; the editor measures the committed text off
  a real chip and stores the result. Every study surface paints from the stored
  box with nothing measured — that is the contract the whole feature rests on. A
  width the user drags is theirs until they retype.
- **The default height is a seventh of the picture, not a twelfth.** Labels scale
  from the image's *height*, and a wide, short diagram has little height to take
  a fraction of; a twelfth read as a squint. A seventh is about what a label has
  to be to be comfortable at the editor's fit-to-window zoom, which is where
  labels get placed.
- **Mask strokes and label corners are fractions of the picture now**, not fixed
  pixels — those were computed against a mind-map node's thumbnail layout and
  then magnified with the node, giving heavy borders and pill-shaped labels. The
  editor deliberately keeps fixed thicknesses, which is not an inconsistency:
  elsewhere the picture is *shown*, so an outline is part of it; in the editor it
  is *worked on*, zoom is a magnifier, and an outline that fattens as you magnify
  hides the very edge you zoomed in to find. The grips have always worked this
  way.

### An occluded line rings its masks on reveal

Shipped in `a7c8b5c`.

`trackLine` built a masked placeholder, but the reveal did what it does for any
line card — hide the placeholder, swap the line's own content back in. That
content is the bare embed, so masks and annotations went with it: rating produced
an unmarked picture with nothing left to say which region had been the question,
which is the one thing occlusion exists not to do.

The line's `CardOcclusion` is now held on its `TrackedLine`, and the placeholder
stays up for the whole of peek and study, repainting `all-hidden` →
`all-revealed` instead of being swapped away. That matches what a fence card
already did in reading view and holds the line's height steady across the flip.
Repainting goes through `overlayMasks`, so the `<img>` is never rebuilt and the
diagram cannot flash away mid-answer. The occlusion is looked up on **every**
render, not just the first: the placeholder survives a re-render, but the card
store may only have caught up with the line's shapes since.

### Contextual study steps through the groups

Shipped in `af947b4`, manually verified 2026-08-12.

- **Reading view had two jobs on one diagram and was doing only one.** Peek is a
  reader looking at a picture — every group blanked at once, none singled out,
  nothing recorded. Study is a card player, exactly as sequential and spatial
  are, so it asks the groups one at a time and moves one schedule per answer.
  Both note surfaces derive that sequence from `src/study/occlusion-steps.ts`,
  kept pure so a fence and a line order their questions identically.
- **Contextual ratings on an occluded fence went to the *fence* ID**, which is
  not a card the store holds, so `recordRating`'s guard silently dropped every
  one of them. They now go to the group's own card. This is the
  card-ID-vs-carrier-key mistake for the **fourth** time.
- **A fence is a code block, so toggling peek or study never re-ran its
  processor.** A render registry plus `refresh(notePath)` restarts a tracked card
  in place.
- **An occluded fence is built once and repainted, never rebuilt.** Emptying its
  container re-created the `<img>`, which has no height until the picture
  decodes, so the note collapsed under the reader and reading view scrolled them
  off the diagram they were answering. The renderer also remembers each picture's
  natural size and reserves its box on the next render, and a fence holds the
  height it last rendered to across the frame in which Obsidian rebuilds the
  block.
- **The fitted image gives the stage a pixel back.** Filling the stage exactly
  had the image and the scrollbar shaking at each other through the resize
  observer.

### Phase 6 — touch, and selecting masks with labels

Pan, pinch and the Pan tool landed in `ad93112` (recorded under phase 4's fix-up,
where they were built); multi-select by touch landed in `9aa1f61`. Manually
verified on a real device 2026-08-12, which is what closes phase 6.

- **Touch multi-select is sticky, armed by a 500ms hold, and touch/pen only.** A
  hold-per-shape scheme cannot work: the second shape's press would replace the
  selection the first one built, so only one thing is ever selectable. A press on
  bare image is the only way out by touch alone, so keep it. The hint line
  announces the mode, since the gesture leaves nothing on screen. **Mice are
  excluded on purpose** — holding still before moving is how a careful user
  starts a precise drag.
- **Labels join the selection, and the two lists are no longer mutually
  exclusive.** The old comment justified the exclusion with "the two share no
  operations beyond delete and duplicate"; aligning a label against a mask is the
  case that retired it. They stay *two* lists (`selectedShapes` /
  `selectedAnnotations`) because grouping and ungrouping are meaningless for a
  label, which derives no card — those still read `selectedShapes` alone. Do not
  re-split them, and do not extend Group/Ungroup to labels.
- **Align and move are box arithmetic over one list.** `alignShapes`/`moveShapes`
  became `alignBoxes`/`moveBoxes`, and `reshapeSelection` maps a mixed selection
  through them. Two passes would align labels to the labels' box and masks to the
  masks', and would clamp a drag twice and shear the arrangement apart at the
  image's edge. The `annotation` drag variant is gone with it — a label drag is a
  move of a one-element selection.

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
| `src/views/MindMapView.ts` | Render occlusion cards in nodes; step through their groups in study |
| `src/views/LineRevealProcessor.ts` | Masked placeholder for an occluded line; ring on reveal |
| `src/study/spatial-study.ts` | Node/card keys; split an occluded node into its due groups |
| `src/study/occlusion-masks.ts` | Which masks each side paints |
| `src/study/occlusion-geometry.ts` | New — editor arithmetic: hit tests, handles, rotation, align/move |
| `src/study/occlusion-history.ts` | New — the undo snapshot stack |
| `src/study/occlusion-steps.ts` | New — the order a carrier's groups are asked in |
| `src/test/obsidian-stub.ts` | New — stands in for the `obsidian` module under vitest |
| `src/main.ts` | Image context-menu item; rename rewriting |
| `src/database/types.ts` | `occlusion` card type; shape, annotation and rotation types |
| `styles.css` | Mask, editor, and study-modal layout |

## Acceptance criteria

- [x] Right-clicking an image offers "Create image occlusion"
- [x] Rect, ellipse, and polygon can be drawn, moved, resized, and deleted
- [x] Shapes sharing a group produce exactly one card
- [x] Both modes render correctly on front and back — *on all three surfaces;
      contextual and spatial landed in phase 5*
- [x] One fence with two labelled embeds keeps its shape sets distinct
- [x] Reordering embeds within a fence does not move masks between images
- [x] The `{a}` label never appears as text in sequential, contextual, or spatial
      study — *sequential and contextual pinned by tests; spatial verified by
      hand, since `MindMapView.ts` cannot be imported by `vitest`*
- [x] The label is preserved in the source file after any render or write cycle
- [x] Occlusion cards study correctly in all three modes
- [x] ~~Header, Back Extra, and Comments behave as in Anki~~ — **criterion
      withdrawn**, not met. All three were built, shipped, used, and then removed
      in `51a749b`: the note's own prose around the embed is the card's text on
      every surface, so Anki's fields were a second channel for a job already
      done. The one place this feature deliberately does not follow Anki. See
      "Anki's text fields, reversed"
- [x] Renaming an occluded image rewrites the fence; line cards are handled by Obsidian
- [x] Masks stay aligned when the image is resized or given a `|300` suffix
- [x] Reopening the editor restores the existing shape set exactly
- [x] Pre-existing `osmosis-schedule` entries still load unchanged
- [x] Shapes can be drawn and manipulated by touch on mobile — *pan, pinch,
      one-finger authoring and sticky multi-select, confirmed on a real device
      2026-08-12*
- [x] Shapes and annotation labels can be rotated, and a rotated rect renders as
      a rectangle rather than a parallelogram on a wide image — *added after the
      six phases, `ac3710f`*
- [x] `npm run lint` and `npm test` clean — *1766 tests passing*

## Test plan

Unit is where correctness is won, since geometry and derivation are pure:
`src/card-gen/occlusion.test.ts` — shape round-trip through fence and
frontmatter, group→card derivation, ID derivation matching cloze's `-cN`,
coordinate normalisation, label binding with multiple embeds, rename rewriting,
and backwards compatibility of existing schedule entries.

Manual fixtures live in `e2e/fixtures/` (**not** an `e2e/fixtures/flashcard/`
subdirectory — an earlier draft of this note said otherwise) and are copied to
`vault/tests/flashcard/`. The images live in `vault/media/`; do **not** copy them
next to the notes, or the short links resolve ambiguously.

| Fixture | Covers |
|---|---|
| `occlusion.md` | Phases 1–2: one fence with two labelled embeds and mixed shape kinds, one occluded line card, and one pre-existing non-occlusion line card to prove the compatibility path |
| `occlusion-editor.md` | Phase 3 |
| `occlusion-toolset.md` | Phase 4 |
| `occlusion-surfaces.md` | Phase 5 — contextual and spatial |
| `occlusion-rotation.md` | Rotation, on a deliberately wide image (`gantry-truss.svg`) so a shear would be obvious |
| `occlusion-multi-select.md` | Touch multi-select |

All the vault copies get dirty as soon as you test, because studying writes
schedules back. **Reset them from `e2e/fixtures/` before each run**, and commit
the reset as its own `chore:` commit afterwards. **Back-date every card in any
new fixture** — deck Total is `new + learn + due`, so a future-dated `review`
card cannot be studied and looks exactly like a card that failed to generate.

## Follow-ups

- [[Spaced Repetition for Excalidraw]] and
  [[Spaced Repetition for Obsidian Canvas]] share the mask-overlay renderer
- Occlusion cards in the [[Create Card Browser - Editor]] type filter
- [[Rating a fence card rewrites the block being read]] — found while testing
  phase 5's contextual surface; its fix rides in the same PR

---

# What was implemented

**Where it shipped.** [PR #21](https://github.com/SawyerRensel/Osmosis/pull/21),
`feature/image-occlusion` → `release/0.0.4`, 37 commits. The per-phase commits
are in the Progress table above.

**What it does.** Right-click any image → **Create image occlusion** opens a
canvas editor with Anki's full toolset — select, rect, ellipse, polygon, text
annotation, rotate, undo/redo, zoom, translucency, delete, duplicate, group,
ungroup, align, pan — plus the two modes. Masks become flashcards that study in
all three modes: sequential, contextual (in the note), and spatial (in a mind-map
node).

**The idea the design rests on.** Masks *are* card data, so they live wherever
that card's data already lives — no new fence type, no SVG sidecar, no parallel
store. And a shape group **is** a cloze group, which meant Anki's shape-grouping
feature and the `-cN` ID derivation both arrived for free. The one thing that
cannot be inline is geometry, since nobody hand-writes coordinates; shapes
therefore sit in the header, bound to their embed by a `{label}` that is stripped
at render time on every surface.

**The contract everything else follows from.** The overlay measures nothing: a
wrapper shrunk to exactly the image's box, with a `viewBox="0 0 1 1"` SVG pinned
to its edges at `preserveAspectRatio="none"` and the image at `object-fit: fill`.
Normalised coordinates then land on the right pixels at any size, with no
`ResizeObserver` and no load handler, and a shape drawn in the editor lands on
the same pixels in study. **Changing either half of that alone silently
misaligns every mask** — it is also what forced rotation to be
aspect-compensated and annotations to be positioned HTML rather than SVG
`<text>`.

**The recurring bug, four times over.** A carrier key is not a card ID. An
occluded line fans out into one card *per shape group* while still living on its
line, so `cardType`-based and ID-based routing both fail on it: schedules were
dropped in phase 1, line chrome vanished in phase 3, node keys never matched in
phase 5, and contextual ratings went to the fence ID in `af947b4`.
`cardIdsForLineKey`, `cardIdsForFenceKey` and `occlusionForLineKey` in
`src/study/spatial-study.ts` exist so it need not happen a fifth time.

**Decisions worth remembering** are recorded per phase above, under "Phase N
decisions worth remembering" and the fix-up sections. Two are **deliberate
reversals of working, tested behaviour** and will read as mistakes to a session
that only sees the code:

- Anki's Header, Back Extra and Comments fields were built, shipped, used, and
  then removed entirely — the note's own prose around the embed is already the
  card's text on every surface. See "Anki's text fields, reversed".
- Annotation labels scale with the picture, reversing phase 4's fixed-size
  decision. See "Labels became boxes". The illegible-in-a-small-node consequence
  is real and was accepted knowingly.

Both migrate by being ignored: unknown keys are dropped on the next write, so old
notes load with their shapes intact and no sweep was needed.

**Surface map** and **Test plan** are the sections above. Verified with
`npm run lint`, `npm test` (1766 passing) and `npm run build` clean, and every
phase manually verified — phase 6 on a real device on 2026-08-12.

**What was not done.** Spatial rendering has no automated coverage, because
`MindMapView.ts` cannot be imported by `vitest` at all; `spatialStudyKeys` and
`cardIdsForSpatialKey` carry the tests and the painting itself is pinned only by
manual testing. Anything more that is worth pinning has to leave the view first.
