---
title: Osmosis Dashboard
summary: Improve the current Osmosis dashboard panel to include Anki's additional three main operators from the main app menu - 'Add', 'Browse', 'Stats'
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
date_created: 2026-08-06T16:49:38.893Z
date_modified: 2026-08-06T20:49:44.234Z
date_start_scheduled:
date_start_actual:
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
  - "[[Create Card Browser - Editor]]"
  - "[[Develop Image Occlusion System for Flaschards]]"
  - "[[Osmosis stats dashboard]]"
  - "[[Review log storage]]"
blocked_by:
cover:
color:
---
# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

This is a major, multi-part feature milestone comprised of individual subtasks. 

- Improve the current Osmosis dashboard panel to include Anki's additional three main operators from the main app menu - 'Add', 'Browse', 'Stats'.  'Sync' is irrelevant because cards are synced through Obsidian Sync or the user's personal drive setups.  We've already made 'Decks' in the dashboard. 

![](Pasted%20image%2020260806165224.png)

- Let's also remove the mind map button from the Obsidian toolbar, then replace the graduation-cap icon with the brain-circuit icon for the dashboard.  This button will open the Osmosis Hub in the left panel.  The split-view mind map button is redundant and deprecated because we can activate a mind map from the top-right of any note, which is more convenient and intuitive.

![62](Pasted%20image%2020260806165740.png)

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

The current Osmosis dashboard shows a list of decks, but there's currently no way to create cards, browse cards, or review your studying statistics.  

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*

 - Browsing cards: I have to start studying a deck, wait until my desired card appears, then click the reveal card in note button.  
 - Image occlusion system: Currently unsupported.
 - Stats: Currently unsupported.

## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

---

# PRD

## Scope of *this* note

The milestone's shared shell only. The operators themselves are children:
[[Create Card Browser - Editor]], [[Osmosis stats dashboard]],
[[Develop Image Occlusion System for Flaschards]], plus the infrastructure they
rest on, [[Review log storage]].

## 'Add' is dropped — two operators, not three

Anki's fourth button has no counterpart here. [[Flashcard creator wizard]] was
cancelled because Obsidian *is* the card editing experience, and rebuilding an
authoring dialog would duplicate it. Image occlusion — the one card type
Obsidian genuinely cannot author — gets its own entry point via right-clicking
an image, so it needs no hub button either.

Ship **Browse** and **Stats**. `Sync` was already out of scope (cards sync
through Obsidian Sync or the user's own drive setup).

## Layout: sidebar keeps Decks, operators open in the main area

The existing `DashboardSidebarView` stays a narrow left-panel launcher. Browse
and Stats are wide, tabular surfaces that would be unusable at ~300px, so each
becomes its own main-area view type.

```
LEFT SIDEBAR (existing)      MAIN AREA (new view types)
┌──────────────────┐  ┌──────────────────────────────┐
│ [⌕ Browse] [▤ Stats]│  │ Osmosis Browse       ✕      │
│──────────────────│  │──────────────────────────────│
│ Study all  3 5 42│  │ filter │ deck │ state │ due  │
│                  │  │──────────────────────────────│
│ ▾ Geography 20 0 │  │ ▸ card row                   │
│ ▾ Languages  6 19│  │ ▸ card row                   │
│    Spanish   3  3│  │ ▸ card row                   │
└──────────────────┘  └──────────────────────────────┘
```

Each operator gets its own tab, history, and can be pinned or split — which is
what Obsidian users expect of wide surfaces, and what the Anki screenshot's
single-window model cannot offer.

## Surface map

| File | Change |
|---|---|
| `src/views/DashboardSidebarView.ts` | Operator bar above "Study all"; buttons activate the new views |
| `src/main.ts` | Register the two new view types; remove the mind map ribbon icon; change the dashboard ribbon icon; add commands for both operators |
| `src/views/CardBrowserView.ts` | New — see [[Create Card Browser - Editor]] |
| `src/views/StatsView.ts` | New — see [[Osmosis stats dashboard]] |
| `src/styles.ts` | Operator bar styling |

## Ribbon changes

1. **Remove** the "Open mind map" ribbon icon (`src/main.ts:94`). It is
   redundant — a mind map is reachable from the top-right of any note, which is
   both more convenient and more contextual.
   **Keep** the `open-mind-map` *command* and the file-menu item; only the
   ribbon button goes.
2. **Change** the dashboard ribbon icon (`src/main.ts:98`) from `graduation-cap`
   to `brain-circuit`. It opens the hub in the left panel, unchanged.

**Open decision — view icon.** `DashboardSidebarView.getIcon()` returns
`graduation-cap` and `MindMapView.icon` is already `brain-circuit`. Changing the
dashboard *view* icon too would put identical icons on the mind map tab and the
dashboard tab. Recommendation: **change the ribbon only, leave
`getIcon()` as `graduation-cap`**, since the tab icon is what distinguishes the
two panels once they are open. Revisit if the collision is acceptable.

## Acceptance criteria

- [ ] Sidebar shows a Browse and a Stats button; no Add button
- [ ] Each opens its view in the main area, reusing an existing leaf if present
- [ ] Both are reachable from the command palette
- [ ] Mind map ribbon icon is gone; the command and file-menu item still work
- [ ] Dashboard ribbon icon is `brain-circuit` and opens the left panel
- [ ] Deck tree, counts, and "Study all" behave exactly as before
- [ ] `npm run lint` and `npm test` clean

## Manual test

Reload the plugin. Confirm one Osmosis ribbon icon remains, showing
`brain-circuit`, and that it opens the sidebar. Confirm Browse and Stats each
open a main-area tab. Confirm `Ctrl+P → "Open mind map view"` still works and
that right-clicking a note still offers "Mind map view".
