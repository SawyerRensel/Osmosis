/**
 * Keeping heading links working when a heading is renamed in an Osmosis node
 * editor (2D or 3D), as Obsidian's own editor does. See
 * `vault/Planner/Graph - Node link aliases and heading-rename link updates.md`.
 *
 * A view calls `planHeadingRename` with the renamed line before and after;
 * when it returns a plan, the view rewrites its own note's same-note links in
 * the text it is about to write (`rewriteOwnLinks`), writes it, then calls
 * `rewriteVaultLinks` for every other note. The text work is the pure
 * `heading-links.ts`.
 */
import { Notice, TFile, type App } from "obsidian";
import type { EditPipeline } from "./edit-pipeline";
import { extractTrailingBlockId } from "./block-id";
import { hasHeading, headingMatches, headingOfLine, headingRenameNotice, rewriteHeadingLinks, type HeadingIds, type HeadingLinkRewrite } from "./heading-links";

export interface HeadingRename {
	file: TFile;
	from: string;
	to: string;
	/** The heading's block ids before and after, which links written by the suggest carry (`[[#Old os-a1b2c3|Old]]`). */
	ids: HeadingIds;
}

/** Obsidian's "Automatically update internal links" (Files and links). Off when unset, as in Obsidian. */
function autoUpdateLinks(app: App): boolean {
	const vault = app.vault as unknown as { getConfig?: (key: string) => unknown };
	return vault.getConfig?.("alwaysUpdateLinks") === true;
}

/**
 * A heading rename whose links should follow, or null: the setting is off,
 * either line is not a heading, the heading text is unchanged (to a link's
 * eyes), or the note still has a heading matching the old text after the
 * rename (its links resolve to that one now, and must not be retargeted).
 */
export function planHeadingRename(app: App, file: TFile, oldLine: string, newLine: string, newContent: string): HeadingRename | null {
	if (!autoUpdateLinks(app)) return null;
	const from = headingOfLine(oldLine);
	const to = headingOfLine(newLine);
	if (from === null || to === null || from === "" || to === "" || headingMatches(from, to)) return null;
	if (hasHeading(newContent, from)) return null;
	return { file, from, to, ids: { from: extractTrailingBlockId(oldLine)?.id ?? null, to: extractTrailingBlockId(newLine)?.id ?? null } };
}

function targets(app: App, rename: HeadingRename, sourcePath: string): (linkpath: string) => boolean {
	return (linkpath) => (linkpath === "" ? sourcePath === rename.file.path : app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath) === rename.file);
}

/** The renamed note's own text with its links to the old heading rewritten. */
export function rewriteOwnLinks(app: App, rename: HeadingRename, content: string): HeadingLinkRewrite {
	return rewriteHeadingLinks(content, rename.from, rename.to, targets(app, rename, rename.file.path), rename.ids);
}

/**
 * Rewrite the links to the old heading in every other note that links to the
 * renamed one (`resolvedLinks`), each atomically and recorded as one undo
 * step, then show "Updated N links in M notes" (counting `own`, the links
 * already rewritten in the renamed note). A failed note is logged and skipped.
 */
export async function rewriteVaultLinks(app: App, edits: EditPipeline, rename: HeadingRename, own: number): Promise<void> {
	let links = own;
	let notes = own > 0 ? 1 : 0;
	const sources = Object.entries(app.metadataCache.resolvedLinks)
		.filter(([path, dests]) => path !== rename.file.path && path.endsWith(".md") && (dests[rename.file.path] ?? 0) > 0)
		.map(([path]) => path);
	const group = sources.length > 0 && !edits.recorder.grouping && !edits.recorder.live;
	if (group) edits.recorder.beginGroup();
	try {
		for (const path of sources) {
			const file = app.vault.getFileByPath(path);
			if (!(file instanceof TFile)) continue;
			let count = 0;
			try {
				// Most linking notes link elsewhere in the note: those are not written at all.
				if (rewriteHeadingLinks(await app.vault.cachedRead(file), rename.from, rename.to, targets(app, rename, path), rename.ids).count === 0) continue;
				await edits.process(file, (data) => {
					const out = rewriteHeadingLinks(data, rename.from, rename.to, targets(app, rename, path), rename.ids);
					count = out.count;
					return out.text;
				});
			} catch (error) {
				console.error(`Osmosis: could not update heading links in ${path}`, error);
				continue;
			}
			if (count > 0) {
				links += count;
				notes++;
			}
		}
	} finally {
		if (group) edits.recorder.endGroup();
	}
	const message = headingRenameNotice(links, notes);
	if (message !== null) new Notice(`Osmosis: ${message}`);
}
