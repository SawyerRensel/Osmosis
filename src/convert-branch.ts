/**
 * "Convert branch to note", for any view that edits notes (the mind map and
 * the 3D graph): move a line and its subtree into a new note, leave an
 * `![[embed]]` in its place, carry its styles and line-card history across,
 * and point links into it at the new note.
 *
 * The text transforms are pure, in `src/branch-to-note.ts`; this file does the
 * reads and writes. The view supplies how it writes through a
 * {@link MoveContext}, as for a cross-note move.
 */
import { Notice, TFile, normalizePath, type App } from "obsidian";
import {
	anchorToSource,
	applyTemplate,
	convertBranch,
	replaceBranch,
	retargetLinks,
	splitStyles,
	stableSelectorPairs,
	uniqueNotePath,
	type MovedTargets,
} from "./branch-to-note";
import { frontmatterValue, migrateBlockIdentity, readMovedScheduleEntries, type MoveContext } from "./edit-moves";
import { findNodeById, locateLine } from "./graph3d/edit";
import { subtreeEnd } from "./mindmap-edit";
import { OsmosisParser } from "./parser";
import { styleMappingFor } from "./styles";
import type { OsmosisNode } from "./types";

/** The settings the conversion reads: where new notes go and the template merged into them ("" for none). */
export interface BranchNoteSettings {
	folder: string;
	template: string;
}

/** The line types a branch can be converted from: not the root, an embed line, or an atomic block. */
const CONVERTIBLE: ReadonlySet<OsmosisNode["type"]> = new Set(["heading", "bullet", "ordered", "paragraph"]);

/** Whether a line can be converted (see {@link CONVERTIBLE}). */
export function canConvertBranch(line: Pick<OsmosisNode, "type" | "isTranscluded">): boolean {
	return CONVERTIBLE.has(line.type) && !line.isTranscluded;
}

/** Where the conversion left things: the new note, and where its embed line starts in the source. */
export interface ConvertedBranch {
	file: TFile;
	embedStart: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

async function readTemplate(app: App, setting: string): Promise<string | null> {
	const raw = setting.trim();
	if (raw === "") return null;
	const file = app.vault.getFileByPath(normalizePath(raw.endsWith(".md") ? raw : `${raw}.md`));
	if (file === null) {
		new Notice(`Osmosis: template "${raw}" not found, so the new note was created without it`);
		return null;
	}
	return app.vault.read(file);
}

/**
 * Convert the line `lineId` (its parse ID) of `source` and its subtree into a
 * new note. One edit group: one undo reverts the source, the moved frontmatter
 * and the rewritten links, though not the new note's creation (undo can't
 * delete a file), which is left holding a copy of the branch.
 *
 * Write order follows `moveAcrossFiles`: the new note is created first, so a
 * failure after it duplicates the branch rather than losing it.
 *
 * @returns the new note and the embed line's offset; null after a bail (with a notice shown).
 */
export async function convertBranchToNote(
	ctx: MoveContext,
	settings: BranchNoteSettings,
	source: TFile,
	lineId: string,
): Promise<ConvertedBranch | null> {
	const { app } = ctx;
	// Flush staged ratings first: the flush rewrites frontmatter, which would
	// move every offset below and could land on top of this write.
	await ctx.plugin.scheduleStore.flushPath(source.path);
	const content = await app.vault.read(source);
	const parser = new OsmosisParser();
	const line = findNodeById(parser.parse(content, source.path).root, lineId);
	if (line === null || !canConvertBranch(line)) {
		new Notice("Osmosis: that line has changed; try again");
		return null;
	}
	const conversion = convertBranch(content, line.range.start, subtreeEnd(line));
	const { moved } = conversion;

	const configured = normalizePath(settings.folder.trim());
	const folder = settings.folder.trim() === "" || configured === "/" ? (source.parent?.path ?? "") : configured;
	const dir = folder === "/" ? "" : folder;
	const path = uniqueNotePath(dir, conversion.fileName, (p) => app.vault.getAbstractFileByPath(p) !== null);
	const name = path.slice(path.lastIndexOf("/") + 1, -".md".length);
	const template = await readTemplate(app, settings.template);
	const pointsAtSource = (from: string) => (linkpath: string): boolean =>
		linkpath !== "" && app.metadataCache.getFirstLinkpathDest(linkpath, from)?.path === source.path;

	// The branch's own links: those to what stayed behind now name the source;
	// those naming the source for something that moved now name the new note.
	const body = retargetLinks(
		anchorToSource(conversion.body, moved, app.metadataCache.fileToLinktext(source, path, true)),
		pointsAtSource(path),
		moved,
		name,
	);

	ctx.edits.recorder.beginGroup();
	try {
		let file: TFile;
		try {
			if (dir !== "" && app.vault.getAbstractFileByPath(dir) === null) await app.vault.createFolder(dir);
			file = await app.vault.create(path, applyTemplate(body, template));
		} catch (error) {
			console.error("Osmosis: could not create the note for a branch", error);
			new Notice(`Osmosis: couldn't create ${path}`);
			return null;
		}

		const linktext = app.metadataCache.fileToLinktext(file, source.path, true);
		const embedLine = `${conversion.embedPrefix}![[${linktext}]]`;
		const replaced = retargetLinks(
			replaceBranch(content, conversion, linktext),
			(p) => p === "" || pointsAtSource(source.path)(p),
			moved,
			linktext,
		);
		try {
			await ctx.write(source, replaced);
		} catch (error) {
			console.error("Osmosis: could not replace a converted branch", error);
			new Notice(`Osmosis: created ${file.basename} but couldn't update ${source.basename}; undo to revert`);
			return null;
		}

		await inheritCardKeys(ctx, file, content);
		await moveStyles(ctx, source, file, content, line, body, moved);
		const entries = await readMovedScheduleEntries(ctx, source.path, moved.blockIds);
		await migrateBlockIdentity(ctx, source.path, file.path, moved.blockIds, entries);
		const relinked = await retargetIncoming(ctx, source, file, moved);

		new Notice(`Osmosis: moved the branch to ${file.basename}${relinked > 0 ? `, and updated links in ${relinked} ${relinked === 1 ? "note" : "notes"}` : ""}`);
		const written = await app.vault.read(source);
		return { file, embedStart: locateLine(written, embedLine, conversion.start) };
	} finally {
		ctx.edits.recorder.endGroup();
		await ctx.settle?.();
	}
}

/** The frontmatter keys that decide whether and where a note's cards are studied. */
const CARD_KEYS = ["osmosis-cards", "osmosis-deck", "osmosis-line-cards"] as const;

/**
 * Give the new note the source's card opt-in, deck and line-card setting
 * (those it sets, and the template doesn't): without `osmosis-cards` the
 * branch's cards would silently stop being generated once they moved.
 */
async function inheritCardKeys(ctx: MoveContext, file: TFile, content: string): Promise<void> {
	const inherited = CARD_KEYS.map((key) => [key, frontmatterValue(content, key)] as const).filter(([, value]) => value !== undefined);
	if (inherited.length === 0) return;
	try {
		await ctx.processFrontMatter(file, (fm) => {
			for (const [key, value] of inherited) if (!(key in fm)) fm[key] = value;
		});
	} catch (error) {
		console.error("Osmosis: could not copy card settings to a converted branch's note", error);
	}
}

/**
 * Move the branch's entries in the source's `osmosis-styles.styles` to the new
 * note: `^id` keys as they are, `_n:` keys re-keyed by line position (see
 * `stableSelectorPairs`). Tree-path and class selectors stay behind.
 */
async function moveStyles(
	ctx: MoveContext,
	source: TFile,
	file: TFile,
	content: string,
	line: OsmosisNode,
	body: string,
	moved: MovedTargets,
): Promise<void> {
	const mapping = frontmatterValue(content, "osmosis-styles");
	const styles = isRecord(mapping) && isRecord(mapping["styles"]) ? mapping["styles"] : null;
	if (styles === null) return;
	const pairs = stableSelectorPairs(line, new OsmosisParser().parse(body, file.path).root);
	const split = splitStyles(styles, moved.blockIds, pairs);
	if (Object.keys(split.moved).length === 0) return;
	const gone = Object.keys(styles).filter((key) => !(key in split.retained));
	try {
		await ctx.processFrontMatter(file, (fm) => {
			const target = styleMappingFor(fm);
			target["styles"] = { ...(isRecord(target["styles"]) ? target["styles"] : {}), ...split.moved };
		});
		await ctx.processFrontMatter(source, (fm) => {
			const left = styleMappingFor(fm);
			const current = isRecord(left["styles"]) ? left["styles"] : {};
			for (const key of gone) delete current[key];
			if (Object.keys(current).length === 0) delete left["styles"];
			if (Object.keys(left).length === 0) delete fm["osmosis-styles"];
		});
	} catch (error) {
		console.error("Osmosis: could not move a converted branch's styles", error);
		new Notice("Osmosis: the branch moved, but its node styles couldn't follow");
	}
}

/**
 * Rewrite links in other notes that point into the moved branch, each with
 * `vault.process` (atomic against an open editor) and recorded into the open
 * edit group. Found through `resolvedLinks`, which still describes the vault
 * as it was. @returns how many notes changed.
 */
async function retargetIncoming(ctx: MoveContext, source: TFile, file: TFile, moved: MovedTargets): Promise<number> {
	const { app } = ctx;
	let changed = 0;
	for (const [from, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
		if (from === source.path || from === file.path || targets[source.path] === undefined) continue;
		const linking = app.vault.getFileByPath(from);
		if (linking === null) continue;
		const linktext = app.metadataCache.fileToLinktext(file, from, true);
		const resolves = (linkpath: string): boolean =>
			linkpath !== "" && app.metadataCache.getFirstLinkpathDest(linkpath, from)?.path === source.path;
		try {
			let before: string | null = null;
			const after = await app.vault.process(linking, (data) => {
				before = data;
				return retargetLinks(data, resolves, moved, linktext);
			});
			if (before !== null && before !== after) {
				ctx.edits.recorder.record(from, before, after);
				changed++;
			}
		} catch (error) {
			console.error(`Osmosis: could not update links in ${from}`, error);
		}
	}
	return changed;
}
