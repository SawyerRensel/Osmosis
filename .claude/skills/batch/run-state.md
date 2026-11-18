# Batch run state

Run state lives in `.claude/batch/<N>/` (gitignored). It is the orchestrator's notebook: a new session reads it to resume a batch mid-run, so write it as if for a stranger.

## `state.md`

```markdown
# Batch <N>: <one-line theme>

Base: release/0.0.7 · Branch: batch/<N>-<slug> · PR: <url or "not yet"> · Stacked on: <batch N-1 branch or "none">
Stage: intake | run | test | fix | landed

## Tickets (run order)
| ID | Note | Model / effort | Tokens | First test | Status | Commits | Notes |
|---|---|---|---|---|---|---|---|
| T90 | [[Mind Map - …]] | opus / high | 118k | pass | In-Review | abc1234, def5678 | partial: … |

## Facts the next tickets need
- <fact learned by a worker, with the ticket that learned it>

## Open questions for Sawyer
- <asked together at the next pause>
```

## `test-queue.md` (and `test-queue-<k>.md` for re-tests)

```markdown
# Test queue: Batch <N>

Tip: <branch> (<hash>), built and installed. Reload Obsidian (Ctrl+R) first.

## T90: <title>
**Decision for you:** <trade-off the worker made that Sawyer should confirm>
Fixture: `tests/<path>.md`
1. <action> → <expected result>
2. …
- Known gap: <what the worker could not do or verify>
```

Keep each ticket's section short. The note's "Batch implementation notes" has the full steps, so the queue is the checklist Sawyer works through.
