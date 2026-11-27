/**
 * The loaded area of Cosmos: which notes are within N hops of the focus.
 * See the `# Spec` section of `vault/Planner/Develop Mind-Map Graph View.md`
 * ("Streaming: the loaded area").
 *
 * Hops are counted over notes, using `metadataCache.resolvedLinks`, which also
 * records frontmatter links. By default they follow outgoing links only, as
 * the mind map does: a note that links to the focus is not pulled in unless
 * backlinks are on, and then it is as near as one the focus links to. Only
 * Markdown notes are hops: attachments are in `resolvedLinks` too, but one
 * shared image must not pull every note that uses it into the loaded area.
 * Tags are not in it at all, so a popular tag can't either. The model still
 * draws both wherever a loaded note reaches them.
 */

/** `metadataCache.resolvedLinks`: source path → destination path → count. */
export type ResolvedLinks = Record<string, Record<string, number>>;

/** Note-to-note neighbours, keyed by path: the notes each note links to, and the notes linking to it. */
export interface NoteAdjacency {
	forward: Map<string, Set<string>>;
	backward: Map<string, Set<string>>;
}

export interface Horizon {
	focus: string;
	/** Hop distance of every note within `depth + 1` of the focus. */
	hops: Map<string, number>;
	/** Notes within `depth` hops, focus included: parsed, simulated, rendered. */
	loaded: Set<string>;
	/** Notes exactly `depth + 1` hops out: link cache read, nothing parsed. */
	prefetch: Set<string>;
	/** For every note but the focus, the note one hop nearer that reached it. */
	via: Map<string, string>;
}

export interface LoadedDiff {
	arriving: string[];
	departing: string[];
}

const isNotePath = (path: string): boolean => path.endsWith(".md");

/**
 * Build the note graph from `resolvedLinks` once, so each hop only walks the
 * neighbourhood instead of the whole vault. `exclude` drops paths that are not
 * notes though they are Markdown: a sidecar links to its note through its
 * `osmosis-note` property, and would otherwise be its backlinker.
 */
export function noteAdjacency(resolvedLinks: ResolvedLinks, exclude: (path: string) => boolean = () => false): NoteAdjacency {
	const adjacency: NoteAdjacency = { forward: new Map(), backward: new Map() };
	const add = (map: Map<string, Set<string>>, a: string, b: string): void => {
		let set = map.get(a);
		if (set === undefined) map.set(a, (set = new Set()));
		set.add(b);
	};
	for (const [source, targets] of Object.entries(resolvedLinks)) {
		if (!isNotePath(source) || exclude(source)) continue;
		for (const target of Object.keys(targets)) {
			if (target === source || !isNotePath(target) || exclude(target)) continue;
			add(adjacency.forward, source, target);
			add(adjacency.backward, target, source);
		}
	}
	return adjacency;
}

/** Breadth-first search from `focus` out to `depth + 1` hops, over outgoing links and, with `backlinks`, incoming ones too. */
export function computeHorizon(adjacency: NoteAdjacency, focus: string, depth: number, backlinks: boolean): Horizon {
	const hops = new Map<string, number>([[focus, 0]]);
	const loaded = new Set<string>([focus]);
	const prefetch = new Set<string>();
	const via = new Map<string, string>();
	let frontier = [focus];
	for (let hop = 1; hop <= depth + 1 && frontier.length > 0; hop++) {
		const next: string[] = [];
		for (const path of frontier) {
			const neighbours = [...(adjacency.forward.get(path) ?? []), ...(backlinks ? adjacency.backward.get(path) ?? [] : [])];
			for (const neighbour of neighbours) {
				if (hops.has(neighbour)) continue;
				hops.set(neighbour, hop);
				via.set(neighbour, path);
				(hop <= depth ? loaded : prefetch).add(neighbour);
				next.push(neighbour);
			}
		}
		frontier = next;
	}
	return { focus, hops, loaded, prefetch, via };
}

/**
 * Depth 0: the loaded area is the focus plus the notes it transcludes (see
 * `transcluded.ts`), not the notes it links to. `base` is the depth 0 horizon
 * from `computeHorizon`: the focus alone, with its linked notes as the
 * prefetch ring. `hops` and `via` are the embedded notes' distances along embeds
 * and the note that embedded each.
 */
export function withEmbedded(base: Horizon, hops: ReadonlyMap<string, number>, via: ReadonlyMap<string, string>): Horizon {
	const loaded = new Set(base.loaded);
	const prefetch = new Set(base.prefetch);
	const allHops = new Map(base.hops);
	const allVia = new Map(base.via);
	for (const [path, hop] of hops) {
		loaded.add(path);
		prefetch.delete(path);
		allHops.set(path, hop);
	}
	for (const [path, from] of via) allVia.set(path, from);
	return { focus: base.focus, hops: allHops, loaded, prefetch, via: allVia };
}

/**
 * Depth 0 with Backlinks on: also load the notes that link to the focus note
 * ("what links here"), one backward hop from the focus only (not from the notes
 * it embeds). They load whole, as at depth 1, one hop from the focus. A note
 * already loaded (embedded) stays as it is, so none is added twice and an
 * embed's section is not widened; one in the prefetch ring moves out of it.
 */
export function withBacklinkers(base: Horizon, adjacency: NoteAdjacency): Horizon {
	const loaded = new Set(base.loaded);
	const prefetch = new Set(base.prefetch);
	const hops = new Map(base.hops);
	const via = new Map(base.via);
	for (const path of adjacency.backward.get(base.focus) ?? []) {
		if (loaded.has(path)) continue;
		loaded.add(path);
		prefetch.delete(path);
		hops.set(path, 1);
		via.set(path, base.focus);
	}
	return { focus: base.focus, hops, loaded, prefetch, via };
}

/** What changes when the loaded set moves from `previous` to `next`. */
export function diffLoaded(previous: ReadonlySet<string>, next: ReadonlySet<string>): LoadedDiff {
	return {
		arriving: [...next].filter((path) => !previous.has(path)),
		departing: [...previous].filter((path) => !next.has(path)),
	};
}
