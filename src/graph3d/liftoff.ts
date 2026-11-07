/**
 * The mind map's 2D/3D toggle: what one view hands the other when a leaf
 * swaps between them. See `vault/Planner/3D Graph Phase 8 - 2D-3D toggle.md`.
 *
 * 2D → 3D, the "lift-off": every node the map drew starts at its place in the
 * map, laid flat at z = 0 and scaled so a line's box is a line plate's height,
 * and the camera stands square over the part of the map that was on screen.
 * The nodes start free, so the forces lift the flat map into its 3D shape.
 * 3D → 2D: the map opens on the focused line, at the zoom that draws a line as
 * tall as a line plate was on screen.
 *
 * Both hand-overs ride in view state (`leaf.setViewState`), so they are plain
 * data, and are read back with a check rather than trusted.
 *
 * Pure: no `obsidian` import, so it is unit-tested directly.
 */

import { DEFAULT_LAYOUT_CONFIG } from "../layout";
import { buildContainingFileMap } from "../mindmap-edit";
import type { OsmosisNode } from "../types";
import { isNoteRoot, noteNodeId, type GraphModel } from "./model";
import type { Placed } from "./positions";

/**
 * One node as the mind map drew it: the note its line is in (an embedded
 * note's, for a transcluded line), where the line starts there, and its box in
 * map units, y growing downward. `root` is the note itself, which the map
 * lays out as a point and does not draw.
 */
export interface MapBox {
	path: string;
	start: number;
	root: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A node named by where it is: a line by its note and start, or a note (`root`). */
export interface MapFocus {
	path: string;
	start: number;
	root: boolean;
}

/** What the mind map hands the 3D graph: its boxes, the part of the map on screen, and the selected node. */
export interface LiftOff {
	boxes: MapBox[];
	viewport: { x: number; y: number; w: number; h: number };
	focus: MapFocus | null;
}

/** What the 3D graph hands the mind map: the focused node, and how tall (px) a line plate was on screen there. */
export interface Landing {
	focus: MapFocus | null;
	platePx: number | null;
}

/**
 * How far either side of the plane a lifted node starts, as a share of a line
 * plate's height. Nodes exactly on one plane would stay on it (every force
 * between them lies in the plane), so they start a hair off it: too little to
 * see from straight on.
 */
const PLANE_JITTER = 1;
/** How far behind the map a note's core starts, in line plate heights: the map lays its root out as a point under the first line, which the core would cover. */
const CORE_BEHIND = 4;

/**
 * A line's height in the map: the median box height, since most lines are one
 * line of text. The root has no box and does not count.
 */
export function mapLineHeight(boxes: readonly { height: number; root?: boolean }[]): number {
	const heights = boxes.filter((box) => box.root !== true && box.height > 0).map((box) => box.height).sort((a, b) => a - b);
	if (heights.length === 0) return DEFAULT_LAYOUT_CONFIG.defaultNodeHeight;
	const mid = heights.length >> 1;
	return heights.length % 2 === 1 ? heights[mid]! : (heights[mid - 1]! + heights[mid]!) / 2;
}

/** World units per map unit: a line's box becomes a line plate's height. */
export function liftOffScale(boxes: readonly MapBox[], plateHeight: number): number {
	return plateHeight / mapLineHeight(boxes);
}

/** The 3D node a map box (or focus) stands for, by note and start; null when the model has none. The map's root stands for the note's root: its core, or its sole H1. */
function nodeIndex(model: GraphModel): (at: MapFocus) => string | null {
	const lines = new Map<string, string>();
	const notes = new Set<string>();
	for (const node of model.nodes) {
		if (node.path === undefined) continue;
		if (isNoteRoot(node)) notes.add(node.id);
		if (node.kind === "line" && node.source !== undefined) lines.set(`${node.path}\u0000${node.source.range.start}`, node.id);
	}
	return (at) => {
		if (!at.root) return lines.get(`${at.path}\u0000${at.start}`) ?? null;
		const id = noteNodeId(at.path);
		return notes.has(id) ? id : null;
	};
}

/**
 * Where each node of `model` that the map drew starts: the centre of its box,
 * relative to the centre of the map's viewport, scaled (`liftOffScale`) and
 * flipped so up stays up, at z = 0 give or take `PLANE_JITTER`. A note's core
 * starts behind its map; a sole H1 root starts at its own box, like any line. Every seed is free. Nodes the map didn't draw (a
 * collapsed branch, other notes) get none, and `placeNodes` seeds them beside
 * what they hang off as usual.
 */
export function liftOffSeeds(model: GraphModel, liftOff: LiftOff, plateHeight: number, random: () => number = Math.random): Map<string, Placed> {
	const scale = liftOffScale(liftOff.boxes, plateHeight);
	const { viewport } = liftOff;
	const cx = viewport.x + viewport.w / 2;
	const cy = viewport.y + viewport.h / 2;
	const find = nodeIndex(model);
	const lineRoots = new Set(model.nodes.filter((node) => node.root === true).map((node) => node.id));
	const seeds = new Map<string, Placed>();
	for (const box of liftOff.boxes) {
		const id = find(box);
		if (id === null || seeds.has(id) || (box.root && lineRoots.has(id))) continue;
		const z = box.root ? -CORE_BEHIND * plateHeight : (2 * random() - 1) * PLANE_JITTER * plateHeight;
		seeds.set(id, {
			x: (box.x + box.width / 2 - cx) * scale,
			y: -(box.y + box.height / 2 - cy) * scale,
			z,
			pinned: false,
		});
	}
	return seeds;
}

/** The node the map had selected, in `model`; null when nothing was, or it isn't there. */
export function liftOffFocus(model: GraphModel, liftOff: LiftOff): string | null {
	return liftOff.focus === null ? null : nodeIndex(model)(liftOff.focus);
}

/** The height, in world units, of the map's viewport once lifted: the camera frames that much at the origin. */
export function liftOffFrame(liftOff: LiftOff, plateHeight: number): number {
	return liftOff.viewport.h * liftOffScale(liftOff.boxes, plateHeight);
}

/** How far a camera with vertical field of view `fovDeg` stands from a plane facing it to see `height` of it, edge to edge. */
export function frameDistance(height: number, fovDeg: number): number {
	return height / 2 / Math.tan((fovDeg * Math.PI) / 360);
}

/**
 * The map's zoom on landing: the one that draws a line (`mapLineHeight`) as
 * tall as a line plate was on screen in 3D, within the map's limits.
 */
export function landingZoom(platePx: number, boxes: readonly { height: number; root?: boolean }[], min: number, max: number): number {
	return Math.min(max, Math.max(min, platePx / mapLineHeight(boxes)));
}

/**
 * The landing's focused line in the map's tree, with its ancestors: root
 * first, the line last. A line is matched by the note its range indexes
 * (`buildContainingFileMap`, so an embedded note's line is found inside the
 * host's map) and its start. Empty when the focus is a note, or not there.
 */
export function landingChain(root: OsmosisNode, hostPath: string, focus: MapFocus | null): OsmosisNode[] {
	if (focus === null || focus.root) return [];
	const fileOf = buildContainingFileMap(root, hostPath);
	const chain: OsmosisNode[] = [];
	const walk = (node: OsmosisNode): boolean => {
		chain.push(node);
		if (node.type !== "root" && node.range.start === focus.start && fileOf.get(node.id) === focus.path) return true;
		if (node.children.some(walk)) return true;
		chain.pop();
		return false;
	};
	return walk(root) ? chain : [];
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function readFocus(value: unknown): MapFocus | null {
	if (!isRecord(value) || typeof value.path !== "string" || !isNumber(value.start)) return null;
	return { path: value.path, start: value.start, root: value.root === true };
}

/** A `LiftOff` read back from view state; null when it is missing or malformed. Malformed boxes are dropped. */
export function readLiftOff(value: unknown): LiftOff | null {
	if (!isRecord(value) || !Array.isArray(value.boxes) || !isRecord(value.viewport)) return null;
	const { x, y, w, h } = value.viewport;
	if (!isNumber(x) || !isNumber(y) || !isNumber(w) || !isNumber(h) || h <= 0) return null;
	const boxes = (value.boxes as unknown[]).flatMap((box): MapBox[] => {
		const at = readFocus(box);
		if (at === null || !isRecord(box)) return [];
		const { x, y, width, height } = box;
		return isNumber(x) && isNumber(y) && isNumber(width) && isNumber(height) ? [{ ...at, x, y, width, height }] : [];
	});
	return { boxes, viewport: { x, y, w, h }, focus: readFocus(value.focus) };
}

/** A `Landing` read back from view state; null when it is missing. */
export function readLanding(value: unknown): Landing | null {
	if (!isRecord(value)) return null;
	return { focus: readFocus(value.focus), platePx: isNumber(value.platePx) && value.platePx > 0 ? value.platePx : null };
}
