/**
 * Sidecar files: a note's Osmosis data kept in a file of its own, so the note's
 * frontmatter stays short enough to read in Source view.
 *
 * A sidecar is Markdown holding frontmatter only, in one flat folder (the
 * `sidecarFolder` setting), named after its note — `Pantry.osmosis.md`, or
 * `Travel.Pantry.osmosis.md` when basenames collide (see `sidecar-names.ts`).
 * The **name** ties it to its note. The `osmosis-note` link in its frontmatter
 * is only a recovery hint: Obsidian's link updater keeps it pointing at the
 * note, so a sidecar whose name matches no note (renamed while Osmosis was
 * off, or an old hash-named one) can be matched back by it.
 *
 * ```yaml
 * ---
 * osmosis-note: "[[Folder/Note]]"
 * osmosis-schedule: { … }   # the note-frontmatter shape, unchanged
 * ---
 * ```
 *
 * Pure: no Obsidian imports. `NoteData` is the Obsidian-facing side.
 */

/** Frontmatter key linking a sidecar to its note. */
export const SIDECAR_LINK_KEY = "osmosis-note";

/**
 * The frontmatter keys a sidecar can carry for its note. A note holding any of
 * them in its own frontmatter is a "note"-mode note: its data stays where it is.
 */
export const SIDECAR_KEYS = ["osmosis-schedule", "osmosis-fences", "osmosis-styles"] as const;

/**
 * Keys merged entry by entry (each entry is one card's data) rather than
 * whole, so a card the sidecar does not mention still reads from the note.
 */
const ENTRY_MERGED_KEYS: ReadonlySet<string> = new Set(["osmosis-schedule", "osmosis-fences"]);

export { SIDECAR_SUFFIX } from "./sidecar-names";

/** The body written into a new sidecar. No wikilinks: the frontmatter link is the only one. */
const SIDECAR_BODY = "Osmosis keeps this note's flashcard data here. It follows the note when the note is renamed or moved.\n";

/** The `osmosis-note` value for a note: a wikilink to its full vault path, without `.md`. */
export function noteLink(notePath: string): string {
	return `[[${notePath.replace(/\.md$/, "")}]]`;
}

/**
 * The link path out of an `osmosis-note` value — `"[[Folder/Note|alias]]"` →
 * `"Folder/Note"`. Null when the value is not a wikilink. Obsidian's rename
 * handling may have rewritten it to the shortest form, so the caller resolves
 * the result as a link rather than treating it as a path.
 */
export function parseNoteLink(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const match = /^\s*\[\[([^\]|#^]+)(?:[#^|][^\]]*)?\]\]\s*$/.exec(value);
	const linkpath = match?.[1]?.trim();
	return linkpath === undefined || linkpath === "" ? null : linkpath;
}

/** True when a vault path lies in the sidecar folder. Mirrors `isReviewLogPath`. */
export function isSidecarPath(path: string, folder: string): boolean {
	if (folder === "") return false;
	return path === folder || path.startsWith(`${folder}/`);
}

/** True when a frontmatter object holds any key a sidecar could carry. */
export function hasSidecarKeys(frontmatter: Record<string, unknown> | null | undefined): boolean {
	return frontmatter != null && SIDECAR_KEYS.some((key) => frontmatter[key] !== undefined);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A note's frontmatter with its sidecar's data laid over it: a fresh object
 * (neither input is mutated, so metadata-cache objects are safe to pass).
 *
 * The sidecar wins key by key, and for `osmosis-schedule` / `osmosis-fences`
 * entry by entry, so a card the sidecar does not mention still reads from the
 * note. Sidecar keys outside {@link SIDECAR_KEYS} (its own link) are ignored.
 */
export function mergeNoteData(
	note: Record<string, unknown> | null | undefined,
	sidecar: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...(note ?? {}) };
	if (!sidecar) return merged;
	for (const key of SIDECAR_KEYS) {
		const value = sidecar[key];
		if (value === undefined) continue;
		const own = merged[key];
		merged[key] = ENTRY_MERGED_KEYS.has(key) && isPlainObject(own) && isPlainObject(value)
			? { ...own, ...value }
			: value;
	}
	return merged;
}

/** The text of a brand-new sidecar for `notePath`. JSON quoting is valid YAML. */
export function sidecarContent(notePath: string): string {
	return `---\n${SIDECAR_LINK_KEY}: ${JSON.stringify(noteLink(notePath))}\n---\n${SIDECAR_BODY}`;
}

/**
 * Obsidian's Excluded files list (`userIgnoreFilters`) with the sidecar folder
 * swapped in: `previous`'s entry removed, `folder`'s added. An entry is the
 * folder path with a trailing slash, the form Obsidian's own folder picker
 * writes. Entries the user wrote any other way are left alone. Null for an
 * empty list, which is how Obsidian stores "none".
 */
export function withExcludedFolder(filters: unknown, previous: string | null, folder: string | null): string[] | null {
	const list = Array.isArray(filters) ? filters.filter((entry): entry is string => typeof entry === "string") : [];
	const drop = previous === null || previous === "" ? null : `${previous}/`;
	const add = folder === null || folder === "" ? null : `${folder}/`;
	const next = list.filter((entry) => entry !== drop || entry === add);
	if (add !== null && !next.includes(add)) next.push(add);
	return next.length > 0 ? next : null;
}
