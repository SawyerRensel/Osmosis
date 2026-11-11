/**
 * Edge hints: when the camera is close to a node, each link or embed edge
 * leaving it shows a small label just off this end, naming the node at the
 * other end. In an organic layout that says where an edge goes without
 * flying along it. Pure: the scene supplies probes and draws a pool of
 * labels (`Graph3DHints`). See `vault/Planner/3D Graph - Edge hints.md`.
 */

import type { GraphEdgeKind, GraphNode } from "./model";

/** At most this many hints show at once. */
export const HINT_MAX = 8;

/** A hint is fully shown within this view depth of its node (world units; a line node's flight stand-off is 70). */
export const HINT_NEAR_DEPTH = 120;

/** ...and gone beyond this one, fading in linearly between. */
export const HINT_FAR_DEPTH = 300;

/** A candidate must be this far inside the screen (NDC, ±1 is the edge) to enter, and may drift this far out and stay. */
export const HINT_ENTER_SCREEN = 1;
export const HINT_EXIT_SCREEN = 1.15;

/** A member of the current set ranks this much nearer than it is, so two ends at similar depths don't trade places every frame. */
export const HINT_KEEP_BONUS = 0.25;

/** Longest label text, in characters, before the ellipsis. */
export const HINT_MAX_CHARS = 40;

/** Only link and embed edges are hinted; hierarchy, tag, property and attachment edges are not. */
export function hintedKind(kind: GraphEdgeKind): boolean {
	return kind === "link" || kind === "embed";
}

/** How much of a hint shows at view `depth`: 0 at or beyond `far`, 1 at or within `near`, linear between. */
export function hintFade(depth: number, near = HINT_NEAR_DEPTH, far = HINT_FAR_DEPTH): number {
	if (!(depth < far)) return 0;
	if (depth <= near) return 1;
	return (far - depth) / (far - near);
}

/** One edge end that could carry a hint. `id` is stable per edge end; x and y are the node's NDC. */
export interface HintProbe {
	id: string;
	depth: number;
	x: number;
	y: number;
}

/**
 * This frame's hints, nearest first. A member of `current` stays while it is
 * visible and within `HINT_EXIT_SCREEN`; others need `HINT_ENTER_SCREEN`. If
 * more than `max` qualify, the nearest win, members with `HINT_KEEP_BONUS`.
 */
export function chooseHints(probes: Iterable<HintProbe>, current: ReadonlySet<string>, max = HINT_MAX): string[] {
	const ranked: { id: string; rank: number }[] = [];
	for (const p of probes) {
		if (!(hintFade(p.depth) > 0)) continue;
		const member = current.has(p.id);
		if (Math.max(Math.abs(p.x), Math.abs(p.y)) > (member ? HINT_EXIT_SCREEN : HINT_ENTER_SCREEN)) continue;
		ranked.push({ id: p.id, rank: member ? p.depth * (1 - HINT_KEEP_BONUS) : p.depth });
	}
	ranked.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return ranked.slice(0, Math.max(0, max)).map((r) => r.id);
}

/** A node's text as a one-line label: its first line without Markdown markers, links shown as their text. */
export function plainLabel(text: string): string {
	const line = text.split("\n").find((l) => l.trim() !== "") ?? "";
	const plain = line
		.replace(/^\s*(?:>\s*)*(?:#{1,6}\s+|[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+)?/, "")
		.replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
		.replace(/!?\[\[([^\]]*)\]\]/g, "$1")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/(\*\*|__|~~|==|%%|`)/g, "")
		.replace(/\s\^[\w-]+$/, "")
		.replace(/\s+/g, " ")
		.trim();
	return plain;
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** A vault path's note name: the file name without folders or extension. */
export function noteName(path: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	const dot = file.lastIndexOf(".");
	return dot > 0 ? file.slice(0, dot) : file;
}

/**
 * What a hint at `from`'s end of an edge says: the node at the other end,
 * `to`. In another note it is "Note > Heading" (just "Note" for that note's
 * root), in the same note the node's own text.
 */
export function hintText(from: Pick<GraphNode, "path">, to: Pick<GraphNode, "kind" | "label" | "path" | "root">): string {
	const own = plainLabel(to.label);
	if (to.kind === "ghost" || to.path === undefined || to.path === from.path) return truncate(own, HINT_MAX_CHARS);
	const note = noteName(to.path);
	if (to.kind === "note" || to.root === true || to.kind === "attachment" || own === "") return truncate(note, HINT_MAX_CHARS);
	return truncate(`${note} > ${own}`, HINT_MAX_CHARS);
}

/**
 * How far from a node's centre, along unit direction `d` (world), the node's
 * rectangle ends as the camera sees it: `half` is the rectangle's half
 * width and height in world units and `right`/`up` the camera's axes. 0 for
 * an edge pointing straight along the view.
 */
export function exitDistance(d: { x: number; y: number; z: number }, half: { width: number; height: number }, right: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }): number {
	const dx = Math.abs(d.x * right.x + d.y * right.y + d.z * right.z);
	const dy = Math.abs(d.x * up.x + d.y * up.y + d.z * up.z);
	const tx = dx < 1e-6 ? Infinity : half.width / dx;
	const ty = dy < 1e-6 ? Infinity : half.height / dy;
	const t = Math.min(tx, ty);
	return Number.isFinite(t) ? t : 0;
}

/**
 * CSS percentages that put a label's box against the anchor on the side away
 * from the node: `x`/`y` is the edge's screen direction (y up). A label to
 * the right has its left edge at the anchor (0%, -50%).
 */
export function labelShift(x: number, y: number): { x: number; y: number } {
	const len = Math.hypot(x, y);
	if (len < 1e-6) return { x: -50, y: -50 };
	return { x: -50 + (50 * x) / len, y: -50 - (50 * y) / len };
}
