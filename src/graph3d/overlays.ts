/**
 * The 3D graph's Overlays menu, as data: what it can set, how saved settings
 * are read back, and the pure rules each option applies (node colour, which
 * edges draw, how the force balance scales a link). See the "Overlays menu"
 * section of `vault/Planner/Develop Mind-Map Graph View.md` and
 * `vault/Planner/3D Graph Phase 5 - Overlays menu.md`.
 */

import { noteHue, nodeColor } from "./appearance";
import type { GraphEdgeKind, GraphModel, GraphNode } from "./model";

export type ColorMode = "note" | "memory" | "tag" | "type";

/** Edge kinds as the menu lists them: the model's kinds, plus edges to unresolved links (ghost nodes). */
export type OverlayEdgeKind = GraphEdgeKind | "unresolved";

export const OVERLAY_EDGE_KINDS: readonly OverlayEdgeKind[] = ["hierarchy", "link", "embed", "property", "tag", "attachment", "unresolved"];

/** What carries text: plates and the near tier's live panels, plates only, or neither (blank plates). */
export type LabelMode = "all" | "plates" | "none";

export interface Graph3DOverlays {
	colorBy: ColorMode;
	edges: Record<OverlayEdgeKind, boolean>;
	/** 0 is all hierarchy, 1 all organic; at 0.5 every link pulls as d3 would by default. */
	forceBalance: number;
	/** Mist density multiplier, `MIST_LIMIT`⁻¹ to `MIST_LIMIT`. */
	mist: number;
	/** A particle runs along each drawn edge, source to target. */
	particles: boolean;
	labels: LabelMode;
}

export const MIST_LIMIT = 4;

export const DEFAULT_OVERLAYS: Graph3DOverlays = {
	colorBy: "note",
	// Attachments are off: an attachment is already part of the note that embeds it.
	edges: { hierarchy: true, link: true, embed: true, property: true, tag: true, attachment: false, unresolved: true },
	forceBalance: 0.5,
	mist: 1,
	particles: false,
	labels: "all",
};

const COLOR_MODES: readonly ColorMode[] = ["note", "memory", "tag", "type"];
const LABEL_MODES: readonly LabelMode[] = ["all", "plates", "none"];

/**
 * Overlay settings as saved in plugin data, checked field by field: anything
 * missing or malformed (an older or hand-edited data.json) takes its default,
 * and anything no longer offered (Bloom) is dropped.
 */
export function normalizeOverlays(raw: unknown): Graph3DOverlays {
	const value = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
	const rawEdges = (typeof value.edges === "object" && value.edges !== null ? value.edges : {}) as Record<string, unknown>;
	const edges = { ...DEFAULT_OVERLAYS.edges };
	for (const kind of OVERLAY_EDGE_KINDS) {
		const shown = rawEdges[kind];
		if (typeof shown === "boolean") edges[kind] = shown;
	}
	const number = (n: unknown, fallback: number, min: number, max: number): number =>
		typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
	return {
		colorBy: COLOR_MODES.includes(value.colorBy as ColorMode) ? (value.colorBy as ColorMode) : DEFAULT_OVERLAYS.colorBy,
		edges,
		forceBalance: number(value.forceBalance, DEFAULT_OVERLAYS.forceBalance, 0, 1),
		mist: number(value.mist, DEFAULT_OVERLAYS.mist, 1 / MIST_LIMIT, MIST_LIMIT),
		particles: typeof value.particles === "boolean" ? value.particles : DEFAULT_OVERLAYS.particles,
		labels: LABEL_MODES.includes(value.labels as LabelMode) ? (value.labels as LabelMode) : DEFAULT_OVERLAYS.labels,
	};
}

/** Whether an edge is drawn: its kind is shown, and, when it reaches an unresolved link, so are those. */
export function edgeShown(kind: GraphEdgeKind, toGhost: boolean, edges: Readonly<Record<OverlayEdgeKind, boolean>>): boolean {
	return edges[kind] && (!toGhost || edges.unresolved);
}

/**
 * The model as the Overlays menu shows it. With Attachments off, an attachment
 * node that only attachment edges reach is left out with them, since the
 * attachment is the node (unresolved links are different: their edges hide,
 * the ghost nodes stay). An attachment a property also links to stays, with
 * that edge.
 */
export function visibleModel(model: GraphModel, edges: Readonly<Record<OverlayEdgeKind, boolean>>): GraphModel {
	if (edges.attachment) return model;
	const kept = new Set<string>();
	for (const edge of model.edges) {
		if (edge.kind !== "attachment") kept.add(edge.source).add(edge.target);
	}
	const hidden = new Set(model.nodes.filter((node) => node.kind === "attachment" && !kept.has(node.id)).map((node) => node.id));
	if (hidden.size === 0) return model;
	return {
		nodes: model.nodes.filter((node) => !hidden.has(node.id)),
		edges: model.edges.filter((edge) => !hidden.has(edge.source) && !hidden.has(edge.target)),
	};
}

/** The weakest a link gets at either end of the force slider: loose, but still holding its ends together. */
const MIN_STRENGTH_SCALE = 0.1;

/**
 * How much the force balance scales a link's pull, against d3's default.
 * Toward hierarchy (below 0.5), cross-note links loosen and each note holds
 * its own mind-map shape; toward organic, hierarchy loosens and links shape
 * the web. Neither side ever strengthens past d3's default, which can already
 * be 1 for a leaf and overshoots above it.
 */
export function linkStrengthScale(kind: GraphEdgeKind, balance: number): number {
	const weight = kind === "hierarchy" ? 2 * (1 - balance) : 2 * balance;
	return Math.max(MIN_STRENGTH_SCALE, Math.min(1, weight));
}

/** Mist slider position (log₂ of the multiplier, so ×½ and ×2 sit evenly either side of ×1) to multiplier, and back. */
export const mistFromSlider = (position: number): number => 2 ** position;
export const sliderFromMist = (mist: number): number => Math.log2(mist);

/**
 * What the colour modes need from outside the model: each node's tag (see
 * `nodeTags`) and memory strength (see `memoryStrengths`).
 */
export interface ColorContext {
	tags: ReadonlyMap<string, string>;
	/** 0–1 retrievability; `null` for a card never reviewed; absent for a node with no card. */
	strengths: ReadonlyMap<string, number | null>;
}

const NO_VALUE = "hsl(0, 0%, 42%)";
const NEW_CARD = "hsl(210, 70%, 62%)";

/** A node's colour in the active colour mode. */
export function overlayNodeColor(node: GraphNode, mode: ColorMode, context: ColorContext): string {
	switch (mode) {
		case "note":
			return nodeColor(node);
		case "memory":
			return memoryColor(context.strengths.get(node.id));
		case "tag": {
			const tag = context.tags.get(node.id);
			return tag === undefined ? NO_VALUE : `hsl(${noteHue(`#${tag}`)}, 70%, 62%)`;
		}
		case "type":
			return typeColor(node);
	}
}

/**
 * Retrievability as a colour: red at 50% or below, through amber, to green
 * at 100%. The ramp starts at 50% because a reviewed card rarely sits much
 * lower, and a 0–100% ramp would paint almost everything green.
 */
export function memoryColor(strength: number | null | undefined): string {
	if (strength === undefined) return NO_VALUE;
	if (strength === null) return NEW_CARD;
	const t = Math.min(1, Math.max(0, (strength - 0.5) / 0.5));
	return `hsl(${Math.round(120 * t)}, 70%, 55%)`;
}

const TYPE_HUES: Record<string, number> = {
	heading: 0,
	bullet: 210,
	ordered: 180,
	paragraph: 30,
	codeblock: 120,
	table: 270,
	blockquote: 300,
	transclusion: 330,
};

/** By node type: a note's core, a tag, an attachment and a ghost keep their own colours; lines are coloured by parse type. */
export function typeColor(node: GraphNode): string {
	if (node.kind !== "line") return node.kind === "note" ? "hsl(0, 0%, 85%)" : nodeColor(node);
	const hue = TYPE_HUES[node.source?.type ?? ""];
	return hue === undefined ? NO_VALUE : `hsl(${hue}, 60%, 60%)`;
}

/**
 * Each node's tag, for colouring by tag: the first tag the node carries, else
 * the nearest ancestor's down the hierarchy, so a tagged heading or list item
 * colours its whole branch, and a note's frontmatter tag colours every line
 * that has none closer. A tag hub is its own tag.
 */
export function nodeTags(model: GraphModel): Map<string, string> {
	const own = new Map<string, string>();
	const parent = new Map<string, string>();
	for (const edge of model.edges) {
		if (edge.kind === "tag" && !own.has(edge.source)) own.set(edge.source, edge.target.replace(/^tag:/, ""));
		else if (edge.kind === "hierarchy") parent.set(edge.target, edge.source);
	}
	const tags = new Map<string, string>();
	for (const node of model.nodes) {
		if (node.kind === "tag") {
			tags.set(node.id, node.id.replace(/^tag:/, ""));
			continue;
		}
		// Walk up to the first tagged ancestor; the hierarchy is a tree, so this ends at the note's core.
		let id: string | undefined = node.id;
		while (id !== undefined && !own.has(id)) id = parent.get(id);
		const tag = id === undefined ? undefined : own.get(id);
		if (tag !== undefined) tags.set(node.id, tag);
	}
	return tags;
}

/**
 * Memory strength per node: a line's is the weakest retrievability among its
 * cards (an occluded line has one per shape group), `null` when it has cards
 * but none reviewed. A note's core shows the mean of its reviewed lines.
 * `cardsOf` returns the retrievability of each card on the line with that
 * block ID (`null` for one never reviewed).
 */
export function memoryStrengths(model: GraphModel, cardsOf: (path: string, blockId: string) => readonly (number | null)[]): Map<string, number | null> {
	const strengths = new Map<string, number | null>();
	const notes = new Map<string, { sum: number; count: number }>();
	for (const node of model.nodes) {
		const blockId = node.source?.blockId;
		if (node.kind !== "line" || node.path === undefined || blockId === undefined) continue;
		const cards = cardsOf(node.path, blockId);
		if (cards.length === 0) continue;
		const reviewed = cards.filter((r): r is number => r !== null);
		const strength = reviewed.length === 0 ? null : Math.min(...reviewed);
		strengths.set(node.id, strength);
		if (strength === null) continue;
		const note = notes.get(node.path) ?? { sum: 0, count: 0 };
		note.sum += strength;
		note.count++;
		notes.set(node.path, note);
	}
	for (const node of model.nodes) {
		const note = node.kind === "note" && node.path !== undefined ? notes.get(node.path) : undefined;
		if (note !== undefined) strengths.set(node.id, note.sum / note.count);
	}
	return strengths;
}
