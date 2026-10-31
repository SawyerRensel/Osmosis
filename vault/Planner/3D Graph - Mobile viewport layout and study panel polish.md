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
status: In-Review
priority:
progress:
date_created: "2026-10-31T21:00:00.000Z"
date_modified: "2026-10-31T22:10:00.000Z"
date_start_scheduled: "2026-10-31T21:43:31.000Z"
date_start_actual: "2026-10-31T21:43:31.000Z"
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

## Batch implementation notes (awaiting manual test)

Branch `feature/3d-graph-mobile-polish` (stacked on `feature/3d-graph-phase-6`). Code in 9139e12.

### Approach
1. **Sticks:** `STICK_ROLES` is now `{ left: "move", right: "look" }`; test and the joysticks note updated.
2. **Overlays menu:** `Graph3DOverlaysMenu` now mounts in the view root as `.osmosis-graph3d-overlays-corner` (top right, z-index 2 so the perf readout can't cover it): an icon-only `layers` button and the panel under it, right-aligned. The header strip is gone. Depth (slider) and Backlinks (toggle) are the first two rows of the panel. The view stays the owner of `depth`/`backlinks` (they are in `getState`); the menu takes them in the constructor, sends `onReach`, and `showReach()` pushes restored state into the slider and toggle while the panel is open.
3. **Corners:** perf gauge top left (toggle first, readout below it, so it opens downward); Overlays top right; new toolbar toggle bottom left; joystick toggle and speed readout bottom right, unchanged.
4. **Mobile toolbar toggle:** `panel-bottom` icon, bottom left, shown only when `Platform.isMobile`. It sets `hidesToolbar` on the view, saved per device in localStorage (`osmosis-graph3d-hide-toolbar`), and calls `syncMobileToolbar(app)`. That function sets the body class `osmosis-graph3d-hide-toolbar` only while the **active view is a 3D graph that hides the toolbar**; CSS then does `.mobile-navbar { display: none }`. It also runs on `active-leaf-change`, in `onClose` (excluding the closing view), and the plugin's `onunload` removes the class.
5. **Study panel:** title line and Stop button removed. The graduation-cap header action is the only way to start or end a session: `toggleStudy` -> `Graph3DStudy.stop()`, which still does the `scheduleStore.flush()` and `reviewLog.flush()` (unchanged code path; `onClose` -> `destroy()` -> `stop()` also still flushes). Free exploration is untouched.

### Decisions worth remembering
- **Toolbar state persists per device, default off.** Like the joystick toggle: it is a preference about one phone's screen, and the toolbar has no meaning on desktop. Default off so nobody opens a graph to find Obsidian's navigation gone.
- **The class is derived from the active view, never toggled blindly**, so no code path can leave Obsidian's toolbar hidden outside a 3D graph. Opening the left drawer (which activates a sidebar leaf) brings the toolbar back, which is the wanted behaviour.
- **Study panel moved to bottom centre on desktop and tablet** (it was top right, which Overlays now owns). On a phone it spans the width at the bottom, as before.
- **Navbar clearance is a fixed 84 px** (`--osmosis-graph3d-lift`, set on `.osmosis-graph3d` when `body.is-mobile` and the toolbar isn't hidden). Measured from Sawyer's screenshot (the navbar rises about 74 CSS px). Not read from Obsidian, so a theme that resizes the navbar needs the number adjusted.
- **Two things beyond the letter of the ticket**, both consequences of it: the joysticks rise by the same lift when the toolbar is shown (so the toolbar no longer sits between them), and when the sticks are up on a phone or tablet the study panel rides above them (CSS `:has`), because a full-width panel at the bottom would sit under a stick and eat its taps. Rating buttons on a phone: flex:1, 56 px tall. Tablet: 48 px tall, 84 px min width, not full width.
- Relational study's panel is two flex rows (actions, then hint); the slice 2 path-mode selector is one more row, same button sizing rules (`.osmosis-graph3d-study-actions > button`).

### Surface map
| File | Change |
|---|---|
| `src/graph3d/joysticks.ts`, `.test.ts` | `STICK_ROLES` swapped |
| `src/views/Graph3DOverlays.ts` | icon-only corner button; Depth and Backlinks rows; `showReach` |
| `src/views/Graph3DView.ts` | header strip removed; toolbar toggle, `syncMobileToolbar`, `HIDE_TOOLBAR_CLASS` |
| `src/views/Graph3DPerf.ts` | toggle above readout (top-left corner) |
| `src/views/Graph3DStudy.ts` | title and Stop removed |
| `src/views/Graph3DSticks.ts` | comment only |
| `src/main.ts` | `onunload` removes the toolbar body class |
| `styles.css` | corners, lift variable, study panel by device, stick lift, toolbar rule |

### Fixture
Reuse `vault/tests/graph3d/Sailing Basics.md` (it has cards for study; back-dated per the fixture-dates note if not already).

### Could not verify
- **The real class name of Obsidian's mobile toolbar.** I used `.mobile-navbar` from memory; nothing in the repo confirms it. If the toggle does nothing, inspect the toolbar in Obsidian mobile dev tools and fix the one selector in `styles.css`. If hiding it leaves a blank strip at the bottom, the workspace padding needs overriding too.
- The 84 px lift, the `:has` rules and the button sizes, on a real phone and tablet. Nothing was seen in Obsidian.
