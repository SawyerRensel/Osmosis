---
title: "Toolbar - Mind map toolbar sizing, buttons and icons"
summary: "Polish the Osmosis mobile toolbar: navbar height, eight buttons wide, even spacing, drop zoom and navbar toggle, Obsidian's move/indent icons and circle-chevron create icons; left/right become outdent/indent."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[Ribbon - Osmosis toolbar styled as Obsidian's mobile toolbar]]"
  - "[[Ribbon - Osmosis bar takes the mobile navbar slot in edit mode]]"
status: To-Do
priority:
progress:
date_created: "2026-11-12T11:52:00.000Z"
date_modified: "2026-11-12T11:52:00.000Z"
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
blocked_by:
cover:
color:
pull_request:
---

# Optimization

## Sawyer's feedback (round 8 retest, 2026-11-12)

> The mobile toolbar is looking much better. That's the style and behavior I'm going for. However, the mind map mobile toolbar is slightly smaller than the navbar on mobile. And it would be nice to make the mobile toolbar a full 8 buttons wide to match the width of the Note text editing mobile toolbar. Let's remove the zoom-in and zoom-out buttons from the mind map toolbar. Let's also audit the spacing of icons in the toolbar. They should all be evenly spaced instead the current extra space from the way we used to group them. Let's remove the navbar toggle button because that's not relevant anymore. What's the point of the ellipsis in the mobile toolbar? [Kept, see Decisions.]

> Can we come up with a more intuitive, consistent group of lucide icons for creating nodes and moving them? I get confused sometimes.

Screenshots: ![[r9-3d-phone-toolbar.png]] (our bar, phone), ![[r9-3d-keyboard-zoomout.png]] (Obsidian's own note editing toolbar above the keyboard, which is the size reference: 8 buttons across), ![[r9-create-move-icons.png]] (today's confusing create/move icons).

## Decisions (settled with Sawyer 2026-11-12, not to be re-decided)
- **Size:** match Obsidian's navbar height on phones exactly, and make the bar a full **8 buttons wide**, the same width as Obsidian's note editing toolbar. Read both from `ref/obsidian-core/app.css` (`grep -o` only; `.mobile-navbar`, `.mobile-toolbar`, `.mobile-toolbar-option`). If there are more than 8 buttons, scroll sideways as now. Use the same width on desktop for consistency, unless Obsidian's numbers only make sense on phones; record the call.
- **Even spacing:** no group gaps at all. Every button is evenly spaced, like Obsidian's toolbar. The `TOOLBAR_GROUPS` group structure can remain for commands, but must not show up as spacing.
- **Remove:** zoom-in and zoom-out buttons. Keep their commands and hotkeys: drop them from the bar, not from the command palette; check how `TOOLBAR_GROUPS` drives commands (`main.ts`) so commands survive. Also remove the **navbar toggle**: on phones in edit mode the navbar is always hidden. The `osmosis-hide-navbar-edit` pref and toggle code become dead, so remove them.
- **Keep ⋮ (node menu):** it is the only touch route to the node's menu, since tap-hold becomes multi-select (see [[3D Graph - Touch drag rotates and tap-hold multi-selects]]). Keep its icon.
- **Move icons:** use **Obsidian's own default icons** for the editor commands "Move line up" / "Move line down" (`editor:swap-line-up` / `swap-line-down`) and "Indent list" / "Unindent list" (`editor:indent-list` / `unindent-list`). Find the exact icon names Obsidian registers for those commands in `ref/obsidian-core/app.js` (grep the command ids) and use the same names.
- **Move left/right become Outdent/Indent** (tree depth, not screen side), so the icons tell the truth on both sides of a balanced map. Labels "Outdent node" / "Indent node". Check what `executeDirectionalAction("ArrowLeft")` does today in 2D (`MindMapView.ts` ~:1947) and the 3D equivalent, and wire the toolbar buttons and their commands to semantic outdent/indent. Keyboard Alt+Arrow behaviour stays as it is unless it is the same code path; record what you did. Command ids may stay (hotkeys bound to them keep working) while names change.
- **Create icons:** `circle-chevron-left` = Insert parent, `circle-chevron-down` = Add sibling, `circle-chevron-right` = Add child (Sawyer wants to try these). Verify that each exists in Obsidian's bundled lucide (`grep -c '"circle-chevron-left"' ref/obsidian-core/app.js`).
- **Order:** Sawyer didn't specify. Suggested: create ×3, move up/down, outdent/indent, then the rest as now, so the first 8 are the editing core. Record it.

## Code facts
- `src/views/ToolRibbon.ts` (`TOOLBAR_GROUPS`, `barToggles`, `navbarHidden`, `syncNavbar`, `toggleNavbarPref`), tested in `ToolRibbon.test.ts`. Commands from `TOOLBAR_GROUPS` are in `main.ts`. CSS: `styles.css` (`osmosis-toolbar`). See T61's implementation notes.
- `MindMapView.ts` is **~84k tokens with NUL bytes**: `grep -a -n`, small ranges only.
- The "Add link" button is NOT this ticket; it comes later in [[Toolbar - Add link button for touch]]. Leave room for it.

## Context budget
Under ~130k tokens. Read `styles.css` and `Graph3DView.ts` by range.

## Acceptance criteria
- Phone: the bar's height equals the navbar's, its width is 8 buttons, and the spacing is even.
- No zoom buttons, no navbar toggle. Zoom commands still exist.
- New icons. Outdent/indent buttons act on tree depth in 2D and 3D.
