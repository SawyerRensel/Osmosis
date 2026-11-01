/**
 * Writing map edits to disk and undoing them, for any view that edits notes.
 *
 * Each view owns one `EditPipeline`. Every write goes through it, so it lands
 * in the shared per-file history ({@link EditHistory}) whichever view made it,
 * and undo/redo restores files the same way for every view. What a view does
 * *after* a write (re-parse, re-render) stays in the view.
 *
 * `beforeWrite` runs just before each `vault.modify`: it is where a view marks
 * the write as its own (so its "modify" handler skips the reload) and drops the
 * file's stale parse.
 */
import { Notice, TFile, type App } from "obsidian";
import { EditRecorder, type EditHistory } from "./edit-history";
import type { FileEdit } from "./mindmap-edit";

/** One file restored by an undo or redo, with the content written to it. */
export interface RestoredFile {
	path: string;
	content: string;
}

export class EditPipeline {
	readonly recorder: EditRecorder;

	constructor(
		private readonly app: App,
		private readonly history: EditHistory,
		owner: () => string | null,
		private readonly beforeWrite: (path: string) => void,
	) {
		this.recorder = new EditRecorder(history, owner);
	}

	/** Replace a file's content, recording the change. The caller normalizes `content` first. */
	async write(file: TFile, content: string): Promise<void> {
		const before = await this.app.vault.read(file);
		this.beforeWrite(file.path);
		await this.app.vault.modify(file, content);
		this.recorder.record(file.path, before, content);
	}

	/**
	 * `processFrontMatter`, recording the change. Doesn't call `beforeWrite`:
	 * callers that need the reload skipped mark the write themselves first.
	 * Resolves with the file's content afterwards.
	 */
	async processFrontMatter(file: TFile, fn: (fm: Record<string, unknown>) => void): Promise<string> {
		const before = await this.app.vault.read(file);
		await this.app.fileManager.processFrontMatter(file, fn);
		const after = await this.app.vault.read(file);
		this.recorder.record(file.path, before, after);
		return after;
	}

	/**
	 * Undo (or redo) the newest edit to `key`, from whichever view made it.
	 * Resolves with the files written, or null when there was nothing to do.
	 *
	 * The history is taken synchronously, before the first await, so two quick
	 * presses take two different entries.
	 */
	async step(key: string, isRedo: boolean): Promise<RestoredFile[] | null> {
		const step = isRedo ? this.history.redo(key) : this.history.undo(key);
		if (!step.ok) {
			if (step.reason === "blocked") {
				const name = step.path.split("/").pop() ?? step.path;
				new Notice(`Osmosis: a later edit to ${name} from another view has to be ${isRedo ? "redone" : "undone"} first`);
			}
			return null;
		}
		return this.restore(step.edits, isRedo);
	}

	/**
	 * Write back every file in an entry. A multi-file entry is applied in
	 * reverse when undoing and forward when redoing, the same reasoning as the
	 * move itself (see `moveAcrossFiles` in `edit-moves.ts`): the file that *gains*
	 * content is written before the one that loses it, so a failure partway
	 * leaves the content duplicated rather than gone. A file no longer in the
	 * vault is skipped.
	 */
	private async restore(edits: FileEdit[], isRedo: boolean): Promise<RestoredFile[]> {
		const ordered = isRedo ? edits : [...edits].reverse();
		const restored: RestoredFile[] = [];
		for (const fileEdit of ordered) {
			const file = this.app.vault.getFileByPath(fileEdit.path);
			if (!(file instanceof TFile)) continue;
			const content = isRedo ? fileEdit.after : fileEdit.before;
			this.beforeWrite(fileEdit.path);
			await this.app.vault.modify(file, content);
			restored.push({ path: fileEdit.path, content });
		}
		return restored;
	}
}
