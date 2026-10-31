/**
 * The loaded area of the 3D graph: which notes are within N hops of the focus.
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
 * neighbourhood instead of the whole vault.
 */
export function noteAdjacency(resolvedLinks: ResolvedLinks): NoteAdjacency {
	const adjacency: NoteAdjacency = { forward: new Map(), backward: new Map() };
	const add = (map: Map<string, Set<string>>, a: string, b: string): void => {
		let set = map.get(a);
		if (set === undefined) map.set(a, (set = new Set()));
		set.add(b);
	};
	for (const [source, targets] of Object.entries(resolvedLinks)) {
		if (!isNotePath(source)) continue;
		for (const target of Object.keys(targets)) {
			if (target === source || !isNotePath(target)) continue;
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

/** What changes when the loaded set moves from `previous` to `next`. */
export function diffLoaded(previous: ReadonlySet<string>, next: ReadonlySet<string>): LoadedDiff {
	return {
		arriving: [...next].filter((path) => !previous.has(path)),
		departing: [...previous].filter((path) => !next.has(path)),
	};
}
