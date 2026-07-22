# Feature Plan: Notes as Flashcards

**Branch**: `feature/notes-as-flashcards` (from `release/0.0.2`)
**Created**: 2026-07-12
**Status**: In progress — tasks 1–9 shipped and manually verified; task 10 (docs + PRD) in review; task 11 (transclusion × study) awaiting design sign-off

---

## Goal

Truly support "**Notes as Flashcards**": every line of an opted-in note can be
studied as its own FSRS-scheduled card, with no extra flashcard authoring.
Study proceeds line-by-line ("reveal the next line") in either Note View
(reading view) or Mind Map View. This also gives every node a stable anchor
for mind-map styling data.

---

## Decisions (agreed 2026-07-12)

| Question | Decision |
|---|---|
| Line ID syntax | **Native Obsidian block IDs** — `^os-a1b2c3` appended to the line. Obsidian hides them in reading view natively and they enable `[[note#^os-a1b2c3]]` deep-links. If a line already has a user block ID, **reuse it** instead of adding a second one. |
| Card model | **One card per line.** Every eligible line is its own FSRS-scheduled card. Front = ancestor path (breadcrumb of parent nodes), back = the line itself. |
| Dashboard / decks | **Included with opt-out.** Line cards count in deck totals and are studiable in the sequential modal. Opt-out via per-note frontmatter flag and a global setting. |
| Scheduling + styling data storage | **In-note frontmatter** (revised 2026-07-12, supersedes the earlier sidecar decision). Scheduling lives in a new `osmosis-schedule` frontmatter key; styling reuses the existing `osmosis-styles` key with `^os-` block-ID selectors. No sidecar files — everything travels with the note. |

---

## Design

### 1. Block IDs (`^os-xxxxxx`)

- Format: `^os-` + 6 lowercase base36 chars (letters/digits/dashes only — valid
  Obsidian block ID charset). Distinct prefix marks them as Osmosis-generated.
- Appended at end of line, space-separated: `- Burr grinders give a uniform grind ^os-a1b2c3`
- If the line already carries a block ID (`^anything`), reuse it as the card ID
  — do not add a second one (Obsidian allows one block ID per block).
- Parser must strip trailing block IDs from node label text (mind map and cards
  must never display them).
- ~~**Verify during implementation**: block IDs on heading lines~~
  **Verified 2026-07-12**: Obsidian hides `^os-` IDs on headings, bullets,
  and paragraphs in reading view; `[[note#^id]]` links resolve.
- **Multi-line blocks** (decided 2026-07-12): code blocks and tables are
  single mind-map nodes, so per-line IDs inside them make no sense.
  - *Osmosis fences*: identity via the existing `id:` metadata key
    (explicit.ts already parses it) — the generate command inserts
    `id: os-xxxxxx` when missing.
  - *Generic code blocks and tables*: a standalone `^os-xxxxxx` line
    immediately after the block — Obsidian's native way to block-reference
    multi-line blocks (hidden in reading view). The parser attaches a
    standalone block-ID line to the preceding node instead of emitting a
    stray paragraph node.

### 2. "Generate flashcards from note" command

- Command palette: `Osmosis: Generate flashcards from note` (also in the
  note's More Options menu).
- Flow: parse note → list eligible lines lacking an ID → **confirmation modal**
  showing what will change (N lines will get IDs, preview list, exclusions
  honored) → on confirm, write IDs in a single `vault.process` edit.
- Eligible lines = the same elements that become mind map nodes: headings,
  bullet items, numbered items, paragraphs. Skipped: frontmatter, code fences
  (incl. `osmosis` fences — already cards), blank lines, elements under
  `<!-- osmosis-exclude -->`.
- Note must be opted in (`osmosis: true`) — the command offers to add it if
  missing.
- Re-running the command is incremental: only tags new/untagged lines.
- Undo-friendly: single editor transaction where possible.

### 3. Frontmatter schedule store (`osmosis-schedule`)

- New frontmatter key, written lazily — only when the first review happens,
  not at ID-generation time.
- Plain nested YAML, one readable object per card, keyed by block ID:

  ```yaml
  ---
  osmosis-cards: true
  osmosis-schedule:
    os-a1b2c3:
      due: 2026-07-15T10:30:00
      stability: 4.2
      difficulty: 5.1
      lastReview: 2026-07-08T09:12:00
      reps: 3
      lapses: 0
      state: review
      learningSteps: 0
  ---
  ```
- **Why plain YAML, not a compact encoding**: frontmatter is hidden in
  reading view and collapsed to the Properties UI in live preview, so size
  only shows in source view — where readability is the point (decided
  2026-07-12). Timestamps stored as ISO 8601 local datetimes for
  human-readable source view (note: diverges from FenceWriter's epoch ms;
  the parse/serialize module owns the conversion, unit-tested).
- All writes go through Obsidian's `FileManager.processFrontMatter()` —
  atomic and YAML-safe, no raw string surgery (unlike FenceWriter).
- **Write coalescing**: ratings are applied to the in-memory CardStore
  immediately, and frontmatter flushes are debounced (~2s) plus forced at
  study-session end and plugin unload. This avoids re-rendering the note on
  every rating while the user is contextually studying that same note, and
  keeps file-mtime/sync churn low.
- Properties panel (live preview) shows nested frontmatter as a
  non-editable "unsupported" property — same as the existing
  `osmosis-styles` key, so no new precedent. Hidden in reading view.
- No rename/delete tracking needed — the data travels with the note.
  Soft-deleted (orphaned) card entries stay in `osmosis-schedule` until the
  cleanup command removes them.

### 4. Card generation & identity

- New card source in `card-gen`: **line cards**. Identity =
  `notePath + blockId` — stable across edits, reorders, and content tweaks
  (the block ID travels with the line).
- Only lines that carry an ID become cards (i.e., the command is the opt-in
  trigger — untagged lines never generate cards).
- Deck assignment: same resolution as existing cards (tags / folders /
  `osmosis-deck` frontmatter / branch).
- A line containing `==cloze==` / `**bold**` cloze targets: existing cloze
  cards continue to be generated; the line card and cloze cards coexist
  (revisit if double-scheduling feels noisy — candidate setting).
- Orphaning: ID deleted from note → soft-delete (schedule entry preserved in
  `osmosis-schedule`); ID re-appears → re-link.

### 5. Study modes

- **Contextual (Note View)** (revised 2026-07-14 during task 7 review):
  reading view stays a normal reading surface by default — nothing hidden,
  block IDs invisible as usual. On notes with line cards, two header
  actions appear in reading mode, left of the reading/edit toggle:
  - *Peek mode* (`eye-dashed` icon): hides every line-card line
    (`░░░░░░`); click any placeholder to reveal it, any order, nothing
    recorded. Toggle off to return to normal reading.
  - *Study mode* (`graduation-cap` icon — same convention as Mind Map
    View): hides only lines whose card is **due or new** (scheduling
    decides, mirroring spatial mode's due-only hiding); reveal is
    top-down one line at a time; after each reveal the rating bubble
    appears below the line and must be answered before the next line
    unlocks. Floating pill shows progress ("4/9 rated") + Stop;
    completion toast; schedule writes flush at session end. If nothing
    is due, the button notices instead of entering.
  ~~Original design ("Start studying" button in-note, all lines hidden by
  default with casual peek)~~ superseded: default reading must stay
  readable, and study should follow FSRS scheduling.
- **Spatial (Mind Map View)** (design settled 2026-07-12): entering study
  mode hides **only nodes with due line cards** — the rest of the map stays
  fully expanded, because spatial context (seeing how information fits
  together) is the point. Hidden nodes keep the "?" placeholder box
  (existence/shape visible by design — no subtree collapsing). Tapping a
  hidden node reveals it and shows a **rating bubble** (Again/Hard/Good/Easy,
  keys 1–4) anchored to the node. The current silent auto-"Good" rating is
  removed. Progress widget ("4/9 due reviewed") + completion toast; map
  stays open afterward. Branch-scoped study ("Study this branch") composes
  with this.
- **Sequential (modal)**: front renders the ancestor breadcrumb
  (`Coffee Brewing › Pour Over › ?`) plus up to N immediately
  preceding siblings for context (default N=2, setting); back reveals the
  line. Review-log mode tags (`contextual`/`sequential`/`spatial`) apply as
  usual. *(Shipped note: no review-log store exists, so mode tags are
  currently a no-op — flagged and accepted during task 6.)*

### 6. Dashboard & opt-out

- Line cards count toward New/Learn/Due in the sidebar dashboard.
- Opt-out:
  - Per-note frontmatter: `osmosis-line-cards: false` (cards stay studiable
    in-place but excluded from decks/sequential).
  - Global setting: "Include line cards in decks" (default on).

### 7. Styling anchor (secondary win)

- Style selectors gain a block-ID form: `^os-a1b2c3` alongside the existing
  tree-path and `_n:` hash selectors in the existing `osmosis-styles.styles`
  frontmatter map — no new storage. The panel/GUI prefers block IDs when the
  node has one (they survive renames and reorders, unlike tree paths, and
  are user-visible/linkable, unlike `_n:` hashes).

---

## Task Breakdown

1. ✅ **Block ID plumbing** — parser strips/records trailing block IDs; ID
   generator (`os-` base36); unit tests. (S)
2. ✅ **Generate command + confirmation modal** — eligibility scan, preview
   modal, single-transaction write, incremental re-run. Includes multi-line
   block handling: `id:` metadata into osmosis fences, standalone after-block
   IDs for generic code blocks/tables (+ parser attach support). (M)
3. ✅ **Frontmatter schedule store** — typed parse/serialize of the
   `osmosis-schedule` YAML (unit-tested, incl. ISO↔epoch conversion),
   `processFrontMatter` read/write, debounced flush + session-end/unload
   flush lifecycle. (M)
4. ✅ **Line-card generation** — new card source, identity, deck assignment,
   orphan/soft-delete/re-link, CardStore integration. (M)
5. ✅ **Dashboard + opt-out** — counts, frontmatter flag, global setting. (S)
6. ✅ **Sequential study support** — ancestor-breadcrumb front, preceding-sibling
   context, review tagging. (M)
7. ✅ **Contextual progressive-reveal study** — reading-view line hiding,
   top-down reveal flow, rating bubble, progress widget. (L)
8. ✅ **Spatial integration** — replace today's skeleton (hide-everything +
   silent hardcoded "Good" rating + fuzzy node→card matching,
   MindMapView.ts `rateSpatialNode`/`recordSpatialReview`): due-only hiding,
   map nodes matched to line cards exactly via block ID, **rating bubble**
   (Again/Hard/Good/Easy, keys 1–4) after each reveal, progress widget +
   completion toast. (L — grown from M after reviewing current
   implementation)
9. ✅ **Style selectors via block ID** — resolution + format panel preference. (S)
10. **Docs + PRD update** — document feature; also fix stale PRD storage
    section (cards.db → in-memory CardStore + fence metadata +
    `osmosis-schedule` frontmatter). (S)
11. ✅ **Transcluded maps × study/peek modes** *(design signed off and
    implemented 2026-07-15)*. Transcluded line cards are studiable/peekable
    on the host map. Design decisions (all approved):
    - Spatial session keying moved from bare block ID to **card key** = the
      line card's ID (`${notePath}#^${blockId}`) via `nodeCardKey()`:
      transcluded nodes key against `sourceFile`, local nodes against the
      host — collision-safe, churn-proofing preserved (still never keyed by
      layout node ID). `mapCards()` gathers host + transcluded source cards
      from the vault-wide CardStore.
    - Ratings route via the card's own `notePath` (`rateSpatialCard` passes
      the card key straight to `recordReview`) — schedules land in the note
      that owns the line. Source-note flushes can't re-render the host map
      (the vault-modify handler only reloads `currentFile`).
    - Sources without cards stay visible as context; `osmosis-line-cards:
      false` sources remain studiable in place (opt-out is deck-only —
      confirmed by Sawyer).
    - Reading-view embeds stay **out of scope** (already skipped via
      `.internal-embed`): per-note state would entangle host embeds with the
      source's own view, partial embeds break reveal order, no header entry
      point. Possible follow-up: peek-only inside embeds (see Open Items).
    - Duplicate embeds share one card key: reveal together, rated once;
      the rating bubble anchors to the clicked instance.
    - Fixed en route (root cause of duplicate/chain bugs found in manual
      testing): `TransclusionResolver` spliced **cached, shared node
      objects** into host trees and mutated them in place. Now each embed
      instance deep-clones the parsed subtree with instance-unique node ids
      (`<parser id>~<embed-site id>`), so cached trees stay pristine, chains
      attribute `sourceFile` correctly in every copy, and duplicate embeds
      are independent nodes (also fixed selection jumping between copies).
    - Bonus (Sawyer request): **Expand transclusions** setting (default on)
      — embedded branches load expanded; off restores lazy collapse.
    Fixtures: `transclusion-study-{host,source,optout,plain,deep}.md`. (L)

12. **Granular add / remove / disable of line cards** *(design signed off
    2026-07-21)* — see §8. Add or remove line-card IDs by editor selection or
    by mind-map node, and disable/enable individual cards (schedule kept,
    fully out of study). (L)

Each task follows the standard loop: implement → `npm run lint` →
`npm run test` → `npm run build` → manual test instructions → user confirms →
commit.

---

## Design — §8: Granular add / remove / disable (task 12)

The bulk "Generate flashcards from note" command is all-or-nothing. This adds
per-element control: opt individual lines in/out after the fact, and pause a
card without losing its history.

### Three actions

- **Add** — tag the selected lines (or the selected map node) with block IDs,
  exactly as the bulk command does per element: trailing `^os-xxxxxx` on
  headings/bullets/ordered/paragraphs, standalone after-block IDs on
  code/table/blockquote, `id:` metadata on osmosis fences. Reuses
  `planIdGeneration`, scoped to a line range. A selection is explicit intent,
  so **no confirmation modal** — one undoable edit + a "N cards added" notice.
- **Remove** — strip the block ID from the selected lines / node. The existing
  orphan flow soft-deletes the schedule entry (kept in `osmosis-schedule`
  until cleanup). **Decision (2026-07-21): remove deletes user-created block
  IDs too**, not just `^os-` ones — with a confirmation warning whenever the
  selection contains non-`os-` IDs, since that can break existing
  `[[note#^id]]` links. Consequence: **remove → re-add mints a fresh ID, so
  the card starts over** (old schedule stays orphaned). Remove is the "start
  over" action; disable is the "pause" action.
- **Disable / Enable** — a `disabled: true` field on the card's
  `osmosis-schedule` entry (a stub entry is written if the card was never
  studied). A disabled card is **fully out**: not hidden by peek or study in
  note view or mind map, skipped by the sequential queue, and dropped from
  dashboard New/Learn/Due counts — exact parity with fence-card `exclude:`,
  but enable restores full FSRS history. Re-running the bulk generate command
  leaves disabled cards alone (their lines already carry IDs).

### Storage — `disabled` on the schedule entry (§3 extension)

`osmosis-schedule` entries gain an optional `disabled: true`. It coexists with
schedule fields:

```yaml
osmosis-schedule:
  os-a1b2c3:          # never studied, paused
    disabled: true
  os-d4e5f6:          # studied, then paused — history preserved
    due: 2026-07-25T10:30:00
    stability: 4.2
    ...
    disabled: true
```

`disabled` and the FSRS schedule are **independent dimensions** of the same
entry. `ScheduleStore` stages them separately (`pendingSchedule` +
`pendingDisabled`) and `applyScheduleEntries` **merges** into the existing
entry object so a rating flush never wipes `disabled`, and a disable flush
never wipes the schedule. `parseDisabledFrontmatter` reads the flag even for
schedule-less stubs (which `parseScheduleFrontmatter` skips, since they have
no `due`). `Card` gains `disabled?: boolean`, populated by `CardSyncService`
from the parsed set (overlaid with pending, like schedules).

### Where "fully out" is enforced (two chokepoints)

- `study/spatial-study.ts` — `isLineCard()` returns false for disabled cards,
  so **all four** peek/study filter functions (note view + mind map, peek +
  due-only) drop them in one place.
- `store/CardStore.ts` — the same guard that skips `excludeFromDecks` now also
  skips `disabled`, so the sequential queue (`buildQueue` → `getDue/NewCards`)
  and dashboard counts exclude them.

### Entry points (decided 2026-07-21)

- **Editor selection** — context-menu items + command-palette commands for
  add / remove / disable / enable on the selected lines (no selection = current
  line). Add scopes `planIdGeneration` to the range and writes via one editor
  transaction; remove strips IDs (confirm modal on user IDs); disable/enable
  resolve the line cards on those lines and flip the flag.
- **Mind-map node** — the same four items in the node context menu, routed
  through `getNodeFile(src)` + `src.range` (works for transcluded nodes: their
  range/file resolve to the source note) and the node's card key.
- **Sequential modal** — the existing eye-off "Exclude card" button (key `e`)
  writes `disabled` through the schedule store for line cards instead of
  FenceWriter's `exclude:` (fence cards keep the old path); undo reverses.

Not doing: a disable affordance on the spatial/contextual rating bubble.
Terminology: UI says "Exclude/Include" (matching the sequential button and
fence `exclude:`); data/field is `disabled`.

### Multi-line prose → one card per line (decided 2026-07-21)

A run of consecutive prose lines with no blank line between them is **one
Obsidian block**, so only its last line could carry a valid `^id` — the parser
(line-oriented) showed three mind-map nodes but only one became a card.
Resolved by aligning the generator with the mind map's existing save
behavior: both now run a shared **`normalizeBlockSpacing`** (extracted from
`MindMapView.normalizeHeadingSpacing`) that separates prose runs into
blank-line-separated blocks. Result: one line = one block = one card = one
block ID, everywhere. The lever to merge lines into a single card is to remove
the blank line between them; to split, add one. `planIdGeneration` normalizes
first and remaps any selection range across the inserted blanks. Consequence:
"Add line cards" and bulk "Generate flashcards" now normalize spacing
note-wide (same as the map does on any edit). `normalizeBlockSpacing` passes
frontmatter and standalone block-ID lines through untouched.

---

## Open Items / Risks

- ~~**Heading block IDs**~~ **Resolved 2026-07-12**: Obsidian hides `^os-`
  IDs on headings, bullets, and paragraphs in reading view (see §1).
- **Live preview appearance**: block IDs are visible (dimmed) in live preview.
  Acceptable per native-block-ID decision; optional cosmetic dimming later.
- **Cloze + line card coexistence** (§4): watch for double-scheduling noise
  during manual testing.
- ~~**Spatial mode & due dates**~~ **Resolved 2026-07-12**: due-only hiding;
  full map stays expanded with "?" placeholders on hidden nodes (see §5).
- ~~**Frontmatter write vs. open views**~~ **Resolved 2026-07-15** —
  verified in both surfaces: reading view keeps reveal state (per-note state
  keyed by block ID survives re-renders), and the mind map's vault-modify
  handler skips reloads while `scheduleStore.isWriting(path)`, so a
  mid-session debounced flush neither flickers nor resets spatial state
  (which is also re-applied idempotently after every render/cull pass).
- **Comment-only lines render as empty mind map nodes**: the parser emits a
  paragraph node for HTML-comment-only lines (e.g. `<!-- osmosis-exclude -->`),
  which shows as a blank box in the map (seen 2026-07-12 in the
  generate-flashcards fixture). Pre-existing; parser or map should skip
  comment-only paragraphs. Small follow-up, not blocking.
- **Fence schedule storage divergence**: fence cards keep FenceWriter inline
  persistence; line cards use `osmosis-schedule` frontmatter. Consolidating
  fence schedules into frontmatter is a natural follow-up (would also let
  FenceWriter's raw string surgery be retired), not in scope here.
- **Contextual study inside reading-view embeds** (from task 11, 2026-07-15):
  deliberately out of scope — `LineRevealProcessor` skips `.internal-embed`
  sections. If ever wanted, start with peek-only inside embeds (no ratings);
  full study needs a per-(view, note) state model, partial-embed reveal
  ordering, and a new UI entry point. Sawyer expressed interest but has not
  committed to it.
- **Legacy `_n:` style selectors on transcluded nodes** no longer match
  (task 11's instance-unique node ids). Block-ID and tree-path selectors are
  unaffected, and the format panel has preferred block-ID selectors since
  task 9. Accepted trade-off.
