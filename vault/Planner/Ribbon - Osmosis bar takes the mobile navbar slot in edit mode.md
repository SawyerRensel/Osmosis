---
title: Ribbon - Osmosis bar takes the mobile navbar slot in edit mode
summary: "On mobile, entering edit mode in a 2D or 3D map hides Obsidian's navbar and drops the Osmosis ribbon into its slot; reading mode restores it. The navbar toggle and the joystick toggle move into the ribbon."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph - Shared toolbar ribbon]]"
  - "[[3D Graph - Mobile viewport layout and study panel polish]]"
  - "[[3D Graph - Mobile walk and fly joysticks]]"
  - "[[Header - Map header order and overflow menu]]"
status: In-Review
priority:
progress:
date_created: "2026-11-12T12:00:00.000Z"
date_modified: "2026-11-12T05:55:00.000Z"
date_start_scheduled: "2026-11-12T05:27:02.000Z"
date_start_actual: "2026-11-12T05:27:02.000Z"
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

# Feature Request

## What do you need built?

The existing bottom ribbon (`TOOLBAR_GROUPS`) becomes "the Osmosis bar", behaving the way Obsidian turns its navbar into the editing toolbar while typing:

- **Mobile, edit mode (2D and 3D):** Obsidian's navbar auto-hides and the ribbon drops into the navbar's slot.
- **Mobile, reading mode:** the navbar comes back; the ribbon sits above it (today's layout).
- **Navbar toggle moves into the ribbon** and works in 2D too (today it's a 3D-only bottom-left button) — a manual override in either mode.
- **Joystick toggle moves into the ribbon:** 3D only, touch devices only (same `Platform.isMobile || maxTouchPoints > 0` gate); the bottom-right corner button goes.
- **Desktop:** unchanged — ribbon always shown in both modes.

## What problem does this solve?

On a phone, the ribbon floats above Obsidian's navbar, eating vertical space while editing, and Osmosis' editing buttons are lower priority than Obsidian's back/forward/tabs. The navbar and joystick toggles are stray corner buttons.

## What's your current workaround?

In 3D, the bottom-left panel button hides the navbar manually; 2D has nothing.

## Decisions (settled with Sawyer, 2026-11-12 UI feedback grilling; not to be re-decided)

- The Osmosis bar **is** the existing ribbon — no second toolbar.
- Auto-hide on edit, restore on reading; the in-ribbon toggle overrides for the current mode. Decide and document whether the override persists (today's 3D setting is per-device localStorage `osmosis-graph3d-hide-toolbar`, default off) — keep it simple: suggested is one per-device "navbar hidden in edit mode" preference, default on.
- Navbar hiding stays a **body class + CSS** (Obsidian has no API). It must apply only while an Osmosis map view is the active leaf; re-sync on `active-leaf-change` and on unload so the navbar is never left hidden.
- Joystick toggle: moved, not duplicated; still 3D + touch only; keeps its localStorage state `osmosis-graph3d-sticks`.
- Style is **not** in the ribbon (removed by [[Header - Map header order and overflow menu]]).

## Code facts (scout, 2026-11-12 — spot-check line numbers)

- Ribbon: `src/views/ToolRibbon.ts` (`TOOLBAR_GROUPS` ~`:56`); same ribbon in 3D minus `GRAPH3D_HIDDEN_BUTTONS` (`Graph3DView.ts:447`); entries with `command` become `mindmap-<id>` commands (`main.ts:335`). Hidden during node editing; `editOnly` buttons hidden in reading mode; hidden during a relational study session.
- Navbar hiding today (3D only): `syncMobileToolbar()` (`Graph3DView.ts:94`) toggles body class `osmosis-graph3d-hide-toolbar`; CSS `body.osmosis-graph3d-hide-toolbar .mobile-navbar { display:none }` (`styles.css:4056`); toggle button `.osmosis-graph3d-toolbar-toggle` (`Graph3DView.ts:414-422`, `toggleToolbar` ~`:658`); re-synced on `active-leaf-change`. Generalise the class name (e.g. `osmosis-hide-navbar`) since 2D will use it.
- Ribbon placement: 2D mobile `.is-mobile .osmosis-toolbar { bottom: 80px }` (`styles.css:569`); 3D `bottom: calc(size-4-2 + --osmosis-graph3d-lift)`, lift 84px on mobile unless the navbar is hidden (`styles.css:4048, 4314`). When the navbar is hidden the ribbon should sit at the navbar's position (respect safe-area inset).
- 2D reading/edit: `setReadingMode` (`MindMapView.ts` ~`:789-807`). 3D edit toggle: `showEditAction` (`Graph3DView.ts` ~`:680`).
- Joysticks: `src/views/Graph3DSticks.ts` (`gamepad-2` toggle), state at `Graph3DView.ts:68, 480`.
- Ribbon buttons are view-agnostic today; the joystick button needs a "3D + touch only" visibility rule (like `GRAPH3D_HIDDEN_BUTTONS`, inverted).

## Context budget

This is the largest of the batch. Keep it under ~140k tokens: `MindMapView.ts` (~84k tokens, NUL bytes) must be grepped with `grep -a` and read only around `setReadingMode`; read `styles.css` (~33k tokens) by range around the lines above. If the session runs long, split the joystick move into its own follow-up rather than pushing on.

## Acceptance criteria

- Phone, 2D and 3D: toggling to edit hides Obsidian's navbar and the ribbon occupies its slot; toggling to reading restores the navbar with the ribbon above it.
- Switching to a non-Osmosis leaf (or closing the view) always restores the navbar.
- The ribbon has a navbar toggle on mobile (2D and 3D); the old bottom-left 3D button is gone.
- 3D on a touch device: ribbon has the 🎮 toggle; the corner button is gone; state persists. 2D never shows it.
- Desktop: no visible change apart from the joystick button on touch-screen desktops.

## Test plan

Unit: pure helper deciding `navbarHidden(isMobile, editMode, override)` and ribbon button visibility per view/platform.

Manual (Ctrl+R after build), phone:
1. 2D map, reading mode → navbar visible, ribbon above it. Switch to edit → navbar gone, ribbon at the bottom edge.
2. Same in 3D.
3. Ribbon navbar toggle → brings the navbar back / hides it.
4. Open a plain note in another tab and switch to it → navbar visible.
5. 3D: 🎮 in ribbon toggles joysticks; no corner button; 2D ribbon has no 🎮.
Desktop: ribbon looks as before in 2D and 3D.

## Batch implementation notes (awaiting manual test)

Code: commit `51c67ba` on `feature/osmosis-bar-navbar-slot`. Navbar slot and joystick move both shipped; nothing split off.

### Approach
- **The bar's toggles are not `TOOLBAR_GROUPS` entries.** They are view settings, not map actions, so they get no `mindmap-<id>` commands and don't touch `ToolbarActions`, `canRunToolbarAction` or the command tests. `ToolRibbon` takes `options.toggles` (`{ id: BarToggle; onClick }[]`) and draws them as a last group after a divider; `setPressed(id, on)` shows them on (accent colour, `aria-pressed`). `barToggles(view, { isMobile, touch })` (pure, tested) decides which: `navbar` on `Platform.isMobile` in 2D and 3D, `sticks` in 3D only where `Platform.isMobile || navigator.maxTouchPoints > 0`.
- **Navbar hiding** is the body class `osmosis-hide-navbar` (renamed from `osmosis-graph3d-hide-toolbar`) with `body.osmosis-hide-navbar .mobile-navbar { display: none }`. `syncNavbar(app, except)` in `ToolRibbon.ts` derives it from the active view: on only when the active view is a `NavbarHost` (MindMapView or Graph3DView, duck-typed by `navbarEditMode()`, so ToolRibbon imports neither view) and `navbarHidden(Platform.isMobile, editMode, prefs)` says so. It runs on `active-leaf-change` (one registration in `main.ts`, replacing 3D's per-view one), on every mode change (2D `setReadingMode`, 3D `setEditMode`, which study start also goes through), on the toggle, and on close with `except` = the closing view. `onunload` still removes the class.
- **Placement:** with the class on, the ribbon sits at `bottom: var(--navbar-bottom-offset, var(--size-4-2))`, which is Obsidian's own navbar offset (`max(--safe-area-inset-bottom, --size-4-3)`, read from `ref/obsidian-core/app.css`), so it respects the safe-area inset exactly as the navbar does. 3D's `--osmosis-graph3d-lift` drops to 0 under the same class, as before.
- **Joysticks:** `Graph3DSticks` lost its corner toggle (constructor is now `(container, shown)`, `show()` public); the view owns `sticksShown` (still localStorage `osmosis-graph3d-sticks`) and calls `Graph3DScene.showSticks()`. The scene's `onSticksToggle` option is gone.

### Decisions worth remembering
- **Override persistence: two per-device preferences, one per mode** (`osmosis-hide-navbar-edit`, default on; `osmosis-hide-navbar-reading`, default off), in Obsidian's vault-scoped localStorage. The ribbon toggle flips the preference of the mode the map is in. Chosen over the suggested single edit preference + transient reading override because the old 3D button was a *persistent* "hide in all modes" setting used while exploring (reading mode); a transient override would have made that a tap on every open. It is still one rule (`navbarHidden`) and shared by 2D and 3D. The old key `osmosis-graph3d-hide-toolbar` is no longer read (no migration: its meaning, 3D only/all modes, doesn't map onto either new key cleanly); it just sits unused in localStorage.
- Toggles go **at the end** of the bar, after the node menu, matching where the joystick corner button was (right). On a phone the bar scrolls horizontally, so in edit mode they may need a scroll to reach; edit mode can always be left via the header pencil, which brings the navbar back by default.
- Labels are static ("Hide navigation bar", "Walk and fly joysticks") with the pressed state showing on/off; pressed navbar = hidden.
- The bar is still hidden while a node is being edited and during a relational study session (unchanged), so the toggles are unreachable then; study is reading mode, so the reading preference applies.
- Tablets: Obsidian already hides `.mobile-navbar` on tablets (`body.is-tablet .mobile-navbar { display: none }`), but `Platform.isMobile` is true there, so the toggle is shown per the ticket's gate; on a tablet its only visible effect is the bar dropping from the 80/84 px lift to the bottom edge.
- Removed the `.is-mobile .osmosis-graph3d-corner` 40 px left offset, which only made room for the old toolbar toggle; the 3D bottom-left corner is now just the help button and speed readout.

### Surface map
| File | Change |
|---|---|
| `src/views/ToolRibbon.ts` | `BarToggle`, `barToggles`, `NavbarPrefs`, `NAVBAR_STORAGE_KEYS`, `readNavbarPrefs`, `navbarHidden`, `HIDE_NAVBAR_CLASS`, `NavbarHost`, `hidesNavbar`, `toggleNavbarPref`, `syncNavbar`; `toggles` option; `setPressed` |
| `src/views/ToolRibbon.test.ts` | toggle visibility per view/platform; navbar rule and defaults |
| `src/views/MindMapView.ts` | navbar toggle in the ribbon; `navbarEditMode`, `showNavbar` on open and in `setReadingMode`; sync on close |
| `src/views/Graph3DView.ts` | corner toolbar toggle, `syncMobileToolbar`, `HIDE_TOOLBAR_*` removed; ribbon toggles; `sticksShown`, `toggleSticks`; `showNavbar` in `setEditMode` |
| `src/views/Graph3DScene.ts` | `showSticks`; `onSticksToggle` option removed |
| `src/views/Graph3DSticks.ts` | corner toggle removed; `show()` public |
| `src/main.ts` | one `active-leaf-change` → `syncNavbar`; unload removes `HIDE_NAVBAR_CLASS` |
| `styles.css` | class rename; ribbon in the navbar slot; `.osmosis-toolbar-btn.is-active`; old corner toggle rules removed |
| `docs/mind-mapping/editing.md` | phone/tablet paragraph under Toolbar |

### Fixture
None new: any map works. `vault/tests/graph3d/Sailing Basics.md` for 3D, any 2D mind map note for 2D.

### Could not verify
- Everything visual on a real phone: the bar at the navbar's slot (depends on `--navbar-bottom-offset` being defined where the view can see it; falls back to `--size-4-2`), whether Obsidian leaves a blank strip where the navbar was, and the toggle being reachable on a narrow screen.
- Pre-existing, not changed here: in 3D reading mode on a phone with the navbar shown and the joysticks up, the ribbon (bottom 92 px) and the sticks (bottom 92 px, 120 px tall, at the sides) share a band; on a narrow phone the ribbon's ends may sit under a stick. Worth a look during the test.
