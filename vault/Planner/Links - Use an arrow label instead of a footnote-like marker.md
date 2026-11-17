---
title: "Links - Use an arrow label instead of a footnote-like marker"
summary: "Node links are written with the label `-->` instead of `^N`, so Markdown-link vaults no longer render them as footnotes."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Toolbar - Add link button for touch]]"
status: Done
priority:
progress:
date_created: "2026-11-12T17:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-12T16:29:18.000Z"
date_start_actual: "2026-11-12T16:29:18.000Z"
date_end_scheduled: "2026-11-17T00:43:08.000Z"
date_end_actual: "2026-11-17T00:43:08.000Z"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/48
---

# Links - Use an arrow label instead of a footnote-like marker (T70)

## Request (Sawyer, 2026-11-12, verbatim)
> Our syntax for linking is rendering in Note view as a footnote instead of a link (e.g. `[^1](#^os-wqejwk)`). Let's just use plain arrows instead, like this: `[-->](#^os-wqejwk)`

## Decided (grill, 2026-11-12)
- New links use the label `-->` in both forms: wikilinks `[[Note#^id|-->]]`, Markdown links `[-->](#^id)` / `[-->](Note.md#^id)` (whichever form the vault's link setting produces today).
- **No migration and no back-compat for `^N`**: the plugin is unreleased and only Sawyer's test notes have `^N` links. Drop the numbering (`nextLinkMarker`/`linkMarker` in `src/graph3d/links.ts:186-205`) rather than keep both, unless something else depends on it; record what you remove.

## Surface map (start here)
- Writers: `src/graph3d/edit.ts`, `planSelectionLink` in `src/graph3d/selection-edit.ts` (shared by 2D and 3D), 2D `linkNodes` (MindMapView, grep -a), T65's `src/link-pick.ts`.
- Readers that recognise our links: 2D's `^N` display, 3D link lines and hints, `textLinks` in `src/graph3d/links.ts` (the ⋮ "Open link" items). Check every regex that matches `\^\d+` labels. Make sure `-->` renders sensibly in the 2D node text and 3D plates (it's plain text, not an HTML comment end in a Markdown render context — verify the Markdown renderer doesn't mangle `-->` inside link text).
- Tests: update `links.test.ts`, `edit.test.ts`, `selection-edit.test.ts` and any fixture under `e2e/fixtures/` that contains `^N` links.

## Acceptance criteria
- Linking two nodes (2D drag/Alt-drag, 3D, toolbar Add link) writes `-->` labels; Note view (reading and live preview) shows a normal link, not a footnote, in a Markdown-link vault and a wikilink vault.
- 2D, 3D lines/hints and ⋮ Open link still recognise new links.

## Context budget
Under ~130k. links.ts, edit.ts, selection-edit.ts, link-pick.ts by range; MindMapView.ts grep -a only.

## Conventions
- Batch ticket (round 9). Follow `batch/subagent-brief.md`: own branch stacked on the previous ticket, code commit by path + separate note commit, `status: In-Review`, "Batch implementation notes (awaiting manual test)" section with phone/desktop retest steps. No push, no PR.
- Keys in map views need the view `Scope` (memory: mind map keys need the view Scope). Toolbar buttons come from `TOOLBAR_GROUPS` in `src/views/ToolRibbon.ts`.
- Pure logic goes in modules outside `src/views/` so Vitest can import it (Vitest cannot import `obsidian`).
- `src/views/MindMapView.ts` is ~84k tokens with NUL bytes: never read it whole, use `grep -a -n` and read ranges. Graph3DScene.ts (~37k), Graph3DView.ts (~30k), styles.css (~33k): ranges only.

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

**Code commit:** c624569 on `feature/link-arrow-label`.

### Approach
Every node link goes through one of two calls into `fileManager.generateMarkdownLink(…, alias)`: 3D's single-link path in `Graph3DView` (~line 1079) and `planSelectionLink`. That second one is shared by 2D `linkNodes` (drag, Alt-drag, toolbar Add link through `link-pick.ts`) and 3D `linkSelection`. Both now pass the constant `LINK_LABEL = "-->"` from `src/graph3d/links.ts`. Obsidian writes the link in the vault's own style: `[[Note#^id|-->]]` or `[-->](Note.md#^id)` / `[-->](#^id)`.

### What was removed
- `nextLinkMarker` and `linkMarker` (`src/graph3d/links.ts`) and their tests. Nothing else used them.
- The per-note marker counter in `planSelectionLink`.
- There is no migration and no `^N` back-compat, as decided. Existing `^N` links are still ordinary links, so they keep working as links, but nothing renumbers them.

### Readers checked
- No code matched `^N` labels except `nextLinkMarker`. 2D and 3D link lines/hints come from the link target (metadata cache), not the label, so they are unaffected.
- `textLinks` (⋮ "Open link") is label-agnostic. A new test shows it recognises `-->` in both link styles.
- `spriteLabel` (3D plate text) collapses the link to `-->`. A new test covers this.
- Several card/fence regexes strip `<!--.*?-->`. They only act when `<!--` comes earlier on the same line. The `osmosis-cloze` marker regexes are anchored to a trailing `osmosis-cloze` token. So a `-->` label cannot be mistaken for a comment end unless a line already holds an unclosed `<!--`. That case is unlikely, and I did not guard against it.

### Decisions worth remembering
- I kept `planSelectionLink`'s `linkText(fromPath, subpath, alias)` signature and passed the constant, rather than dropping the parameter. This kept the diff small and leaves the label choice in the pure module.
- In CommonMark, `-->` in link text is plain text: an HTML comment needs a `<!--` opener. So `[-->](#^id)` should render as a link. **Not verified in Obsidian** (I can't see it), so check it in both reading view and live preview.

### Surface map
| File | Change |
|---|---|
| `src/graph3d/links.ts` | `nextLinkMarker`/`linkMarker` replaced by `LINK_LABEL = "-->"` |
| `src/graph3d/selection-edit.ts` | uses `LINK_LABEL`; marker counter removed |
| `src/views/Graph3DView.ts` | 3D single link uses `LINK_LABEL` |
| `src/graph3d/links.test.ts` | marker tests removed; `textLinks` arrow-label test |
| `src/graph3d/selection-edit.test.ts` | numbering test now expects `-->` |
| `src/graph3d/appearance.test.ts` | `spriteLabel` arrow-label test |

### Fixture
None changed: no fixture contained `^N` links. Use any `vault/tests/graph3d/` sailing note.

### Manual retest (desktop and phone)
1. In a wikilink vault, open a sailing note in the 2D mind map. Alt-drag one node onto another. The source line ends with `[[Note#^id|-->]]`. The link line still draws.
2. On phone, use the toolbar Add link: select a node, tap Add link, then tap the target. The result is the same.
3. In 3D, link two nodes with both the single link and a selection link. The plate text shows `-->`, the link line/hint appears, and ⋮ lists `Open link "-->"`, which opens the target.
4. Switch Settings → Files and links → "Use [[Wikilinks]]" off and repeat one link. The text is `[-->](Note.md#^id)`, or `[-->](#^id)` in the same note. Open the note in reading view and in live preview. It shows a normal clickable `-->` link, not a footnote.

### Lint / tests / build
`npm run lint` clean. `npx vitest run --maxWorkers=2`: 125 files, 3186 tests passed. `npm run build` OK.
