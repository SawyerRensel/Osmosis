/**
 * Depth 0 of the 3D graph: the focus note's own content plus whatever it
 * transcludes with `![[…]]`. Plain links load nothing.
 *
 * Only the part an embed renders counts: the whole note (`![[Note]]`), a
 * heading's section (`![[Note#Heading]]`) or a block (`![[Note#^id]]`), the way
 * `buildGraph` resolves the same link. A subpath that matches nothing falls back
 * to the whole note, as it does there. Embeds inside embedded content follow, as
 * in the 2D mind map; a part already reached is not walked twice, so cycles end.
 * Unlike the mind map, an embed at the top level of an embedded note follows too
 * (the mind map leaves that one unexpanded, a quirk of its parse tree).
 */

import type { OsmosisNode } from "../types";
import { normalizeHeading, subpathKey, type LinkResolver, type NoteInput } from "./model";

/** What depth 0 shows of one note. */
export interface Embedded {
	/** Every note shown, the focus first, each with the `only` it needs. */
	notes: NoteInput[];
	/** Embedding distance from the focus; the focus is 0. */
	hops: Map<string, number>;
	/** For every note but the focus, the note whose embed first reached it. */
	via: Map<string, string>;
}

/** A note's shown part so far: all of it, or the subtrees under these roots. */
interface Scope {
	input: NoteInput;
	whole: boolean;
	roots: Set<OsmosisNode>;
}

/** Whether `offset` falls on a line of the subtree under `root`. */
function inSubtree(root: OsmosisNode, offset: number): boolean {
	if (offset >= root.range.start && offset < root.range.end) return true;
	return root.children.some((child) => inSubtree(child, offset));
}

/** The first node in source order that `match` accepts. */
function find(parent: OsmosisNode, match: (node: OsmosisNode) => boolean): OsmosisNode | undefined {
	for (const child of parent.children) {
		if (match(child)) return child;
		const found = find(child, match);
		if (found !== undefined) return found;
	}
	return undefined;
}

/** The node a link's subpath (without its `#`) names in `input`'s tree, or undefined for the whole note. */
function sectionOf(input: NoteInput, subpath: string): OsmosisNode | undefined {
	const key = subpathKey(subpath);
	if (key === null) return undefined;
	return find(input.tree.root, (node) =>
		"blockId" in key ? node.blockId === key.blockId : node.type === "heading" && normalizeHeading(node.content) === key.heading,
	);
}

/**
 * Collect the focus note and everything it transcludes. `read` loads and parses
 * a note by path (null when it can't be read); `resolve` maps link paths to
 * files, as for `buildGraph`. Attachment embeds are not notes and are skipped:
 * the model draws them from the link cache.
 */
export async function collectEmbedded(focus: NoteInput, read: (path: string) => Promise<NoteInput | null>, resolve: LinkResolver): Promise<Embedded> {
	const focusPath = focus.tree.filePath;
	const scopes = new Map<string, Scope>([[focusPath, { input: focus, whole: true, roots: new Set() }]]);
	const hops = new Map<string, number>([[focusPath, 0]]);
	const via = new Map<string, string>();
	const unreadable = new Set<string>();
	const queue = [focusPath];

	while (queue.length > 0) {
		const path = queue.shift()!;
		const scope = scopes.get(path)!;
		for (const ref of scope.input.cache?.embeds ?? []) {
			const offset = ref.position.start.offset;
			if (!scope.whole && ![...scope.roots].some((root) => inSubtree(root, offset))) continue;

			const hash = ref.link.indexOf("#");
			const linkpath = hash === -1 ? ref.link : ref.link.slice(0, hash);
			const subpath = hash === -1 ? "" : ref.link.slice(hash + 1);
			const targetPath = linkpath === "" ? path : resolve(linkpath, path);
			if (targetPath === null || !targetPath.endsWith(".md") || unreadable.has(targetPath)) continue;

			let target = scopes.get(targetPath);
			if (target === undefined) {
				const input = await read(targetPath);
				if (input === null) {
					unreadable.add(targetPath);
					continue;
				}
				target = { input, whole: false, roots: new Set() };
				scopes.set(targetPath, target);
				hops.set(targetPath, (hops.get(path) ?? 0) + 1);
				via.set(targetPath, path);
			}
			if (target.whole) continue;

			const section = sectionOf(target.input, subpath);
			if (section === undefined) target.whole = true;
			else if (target.roots.has(section)) continue;
			else target.roots.add(section);
			if (!queue.includes(targetPath)) queue.push(targetPath);
		}
	}

	const notes = [...scopes.values()].map(({ input, whole, roots }): NoteInput => (whole ? { tree: input.tree, cache: input.cache } : { tree: input.tree, cache: input.cache, only: roots }));
	return { notes, hops, via };
}
