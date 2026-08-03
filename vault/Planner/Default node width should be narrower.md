---
title: Default node width should be narrower
summary: which in-turn encourages more concise mind-mapping
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-03T15:09:11.422Z
date_modified: 2026-08-03T23:22:53.374Z
date_start_scheduled:
date_start_actual: 2026-08-03
date_end_scheduled:
date_end_actual: 2026-08-03
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
parent:
children:
blocked_by:
cover:
color:
---

# Optimization

## What tool or process needs improvement?

Mind map node sizing — the maximum width a node grows to before its text wraps.

## What's slow or frustrating about it?

The default max node width was 300px, hardcoded in `DEFAULT_LAYOUT_CONFIG`. Wide
nodes swallow long sentences on a single line, which quietly encourages writing
paragraphs into nodes instead of short topics. There was also no way to change
the default globally — only per-map, via the properties sidebar's "Max width"
slider, on every map individually.

## What would "better" look like?

A narrower default that nudges toward concise nodes, and a global setting so the
default is a preference rather than a constant.

## Resolution

Shipped in `536230b` on `release/0.0.4`.

- Default max node width: **300 → 230px** (`DEFAULT_LAYOUT_CONFIG.maxNodeWidth`
  in `src/layout.ts`).
- New global setting `defaultMaxNodeWidth`, surfaced as a **Max node width**
  slider (100–800px, step 10) in Settings > Osmosis, under "Branch line style".
- Changing it re-measures and re-renders open maps immediately, via
  `OsmosisPlugin.remeasureOpenMindMaps()` → `MindMapView.remeasureAndRender()`.
  The refresh hangs off the plugin rather than `settings.ts` importing
  `MindMapView`, which would have created a value-level import cycle.
- The properties sidebar's per-map "Max width" slider now defaults to, and
  resets against, the global setting instead of a hardcoded 300.

Precedence is unchanged in shape: per-node width override → per-map
`maxNodeWidth` frontmatter → theme → global setting.

### Known sharp edge

Dragging the per-map slider to exactly the global value deletes the frontmatter
key rather than pinning it, so that map then follows future changes to the
global default. There is currently no way to pin a map at a value that happens
to equal the global default. Worth a follow-up task if it ever bites.

### Files touched

| File | Change |
|---|---|
| `src/layout.ts` | Default `maxNodeWidth` 300 → 230 |
| `src/settings.ts` | `defaultMaxNodeWidth` setting + slider + refresh hook |
| `src/main.ts` | `remeasureOpenMindMaps()` |
| `src/views/MindMapView.ts` | `remeasureAndRender()`; resolves global fallback |
| `src/views/PropertiesSidebarView.ts` | Per-map slider defaults to global setting |
| `docs/mind-mapping/styling.md` | `maxNodeWidth` default column |

