/**
 * The file side of moving Osmosis data between notes and their sidecars: the
 * "Move data …" commands, and the sidecar folder setting moving its
 * files. What the files end up saying is decided in `sidecar-move.ts`; this
 * class reads, writes and orders.
 *
 * **Never lose data.** Each move writes the destination first and only then
 * empties the source, and the plan behind each write checks itself (see
 * `sidecar-move.ts`). Between the two writes both files hold the data, and
 * the sidecar winning on read makes that state read exactly like the old one.
 * A source that changed while the move ran is not emptied: the move re-plans
 * from the new text, a few times, then gives up with both copies in place.
 */
import { parseYaml, stringifyYaml, type App, type TFile } from "obsidian";
import type { NoteData } from "./NoteData";
import { SIDECAR_KEYS, SIDECAR_SUFFIX, hasSidecarKeys } from "./sidecar";
import { frontmatterOfText, planIntoNote, planToSidecar, type ToSidecarPlan, type YamlCodec } from "./sidecar-move";

const yaml: YamlCodec = { parse: parseYaml, stringify: stringifyYaml };

/** How often a move re-plans when its source changes under it. */
const ATTEMPTS = 3;
/** How long a move waits for the metadata cache to re-read a file it wrote. */
const CACHE_WAIT_MS = 1000;

export type MoveOutcome =
	| { kind: "moved"; dropped: number }
	| { kind: "nothing" }
	| { kind: "failed"; reason: string };

/** Counts for a vault-wide move's Notice. */
export interface VaultMoveResult {
	moved: number;
	failed: number;
	/** Fence entries dropped because their fence is gone. */
	dropped: number;
	/** Sidecars whose note does not exist (into notes only). Left alone. */
	orphans: number;
}

export class DataMover {
	constructor(
		private readonly app: App,
		private readonly noteData: NoteData,
		/** Write out everything pending for a note: open editors, staged schedules and fence writes. */
		private readonly flush: (file: TFile) => Promise<void>,
		/** Review-log shards and sidecars: never notes to move. */
		private readonly isDataPath: (path: string) => boolean,
	) {}

	// ── One note ───────────────────────────────────────────

	/** Move a note's data into its sidecar, creating the sidecar if needed. */
	async toSidecar(file: TFile): Promise<MoveOutcome> {
		const { vault, fileManager } = this.app;
		await this.flush(file);
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			const text = await vault.read(file);
			const existing = this.noteData.sidecarOf(file);
			const current = existing ? frontmatterOfText(await vault.read(existing), yaml) : undefined;
			if (!planToSidecar(text, current, yaml).moved) return { kind: "nothing" };

			const sidecar = existing ?? await this.noteData.ensureSidecar(file);
			let plan: ToSidecarPlan | null = null;
			const settled = this.cacheSettled(sidecar);
			// Planned again on the sidecar as it is now, in case a write landed.
			await fileManager.processFrontMatter(sidecar, (fm: Record<string, unknown>) => {
				plan = planToSidecar(text, fm, yaml);
				for (const key of SIDECAR_KEYS) {
					if (plan.sidecar[key] === undefined) delete fm[key];
					else fm[key] = plan.sidecar[key];
				}
			});
			// Readers of the note must find the data in the sidecar once its
			// headers are lean, or the cards read as new until the cache catches up.
			await settled;

			let stripped = false;
			await vault.process(file, (data) => {
				if (data !== text || plan === null) return data;
				stripped = true;
				return plan.note;
			});
			if (stripped) return { kind: "moved", dropped: 0 };
		}
		return { kind: "failed", reason: "the note kept changing during the move" };
	}

	/** Move a note's data out of its sidecar and back into the note, then trash the sidecar. */
	async intoNote(file: TFile): Promise<MoveOutcome> {
		const { vault, fileManager } = this.app;
		if (!this.noteData.sidecarOf(file)) return { kind: "nothing" };
		await this.flush(file);
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			const sidecar = this.noteData.sidecarOf(file);
			if (!sidecar) return { kind: "nothing" };
			const sideText = await vault.read(sidecar);
			const sideData = frontmatterOfText(sideText, yaml);

			let dropped = 0;
			const settled = this.cacheSettled(file);
			await vault.process(file, (data) => {
				const plan = planIntoNote(data, sideData, yaml);
				dropped = plan.dropped;
				return plan.note;
			});
			// The note's mode is read from its cached frontmatter: once the
			// sidecar goes, a stale cache would send the next review to a new one.
			await settled;

			// A review written to the sidecar meanwhile is folded in by the next pass.
			if (await vault.read(sidecar) !== sideText) continue;
			await fileManager.trashFile(sidecar);
			return { kind: "moved", dropped };
		}
		return { kind: "failed", reason: "its sidecar kept changing during the move" };
	}

	// ── Whole vault ────────────────────────────────────────

	/** Every note with Osmosis data in it, into its sidecar. One note failing does not stop the rest. */
	async allToSidecars(): Promise<VaultMoveResult> {
		// Orphans first: one matched back by its link is that note's sidecar, not a second one.
		const result: VaultMoveResult = { moved: 0, failed: 0, dropped: 0, orphans: await this.noteData.reconcile() };
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isDataPath(file.path)) continue;
			// Cheap pre-filter from the cache; the plan decides for real.
			const cache = this.app.metadataCache.getFileCache(file);
			const hasCode = cache?.sections?.some((section) => section.type === "code") ?? false;
			if (!hasSidecarKeys(cache?.frontmatter) && !hasCode) continue;
			this.tally(result, file, await this.attempt(file, () => this.toSidecar(file)));
		}
		return result;
	}

	/**
	 * Every sidecar's data back into its note. Sidecars matching no note, by
	 * name or by their `osmosis-note` link, are counted and left.
	 */
	async allIntoNotes(): Promise<VaultMoveResult> {
		const result: VaultMoveResult = { moved: 0, failed: 0, dropped: 0, orphans: await this.noteData.reconcile() };
		for (const path of this.noteData.notesWithSidecars()) {
			const file = this.app.vault.getFileByPath(path);
			if (!file) continue;
			this.tally(result, file, await this.attempt(file, () => this.intoNote(file)));
		}
		return result;
	}

	// ── The sidecar folder ─────────────────────────────────

	/**
	 * Move sidecar files into `folder`, keeping their names (a taken name gets a
	 * `-1`, `-2` … before the suffix, which makes that file an orphan the next
	 * `NoteData.reconcile` tries to match back by its link). Call with the folder setting already
	 * pointing at `folder`, so each file is re-indexed as it lands. Returns the
	 * number moved; a file that fails is logged and stays where it was.
	 */
	async moveSidecars(files: readonly TFile[], folder: string): Promise<number> {
		const { vault, fileManager } = this.app;
		if (files.length === 0) return 0;
		if (vault.getAbstractFileByPath(folder) === null) await vault.createFolder(folder);
		let moved = 0;
		for (const file of files) {
			const stem = file.name.slice(0, -SIDECAR_SUFFIX.length);
			let dest = `${folder}/${file.name}`;
			for (let n = 1; vault.getAbstractFileByPath(dest) !== null; n++) dest = `${folder}/${stem}-${String(n)}${SIDECAR_SUFFIX}`;
			try {
				await fileManager.renameFile(file, dest);
				moved++;
			} catch (error) {
				console.error(`Osmosis: could not move sidecar ${file.path} to ${dest}`, error);
			}
		}
		return moved;
	}

	// ── Helpers ────────────────────────────────────────────

	private async attempt(file: TFile, move: () => Promise<MoveOutcome>): Promise<MoveOutcome> {
		try {
			return await move();
		} catch (error) {
			console.error(`Osmosis: could not move the data of ${file.path}`, error);
			return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
		}
	}

	private tally(result: VaultMoveResult, file: TFile, outcome: MoveOutcome): void {
		if (outcome.kind === "moved") {
			result.moved++;
			result.dropped += outcome.dropped;
		} else if (outcome.kind === "failed") {
			result.failed++;
			console.warn(`Osmosis: left the data of ${file.path} where it was: ${outcome.reason}`);
		}
	}

	/**
	 * Resolves once the metadata cache has re-read `file`, or after
	 * {@link CACHE_WAIT_MS} (a write that changed nothing fires no event).
	 * Subscribe before the write, or the event can come first.
	 */
	private cacheSettled(file: TFile): Promise<void> {
		const { metadataCache } = this.app;
		return new Promise((resolve) => {
			const done = (): void => {
				metadataCache.offref(ref);
				window.clearTimeout(timer);
				resolve();
			};
			const ref = metadataCache.on("changed", (changed) => {
				if (changed.path === file.path) done();
			});
			const timer = window.setTimeout(done, CACHE_WAIT_MS);
		});
	}
}
