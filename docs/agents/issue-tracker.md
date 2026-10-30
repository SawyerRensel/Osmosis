# Issue tracker: Planner notes

Issues and specs for this repo live as **task notes in `vault/Planner/`**, one markdown note per issue, managed by the [Planner](https://github.com/SawyerRensel/Planner) Obsidian plugin. Planner is the single source of truth for task state. Do not file GitHub issues, `.scratch/` files, or ad-hoc markdown TODOs.

The vault is open in Obsidian while you work. See CLAUDE.md, "The reset hazard": a note the user has open can have your on-disk edit silently reverted, so tell the user when you change a note they may be viewing.

## Conventions

- **Create an issue**: copy the matching template from `vault/templates/` (`Bug Report`, `Feature`, `Optimization`, `Research`, `Documentation`) to `vault/Planner/<Title>.md`. The filename is the title, and wikilinks resolve by it. Fill `title`, `summary` and `calendar` (a **string array**, e.g. `- Feature`). Set `date_created` and `date_modified` to now as quoted ISO strings (`"2026-10-30T14:00:00.000Z"`), and leave `status` at the template's `Ideas` (= `needs-triage`). Write the body as a self-contained prompt: state of the tree, design, open questions, surface map, test plan.
- **Read an issue**: read `vault/Planner/<Title>.md`, frontmatter and body.
- **List issues**: `grep -l '^status: <Status>' vault/Planner/*.md` (statuses in use: `Ideas`, `To-Do`, `In-Progress`, `In-Review`, `Done`, `Cancelled`). Treat `Done` and `Cancelled` as closed.
- **Make an issue a sub-issue of a parent**: set the child's `parent: "[[Parent]]"` and add `- "[[Child]]"` to the parent's `children` list.
- **Blocking**: add `- "[[Blocker]]"` to the child's `blocked_by` list. A note is unblocked when every `blocked_by` note is `Done` or `Cancelled`.
- **Related, not blocking**: add the link to `related` instead.
- **Comment on an issue**: Planner notes have no comment thread. Append a dated entry to a `## Log` section at the end of the body (create it if missing): `- 2026-10-30: <comment>`.
- **Apply / remove labels**: triage roles map to `status` values. See `docs/agents/triage-labels.md`. Update `date_modified` whenever you change a note.
- **Close**: append the reason to `## Log`, then set `status: Done` (shipped) or `status: Cancelled` (won't do) and fill `date_end_actual`. A shipped task also gets `pull_request` and a "What was implemented" section. See CLAUDE.md, "Documenting a Completed Task".

Frontmatter link fields (`related`, `parent`, `children`, `blocked_by`) take **quoted** wikilinks: `- "[[Other Task]]"`.

**Commits:** task notes are the user's working documents. Never stage them in a code commit. Commit them **by path** in their own commit, as CLAUDE.md describes.

## When a skill says "publish to the issue tracker"

Create a Planner note as in **Create an issue** above.

## When a skill says "fetch the relevant ticket"

Read the note as in **Read an issue** above. The user may name it by title or wikilink.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single parent note with **child** notes as tickets.

- **Map**: a Planner note tagged `wayfinder-map` (in `tags`), holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a note with `parent: "[[<Map>]]"`, listed in the map's `children`, tagged `wayfinder-<type>` (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: see **Blocking** under Conventions.
- **Frontier query**: the map's `children` in list order, keeping those not `Done`/`Cancelled`, with no open `blocked_by`, and with `date_start_actual` blank. The first one wins. `status: In-Progress` also means `ready-for-agent` (see `docs/agents/triage-labels.md`), so status alone cannot show a claim. `date_start_actual` does.
- **Claim**: set `status: In-Progress` and `date_start_actual` to now, as the session's first write.
- **Resolve**: append the answer to the ticket's `## Log`, set `status: Done`, then add a context pointer (gist + `[[link]]`) to the map's Decisions-so-far.
