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
 * Hints scale with the world: a hint's text is this fraction of a line plate's
 * text (both in world units), so it shrinks as the camera backs off and can
 * never outweigh the node it sits by.
 */
export const HINT_EM_RATIO = 0.6;

/** The label's CSS font size; it is scaled to its world size by transform (`HINT_BASE_PX` in styles.css). */
export const HINT_BASE_PX = 12;

/** On-screen text size (px) below which a hint is gone, and above which it is fully shown; linear between, so it never pops. */
export const HINT_MIN_PX = 6;
export const HINT_FULL_PX = 8;

/** How much of a hint shows at an on-screen text size of `px`: 0 at or below `HINT_MIN_PX`, 1 from `HINT_FULL_PX`. */
export function hintSizeFade(px: number): number {
	if (!(px > HINT_MIN_PX)) return 0;
	if (px >= HINT_FULL_PX) return 1;
	return (px - HINT_MIN_PX) / (HINT_FULL_PX - HINT_MIN_PX);
}

/**
 * The angle (radians, counter-clockwise, y up) to turn a label so its text
 * runs along screen direction `x`/`y` and stays readable: never past ±90°.
 * `flipped` means the text reads toward the direction's start, not away
 * from it. A vertical edge reads bottom to top either way.
 */
export function readableAngle(x: number, y: number): { angle: number; flipped: boolean } {
	if (Math.hypot(x, y) < 1e-9) return { angle: 0, flipped: false };
	const a = Math.atan2(y, x);
	if (a > Math.PI / 2) return { angle: a - Math.PI, flipped: true };
	if (a <= -Math.PI / 2) return { angle: a + Math.PI, flipped: true };
	return { angle: a, flipped: false };
}

/** A label's box at `HINT_BASE_PX`, estimated from its text (no DOM measuring): length along the edge and height across it, in px. */
export function hintBox(text: string): { length: number; height: number } {
	// ~0.55 em a character, 6 px padding each side plus the border; line height 1.3 plus padding and border.
	return { length: Math.ceil(text.length * 0.55 * HINT_BASE_PX) + 14, height: Math.ceil(1.3 * HINT_BASE_PX) + 4 };
}

/** A placed hint for `stackHints`, in screen px: `angle` is its edge's true screen direction (not the readable one), `start` its distance from the node's centre, `length`/`height` its box. */
export interface HintSpan {
	id: string;
	group: string;
	angle: number;
	start: number;
	length: number;
	height: number;
}

/** A hint pushed out this many times along its edge and still in the way is dropped. */
export const HINT_MAX_PUSHES = 2;

/** Screen gap (px) kept between two hints stacked along nearly the same direction. */
export const HINT_STACK_GAP_PX = 4;

/**
 * Keep hints at one node (same `group`) off each other. Hints are taken in
 * the given order (the scene passes nearest first, the current set ahead of
 * newcomers, so a hint already shown is not moved by one arriving): one
 * whose box would cover an earlier one's (edges less than 90° apart, their
 * spans along the edge overlapping where the two are closer across than a
 * box height) is pushed out along its edge past the other's end. After
 * `HINT_MAX_PUSHES` pushes it is dropped instead. Returns each kept hint's
 * extra distance along its edge (px); dropped hints are absent.
 */
export function stackHints(spans: readonly HintSpan[], gap = HINT_STACK_GAP_PX): Map<string, number> {
	const out = new Map<string, number>();
	const placed = new Map<string, { angle: number; from: number; to: number; height: number }[]>();
	for (const span of spans) {
		const others = placed.get(span.group) ?? [];
		let from = span.start;
		let pushes = 0;
		let moved = true;
		while (moved && pushes <= HINT_MAX_PUSHES) {
			moved = false;
			for (const other of others) {
				let turn = Math.abs(span.angle - other.angle) % (2 * Math.PI);
				if (turn > Math.PI) turn = 2 * Math.PI - turn;
				if (turn >= Math.PI / 2) continue;
				const near = Math.max(from, other.from);
				const far = Math.min(from + span.length, other.to);
				if (near >= far + gap) continue;
				if (near * Math.sin(turn) >= (span.height + other.height) / 2 + gap) continue;
				from = other.to + gap;
				pushes++;
				moved = true;
				break;
			}
		}
		if (moved) continue;
		others.push({ angle: span.angle, from, to: from + span.length, height: span.height });
		placed.set(span.group, others);
		out.set(span.id, from - span.start);
	}
	return out;
}
