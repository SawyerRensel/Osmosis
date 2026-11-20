/**
 * Tapered hierarchy edges: how thick each end of a parent → child edge is
 * drawn, from the parent's outline depth (thick at a note's root, delicate
 * stems at its leaves), unless the child's branch style (`osmosis-styles`
 * `branchLine`, as the mind map reads it) says otherwise. Widths are full
 * widths in world units (a line plate is 5 tall). See
 * `vault/Planner/3D Graph - Tapered hierarchy edges.md`.
 *
 * The ribbon itself is drawn by `CosmosRibbons`: each segment a quad whose
 * sides turn to face the camera in the vertex shader (`RIBBON_VERTEX_GLSL`),
 * so orbiting never rewrites the edges. `ribbonCorners` is the same sum on the
 * CPU, for the tests.
 *
 * Pure logic, no `obsidian` import, so it is unit-tested.
 */

import type { BranchLinePattern, BranchStyle } from "../styles";
import type { Vec3 } from "./flight";

/** Full width, world units, at the parent end of an edge from a note's root (outline depth 0). */
export const TAPER_ROOT_WIDTH = 1.6;
/** Each level deeper multiplies the width by this. */
export const TAPER_FALLOFF = 0.6;
/** The thinnest a depth-tapered edge gets, world units; the shader also keeps every ribbon at least a pixel wide. */
export const TAPER_MIN_WIDTH = 0.2;
/** The Taper strength slider's range: a multiple of how much wider than the thinnest stem a depth's width is. */
export const TAPER_STRENGTH_MIN = 0.25;
export const TAPER_STRENGTH_MAX = 2;
/** The thin end of a branch style's fade or grow taper, in mind-map px (as the 2D map draws it). */
const BRANCH_THIN_PX = 0.3;

/** A ribbon's full width at its parent end and at its child end, world units. */
export interface TaperEnds {
	parent: number;
	child: number;
}

/**
 * The width a hierarchy edge has where it leaves a node at outline depth
 * `depth`: `TAPER_ROOT_WIDTH` at a root, shrinking by `TAPER_FALLOFF` a level,
 * never below `TAPER_MIN_WIDTH`. `strength` scales how far above the minimum
 * it is (1 = the default look).
 */
export function depthWidth(depth: number, strength = 1): number {
	const level = Number.isFinite(depth) ? Math.max(0, depth) : Infinity;
	const s = Number.isFinite(strength) ? Math.max(0, strength) : 1;
	const above = Math.max(0, TAPER_ROOT_WIDTH * TAPER_FALLOFF ** level - TAPER_MIN_WIDTH);
	return TAPER_MIN_WIDTH + above * s;
}

/**
 * The two ends of the edge from a parent at outline depth `parentDepth` to
 * its child, whose branch style is `branch` (null: none). With no thickness
 * or taper in it, the edge runs from the parent's depth width to the child's
 * (`depthWidth`). A branch style beats that, as in the 2D map: its
 * `thickness` (mind-map px, `pxWorld` world units each) is the parent end;
 * its taper `none` keeps that width to the child, `fade` thins to a hair at
 * the child and `grow` the other way round; a thickness with no taper keeps
 * the depth taper's ratio.
 */
export function branchEnds(parentDepth: number, branch: Pick<BranchStyle, "thickness" | "taper"> | null, strength: number, pxWorld: number): TaperEnds {
	const parent = depthWidth(parentDepth, strength);
	const child = depthWidth(parentDepth + 1, strength);
	const thickness = branch?.thickness;
	const base = typeof thickness === "number" && Number.isFinite(thickness) && thickness > 0 ? thickness * pxWorld : null;
	const thin = Math.min(BRANCH_THIN_PX * pxWorld, base ?? parent);
	switch (branch?.taper) {
		case "none":
			return { parent: base ?? parent, child: base ?? parent };
		case "fade":
			return { parent: base ?? parent, child: thin };
		case "grow":
			return { parent: thin, child: base ?? parent };
		default:
			return base === null ? { parent, child } : { parent: base, child: (base * child) / parent };
	}
}

/**
 * Outline depth of every node an edge in `edges` (parent → child) reaches:
 * 0 for a node with no parent among them (a note's core, or its sole H1),
 * one more for each level below. A cycle, which an outline can't have, is
 * cut where it closes.
 */
export function hierarchyDepths(edges: Iterable<{ source: string; target: string }>): Map<string, number> {
	const children = new Map<string, string[]>();
	const hasParent = new Set<string>();
	for (const { source, target } of edges) {
		let list = children.get(source);
		if (list === undefined) children.set(source, (list = []));
		list.push(target);
		hasParent.add(target);
	}
	const depths = new Map<string, number>();
	const walk = (roots: string[]): void => {
		const queue = roots.map((id) => ({ id, depth: 0 }));
		for (const id of roots) depths.set(id, 0);
		for (let i = 0; i < queue.length; i++) {
			const { id, depth } = queue[i]!;
			for (const child of children.get(id) ?? []) {
				if (depths.has(child)) continue;
				depths.set(child, depth + 1);
				queue.push({ id: child, depth: depth + 1 });
			}
		}
	};
	walk([...children.keys()].filter((id) => !hasParent.has(id)));
	// Only a cycle is left unreached: start it anywhere.
	for (const id of children.keys()) if (!depths.has(id)) walk([id]);
	return depths;
}

/**
 * A branch pattern as the ribbon shader draws it, in world units: the length
 * of each drawn piece and the period it repeats at (period 0: solid). The 2D
 * map's dashes (8 on, 4 off) and dots (2 on, 4 off), in mind-map px.
 */
export function dashOf(pattern: BranchLinePattern | undefined, pxWorld: number): { on: number; period: number } {
	if (pattern === "dashed") return { on: 8 * pxWorld, period: 12 * pxWorld };
	if (pattern === "dotted") return { on: 2 * pxWorld, period: 6 * pxWorld };
	return { on: 0, period: 0 };
}

/**
 * The four corners of a ribbon segment from `a` (full width `wa`) to `b`
 * (`wb`) as seen from `eye`: each end pushed to either side along
 * `(b − a) × (eye − end)`, so the quad faces the camera. In order a left,
 * a right, b left, b right. The vertex shader does the same per vertex.
 */
export function ribbonCorners(a: Vec3, b: Vec3, wa: number, wb: number, eye: Vec3): [Vec3, Vec3, Vec3, Vec3] {
	const dir = sub(b, a);
	const side = (end: Vec3, half: number): [Vec3, Vec3] => {
		const s = cross(dir, sub(eye, end));
		const length = Math.hypot(s.x, s.y, s.z);
		const k = length > 1e-9 ? half / length : 0;
		return [
			{ x: end.x + s.x * k, y: end.y + s.y * k, z: end.z + s.z * k },
			{ x: end.x - s.x * k, y: end.y - s.y * k, z: end.z - s.z * k },
		];
	};
	const [al, ar] = side(a, wa / 2);
	const [bl, br] = side(b, wb / 2);
	return [al, ar, bl, br];
}

/**
 * Inserted after `#include <begin_vertex>`: push the vertex sideways to face
 * the camera, by its signed half width (`aRibbon.w`, sign = side) along
 * `aRibbon.xyz × toward the eye`, never thinner than half a device pixel each
 * side so a far stem still draws as the one-pixel line it was.
 * `uRibbonHalfHeight` is the drawing buffer's half height in device px.
 */
export const RIBBON_VERTEX_GLSL = `{
	vec3 rWorld = (modelMatrix * vec4(position, 1.0)).xyz;
	vec3 rSide = cross(aRibbon.xyz, cameraPosition - rWorld);
	float rLength = length(rSide);
	if (rLength > 1e-6) {
		float rDepth = max(-(modelViewMatrix * vec4(position, 1.0)).z, 1e-3);
		float rFloor = 0.5 * rDepth / (projectionMatrix[1][1] * uRibbonHalfHeight);
		transformed += rSide / rLength * max(abs(aRibbon.w), rFloor) * sign(aRibbon.w);
	}
	vDash = aDash;
}`;

/** At the top of the fragment shader's `main`: cut the gaps of a dashed or dotted ribbon (`dashOf`; `vDash` = distance along, on, period). */
export const RIBBON_FRAGMENT_GLSL = "if (vDash.z > 0.0 && mod(vDash.x, vDash.z) > vDash.y) discard;";

function sub(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
	return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
