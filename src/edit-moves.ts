/**
 * Moving lines from one note into another, for any view that edits notes: the
 * mind map (a drag, an Alt-arrow or a cut and paste across an embed seam) and
 * Cosmos ("Move under" / "Move after" a line in another note).
 *
 * Extracted from `MindMapView` unchanged. The view supplies how it writes (its
 * own normalisation and what it re-parses after a frontmatter write) through a
 * {@link MoveContext}; the order of the writes, the undo group and the
 * migration of review history stay here, in one place.
 */
import { Notice, TFile, parseYaml, type App } from "obsidian";
import type { EditPipeline } from "./edit-pipeline";
import * as edit from "./mindmap-edit";
import { SCHEDULE_FRONTMATTER_KEY } from "./store/ScheduleStore";
import type { OsmosisNode } from "./types";

const EMPTY_BLOCK_IDS: ReadonlySet<string> = new Set();

/** What a move needs from the view doing it. */
export interface MoveContext {
	app: App;
	/** The view's pipeline: a move is one edit group in it, so one Ctrl+Z reverts every file. */
	edits: EditPipeline;
	/** Normalise and write one file, recorded, without re-rendering (the mind map's `writeFileTracked`). */
	write(file: TFile, content: string): Promise<void>;
	/** A recorded frontmatter write (the mind map's `processFrontMatterTracked`). */
	processFrontMatter(file: TFile, fn: (fm: Record<string, unknown>) => void): Promise<void>;
	plugin: {
		scheduleStore: { flushPath(path: string): Promise<void> };
		cardSync: { handleBlockMove(oldPath: string, newPath: string, blockIds: ReadonlySet<string>): void };
		refreshDashboard(): void;
	};
	/** Run once the group has closed, even after a bail: the view must show what is on disk now. */
	settle?(): Promise<void>;
}

/** Where a move put its block: the destination's text as spliced (before the write normalised it), and where the block starts in it. */
export interface MovedBlock {
	text: string;
	start: number;
}

/**
 * Read one key out of a file's YAML frontmatter block, straight from its raw
 * markdown. Used where the metadata cache can't be trusted — right after our
 * own write, it still holds the pre-write frontmatter.
 */
export function frontmatterValue(content: string, key: string): unknown {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
	if (!match?.[1]) return undefined;
	try {
		const parsed: unknown = parseYaml(match[1]);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return undefined;
		}
		return (parsed as Record<string, unknown>)[key];
	} catch {
		return undefined;
	}
}

function fileAtPath(app: App, path: string): TFile | null {
	const file = app.vault.getFileByPath(path);
	return file instanceof TFile ? file : null;
}

/**
 * Move a contiguous run of siblings out of one note and into another — the
 * primitive behind every gesture that crosses an embed boundary.
 *
 * **Write order is a safety property, not a preference.** The destination is
 * written first: if that fails, the origin still holds the content and the
 * vault is exactly as it was. Only once the bytes exist in the destination is
 * the origin spliced, so the worst failure duplicates the content instead of
 * destroying it — and the duplicate is already inside the undo group, so one
 * Ctrl+Z reverts it.
 *
 * The subtree text is sliced **verbatim** so `^os-…` block IDs survive, then
 * re-indented into the destination's own coordinates. When the insert lands
 * beside an existing line, that neighbor supplies type and depth: the drop's
 * tree parent is expressed in the *origin's* file, and feeding host depth into
 * a source note indents the line wrongly. `fallbackContext` covers the sites
 * with no neighbor (appending inside an embed, reparenting onto one), where
 * the target parent does live in the destination file and its own child rules
 * already apply.
 *
 * @returns where the block landed; null after a bail (with a notice shown).
 */
export async function moveAcrossFiles(
	ctx: MoveContext,
	originNodes: OsmosisNode[],
	site: edit.InsertSite,
	originPath: string,
	fallbackContext: (src: OsmosisNode) => {
		type: OsmosisNode["type"];
		depth: number;
	},
): Promise<MovedBlock | null> {
	const originFile = ctx.app.vault.getFileByPath(originPath);
	const destFile = ctx.app.vault.getFileByPath(site.path);
	if (!(originFile instanceof TFile) || !(destFile instanceof TFile)) {
		new Notice("Osmosis: the destination note is no longer available");
		return null;
	}

	ctx.edits.recorder.beginGroup();
	try {
		let originText: string;
		let destText: string;
		try {
			originText = await ctx.app.vault.read(originFile);
			destText = await ctx.app.vault.read(destFile);
		} catch {
			new Notice("Osmosis: the destination note is no longer available");
			return null;
		}

		// Extract verbatim (block IDs intact), then re-indent for the destination.
		const parts: string[] = [];
		for (const src of originNodes) {
			const text = originText.slice(
				src.range.start,
				edit.subtreeEnd(src),
			);
			const context = site.neighbor
				? edit.inferSiblingContext(site.neighbor, src)
				: fallbackContext(src);
			parts.push(
				edit.reindentSubtree(text, src, context.type, context.depth),
			);
		}
		const block = parts.join("\n");
		const spliced = edit.insertBlock(destText, site.offset, block);

		try {
			await ctx.write(destFile, spliced);
		} catch {
			new Notice(
				`Osmosis: couldn't write ${destFile.basename} — move cancelled`,
			);
			return null;
		}

		try {
			const span = edit.subtreeSpan(originNodes);
			await ctx.write(
				originFile,
				edit.cutBlock(originText, span),
			);
		} catch {
			new Notice(
				`Osmosis: moved into ${destFile.basename} but couldn't update ${originFile.basename} — undo to revert`,
			);
			return null;
		}

		// Identity follows the bytes (design decision #3): the block IDs now
		// living in the destination take their schedule with them, inside this
		// same group so one Ctrl+Z restores both. The IDs are read from the
		// moved text rather than the tree — a subtree carrying an embed folds
		// to its `![[…]]` line, and the transcluded IDs behind it stay in
		// their own note.
		const movedIds = edit.collectBlockIds(block);
		const entries = await readMovedScheduleEntries(
			ctx,
			originPath,
			movedIds,
		);
		await migrateBlockIdentity(
			ctx,
			originPath,
			site.path,
			movedIds,
			entries,
		);
		const prefix = site.offset > 0 && destText[site.offset - 1] !== "\n" ? 1 : 0;
		return { text: spliced, start: site.offset + prefix };
	} finally {
		ctx.edits.recorder.endGroup();
		// Re-sync even after a bail: the view must reflect what is actually on
		// disk, which after a partial write is not what it showed before.
		await ctx.settle?.();
	}
}

/**
 * The `osmosis-schedule` entries a note holds for `blockIds`, read straight
 * from its own bytes rather than the metadata cache — which lags our own
 * writes by an event loop.
 *
 * Pending ratings are flushed first, so a card rated seconds ago migrates
 * with its newest schedule and leaves nothing staged to be re-written into
 * the note it just left. That flush rewrites the frontmatter and shifts
 * every body offset with it, so this must only be called once no further
 * offset-based splice into `path` is pending.
 */
export async function readMovedScheduleEntries(
	ctx: MoveContext,
	path: string,
	blockIds: ReadonlySet<string>,
): Promise<Record<string, unknown>> {
	if (blockIds.size === 0) return {};
	const file = fileAtPath(ctx.app, path);
	if (!file) return {};

	await ctx.plugin.scheduleStore.flushPath(path);
	const content = await ctx.app.vault.read(file);
	return edit.partitionScheduleEntries(
		frontmatterValue(content, SCHEDULE_FRONTMATTER_KEY),
		blockIds,
	).moved;
}

/**
 * Carry line-card identity across a note boundary: write the moved lines'
 * schedule entries into the destination's frontmatter, drop them from the
 * origin's, and re-key the in-memory cards. Without it the debounced sync
 * orphans the origin's card two seconds later and mints the destination's
 * as brand new, with no review history.
 *
 * Called from inside an open edit group *after* the content writes land, so
 * both frontmatter writes join the same undo step — one Ctrl+Z restores text
 * and schedule together. `ctx.processFrontMatter` (recorded through the edit
 * pipeline) is what makes that true; `ScheduleStore` writes on its own
 * debounce and bypasses the edit pipeline, so its writes would fall outside
 * the group.
 *
 * Best-effort by design: the bytes have already moved, so a frontmatter
 * failure is reported and left for the debounced sync to re-derive rather
 * than rolled back (undo still reverts the whole gesture).
 */
export async function migrateBlockIdentity(
	ctx: MoveContext,
	originPath: string,
	destPath: string,
	blockIds: ReadonlySet<string>,
	entries: Record<string, unknown>,
): Promise<void> {
	if (blockIds.size === 0 || originPath === destPath) return;

	if (Object.keys(entries).length > 0) {
		const originFile = fileAtPath(ctx.app, originPath);
		const destFile = fileAtPath(ctx.app, destPath);
		try {
			if (destFile) {
				await ctx.processFrontMatter(destFile, (fm) => {
					const { retained: existing } = edit.partitionScheduleEntries(
						fm[SCHEDULE_FRONTMATTER_KEY],
						EMPTY_BLOCK_IDS,
					);
					fm[SCHEDULE_FRONTMATTER_KEY] = { ...existing, ...entries };
				});
			}
			if (originFile) {
				await ctx.processFrontMatter(originFile, (fm) => {
					const { retained } = edit.partitionScheduleEntries(
						fm[SCHEDULE_FRONTMATTER_KEY],
						blockIds,
					);
					if (Object.keys(retained).length > 0) {
						fm[SCHEDULE_FRONTMATTER_KEY] = retained;
					} else {
						delete fm[SCHEDULE_FRONTMATTER_KEY];
					}
				});
			}
		} catch (error) {
			console.error("Osmosis: failed to migrate schedule frontmatter", error);
			new Notice(
				"Osmosis: the lines moved, but their review history couldn't follow",
			);
		}
	}

	ctx.plugin.cardSync.handleBlockMove(originPath, destPath, blockIds);
	ctx.plugin.refreshDashboard();
}
