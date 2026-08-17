import type { TFile } from "obsidian";
import type { MutationDeps, MutationRecord } from "./mutate";

/**
 * Undo/redo for card-browser mutations.
 *
 * **Obsidian's own undo cannot carry these.** Ctrl+Z is CodeMirror's per-editor
 * history; writes made through `Vault.process` and `processFrontMatter` do not
 * enter it usefully, and a note that is not open in an editor has no history at
 * all — which is the normal case for the browser, whose whole purpose is acting
 * on notes you do not have open. So the plugin keeps its own stack.
 *
 * It is deliberately **session-only**. Persisting file snapshots to `data.json`
 * would let a stale week-old copy of a note be restored over a current one long
 * after the context that produced it is gone: a data-loss trap rather than a
 * feature.
 */

/** Why an undo or redo could not proceed, or that it did. */
export type HistoryResult =
	| { ok: true; label: string }
	| { ok: false; reason: "empty" }
	| { ok: false; reason: "missing"; path: string }
	| { ok: false; reason: "conflict"; path: string };

/** How many mutations back you can go. Bounded because each entry holds note text. */
const DEFAULT_LIMIT = 20;

export class MutationHistory {
	private undoable: MutationRecord[] = [];
	private redoable: MutationRecord[] = [];

	constructor(
		private readonly deps: MutationDeps,
		private readonly limit = DEFAULT_LIMIT,
	) {}

	/** Record a completed mutation, dropping any redo branch it invalidates. */
	push(record: MutationRecord): void {
		this.undoable.push(record);
		if (this.undoable.length > this.limit) this.undoable.shift();
		// Once a new mutation lands, the states the redo stack described no longer
		// follow from the current one.
		this.redoable = [];
	}

	get undoLabel(): string | null {
		return this.undoable.length === 0 ? null : this.undoable[this.undoable.length - 1]!.label;
	}

	get redoLabel(): string | null {
		return this.redoable.length === 0 ? null : this.redoable[this.redoable.length - 1]!.label;
	}

	async undo(): Promise<HistoryResult> {
		const record = this.undoable[this.undoable.length - 1];
		if (!record) return { ok: false, reason: "empty" };

		const result = await this.restore(record, "before");
		if (!result.ok) return result;

		this.undoable.pop();
		this.redoable.push(record);
		return result;
	}

	async redo(): Promise<HistoryResult> {
		const record = this.redoable[this.redoable.length - 1];
		if (!record) return { ok: false, reason: "empty" };

		const result = await this.restore(record, "after");
		if (!result.ok) return result;

		this.redoable.pop();
		this.undoable.push(record);
		return result;
	}

	clear(): void {
		this.undoable = [];
		this.redoable = [];
	}

	/**
	 * Restore one direction of a record: notes back to their snapshot, cards back
	 * to their store state.
	 *
	 * Restoring whole-file content is what makes one code path serve all four
	 * mutations, and it is also the risk — a note edited since the mutation would
	 * lose that edit. So every file is checked against the snapshot the mutation
	 * left behind, and any disagreement aborts the whole thing instead of winning
	 * the race. Checks all run before any write, so an abort cannot leave the
	 * notes half-restored and disagreeing with the store.
	 */
	private async restore(
		record: MutationRecord,
		direction: "before" | "after",
	): Promise<HistoryResult> {
		// Undoing expects to find the state the mutation produced; redoing expects
		// the state the undo put back.
		const expected = direction === "before" ? "after" : "before";

		// Staged frontmatter writes would land on top of the restore, and would
		// also make the comparison below read a file that is about to change.
		for (const snapshot of record.files) {
			await this.deps.lineCards.flushPath(snapshot.path);
		}

		const writes: { file: TFile; content: string }[] = [];
		for (const snapshot of record.files) {
			const file = this.deps.resolveFile(snapshot.path);
			if (!file) return { ok: false, reason: "missing", path: snapshot.path };

			const current = await this.deps.files.read(file);
			if (current !== snapshot[expected]) {
				return { ok: false, reason: "conflict", path: snapshot.path };
			}
			writes.push({ file, content: snapshot[direction] });
		}

		for (const write of writes) {
			await this.deps.files.process(write.file, () => write.content);
		}

		for (const card of record.cards) {
			const target = card[direction];
			if (target) this.deps.cardStore.addCard({ ...target });
			else this.deps.cardStore.removeCard(card.id);
		}

		return { ok: true, label: record.label };
	}
}
