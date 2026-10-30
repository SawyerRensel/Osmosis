# Triage Labels

The skills speak in terms of five canonical triage roles. In this repo the tracker is Planner notes in `vault/Planner/` (see `docs/agents/issue-tracker.md`). Roles are not labels here; each one is a value of the note's `status` frontmatter.

| Label in mattpocock/skills | `status` in our tracker | Meaning                                  |
| -------------------------- | ----------------------- | ---------------------------------------- |
| `needs-triage`             | `Ideas`                 | Maintainer needs to evaluate this issue  |
| `needs-info`               | `To-Do`                 | Waiting on reporter for more information |
| `ready-for-agent`          | `In-Progress`           | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `In-Review`             | Requires human implementation            |
| `wontfix`                  | `Cancelled`             | Will not be actioned                     |

When a skill says to "apply" a role, set `status` to the value in this table and update `date_modified`. "Remove" a role by setting the next one. A note holds exactly one status, so roles are mutually exclusive.

Edit the "`status` in our tracker" column to match whatever vocabulary you actually use.
