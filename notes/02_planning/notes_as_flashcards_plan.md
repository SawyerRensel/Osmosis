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
11. **Transcluded maps × study/peek modes** *(added 2026-07-15 — new scope,
    design-first: investigate, propose a design, and get sign-off BEFORE
    implementing)*. Today transcluded nodes are deliberately excluded
    everywhere: `generateLineCards` skips `isTranscluded` nodes,
    `collectSubtreeBlockIds` skips them, and spatial study only loads cards
    for the host note. The design must answer:
    - Should transcluded line cards be studiable/peekable in the HOST map's
      spatial mode? (Inclination: yes — the natural reading of "study this
      map" — but lay out the tradeoffs.)
    - Ratings must write to the SOURCE note's `osmosis-schedule`
      (ScheduleStore is keyed by file path), never the host's. Card identity
      is already `${sourcePath}#^${blockId}` — verify this makes it natural.
    - Block-ID matching must become collision-safe: the same blockId string
      can legitimately exist in both host and source files, so pure-blockId
      session keying (task 8 design) needs a (path, blockId) notion for
      transcluded content — without regressing the churn-proofing that
      motivated blockId keying.
    - What happens in peek/study when the transcluded source note has
      `osmosis-line-cards: false`, or block IDs were never generated there?
    - Reading view: Obsidian renders `![[embeds]]` separately — check how
      LineRevealProcessor interacts with embedded content and decide whether
      contextual study should touch embeds at all (out-of-scope is an
      acceptable answer if justified).
    - Edge cases: transclusion cycles (fixtures transclusion-cycle-a/b),
      chains (transclusion-chain-a/b), the same note transcluded twice in
      one map.
    Test with fixtures building on the existing `transclusion-*.md` ones. (L)

Each task follows the standard loop: implement → `npm run lint` →
`npm run test` → `npm run build` → manual test instructions → user confirms →
commit.

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
