/**
 * Sidecar file names, derived from the vault's note paths alone.
 *
 * A note's sidecar is named after the note: `Pantry.md` → `Pantry.osmosis.md`.
 * When two or more notes share a basename, **all** of them are qualified with
 * their parent folder, dot-joined in path order: `Travel/Pantry.md` →
 * `Travel.Pantry.osmosis.md`. Further parent folders are prepended one at a
 * time, only for the notes whose name still collides, so a name always reads
 * as the tail of the path: `Home/Travel/Pantry.md` →
 * `Home.Travel.Pantry.osmosis.md`.
 *
 * The rules, and why:
 * - **A name is a tail of the path** with `/` read as `.`. A note at the vault
 *   root has no folder to add, so its name stays bare even inside a collision:
 *   `Pantry.md` keeps `Pantry` while `Travel/Pantry.md` becomes
 *   `Travel.Pantry`. Its whole path *is* `Pantry`, so the bare name is already
 *   its fully qualified one. (A leading-dot name would be a hidden file, which
 *   Obsidian does not index, and the vault's own folder name differs between
 *   devices.)
 * - **Collisions are case-insensitive**, as they are on macOS and Windows file
 *   systems: `Pantry` and `pantry` collide.
 * - **Collisions are on the final name**, not just the basename, because dots
 *   in names make tails ambiguous: a root note `Travel.Pantry.md` and
 *   `Travel/Pantry.md` both want `Travel.Pantry`. Every note whose name
 *   collides gains a folder while it has one left.
 * - **Last resort:** notes still colliding with no folder left to add get
 *   `~` and an 8-hex hash of their path appended (`Travel.Pantry~1a2b3c4d`).
 *   It takes a root note named with the dots of another note's folder path.
 *
 * Two notes' names can only be equal when their basenames end in the same
 * dot-token (case-insensitively), so names are computed per such partition and
 * a note event only re-derives its own partition — usually one note.
 *
 * Pure: no Obsidian imports.
 */

/** Every sidecar's file name ends with this. */
export const SIDECAR_SUFFIX = ".osmosis.md";

/** 32-bit FNV-1a, as 8 hex characters. */
function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A note path's segments, `.md` dropped: `Travel/Pantry.md` → `["Travel", "Pantry"]`. */
function segmentsOf(notePath: string): string[] {
	return notePath.replace(/\.md$/i, "").split("/");
}

/** The partition a note's name can collide within: its basename's last dot-token, lower-cased. */
function partitionOf(notePath: string): string {
	const segments = segmentsOf(notePath);
	const base = segments[segments.length - 1] ?? "";
	return base.slice(base.lastIndexOf(".") + 1).toLowerCase();
}

/** The sidecar file name (with {@link SIDECAR_SUFFIX}) of every note in `notePaths`. */
export function sidecarNames(notePaths: Iterable<string>): Map<string, string> {
	const partitions = new Map<string, string[]>();
	for (const path of notePaths) {
		const key = partitionOf(path);
		const members = partitions.get(key);
		if (members) members.push(path);
		else partitions.set(key, [path]);
	}
	const names = new Map<string, string>();
	for (const members of partitions.values()) {
		for (const [path, name] of namePartition(members)) names.set(path, name);
	}
	return names;
}

/** The names within one partition: deepen colliding notes until nothing collides or nothing can deepen. */
function namePartition(paths: readonly string[]): Map<string, string> {
	const segments = paths.map(segmentsOf);
	const depth = paths.map(() => 0);
	const stemAt = (i: number): string => segments[i]!.slice(-(depth[i]! + 1)).join(".");
	const collisions = (): number[][] => {
		const groups = new Map<string, number[]>();
		for (let i = 0; i < paths.length; i++) {
			const key = stemAt(i).toLowerCase();
			const group = groups.get(key);
			if (group) group.push(i);
			else groups.set(key, [i]);
		}
		return [...groups.values()].filter((group) => group.length > 1);
	};
	for (;;) {
		let deepened = false;
		for (const group of collisions()) {
			for (const i of group) {
				if (depth[i]! < segments[i]!.length - 1) {
					depth[i]!++;
					deepened = true;
				}
			}
		}
		if (!deepened) break;
	}
	const stuck = new Set(collisions().flat());
	const names = new Map<string, string>();
	for (let i = 0; i < paths.length; i++) {
		const stem = stuck.has(i) ? `${stemAt(i)}~${fnv1a(paths[i]!)}` : stemAt(i);
		names.set(paths[i]!, `${stem}${SIDECAR_SUFFIX}`);
	}
	return names;
}

/** One note whose sidecar name changed: `from` null for a note just added, `to` null for one removed. */
export interface NameChange {
	path: string;
	from: string | null;
	to: string | null;
}

/**
 * The name of every note in the vault, kept current note event by note event.
 * Each event re-derives only the partitions it touches and reports the notes
 * whose names changed, so the caller can rename their sidecars.
 */
export class SidecarNamer {
	private partitions = new Map<string, Set<string>>();
	private names = new Map<string, string>();
	/** Lower-cased name → note path, for finding a sidecar file's note. */
	private owners = new Map<string, string>();

	/** Start over from every note path in the vault. Reports nothing. */
	reset(notePaths: Iterable<string>): void {
		this.partitions.clear();
		this.names.clear();
		this.owners.clear();
		for (const path of notePaths) this.member(path, true);
		for (const members of this.partitions.values()) this.rename(members);
	}

	/** The sidecar file name for a note, or null when the note is not known. */
	nameOf(notePath: string): string | null {
		return this.names.get(notePath) ?? null;
	}

	/** The note a sidecar file name belongs to (matched case-insensitively), or null. */
	noteOf(fileName: string): string | null {
		return this.owners.get(fileName.toLowerCase()) ?? null;
	}

	has(notePath: string): boolean {
		return this.names.has(notePath);
	}

	/** A note created. */
	add(notePath: string): NameChange[] {
		return this.update([], [notePath]);
	}

	/** A note deleted. */
	remove(notePath: string): NameChange[] {
		return this.update([notePath], []);
	}

	/**
	 * Notes removed and added in one step (a rename is one of each), returning
	 * every note whose name changed. Removing an unknown path, or adding a known
	 * one, is a no-op.
	 */
	update(removed: readonly string[], added: readonly string[]): NameChange[] {
		const before = new Map<string, string | null>();
		const touched = new Set<string>();
		for (const path of removed) {
			if (!this.names.has(path)) continue;
			before.set(path, this.names.get(path) ?? null);
			this.member(path, false);
			touched.add(partitionOf(path));
		}
		for (const path of added) {
			if (this.names.has(path)) continue;
			this.member(path, true);
			touched.add(partitionOf(path));
		}
		for (const key of touched) {
			const members = this.partitions.get(key);
			if (!members) continue;
			for (const path of members) if (!before.has(path)) before.set(path, this.names.get(path) ?? null);
		}
		for (const path of before.keys()) {
			const name = this.names.get(path);
			if (name !== undefined) this.owners.delete(name.toLowerCase());
			this.names.delete(path);
		}
		for (const key of touched) {
			const members = this.partitions.get(key);
			if (members) this.rename(members);
		}
		const changes: NameChange[] = [];
		for (const [path, from] of before) {
			const to = this.names.get(path) ?? null;
			if (from !== to) changes.push({ path, from, to });
		}
		return changes;
	}

	private member(path: string, present: boolean): void {
		const key = partitionOf(path);
		let members = this.partitions.get(key);
		if (present) {
			if (!members) this.partitions.set(key, (members = new Set()));
			members.add(path);
			return;
		}
		members?.delete(path);
		if (members?.size === 0) this.partitions.delete(key);
	}

	private rename(members: Set<string>): void {
		for (const [path, name] of namePartition([...members])) {
			const old = this.names.get(path);
			if (old !== undefined) this.owners.delete(old.toLowerCase());
			this.names.set(path, name);
			this.owners.set(name.toLowerCase(), path);
		}
	}
}
