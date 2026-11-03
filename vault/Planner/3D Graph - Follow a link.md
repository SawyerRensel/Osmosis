---
title: 3D Graph - Follow a link
summary: "Click an edge to ride slowly along it to the plate at its far end, so following a connection doesn't need manual zooming. Plus an Overlays travel-speed slider that scales every camera flight."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[3D Graph Phase 5 - Overlays menu]]"
  - "[[3D Graph Phase 6 - Relational study mode]]"
status: To-Do
priority:
progress:
date_created: "2026-11-03T17:35:29.000Z"
date_modified: "2026-11-03T17:35:29.000Z"
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

# Feature Request

Sawyer, 2026-11-03: "I wish I could click on a link connecting one plate to another, and it could animate slowly, not fast, and take me along that link, so I don't have to zoom in and out myself." Settled in a grilling session the same day; the decisions below are Sawyer's. Terms as in `GLOSSARY.md` (edge, follow a link, hop, travel speed).

## What do you need built?

**Follow a link:**
- **Trigger:** a click or tap on any *visible* edge, hierarchy edges included. Plates win when both are under the pointer. Hit tolerance as for plates (16 px mouse, 32 px touch; see `pickNode`/`nodeNear` in `src/graph3d/depth.ts` and the scene). Edges aren't clickable at all today, so this needs an edge picker: a pure function (screen-space distance from point to projected segment, skipping segments behind the camera or past the fog) in `src/graph3d/`, unit-tested.
- **Which end:** the end that isn't the focused node; if neither end is focused, the end farther from the camera.
- **The ride:** the camera travels *along the edge*, looking ahead toward the far plate, eased, at a slow pace scaled by distance (about 1.5–4 s at default speed), and stops at the usual viewing distance from the plate. Any input (pointer, wheel, key, joystick, touch) stops it where it is. Reuse `flight.ts` (it already tracks a moving target) rather than a second animation system.
- **Arrival:** the same as arriving by clicking that plate: a hop, re-centring the loaded area if the plate is in another note, so trips chain note to note.
- **Relational study:** a trip takes you *to* the plate but does **not** reveal or count as arriving at its card. The card is revealed only by clicking the plate (`study.clicked` is not called on arrival).
- **Edit mode:** edge clicks follow there too; drag-to-link starts on plates, so they don't collide.

**Travel speed slider** in the Overlays menu:
- Scales **every** camera flight: following a link, plate-click hops, search/goto flights. Default 1× keeps today's plate-click speed and the slow follow-a-link pace above. Suggested range 0.25×–4× (log scale).
- Stored with the other overlay settings (`src/graph3d/overlays.ts` normaliser, clamped).
- Not to be confused with the flight-mode `flightScale` (walk/fly under the user's own control), which is unchanged.

**Acceptance:**
- Clicking an edge between two plates rides the camera along it to the far plate, slowly; clicking a plate still flies quickly.
- A trip to a plate in another note re-centres on that note.
- Any input mid-trip stops it.
- In a study session the trip ends at a still-hidden card.
- The speed slider changes both trip and hop pace, and persists.

## Every phase

- Add or extend the fixture web in `e2e/fixtures/graph3d/`, copy it to `vault/tests/graph3d/`, and reload Obsidian.
- Run lint, test and build, then stop for Sawyer's manual test before committing.
