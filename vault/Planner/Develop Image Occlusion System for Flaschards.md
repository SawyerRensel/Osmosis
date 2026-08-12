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
progress_current: 4
progress_total: 6
date_created: 2026-08-03T15:38:04.268Z
date_modified: 2026-08-11T09:20:00.000Z
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
| 4. Full toolset | Done, manually verified | `88db8a7`, `1a21428`, `ad93112`, `0995a7d` |
| 5. Remaining surfaces | Rendering done and verified; spatial study of an occlusion fence still reveals all groups at once | `5cc7e74` |
| 6. Touch | Pan and pinch done (`ad93112`); one-finger authoring on a real phone untested | |

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
  and is dropped the next time the set is written.
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

- [x] Right-clicking an image offers "Create image occlusion"
- [x] Rect, ellipse, and polygon can be drawn, moved, resized, and deleted
- [x] Shapes sharing a group produce exactly one card
- [x] Both modes render correctly on front and back — *sequential only; the other
      two surfaces are phase 5*
- [x] One fence with two labelled embeds keeps its shape sets distinct
- [x] Reordering embeds within a fence does not move masks between images
- [ ] The `{a}` label never appears as text in sequential, contextual, or spatial
      study — *sequential and contextual pinned by tests; spatial has no
      occlusion rendering yet*
- [x] The label is preserved in the source file after any render or write cycle
- [ ] Occlusion cards study correctly in all three modes
- [ ] Header, Back Extra, and Comments behave as in Anki
- [x] Renaming an occluded image rewrites the fence; line cards are handled by Obsidian
- [x] Masks stay aligned when the image is resized or given a `|300` suffix
- [x] Reopening the editor restores the existing shape set exactly
- [x] Pre-existing `osmosis-schedule` entries still load unchanged
- [ ] Shapes can be drawn and manipulated by touch on mobile — *pan and pinch
      done and confirmed; one-finger authoring on a real phone untested*
- [x] `npm run lint` and `npm test` clean

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


# Prompt — Phase 5 fix-up, rotation, and phase 6

Written 2026-08-11 at `5cc7e74`, as a standalone brief for a fresh session. It
replaces the phase 5 prompt, whose durable content now lives in "Phase 5
decisions worth remembering" above.

## Where things stand

Branch `feature/image-occlusion`, at `5cc7e74`. Work on this branch directly —
the six phases share it and there is no PR to open yet. `npm run lint`,
`npm test` (**1619 passing**), and `npm run build` are clean. `parser.test.ts`
carries wall-clock benchmarks that fail under load; re-run before investigating
a failure there.

Phase 5 shipped and was manually verified: masks now paint in contextual study,
on line-card peek, and in mind-map nodes; sequential shows every diagram in a
fence; fence cards became mind-map study targets; ratings are confined to study
mode; Anki's Header and Back Extra render and Comments was dropped. **Read
"Phase 5 decisions worth remembering" above before touching anything** — the
key shapes, why a fence node is never blanked, and why the note views ignore the
target all constrain this work.

Two defects survived that verification, and they are items 1 and 2 below.

## 1. Spatial study must ask one occlusion group at a time

**The bug.** A mind-map node holding an occlusion fence covers *every* shape
group at once and reveals them all on a single click, then takes one rating for
the lot. `surface-parts` has two cards, `-c1` and `-c2`, and the node treats
them as one.

**What it should do.** Step through the groups the way sequential study does:
cover everything, ask `c1` (its mask amber, its siblings deep purple per the
mode), reveal and rate `c1`, then reset the node to ask `c2`, and so on. The
node is not finished until its last group is rated.

**Why it is the way it is.** Phase 5 decided that the note surfaces paint every
group with no target, because a reader looking at a diagram in a note is not
answering one of its questions. That reasoning is right for reading view and for
peek, and **wrong for spatial study**, which is a card player: it has a target,
a rating, and a completion count. `applyFenceHidden` in `MindMapView.ts` paints
`all-hidden` / `all-revealed`, which by construction have no target — so the
per-group states were never reachable from that path.

**Where to work.**

- `MindMapView.applyFenceHidden` — needs a per-group notion for study mode. Peek
  should keep painting `all-hidden`: peek reveals in any order and records
  nothing, so stepping there would invent an interaction it does not have.
- `MindMapView.applySpatialState` / `handleSpatialClick` / `rateSpatialCard` —
  these currently treat one node as one unit of work. A fence node with three
  groups is three. `spatialRevealed`, `spatialRated`, and `spatialTargets` are
  all keyed by node key, and the banner's `n/m` counts keys.
- `cardIdsForFenceKey` in `src/study/spatial-study.ts` returns the fence's cards
  in order; `cardOcclusion(target, set, group)` in `card-gen/occlusion.ts` builds
  the payload for one group, and `maskElements` already paints `front`/`back`
  with a target correctly. The renderer needs no change.

**The design question to settle first, and record here.** Targets are currently
one-key-one-rating. Either the key set becomes per-card for fences (a node
appears under several keys, and the banner counts cards, which is more honest
about how much work is left), or the node keeps one key and carries its own
group cursor (fewer moving parts, but the banner under-reports). Prefer the
first unless it fights the existing key plumbing — the counts are what the
reader is pacing against.

Note this changes what a fence node's single rating means, so the phase 5
decision "a revealed node keeps its laid-out size" still applies: resetting a
node to ask the next group must not re-measure the map.

## 2. Back Extra leaks onto the front of a hidden node

**The bug.** In the mind map, a hidden occlusion node shows its Back Extra text
under the masked picture — visible in the phase 5 verification screenshot as
"Web plate carries shear; the parapet is non-structural." while the diagram was
still covered.

**The cause.** `renderOcclusion` draws Header *before* the wrapper and Back Extra
*after* it, as siblings of the wrapper, and only emits Back Extra when
`isAnswerSide(side)`. `renderOsmosisCardInto` renders the node once with
`all-revealed` — so the Back Extra element is created — and `applyFenceHidden`
then repaints only what is *inside* the wrapper. The text is outside it and
survives untouched.

**The fix** is a judgment call worth making deliberately: either keep the
render-once approach and have `applyFenceHidden` toggle the Back Extra element
alongside the masks, or have the node render with `all-hidden` first so the
element is never created until reveal. The first keeps node height stable
between the two states, which is the property the map wants. Header is correct
as-is: it shows on both sides by design.

Contextual study and sequential are unaffected — both render a genuine second
side rather than repainting one.

## 3. Rotation — shapes and annotation labels

Deferred deliberately from this round. The user asked for a rotation handle so
shapes can be tilted, and chose "shapes **and** annotation labels", which
partially reverses the phase 4 decision that a label is chrome on the picture
rather than part of it. Labels rotate; they still do not scale with the image.

**The constraint that shapes the whole job.** The mask overlay is deliberately
stretched — `viewBox="0 0 1 1"` with `preserveAspectRatio="none"` — which is
exactly what lets normalised coordinates land without measuring anything (phase
2). A plain `rotate()` inside that space is applied in the *stretched* space, so
a rotated rectangle renders as a parallelogram on any non-square image, and the
project's diagrams are wide. Three ways out, in order of preference:

1. **Aspect-compensated transform.** Rotation in pixel space is `M = S⁻¹RS` with
   `S = diag(W,H)`, giving SVG `matrix(cos, sin·a, −sin/a, cos, e, f)` where
   `a = W/H` and `e`/`f` put the origin back at the shape's centre. Needs one
   scalar, the aspect, at paint time — available from the image's
   `naturalWidth`/`naturalHeight` once it has loaded. `overlayMasks` already
   repaints any `.osmosis-occlusion` wrapper in place, so a repaint on the
   image's `load` event (`{ once: true }`, guard against loops) is cheap; paint
   with `a = 1` until then. This is the only option that is geometrically
   correct, and it keeps one coordinate contract.
2. **Rotate in normalised space and accept the shear.** Self-consistent — the
   editor and study use the same stretched space, so what you draw is what you
   get — but a rotated rect visibly skews on a 16:9 diagram. Rejected on quality
   unless option 1 proves unworkable.
3. **HTML elements with CSS `transform: rotate()`**, as annotations already use
   to dodge the stretch. True rotation with no measurement, but it cannot draw
   polygons without `clip-path`, and it splits the renderer in two.

**Storage.** `rotation?: number`, degrees clockwise about the shape's centre, on
each `OcclusionShape` variant and on `OcclusionAnnotation`; omitted when 0 so no
existing note churns. Both carriers, same round-trip tests the text fields got.

**Geometry** (`src/study/occlusion-geometry.ts`, where the arithmetic belongs and
is unit-tested):

- `containsPoint` / `hitTest` must inverse-rotate the test point about the
  shape's centre, or a rotated shape cannot be grabbed where it is drawn.
- `handleAt` / `vertexAt` / `resizeBox` are simplest kept operating on the
  *unrotated* box, with the pointer inverse-rotated on the way in — the editor
  then draws the handles rotated and everything else stays as it is.
- The rotation handle itself sits off the box's top-centre, rotated with it.
  `HANDLE_GRAB_PX = 12` is the existing tolerance; see phase 6 on touch.

**Editor.** A `rotate` drag kind beside `move`/`resize`/`vertex`, angle from the
pointer's bearing about the centre, snapping to 15° with Shift. Rotation belongs
*in* the undo history (unlike `mode` and the text fields, which are outside it).

## 4. Phase 6, and what is left of it

Phase 6 is touch, and `ad93112` landed the hard half: two-finger pan, pinch zoom,
a Pan tool, and gesture arbitration that abandons a one-finger drag when a second
finger lands. All confirmed working. What remains is a real-device pass on a
phone: whether one finger can draw and grab handles at `HANDLE_GRAB_PX = 12` (a
fingertip is nearer 40px — the tolerance may need to be pointer-type-aware, and a
rotation handle makes that more pressing), whether the modal is usable at phone
width with the toolbar wrapped to several rows, and whether the annotation input
behaves with a soft keyboard over it. `isDesktopOnly` is `false`, so this cannot
be skipped.

## Existing surface to build on

| What | Where |
|---|---|
| Parse / serialize shape sets, annotations, text fields | `src/card-gen/occlusion.ts` |
| Which masks to paint, per mode and side | `src/study/occlusion-masks.ts` |
| Image, masks, annotations, Header/Back Extra | `src/views/OcclusionRenderer.ts` |
| Sequential rendering, the reference implementation | `src/views/SequentialStudyModal.ts` — `renderOcclusionSide` |
| In-note rendering | `src/views/ContextualStudyProcessor.ts` — `renderSide` |
| Line-card chrome, peek and study | `src/views/LineRevealProcessor.ts`, `src/study/line-reveal.ts` |
| Mind-map nodes, spatial peek and study | `src/views/MindMapView.ts` — `applyFenceHidden`, `applySpatialHidden`, `applySpatialState` |
| Node/card keys, both shapes | `src/study/spatial-study.ts` |
| Editor geometry, history, the canvas modal | `src/study/occlusion-geometry.ts`, `occlusion-history.ts`, `src/views/OcclusionEditorModal.ts` |
| Mask and editor styles | `styles.css` — `.osmosis-occlusion*` |
| Obsidian stand-in for view tests | `src/test/obsidian-stub.ts` |

## Testing infrastructure

`vitest` cannot load the `obsidian` package (it ships types only, `"main": ""`),
and `vi.mock` cannot paper over it — Vite fails at package resolution first.
`src/test/obsidian-stub.ts` stands in behind an alias in `vitest.config.ts`.
**This is not a licence to move logic back into `src/views/`**: pure logic
belongs outside it, which is why `occlusion-geometry.ts` and `spatial-study.ts`
carry the arithmetic and their tests. `MindMapView.ts` cannot be imported at all,
so anything testable must leave it first.

jsdom lays nothing out, so `OcclusionEditorModal.dom.test.ts` stubs what layout
would have provided — `getBoundingClientRect`, the pointer-capture API,
`clientWidth`/`clientHeight`, `naturalWidth`/`naturalHeight`, writable scroll
offsets, and a `ResizeObserver` that delivers its first observation on `observe`.
Any new view test that needs measurement should take the same approach rather
than inventing another.

## Test plan

- Spatial study of `surface-parts` asks `c1`, takes a rating, then asks `c2` —
  and the banner's count reflects however many cards are actually left.
- A hidden node shows no Back Extra; revealing it shows it.
- Rotation round-trips through both carriers, is omitted at 0, and a rotated
  rect renders as a rectangle — not a parallelogram — on a wide image.
- A rotated shape can be grabbed, moved, and resized where it is drawn.
- Every existing occlusion test stays green; there are 1619 in the suite.

## Manual fixtures

`e2e/fixtures/occlusion.md` (phases 1–2), `occlusion-editor.md` (phase 3),
`occlusion-toolset.md` (phase 4), and `occlusion-surfaces.md` (phase 5), copied
to `vault/tests/flashcard/`. All four vault copies get dirty as soon as you test;
**reset them from `e2e/fixtures/` before each run**. `occlusion-surfaces.md`
already covers items 1 and 2 — its `surface-parts` fence has two groups and a
Back Extra. Rotation wants a fixture of its own on a deliberately wide image, so
a shear would be obvious. **Back-date every card in any new fixture** — deck
Total is `new + learn + due`, so a future-dated `review` card cannot be studied
and looks exactly like a card that failed to generate.

## Conventions

`CLAUDE.md` governs. Lint → test → build, then hand over manual test steps and
**stop** for confirmation before committing. Commit code by explicit path, never
`git add .`. This note gets its own commit, separately. Do **not** mark the note
`Done` until phase 6 has had its device pass too. On completion, update the
Progress table, fold anything durable into the decisions sections above, and
replace this prompt with one for whatever is left.
