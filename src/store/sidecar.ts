/**
 * Sidecar files: a note's Osmosis data kept in a file of its own, so the note's
 * frontmatter stays short enough to read in Source view.
 *
 * A sidecar is Markdown holding frontmatter only, in one flat folder (the
 * `sidecarFolder` setting), named by a hash of the note's path when it was
 * created — `a3f9c2e1.osmosis.md` — so Ctrl+O never offers a second file under
 * the note's own name. It is **never renamed**: the `osmosis-note` link in its
 * frontmatter is what ties it to its note, and the only thing that does.
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

/** Every sidecar's file name ends with this. */
export const SIDECAR_SUFFIX = ".osmosis.md";

/** The body written into a new sidecar. No wikilinks: the frontmatter link is the only one. */
const SIDECAR_BODY = "Osmosis keeps this note's flashcard data here. It follows the note when the note is renamed or moved.\n";

/** 32-bit FNV-1a, as 8 hex characters. */
function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The file name for a new sidecar of `notePath`: an 8-hex hash of the path,
 * re-salted until `isTaken` says the name is free. `isTaken` should answer true
 * only for a name used by something *other* than this note's own sidecar.
 *
 * Deterministic on the path, so two devices creating a sidecar for the same
 * note at once pick the same file rather than two.
 */
export function sidecarName(notePath: string, isTaken: (fileName: string) => boolean): string {
	for (let salt = 0; ; salt++) {
		const name = `${fnv1a(salt === 0 ? notePath : `${notePath}#${String(salt)}`)}${SIDECAR_SUFFIX}`;
		if (!isTaken(name)) return name;
	}
}

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
