---
title: 3D Graph - Mobile viewport layout and study panel polish
summary: "Sawyer's mobile feedback from testing Batch 2: swap the joystick roles, fold Depth/Backlinks into an icon-only Overlays button at the viewport's top right, move the perf gauge to the top left, add a mobile-toolbar toggle at the bottom left, and give the study rating buttons room for thumbs."
tags:
  - task
calendar:
  - Optimization
context:
people:
location:
related:
  - "[[3D Graph - Mobile walk and fly joysticks]]"
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[3D Graph Phase 6 - Relational study mode]]"
status: To-Do
priority:
progress:
date_created: "2026-10-31T21:00:00.000Z"
date_modified: "2026-10-31T21:00:00.000Z"
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
parent: "[[Develop Mind-Map Graph View]]"
children:
blocked_by:
cover:
color:
pull_request:
---

# Optimization

Sawyer's feedback after trying Batch 2 on a phone, 2026-10-31. "Love the controls. On mobile, that's exactly the way I imagine them, and with a little toggle down below."

![[2026-10-31 3D graph mobile study panel.png|300]] ![[2026-10-31 3D graph mobile study next stop.png|300]] ![[2026-10-31 3D graph mobile joysticks.png|300]]

## What to change

### 1. Swap the joystick roles
**Right stick: look** (pivot/orient the camera). **Left stick: move** (WASD). Sawyer had it backwards in the original ticket. This is one constant, `STICK_ROLES` in `src/graph3d/joysticks.ts`; update its tests and the joysticks note.

### 2. Overlays button: icon only, top right of the viewport
- Remove the "Overlays" text and keep only the layers-stack icon.
- Move it out of the header strip into the viewport's **top-right corner**, as an in-viewport overlay control like the perf gauge and the joystick toggle. Not in Obsidian's view-header actions (where the graduation cap and target icons are).
- Move the **Depth slider** and the **Backlinks toggle** *into* the Overlays menu, and remove the standalone Depth/Backlinks strip from the viewport.

### 3. Viewport corners after the change
| Corner | Control |
|---|---|
| Top left | Perf gauge (stats dial), moved from bottom left. Its readout opens downward. |
| Top right | Overlays (layers icon) |
| Bottom left | **New:** mobile toolbar toggle |
| Bottom right | Joystick toggle + flight speed readout (unchanged) |

### 4. Mobile toolbar toggle (bottom left)
Obsidian's mobile navbar (back/forward/search/+/tabs/menu) floats over the bottom of the viewport. It covers the study panel (the "Rate i…" hint is cut off in the screenshot) and sits between the joysticks. Add a toggle that hides and shows it while the 3D graph is the active view. Likely a body class plus CSS on the navbar element; check the real class name and that it comes back when the view closes, loses focus or unloads. Never leave Obsidian's toolbar hidden outside the 3D graph. Mobile only, so hide the button on desktop. Decide whether the state persists (per device, like the joystick toggle) and record why.

### 5. Study panel rating buttons
- **Phone:** the Again/Hard/Good/Easy buttons span the full width of the panel, with taller touch targets.
- **Tablet:** they don't need the full width, but give them more room for thumbs than now.
- **Remove the Stop button** from the panel. The graduation-cap header action already starts and stops a session.
- **Remove the "Relational study: free exploration" title line** (confirmed by Sawyer).
- Keep the panel clear of the mobile toolbar when the toolbar is shown.

## Settled: what "free exploration" referred to
Sawyer confirmed (2026-10-31) that "we also don't need the relational study free exploration" meant the panel's **title line** "Relational study: free exploration" above the rating buttons. Free exploration stays as a study path.

## Conventions
Batch workflow: see `/home/user/.claude/projects/-home-user-Osmosis/batch/subagent-brief.md`. Lay out the corners for desktop too (gauge top left, overlays top right). The mobile toolbar toggle is mobile only.
