---
title: Exclude folders and Exclude tags
summary: Need a way to exclude decks by folder or tag in case of vaults within vaults and only want to see decks within a specific vault.
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-05T08:09:54.523Z
date_modified: 2026-08-06T02:56:00.000Z
date_start_scheduled: 2026-08-06T01:19:48.504Z
date_start_actual: 2026-08-06T01:19:48.504Z
date_end_scheduled: 2026-08-06T02:56:00.000Z
date_end_actual: 2026-08-06T02:56:00.000Z
pull_request: https://github.com/SawyerRensel/Osmosis/pull/14
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
---
# Feature Request

## What do you need built?

*Describe the new tool, script, or capability you're requesting.*

Similar to the existing include settings, let's make the opposite functionality - excluding notes in elected folders and/or tags even if they have `osmosis-cards` as `true` in note front matter.  

![](Pasted%20image%2020260805212235.png)

## What problem does this solve?

*Describe the problem or need. What are you trying to accomplish?*

Vaults within vaults may want to exclude notes of the internal vault from the parent vault to maintain an uncluttered Osmosis dashboard. 

## What's your current workaround?

*How do you currently handle this? Describe any manual steps or workarounds.*



## Reference Attachments/Screenshots

*Attach any reference files, screenshots, sketches, or examples.*

## What was implemented

Shipped in [PR #14](https://github.com/SawyerRensel/Osmosis/pull/14) → `release/0.0.4`.

### The shape of it

Two settings — **Exclude folders** and **Exclude tags** — sit directly under the include lists in Settings → Osmosis, reusing the same chip UI, `FolderSuggest`, and `TagSuggest`. They are the inverse of the include lists, not a filter layered on top of them.

There was no cause to diagnose here — this was new capability, not a defect. What mattered was the precedence question the feature request already answered: exclusion had to beat `osmosis-cards: true`, because the motivating case is a vault nested inside another vault whose notes you can't (and shouldn't have to) edit.

### The fix

`processNote` computes exclusion first and short-circuits:

```ts
const excluded = matchesFolder(excludeFolders, notePath) || matchesTag(excludeTags, noteTags);
const enabled = !excluded && (frontmatter.enabled || matchesFolder(includeFolders, …) || matchesTag(includeTags, …));
```

The folder and tag matchers were lifted out of the inline include checks into `matchesFolder` / `matchesTag` and shared by both paths, so include and exclude can never drift apart in how they interpret a path or a tag.

When a note becomes excluded, `CardSyncService.syncFile` sees `enabled: false`, generates no card IDs, and its existing cards fall out of the store on the same pass that already handles un-opting-in a note. `saveSettings()` re-syncs the whole vault, so chips take effect without a reload.

### Decisions worth remembering

- **Exclusion is absolute, by design.** It beats frontmatter opt-in *and* a matching include folder/tag. There is deliberately no "include wins if more specific" rule — a nested vault would then need per-note edits to stay out, which is the exact problem this solves.
- **Matching mirrors the include lists rather than inventing new semantics.** Folders match the path itself or a `folder/` prefix, so `Inner Vaults` is not caught by `Inner Vault`. Tags match hierarchically *downward* only: excluding `archive` also excludes `archive/2026`, but excluding `archive/2026` leaves `archive` alone. Anyone tempted to "fix" the asymmetry should read the include-side tests first — they assert the same thing.
- **The rows live in the existing "Study mode" group**, next to the include rows. That group heading is a poor fit for note-inclusion settings, but the include rows were already there and moving them is a separate, user-visible reshuffle.
- **Chips write through `plugin.saveSettings()`**, not `setControlValue`, matching the include rows — the chip list mutates the settings array in place and saves.

### Drive-by fix: the chip input vanished on removal

`buildChipList()` calls `chipContainer.empty()` on every render, which detached the text input along with the chips. `addItem` re-appended it afterwards; the remove handler never did — so removing a chip took the input with it until the settings window was reopened. Caught during manual testing of this feature, but **pre-existing**: it affected the two include lists all along.

The input is now built detached (`createEl`, not `chipContainer.createEl`) and re-appended at the end of `renderChips()`, so every render restores it. The ad-hoc re-append in `addItem` is gone. Order matters: `renderChips()` runs before `opts.createSuggest(input)` so the input is in the DOM when the suggester binds to it.

### Surface map

| File | Change |
|---|---|
| `src/settings.ts` | `excludeFolders` / `excludeTags` on `OsmosisSettings` + defaults; two chip-list rows; `buildChipList` input-detachment fix |
| `src/card-gen/note-processor.ts` | `excludeFolders` / `excludeTags` options; extracted `matchesFolder` / `matchesTag`; exclusion short-circuits `enabled` |
| `src/main.ts` | Passes both settings through to `CardSyncService` |
| `src/card-gen/note-processor.test.ts` | 9 tests: folder exclusion (exact, nested, no partial-name match), tag exclusion (exact, parent-catches-child, child-does-not-catch-parent), exclusion overriding `includeFolders` and `includeTags`, and a control note left enabled |
| `docs/flashcards/decks.md`, `docs/flashcards/index.md` | Documented the lists and their precedence |

### Test fixture

`e2e/fixtures/exclusion/` → `vault/tests/flashcard/exclusion/`. Four notes, all `osmosis-cards: true`, all in deck `exclusion-test`: a control note outside every exclusion, one in `Inner Vault/`, one two levels deep in `Inner Vault/Nested/`, and one tagged `archive/2026`. Verified 4 → 2 cards on folder exclusion, → 1 on tag exclusion, back to 4 when the chips are removed, and exclusion beating an include folder that covers the whole fixture tree.

### Follow-ups

None. No per-note exclusion override (`osmosis-cards: false` beating an exclusion list) was requested or built.