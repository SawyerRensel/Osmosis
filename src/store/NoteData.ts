/**
 * The one seam every Osmosis data read and write goes through: a note's
 * `osmosis-schedule` (and, from T126/T127, `osmosis-fences` / `osmosis-styles`)
 * live either in the note's own frontmatter or in its sidecar file (see
 * `sidecar.ts` for the file's shape and name).
 *
 * Public API (keep it this small):
 * - `frontmatter(file)` — the note's frontmatter with its sidecar's data laid
 *   over it, sidecar winning per key (per card entry for `osmosis-schedule` and
 *   `osmosis-fences`). A fresh object, read from the metadata cache: right
 *   after a write it can lag, exactly as the note's own frontmatter does.
 * - `process(file, fn)` — `fileManager.processFrontMatter`, aimed at the
 *   sidecar when the note is in sidecar mode (creating it, and its folder, on
 *   the first write) and at the note otherwise. Always pass the **note**.
 * - `targetFor(file)` — the file `process` would write, created if needed. For
 *   callers that must write through their own recorded path (the mind map's
 *   undoable `processFrontMatterTracked`).
 * - `modeOf(file)` — `"sidecar"` when a sidecar is indexed for the note, else
 *   `"note"` when the note's frontmatter holds any `SIDECAR_KEYS` key, else the
 *   `dataLocation` setting.
 * - `ensureSidecar(file)` — the sidecar, created if needed whatever the mode
 *   (the move commands, `DataMover`).
 * - `notesWithSidecars()` — every indexed note path, for the vault-wide move.
 * - `sidecarOf(file)` — the indexed sidecar, or null.
 * - `isSidecar(path)` — whether a path lies in the sidecar folder. Such files
 *   are never notes: not card-sync input, not Cosmos notes.
 * - `onChange(listener)` — called with a note's path whenever its sidecar
 *   data changed under us (an edit, a sync from another device, a sidecar
 *   created, moved or deleted). Our own writes fire it too, once the metadata
 *   cache has re-parsed the sidecar. Returns the unsubscribe.
 *
 * Lifecycle (main.ts): `attach(plugin)` in `onload`, before the plugin's own
 * vault listeners, so a renamed note's index entry is re-keyed before anything
 * re-reads it; `rebuildIndex()` at layout-ready before `syncAll`, and again when
 * the folder setting changes (after `DataMover.moveSidecars` has moved the files).
 * Events before the first `rebuildIndex()` are ignored: it reads the whole vault.
 *
 * Names (see `sidecar-names.ts`): a sidecar is named after its note,
 * qualified with parent folders while basenames collide. The **name** links it
 * to its note. So the index (note path → sidecar `TFile`) is rebuilt by name,
 * and every note create / rename / delete re-derives the names it affects and
 * renames the sidecars whose names changed: the note's own when it moves, and
 * others when a collision appears or goes. The index holds the `TFile` object,
 * which Obsidian renames in place, so a sidecar mid-rename is still found and
 * still written to. Each sidecar's writes, renames, link rewrites and trashing
 * run one at a time (`serial`), so a schedule write never races its rename.
 *
 * Orphans — sidecar files whose name matches no note (renamed while Osmosis
 * was off, or the old hash-named ones) — are matched back by their
 * `osmosis-note` link, which Obsidian's link updater keeps current, and renamed
 * to the note's name (`reconcile`, at `rebuildIndex`, when an unindexed sidecar
 * is parsed, and before the vault-wide move commands).
 *
 * Following the note: a rename renames the sidecar and rewrites its link (even
 * when Obsidian's link updater already did — idempotent); deleting the note
 * trashes its sidecar with `fileManager.trashFile`, which honours the user's
 * trash setting.
 */
import { TFile, type App, type EventRef, type TAbstractFile } from "obsidian";
import {
	SIDECAR_LINK_KEY,
	hasSidecarKeys,
	isSidecarPath,
	mergeNoteData,
	noteLink,
	parseNoteLink,
	sidecarContent,
	withExcludedFolder,
} from "./sidecar";
import { SIDECAR_SUFFIX, SidecarNamer, type NameChange } from "./sidecar-names";

/** Where a note's Osmosis data lives. */
export type DataLocation = "note" | "sidecar";

export interface NoteDataSettings {
	/** Where a note with no Osmosis data yet gets it. */
	dataLocation: DataLocation;
	sidecarFolder: string;
}

/** Obsidian's vault config accessors: public in the app, missing from the typings. */
interface VaultConfig {
	getConfig(key: string): unknown;
	setConfig(key: string, value: unknown): void;
}

/** The last path segment. */
function fileName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

/** The file when it is Markdown, else null (folders and other files). */
function asMarkdown(file: TAbstractFile): TFile | null {
	return file instanceof TFile && file.extension === "md" ? file : null;
}

export class NoteData {
	private namer = new SidecarNamer();
	/** Set by the first {@link rebuildIndex}; vault events before it are ignored. */
	private ready = false;
	/** Note path → its sidecar, and back. Only {@link link} and the unlinks touch them. */
	private index = new Map<string, TFile>();
	private owner = new Map<TFile, string>();
	/** In-flight sidecar creations per note path, so two writes create one file. */
	private creating = new Map<string, Promise<TFile>>();
	/** Sidecars we are renaming (a count per file): their rename events are ours, already indexed. */
	private renaming = new Map<TFile, number>();
	/** Per-sidecar operation chains, so its writes, renames and trashing run one at a time. */
	private chains = new Map<TFile, Promise<void>>();
	/** Every sidecar rename, in order. A new sidecar waits for it, so a name being vacated is free. */
	private renames: Promise<void> = Promise.resolve();
	private listeners = new Set<(notePath: string) => void>();

	constructor(
		private readonly app: App,
		private readonly settings: () => NoteDataSettings,
		/** Markdown paths that are Osmosis data rather than notes, besides sidecars (the review log). */
		private readonly isLogPath: (path: string) => boolean = () => false,
		/** Called after this creates the sidecar folder and adds it to Excluded files. */
		private readonly onFolderExcluded: () => void = () => undefined,
	) {}

	// ── Reads ──────────────────────────────────────────────

	frontmatter(file: TFile): Record<string, unknown> {
		const own = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const sidecar = this.sidecarOf(file);
		const side = sidecar ? this.app.metadataCache.getFileCache(sidecar)?.frontmatter : undefined;
		return mergeNoteData(own, side);
	}

	modeOf(file: TFile): DataLocation {
		if (this.sidecarOf(file)) return "sidecar";
		if (hasSidecarKeys(this.app.metadataCache.getFileCache(file)?.frontmatter)) return "note";
		return this.settings().dataLocation;
	}

	sidecarOf(file: TFile): TFile | null {
		return this.index.get(file.path) ?? null;
	}

	isSidecar(path: string): boolean {
		return isSidecarPath(path, this.settings().sidecarFolder);
	}

	// ── Writes ─────────────────────────────────────────────

	async process(file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void> {
		const target = await this.targetFor(file);
		if (target === file) await this.app.fileManager.processFrontMatter(file, fn);
		else await this.serial(target, () => this.app.fileManager.processFrontMatter(target, fn));
	}

	async targetFor(file: TFile): Promise<TFile> {
		if (this.modeOf(file) === "note") return file;
		return this.ensureSidecar(file);
	}

	/** The note's sidecar, created (with its folder) if it has none, whatever its mode. */
	async ensureSidecar(file: TFile): Promise<TFile> {
		return this.sidecarOf(file) ?? this.createSidecar(file);
	}

	/** The path of every note with an indexed sidecar. */
	notesWithSidecars(): string[] {
		return [...this.index.keys()];
	}

	onChange(listener: (notePath: string) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Swap the sidecar folder in Obsidian's Excluded files (`userIgnoreFilters`,
	 * Settings → Files and links): `previous`'s entry out, `folder`'s in.
	 * Excluded files stay in the metadata cache — Obsidian only leaves them out
	 * of search, the graph, the quick switcher, Bases and property lists — so
	 * the index and `frontmatter` read them as before.
	 */
	excludeFolder(previous: string | null, folder: string | null): void {
		const vault = this.app.vault as unknown as Partial<VaultConfig>;
		if (typeof vault.getConfig !== "function" || typeof vault.setConfig !== "function") return;
		const current = vault.getConfig("userIgnoreFilters") ?? null;
		const next = withExcludedFolder(current, previous, folder);
		if (JSON.stringify(next) !== JSON.stringify(current)) vault.setConfig("userIgnoreFilters", next);
	}

	// ── Index and lifecycle ────────────────────────────────

	/**
	 * Name every note and index every sidecar in the folder by its name, then
	 * (in the background) match orphans back by their link and fix names.
	 */
	rebuildIndex(): void {
		this.index.clear();
		this.owner.clear();
		const notes: string[] = [];
		const sidecars: TFile[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isSidecar(file.path)) sidecars.push(file);
			else if (this.isNotePath(file.path)) notes.push(file.path);
		}
		this.namer.reset(notes);
		this.ready = true;
		for (const file of sidecars) this.indexByName(file);
		void this.reconcile();
	}

	/**
	 * Match every unindexed sidecar back to its note by its `osmosis-note` link,
	 * and rename each indexed sidecar whose name is not its note's. Resolves, once
	 * the renames are done, to the number of sidecars still matching no note.
	 */
	async reconcile(): Promise<number> {
		let orphans = 0;
		const moved: TFile[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.isSidecar(file.path)) continue;
			let note = this.owner.get(file) ?? null;
			if (note === null) {
				note = this.indexByName(file) ?? this.recover(file);
				if (note !== null) this.emit(note);
			}
			if (note === null) orphans++;
			else if (fileName(file.path) !== this.namer.nameOf(note)) moved.push(file);
		}
		await this.renameSidecars(moved);
		return orphans;
	}

	/** Register the vault and metadata listeners that keep the names and the index current. */
	attach(host: { registerEvent(ref: EventRef): void }): void {
		host.registerEvent(this.app.metadataCache.on("changed", (file) => this.onChanged(file)));
		host.registerEvent(this.app.vault.on("create", (file) => this.onCreate(file)));
		host.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
		host.registerEvent(this.app.vault.on("delete", (file) => this.onDelete(file)));
	}

	private onChanged(file: TFile): void {
		if (!this.ready || !this.isSidecar(file.path)) return;
		let note = this.owner.get(file) ?? null;
		if (note === null) {
			// Parsed only now (a cold cache, or synced in): its link can name its note.
			note = this.indexByName(file) ?? this.recover(file);
			if (note !== null && fileName(file.path) !== this.namer.nameOf(note)) void this.renameSidecars([file]);
		}
		if (note !== null) this.emit(note);
	}

	private onCreate(abstract: TAbstractFile): void {
		const file = asMarkdown(abstract);
		if (!this.ready || !file) return;
		if (this.isSidecar(file.path)) {
			// Synced in, or made by hand. Our own new sidecar is already indexed.
			if (this.owner.has(file)) return;
			const note = this.indexByName(file);
			if (note !== null) this.emit(note);
			return;
		}
		if (this.isNotePath(file.path)) this.applyNames(this.namer.add(file.path));
	}

	private onRename(abstract: TAbstractFile, oldPath: string): void {
		if (!this.ready) return;
		const file = asMarkdown(abstract);
		if (!file) {
			// A note renamed to another extension is no longer a note. (A folder's
			// rename is followed by one event per file inside it.)
			if (this.namer.has(oldPath)) this.noteGone(oldPath, false);
			return;
		}
		if (this.renaming.has(file)) return;
		if (this.owner.has(file) || this.isSidecar(oldPath) || this.isSidecar(file.path)) {
			// A sidecar renamed by hand or by sync, or moved in or out of the
			// folder (`DataMover.moveSidecars` when the folder setting changes).
			if (this.namer.has(oldPath)) this.noteGone(oldPath, false);
			const before = this.unlinkFile(file);
			const after = this.isSidecar(file.path) ? this.indexByName(file) : null;
			if (before !== null && before !== after) this.emit(before);
			if (after !== null && after !== before) this.emit(after);
			if (this.isNotePath(file.path)) this.applyNames(this.namer.add(file.path));
			return;
		}
		const wasNote = this.namer.has(oldPath);
		const isNote = this.isNotePath(file.path);
		const sidecar = this.index.get(oldPath) ?? null;
		if (sidecar) {
			this.unlinkNote(oldPath);
			if (isNote) this.link(file.path, sidecar);
		}
		this.applyNames(this.namer.update(wasNote ? [oldPath] : [], isNote ? [file.path] : []));
		if (!sidecar || !isNote) return;
		this.serial(sidecar, () => this.app.fileManager.processFrontMatter(sidecar, (fm: Record<string, unknown>) => {
			fm[SIDECAR_LINK_KEY] = noteLink(file.path);
		})).catch((error: unknown) => {
			console.error(`Osmosis: could not repoint sidecar ${sidecar.path} at ${file.path}`, error);
		});
	}

	private onDelete(abstract: TAbstractFile): void {
		const file = asMarkdown(abstract);
		if (!this.ready || !file) return;
		if (this.owner.has(file) || this.isSidecar(file.path)) {
			const note = this.unlinkFile(file);
			if (note !== null) this.emit(note);
			return;
		}
		if (this.namer.has(file.path)) this.noteGone(file.path, true);
	}

	/** A note deleted (its sidecar trashed) or no longer a note (its sidecar left, an orphan). */
	private noteGone(notePath: string, trash: boolean): void {
		const sidecar = this.index.get(notePath) ?? null;
		this.unlinkNote(notePath);
		this.applyNames(this.namer.remove(notePath));
		if (!sidecar || !trash) return;
		this.serial(sidecar, () => this.app.fileManager.trashFile(sidecar)).catch((error: unknown) => {
			console.error(`Osmosis: could not trash sidecar ${sidecar.path}`, error);
		});
	}

	private isNotePath(path: string): boolean {
		return path.endsWith(".md") && !this.isSidecar(path) && !this.isLogPath(path);
	}

	/**
	 * Index a sidecar under the note its file name belongs to. A note keeps a
	 * sidecar already carrying its exact name; otherwise the name wins (the
	 * other file is mid-rename or stale, and becomes an orphan). Returns the
	 * note path, or null when the name is no note's.
	 */
	private indexByName(file: TFile): string | null {
		const name = fileName(file.path);
		if (!name.endsWith(SIDECAR_SUFFIX)) return null;
		const note = this.namer.noteOf(name);
		if (note === null) return null;
		const current = this.index.get(note);
		if (current && current !== file && fileName(current.path) === this.namer.nameOf(note)) return null;
		this.link(note, file);
		return note;
	}

	/** Index an orphan under the note its `osmosis-note` link resolves to, if that note has no sidecar. */
	private recover(file: TFile): string | null {
		const linkpath = parseNoteLink(this.app.metadataCache.getFileCache(file)?.frontmatter?.[SIDECAR_LINK_KEY]);
		if (linkpath === null) return null;
		const note = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path)?.path;
		if (note === undefined || !this.namer.has(note) || this.index.has(note)) return null;
		this.link(note, file);
		return note;
	}

	/** Index `file` as `notePath`'s sidecar, replacing whatever either had. */
	private link(notePath: string, file: TFile): void {
		this.unlinkNote(notePath);
		this.unlinkFile(file);
		this.index.set(notePath, file);
		this.owner.set(file, notePath);
	}

	private unlinkNote(notePath: string): void {
		const file = this.index.get(notePath);
		if (file === undefined) return;
		this.index.delete(notePath);
		this.owner.delete(file);
	}

	/** Drop a sidecar from the index, returning the note it belonged to. */
	private unlinkFile(file: TFile): string | null {
		const note = this.owner.get(file);
		if (note === undefined) return null;
		this.owner.delete(file);
		this.index.delete(note);
		return note;
	}

	// ── Renames ────────────────────────────────────────────

	/** Rename the sidecars of the notes whose names changed. */
	private applyNames(changes: readonly NameChange[]): void {
		const files: TFile[] = [];
		for (const { path, to } of changes) {
			const file = to === null ? undefined : this.index.get(path);
			if (file && fileName(file.path) !== to) files.push(file);
		}
		if (files.length > 0) void this.renameSidecars(files);
	}

	/**
	 * Rename each sidecar to its note's name *as it is when the rename runs*
	 * (so a later event's name wins over an earlier queued one). A rename whose
	 * name is held by another file in the same batch waits for that one to move;
	 * one held by anything else is skipped and logged — the sidecar stays
	 * indexed under its old name until the next `reconcile`.
	 */
	private renameSidecars(files: readonly TFile[]): Promise<void> {
		if (files.length === 0) return this.renames;
		for (const file of files) this.renaming.set(file, (this.renaming.get(file) ?? 0) + 1);
		const run = async (): Promise<void> => {
			let pending = [...files];
			while (pending.length > 0) {
				const waiting: TFile[] = [];
				for (const file of pending) {
					const note = this.owner.get(file);
					const name = note === undefined ? null : this.namer.nameOf(note);
					if (name === null) continue;
					const dest = `${this.settings().sidecarFolder}/${name}`;
					if (file.path === dest) continue;
					const occupant = this.app.vault.getAbstractFileByPath(dest);
					if (occupant !== null && occupant !== file) {
						if (pending.some((other) => other === occupant)) waiting.push(file);
						else console.warn(`Osmosis: cannot rename sidecar ${file.path} to ${dest}: the name is taken`);
						continue;
					}
					try {
						await this.serial(file, () => this.app.vault.rename(file, dest));
					} catch (error) {
						console.error(`Osmosis: could not rename sidecar ${file.path} to ${dest}`, error);
					}
				}
				if (waiting.length === pending.length) {
					console.warn("Osmosis: sidecar renames wait on each other; left as they are", waiting.map((f) => f.path));
					break;
				}
				pending = waiting;
			}
		};
		const done = this.renames.then(run).finally(() => {
			for (const file of files) {
				const count = (this.renaming.get(file) ?? 1) - 1;
				if (count > 0) this.renaming.set(file, count);
				else this.renaming.delete(file);
			}
		});
		this.renames = done.catch(() => undefined);
		return this.renames;
	}

	/** Run `op` after every earlier operation on the same sidecar has settled. */
	private serial<T>(file: TFile, op: () => Promise<T>): Promise<T> {
		const previous = this.chains.get(file) ?? Promise.resolve();
		const next = previous.then(op);
		const settled = next.then(() => undefined, () => undefined);
		this.chains.set(file, settled);
		void settled.then(() => {
			if (this.chains.get(file) === settled) this.chains.delete(file);
		});
		return next;
	}

	// ── Creating ───────────────────────────────────────────

	private createSidecar(file: TFile): Promise<TFile> {
		const inflight = this.creating.get(file.path);
		if (inflight) return inflight;
		const created = this.doCreateSidecar(file).finally(() => this.creating.delete(file.path));
		this.creating.set(file.path, created);
		return created;
	}

	private async doCreateSidecar(file: TFile): Promise<TFile> {
		if (!this.ready) this.rebuildIndex();
		// A re-qualification in flight may be vacating this note's name.
		await this.renames;
		const indexed = this.sidecarOf(file);
		if (indexed) return indexed;
		const { vault } = this.app;
		const folder = this.settings().sidecarFolder;
		if (vault.getAbstractFileByPath(folder) === null) {
			await vault.createFolder(folder);
			this.excludeFolder(null, folder);
			this.onFolderExcluded();
		}
		if (!this.namer.has(file.path)) this.applyNames(this.namer.add(file.path));
		const path = `${folder}/${this.namer.nameOf(file.path) ?? ""}`;
		const found = vault.getFileByPath(path);
		if (found) {
			// Made on another device and synced in, not yet indexed here: it is this note's by name.
			const holder = this.owner.get(found);
			if (holder !== undefined && holder !== file.path) throw new Error(`Osmosis: ${path} is still the sidecar of ${holder}`);
			this.link(file.path, found);
			return found;
		}
		const sidecar = await vault.create(path, sidecarContent(file.path));
		this.link(file.path, sidecar);
		return sidecar;
	}

	private emit(notePath: string): void {
		for (const listener of this.listeners) listener(notePath);
	}
}
