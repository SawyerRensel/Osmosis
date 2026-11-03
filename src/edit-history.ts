/**
 * Undo/redo for map edits, shared by every view that edits notes (the 2D mind
 * map today, the 3D graph next).
 *
 * Map edits write to disk directly (`vault.modify` / `processFrontMatter`),
 * bypassing CodeMirror, so there is no editor history to forward to. Each edit
 * is recorded as the content of every file it touched, before and after.
 *
 * **One history per file.** An entry is filed under its *owner* (the note the
 * editing view is built on: a 2D map's host note, or the 3D node's own note)
 * and under every file it wrote. Undo for a file takes the newest entry filed
 * under it, whichever view recorded it, so undo in one view undoes the other
 * view's edits to that note.
 *
 * An entry can span files (a move across an embed boundary writes two notes).
 * Undoing it restores every one of them, so it is refused while a newer entry
 * shares any of its files: restoring the older `before` would silently drop the
 * newer edit. With a single view this never happens, because every entry it
 * records shares its owner, so the newest entry for the owner is the newest of
 * all.
 *
 * A file's history lives while some view holds it ({@link EditHistory.hold}),
 * and is dropped, with every entry that touches it, once the last view lets go.
 * That keeps the 2D map's old rule (switching the map to another note clears
 * its history) while letting a note held by both views keep its history when
 * one of them moves on.
 *
 * Pure: no `obsidian` import, so it is unit-tested directly.
 */
import { collapseEditGroup, editBytes, mergeEdit, type FileEdit } from "./mindmap-edit";

/** The user's undo settings: entries kept per file, and their memory ceiling per file. */
export interface HistoryLimits {
	maxSteps: number;
	maxMemoryMB: number;
}

/** What an undo or redo asked of the history: the edits to restore, or why there are none. */
export type HistoryStep =
	| { ok: true; edits: FileEdit[] }
	| { ok: false; reason: "empty" }
	/** A newer entry (from another view) shares `path`, and has to be undone (or redone) first. */
	| { ok: false; reason: "blocked"; path: string };

interface Entry {
	/** The owner plus every file written. */
	keys: ReadonlySet<string>;
	edits: FileEdit[];
	bytes: number;
}

/** A key of `entry` that `other` is also filed under, or null. */
function sharedKey(entry: Entry, other: Entry): string | null {
	for (const key of entry.keys) if (other.keys.has(key)) return key;
	return null;
}

export class EditHistory {
	/** Oldest first; the newest entry is last. */
	private undoList: Entry[] = [];
	/** The most recently undone entry is last. */
	private redoList: Entry[] = [];
	private readonly holders = new Map<string, number>();

	constructor(private readonly limits: () => HistoryLimits) {}

	/**
	 * Record one undo step. A fresh edit invalidates the redo history of every
	 * file it shares with, then each of its files is trimmed to the limits.
	 */
	push(owner: string, edits: FileEdit[]): void {
		if (edits.length === 0) return;
		const entry: Entry = {
			keys: new Set([owner, ...edits.map((e) => e.path)]),
			edits,
			bytes: editBytes(edits),
		};
		this.undoList.push(entry);
		this.redoList = this.redoList.filter((e) => sharedKey(e, entry) === null);
		for (const key of entry.keys) this.trim(key);
	}

	/** Take the newest edit to `key` off the undo history; the caller restores each file's `before`. */
	undo(key: string): HistoryStep {
		return this.step(this.undoList, this.redoList, key);
	}

	/** Take the most recently undone edit to `key` back; the caller restores each file's `after`. */
	redo(key: string): HistoryStep {
		return this.step(this.redoList, this.undoList, key);
	}

	/**
	 * Keep `key`'s history alive until the returned release is called. Holds
	 * count: the history is dropped when the last holder releases it.
	 */
	hold(key: string): () => void {
		this.holders.set(key, (this.holders.get(key) ?? 0) + 1);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			const count = (this.holders.get(key) ?? 1) - 1;
			if (count > 0) {
				this.holders.set(key, count);
				return;
			}
			this.holders.delete(key);
			this.undoList = this.undoList.filter((e) => !e.keys.has(key));
			this.redoList = this.redoList.filter((e) => !e.keys.has(key));
		};
	}

	private step(from: Entry[], to: Entry[], key: string): HistoryStep {
		let index = -1;
		for (let i = from.length - 1; i >= 0; i--) {
			if (from[i]?.keys.has(key) === true) {
				index = i;
				break;
			}
		}
		const entry = from[index];
		if (entry === undefined) return { ok: false, reason: "empty" };
		for (let i = index + 1; i < from.length; i++) {
			const later = from[i];
			const path = later === undefined ? null : sharedKey(entry, later);
			if (path !== null) return { ok: false, reason: "blocked", path };
		}
		from.splice(index, 1);
		to.push(entry);
		return { ok: true, edits: entry.edits };
	}

	/**
	 * Trim `key`'s undo entries to the step and memory limits, oldest first,
	 * whichever is reached first. The most recent entry always stays, so a
	 * just-made edit is undoable however large. Redo entries aren't counted:
	 * they are cleared by the next fresh edit anyway.
	 */
	private trim(key: string): void {
		const { maxSteps, maxMemoryMB } = this.limits();
		const steps = Math.max(1, maxSteps);
		const maxBytes = Math.max(1, maxMemoryMB) * 1024 * 1024;
		const mine = this.undoList.filter((e) => e.keys.has(key));
		let total = 0;
		for (const e of mine) total += e.bytes;
		const drop = new Set<Entry>();
		let count = mine.length;
		for (const e of mine) {
			if (count <= 1 || (count <= steps && total <= maxBytes)) break;
			drop.add(e);
			count--;
			total -= e.bytes;
		}
		if (drop.size > 0) this.undoList = this.undoList.filter((e) => !drop.has(e));
	}
}

/**
 * One view's way into the shared history: the gestures that collapse several
 * writes into one undo step.
 *
 * - A **live edit** (a colour-picker drag) coalesces its burst of writes to
 *   one file into a single before→after entry, recorded when it ends.
 * - An **edit group** (a move across an embed boundary, with the identity
 *   migration that follows it) collects writes to any number of files into one
 *   entry, keeping each file's first `before` and last `after`.
 */
export class EditRecorder {
	private liveActive = false;
	private liveEdit: FileEdit | null = null;
	private group: Map<string, FileEdit> | null = null;

	/** `owner` names the note an entry is filed under; null falls back to the first file written. */
	constructor(
		private readonly history: EditHistory,
		private readonly owner: () => string | null,
	) {}

	/** Whether a live-edit session is open. */
	get live(): boolean {
		return this.liveActive;
	}

	/** Whether an edit group is open. */
	get grouping(): boolean {
		return this.group !== null;
	}

	beginLive(): void {
		this.liveActive = true;
		this.liveEdit = null;
	}

	/** End a live-edit session, recording one entry for the whole burst. */
	endLive(): void {
		if (!this.liveActive) return;
		this.liveActive = false;
		const edit = this.liveEdit;
		this.liveEdit = null;
		if (edit) this.record(edit.path, edit.before, edit.after);
	}

	/** Open an edit group. Opening one while another is open restarts it. */
	beginGroup(): void {
		this.group = new Map();
	}

	/** Close the edit group, recording its net change as one entry. */
	endGroup(): void {
		const group = this.group;
		this.group = null;
		if (!group) return;
		this.commit(collapseEditGroup(group));
	}

	/** Record one write; no-op when the content is unchanged. */
	record(path: string, before: string, after: string): void {
		if (before === after) return;
		if (this.liveActive) {
			// Keep the pre-session content as the baseline and track the latest
			// result. A live edit writes one file; writes to others are dropped.
			if (!this.liveEdit) this.liveEdit = { path, before, after };
			else if (this.liveEdit.path === path) this.liveEdit.after = after;
			return;
		}
		if (this.group) {
			mergeEdit(this.group, { path, before, after });
			return;
		}
		this.commit([{ path, before, after }]);
	}

	private commit(edits: FileEdit[]): void {
		const first = edits[0];
		if (first === undefined) return;
		this.history.push(this.owner() ?? first.path, edits);
	}
}

/**
 * Hold `keys`' histories while `during` runs, then let go. A leaf swapping
 * one view for another (the mind map's 2D/3D toggle) closes the outgoing view,
 * which releases its holds, around the time the incoming one takes its own;
 * holding across the swap keeps the history alive whichever happens first.
 */
export async function holdAcross<T>(history: EditHistory, keys: Iterable<string>, during: () => Promise<T>): Promise<T> {
	const releases = [...new Set(keys)].map((key) => history.hold(key));
	try {
		return await during();
	} finally {
		for (const release of releases) release();
	}
}
