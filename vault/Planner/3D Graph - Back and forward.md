---
title: 3D Graph - Back and forward
summary: "The tab's back/forward (← → buttons, Alt+←/→, mouse back/forward) steps through the 3D view's camera visits and focus-note changes, per tab, with browser semantics."
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Develop Mind-Map Graph View]]"
  - "[[3D Graph - Focus changes only on purpose]]"
status: Done
priority:
progress:
date_created: "2026-11-08T20:00:00.000Z"
date_modified: "2026-11-17T00:43:08.000Z"
date_start_scheduled: "2026-11-08T20:00:00.000Z"
date_start_actual: "2026-11-08T20:00:00.000Z"
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

# Feature Request

## What do you need built?

Back/forward navigation in the 3D graph view that steps through **camera visits and focus-note changes**, per tab, driven by Obsidian's own back/forward: the tab's ← → buttons, Alt+←/→ and the mouse's back/forward buttons (whatever core uses for `leaf.history`).

Spec (Sawyer, grill 2026-11-08, settled):

- A **camera visit** is arriving at a plate via a plate click, an edge ride, a panel link to a loaded node, or a study "go to". Back flies the camera to the previous plate at travel speed, without reloading.
- A **focus change** (hop: "Focus this note", the F key, a panel link to an unloaded note) is also a step. Going back across it restores the previous focus note (reload) and its camera plate. Forward re-applies it.
- Navigating with back/forward must not push new entries itself. A new visit after going back truncates the forward stack (browser semantics).

## What problem does this solve?

"We should be able to go back and forth between different notes in 3D graph view as well." Since focus changes only on purpose, travel inside the 3D view leaves no trail: the tab's ← only knows the 2D⟷3D swaps and the note the tab opened on.

## What's your current workaround?

None. Flying back by hand, or re-focusing with the plate menu.

## Reference Attachments/Screenshots

See [[3D Graph - Focus changes only on purpose]], "Hooks for the back/forward ticket".

## What was implemented

**Where it shipped:** [PR #48](https://github.com/SawyerRensel/Osmosis/pull/48), merged into `release/0.0.6` with the rest of the 3D graph / mind map stack (tip `perf/mindmap-no-positioned-node-content`).

Sawyer confirmed the result by using it in practice (2026-11-16) rather than through a dedicated test pass. The cause, fix, decisions, surface map and fixture are in the batch implementation notes below.

## Batch implementation notes

Code commit `e53cb58` on `feature/3d-graph-back-forward` (stacked on `feature/3d-graph-focus-on-purpose`). Not pushed, no PR.

### The mechanism (evidence: Obsidian 1.15.0's `app.js`, extracted to the gitignored `ref/obsidian-core/`)

Core's tab history can take in-view entries through the **public** API, the same way a Markdown view records opening another file:

- `WorkspaceLeaf.setViewState(viewState, eState)`, when the type is unchanged, captures `getHistoryState()` (`{title, icon, state: getViewState(), eState: getEphemeralState()}`) **before** calling `view.setState(state, result)`. If the view sets `result.history = true` (documented on `ViewStateResult`), and the call is not a pop, core calls `recordHistory(captured)`.
- `recordHistory` needs `view.navigation` (already true here) and skips the push only when the captured `state` JSON equals the last back entry's. `pushState` clears `forwardHistory`: browser semantics come for free.
- Back/forward (`history.go`) push the current history state onto the other stack and call `setViewState(entry.state with popstate: true, entry.eState)`; `popstate` forces `result.history = false`, so a step taken by back/forward never records. The tab's ← →, the "Navigate back/forward" commands, the mouse back/forward buttons and the tab's right-click Back/Forward all call `activeLeaf.history.back()/forward()`.
- `setViewState` is a no-op while the leaf is `working` (inside another `setViewState`).
- The back stack's cap is nominally 20 (`length>20 && unshift()`), but `unshift()` with no argument removes nothing, so it is effectively unbounded. It lives in memory only: it is not saved in `workspace.json` (it is serialized only for "duplicate tab" and "reopen closed tab").

So no private API is patched and there is no parallel stack: our entries interleave with the 2D⟷3D swap entries in the tab's one history.

### Approach

- **`getState` now includes `node`**, the selected plate (the one last flown to). Without it, two visits in one focus note have equal `state` JSON and core's dedupe would drop them.
- **`navigate(place)`**: every visit and hop calls `leaf.setViewState({type, state: {...getState(), focus, node}})`. Core captures the place being left, then calls our `setState`.
- **`setState`**, after the first call (`placed`), is a step: `stepTo(here, place)` (pure, `src/graph3d/history.ts`) says `fly` (same focus note), `refocus` (another focus note) or `none`; it sets `result.history` only for a real step (`isEntry`) and runs `travel`. It does **not** await the reload, so the leaf is not left busy (busy leaves drop later steps). `navigate` awaits the step itself (`arrival`), which `goTo` relies on.
- **`travel`**: `fly` → `scene.flyTo` at travel speed, no reload. `refocus` → fly at once if the plate is loaded now (as hops always did), then `setFocus(…, landOn)`; `reload` lands on `landOn` once the new area is in.
- **Hooked**: `visit` (plate click, edge-ride arrival, panel link to a loaded node, study stops/Next), `hop` (menu "Focus this note", F), panel link to an unloaded note, study `goTo` into an unloaded note.
- **First `setState`** (a fresh view: open, forward across a 2D⟷3D swap, workspace restore) lands on `state.node` if it names a loaded plate (else its note's root, else the focus core); without `node` it does what it did.

### Decisions worth remembering

- **Integrated with core's history, not a parallel stack.** Public API only (`setViewState` + `result.history`); `updateHeader` was already used.
- **A visit inside the same note counts**: any visit to another plate is an entry.
- **Repeated visits to the plate you are on collapse**: clicking the selected plate flies again (the camera may have orbited off it) but adds no entry (`again`). Non-adjacent repeats (A → B → A) are separate entries, as in a browser.
- **No cap of our own.** Core's is broken (see above) and in memory only; an entry is a few hundred bytes. Capping would need private `leaf.history`.
- **A step whose plate is gone** (deleted by an edit) lands on that plate's note's root, or failing that the focus note's root (`landing`). Line IDs without a block ID are positional, so after a structural edit a step may land on whichever line now holds that position.
- **Back/forward restore location only** (focus note + plate), not depth, backlinks or follow: those are settings changed on purpose, and reverting them by pressing ← would surprise. A forward across a 2D⟷3D swap makes a new view, which takes the whole saved state, as before.
- **Follow active note does not record** (it still calls `setFocus` directly): it is driven by another pane and would flood the history.
- **The selection is the recorded plate.** Selecting without flying (right-click, edit-mode Tab/Enter, edits) also moves it, so a back step returns to what was selected when you left, which may differ from the plate last flown to.
- **A restored workspace now lands on the last selected plate** instead of the focus core (side effect of `node` in the saved state).
- **A step requested while the leaf is busy** (the view still opening, a refocus's `setViewState` mid-flight) is dropped by core; `navigate` then takes it without an entry.

### Surface map

| File | Change |
|---|---|
| `src/graph3d/history.ts` (new) | `Place`, `Step`, `readPlace`, `stepTo`, `isEntry`, `nodeNotePath`, `landing` |
| `src/graph3d/history.test.ts` (new) | Fly/refocus/none, collapse of repeat visits, entries, malformed state, node → note path, landing on deleted plates |
| `src/views/Graph3DView.ts` | `getState` saves `node`; `setState` splits first open from steps; `navigate`, `travel`, `here`; `visit`, `hop`, `followLink` (unloaded), `goTo` go through `navigate`; `reload`/`setFocus`/queued reload take `landOn` |
| `GLOSSARY.md` | **Visit** |

The pure stack the brief suggested was not built: the stack is core's, so the unit tests cover the decisions we own (step kind, entry or not, landing).

### Fixture

None new. Reuse `vault/tests/graph3d/Sailing Basics.md` (links to Knots, Points of Sail, Rigging), `Depth Zero.md`, `Crew Drills.md` / `Harbour Rules.md` (study). Reload Obsidian (Ctrl+R) once for the new build.

### Manual test steps

1. Open `Sailing Basics` → 3D graph, depth 1. Click a plate in `Knots`, then one in `Points of Sail`, then a line of `Sailing Basics`. Press the tab's ← three times: the camera flies back plate by plate at travel speed; nothing reloads; the title stays "3D graph: Sailing Basics". Press → (or Alt/Mod+Alt+→, mouse forward): it retraces.
2. **Truncate:** go back twice, click a different plate. → is now greyed out.
3. **Collapse:** click the same plate twice (orbit away in between): it flies again, but ← needs one press to leave it.
4. **Edge ride:** ride an edge to `Knots`, press ←: back to the plate you rode from.
5. **Hop:** select a `Knots` plate, press F (title "3D graph: Knots"). Press ←: the graph reloads on `Sailing Basics` and lands on the `Knots` plate you stood on. → re-applies the hop. Same with the plate menu's "Focus this note", and a panel link to an unloaded note.
6. **History list:** right-click (or long-press) the tab's ←: entries read "3D graph: …".
7. **2D⟷3D swap:** in 3D visit two plates, switch to 2D, press ←: back in 3D (a fresh view) landing on the plate you left from; ← again walks the visits; → → returns to 2D.
8. **Mod-click a panel link:** opens a new 3D tab whose ← is empty (greyed out); the original tab's history is unchanged.
9. **Study:** Relational study, Due-driven, Next a few times (including a stop that refocuses), then ←: steps back through the stops.
10. **Deleted plate:** visit a line, visit another, delete the first line in edit mode, press ←: lands on its note's root.
11. **Regressions:** Follow active note still refocuses (and adds no entry); depth/backlinks changes survive ←; edit mode, flight keys, Overlays sliders.

### Not verified

Everything interactive: I cannot run Obsidian. In particular whether core's ← button state updates live after an in-view entry (it listens to `history-change`, which `pushState` triggers), the feel of rapid ← presses across refocuses (each refocus reload is superseded by the next via `loadSeq`), and the mobile back gesture. Lint, the full vitest suite (2530 tests) and the build pass.
