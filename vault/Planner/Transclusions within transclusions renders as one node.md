---
title: Transclusions within transclusions renders as one node
summary: Transclusions within transclusions renders as one node when link is indented in a list.  Sometimes it doesn't render at all but instead shows a node with a dashed border.
tags:
  - task
calendar:
  - Bug
context:
people:
location:
related:
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-31T08:53:15.313Z
date_modified: 2026-09-01T02:01:59.926Z
date_start_scheduled: 2026-09-01T02:21:51.000Z
date_start_actual: 2026-09-01T02:21:51.000Z
date_end_scheduled: 2026-09-03T01:32:52.000Z
date_end_actual: 2026-09-03T01:32:52.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/36
parent:
children:
blocked_by:
cover:
color:
---
# Bug Report

## Environment

| Field            | Value |
| ---------------- | ----- |
| Platform         |       |
| Operating System |       |

## What happened?

*What actually happened? Describe what went wrong.*

​![](../media/Pasted%20image%2020260831085322.png)
![](../media/Pasted%20image%2020260831085349.png)

A note embedded inside another note rendered as a single monolithic node —
its own bullets, headings and flashcards all flattened into one node's label,
under a lone `•`. Separately, some embeds did not render at all and showed a
dashed-border node bearing the raw link text.

## What should have happened?

*What did you expect to happen instead?*

The inner embed should expand into its own nodes, exactly as a top-level embed
does, however deep it sits — and a link that Obsidian itself resolves should
never draw the dashed "unresolved" node.

## Where is this file located?

*Paste the filepath location  (if the bug occurred in a test file)*

`vault/tests/mindmap/embed-nesting/Networking History.md` (fixture written for
this task; the report came from the user's own Programming vault).

## Steps to Reproduce

### 1. Start from

A note that embeds another note: `![[ARPANET]]`.

### 2. Prep/settings

None. Default settings, Mind Map view.

### 3. Do this

Give the embedded note a list whose item *carries* an embed —
`- ![[TCP-IP]]` — rather than an embed on its own line.

### 4. Trigger

Open the host note in Mind Map view. The whole of TCP-IP renders inside one
node instead of expanding.

---

# What was implemented

## Where it shipped

[PR #36](https://github.com/SawyerRensel/Osmosis/pull/36), branch
`fix/nested-transclusion-renders-as-one-node` → `release/0.0.6`.

## The cause

**Three bugs, stacked** — which is why the symptoms looked inconsistent.

**1. A list item carrying an embed was never an embed.** `parseLineContent`
only matched `![[…]]` at the *start* of a line (after indentation). `-
![[TCP-IP]]` hit the bullet rule first, so it parsed as a bullet whose
`content` was the literal text `![[TCP-IP]]`. `TransclusionResolver` only ever
walks nodes of type `transclusion`, so it never saw the embed at all; the mind
map then passed that content to `MarkdownRenderer`, which dutifully rendered
the entire embedded note as one item's label. A *bare* indented embed
(`\t\t![[…]]`) always worked — the difference is the `- ` carrier, not the
nesting, so the title's "transclusions within transclusions" was a red herring
for this half.

**2. But the title was right about the other half.** `expandNode` replaced
transclusions it found in a node's `children`, and after expanding an embed it
recursed with `expandNode(child, …)` for each expanded child — which processes
that child's *children*, never asking whether the child was itself a
transclusion. So an embed nested under a heading inside the embedded note
expanded (the existing A→B→C test covers exactly that shape and passed), while
one at the embedded note's *top level* was walked past and left unexpanded.
Fixing (1) turned every `- ![[…]]` into precisely that case, so the first
integration test written for (1) failed and uncovered (2). Neither fix works
without the other.

**3. The dashed border was a third, unrelated cause.** `resolveToFile` reduced
a link target with `linkTarget.split("#")[0]` and nothing else. So it never
stripped a `|alias` (or `|300` sizing), never percent-decoded, and never
resolved a `../` path. `![](../../Topics/World%20Wide%20Web.md)` — the form
Obsidian writes for a markdown-style link to a note whose title has spaces —
failed all three ways at once and fell through to the unresolved style in
`styles.css`.

## The fix

- **parser** — `liftListItemEmbed` lifts a trailing note embed out of a list
  item's text. An item that is *only* an embed becomes the transclusion node
  itself; one with text in front keeps its own node and takes the embed as a
  child whose `range` covers just the `![[…]]` span inside the line.
- **transclusion** — `expandChildren` runs over a sibling *array* rather than a
  node's children, so an expansion's own top-level transclusions expand too.
  `expandNode` is now a one-line wrapper over it.
- **transclusion** — `embedTargetPath` strips alias and fragment;
  `linkCandidates` adds a percent-decoded spelling and a spelling resolved
  against the embedding note's folder.
- **mindmap-edit** — `serializeLine` indents a transclusion to its depth.

## Decisions worth remembering

- **The bullet is a carrier, not a parent.** An embed-only item is *replaced*
  by the expansion. Keeping the item would leave an empty `•` node parented
  over the content, which is what the map already looked like.
- **Only a *trailing* embed splits.** `- The ![[TCP-IP]] protocol` stays one
  inline node on purpose: splitting it leaves "The protocol" and loses the
  sentence, and inline is how Obsidian's reading view treats it too. This looks
  like the original bug in a screenshot — it isn't. Don't "fix" it without
  deciding what happens to the text on both sides of the embed.
- **A checkbox item never converts wholesale**, only splits. The checked state
  is content the item owns and a transclusion node has nowhere to keep it.
- **Media embeds never split.** `- ![[photo.png]]` is an image in a list item;
  `MarkdownRenderer` already draws it correctly and `isMediaEmbed` exists to
  keep it out of note expansion.
- **`embedHostRange` is stamped *after* the nested recursion, overwriting
  whatever an inner expansion set.** A node hoisted up to this level by an
  inner expansion is no longer bounded by the inner `![[…]]` line in *its*
  file, but by the outer one: a node's `embedHostRange` always indexes the file
  its **tree parent** lives in. The inner span would be read against the wrong
  file's bytes by any structural edit. The test asserting this originally
  asserted the inner span and failed — the failure was correct.
- **The literal path spelling is tried before the decoded one**, so a file
  genuinely named `Note%20Name.md` still wins over `Note Name.md`. Decoding is
  a fallback, not a rewrite.
- **`serializeLine` gained indentation for transclusions** because depth now
  carries meaning for them. Without it, moving a carrier embed re-serializes to
  column 0 and it pops out of the list it was nested in.

## Surface map

| File | Change |
| --- | --- |
| `src/parser.ts` | `liftListItemEmbed`, `findEmbed`, `EmbedRef`; bullet/ordered branches route through the lift; `buildTree` appends the lifted embed as a transclusion child |
| `src/transclusion.ts` | `expandChildren` extracted from `expandNode`; host range stamped after recursion; `embedTargetPath`, `linkCandidates`, `decodePercent`, `resolveRelative`; `lookup` |
| `src/mindmap-edit.ts` | `serializeLine` indents `transclusion` |
| `src/parser.test.ts` | 13 tests: carrier, nesting, split, ordering, inline, checkbox, ordered, markdown-style, plain link, media, block ID |
| `src/transclusion.test.ts` | 6 tests: alias, percent-decode, `../`, literal-wins, top-level embed in an embed, carrier inside an embed |
| `src/mindmap-edit.test.ts` | 1 test: transclusion indentation |

## Test fixture

`e2e/fixtures/embed-nesting/` → `vault/tests/mindmap/embed-nesting/`. Open
`Networking History.md` in Mind Map view. Two three-deep chains (host →
ARPANET → TCP-IP, host → World Wide Web → Packets) covering the carrier form,
the split form, mid-sentence inline, a checkbox item, a media embed, a plain
link, an aliased embed, and a percent-encoded `../` markdown embed. `TCP-IP.md`
carries a back-dated fence card so the flashcard-inside-a-nested-embed case is
visible. Expect no dashed-border node anywhere in the map.

## Follow-ups

- `![[Note#Section]]` still embeds the **whole** file — `embedTargetPath`
  strips the fragment rather than honouring it. Sectioning an embed is separate
  work and has no task note yet.
- The same trailing-embed split is *not* applied to paragraphs: `See also
  ![[TCP-IP]]` as a plain line stays one node. Scoped out deliberately; the
  bug was about lists.