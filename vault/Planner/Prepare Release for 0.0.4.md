---
title: Prepare Release for 0.0.4
summary: Prepare release for publishing version 0.0.4
tags:
  - task
calendar:
  - Documentation
context:
people:
location:
related:
status: In-Progress
priority:
progress_current:
progress_total:
date_created: 2026-08-14T06:09:46.812Z
date_modified: 2026-08-17T13:51:10.000Z
date_start_scheduled: 2026-08-17T13:51:10.000Z
date_start_actual: 2026-08-17T13:51:10.000Z
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
---

## Description of the Documentation Request

*Provide a clear and concise description of what documentation is missing, incorrect, or needs improvement.*

- [ ] Create/Remove/Update Documentation to reflect all changes made to the release branch. 
	- [ ] Create screenshots/screen recordings where needed
- [ ] Update README to reflect changes
- [x] Address feedback from branch code review from Community Plugins listing and commit changes.
	- [x] CSS lint — see [What was implemented: CSS lint](#what-was-implemented-css-lint)

## Target Audience

*Who is this documentation for? (e.g., First-time users, Advanced developers, Contributors, System Admins)*



## Existing Material or Context

*Link to existing pages in this repository, external resources, or past discussions/issues that provide context for this request.* 

- Link to relevant doc: [Link text](URL)
- Related issue or PR: # 

## Proposed Content / Outline

*If you have ideas on what the new structure should look like, sketch out a brief outline or bullet points here.* 



## Additional Information

*Add any other context, code snippets, or screenshots about the documentation request here.*

### Feedback from Obsidian Automated Review

#### CSS lint

- **Warning**: Unexpected browser feature "css-display-contents" is only partially supported by Obsidian 1.11.4
  - styles.css:589
- **Warning**: Unexpected browser feature "multicolumn" is only partially supported by Obsidian 1.11.4
  - styles.css:3225, styles.css:3226, styles.css:3231
- **Warning**: Unexpected duplicate "align-items"
  - styles.css:3731
- **Warning**: Unexpected duplicate "justify-content"
  - styles.css:3733
- **Warning**: Avoid !important — override styles by increasing selector specificity or using CSS variables instead.
  - styles.css:185, styles.css:238, styles.css:239, styles.css:240, styles.css:246, styles.css:247, styles.css:248, styles.css:265, styles.css:427, styles.css:441, styles.css:442, styles.css:461, styles.css:462, styles.css:468, styles.css:1183
- **Warning**: Avoid :has — it can cause significant performance issues due to broad selector invalidation.
  - styles.css:3299

## What was implemented: CSS lint

**Where it shipped** — [PR #31](https://github.com/SawyerRensel/Osmosis/pull/31), branch `fix/css-lint-warnings` into `release/0.0.4`. Five of the six findings are fixed; multi-column is a deliberate keep.

### The cause

The fifteen `!important` declarations were three different problems wearing one hat, and only the first of them actually needed a hammer:

- **Inline theme styles.** `drawNode` wrote a node's resolved border straight onto the shape element as `stroke` / `stroke-width` / `stroke-dasharray`. An inline declaration outranks every selector, so the selection and cursor-sync highlights genuinely could not be shown on a themed node by any other means.
- **Rules that were merely losing a specificity contest.** The CodeMirror overlay rules and the `.osmosis-hidden` utility were each one class short of the rules they had to beat — CodeMirror's injected theme, Obsidian's editor chrome, and whichever component set its own `display`.
- **Rules that never needed it at all.** `.osmosis-dragging` lands on the *same element* as `.osmosis-mindmap-container`, so it only ever had to win on source order — the comment claiming it held the cursor across descendants was wrong, since `cursor` on an ancestor does not override a descendant's own. The copy-button rule was simply not spelling out the ancestry Obsidian's reveal rule uses.

`display: contents` was covering for a DOM shape: Obsidian builds a setting row's description as a *grandchild*, inside `.setting-item-info` beside the name, and a grandchild cannot be given a grid area — so the wrapper was dissolved to promote both children into the row's grid.

### The fix

The theme's border now travels as custom properties (`--osmosis-node-stroke`, `--osmosis-node-stroke-width`, `--osmosis-node-dash`) that styles.css reads back through `var()`. A custom property feeds the cascade instead of short-circuiting it, so ordinary selectors can outrank a theme again. The other two groups became a repeated class in the selector (`.osmosis-edit-overlay.osmosis-edit-overlay .cm-line`) — the same elements, one class heavier — and, for the two that needed nothing, a corrected comment.

`sidebarSetting()` wraps `new Setting()` and moves `descEl` onto the row, so the description is a direct grid child and `display: contents` is unnecessary. `calendarHeatmap` marks its own plot `.osmosis-stats-plot-scrolls` instead of styles.css finding it with `:has()`. The `safe center` fallbacks came out.

### Decisions worth remembering

- **Multi-column stays on the stats grid.** Obsidian's Chromium supports it fully; caniuse's "partial" flag is about fragmentation edge cases the dashboard does not rely on. Grid was the alternative and it cannot do this: row height comes from the tallest panel in the row, and no alignment property reclaims the dead space beside a short one. Seventeen panels of unequal height is exactly the case multi-column exists for. If a reviewer presses, this is the reply — not a change.
- **A themed border still outranks the transclusion-state borders.** Once the theme stopped being inline, the unresolved / cyclic / transcluded rules would have started beating it. They now read the same custom properties with their own colours as fallbacks, which preserves the old precedence exactly. Worth knowing that this *is* a pre-existing wart — a theme silently hides those indicators — but fixing it was out of scope here. See [[Ideas]] if it comes up.
- **Selection and cursor sync moved to the bottom of the node rules.** They have to outrank every state above them and they no longer have `!important` to do it, so their position in the file is now load-bearing. Anything added below them will beat them.
- **The repeated-class idiom is deliberate**, not a typo to tidy away. It is the mechanism Obsidian's own lint recommends ("increase selector specificity"), and unwinding it brings the `!important`s back.

### Surface map

| File | Change |
|---|---|
| `styles.css` | Node border reads custom properties; selection/cursor-sync relocated below the state rules; repeated-class specificity on the overlay and `.osmosis-hidden`; sidebar info wrapper is a grid cell; `:has()` and the `safe center` fallbacks removed |
| `src/views/MindMapView.ts` | `drawNode` writes the resolved border as custom properties |
| `src/views/PropertiesSidebarView.ts` | `sidebarSetting()` helper; 44 sidebar call sites use it, the 7 modal ones do not |
| `src/stats/charts.ts` | `calendarHeatmap` marks its plot as the scrolling one |

### Test fixture

No new fixtures — the change is presentational and the existing ones cover it: `vault/tests/mindmap/frontmatter-styles.md` (themed borders vs selection), `seam-transit-map.md` and `seam-cycle-a.md` (transclusion states), `heading-typography.md` and `edit-overlay-zoom.md` (overlay typography), `code-blocks.md` (copy button), `vault/tests/flashcard/occlusion-editor.md` (stage centring).

### Follow-ups

None filed. The one candidate — letting the transclusion-state borders win over a theme — is a behaviour change, not a defect in this work.