/**
 * The loaded area of the 3D graph: which notes are within N hops of the focus.
 * See the `# Spec` section of `vault/Planner/Develop Mind-Map Graph View.md`
 * ("Streaming: the loaded area").
 *
 * Hops are counted over notes, in both directions (a note that links to the
 * focus is as near as one it links to), using `metadataCache.resolvedLinks`,
 * which also records frontmatter links. Only Markdown notes are hops:
 * attachments are in `resolvedLinks` too, but one shared image must not pull
 * every note that uses it into the loaded area. Tags are not in it at all, so
 * a popular tag can't either. The model still draws both wherever a loaded
 * note reaches them.
 */

/** `metadataCache.resolvedLinks`: source path → destination path → count. */
export type ResolvedLinks = Record<string, Record<string, number>>;

/** Undirected note-to-note neighbours, keyed by path. */
export type NoteAdjacency = Map<string, Set<string>>;

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
 * Build the undirected note graph from `resolvedLinks` once, so each hop only
 * walks the neighbourhood instead of the whole vault.
 */
export function noteAdjacency(resolvedLinks: ResolvedLinks): NoteAdjacency {
	const adjacency: NoteAdjacency = new Map();
	const link = (a: string, b: string): void => {
		let set = adjacency.get(a);
		if (set === undefined) adjacency.set(a, (set = new Set()));
		set.add(b);
	};
	for (const [source, targets] of Object.entries(resolvedLinks)) {
		if (!isNotePath(source)) continue;
		for (const target of Object.keys(targets)) {
			if (target === source || !isNotePath(target)) continue;
			link(source, target);
			link(target, source);
		}
	}
	return adjacency;
}

/** Breadth-first search from `focus` out to `depth + 1` hops. */
export function computeHorizon(adjacency: NoteAdjacency, focus: string, depth: number): Horizon {
	const hops = new Map<string, number>([[focus, 0]]);
	const loaded = new Set<string>([focus]);
	const prefetch = new Set<string>();
	const via = new Map<string, string>();
	let frontier = [focus];
	for (let hop = 1; hop <= depth + 1 && frontier.length > 0; hop++) {
		const next: string[] = [];
		for (const path of frontier) {
			for (const neighbour of adjacency.get(path) ?? []) {
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
