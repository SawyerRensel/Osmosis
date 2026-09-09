---
title: Study mode stops before transcluded reviews are finished.
summary: Unexpected behavior occurs - seemingly inconsistently - when studying large mind maps with many transcluded notes, causing Obsidian to crash. 
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
  - "[[Obsidian's WebView renderer holds 0.6-1.4 GB on this vault]]"
status: Done
priority:
progress_current:
progress_total:
date_created: "2026-09-01T17:04:08.290Z"
date_modified: "2026-09-07T17:21:23-04:00"
date_start_scheduled: "2026-09-03T22:30:00"
date_start_actual: "2026-09-03T22:30:00"
date_end_scheduled: "2026-09-07T17:21:23-04:00"
date_end_actual: "2026-09-07T17:21:23-04:00"
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/37
---

# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         |       |
| Operating System |       |

## What happened?

*What actually happened? Describe what went wrong.*

![|300](../../../media/Pasted%20image%2020260903205309.png) ​![Screenshot_20260903-165409|300](../media/Screenshot_20260903-165409.png) 

I'm studying the [Full Stack Engineering](../tests/transclusion_study_issue/Programming/Full%20Stack%20Engineering/Full%20Stack%20Engineering.md) in Mind Map View study mode.  I get this far and tap to reveal this node.  

![Screenshot_20260903-165414|300](../media/Screenshot_20260903-165414.png)

Obsidian crashes and looks like this - a little upside down android icon in the upper left corner.  

![Screenshot_20260903-175524|300](../media/Screenshot_20260903-175524.png)

I restart Obsidian.   Now, I've tested this before when I styled the mind map with a global theme.  When it crashes somehow the theme gets lost and `osmosis-styles` gets set to `object Object`.  It loses all styling for individual nodes as well.  (I only edited node styles within this root note).  

When I activate study node again, sometimes it says that there are no nodes to review even when I know there are, especially in transcluded notes in the lower half of the map I haven't gotten too yet.  When I go into the [Web 2.0](../tests/transclusion_study_issue/Topics/Web%202.0.md) note and remove the last entry for the `osmosis-schedule`, then go back to the [Full Stack Engineering](../tests/transclusion_study_issue/Programming/Full%20Stack%20Engineering/Full%20Stack%20Engineering.md) note, then activate study mode, then the nodes are properly hidden/visible according to their schedules (except for that node whose schedule I deleted.)  

This keeps happening over and over again.  Obsidian keeps crashing whenever I finish reviewing all of the line cards in the root [Full Stack Engineering](../tests/transclusion_study_issue/Programming/Full%20Stack%20Engineering/Full%20Stack%20Engineering.md) note in mind map view but before I finish studying the line cards in in all transcluded nodes.  Sometimes - like in the example above - it seems to crash when I finish or am near finishing studying all the line cards in a transcluded note.  For context, I am only ever studying from the mind map view of the [Full Stack Engineering](../tests/transclusion_study_issue/Programming/Full%20Stack%20Engineering/Full%20Stack%20Engineering.md) note, not from any transcluded note itself.

## What should have happened?

*What did you expect to happen instead?*

​Study mode should remain active until I have finished studying all due cards in the Mind Map view study mode session, including all transcluded notes.  Obsidian should not crash.  Mind map styles should be preserved across study sessions and resilient against loss from a crash. 

## Where is this file located?

*Paste the filepath location  (if the bug occurred in a test file)*



## Steps to Reproduce

### 1. Start from

(e.g. new scene / open file link)  *Attach a screenshot for this step*



### 2. Prep/settings

(e.g. setting/value changes)  *Attach a screenshot for this step* 



### 3. Do this

(e.g. click this button)  *Attach a screenshot for this step*

​

### 4. Trigger

Describe the last action you took before the problem  *Attach a screenshot for this step*

​

---

# Investigation — session 3 (2026-09-06)

**Read this whole section before touching code.** Two fixes have already
shipped against this ticket and neither fixed it. Both were built on a plausible
mechanism that was never verified against the device. Do not add a third one the
same way.

- Attempt 1 — `47a7ccd` "Defer map re-sync during study" (`markTreeStale` /
  `ensureTreeFresh`, plus the `osmosis-styles` corruption containment).
- Attempt 2 — `2f0723d` "Serialize mind map cull passes" (`cullRunning` /
  `cullQueued`, `querySelectorAll` removal).

Branch: `fix/study-mode-transclusion-crash`.

## What the crash actually is

The crash screenshot (`Screenshot_20260903-165414.png`) is the **Android
WebView renderer-crash page** — a blank document with the small Android robot in
the top-left corner. That means the *renderer process was killed*, not that a JS
exception was thrown. On Android WebView that is either an OOM kill or a
renderer that went unresponsive long enough for the system to reap it. Either
way, the cause is sustained work or sustained allocation, not a single bad
statement — which is why "read the reveal handler and look for the bug" has
failed twice.

## Hard evidence collected

### The map is not large — so it is not raw size

Built the real fixture map offline (parser → `TransclusionResolver.expandTree`
→ `computeLayout`, none of which import `obsidian`):

| Measure | Value |
|---|---|
| Nodes in expanded tree | 154 |
| Duplicate node ids | 0 |
| Layout bounds (dummy 200×30 sizes) | 2880 × 4316 |
| Distinct card keys on the map | 140 |
| Card keys mapping to >1 node | 0 |
| Source files feeding the map | 14 |

Nested embeds reached via `40401c6` (list-item-carried embeds): ARPANET →
TCP-IP, Clients and Servers → HTTP (37 nodes — the biggest single contributor),
Web 2.1 → Responsive Web Design + Mobile Applications. `CSS.md` line 11 has
`> ![Separation of Concerns](…)` inside a blockquote, which does **not** expand —
unrelated, but worth a separate note if it is meant to.

To rebuild this measurement, write a throwaway `src/*.test.ts` that reads the
fixture off disk with a hand-rolled `TransclusionApp` (`getFirstLinkpathDest`
returning null, `getFileByPath` doing an `existsSync`) and `console.log`s the
counts. Delete it afterwards.

### The review log dates the crash to the flush, not the tap

`Osmosis/Reviews/2026-09.mobile-android.md` (the real one on the phone; the
`*.fixture.md` shards in the repo are dummies) is the best artefact this bug
has. Ask for it again — it is not in the repo.

Last session, 2026-09-06:

- Last entry in the log: `Topics/Web 2.0.md#^os-l3dajj` at `t=1788744820099`
  → **21:33:40**.
- `Web 2.0.md` frontmatter says `os-bcj6t7` has `lastReview: 2026-09-06T21:33:47`
  — a rating **7 s later that has no log entry at all**.
- `Web 2.0.md` mtime: **21:33:49**.

So the rating at 21:33:47 got as far as `ScheduleStore`'s 2 s debounce (frontmatter
written at 21:33:49 ✓) but its `ReviewLog` entry never reached disk ✗. **The
process died at ~21:33:49 — during the debounced flush, roughly two seconds
after the last rating.** The user experiences that as "I tapped the next node and
it crashed", because the next tap lands in the same window. The Django node is
not special; it is just where they reliably arrive.

`Full Stack Engineering.md` was last written 2026-09-04 18:13 — the host note was
never written during the 09-06 session at all.

### Every session dies after 1–3 minutes, whatever the card count

Grouping the log by gaps > 60 s gives bursts of 5–20 cards, 1–3 minutes each,
then a stop, then a restart that re-asks cards already answered (they are in
`learning` with 60 s steps, so they come due again). Bursts: 19, 9, 20, 5, 5, 12,
4, 8, 6, 5, 17 cards. **Time-bounded, not count-bounded** — the signature of
something that accumulates per unit of elapsed session, not per rating.

### The review log double-appends

```
{"t":1788559978168,…os-t49zav…}
{"t":1788559987145,…os-uv1ssk…}
{"t":1788559990286,…os-ib8bc2…}
{"t":1788559996733,…os-tcn17j…}
{"t":1788559978168,…os-t49zav…}   ← repeat
{"t":1788559987145,…os-uv1ssk…}   ← repeat
{"t":1788559990286,…os-ib8bc2…}   ← repeat
```

Three entries written twice with identical timestamps, with a fourth entry
interleaved between the copies. `ReviewLog.writeBuffer` swaps the buffer
synchronously and `flush()` chains on `inflight`, so this is not two readers of
one buffer. It is the **re-buffer-on-error path** (`ReviewLog.ts:900-905`)
retrying entries that had already reached disk: inside `appendToShard`, `fs.stat`
runs *before* the append, so the only thing that can throw after a successful
`fs.append` is `foldIntoCache`. A throw there re-queues entries the file already
has.

Real bug, independently worth fixing, but a data-integrity bug — not the crash.

## Leading hypothesis (UNVERIFIED — verify before building on it)

**`ScheduleStore.isWriting()` almost certainly returns `false` by the time the
`modify` event arrives, so `resyncFromParent()` runs on every single schedule
flush — which is exactly what attempt 1 was meant to stop.**

`ScheduleStore.writePath` (`src/store/ScheduleStore.ts:243-262`):

```ts
this.writingPaths.add(notePath);
try { await this.fileManager.processFrontMatter(file, …); }
finally { this.writingPaths.delete(notePath); }
```

`MindMapView`'s `vault.on("modify")` handler (`src/views/MindMapView.ts:1885`)
reads that flag to decide between `markTreeStale(path)` (cheap) and
`this.cache.invalidate(path); void this.resyncFromParent()` (full re-read,
re-parse, re-expand of all 14 files, full SVG teardown and rebuild).

If Obsidian fires `modify` from its file-change watcher *after* `vault.modify()`
resolves — which is what the desktop adapter does, and is consistent with the
memory note that sync stamps `id:` onto fences *seconds* after a write — then the
flag is already gone and the expensive branch is taken every time. Timing fits
everything: flushes land every 2–4 s during study, `resyncFromParent` is `void`
-called and therefore **not serialised** (only `render()` is, via `renderChain`),
and at session end `flush()` fires 14 of them at once through `Promise.all`.
Sessions dying on a wall-clock schedule rather than a card count is what a
per-flush full rebuild looks like.

**Verify it first, on the device.** Cheapest instrumentation:

1. In the `modify` handler, log `file.path`, `scheduleStore.isWriting(path)` and
   `performance.now()`.
2. In `resyncFromParent`, log entry and exit timestamps.
3. Rate three cards on the phone with the console attached
   (`chrome://inspect` against the Android WebView, or ship a temporary
   `new Notice`/`console.error` since `console.log` is easy to lose).

If `isWriting` reads `false` and `resyncFromParent` runs every ~2 s, the
hypothesis holds. **If it does not, stop and re-investigate — do not ship a
fourth speculative fix.**

If it does hold, the shape of the fix is a guard that outlives the write rather
than a boolean cleared on promise resolution: record `path → expected content
hash` (or a short-lived "we wrote this at time T" stamp) when the plugin writes,
and have the `modify` handler consult that instead of an in-flight flag. The
same flaw is in `suppressNextReload` (a single boolean; its own comments already
admit it cannot cover a burst) and in `CardSyncService.writingPaths` /
`FenceWriter.writingPaths`, which use the identical add/await/delete pattern.

## Secondary defects found (each real, each independently fixable)

1. **`applySpatialState` is O(nodes × cards) with an allocation per node.**
   `applySpatialHidden` → `nodeOcclusion` → `mapCards()`, which rebuilds a fresh
   ~140-element array per hidden node — ~86 arrays per call on this map. And
   `applySpatialState` is called from `updateVisibleNodes`, i.e. **once per
   animation frame during a pan, pinch or inertia fling**. Cache `mapCards()`
   per pass, or hoist the occlusion lookup out of the loop.
2. **`renderSvg` and cull passes can still interleave, in the direction attempt 2
   did not cover.** `renderSvg` sets `this.nodesGroup` and `renderedNodeIds`
   *before* awaiting its draws. A cull pass entering that window commits its own
   `renderedNodeIds`, and `renderSvg`'s pending draws then append node groups
   that nothing is tracking — orphans in the SVG that no removal pass will ever
   match. `updateVisibleNodes`'s `if (this.nodesGroup !== nodesGroup) return;`
   only catches cull-then-render. `renderSvg` needs a flag that suppresses cull
   passes for its whole duration.
3. **`main.ts`'s `debouncedSync` is one shared debounced closure keyed on
   nothing** (`src/main.ts:513`). A burst that modifies 14 notes only syncs the
   last one. Should be per-path.
4. **`ReviewLog` re-buffers entries that already reached disk** (above). Move
   `foldIntoCache` out of the try, or mark the append as committed before
   folding.
5. **Fence cards never populate `nodeHtmlCache`.** In `drawNode`, the cache
   *write* at `MindMapView.ts:9139` sits inside the non-fence branch only, so
   `renderOsmosisCardInto` re-runs `MarkdownRenderer.render` on every draw of
   every fence node.
6. **Startup race behind "no cards are due on this map".** `cardStore` is filled
   by `cardSync.syncAll()` on `onLayoutReady`, which walks every markdown file in
   the vault. A mind map leaf restored at the same moment has an empty store, so
   `mapCards()` returns nothing and `enterSpatialStudy` reports "No cards are
   due on this map." Editing any note (the user's "delete the last
   `osmosis-schedule` entry" workaround) kicks `debouncedSync` and fixes it.
   Gate the study action on sync completion, or re-check after it finishes.

## Ruled out this session — do not re-tread

- **Transclusion cycles / runaway expansion.** `expandTransclusion` has a
  `visited` set; the fixture has no cycles; 154 nodes, 0 duplicate ids.
- **Duplicate node ids or duplicate card keys from the embed cloning.** Zero of
  each, measured.
- **`spatial-study.ts`.** Read in full; the key/step logic is clean.
- **`StudySessionManager.recordReview` / `ScheduleStore` serialisation.** Both
  correct; `applyScheduleEntries` and the per-path `inflight` chain are sound.
- **`refreshDashboard()` after every rating.** A no-op unless a dashboard leaf
  is open.
- **`CardSyncService.injectFenceIds` write loop.** Terminates; no runaway
  `id:` injection in the fixture.
- **Oversized images.** Nothing on this map is large enough to matter.
- **`osmosis-styles` → `[object Object]` being a plugin write.** Every writer
  goes through `styleMappingFor`/`readStyleMapping` with a real object, and this
  vault's `.obsidian/types.json` does **not** register `osmosis-styles`. Most
  likely Obsidian's own Properties UI coercing an object-valued property it has
  no type for, on a note re-saved after the crash. Treat as a separate ticket —
  the containment from `47a7ccd` already stops it compounding.

## Test plan

Unit-testable (no `obsidian` import needed — keep pure logic out of
`src/views/`):

- `ReviewLog`: an `appendToShard` whose post-append step throws must not re-queue
  entries the shard already holds.
- `main.ts` per-path debounce: N paths modified in one burst → N syncs.
- Whatever pure helper the `modify`-guard fix lands in (hash/stamp match).

Manual, on the phone, after `npm run lint && npm test && npm run build`:

1. Reload Obsidian (Ctrl+R / force-quit) — see "the reset hazard" in CLAUDE.md;
   the fixture notes below are live and the running plugin is authoritative over
   a note it has open.
2. Open `vault/tests/transclusion_study_issue/Programming/Full Stack
   Engineering/Full Stack Engineering.md` in Mind Map view, enter study mode.
3. Rate straight through **more than 25 cards without stopping**, past the point
   where the map moves from the host note into Web 2.0 and on into the Django /
   Ruby-on-Rails / Spring leaves.
4. Expect: no crash, no full-map blink between ratings, the progress pill
   counting up continuously to the end of the session.
5. Afterwards, check `Osmosis/Reviews/2026-09.mobile-android.md` — one entry per
   rating, **no duplicated timestamps**, and an entry for every card whose
   `lastReview` moved.

## Housekeeping

- The fixture notes under `vault/tests/transclusion_study_issue/` have
  uncommitted schedule churn from the user's real sessions. That is data, not
  drift — do not reset them, and do not stage them with a code commit.
- `Course Resources.md`, `1 - Web Development/`, `Programming Language.md` and
  `Separation of Concerns.md` are untracked additions to the fixture.

---

# Investigation — session 4 (2026-09-06 → 07)

## The session-3 hypothesis is dead — `isWriting` reads TRUE

Instrumented the device (`src/debug-trace.ts`, temporary) and captured a real
session in the user's **production** vault: 8 ratings on `Topics/Web 2.0.md`
over 22 s. Trace pasted to `vault/Osmosis/Reviews/debug-trace.md`.

Every `modify` for a note the plugin had just written read `isWriting: true`,
and every one took the cheap branch:

| `sched-write-open` | `modify` | `isWriting` | branch | `sched-write-close` |
|---|---|---|---|---|
| ms 31457 | ms 31474 | **true** | `transcluded-stale` | ms 31475 (18 ms) |
| ms 40895 | ms 40915 | **true** | `transcluded-stale` | ms 40916 (21 ms) |
| ms 43042 | ms 43090 | **true** | `transcluded-stale` | ms 43090 (48 ms) |

**Zero** `resync-start`, **zero** `ensure-tree-fresh`, **zero**
`transcluded-resync`, **zero** `host-reload` in the entire session.

Session 3 reasoned from the desktop adapter, where `modify` fires *after*
`vault.modify()` resolves. On mobile, `fileManager.processFrontMatter` fires
`modify` **synchronously inside** the write — 17–48 ms after the flag goes up,
always before it comes down. Attempt 1's guard does exactly what it was built to
do.

**Do not build on the `isWriting` / stale-flag story. It is now measured, and it
is wrong.** The same goes for the proposed hash/stamp guard that was to replace
it: there is nothing for it to fix.

## What the same trace does show

- **The crash reproduced, in 22 s and 8 cards.** User confirmed it was the
  crash, not a force-quit. `stopTrace` writes `session-stop` on `onunload`;
  there is none — the trace jumps straight to a new `session-start` with
  `performance.now()` reset (43182 → 4844) and a fresh heap. **This is now a
  ~40-second repro from plugin load**, against the 1–3 minutes session 3 had.
  Iterate against it.
- **Death ~2 s after the last rating**, the same window session 3 reconstructed
  from the 09-06 log. Last record at ms 43182; the 1 s flush timer that would
  have fired at ~44200 never did.
- **The JS heap is not visibly the problem.** Flat at 239 MB against a 2060 MB
  ceiling all session. Caveat: Chromium quantizes `performance.memory`, so a
  flat reading over 22 s is weak on its own — but it does rule out running *at*
  the ceiling, and `performance.memory` does not count DOM/SVG/GPU memory, so a
  native-memory kill stays open.
- **8 cards is a normal burst** (session 3's log has bursts of 4, 5, 5, 5, 6, 8),
  so the instrumentation did not obviously accelerate the failure.
- All 8 ratings reached the review log this time, unlike 09-06 where the last
  was lost.
- 128 due cards on this map (`targets: 128`).

## Where that leaves it

With the resync path measured out and the JS heap not near its ceiling, the
"sustained work or sustained allocation" the WebView crash page implies has to
be something `performance.memory` cannot see — i.e. DOM. One of session 3's
secondary defects is exactly that shape, and reading confirms it:

**`nodeHtmlCache` is never written for fence nodes** (secondary defect 5). In
`drawNode`, `nodeHtmlCache.set` sits inside the *non-fence* branch; the
`osmosisCard` branch calls `renderOsmosisCardInto` and caches nothing. So every
draw of every fence node re-runs `MarkdownRenderer.render` into
`this.renderComponent`, which is only unloaded and recreated by `renderPass`. If
`renderPass` does not run for the length of a study session, every cull pass the
auto-pan triggers piles render output onto a component nothing unloads.

Per-unit-time accumulation of DOM, invisible to the heap readout — the
"time-bounded, not count-bounded" signature session 3 identified.

**The `renderPass` half of that is assumed, not measured.** Round 1 traced only
the modify-driven rebuild paths, and none of them ran; it had no record for
`renderPass` itself, and `render()` has ~30 other call sites, several reachable
by zoom/pan through `renderAnimated`. Round 2 adds a direct `render-pass` record
precisely so this is not another plausible mechanism taken on faith.

**Still a hypothesis. Round 2 measures it before a line of fix is written.**

## Round 2 instrumentation (built, awaiting a device run)

`traceCensus()` emits on every rating and every render pass:

| Field | Reads on |
|---|---|
| `groupChildren` vs `renderedIds` | orphan node groups (secondary defect 2) |
| `foreignObjects`, `domNodes` | leaked markdown render output (defect 5) |
| `htmlCache` | whether the cache grows at all |
| `renderPasses`, `cullPasses`, `drawNodes`, `mdRenders` | what accumulates per unit of session |

Plus, in `ReviewLog`: `review-log-write-start`/`-end` and `rollup-cache-save`.

**Second candidate, found by reading in session 4.** `foldIntoCache` calls
`cacheStore.save(this.cache)` — a **synchronous** `JSON.stringify` +
`localStorage.setItem` of every shard's per-day rollups — on **every** review
log flush, i.e. every ~2 s during study, inside the window the crash lands in.
Its cost scales with review history, not with map size, which fits a bug that
reproduces on a production vault with a year of shards and not on the fixture.
`refreshCache` is *not* implicated: it only runs from `getRollup()` and
`moveFolder()`, neither of which is in the study path.

Cull passes are counted, not traced per call: they run per animation frame
during a pan, and a record each would flood the file and skew what it measures.
The trace file's own `modify` events are now filtered out — they were 12 of
round 1's records.

How to read the result:

- `groupChildren` climbing away from `renderedIds` → defect 2 (orphan groups).
- `domNodes`/`foreignObjects` climbing while both stay flat → defect 5.
- Neither climbing → the mechanism is time, not memory; `render-pass` `durMs`,
  `cullPasses` and `rollup-cache-save` `durMs` then say whether the renderer is
  being blocked into an unresponsive-renderer kill.
- `rollup-cache-save` `durMs` growing, or large from the start, → the
  localStorage candidate.

## Round 2 result — DOM is clean, cull passes are not

Second crash captured (`t=1788748435865`, 10 ratings, died right after a tap on
the Ruby-on-Rails line at ms 54865).

| ms | at | renderPasses | cullPasses | drawNodes | mdRenders | groupChildren | renderedIds | htmlCache | foreignObjects | domNodes |
|---|---|---|---|---|---|---|---|---|---|---|
| 33127 | render-end | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1475 |
| 39363 | rate 1 | 1 | 106 | 186 | 155 | 50 | 50 | 139 | 50 | 1931 |
| 42353 | rate 3 | 1 | 122 | 186 | 155 | 49 | 49 | 139 | 49 | 1920 |
| 46789 | rate 6 | 1 | 142 | 189 | 155 | 49 | 49 | 139 | 49 | 1923 |
| 49065 | rate 8 | 1 | 162 | 190 | 155 | 47 | 47 | 139 | 47 | 1898 |
| 50131 | rate 9 | 1 | 162 | 190 | 155 | 47 | 47 | 139 | 47 | 1897 |
| 54865 | rate 10 | 1 | **316** | 234 | 158 | 56 | 56 | 139 | 56 | 1978 |

**Both memory theories are dead:**

- `groupChildren` **equals** `renderedIds` at every sample (50/50, 49/49, 47/47,
  56/56). Secondary defect 2 — orphan node groups — **does not happen**.
- `domNodes` is flat (1897–1978, oscillating, no trend) and `htmlCache` is
  pinned at 139. Defect 5's leak consequence **does not materialise**;
  `mdRenders` moves only 155 → 158 across ten ratings, so the cache is doing its
  job for nearly every draw.
- `renderPasses` stays at **1** all session. The session-4 inference was right,
  and is now measured rather than assumed.
- `review-log-write-end` is 33–84 ms per flush, and `rollup-cache-save` never
  appeared — `foldIntoCache` took the `!wasCurrent` early return. The
  localStorage candidate is **not** firing. Keep the instrument; deprioritise
  the theory.

**What is left is `cullPasses`.** Between rate 9 and rate 10 it jumped 162 →
316: **154 cull passes in 4.7 s**, ~33/s, i.e. one per animation frame across a
long auto-pan. Then the user tapped Ruby-on-Rails and the process died inside
one second, with no record at all.

`applySpatialState()` runs at the end of **every** cull pass
(`updateVisibleNodes`, line ~3338). Per call it walks all ~154 entries of
`nodeMap` and, per entry, does:

- `svg.querySelector('[data-node-id="…"]')` — a whole-subtree attribute scan
- `applySpatialHidden`, which does **a second** `querySelector` of the same kind
- `nodeOcclusion(nodeId)` → `mapCards()` on the hidden path, which walks all 154
  nodes again and builds a fresh ~140-element array

So the 4.7 s before the crash plausibly cost ~47,000 attribute-selector scans
and up to ~24,000 `mapCards()` rebuilds. That is a main-thread saturation
profile, and it fits every constraint the evidence has imposed: time-bounded not
count-bounded, no DOM growth, no heap growth, renderer *killed* rather than a JS
exception, and worse on a big transcluded map.

**Do not fix this yet. It is the same kind of plausible story that cost attempts
1 and 2.** Round 3 measures it.

## Round 3 instrumentation (built, awaiting a device run)

- `spatialCalls` / `spatialMs` in the census — total time in `applySpatialState`.
  If it is a large fraction of session wall-clock, confirmed.
- `mapCardsCalls` — whether the O(n×m) path is actually being taken.
- `reveal` / `reveal-end` + a census at reveal. **Round 2's crash followed a tap
  that emitted nothing**: a reveal is not a rating, and only ratings were
  traced. That blind spot is now closed.
- `stall` records from a 250 ms heartbeat, logged only when it fires ≥400 ms
  late. On a single-threaded renderer a late timer *is* a blocked main thread,
  so a growing run of `stall` records ending in silence is a direct reading of
  the unresponsive-renderer kill. Costs nothing when the session is healthy.

## Round 3 attempt 1 — no data, and two instrumentation holes it exposed

The trace copied back for round 3 ended at the map's opening `render-end`
census (`cullPasses: 0`, `spatialCalls: 0`) with no ratings, no reveals, and
**no following `session-start`** — so it predated the crash run rather than
capturing it. No conclusions drawn from it.

It did expose two holes worth fixing regardless, both of which would have lost
data even from a correct copy:

1. **A blocked main thread fires no timers — including the flush timer.**
   Records buffered when the renderer is killed die with it, and that is exactly
   the window under investigation. `FLUSH_DELAY_MS` 1000 → **250**, so the last
   surviving record sits closer to the moment of death.
2. **A census only fired on a rating, a reveal or a full render.** A crash
   during the cull-and-pan storm *before* the first rating would leave no curve
   at all. The 250 ms heartbeat now drives a sampler (`setTraceSampler`) that
   emits a `census` at `at:"tick"` about once a second for the whole session,
   plus `study-enter` and a `study-exit` census.

Caveat on the copies: this repo lives *inside* the production vault, so the
pasted `Osmosis/vault/Osmosis/Reviews/*.md` copies fall outside
`reviewLogFolder` and do get card-synced (visible as `sync-file` records for
`Osmosis/vault/…`). Harmless noise; not a confound.

## Round 3 result — the cull-pass theory is dead too

Full crash session captured (`t=1788749469064`, 02:51:09 → last record ms 57223,
restart 02:52:16 confirms the kill). 122 targets, 154 cards, 5 ratings.

| ms | cullPasses | spatialCalls | spatialMs | mapCardsCalls | domNodes |
|---|---|---|---|---|---|
| 45207 | 1 | 1 | 15 | 115 | 2422 |
| 46227 | 17 | 17 | 75 | 1334 | 1705 |
| 47212 | 75 | 75 | 239 | 4489 | 1701 |
| 48232 | 116 | 116 | 354 | 6530 | 1723 |
| 49225 | 172 | 172 | 489 | 9095 | 1573 |
| 51217 | 220 | 220 | 597 | 10968 | 1507 |
| 57223 | 241 | 251 | **675** | **11945** | 1456 |

**The main thread was healthy right up to the moment of death.** `stall` records
appear only during plugin startup (642/863/1147 ms at ms 5897–8247); across the
entire 12 s study there are **none**, and the 1 s ticks land at 45207, 46227,
47212, 48232, 49225, 50228, 51217, 52222, 53222, 54210, 55218, 56222, 57223 —
metronome-regular. **The unresponsive-renderer / ANR theory is dead.**

**`applySpatialState` is not the crash either.** 675 ms across ~12 s of study is
5.6 % of wall clock. The O(n×m) waste is *confirmed as waste* — **11,945**
`mapCards()` calls in 12 s, each walking 154 nodes and rebuilding a ~140-element
array — but it is nowhere near saturating anything. Fix it as an optimisation on
its own ticket; it is not this bug.

**So the signature is now:** abrupt kill, responsive main thread, DOM *shrinking*
(2422 → 1456), no stall, no GC pause, between two healthy 1-second ticks. That
is not slow accumulation of anything JS can see. It reads as a large **native**
allocation — compositor layer, image decode, or similar — which is invisible to
both `performance.memory` and `domNodes`.

**And the fatal action still emits nothing.** Reveals are traced now, and the
five before the crash all recorded (`durMs` 3–7 ms). The tap that killed it
produced no `reveal` at all — so it hit one of `handleSpatialClick`'s early
returns and fell through to `selectNode`, or died before reaching it.

## Round 4 instrumentation (built, awaiting a device run)

- `tap` — emitted at the very top of the click handler, before any hit-test
  branch, so a crash mid-tap still leaves evidence the tap began.
- `spatial-click` with an `outcome` for each of `handleSpatialClick`'s four
  early returns (`mode-off`, `not-a-target`, `already-revealed`, `rating-open`).
  This is the blind spot round 3 landed in.
- `vbW`/`vbH`/`svgW`/`svgH` in the census. The map pans by **CSS transform, not
  viewBox**, so the composited layer is the SVG box times the scale; a layer
  large enough to OOM the renderer would show here and nowhere else. This is the
  leading candidate on the current signature — but it is a *candidate*, and it
  gets measured before anything is written.

## Round 4 result — the compositor-layer theory is dead; two blind spots found

Crash session `t=1788749860466` (02:57:40 → last record ms 88355, restart
02:59:26). Messier than round 3: the user entered study seven times and the view
was recreated at least once (`renderPasses` reset to 1 mid-session, and the
counters live on the view instance).

- **`svgW`/`svgH` are constant at 387×770 and `vbW`/`vbH` at 621×1229** — screen
  sized, all session. There is no oversized composited layer. **The
  native-layer/OOM-by-transform candidate is dead.**
- **Main thread healthy again.** Last `stall` at ms 40784; death at ~88500.
- **Death again 1–2 s after a rating** (rate 9 at ms 87752, one tick at 88355,
  then nothing). That is now true of all three captured crashes.

Two instrumentation defects this exposed:

1. **`trace("tap")` never fired** — 23 reveals, zero taps. It was placed on
   `handleClick`, the *mouse* path; a phone goes through `handleTouchTap`, the
   other `handleSpatialClick` caller. Moved.
2. **The 250 ms flush throttle loses the death window.** Records buffered when
   the renderer dies are lost, and that window is the whole question.

Open anomaly, not yet chased: at ms 84585 the **host** note
(`Full Stack Engineering.md`) got a `modify` with `suppress:true` during study,
followed by **two full render passes** (237 ms, 223 ms). Nothing in a study
session should be writing the host note. It may be a stale `suppressNextReload`
— the single boolean whose inadequacy the code comments already admit — with the
renders coming from elsewhere (a resize is plausible). Attribution would need
function names in stacks, and the production build minifies without
`keepNames`; not worth a build-config change until the death window is
understood.

## Round 5 instrumentation (built, awaiting a device run)

- **`traceBurst`** — after every rating, sample a *light* census every **50 ms
  for 2.5 s, flushing each record immediately**. All three crashes land in that
  window. If death is instant the last record sits ~50 ms before it; if anything
  ramps, the ramp is visible. The burst census deliberately skips the two
  whole-tree walks (`domNodes`, `foreignObjects`, `imgs`) — at 20 samples/s a
  census that costs more than what it measures would change the answer.
- **`tap`** moved to `handleTouchTap`, the path a phone actually takes.
- **`imgs`** in the full census — image count under the SVG, since a decode is
  one of the few remaining native allocations big enough to matter.

## Round 5 result — death is instantaneous and invisible to JS

Fourth full crash captured (`t=1788784257036`, 12:29:49 → last record ms 44614,
`session-start` at 12:32:00 sixty-three seconds later confirms the kill). 124
targets, 154 cards, 5 ratings, study entered at ms 29872.

The burst worked exactly as designed, and it returned the "nothing ramps, it
just stops" answer. Every counter is **frozen** across the last 135 ms —

| ms | Δ | cullPasses | drawNodes | mdRenders | spatialCalls | mapCardsCalls | groupChildren | renderedIds | htmlCache |
|---|---|---|---|---|---|---|---|---|---|
| 44479 | | 335 | 195 | 157 | 345 | 14581 | 49 | 49 | 139 |
| 44503 | +24 | 335 | 195 | 157 | 345 | 14581 | 49 | 49 | 139 |
| 44519 | +16 | 335 | 195 | 157 | 345 | 14581 | 49 | 49 | 139 |
| 44542 | +23 | 335 | 195 | 157 | 345 | 14581 | 49 | 49 | 139 |
| 44555 | +13 | 335 | 195 | 157 | 345 | 14581 | 49 | 49 | 139 |
| 44565 | +10 | 335 | 195 | 157 | 345 | 14581 | 49 | 49 | 139 |
| 44581 | +16 | 335 | 195 | 157 | 345 | 14581 | 49 | 49 | 139 |
| 44614 | +33 | 335 | 195 | 157 | 345 | 14581 | 49 | 49 | 139 |

— then nothing. `traceBurst` flushes **each record** as it is written, so the
last line reached disk within ~30 ms of the kill. Sample gaps of 10–33 ms right
to the end (overlapping bursts, one per rating, plus the 250 ms heartbeat) mean
the event loop was turning freely at 30–100 Hz in the final tenth of a second.
`vb` 607×1201 and `svg` 387×770 constant; `imgs` 5.

**This is the pre-agreed stop condition: death is instantaneous, and its cause is
outside JS's view.** No further JS instrumentation. Pivot to device-side
evidence.

### Three things this trace changes

1. **The fatal action is not a tap.** `tap` now fires at the top of
   `handleTouchTap` and recorded **12 times** this session, so the round-4 hole
   is closed — and there is **no `tap` after the last rating**. Tap cadence this
   session was ~500 ms (reveal → rate → reveal); death at 44614 came 139 ms
   after the rate at 44475, i.e. **with the user's finger still in the air**.
2. **It was not the Ruby-on-Rails card.** The trace stops after rating
   `Topics/Web 2.0.md#^os-py1yjq` ("User-generated content", card 5 of 128).
   `os-did1ua` (Ruby-on-Rails) is seven cards further down `Web 2.0.md` and was
   never reached. What the user sees is what a dead renderer looks like from the
   outside: the last painted frame stays on screen, the next tap does nothing,
   and Android swaps in the crash page. **The card being tapped is not a
   variable — stop treating "it crashes on Ruby-on-Rails/Django" as a clue.**
3. **"Death follows a rating" is probably a base-rate artefact.** With a rating
   every 1–3 s, *any* death lands within 2 s of one. Four crashes fit the
   pattern because the pattern is nearly unavoidable, not because rating causes
   it. Demote it.

### And nothing was in flight when it died

Last `review-log-write-end` at ms 43643 (138 ms). No `sched-write-open` after ms
39030 — `ScheduleStore`'s 2 s debounce is *trailing*, so a streak of ratings
1 s apart keeps pushing the frontmatter write out; the one owed for rate 5 was
not due until ~46500 and never fired. `cullPasses` had been pinned at 335 since
ms 41555, so the map was **static** — no pan, no animation, no cull for the last
3 s. The renderer died in a genuinely quiet window.

(The trailing-debounce behaviour is a real if minor finding — during a fast
streak no schedule reaches disk until the user pauses. It is not this bug.)

## Round 6 — the fix: a composited layer inside a `<foreignObject>`

**New evidence from the user, worth more than another trace: the same map, the
same region, studied through on the laptop with no crash.** Desktop Chromium is
fine; Android WebView dies. Combined with round 5 (instantaneous, compositor-
side, main thread healthy to the last 30 ms), that points at a construct that is
mobile-specific and lives entirely outside JS's view.

There is exactly one such construct on the per-rating path:

- `styles.css:2354` set **`will-change: transform`** on `.osmosis-spatial-rating`,
  unconditionally.
- `MindMapView.ts:1639-1648` builds that bubble as a **`<foreignObject>` inside
  the map's SVG**, created on every reveal and removed on every rating.
- `will-change: transform` forces a **persistent compositor layer inside a
  `foreignObject`** — the exact construct `styles.css:29-41` documents as broken
  on WebKit, and which [[mindmap-ios-transform-pan]] records as "safe only
  because of the transform fix".
- **That transform fix is iOS-only**: `MindMapView.ts:214`,
  `panByTransform = Platform.isIosApp`. Android pans by **rewriting the SVG's
  `viewBox`**, confirmed in the round-5 trace (`vbW`/`vbH` moving 2748×5433 →
  1131×2236 → 607×1201 while `svgW`/`svgH` stay 387×770).

So on Android the bubble holds a promoted layer inside a foreignObject for its
whole life, while the SVG viewport underneath it is invalidated on every pan
frame — 335 cull passes in the round-5 session. On iOS the ancestor transform
moves descendant layers correctly, which is the entire reason the transform pan
exists; on the viewBox path nothing moves the layer, and nothing ever smeared
there either, so the promotion bought nothing and cost a re-composite per frame.

Fit against every surviving constraint:

| Constraint from the evidence | Fits? |
|---|---|
| Abrupt kill, no JS exception | ✔ compositor-side, not main thread |
| Main thread healthy to the last record | ✔ nothing on the main thread involved |
| No ramp in any JS counter | ✔ invisible to every census we built |
| Mobile only, laptop fine | ✔ Android WebView vs desktop Chromium |
| Clusters near ratings | ✔ the bubble is created/destroyed per reveal/rate |

### The change

One rule, scoped rather than deleted:

```css
.osmosis-mindmap-svg-transformed .osmosis-spatial-rating { will-change: transform; }
```

iOS keeps the layer it needs; Android and desktop stop promoting one inside a
foreignObject. `.osmosis-contextual-rating` (sequential study, outside the SVG)
is untouched. `npm run lint` clean, 1924 tests pass, build green.

**Honest status: this is a hypothesis, like the five before it — but unlike them
it costs one selector, carries no behavioural risk off iOS, and is the first
candidate that is specifically invisible to the instrumentation, which is what
round 5's silence demands.** The instrumentation is deliberately left in the
build for this run, so the CSS is the only variable: a crash still produces a
trace, and no crash is a clean A/B against four instrumented crashing sessions.

Worst case if wrong: the rating bubble may smear slightly during an Android pan
— cosmetic, and never observed there.

### Round 6 result — dead. Sixth hypothesis, and it was a guess

Crashed again, same place. **The CSS change has been reverted** (`styles.css` is
back at HEAD): a fix that does not fix anything does not belong on this branch,
and leaving it would silently poison the next A/B. If the scoping is worth
having on its own merits it belongs on a separate cleanup ticket, not here.

Two further things this session ruled out, both by reading the user's own data
rather than by theory:

- **Heavy content at the crash site.** `Topics/Web 2.0.md` is 13 lines of plain
  list text under ~120 lines of schedule frontmatter — **no images, no embeds,
  no video links, no code blocks**. The region the crash always lands in is the
  *lightest* content on the map. Any "expensive node content" theory is dead.
- **`replaceVideoEmbeds` building live `<iframe>`s inside a `foreignObject`**
  (`MindMapView.ts:8932`) — a genuinely alarming construct for mobile, and
  invisible to every counter we built (an iframe is one DOM node and its memory
  lives in another frame). But `VIDEO_EMBED_PATTERNS` matches YouTube/Vimeo
  only, and there is not one such link anywhere on this map. Not this bug.
  **Still worth its own ticket** — embedding live video players into map nodes
  on a phone is a footgun waiting for a note that does have a link.

### The one unexplained regularity left

Rounds 4 and 5 died at **viewBox 621×1229 and 607×1201** against a constant
387×770 viewport — **scale 0.623 and 0.638**, a 2 % spread, across sessions of
88 s and 44 s that ended on different cards.

Confounded, and it must be stated: the map auto-fits *toward* that zoom and then
holds it (round 5 reached vb 607 at ms 39445 and sat there for the last 5 s), so
a death uniformly distributed over late session time lands at ~0.63 anyway. It
is a lead, not a finding — but it is the only quantitative regularity that has
survived, and "the same spot" the user has reported from the very first bug
report is exactly where the auto-fit converges.

**n = 2 and confounded is not a licence to build fix #7.** What it is good for
is choosing the next experiment.

## Round 7 — SOLVED (mechanism): the WebView renderer is OOM-killed at 0.6–1.4 GB

User captured an Android bug report (Settings → Developer options → Take bug
report) into `ref/bugreport-stallion-CP2A/`. **This is the first device-side
evidence in the investigation and it ends the guessing.**

Device timezone is `America/New_York` (UTC−4), which aligns
`dumpsys activity exit-info` against the trace exactly:

| Trace crash session (UTC) | Exit record (EDT) | WebView renderer RSS |
|---|---|---|
| 02:33:55 (round 2) | 22:34:54 | **1.4 GB** |
| 02:44:17 | 22:45:22 | **1.2 GB** |
| 02:51:09 (round 3) | 22:52:07 | **880 MB** |
| 02:43:46 | 22:43:40 | 642 MB |
| 08:29:49 (round 5) | 08:31:54 | 0.00 — already dead |

For scale, **every other app's WebView renderer on this device runs 70–225 MB.**
Obsidian's runs 320 MB–1.4 GB. Device has 7.7 GB total, and `lmkd` was observed
killing five processes in one burst at 09:25:38.

`dumpsys meminfo` one minute after a *fresh* launch:

- **Browser process** `md.obsidian` (pid 24817): 426 MB RSS, including
  **EGL mtrack 80 MB + GL mtrack 63 MB = 144 MB of GPU memory** — the largest
  graphics allocation of any process on the device.
- **Renderer** `…SandboxedProcessService0` (pid 24878): 473 MB RSS, of which
  **`Unknown` is 294 MB RSS / 292 MB private dirty**, with `Native Heap` only
  8 MB and `Graphics` 0.

That `Unknown` private-dirty is anonymous renderer memory — Blink's
PartitionAlloc and **discardable memory, which is where decoded images and
raster tiles live**. It is precisely the region `performance.memory` cannot see.

**This closes the round-5 question.** Death was instantaneous, the main thread
was healthy, no JS counter moved — because the renderer was killed from outside
for holding ~1.2 GB of memory that JS has no visibility into. Every JS-side
theory failed because the answer was never on the JS side.

### What this does and does not settle

**Settled:** the crash is an out-of-memory kill of the WebView renderer, driven
by native (non-JS-heap) memory. The fix is a footprint reduction, and there is
now a **metric to verify against** — renderer RSS in a fresh bug report —
instead of crash/no-crash roulette.

**Not settled:** *which* native consumer. The DOM is ~1,700 nodes and the JS
heap 167 MB; neither can account for 1.2 GB. The leading candidate is **decoded
image data**, for one specific and checkable reason:

- The map carries 5–11 images (`imgs` in the census).
- A pasted screenshot decodes at source resolution regardless of its display
  size — a 2160×1620 PNG is ~14 MB of bitmap whether it is shown at 2160 px or
  at the `![141]` the note asks for.
- Chromium caches a decode **per drawn scale**, and the round-5 trace shows the
  viewBox stepping through many distinct scales as the map auto-zooms
  (2748 → 1131 → 1102 → 888 → 739 → 695 → 607). Eleven images across eight
  scales is ~88 full-resolution decodes.
- **It only ever reproduces on the production vault.** The repo fixture's image
  embeds point at `../../media/…` outside the fixture and do not resolve, so the
  fixture map has no images — which would explain the one asymmetry nobody has
  been able to account for.

### Next action — a 60-second test with no code and no tools

Temporarily delete the three image embeds from the top of
`Full Stack Engineering.md` (the ARPANET SVG, the `Pasted image …png`, and
`Web1vsWeb2_v2.webp`), reload, and study past the usual crash point.

- **Survives** → images confirmed; build the real fix (decode-at-display-size
  for map node images, preserving the `<img>` element and its `alt` so the
  occlusion path in `applyFenceHidden` keeps working).
- **Still crashes** → images are not it; the consumer is raster/compositing, and
  the fix is to bound what the map rasterises.

Either way the next change is chosen by measurement, not by reading code.

## Round 8 — images are not it either, and `performance.memory` was hiding the heap

Second bug report (`ref/bugreport-stallion-CP2A…15-07-28/`), taken after the
user removed the image embeds from the map and crashed again at the same place.

| Run | Browser RSS | Renderer RSS |
|---|---|---|
| With images (09-06 22:34) | 571 MB | **1.4 GB** |
| With images (09-07 09:00) | 605 MB | **0.90 GB** |
| **Images removed** (09-07 13:28) | 272 MB | **660 MB** |
| **Images removed** (09-07 15:05) | 271 MB | **805 MB** |

**Images were a real consumer and are not the cause.** Removing them roughly
halved both processes and the crash is unchanged. Decoded-image caching is now
ruled out as the mechanism (though the halving is worth keeping in mind for a
separate optimisation ticket).

`dumpsys meminfo` on the live renderer, images removed:

- `Unknown` **167 MB RSS / 166 MB private dirty** — and this process reached
  805 MB during the crashing run.
- `Native Heap` 8.5 MB. `Graphics` 0.
- Browser process separately holds **151 MB of GPU memory** (EGL 81 + GL 70).

**`Unknown` private-dirty anonymous memory is where V8's heap lives.** And
session 4 established that `performance.memory` on this device is *quantized* —
it read 167 MB and never changed value across any session, which is why the note
says to treat it as uninformative. It was not evidence of a flat heap. **A heap
growing to hundreds of megabytes would have looked exactly like what we saw.**

### The defect this points at was measured in round 3 and dismissed on the wrong axis

Round 3 measured **11,945 `mapCards()` calls in 12 s** and concluded: 675 ms of
~12 s = 5.6 % of wall clock, "real inefficiency, not the crash." That conclusion
was correct about **CPU** and silent about **allocation**, and the bug report
says the kill is about memory.

What each of those ~12,000 calls does (`MindMapView.ts:1104`):

- allocates a `Set<string>` and walks all ~154 nodes to fill it;
- calls `CardStore.getCardsByNote()` once per source file — **14 freshly
  allocated arrays per call** (`CardStore` builds a new `Card[]` every time);
- spreads them into one more ~140-element result array.

`applySpatialStateInner` drives it **per node, per animation frame**:
`applySpatialHidden` → `nodeOcclusion` → `mapCards()`. On a 45 s session that is
on the order of 30,000 calls, ~450,000 array/Set allocations and millions of
element writes — a firehose of short-lived garbage. V8 grows its heap to absorb
that allocation rate, and on Android RSS does not come back down.

### The fix

Hoist `mapCards()` out of the per-node loop: build it **once per pass** and
thread it through `applySpatialHidden` → `nodeOcclusion`. Both had exactly one
caller, so the change is four small edits and no behavioural difference — the
same array, computed once instead of ~86 times per frame.

`npm run lint` clean, 1924 tests pass, build green.

**Confidence, stated honestly:** this removes one *measured* allocation source
and reduces it ~86×. Whether it accounts for all ~640 MB of study-time growth is
not established. What is different from rounds 1–6 is that we are no longer
guessing at a mechanism class — the class is known (renderer memory), the defect
is measured (11,945 rebuilds), and **there is now a dial to read**: renderer RSS
in a bug report. A partial improvement is informative instead of ambiguous.

The instrumentation stays in deliberately: `mapCardsCalls` in the census should
now track `cullPasses` roughly 1:1 instead of ~86:1, which proves the hoist
landed on-device.

## Round 9 — the crash is POSITIONAL. The user was right all along.

The hoist did not fix it, and the "16 cards vs 10" reading of it was wrong:
sessions **resume where the queue left off**, so card count says nothing about
endurance if the kill lands at a fixed node.

Last cards logged per session, from the **device-sharded** review log (the
reliable artefact):

| Session end (EDT) | n | Last three cards |
|---|---|---|
| 09-06 22:34 | 9 | JQuery → WebFrameworks → **Django** |
| 09-06 22:45 | 8 | TechThatMadeIt → JQuery → **WebFrameworks** |
| 09-06 22:52 | 4 | NotWholePage → UserGenContent → TechThatMadeIt |
| 09-06 22:58 | 8 | TechThatMadeIt → JQuery → **WebFrameworks** |
| 09-07 08:31 | 8 | TechThatMadeIt → JQuery → **WebFrameworks** |
| 09-07 09:00 | 7 | UserGenContent → TechThatMadeIt → JQuery |
| 09-07 09:01 | 6 | JQuery → WebFrameworks → **Django** |
| 09-07 09:23 | 8 | TechThatMadeIt → JQuery → **WebFrameworks** |
| 09-07 15:07 | 10 | Wikis → TechThatMadeIt → JQuery |
| 09-07 15:21 | 16 | UserGenContent → SocialMedia → Blogging |

**Eight of ten end within two cards of `os-luxm54` (Django)**, at card counts of
4, 6, 7, 8, 9, 10 and 16. The review-log flush is debounced, so the true last
rating is one or two *past* the last logged one — which puts the kill at the
Django node itself.

**This is positional, not cumulative**, and it invalidates the framing of rounds
5–8. "Death 1–2 s after a rating" was dismissed as a base-rate artefact; it is
better read as "death when the map reaches one particular place". The card
count varies because the queue resumes; the node does not.

Django / Ruby-on-Rails / Spring are the three deepest leaves of the map, under
`Tech that made it possible → Web Frameworks`. Two independent facts now line
up on them:

- Rounds 4 and 5 died at **viewBox 621 and 607** against a 387 px viewport —
  scale 0.623 and 0.638, the most zoomed-in state observed all session. Reaching
  the deepest, smallest subtree is exactly what drives the auto-fit to maximum
  zoom.
- The renderer is already at 300–800 MB by then (round 7/8), so a large
  transient raster allocation at max zoom has very little headroom.

### Next test — 30 seconds, no study mode at all

**Open the map in ordinary (non-study) mode and pinch-zoom into the Django /
Web Frameworks region.** No ratings, no schedule writes, no review log, no
spatial state.

- **Crashes** → the bug has nothing to do with study mode. It is rendering the
  map at that position and zoom, and every study-mode theory from rounds 1–9 was
  chasing a passenger. The fix goes into layout/raster.
- **Survives** → it needs the study path, and the difference between a plain
  pan-zoom and a study pass over the same node is a very short list.

Either result cuts the remaining space in half, and neither needs a trace.

### Instrumentation defect fixed: the trace was being clobbered by Sync

`tracePath()` used **one shared filename** while `ReviewLog` shards per device
via `platformDeviceLabel()`. The phone and the laptop both append to
`debug-trace.md` inside the synced vault, so Sync keeps one copy and discards
the other — which is why the newest Android study session is **missing from the
trace** while the laptop's 7-card session survived, and very likely what the
"stale copy" in round 3 actually was. Records from sessions 65 minutes apart are
visibly interleaved in the file.

Now `debug-trace.<device>.md`, mirroring the review log. Lint clean, 1924 tests
pass, build green. **Delete the old shared `debug-trace.md` on both devices.**

## Round 10 — a live `<a>` default action on the touch path

**Zoom test result: no crash.** The user pinch-zoomed into the Django /
Web Frameworks region in ordinary map view for 81 s (`spatial: "off"` in
`debug-trace.mobile-android.md`, 6 taps, no crash). So the map renders that
subtree at that zoom perfectly well, and the crash needs the **study path**.

But the test varied two things at once, and that is on me: study mode also means
**tapping nodes**. Zooming never taps a node's content.

### The defect

`handleClick` opens with:

```ts
private handleClick = (e: MouseEvent): void => {
    if (this.lastPointerType === "touch") return;   // ← above the anchor branch
```

Its `<a>` handling — `e.preventDefault(); e.stopPropagation();` then
`openLinkText` — sits *below* that early return. `handleTouchTap` (the pointerup
path a phone takes) has no anchor handling at all. So on desktop a link inside a
node is cancelled and routed through Obsidian; **on a phone nothing cancels it,
and the anchor's default navigation stays live.**

Why it lands on these three nodes and nowhere else:

```
- [JQuery](JQuery.md) could fetch data while page is running   ^os-bcj6t7
- [Web Frameworks](Web%20Frameworks.md) connected to databases ^os-hhlkje
    - [Django](Django.md)          ^os-luxm54
    - [Ruby-on-Rails](Ruby-on-Rails.md) ^os-did1ua
    - [Spring - Software](…)       ^os-8v3bjq
```

**Django, Ruby-on-Rails and Spring are the only nodes on the map whose entire
content is a bare internal link.** Every other card has prose around its link, so
a tap usually lands on text. On these three the anchor fills the node and a tap
can hardly miss it — and in study mode tapping the node *is* the interaction.

### Why this fits what six other theories could not

| Evidence | Fits |
|---|---|
| Instantaneous death, no ramp in any counter | ✔ navigation, not exhaustion |
| Main thread healthy to the last 30 ms | ✔ nothing was struggling |
| No `session-stop`, `onunload` never ran | ✔ document replaced, not unloaded |
| Trailing review-log entries lost | ✔ debounced flush dies with the document |
| Desktop unaffected | ✔ the mouse path always cancelled it |
| Non-study zoom survives | ✔ zooming never taps an anchor |
| Positional — always the same three nodes | ✔ only bare-link nodes are unmissable |
| Images/`mapCards`/CSS changes did nothing | ✔ none of them touched this |

The renderer sitting at 0.6–1.4 GB (round 7/8) is real and worth its own ticket,
but it is the *vault's* footprint, not the trigger.

### The fix

Cancel the anchor's default action on the touch path, in the click handler that
already owns that job — five lines, touch-only, no change to desktop behaviour
and no change to study-mode semantics (the reveal already happened on pointerup;
this only stops the browser navigating afterwards).

`npm run lint` clean, 1924 tests pass, build green.

### Confirming the mechanism

Independent of the fix, one 10-second check proves it existed: in **ordinary**
map view (no study mode), tap directly on the "Django" link text. If that
navigates or crashes on the old build, the anchor's default action was live.

## Round 11 — CONFIRMED FIXED, and one regression fixed on top

User studied straight through the Django region with no crash. **Ten rounds and
seven dead hypotheses; the cause was a live `<a>` default action on the touch
path.**

Regression found immediately afterwards: outside study mode a tap on a link no
longer opened the note. Cancelling the anchor's default action is only half of
what the mouse path does — it also *performs* the navigation through
`openLinkText`, and only the cancelling half had been ported.

Fixed by splitting the two halves deliberately across the two handlers:

- `openNodeLink()` — extracted; both input paths now share one implementation.
- `handleTouchTap` (pointerup) **performs** the navigation, skipped in study
  mode where a tap is a reveal.
- `handleClick`'s touch branch **cancels** the browser's own navigation.

Both are needed and they cannot be merged. A touch `pointerdown` on a node calls
`preventDefault()`, which in Chromium can suppress the click entirely — so the
click handler is a reliable place to cancel the browser's default but *not* a
reliable place to perform ours. **Do not "simplify" this into one handler.**

Working snapshot committed as `d27dfdf` on `fix/study-mode-transclusion-crash`,
instrumentation included on purpose.

## Scope expansion — cleanup and the defects found along the way

Per the user: the incidental fixes found during this investigation stay on **this**
task rather than being split into new tickets, so nothing gets re-derived later.
The task is therefore not done at the fix; it is done when the tree is clean and
the real defects below are dealt with.

### Must happen before anything merges — **all done**, see "What was implemented"

1. **Strip the instrumentation.** Delete `src/debug-trace.ts` and every call
   site. `grep -rn "TEMPORARY — study-mode crash instrumentation" src/` finds
   them all — `main.ts`, `views/MindMapView.ts`, `store/ScheduleStore.ts`,
   `store/ReviewLog.ts`. Also remove `traceCounters` from `MindMapView` and the
   trace-flush command in `main.ts`. **Keep the `mapCards()` hoist** in
   `applySpatialStateInner` — it is a real fix, not instrumentation, and its
   comment references "round 8" which should be reworded to stand alone.
2. **Delete the generated traces** from the user's vault:
   `vault/Osmosis/Reviews/debug-trace.md` and `debug-trace.mobile-android.md`.
3. **Delete the bug reports** in `ref/bugreport-stallion-CP2A*` — 593 MB, three
   directories, already gitignored. Everything of value from them is quoted in
   rounds 7 and 8 above.
4. Verify `npm run lint && npm test && npm run build` and that
   `git diff main --stat` contains no `vault/tests/…` fixture churn.

### Real defects found, to carry on this task

Each was measured during the investigation. None is the crash; all are worth
fixing.

| # | Defect | Where | Evidence |
|---|---|---|---|
| 1 | `applySpatialState` does two whole-SVG `querySelector` attribute scans **per node per animation frame** (~103,000 per session) | `MindMapView.applySpatialStateInner` | round 3 |
| 2 | `nodeHtmlCache` is never written for fence nodes — the `set` sits in the non-fence branch of `drawNode`, so every fence draw re-runs `MarkdownRenderer.render` | `MindMapView.drawNode` ~9333 | round 2 |
| 3 | `ReviewLog` re-buffers entries that already reached disk when a post-append step throws, producing duplicate timestamps | `ReviewLog.ts` ~900 | session 3 |
| 4 | `debouncedSync` is one shared closure keyed on nothing, so a burst touching N notes syncs only the last | `main.ts` ~513 | session 3 |
| 5 | Startup race behind "No cards are due on this map" — `cardStore` is filled asynchronously by `syncAll` | `main.ts` / `MindMapView.enterSpatialStudy` | session 3 |
| 6 | `ScheduleStore`'s 2 s debounce is *trailing*, so a fast rating streak defers every frontmatter write until the user pauses | `ScheduleStore.ts` | round 5 |
| 7 | `replaceVideoEmbeds` builds live `<iframe>`s inside a `foreignObject` — a YouTube link on a mobile map would embed a full player | `MindMapView.ts` ~8932 | round 9 |
| 8 | Obsidian's WebView renderer reaches **0.6–1.4 GB RSS** on this vault (other apps: 70–225 MB); removing image embeds halved it | measured, `dumpsys` | rounds 7–8 |

Defect 8 is a genuine footprint problem and the largest remaining risk on
mobile, but it is **not** what caused this crash and it is much bigger than the
rest. **Split out** into
[[Obsidian's WebView renderer holds 0.6-1.4 GB on this vault]], which carries
the `dumpsys` measurements, the `performance.memory` caveat and the candidate
levers. This task closes on 1–7.

Order agreed with the user for 1–7, impact first, one build and one round of
phone testing per group:

| Round | Defects | Why first |
|---|---|---|
| A | 6, 3, 4 | Data integrity — these lose or duplicate review data |
| B | 5 | The user-visible symptom reported in this very bug report |
| C | 1, 2 | Hot-path cost; invisible but cheap |
| D | 7 | Latent — no YouTube embeds on the map today |

**All four rounds shipped.** Defect 7 was cut back to its measurable half after
the user asked what the benefit was — the answer is in "Decisions worth
remembering" below.

### Decisions worth remembering

- **`performance.memory` is quantized on this Android device** — it reported a
  constant 167/177 MB all session and never moved. It is not evidence of a flat
  heap. On desktop Electron it is precise (fractional MB). Do not build an
  argument on a mobile heap reading.
- **The debug trace must be sharded per device.** It lives in a synced vault and
  both phone and laptop write it; a shared filename let Sync discard the phone's
  records and cost at least one wasted round. `ReviewLog.platformDeviceLabel()`
  is the pattern.
- **`dumpsys activity exit-info` is the tool that ended this.** Android bug
  report → Developer options → Take bug report; no adb, no cable. It gives the
  per-process kill reason and RSS retroactively. Reach for it early next time,
  not after six code-reading hypotheses.
- **When the user says "it's always the same spot", that is data.** It was
  dismissed twice as a base-rate artefact and it was the single most
  discriminating fact available.

# What was implemented

## Where it shipped

[PR #37](https://github.com/SawyerRensel/Osmosis/pull/37), from
`fix/study-mode-transclusion-crash` into **`release/0.0.6`**, merged as
`b1b18f6`.

| Commit | What |
|---|---|
| `d27dfdf` | The crash fix — cancel the anchor's default action on the touch path |
| `b749674` | Strip the instrumentation |
| `69c92ff` | Split defect 8 into its own note |
| `74bf254` | Defects 6, 3, 4 — data integrity |
| `0af57a2` | Defect 5 — the reported symptom |
| `af499a8` | Defects 1, 2 — hot-path cost |
| `051f30f` | Defect 7 — the measurable half |

Every round was confirmed on the user's Android device before it was committed.

## The cause

**A live `<a>` default action on the touch path.** `handleClick` opened with
`if (this.lastPointerType === "touch") return;`, and its anchor handling —
`preventDefault()` then `openLinkText` — sat *below* that early return.
`handleTouchTap`, the pointerup path a phone actually takes, had no anchor
handling at all. So on desktop a link inside a node was cancelled and routed
through Obsidian; on a phone **nothing cancelled it and the anchor navigated the
document away**, taking the renderer with it.

It landed on Django, Ruby-on-Rails and Spring because those are the only nodes
on the map whose entire content is a bare internal link. Every other card has
prose around its link, so a tap usually lands on text; on those three the anchor
fills the node and a tap can hardly miss it — and in study mode tapping the node
*is* the interaction.

That is why the crash was **positional and instantaneous**, why no JS counter
ever moved, why `onunload` never ran, why trailing review-log entries were lost
with a healthy main thread, and why desktop was never affected. Ten rounds and
seven falsified hypotheses reached it; the measurements that killed each are
above and should not be re-run.

## The fix

Five lines, touch-only, split deliberately across two handlers:

- `openNodeLink()` — extracted, so both input paths share one implementation.
- `handleTouchTap` (pointerup) **performs** the navigation, and is skipped in
  study mode where a tap is a reveal.
- `handleClick`'s touch branch **cancels** the browser's own navigation.

## Decisions worth remembering

Each of these is something a future session could plausibly "simplify" and
thereby reintroduce a bug.

- **The two link handlers cannot be merged.** A touch `pointerdown` on a node
  calls `preventDefault()`, which in Chromium can suppress the click entirely —
  so the click handler is a reliable place to *cancel* the browser's default but
  not a reliable place to *perform* ours. Merging them was tried; it regressed
  link-opening outside study mode within a day.
- **`ScheduleStore.armTimer` must not re-arm.** It is a leading-armed window on
  purpose, not a reset-on-every-call debounce. Restoring the `clearTimer` call
  at the top brings back "a rating streak writes nothing until you pause".
- **`ReviewLog`'s append is the commit point.** Anything added after it inside
  `appendToShard` must swallow its own errors. Letting a post-append step throw
  again makes `writeBuffer`'s catch duplicate entries already on disk.
- **Occluded fences stay out of `nodeHtmlCache`.** `renderOcclusion` hangs a
  one-shot `load` listener on its `<img>` to memoise the picture's natural size,
  and `cloneNode` carries neither that listener nor the `width`/`height`
  attributes it exists to supply. Caching them reproduces the no-intrinsic-size
  collapse those attributes were added to prevent.
- **Video embeds are still live on the draw path, and that is a decision.** A
  click-to-load facade was designed and rejected: the vault holds ~22 video
  links across 20 notes, about one per note, so the saving is roughly one iframe
  on maps that are rarely opened, against a permanent extra tap on every video.
  Only the offscreen measurement pass was changed. **Unlike defects 1–6, this
  one was never measured** — it was found by reading code in round 9 and was
  carried in the table with more weight than it earned.
- **`performance.memory` is quantized on this Android device** — see the
  decisions list above, and
  [[Obsidian's WebView renderer holds 0.6-1.4 GB on this vault]].
- **Shard the debug trace per device** if instrumentation is ever rebuilt. A
  shared filename in a synced vault let Sync discard the phone's records and
  cost at least one wasted round. `ReviewLog.platformDeviceLabel()` is the
  pattern.

## Surface map

| File | Change |
|---|---|
| `src/views/MindMapView.ts` | The crash fix (`openNodeLink`, `handleTouchTap`, `handleClick`); instrumentation removed; `mapCards()` hoist kept and `applySpatialStateInner` folded back in; node group looked up once and passed to `applySpatialHidden`; `cacheNodeHtml` helper written from both render branches; `deferUntilCardsLoaded` guard on study and peek; `replaceVideoEmbeds` gains `loadPlayer`; `resyncFromParent`'s doc comment un-orphaned |
| `src/main.ts` | Instrumentation removed; `cardStoreReady` / `isCardStoreReady` armed in `onload` and settled by the startup scan; `debouncedSync` drains a `Map` of pending files |
| `src/store/ScheduleStore.ts` | `armTimer` opens a window from the first staged entry instead of re-arming; instrumentation removed |
| `src/store/ReviewLog.ts` | `foldIntoCache` wrapped so a cache failure cannot roll back a committed append; instrumentation removed |
| `src/store/ScheduleStore.test.ts` | Replaced the reset-on-every-call test; added streak and re-arm coverage |
| `src/store/ReviewLog.test.ts` | Added the "does not re-queue entries that already reached disk" case |
| `src/debug-trace.ts` | Deleted |

Also deleted, none of it tracked: `vault/Osmosis/Reviews/debug-trace.md` and
`debug-trace.mobile-android.md`, and `ref/bugreport-stallion-CP2A*` (593 MB,
three directories). Everything of value from the bug reports is quoted in rounds
7 and 8 above.

## Test fixture

`e2e/fixtures/transclusion_study_issue/` — the master copy, 25 files, committed
in `b727f22`. It reproduces the map's shape: a host note transcluding ~15 topic
notes, including the three bare-link leaves under `Web Frameworks` that the
crash landed on.

The `vault/tests/transclusion_study_issue/` working copy was **removed in
`e0eadc1`** at close-out, because it had accumulated a session's worth of the
user's live schedule churn. Copy it back out of `e2e/fixtures/` to use it, and
reload Obsidian afterwards — see the reset hazard in `CLAUDE.md`.

**It does not reproduce the crash**, and that asymmetry was itself a clue: the
fixture's image embeds point at `../../media/…` outside the fixture and do not
resolve, so the fixture map carries no images and a much smaller footprint. The
crash only ever reproduced on the user's production vault, on the phone.

## Follow-ups

- [[Obsidian's WebView renderer holds 0.6-1.4 GB on this vault]] — defect 8,
  split out. Real, measured, unresolved, and the largest remaining mobile risk.
  Its first step is to re-measure: every number in it predates the `mapCards()`
  hoist and the seven fixes above.
- Defect 7's draw path, knowingly left as described under "Decisions worth
  remembering". No ticket — the reasoning is here so it is not re-derived.
- `styles.css` has the rule `.osmosis-node-content iframe.osmosis-video-embed`
  declared twice in a row (lines 177 and 181). Pre-existing, noticed while
  reading, deliberately not touched.

## Superseded — device-side evidence plan (kept for the record)

The one question worth a device run now: **was the renderer OOM-killed, or did
it segfault?** Those need entirely different fixes, and one command separates
them. In priority order:

1. **`adb shell dumpsys activity exit-info md.obsidian`** — Android's
   `ApplicationExitInfo`. **Retroactive**: run it *after* a crash, no live
   capture needed. Gives a reason per process (`LOW_MEMORY` / `CRASH_NATIVE` /
   `SIGNALED` / `OTHER`) plus RSS at death, and covers the WebView renderer
   child process, not just the app.
2. **`adb logcat -v time`** during a repro, filtered for
   `lmkd|obsidian|chromium|webview|Fatal|tombstone|kill`. `lmkd` naming the
   process is a memory kill; `Fatal signal` + a tombstone is a Chromium bug.
3. If neither is available, the differential runs below.

This dev box has **no network and no `adb`**, so the user installs it (Android
platform-tools + USB debugging) or runs it from another machine.

### Differential repro (no tooling; each run kills a class of cause)

Same map, same study, one variable at a time:

- **Airplane mode / Sync paused** → external kill from sync upload pressure.
- **Fresh reboot, all other apps closed** → device-wide memory pressure / LMK.
  If the crash needs a loaded device, it is an OOM kill and the fix is to shrink
  the renderer's footprint, not to find a bad line.
- **Map copy with the three image embeds removed** → image decode as the native
  allocation (`imgs` runs 5–11).
- **Same map on desktop, same duration** → whether it is Android-specific at all.

## Ruled out in session 4 — do not re-tread

- **`ScheduleStore.isWriting` going stale before `modify` fires.** Measured
  true, 3/3, on device.
- **`resyncFromParent` running during study.** Never runs. Nor does
  `ensureTreeFresh`, nor `loadFile`. Note the limit of this: it rules out the
  *modify-driven* rebuild paths, which is all round 1 instrumented. It does
  **not** establish that `renderPass` never runs — round 2 measures that.
- **JS-heap OOM.** 239 MB / 167 MB against a 2060 MB limit, and `performance.memory`
  never changed value across either session — treat it as quantized and
  uninformative, not as a flat heap.
- **Orphan node groups (secondary defect 2).** `groupChildren` === `renderedIds`
  at every sample of round 2. Measured; it does not happen.
- **DOM leak from uncached fence renders (secondary defect 5).** `domNodes` flat,
  `htmlCache` pinned at 139, `mdRenders` +3 across ten ratings. The missing
  cache write is still a real (minor) inefficiency, but it is **not** the crash.
- **The rollup-cache localStorage write.** `rollup-cache-save` never fired;
  `foldIntoCache` takes the `!wasCurrent` early return in practice.
- **Unresponsive-renderer / ANR kill.** Zero `stall` records across a whole
  12 s study ending in a crash; 1 s heartbeat ticks metronome-regular to the
  last record. The main thread was never blocked.
- **`applySpatialState` / cull passes as the cause.** 675 ms of ~12 s = 5.6 %.
  Real inefficiency (11,945 `mapCards()` calls in 12 s), not the crash.
- **An oversized composited layer / CSS-transform blowup.** SVG box constant at
  387×770 CSS px, viewBox 621×1229, across a whole crashing session.
- **`renderPass` never running during study.** It *does* — round 4 caught two
  mid-session. The round-3 reading was specific to that session, not general.

## Ruled out in session 5 — do not re-tread

- **Any slow accumulation JS can see.** Round 5's 50 ms burst holds every
  counter — cull passes, draws, markdown renders, spatial calls, `mapCards`
  calls, node groups, html cache — **frozen** for the last 135 ms, with the
  event loop turning at 30–100 Hz, and then silence. Nothing ramps. There is no
  curve left to find with a JS census; adding another counter will produce
  another flat line.
- **The tap / reveal path as the trigger.** `tap` is on `handleTouchTap` now and
  fired 12×; the kill landed 139 ms after a *rating*, ~360 ms before the next
  tap was due. The renderer was already dead when the user's finger landed.
- **The specific card ("it always dies on Ruby-on-Rails").** Round 5 died on
  `os-py1yjq`, seven cards earlier. Not a variable.
- **Work in flight at the moment of death.** Review-log write finished ~1 s
  earlier, the schedule debounce was not due for another 2 s, and no cull pass
  had run for 3 s. The map was static and idle.
