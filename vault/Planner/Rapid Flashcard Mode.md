---
title: Rapid Flashcard Mode
summary: What if you could quickly create flashcards - especially on mobile - by activating a mode where adding a line of text as the front and then adding another line as the back and pressing enter to the third line creates a fence card?
tags:
  - task
calendar:
  - Feature
context:
people:
location:
related:
  - "[[Move Rapid flashcard mode below Source mode]]"
status: Done
priority:
progress_current:
progress_total:
date_created: 2026-08-12T22:09:14.525Z
date_modified: 2026-08-14T13:45:00.000Z
date_start_scheduled: 2026-08-14T12:30:00.000Z
date_start_actual: 2026-08-14T12:30:00.000Z
date_end_scheduled: 2026-08-14T13:45:00.000Z
date_end_actual: 2026-08-14T13:45:00.000Z
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
pull_request: https://github.com/SawyerRensel/Osmosis/pull/29
---
# Feature Request

## What do you need built?

A toggleable **Rapid Flashcard Mode** for the markdown editor. While it is on,
plain text typed into a note is turned into an `osmosis` fence card by blank
lines alone — no command, no placeholder text, no cursor wrangling. Aimed at
mobile capture, where the current flow costs far too many taps.

### The typing grammar

Blank lines are the only syntax. One blank line separates front from back; two
blank lines commit the card.

```
HTTP 429⏎                     ← front, line 1
What does the server want?▏   ← front, line 2 (no blank line between)
⏎                             ← Enter #1: now on an empty line
⏎                             ← Enter #2: one blank line above → front/back boundary
Too Many Requests⏎            ← back, line 1
Back off and retry later▏     ← back, line 2
⏎                             ← Enter #1: on an empty line
⏎                             ← Enter #2: one blank line above
⏎                             ← Enter #3: two blank lines → COMMIT
```

The buffer becomes, with the cursor left on a fresh line ready for the next
front:

````
```osmosis
HTTP 429
What does the server want?
***
Too Many Requests
Back off and retry later
```
▏
````

**Only the third Enter is intercepted** — the one pressed while the cursor sits
on an empty line whose predecessor is also empty. The boundary double-Enter
needs no handling at all; it is an ordinary blank line that the commit logic
reads backwards as the `***` split. Walking back from the cursor: skip the two
blanks → collect contiguous non-empty lines as the back → require exactly one
blank → collect contiguous non-empty lines as the front → stop at a blank line
or the start of the document.

### Code blocks

Either side of a card can be a fenced code block, which makes the walk
fence-aware in three places:

- A blank line **inside** a fence is code, not a card boundary.
- Walking up over a fence's closing delimiter takes the **whole block** with it,
  rather than stopping at the ` ``` ` line.
- The written `osmosis` fence is **one backtick longer than the longest run it
  contains** — four around a ` ```python ` block, five when that block is itself
  holding a fence. Never fewer than three.

The one thing the walk refuses to step over is another `osmosis` fence, so a
card typed directly beneath a card written moments earlier cannot swallow it.

### Opting the note in

A fence in a note without `osmosis-cards: true` generates **no card at all** —
`processNote` gates every generator, explicit fences included, behind the
note-level opt-in. So a card typed into a fresh note was inert until the user
noticed and added the property by hand.

Both editor-side insertion paths therefore opt the note in as a side effect:
Rapid Flashcard Mode, and the four `insert-card-*` commands. The order matters —
the editor is flushed with `view.save()` *before* `processFrontMatter`, which
reads the file from disk and would otherwise write frontmatter onto a copy that
does not yet contain the new card.

The write is skipped when the property is already there, so repeat insertions
cause no frontmatter churn. It is not skipped when a note qualifies through an
include folder or tag instead — matching the existing image-occlusion path,
which has always stamped the property regardless.

### Decisions

| Question | Decision | Why |
|---|---|---|
| Surface | In-editor transform, not a modal | You are already typing in the note; a modal is another thing to open. |
| Destination | At the cursor, in the active note | Capture lands where you are thinking. |
| Commit trigger | Two blank lines (third Enter) | Frees the single blank line to mean "front ends here", which is what buys multi-line fronts and backs. |
| Card type | Basic only — no meta lines | `bidi:`/`type-in:` stay with the existing `insert-card-*` commands. |
| Line capture | **Literal**, markers and all | A front or back may legitimately *be* a list; stripping `- ` would corrupt it. Cost: Obsidian's list auto-continuation can slip a `- ` into a card. |
| Toggle | Note's ellipsis menu (⋯), below "Source mode", plus a command | The menu is two taps on mobile; the command gives desktop a bindable hotkey. Checkmark shows state. |
| Exit | Toggle only | Nothing auto-exits: not Escape, not switching notes, not losing focus. |
| Persistence | In-memory; off at every startup | A persisted "on" would mean Enter behaving strangely days later in an unrelated note, with no memory of why. |

### Known limitations (accepted, not oversights)

- **No blank-line escape hatch.** While the mode is on you cannot leave two
  blank lines in a note without making a card, and trailing off a prose
  paragraph with a couple of Enters will fire one. Inherent to the grammar; the
  menu checkmark is the mitigation.
- **A non-`osmosis` fenced block directly above the front is absorbed into it.**
  The walk-up stops at an `osmosis` fence — a new card can never swallow a card
  written moments earlier — but it steps over a ` ```python ` block and keeps
  going, because that is exactly the behaviour that lets a code block *be* a
  card side. Leave a blank line after a code block you do not want captured.
- **Prose directly above the front is absorbed into it.** Two non-blank lines
  with nothing between them are one block by this grammar, so toggling the mode
  on and typing straight under an existing paragraph makes that paragraph part
  of the card front. Leave a blank line first.
- **A missing front means no card.** A back block with no blank-then-front above
  it falls through to a normal Enter rather than writing a half card.

## What problem does this solve?

Making a card today means the `insert-card-*` commands
([main.ts](../../src/main.ts) `registerCardInsertionCommands`): open the command
palette, pick the card type, then overtype two placeholder strings — `Front
content` is selected for you but `Back content` has to be reached by hand. On a
phone that is a command palette, a scroll, and two careful text selections per
card. It is enough friction that cards do not get made.

## What's your current workaround?

The `insert-card-*` commands, or typing the fence out by hand.

## Reference Attachments/Screenshots

- Fence parsing, including the multi-line front/back join around `***`:
  [explicit.ts](../../src/card-gen/explicit.ts)
- `Prec.highest(keymap.of(...))` precedent:
  [EmbeddableMarkdownEditor.ts](../../src/editor/EmbeddableMarkdownEditor.ts)

---

# What was implemented

## Where it shipped

PR [#29](https://github.com/SawyerRensel/Osmosis/pull/29), branch
`feature/rapid-flashcard-mode` → `release/0.0.4`.

## The design that survived contact

The grammar above is what shipped, with one change made mid-build. The first
cut committed on the Enter *after the back line*, which made a card exactly two
lines and no more. Switching the commit to two blank lines freed the single
blank line to mean "the front ends here" — and that one move is what buys
multi-line fronts and backs, at the cost of one extra keystroke per card.

The keystroke economics are the point of the whole feature: the `insert-card-*`
commands cost a command palette, a scroll, and two careful text selections per
card, which on a phone is enough friction that cards do not get made.

## The parts worth remembering

**Only one keystroke is intercepted.** The boundary double-Enter is not handled
at all — it is an ordinary blank line, and the commit logic reads it backwards
as the `***` split. Everything the mode does lives in one `Enter` handler that
returns `false` for every keystroke it does not claim, so the editor's own
behaviour (list continuation, splitting a line mid-word) is untouched.

**The block scan had to become fence-aware, and that was not a free change.**
The rule that originally stopped a code fence from being captured was the *same*
rule that stopped a new card from swallowing the closing ` ``` ` of the card
written a moment earlier. Supporting code blocks meant replacing "a fence
delimiter bounds a block" with a pre-scan of the document into fenced spans, so
the walk can step *over* a complete block while still refusing to step over an
`osmosis` fence. Do not "simplify" `scanFences` away — the swallow guard rides
on it.

**A delimiter only closes a block when it matches the opener's character, is at
least as long, and carries no info string.** That is what makes the ` ``` `
inside a ` ````markdown ` block content rather than a delimiter, and it is why
the nesting case works at all.

**The written fence is one backtick longer than the longest leading run it
contains**, minimum three. Leading runs only: inline code at the start of a line
must not widen the fence.

**The note opt-in is load-bearing, not cosmetic.** `processNote` gates every
generator behind `osmosis-cards: true`, explicit fences included, so a card
typed into a fresh note generated nothing and merely looked like a card. Both
editor-side insertion paths now opt the note in.

**`view.save()` before `processFrontMatter`, always.** `processFrontMatter`
reads the file from disk, while a just-typed card exists only in the editor's
buffer; writing frontmatter onto that stale copy would take the card with it.
This is the reset hazard wearing a different coat. Notes already carrying the
property short-circuit before the save, so repeat insertions cause no churn.

**The mode is in memory only.** A persisted "on" would mean Enter behaving
strangely days later in an unrelated note, with no memory of why.

## Surface map

| File | Change |
|---|---|
| `src/rapid-cards.ts` | New. `planRapidCard` plus the fence-span scan and backtick sizing. Free of `obsidian`/`@codemirror` imports so Vitest can reach it |
| `src/rapid-cards.test.ts` | New. 20 tests: commit shapes, code blocks at three backtick depths, and every case that must stay an ordinary Enter |
| `src/main.ts` | `Prec.highest` Enter keymap via `registerEditorExtension`; ⋯ menu toggle; `toggle-rapid-flashcard-mode` command; `hasCardsOptIn` / `ensureCardsOptIn` / `optInAfterCardInsert`; `insert-card-*` commands now take `ctx` and opt the note in |
| `e2e/fixtures/rapid-flashcard-mode.md` | New fixture: the grammar, multi-line sides, and the code-block cases |
| `e2e/fixtures/rapid-flashcard-optin.md` | New fixture: a note with no frontmatter at all, for the opt-in |

`ensureLineCardsOptIn` was renamed to `ensureCardsOptIn` — it now serves fence
paths, not just line cards. Its one prior caller (image occlusion) moved with it.

## Test fixtures

`vault/tests/flashcard/rapid-flashcard-mode.md` — the grammar (single and
multi-line sides), prose absorbed into a front, a card typed under an existing
`osmosis` fence, code blocks as back and as front, a blank line inside a code
block, a code block inside a code block, and the cases that must stay ordinary
Enters.

`vault/tests/flashcard/rapid-flashcard-optin.md` — deliberately has no
frontmatter, so the opt-in write is observable.

Manually verified across three rounds, including a card studied end-to-end so
its schedule round-tripped into the fence.

## Not done

**The ⋯ menu item sits above "Source mode", not below it.** Requested during the
build and not delivered: the public API exposes `setSection` and no
within-section ordering, and settling it needs the live menu's `data-section`
values, which cannot be read from this repo. See
[[Move Rapid flashcard mode below Source mode]], which carries the console
snippet and both candidate fixes.

**Deliberately left out**: card types beyond basic (`bidi:`, `type-in:` stay
with the `insert-card-*` commands), deck or tag stamping, and any in-mode "undo
last card" beyond Obsidian's own undo.