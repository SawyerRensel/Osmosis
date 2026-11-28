/**
 * Cosmos's Overlays menu, as data: what it can set, how saved settings
 * are read back, and the pure rules each option applies (node colour, which
 * edges draw, how the force balance scales a link). See the "Overlays menu"
 * section of `vault/Planner/Develop Mind-Map Graph View.md` and
 * `vault/Planner/3D Graph Phase 5 - Overlays menu.md`.
 */

import { noteHue, nodeColor, type Spacing } from "./appearance";
import { isNoteRoot, type GraphEdgeKind, type GraphModel, type GraphNode, type GraphNodeKind } from "./model";
import { MAX_CORE_LAYERS, type ContinentBalance, type ContinentDirection } from "./planets";
import { TAPER_STRENGTH_MAX, TAPER_STRENGTH_MIN } from "./taper";

/**
 * What colours the nodes. `style` (*Mind map style*) draws each note's mind map
 * theme through the style cascade (`noteStyleReader`); outlines and edges with
 * no colour of their own take the note's hue, as `note` does.
 */
export type ColorMode = "style" | "note" | "memory" | "tag" | "type";

/** Edge kinds as the menu lists them: the model's kinds, plus edges to unresolved links (ghost nodes). */
export type OverlayEdgeKind = GraphEdgeKind | "unresolved";

export const OVERLAY_EDGE_KINDS: readonly OverlayEdgeKind[] = ["hierarchy", "link", "embed", "property", "tag", "attachment", "unresolved"];

/** What carries text: plates and the near tier's live panels, plates only, or neither (blank plates). */
export type LabelMode = "all" | "plates" | "none";

/** How notes are laid out: organic 3D, or planets (`planets.ts`). */
export type LayoutMode = "organic" | "planets";

export interface CosmosOverlays {
	colorBy: ColorMode;
	edges: Record<OverlayEdgeKind, boolean>;
	/** 0 is all hierarchy, 1 all organic; at 0.5 every link pulls as d3 would by default. */
	forceBalance: number;
	/** Whether links between plates (kind `link`, ghost targets included) pull. Off, they still draw if their edge kind is shown, but exert no force. */
	linksPull: boolean;
	/** The Note spacing slider: a multiple of today's distance between notes and tags, `SPACING_MIN` to `SPACING_MAX` (see `Spacing`). */
	noteSpacing: number;
	/** The Node spacing slider: a multiple of today's distance between nodes within a note, `SPACING_MIN` to `SPACING_MAX`. */
	nodeSpacing: number;
	/** Planets only: the Continent spacing slider, a multiple of today's clear space round each continent (`CONTINENT_MARGIN`), `SPACING_MIN` to `SPACING_MAX`. */
	continentSpacing: number;
	/** The Layout choice. */
	layout: LayoutMode;
	/** Planets only: the Direction of every continent's 2D map. A note's own 2D map settings don't apply on a planet. */
	continentDirection: ContinentDirection;
	/** Planets only: the Balance of every continent's 2D map (unused by radial). A note's own 2D map settings don't apply on a planet. */
	continentBalance: ContinentBalance;
	/** Planets only: the Core layers slider, how many concentric shells (1 to `MAX_CORE_LAYERS`) a planet's plates lie on by outline depth (`shellRadius`). 1 is the single surface. */
	coreLayers: number;
	/** Mist density multiplier, `MIST_LIMIT`⁻¹ to `MIST_LIMIT`. */
	mist: number;
	/** A particle runs along each drawn edge, source to target. */
	particles: boolean;
	/** Hierarchy edges draw as ribbons tapering by outline depth (`taper.ts`); off, every edge is a thin line. */
	taper: boolean;
	/** The Taper strength slider, `TAPER_STRENGTH_MIN` to `TAPER_STRENGTH_MAX` (`depthWidth`). */
	taperStrength: number;
	labels: LabelMode;
	/** How fast every camera flight goes (travel speed): `1 / TRAVEL_LIMIT` to `TRAVEL_LIMIT`, 1 being the default pace. */
	travelSpeed: number;
}

export const SPACING_MIN = 0.5;
export const SPACING_MAX = 3;
export const MIST_LIMIT = 4;
export const TRAVEL_LIMIT = 4;

export const DEFAULT_OVERLAYS: CosmosOverlays = {
	colorBy: "style",
	// Attachments are off: an attachment is already part of the note that embeds it.
	edges: { hierarchy: true, link: true, embed: true, property: true, tag: true, attachment: false, unresolved: true },
	forceBalance: 0.5,
	linksPull: true,
	noteSpacing: 1,
	nodeSpacing: 1,
	continentSpacing: 1,
	layout: "organic",
	continentDirection: "left-right",
	continentBalance: "one-side",
	coreLayers: 1,
	mist: 1,
	particles: false,
	taper: true,
	taperStrength: 1,
	labels: "all",
	travelSpeed: 1,
};

const COLOR_MODES: readonly ColorMode[] = ["style", "note", "memory", "tag", "type"];
const LABEL_MODES: readonly LabelMode[] = ["all", "plates", "none"];
const LAYOUT_MODES: readonly LayoutMode[] = ["organic", "planets"];
export const CONTINENT_DIRECTIONS: readonly ContinentDirection[] = ["left-right", "top-down", "radial"];
export const CONTINENT_BALANCES: readonly ContinentBalance[] = ["one-side", "both-sides", "alternating"];

/**
 * Overlay settings as saved in plugin data, checked field by field: anything
 * missing or malformed (an older or hand-edited data.json) takes its default,
 * and anything no longer offered (Bloom) is dropped.
 */
export function normalizeOverlays(raw: unknown): CosmosOverlays {
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
		linksPull: typeof value.linksPull === "boolean" ? value.linksPull : DEFAULT_OVERLAYS.linksPull,
		noteSpacing: number(value.noteSpacing, DEFAULT_OVERLAYS.noteSpacing, SPACING_MIN, SPACING_MAX),
		nodeSpacing: number(value.nodeSpacing, DEFAULT_OVERLAYS.nodeSpacing, SPACING_MIN, SPACING_MAX),
		continentSpacing: number(value.continentSpacing, DEFAULT_OVERLAYS.continentSpacing, SPACING_MIN, SPACING_MAX),
		// A saved "flat" (the Flat slices layout, removed in T137) reads as the default, Organic, and its flatten slider is dropped.
		layout: LAYOUT_MODES.includes(value.layout as LayoutMode) ? (value.layout as LayoutMode) : DEFAULT_OVERLAYS.layout,
		continentDirection: CONTINENT_DIRECTIONS.includes(value.continentDirection as ContinentDirection) ? (value.continentDirection as ContinentDirection) : DEFAULT_OVERLAYS.continentDirection,
		continentBalance: CONTINENT_BALANCES.includes(value.continentBalance as ContinentBalance) ? (value.continentBalance as ContinentBalance) : DEFAULT_OVERLAYS.continentBalance,
		coreLayers: Math.round(number(value.coreLayers, DEFAULT_OVERLAYS.coreLayers, 1, MAX_CORE_LAYERS)),
		mist: number(value.mist, DEFAULT_OVERLAYS.mist, 1 / MIST_LIMIT, MIST_LIMIT),
		particles: typeof value.particles === "boolean" ? value.particles : DEFAULT_OVERLAYS.particles,
		taper: typeof value.taper === "boolean" ? value.taper : DEFAULT_OVERLAYS.taper,
		taperStrength: number(value.taperStrength, DEFAULT_OVERLAYS.taperStrength, TAPER_STRENGTH_MIN, TAPER_STRENGTH_MAX),
		labels: LABEL_MODES.includes(value.labels as LabelMode) ? (value.labels as LabelMode) : DEFAULT_OVERLAYS.labels,
		travelSpeed: number(value.travelSpeed, DEFAULT_OVERLAYS.travelSpeed, 1 / TRAVEL_LIMIT, TRAVEL_LIMIT),
	};
}

/** The spacing sliders as the layout reads them (`Spacing`). */
export const spacingOf = (overlays: Pick<CosmosOverlays, "noteSpacing" | "nodeSpacing">): Spacing => ({ note: overlays.noteSpacing, node: overlays.nodeSpacing });

type SpacingSliders = Pick<CosmosOverlays, "noteSpacing" | "nodeSpacing" | "continentSpacing">;

/** Whether a spacing slider moved from `before` to `after` (Continent spacing only counts in Planets, the one layout it shapes), so the loaded nodes must re-settle (or, in Planets, be laid out afresh). */
export function spacingChanged(before: SpacingSliders, after: SpacingSliders & Pick<CosmosOverlays, "layout">): boolean {
	return before.noteSpacing !== after.noteSpacing || before.nodeSpacing !== after.nodeSpacing || (after.layout === "planets" && before.continentSpacing !== after.continentSpacing);
}

/** Whether the Overlays change from `before` to `after` changes how Planets mode lays continents out, so every planet must be laid out afresh. */
export function continentStyleChanged(before: Pick<CosmosOverlays, "layout" | "continentDirection" | "continentBalance">, after: Pick<CosmosOverlays, "layout" | "continentDirection" | "continentBalance">): boolean {
	return after.layout === "planets" && (before.continentDirection !== after.continentDirection || before.continentBalance !== after.continentBalance);
}

/** Whether the Core layers slider moved in Planets (the one layout it shapes), so the planets move their plates to the new shells. */
export function coreLayersChanged(before: Pick<CosmosOverlays, "coreLayers">, after: Pick<CosmosOverlays, "layout" | "coreLayers">): boolean {
	return after.layout === "planets" && before.coreLayers !== after.coreLayers;
}

/** Whether an edge is drawn: its kind is shown, and, when it reaches an unresolved link, so are those. */
export function edgeShown(kind: GraphEdgeKind, toGhost: boolean, edges: Readonly<Record<OverlayEdgeKind, boolean>>): boolean {
	return edges[kind] && (!toGhost || edges.unresolved);
}

/**
 * Whether an edge pulls. A hidden kind no longer pulls (the Hierarchy toggle
 * is the exception: it only hides the drawing, since a note's shape is its
 * hierarchy), and neither do links when "Links pull" is off, ghost targets
 * included.
 */
export function linkPulls(kind: GraphEdgeKind, toGhost: boolean, overlays: Pick<CosmosOverlays, "edges" | "linksPull">): boolean {
	if (kind === "hierarchy") return true;
	return edgeShown(kind, toGhost, overlays.edges) && (kind !== "link" || overlays.linksPull);
}

/** Whether the Overlays change from `before` to `after` changes which edges pull, so the loaded nodes must re-settle. */
export function pullChanged(before: Pick<CosmosOverlays, "edges" | "linksPull">, after: Pick<CosmosOverlays, "edges" | "linksPull">): boolean {
	if (before.linksPull !== after.linksPull) return true;
	return OVERLAY_EDGE_KINDS.some((kind) => kind !== "hierarchy" && before.edges[kind] !== after.edges[kind]);
}

/** The edge toggle that owns a node kind's plates: with it off, plates of that kind that no other shown edge reaches are left out. */
const OWNING_TOGGLE: Partial<Record<GraphNodeKind, OverlayEdgeKind>> = { attachment: "attachment", tag: "tag", ghost: "unresolved" };

/** Whether the toggles leave out plates of this kind (when no other shown edge reaches them). */
export function kindOwnedOff(kind: GraphNodeKind, edges: Readonly<Record<OverlayEdgeKind, boolean>>): boolean {
	const owner = OWNING_TOGGLE[kind];
	return owner !== undefined && !edges[owner];
}

/** Which of the toggles that add or remove plates are on: when it changes, the model must be rebuilt (see `visibleModel`). */
export function modelKey(edges: Readonly<Record<OverlayEdgeKind, boolean>>): string {
	return [edges.attachment, edges.tag, edges.unresolved].join();
}

/**
 * The model as the Overlays menu shows it. A toggle that owns plates takes
 * them away with its edges: Attachments the attachment nodes, Tags the tag
 * hubs, Unresolved links the ghosts, since each of those is the node itself.
 * A node that another shown edge kind still reaches stays (an attachment a
 * property also links to stays, with that edge).
 */
export function visibleModel(model: GraphModel, edges: Readonly<Record<OverlayEdgeKind, boolean>>): GraphModel {
	const candidates = model.nodes.filter((node) => kindOwnedOff(node.kind, edges));
	if (candidates.length === 0) return model;
	const ghosts = new Set(model.nodes.filter((node) => node.kind === "ghost").map((node) => node.id));
	const reached = new Set<string>();
	for (const edge of model.edges) {
		if (edgeShown(edge.kind, ghosts.has(edge.source) || ghosts.has(edge.target), edges)) reached.add(edge.source).add(edge.target);
	}
	const hidden = new Set(candidates.filter((node) => !reached.has(node.id)).map((node) => node.id));
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

/** Travel speed slider position (log₂, so ×½ and ×2 sit evenly either side of ×1) to speed, and back. */
export const travelFromSlider = (position: number): number => 2 ** position;
export const sliderFromTravel = (speed: number): number => Math.log2(speed);

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

/**
 * The one note a scene shows (its note and line plates all belong to it), or
 * null for a scene of several notes or none. Tag, attachment and unresolved
 * plates don't count: they hang off the note rather than being another one.
 */
export function soleNotePath(nodes: readonly GraphNode[]): string | null {
	let sole: string | null = null;
	for (const node of nodes) {
		if ((node.kind !== "note" && node.kind !== "line") || node.path === undefined) continue;
		if (sole !== null && node.path !== sole) return null;
		sole = node.path;
	}
	return sole;
}

/** A node's colour in the active colour mode. */
export function overlayNodeColor(node: GraphNode, mode: ColorMode, context: ColorContext): string {
	switch (mode) {
		case "style":
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
 * but none reviewed. A note's root shows the mean of its reviewed lines: its
 * core, or its sole H1 when that line has no card of its own.
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
		const summary = node.kind === "note" || (isNoteRoot(node) && !strengths.has(node.id));
		const note = summary && node.path !== undefined ? notes.get(node.path) : undefined;
		if (note !== undefined) strengths.set(node.id, note.sum / note.count);
	}
	return strengths;
}
