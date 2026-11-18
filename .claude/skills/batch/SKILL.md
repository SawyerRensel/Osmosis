---
name: batch
description: "Orchestrate a batch of Planner tickets: intake, run, test queue, fix, land. Use when Sawyer brings several things to work on, says \"run batch N\", reports a batch's test results, or says \"land it\"."
---

# Batch

You are the **orchestrator**. Sawyer brings a pile of requests. You turn them into tickets, run one `ticket-worker` sub-agent per ticket, hand over one test queue, fix what fails, and land the batch as one PR. Sawyer's time goes into talking things through and into one test session. The rest is yours.

A batch moves through five stages. Find the stage the batch is in from the run state (`.claude/batch/<N>/state.md`) and the Planner notes tagged `batch: <N>`. Then pick up there.

**Batches in flight:** at most two. That means one waiting on Sawyer's test session, plus one stacked on it that is being run. A third waits until the oldest lands.

## 1. Intake

1. Grill Sawyer on what is unclear. Use AskUserQuestion (at most 4 questions a call), and only while no sub-agent is running. In the Zed agent panel the picker does not appear while one is streaming.
2. Write one Planner note per ticket from `vault/templates/`, following CLAUDE.md's *Creating a Task Note*. Each ticket also gets:
   - the next unused ticket ID `T<n>`, in `summary` and in the H1 (`# Title (T90)`);
   - the property `batch: <N>`, with `status: To-Do`;
   - a **Context budget** section that names which files to read and by what line range, with a rough token estimate. A worker's reading plus its work must fit in ~100k tokens. That leaves headroom under the 140k smart zone (see *Context budget* below). `MindMapView.ts` alone is ~84k tokens, so split tickets by surface.
   - acceptance criteria and a test plan.
3. Order the tickets so that ones touching the same files run one after another. Write the order into `.claude/batch/<N>/state.md` (format in [`run-state.md`](run-state.md)).

**Done when:** every request has a note or was explicitly dropped with Sawyer, and `state.md` lists the ticket order.

## 2. Run

1. Cut `batch/<N>-<slug>` from the release branch Sawyer names (confirm that it exists on `origin`). If batch N−1 is still waiting on its test session, cut it from that branch's tip instead.
2. For each ticket in order, spawn the `ticket-worker` agent in the foreground (`run_in_background: false`). The prompt carries:
   - the ticket note path and the branch (already checked out by you);
   - facts from earlier tickets that this one needs;
   - the memory files it should read.

   Choose `model` and `effort` per ticket from the table below. Pass both on every spawn, and record them in `state.md`.

   | The ticket… | model | effort |
   |---|---|---|
   | needs judgment: a root cause, a perf diagnosis, a design call, a refactor of shipped code, or a feature with details left open | `opus` | `high` |
   | executes a plan already written step by step (in the note or by an earlier worker) | `sonnet` | `high` |
   | is a stage-4 fix for a ticket that failed Sawyer's test at `high` | `opus` | `xhigh` |

   The cost to optimise is tokens per ticket that **passes Sawyer's test**, not per spawn. A run that fails costs a test round plus a fix run. Haiku is never used here for that reason. `xhigh` is the escalation step for a ticket that already failed once, not a default. If a ticket is unclear about which of the first two rows it fits, use `opus`.

   Record each worker's total tokens (from its completion notice) and its first-test result in `state.md`. That gives each batch the measurements to re-tune this table.
3. After each worker returns, check its report against the branch. It should have made code commits plus one `docs(T<n>)` note commit, and the tree should be clean. Append its test steps to the test queue and its facts to `state.md`.
4. After the first ticket lands, push and open a **draft** PR against the base branch, using the `pr` skill for the body. Add a checklist with one line per ticket: `- [ ] T90 Title`. Push after each further ticket.
5. If a worker dies on the rate limit, its edits stay in the tree. Resume it with SendMessage to its agent ID rather than starting over.

**Done when:** every ticket is In-Review or recorded in `state.md` as a partial slice with what remains, and the branch is pushed.

## 3. Test queue

Run `npm run build` (it installs into every vault Sawyer tests in). Then hand over `.claude/batch/<N>/test-queue.md`, one section per ticket. Put the **decisions for you** and the risky checks at the top of each section. Then stop.

## 4. Fix

Sawyer reports results ticket by ticket.
- **Pass:** tick the ticket in the PR checklist.
- **Fail:** a worker fixes it on the same branch with `fix(T<n>): …` commits. Re-queue only the failed checks, in a new `test-queue-<k>.md`.
- **Defer** (Sawyer would rather not wait): `git revert` that ticket's commits on the batch branch. Set its note back to `To-Do` with `batch: <N+1>`, and say so in the PR.

Ask the round's questions once, together, when no sub-agent is running.

## 5. Land

Only when Sawyer says to land (or merge) the batch:
1. Check each ticket's acceptance criteria against what shipped. Name any shortfall before going on.
2. Close out every ticket note per CLAUDE.md's *Documenting a Completed Task*. Put them all in one commit: `docs: Close out batch <N> (T90–T97)`. Push.
3. Mark the PR ready and merge it with a merge commit (`gh pr merge --merge --delete-branch`). If batch N+1 was stacked on this branch, retarget its PR to the release branch first.
4. Delete the local branch. Mark `state.md` as landed.

## Context budget

Every agent in the run, the orchestrator included, works within Sawyer's **smart zone**: under ~140k tokens of context. Past that, judgment degrades.

- **Workers:** the ticket's Context budget keeps one under it. The worker stops early and ships a slice when its reading outgrows the budget (see `ticket-worker`). A ticket that comes back as a slice gets its remainder split into a new ticket.
- **The orchestrator:** your context carries the whole batch. Keep it lean:
  - Read source only as far as you need to write a ticket's Context budget. Send wider surveys to an `Explore` agent.
  - Keep worker reports in `state.md`, not in chat.
  - At each stage boundary, judge how full your context is. Once it is past ~100k, or a stage would push it past 140k, bring `state.md` up to date and tell Sawyer to start a fresh session with "resume batch <N>". `state.md` has to be complete enough for that new session to carry on without this conversation.

## Rules for the whole run

- Commit by explicit path, and run `git diff --cached --stat` before every commit. Sawyer's own edits under `vault/Planner/`, `vault/templates/` and `vault/Bases/` ride along only when Sawyer says so.
- Restore the working tree with commits and checkouts only. Sawyer keeps old stashes, so `git stash` is off-limits.
- Stay inside `/home/user/Osmosis` plus the memory folder.
- The machine has 7 GB RAM. Run one sub-agent at a time, and one of lint/test/build at a time.
- Refer to Sawyer as they/them.
