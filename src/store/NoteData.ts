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
 *
 * Following the note: a rename re-keys the index and rewrites the sidecar's
 * link (even when Obsidian's link updater already did — idempotent); deleting
 * the note trashes its sidecar with `fileManager.trashFile`, which honours the
 * user's trash setting. The sidecar itself is never renamed; it only moves
 * when the folder setting changes.
 */
import type { App, EventRef, TAbstractFile, TFile } from "obsidian";
import {
	SIDECAR_LINK_KEY,
	hasSidecarKeys,
	isSidecarPath,
	mergeNoteData,
	noteLink,
	parseNoteLink,
	sidecarContent,
	sidecarName,
} from "./sidecar";

/** Where a note's Osmosis data lives. */
export type DataLocation = "note" | "sidecar";

export interface NoteDataSettings {
	/** Where a note with no Osmosis data yet gets it. */
	dataLocation: DataLocation;
	sidecarFolder: string;
}

export class NoteData {
	/** Note path → sidecar path, and its reverse. Only {@link link} and {@link unlink} touch them. */
	private index = new Map<string, string>();
	private byPath = new Map<string, string>();
	/** In-flight sidecar creations per note path, so two writes create one file. */
	private creating = new Map<string, Promise<TFile>>();
	private listeners = new Set<(notePath: string) => void>();

	constructor(
		private readonly app: App,
		private readonly settings: () => NoteDataSettings,
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
		const path = this.index.get(file.path);
		return path === undefined ? null : this.app.vault.getFileByPath(path);
	}

	isSidecar(path: string): boolean {
		return isSidecarPath(path, this.settings().sidecarFolder);
	}

	// ── Writes ─────────────────────────────────────────────

	async process(file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void> {
		await this.app.fileManager.processFrontMatter(await this.targetFor(file), fn);
	}

	async targetFor(file: TFile): Promise<TFile> {
		if (this.modeOf(file) === "note") return file;
		return this.ensureSidecar(file);
	}

	/** The note's sidecar, created (with its folder) if it has none, whatever its mode. */
	async ensureSidecar(file: TFile): Promise<TFile> {
		return this.sidecarOf(file) ?? this.createSidecar(file);
	}

	/** The path of every note with an indexed sidecar — including links naming notes that do not exist. */
	notesWithSidecars(): string[] {
		return [...this.index.keys()];
	}

	onChange(listener: (notePath: string) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	// ── Index and lifecycle ────────────────────────────────

	/** Index every sidecar in the folder from the metadata cache. */
	rebuildIndex(): void {
		this.index.clear();
		this.byPath.clear();
		const folder = this.settings().sidecarFolder;
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isSidecarPath(file.path, folder)) this.indexSidecar(file);
		}
	}

	/** Register the vault and metadata listeners that keep the index and links current. */
	attach(host: { registerEvent(ref: EventRef): void }): void {
		host.registerEvent(this.app.metadataCache.on("changed", (file) => this.onChanged(file)));
		host.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
		host.registerEvent(this.app.vault.on("delete", (file) => this.onDelete(file)));
	}

	private onChanged(file: TFile): void {
		if (!this.isSidecar(file.path)) return;
		const before = this.noteFor(file.path);
		const after = this.indexSidecar(file);
		if (before !== null && before !== after) this.emit(before);
		if (after !== null) this.emit(after);
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		if (this.isSidecar(oldPath) || this.isSidecar(file.path)) {
			// A sidecar moved by hand, or by `DataMover.moveSidecars` when the folder setting changes.
			const note = this.noteFor(oldPath);
			if (note !== null) this.unlink(note);
			const moved = this.isSidecar(file.path) ? this.app.vault.getFileByPath(file.path) : null;
			const now = moved ? this.indexSidecar(moved) : null;
			if (note !== null) this.emit(note);
			if (now !== null && now !== note) this.emit(now);
			return;
		}
		const sidecarPath = this.index.get(oldPath);
		if (sidecarPath === undefined) return;
		this.unlink(oldPath);
		this.link(file.path, sidecarPath);
		const sidecar = this.app.vault.getFileByPath(sidecarPath);
		if (!sidecar) return;
		this.app.fileManager.processFrontMatter(sidecar, (fm: Record<string, unknown>) => {
			fm[SIDECAR_LINK_KEY] = noteLink(file.path);
		}).catch((error: unknown) => {
			console.error(`Osmosis: could not repoint sidecar ${sidecarPath} at ${file.path}`, error);
		});
	}

	private onDelete(file: TAbstractFile): void {
		if (this.isSidecar(file.path)) {
			const note = this.noteFor(file.path);
			if (note === null) return;
			this.unlink(note);
			this.emit(note);
			return;
		}
		const sidecarPath = this.index.get(file.path);
		if (sidecarPath === undefined) return;
		this.unlink(file.path);
		const sidecar = this.app.vault.getFileByPath(sidecarPath);
		if (!sidecar) return;
		this.app.fileManager.trashFile(sidecar).catch((error: unknown) => {
			console.error(`Osmosis: could not trash sidecar ${sidecarPath}`, error);
		});
	}

	/**
	 * Index one sidecar under the note its link resolves to (or the path the
	 * link names, when that note does not exist). Returns the note path, or null
	 * when the file has no usable link.
	 */
	private indexSidecar(file: TFile): string | null {
		const previous = this.noteFor(file.path);
		if (previous !== null) this.unlink(previous);
		const note = this.linkedNote(file.path);
		if (note !== null) this.link(note, file.path);
		return note;
	}

	/** The note path a sidecar's `osmosis-note` link names, read from the metadata cache. */
	private linkedNote(sidecarPath: string): string | null {
		const sidecar = this.app.vault.getFileByPath(sidecarPath);
		if (!sidecar) return null;
		const linkpath = parseNoteLink(this.app.metadataCache.getFileCache(sidecar)?.frontmatter?.[SIDECAR_LINK_KEY]);
		if (linkpath === null) return null;
		return this.app.metadataCache.getFirstLinkpathDest(linkpath, sidecarPath)?.path ?? `${linkpath}.md`;
	}

	/** The note an indexed sidecar belongs to. */
	private noteFor(sidecarPath: string): string | null {
		return this.byPath.get(sidecarPath) ?? null;
	}

	/** Index `sidecarPath` as `notePath`'s sidecar, replacing whatever either had. */
	private link(notePath: string, sidecarPath: string): void {
		this.unlink(notePath);
		const previous = this.byPath.get(sidecarPath);
		if (previous !== undefined) this.index.delete(previous);
		this.index.set(notePath, sidecarPath);
		this.byPath.set(sidecarPath, notePath);
	}

	private unlink(notePath: string): void {
		const sidecarPath = this.index.get(notePath);
		if (sidecarPath === undefined) return;
		this.index.delete(notePath);
		this.byPath.delete(sidecarPath);
	}

	private createSidecar(file: TFile): Promise<TFile> {
		const inflight = this.creating.get(file.path);
		if (inflight) return inflight;
		const created = this.doCreateSidecar(file).finally(() => this.creating.delete(file.path));
		this.creating.set(file.path, created);
		return created;
	}

	private async doCreateSidecar(file: TFile): Promise<TFile> {
		const { vault } = this.app;
		const folder = this.settings().sidecarFolder;
		if (vault.getAbstractFileByPath(folder) === null) await vault.createFolder(folder);
		const name = sidecarName(file.path, (candidate) => {
			const path = `${folder}/${candidate}`;
			return vault.getAbstractFileByPath(path) !== null && this.linkedNote(path) !== file.path;
		});
		const path = `${folder}/${name}`;
		// The hash is free, or already this note's own sidecar (made on another
		// device and not yet indexed here): reuse it rather than collide.
		const sidecar = vault.getFileByPath(path) ?? await vault.create(path, sidecarContent(file.path));
		this.link(file.path, sidecar.path);
		return sidecar;
	}

	private emit(notePath: string): void {
		for (const listener of this.listeners) listener(notePath);
	}
}
