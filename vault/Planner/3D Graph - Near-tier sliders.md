---
title: 3D Graph - Near-tier sliders
summary: "Two Overlays sliders, Panel detail and Live panels, set how far away a plate turns into a live panel and how many panels are live at once. Kept per device, applied to every 3D view."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph Phase 4 - Near tier]]"
status: In-Review
priority:
progress:
date_created: "2026-11-09T13:00:00.000Z"
date_modified: "2026-11-09T13:15:00.000Z"
date_start_scheduled: "2026-11-09T13:00:00.000Z"
date_start_actual: "2026-11-09T13:00:00.000Z"
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

# Feature Request

## What do you need built?

Two sliders in the 3D graph's Overlays menu, stored per device (desktop and mobile separately) and applied to every 3D view. Today's values are the defaults.

1. **Panel detail** (panel size threshold): the on-screen size at which a plate becomes a live panel.
2. **Live panels** (live-panel limit): the cap on live panels at once (`NEAR_BUDGET`, 24 desktop / 12 mobile).



## What problem does this solve?

A big graph or a slow device wants fewer, nearer panels; a small graph on a strong machine wants more, from farther away. Both were fixed constants.



## What's your current workaround?

None: edit `src/graph3d/lod.ts`.



## Reference Attachments/Screenshots

None.

## Batch implementation notes (awaiting manual test)

Built 2026-11-09 on `feature/3d-graph-lod-sliders` (cut from `feature/graph-edit-keys`). Commit 1d99364. Not pushed; no PR. Nothing here has run in real Obsidian.

### Approach

- **Pure logic in `src/graph3d/lod.ts`.** `chooseNear(probes, current, budget, enterScale = NEAR_ENTER_SCALE)` takes the threshold as a parameter. The exit scale is `enterScale * NEAR_EXIT_RATIO` (0.45 / 0.6 = 0.75), so the hysteresis band scales with the threshold. New `NearTierSettings { detail, budget }`, `defaultNearTier`, `cleanNearTier` (clamps to the device's range), and slider maps.
- **Slider mapping.** "Panel detail" is a multiplier `detail`, with `enterScale = NEAR_ENTER_SCALE / detail`. More detail means a lower enter scale, so panels open from farther away. The slider is log2 from -1 to +1 in 0.25 steps (the mist slider's pattern), so detail runs x0.5 to x2, the enter scale 1.2 down to 0.3, and x1 is today's 0.6 (exit 0.45). The description shows the live enter scale.
- **"Live panels"** is `NEAR_BUDGET`: integer slider, 4 to 48 on desktop and 4 to 24 on mobile (defaults 24 and 12).
- **Storage** follows the "Click selects only" / joysticks pattern: Obsidian's vault-scoped `saveLocalStorage` (per device, not synced). One key `osmosis-graph3d-near-tier-desktop` or `-mobile`, holding `{detail, budget}`. The suffix is there so a desktop window emulating mobile keeps its own pair. Values are cleaned on read.
- **Applies live to every open view.** `Graph3DView` keeps a module-level `nearTier` (read from storage once, updated on every set). Each scene gets `nearTier: () => NearTierSettings` and `Graph3DNear` reads it every frame in `update()`, which already re-runs `chooseNear`. So a drag re-chooses on the next frame, in every view, with no event plumbing. Lowering the limit fades the surplus panels out through the normal cross-fade.

### Ranges and measurement

`e2e/measure-graph3d-ticks.ts` ran once here (headless Node, no Obsidian needed) on the stress web: 30824 nodes, flatten 0.75, tick mean 14.89 ms, median 13.68 ms, worst 106.87 ms over 120 ticks. That script measures only the d3 layout tick, which the near tier never touches, so **it cannot show the cost of the sliders** (DOM panel render and layout, and the per-frame candidate scan). I did not spend the other two runs, as they would have measured the same thing. The ranges are therefore **unmeasured**, chosen conservatively as the brief suggested: budget 4-48 desktop / 4-24 mobile (2x the defaults, and mobile 4-24), detail x0.5-x2 (enter scale 0.3-1.2).

Costs to watch when testing: (1) a high budget costs DOM, since each panel is a live MarkdownRenderer box and the nearest-wins cap is the only limit; (2) a high detail (low enter scale) lets many more nodes pass the per-frame pre-filter in `update()` (a loop over every node, then `nearMarkdown` for each candidate), which is mostly a cost on a huge web viewed from far away.

### Decisions

- Threshold as a multiplier "detail", not a raw scale, so the direction reads naturally and x1 is the default.
- The exit ratio is a named constant (`NEAR_EXIT_RATIO`), not a second setting, so the flicker margin cannot be broken from the menu. `NEAR_EXIT_SCALE` stays exported (the tests still use it).
- Shared module-level cache, not per-frame `loadLocalStorage`: avoids a storage read and a JSON parse every frame.
- Sliders go in the Lookdev group after Labels, with `setInstant(true)` like Flatten branches, so panels follow the drag.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/lod.ts` | `enterScale` parameter, `NEAR_EXIT_RATIO`, settings type, defaults, cleaning, slider maps, budget ranges |
| `src/graph3d/lod.test.ts` | Non-default threshold, exit ratio kept, no flicker at a non-default boundary, settings cleaning and mapping |
| `src/views/Graph3DNear.ts` | Takes `settings()`; the budget and thresholds are read every frame; `Platform` import dropped |
| `src/views/Graph3DScene.ts` | `nearTier` option passed to `Graph3DNear` |
| `src/views/Graph3DView.ts` | Storage key, shared cache, `nearTier()`, menu control and scene option |
| `src/views/Graph3DOverlays.ts` | "Panel detail" and "Live panels" sliders, `NearTierControl` |

### Fixture

No new fixture. Use `vault/tests/graph3d/` (for example `Galley Handbook.md`, or the stress web `e2e/fixtures/graph3d-stress/` if copied in) in a web with several lines in view.

### Manual test

1. Reload Obsidian (Ctrl+R), open a 3D graph on a web with many lines, fly in until several panels are live. Open Overlays, Lookdev group, the bottom two sliders.
2. Drag **Panel detail** right (x2): panels appear from farther away at once, live as you drag. Left (x0.5): panels only appear very close. At x1.0 the behaviour matches before.
3. Drag **Live panels** down to 4: the surplus panels fade out at once, leaving the nearest 4. Up: more appear (if enough are in range).
4. Ctrl+R: both values persist. Open a second 3D graph: it uses the same values, and moving a slider in one changes the other live.
5. Mobile (or a narrow phone emulation): the Live panels slider tops out at 24 and defaults to 12; the values are separate from desktop's.
6. Regressions: park the camera so a plate sits at the panel boundary and nudge the camera a hair: no flicker in/out. Clicking a panel (select, follow a link, a checkbox) still works.

### Not verified

Everything in Obsidian; the cost of the extremes (see above); the mobile case, which can't be checked here.
