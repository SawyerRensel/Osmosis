/**
 * Progressive opening for large Mind Maps (T84): draw the first fitted view
 * from the nodes in and around it, and measure the rest afterwards, without
 * anything already drawn moving when the rest lands.
 *
 * A node's position depends on the sizes of nodes it never overlaps (a parent
 * is centred on its whole subtree; a node sits below every earlier sibling's
 * subtree). So "measured" is not enough to draw a node early. A node is
 * **settled** when its position relative to an anchor node cannot change
 * whatever the unmeasured nodes turn out to measure. That is tested, not
 * derived: the layout is run again with every unmeasured node at a huge and
 * at a tiny probe size, and the nodes that move exactly with the anchor in
 * both are settled. Only settled nodes are drawn; the view keeps the anchor
 * still across relayouts, so nothing drawn moves on screen.
 *
 * Pure: the view supplies the layout function and the measuring.
 */
import type { LayoutNode, LayoutResult, NodeSizeMap } from "./layout";
import type { ViewBox } from "./mindmap-viewport";
import { fitViewBox, rectInView } from "./mindmap-cull";

/**
 * Probe sizes for unmeasured nodes: far above and far below anything real.
 * Each node gets a slightly different one: with one size for all, a node
 * centred on its subtree and a node halfway down it move by the same amount
 * when half of the unmeasured nodes sit above the second, and the test would
 * call the first settled.
 */
export const PROBE_BIG = { width: 900, height: 900 };
export const PROBE_SMALL = { width: 1, height: 1 };

/** `sizes` with every `pending` id given a size near `probe` (varied per node). */
export function probeSizes(
	sizes: NodeSizeMap,
	pending: ReadonlySet<string>,
	probe: { width: number; height: number },
): NodeSizeMap {
	const out = new Map(sizes);
	let i = 0;
	for (const id of pending) {
		// Spread over [1, 1.5): distinct, and never near the other probe.
		const f = 1 + ((i++ * 7919) % 1009) / 2018;
		out.set(id, { width: probe.width * f, height: probe.height * f });
	}
	return out;
}

function rectsById(layout: LayoutResult): Map<string, LayoutNode["rect"]> {
	const out = new Map<string, LayoutNode["rect"]>();
	for (const n of layout.nodes) {
		if (n.source.type !== "root") out.set(n.source.id, n.rect);
	}
	return out;
}

/**
 * How each measured node moves from `base` to each probe layout, as a string
 * (hundredths of a unit, so float noise in long sums does not split a group).
 */
function displacementKeys(
	base: LayoutResult,
	probes: readonly LayoutResult[],
	pending: ReadonlySet<string>,
): Map<string, string> {
	const probeRects = probes.map(rectsById);
	const keys = new Map<string, string>();
	for (const n of base.nodes) {
		const id = n.source.id;
		if (n.source.type === "root" || pending.has(id)) continue;
		const parts: number[] = [];
		for (const rects of probeRects) {
			const r = rects.get(id);
			if (!r) {
				parts.length = 0;
				break;
			}
			parts.push(Math.round((r.x - n.rect.x) * 100), Math.round((r.y - n.rect.y) * 100));
		}
		if (parts.length > 0) keys.set(id, parts.join(","));
	}
	return keys;
}

/** The measured nodes that move exactly with `anchorId` in every probe layout. */
export function settledWith(
	base: LayoutResult,
	probes: readonly LayoutResult[],
	pending: ReadonlySet<string>,
	anchorId: string,
): Set<string> {
	const keys = displacementKeys(base, probes, pending);
	const anchorKey = keys.get(anchorId);
	const out = new Set<string>();
	if (anchorKey === undefined) return out;
	for (const [id, key] of keys) if (key === anchorKey) out.add(id);
	return out;
}

/**
 * Pick the anchor for a first view: of the measured `candidates` (the nodes in
 * view), take the largest group that moves together, and from it the node
 * nearest `center`. Null when no candidate is measured.
 */
export function chooseAnchor(
	base: LayoutResult,
	probes: readonly LayoutResult[],
	pending: ReadonlySet<string>,
	candidates: readonly LayoutNode[],
	center: { x: number; y: number },
): string | null {
	const keys = displacementKeys(base, probes, pending);
	const groups = new Map<string, LayoutNode[]>();
	for (const n of candidates) {
		const key = keys.get(n.source.id);
		if (key === undefined) continue;
		const group = groups.get(key);
		if (group) group.push(n);
		else groups.set(key, [n]);
	}
	let best: LayoutNode[] | null = null;
	for (const group of groups.values()) {
		if (!best || group.length > best.length) best = group;
	}
	if (!best) return null;
	let anchor = best[0]!;
	let bestDist = Infinity;
	for (const n of best) {
		const dx = n.rect.x + n.rect.width / 2 - center.x;
		const dy = n.rect.y + n.rect.height / 2 - center.y;
		const d = dx * dx + dy * dy;
		if (d < bestDist) {
			bestDist = d;
			anchor = n;
		}
	}
	return anchor.source.id;
}

/** The laid-out nodes not in `settled`, or null when there are none. */
export function unsettledOf(layout: LayoutResult, settled: ReadonlySet<string>): Set<string> | null {
	const out = new Set<string>();
	for (const n of layout.nodes) {
		if (n.source.type !== "root" && !settled.has(n.source.id)) out.add(n.source.id);
	}
	return out.size > 0 ? out : null;
}

/**
 * The order to measure what is left: the laid-out nodes nearest `center`
 * first (layout coordinates), then the ones not laid out (inside folds).
 */
export function measureOrder(
	layout: LayoutResult,
	pending: ReadonlySet<string>,
	center: { x: number; y: number },
): string[] {
	const laidOut: { id: string; d: number }[] = [];
	const seen = new Set<string>();
	for (const n of layout.nodes) {
		const id = n.source.id;
		if (!pending.has(id)) continue;
		seen.add(id);
		const dx = n.rect.x + n.rect.width / 2 - center.x;
		const dy = n.rect.y + n.rect.height / 2 - center.y;
		laidOut.push({ id, d: dx * dx + dy * dy });
	}
	laidOut.sort((a, b) => a.d - b.d);
	const out = laidOut.map((e) => e.id);
	for (const id of pending) if (!seen.has(id)) out.push(id);
	return out;
}

/** Pending ids in `node`'s laid-out subtree, or null once there are more than `cap`. */
function pendingInSubtree(node: LayoutNode, pending: ReadonlySet<string>, cap: number): string[] | null {
	const out: string[] = [];
	const stack: LayoutNode[] = [node];
	while (stack.length > 0) {
		const n = stack.pop()!;
		if (pending.has(n.source.id)) {
			out.push(n.source.id);
			if (out.length > cap) return null;
		}
		for (const c of n.children) stack.push(c);
	}
	return out;
}

export interface FirstViewOptions {
	/** Lay the map out with these sizes (unlisted nodes get the layout's estimate). */
	layoutOf(sizes: NodeSizeMap): LayoutResult;
	/** Measured sizes so far; `measure` adds to it. */
	sizes: NodeSizeMap;
	/** Ids not measured yet; `measure` removes from it. */
	pending: Set<string>;
	/** Measure these ids: add them to `sizes`, remove them from `pending`. */
	measure(ids: string[]): Promise<void>;
	container: { w: number; h: number };
	padding: number;
	minZoom: number;
	maxZoom: number;
	/** The cull margin: nodes this close to the view are drawn too. */
	margin: number;
}

export interface FirstView {
	layout: LayoutResult;
	viewBox: ViewBox;
	zoom: number;
	/** The node the view holds still across later relayouts. */
	anchorId: string;
	/** Nodes that may be drawn now. */
	settled: Set<string>;
	/** Nodes measured to get here. */
	measured: number;
}

const FIRST_VIEW_ROUNDS = 3;
/**
 * A part-visible node's subtree is measured for the first view only when it
 * has at most this many unmeasured nodes per node in view (and at least
 * {@link SUBTREE_CAP_MIN}): a heading's section, yes; the note's H1, whose
 * subtree is the whole map, no — it waits for the rest.
 */
const SUBTREE_CAP_PER_VIEW_NODE = 2;
const SUBTREE_CAP_MIN = 64;

/**
 * Measure what the first fitted view needs and return it, or null when the
 * whole map fits in the container (every node is in view, so there is nothing
 * to put off) or no node in view could be settled.
 *
 * Round 1 measures the nodes in view and their ancestors (whose widths place
 * them). Later rounds re-fit (the estimated bounds moved) and measure the
 * whole subtree of each in-view node that is not settled yet, when it is small
 * enough (see {@link SUBTREE_CAP_PER_VIEW_NODE}): a heading centred on a subtree reaching out of view is not settled
 * until that subtree is measured.
 */
export async function planFirstView(o: FirstViewOptions): Promise<FirstView | null> {
	let measured = 0;
	for (let round = 0; ; round++) {
		const layout = o.layoutOf(o.sizes);
		const { bounds } = layout;
		const fit = fitViewBox(
			bounds.width + o.padding * 2, bounds.height + o.padding * 2,
			o.container.w, o.container.h, o.minZoom, o.maxZoom,
		);
		if (fit.zoom > o.minZoom) return null;
		const ox = -bounds.x1 + o.padding;
		const oy = -bounds.y1 + o.padding;
		const inView = layout.nodes.filter((n) => n.source.type !== "root"
			&& rectInView(n.rect.x + ox, n.rect.y + oy, n.rect.width, n.rect.height, fit.viewBox, o.margin));

		const need = new Set<string>();
		for (const n of inView) {
			for (let a: LayoutNode | null = n; a && a.source.type !== "root"; a = a.parent) {
				if (o.pending.has(a.source.id)) need.add(a.source.id);
			}
		}

		if (need.size === 0 || round >= FIRST_VIEW_ROUNDS) {
			const probes = [
				o.layoutOf(probeSizes(o.sizes, o.pending, PROBE_BIG)),
				o.layoutOf(probeSizes(o.sizes, o.pending, PROBE_SMALL)),
			];
			const center = { x: fit.viewBox.x + fit.viewBox.w / 2 - ox, y: fit.viewBox.y + fit.viewBox.h / 2 - oy };
			const anchorId = chooseAnchor(layout, probes, o.pending, inView, center);
			if (anchorId === null) return null;
			const settled = settledWith(layout, probes, o.pending, anchorId);
			if (round < FIRST_VIEW_ROUNDS) {
				const cap = Math.max(SUBTREE_CAP_MIN, inView.length * SUBTREE_CAP_PER_VIEW_NODE);
				for (const n of inView) {
					if (settled.has(n.source.id)) continue;
					const ids = pendingInSubtree(n, o.pending, cap);
					if (ids) for (const id of ids) need.add(id);
				}
			}
			if (need.size === 0 || round >= FIRST_VIEW_ROUNDS) {
				return { layout, viewBox: fit.viewBox, zoom: fit.zoom, anchorId, settled, measured };
			}
		}
		measured += need.size;
		await o.measure([...need]);
	}
}
