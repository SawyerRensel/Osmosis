/**
 * Planets mode: each note is a planet. See `vault/Planner/3D Graph - Planets
 * mode.md`.
 *
 * The note's root plate (its core, or the sole H1 that replaces it:
 * `isNoteRoot`) floats at the planet's centre and every other line lies on
 * the surface. The root's children are the *continents*: each is laid out as
 * a 2D mind map (`continentMap`), wrapped onto the sphere about its centre
 * (`wrapPoint`, an azimuthal equidistant map, so distances from the centre
 * keep), and placed anywhere on the globe, poles included, by surface forces
 * that keep continents apart (`placeContinents`). Each continent has one
 * frame, taken at its centre (`tangentFrame`: world +y projected, or world −z
 * at a pole), and every plate lies tangent to the surface at its own place
 * with that frame carried there (`wrapPlate`), so a continent is as rigid as
 * its 2D map. Plates the wrap squeezes together are pushed apart, away from
 * the continent's centre (`spreadContinent`).
 *
 * The radius fits the plates at today's spacing (`planetRadius`), so a planet
 * grows and shrinks with its note. Internal layout is geometry only; the space
 * forces move just the planets' centres (see `Graph3DScene`).
 *
 * Pure: no `obsidian` import, so it is unit-tested directly.
 */

import { computeLayout, type LayoutNode } from "../layout";
import type { BalanceMode } from "../styles";
import type { OsmosisNode } from "../types";
import { UNIT_SPACING, edgeDistance, type Spacing } from "./appearance";
import type { Vec3 } from "./flight";
import { isNoteRoot, type GraphEdgeKind, type GraphNodeKind } from "./model";
import { radialMap } from "./radial";
import { spinFootprint } from "./upright";

/** The 2D map's two directions, and the 3D-only radial one (`radial.ts`). */
export type ContinentDirection = "left-right" | "top-down" | "radial";
/** The 2D map's Balance modes. Radial ignores them: it always fills the circle. */
export type ContinentBalance = BalanceMode;

/**
 * How a continent's 2D map is laid out: the Overlays menu's Continent
 * direction and balance, the same for every planet. A note's own 2D map
 * settings (its `osmosis-styles` frontmatter) are the 2D map's and have no say
 * here.
 */
export interface ContinentStyle {
	direction: ContinentDirection;
	balance: ContinentBalance;
}

export const DEFAULT_CONTINENT_STYLE: ContinentStyle = { direction: "left-right", balance: "one-side" };

/** A line of a planet, with its children in document order. */
export interface PlanetBranch {
	id: string;
	children: PlanetBranch[];
}

/** One planet: its root (at the core) and its continents, the root's children in document order. */
export interface PlanetTree {
	core: string;
	continents: PlanetBranch[];
}

/**
 * The planets of a model: one per note root that is not embedded in another
 * note. A line hangs from its hierarchy parent; an embedded note (or the
 * roots of an embedded part) hangs from the line that embeds it, so it lies
 * inline on its host's surface. Tags, attachments and ghosts belong to no
 * planet: they float free.
 */
export function planetTrees(
	nodes: readonly { id: string; kind: GraphNodeKind; root?: boolean }[],
	edges: readonly { kind: GraphEdgeKind; source: string; target: string }[],
): PlanetTree[] {
	const kinds = new Map(nodes.map((node) => [node.id, node]));
	const children = new Map<string, string[]>();
	const hasParent = new Set<string>();
	for (const edge of edges) {
		if (edge.kind !== "hierarchy" && edge.kind !== "embed") continue;
		const [source, target] = [kinds.get(edge.source), kinds.get(edge.target)];
		if (source === undefined || target === undefined || hasParent.has(target.id)) continue;
		if (source.kind !== "line" && source.kind !== "note") continue;
		if (target.kind !== "line" && target.kind !== "note") continue;
		hasParent.add(target.id);
		const list = children.get(source.id);
		if (list === undefined) children.set(source.id, [target.id]);
		else list.push(target.id);
	}
	const seen = new Set<string>();
	const branch = (id: string): PlanetBranch => {
		seen.add(id);
		const kids = (children.get(id) ?? []).filter((child) => !seen.has(child));
		return { id, children: kids.map(branch) };
	};
	const trees: PlanetTree[] = [];
	for (const node of nodes) {
		if (!isNoteRoot(node) || hasParent.has(node.id) || seen.has(node.id)) continue;
		trees.push({ core: node.id, continents: branch(node.id).children });
	}
	return trees;
}

/** A plate's footprint, in world units. */
export type PlateSize = (id: string) => { width: number; height: number };

/** A plate of a continent's 2D map: its centre relative to the continent head's, x right and y down, and its footprint (the square it stays inside at any spin, see `continentMap`). */
export interface MapPlate {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A continent's 2D map: its plates, the head first at (0, 0), and its half-diagonal from the head (its reach). */
export interface ContinentMap {
	plates: MapPlate[];
	reach: number;
	/** Its footprint, width × height including a margin, for the radius rule. */
	area: number;
}

/** Gap between a parent and its children: a hierarchy edge's rest length, as the flat slices use. */
const COLUMN_GAP = edgeDistance("hierarchy");
/** Gap between siblings (as `flatten.ts`). */
const ROW_GAP = 1.5;
/** Clear space kept round each continent, in world units, at Continent spacing ×1. */
export const CONTINENT_MARGIN = 6;

/** Stand-in parse nodes for the layout: only `id`, `type`, `children` and `content` are read, and sizes come from `PlateSize`. */
function layoutSource(branch: PlanetBranch): OsmosisNode {
	return { id: branch.id, type: "list", depth: 0, content: "", children: branch.children.map(layoutSource) } as unknown as OsmosisNode;
}

/** The 2D map's own layout of a continent: x right, y down, the head's centre at (0, 0). */
function treeMap(head: PlanetBranch, sizes: Map<string, { width: number; height: number }>, style: ContinentStyle, direction: "left-right" | "top-down", nodeSpacing: number): MapPlate[] {
	const result = computeLayout(
		{ root: layoutSource(head), filePath: "", contentHash: "" },
		{
			direction,
			balance: style.balance,
			layoutSide: direction === "top-down" ? "down" : "right",
			topicShape: "rounded-rect",
			horizontalSpacing: COLUMN_GAP * nodeSpacing,
			verticalSpacing: ROW_GAP * nodeSpacing,
			nodePaddingX: 0,
			nodePaddingY: 0,
		},
		undefined,
		sizes,
	);
	const plates: MapPlate[] = [];
	const centre = (node: LayoutNode): { x: number; y: number } => ({ x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 });
	const origin = centre(result.root);
	const visit = (node: LayoutNode): void => {
		const { x, y } = centre(node);
		const size = sizes.get(node.source.id) ?? { width: node.rect.width, height: node.rect.height };
		plates.push({ id: node.source.id, x: x - origin.x, y: y - origin.y, ...size });
		node.children.forEach(visit);
	};
	visit(result.root);
	return plates;
}

/**
 * A continent laid out as a 2D mind map (the 2D map's own `computeLayout`, or
 * `radialMap`), at plate footprints: each plate spins upright with the camera
 * (`upright.ts`), so it is laid out as the square it stays inside at any spin
 * (`spinFootprint`, its diagonal). Plates then never overlap whichever way
 * they turn, and the layout doesn't depend on the camera. `nodeSpacing` (the Node spacing slider)
 * scales the gaps between its plates, never the plates; `continentSpacing`
 * (the Continent spacing slider) scales the clear space kept round it.
 */
export function continentMap(head: PlanetBranch, sizeOf: PlateSize, style: ContinentStyle = DEFAULT_CONTINENT_STYLE, nodeSpacing = 1, continentSpacing = 1): ContinentMap {
	const footprint: PlateSize = (id) => {
		const { width, height } = sizeOf(id);
		const side = spinFootprint(width, height);
		return { width: side, height: side };
	};
	const sizes = new Map<string, { width: number; height: number }>();
	const gather = (branch: PlanetBranch): void => {
		sizes.set(branch.id, footprint(branch.id));
		branch.children.forEach(gather);
	};
	gather(head);
	const plates = style.direction === "radial" ? radialMap(head, footprint, COLUMN_GAP * nodeSpacing, ROW_GAP * nodeSpacing) : treeMap(head, sizes, style, style.direction, nodeSpacing);
	const margin = CONTINENT_MARGIN * continentSpacing;
	let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
	for (const p of plates) {
		[x0, x1] = [Math.min(x0, p.x - p.width / 2), Math.max(x1, p.x + p.width / 2)];
		[y0, y1] = [Math.min(y0, p.y - p.height / 2), Math.max(y1, p.y + p.height / 2)];
	}
	return { plates, reach: plateReach(plates) + margin / 2, area: (x1 - x0 + margin) * (y1 - y0 + margin) };
}

/** How far a map's plates reach from its head: the farthest plate corner. */
function plateReach(plates: readonly MapPlate[]): number {
	let reach = 0;
	for (const p of plates) reach = Math.max(reach, Math.hypot(Math.abs(p.x) + p.width / 2, Math.abs(p.y) + p.height / 2));
	return reach;
}

/** Share of the surface the continents cover: the rest is the gaps between them. */
export const SURFACE_FILL = 0.4;
/** The smallest planet, so a note of one line still has a surface clear of its root plate. */
export const MIN_PLANET_RADIUS = 12;

/** The widest a continent may spread over its planet, in radians from its centre: past this a long map would wrap round onto its own far end. */
export const MAX_CONTINENT_ANGLE = Math.PI * 0.6;

/**
 * The radius rule: the surface area holds the continents' footprints at
 * `SURFACE_FILL`, so the radius grows and shrinks with the note. No continent
 * spreads past `MAX_CONTINENT_ANGLE`, and the root plate floats at the centre,
 * so the radius also clears half its width.
 */
export function planetRadius(maps: readonly { area: number; reach: number }[], rootWidth = 0): number {
	const area = maps.reduce((sum, map) => sum + map.area, 0);
	const reach = maps.reduce((most, map) => Math.max(most, map.reach), 0);
	return Math.max(MIN_PLANET_RADIUS, rootWidth / 2 + CONTINENT_MARGIN, reach / MAX_CONTINENT_ANGLE, Math.sqrt(area / (4 * Math.PI * SURFACE_FILL)));
}

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const normalize = (a: Vec3): Vec3 => {
	const l = length(a);
	return l < 1e-12 ? { x: 0, y: 0, z: 1 } : scale(a, 1 / l);
};

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };
const CAP_UP: Vec3 = { x: 0, y: 0, z: -1 };
/** A frame this close to a pole (radians from the axis) takes world −z for up: world +y projected onto its plane is too short to trust. */
export const CAP_FALLBACK = 0.05;

/** A plate's orientation on the surface: its outward normal, its text-right and its text-up, all unit vectors. */
export interface TangentFrame {
	normal: Vec3;
	right: Vec3;
	up: Vec3;
}

/**
 * The frame at outward normal `normal` (a continent's centre, see
 * `wrapPlate`): up is world +y projected onto the tangent plane, or world −z
 * projected within `CAP_FALLBACK` of a pole. Right is up × normal, so seen from outside
 * (looking down −normal, up at the top of the screen) right is to the right,
 * and right × up is the normal again.
 */
export function tangentFrame(normal: Vec3): TangentFrame {
	const n = normalize(normal);
	const project = (v: Vec3): Vec3 => add(v, n, -dot(v, n));
	const lifted = project(WORLD_UP);
	const up = normalize(length(lifted) < Math.sin(CAP_FALLBACK) ? project(CAP_UP) : lifted);
	return { normal: n, right: cross(up, n), up };
}

/**
 * Where the 2D map point (`x` right, `y` down, from the continent's head) lands
 * on a sphere of `radius` round the origin, for a continent centred at unit
 * direction `centre`: an azimuthal equidistant map in the centre's tangent
 * frame, so the geodesic distance from the centre is the map distance.
 */
export function wrapPoint(centre: Vec3, x: number, y: number, radius: number): Vec3 {
	return wrapPlate(tangentFrame(centre), x, y, radius).offset;
}

/** A plate wrapped onto its planet: its offset from the planet's centre and its frame there. */
export interface WrappedPlate extends TangentFrame {
	offset: Vec3;
}

/**
 * Where the map point (`x` right, `y` down) of a continent whose one frame is
 * `frame` (taken at its centre) lands on a sphere of `radius`, and the plate's
 * frame there: an azimuthal equidistant map (`wrapPoint`), and the continent's
 * frame carried from the centre to the point along the great circle between
 * them (the rotation about normal × the map direction that takes the centre
 * there). So a plate lies tangent at its own place, but its right and up are
 * the continent's, as on the 2D map: no plate turns against its neighbours,
 * near a pole or anywhere. Stable for any distance: the axis comes from the
 * map direction, not from the two ends.
 */
export function wrapPlate(frame: TangentFrame, x: number, y: number, radius: number): WrappedPlate {
	const d = Math.hypot(x, y);
	if (d < 1e-9) return { offset: scale(frame.normal, radius), normal: frame.normal, right: frame.right, up: frame.up };
	const towards = scale(add(scale(frame.right, x), frame.up, -y), 1 / d);
	const angle = d / radius;
	const [c, s] = [Math.cos(angle), Math.sin(angle)];
	const normal = add(scale(frame.normal, c), towards, s);
	const turned = add(scale(towards, c), frame.normal, -s);
	// Right and up are tangent at the centre: their part along `towards` turns with it, the part along the axis stays.
	const carry = (v: Vec3): Vec3 => {
		const along = dot(v, towards);
		return add(add(v, towards, -along), turned, along);
	};
	return { offset: scale(normal, radius), normal, right: carry(frame.right), up: carry(frame.up) };
}

/** How many rounds `spreadContinent` runs at most: each pushes every overlapping plate out at once. */
export const SPREAD_ROUNDS = 32;

/**
 * Push the plates of a continent's map that overlap once wrapped onto a
 * sphere of `radius` apart, away from the continent's centre, and return the
 * map (its plates moved, its reach grown to match; the input is untouched).
 *
 * The equidistant wrap keeps distance from the centre but squeezes sideways
 * spacing, more the farther out, so plates the 2D map kept apart can collide.
 * Of two plates closer than `clearance` (on both axes of the nearer one's
 * frame), the one farther from the centre moves straight out along its own
 * bearing, with its whole branch, just far enough to clear (sideways or
 * outwards, whichever is shorter). Bearings and the order out from the
 * centre keep, so the continent keeps its shape and grows outward. The head
 * never moves; a map nothing overlaps comes back unchanged; at most
 * `SPREAD_ROUNDS` rounds, so it is bounded and, with no randomness, the same
 * every time. Rotation doesn't change the overlaps, so it runs before the
 * continent is placed and uses any centre.
 */
export function spreadContinent(map: ContinentMap, head: PlanetBranch, radius: number, clearance: number): ContinentMap {
	const plates = map.plates.map((p) => ({ ...p }));
	const index = new Map(plates.map((p, i) => [p.id, i]));
	// Each plate's branch (itself and its descendants), as indices.
	const branchOf: number[][] = plates.map(() => []);
	const gather = (branch: PlanetBranch): number[] => {
		const own = index.get(branch.id);
		const members = own === undefined ? [] : [own];
		for (const child of branch.children) members.push(...gather(child));
		if (own !== undefined) branchOf[own] = members;
		return members;
	};
	gather(head);
	const frame = tangentFrame({ x: 0, y: 0, z: 1 });
	// No plate is pushed round past the far side of the planet.
	const farthest = radius * (Math.PI - 0.1);
	let moved = false;
	for (let round = 0; round < SPREAD_ROUNDS; round++) {
		const wrapped = plates.map((p) => wrapPlate(frame, p.x, p.y, radius));
		const out = plates.map((p) => Math.hypot(p.x, p.y));
		const push = new Float64Array(plates.length);
		for (let i = 0; i < plates.length; i++) {
			for (let j = i + 1; j < plates.length; j++) {
				const [a, b] = [plates[i]!, plates[j]!];
				const rel = add(wrapped[j]!.offset, wrapped[i]!.offset, -1);
				const [w, h] = [(a.width + b.width) / 2 + clearance, (a.height + b.height) / 2 + clearance];
				if (dot(rel, rel) >= w * w + h * h) continue;
				const [dx, dy] = [dot(rel, wrapped[i]!.right), dot(rel, wrapped[i]!.up)];
				if (Math.abs(dx) >= w || Math.abs(dy) >= h) continue;
				// The outer plate moves (the later one on a tie), from the other.
				const k = out[j]! >= out[i]! ? j : i;
				if (out[k]! < 1e-6) continue;
				const [ax, ay] = k === j ? [dx, dy] : [-dx, -dy];
				// Its outward bearing in its frame (the map's x right, y down; the frame's up is map up).
				const [ux, uy] = [plates[k]!.x / out[k]!, -plates[k]!.y / out[k]!];
				let need = Infinity;
				if (Math.abs(ux) > 1e-6) need = Math.min(need, (w - Math.sign(ux) * ax) / Math.abs(ux));
				if (Math.abs(uy) > 1e-6) need = Math.min(need, (h - Math.sign(uy) * ay) / Math.abs(uy));
				push[k] = Math.max(push[k]!, need + 1e-3);
			}
		}
		// A plate takes its own push plus every push of its ancestors, so a branch moves together.
		const shift = new Float64Array(plates.length);
		let any = false;
		push.forEach((amount, k) => {
			if (amount <= 0) return;
			any = true;
			for (const m of branchOf[k]!) shift[m] = shift[m]! + amount;
		});
		if (!any) break;
		moved = true;
		plates.forEach((p, m) => {
			const d = out[m]!;
			if (shift[m]! <= 0 || d < 1e-6) return;
			const f = Math.min(d + shift[m]!, farthest) / d;
			[p.x, p.y] = [p.x * f, p.y * f];
		});
	}
	if (!moved) return map;
	return { plates, reach: map.reach - plateReach(map.plates) + plateReach(plates), area: map.area };
}

/** Angular distance between two unit directions. */
const angleBetween = (a: Vec3, b: Vec3): number => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

/**
 * One step of the surface forces on continent centres (unit directions,
 * updated in place). Two continents closer than their reaches (angular radii,
 * `reach / radius`, margins included) push apart along the surface. A
 * continent may sit anywhere, a pole included. Gaps are fine: nothing pulls
 * continents together.
 */
export function surfaceStep(dirs: Vec3[], reaches: readonly number[], step = 0.5): void {
	const moves = dirs.map(() => ({ x: 0, y: 0, z: 0 }));
	for (let i = 0; i < dirs.length; i++) {
		for (let j = i + 1; j < dirs.length; j++) {
			const [a, b] = [dirs[i]!, dirs[j]!];
			const overlap = reaches[i]! + reaches[j]! - angleBetween(a, b);
			if (overlap <= 0) continue;
			// Away from each other along the surface: b's direction with a's normal part removed, flipped.
			let away = add(a, b, -1);
			if (length(away) < 1e-9) away = cross(a, Math.abs(a.y) < 0.9 ? WORLD_UP : { x: 1, y: 0, z: 0 });
			away = normalize(away);
			const push = (overlap * step) / 2;
			moves[i] = add(moves[i]!, away, push);
			moves[j] = add(moves[j]!, away, -push);
		}
	}
	for (let i = 0; i < dirs.length; i++) {
		const d = dirs[i]!;
		const m = moves[i]!;
		// Only the tangential part moves a centre over the sphere.
		dirs[i] = normalize(add(d, add(m, d, -dot(m, d))));
	}
}

/** How many surface-force steps a layout runs: geometric and run once, so a fixed count. */
export const SURFACE_STEPS = 120;

/**
 * Continent centres on the unit sphere, in document order: seeded along a
 * golden-angle spiral over the whole sphere (even areas, pole to pole), the
 * first facing longitude `phase`
 * (as `facingPhase`), or where `seeds` puts them (a re-layout keeps
 * continents where they were), then pushed apart by `surfaceStep`.
 */
export function placeContinents(reaches: readonly number[], phase = 0, seeds: readonly (Vec3 | undefined)[] = []): Vec3[] {
	const count = reaches.length;
	const dirs = reaches.map((_, i) => {
		const seed = seeds[i];
		if (seed !== undefined) return normalize(seed);
		// Top to bottom, even steps in height (so even areas), turning by the golden angle, so neighbours in document order sit near each other.
		const y = 1 - (2 * (i + 0.5)) / count;
		const ring = Math.sqrt(Math.max(0, 1 - y * y));
		const longitude = phase + i * Math.PI * (3 - Math.sqrt(5));
		return { x: ring * Math.cos(longitude), y, z: ring * Math.sin(longitude) };
	});
	for (let step = 0; step < SURFACE_STEPS; step++) surfaceStep(dirs, reaches);
	return dirs;
}

/** Where a plate sits on its planet: its offset from the centre and its frame. */
export interface PlanetPlace extends TangentFrame {
	offset: Vec3;
	/** The continent it belongs to (its head's ID). */
	continent: string;
}

/** A planet laid out: its radius, and every surface plate's place, by ID. */
export interface PlanetLayout {
	core: string;
	radius: number;
	places: Map<string, PlanetPlace>;
	/** Each continent's centre direction, by head ID, to seed the next layout. */
	centres: Map<string, Vec3>;
}

/**
 * Lay a planet out: its continents' maps, the radius they need, the maps
 * spread where the wrap squeezes plates together (`spreadContinent`, and the
 * radius grown if that widened one too far), their centres on the globe, and
 * each plate wrapped onto the surface with its continent's frame.
 */
export function layoutPlanet(
	tree: PlanetTree,
	sizeOf: PlateSize,
	style: ContinentStyle = DEFAULT_CONTINENT_STYLE,
	phase = 0,
	previous?: ReadonlyMap<string, Vec3>,
	nodeSpacing = 1,
	continentSpacing = 1,
): PlanetLayout {
	const rootWidth = sizeOf(tree.core).width;
	const flat = tree.continents.map((head) => continentMap(head, sizeOf, style, nodeSpacing, continentSpacing));
	const first = planetRadius(flat, rootWidth);
	// Half the map's own sibling gap: closer than that, the wrap has squeezed two plates together.
	const maps = flat.map((map, i) => spreadContinent(map, tree.continents[i]!, first, (ROW_GAP * nodeSpacing) / 2));
	const radius = Math.max(first, planetRadius(maps, rootWidth));
	const centres = placeContinents(
		maps.map((map) => map.reach / radius),
		phase,
		tree.continents.map((head) => previous?.get(head.id)),
	);
	const places = new Map<string, PlanetPlace>();
	maps.forEach((map, i) => {
		const head = tree.continents[i]!.id;
		// One frame per continent, at its centre, shared by all its plates.
		const frame = tangentFrame(centres[i]!);
		for (const plate of map.plates) places.set(plate.id, { ...wrapPlate(frame, plate.x, plate.y, radius), continent: head });
	});
	return { core: tree.core, radius, places, centres: new Map(tree.continents.map((head, i) => [head.id, centres[i]!])) };
}

/**
 * Points along the surface arc from `a` to `b` round `centre` (both ends
 * included, `segments + 1` points): the direction turns evenly (slerp) and the
 * distance from the centre eases from one end's to the other's.
 */
export function surfaceArc(centre: Vec3, a: Vec3, b: Vec3, segments: number): Vec3[] {
	const [da, db] = [add(a, centre, -1), add(b, centre, -1)];
	const [ra, rb] = [length(da), length(db)];
	const [ua, ub] = [normalize(da), normalize(db)];
	const angle = angleBetween(ua, ub);
	const points: Vec3[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		let dir: Vec3;
		if (angle < 1e-6) dir = ua;
		else {
			const s = Math.sin(angle);
			dir = add(scale(ua, Math.sin((1 - t) * angle) / s), ub, Math.sin(t * angle) / s);
		}
		points.push(add(centre, dir, ra + (rb - ra) * t));
	}
	return points;
}

/**
 * How far a lane between planets bows out at its middle: away from the two
 * planets' centres, by a quarter of its length, so it leaves each surface
 * rather than cutting through it. The lane's point at fraction `t` is the
 * straight line's plus `4t(1 − t)` of this (a quadratic curve).
 */
export function laneBow(a: Vec3, b: Vec3, aCentre: Vec3, bCentre: Vec3): Vec3 {
	const outward = add(normalize(add(a, aCentre, -1)), normalize(add(b, bCentre, -1)));
	const span = length(add(b, a, -1));
	return length(outward) < 1e-6 ? { x: 0, y: 0, z: 0 } : scale(normalize(outward), span * 0.25);
}

/** Points along a lane from `a` to `b` (`laneBow`), `segments + 1` of them. */
export function laneArc(a: Vec3, b: Vec3, aCentre: Vec3, bCentre: Vec3, segments: number): Vec3[] {
	const bow = laneBow(a, b, aCentre, bCentre);
	const points: Vec3[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const lift = 4 * t * (1 - t);
		points.push({ x: a.x + (b.x - a.x) * t + bow.x * lift, y: a.y + (b.y - a.y) * t + bow.y * lift, z: a.z + (b.z - a.z) * t + bow.z * lift });
	}
	return points;
}

/** The hover view of a surface plate: the camera `distance` out along its normal, looking straight down at it, with its up at the top of the screen. */
export function hoverPose(at: Vec3, frame: TangentFrame, distance: number): { position: Vec3; target: Vec3; up: Vec3 } {
	return { position: add(at, frame.normal, distance), target: at, up: frame.up };
}

/** A body the space simulation moves (a d3 node): position, velocity, and pin. */
export interface PlanetBody {
	x?: number;
	y?: number;
	z?: number;
	vx?: number;
	vy?: number;
	vz?: number;
	fx?: number;
	fy?: number;
	fz?: number;
}

/**
 * A link that pulls between two bodies in Planets mode: from a planet's plate
 * (or core) to another planet's, or to a star. `rest` is its rest length
 * between its two nodes (`linkDistance`, Note spacing included), `scale` the
 * force balance's weight for its kind (`linkStrengthScale`).
 */
export interface Lane {
	source: string;
	target: string;
	rest: number;
	scale: number;
}

/** Clear space kept between two planets' surfaces, in world units, at Note spacing ×1. */
export const PLANET_GAP = 20;
/** How long a re-laid-out planet's plates take to move to their new places. */
export const RELAYOUT_MS = 600;

interface Planet {
	layout: PlanetLayout;
	/** The tree and plate sizes the layout was made from, to tell when it must be redone. */
	key: string;
	/** Offsets the plates are easing from, after a re-layout. */
	from: Map<string, Vec3> | null;
	start: number;
}

/**
 * The planets of the loaded notes and their plates' places: what the scene
 * keeps between data updates. Each planet is laid out once and kept until
 * its tree or plate sizes change (`update`), so settled planets never move
 * inside. The space forces move only centres (`step`), and every surface
 * plate rides on its centre (`place`).
 */
export class PlanetWorld {
	private planets = new Map<string, Planet>();
	/** Each surface plate's planet (its core's ID). A core maps to itself. */
	private memberOf = new Map<string, string>();
	private animating = false;
	/**
	 * The spacing sliders. Node spacing scales the gaps between plates on a
	 * continent (and so the radius), Note spacing the clear space between
	 * planet surfaces and round them. Set before `update`; a change needs `clear`.
	 */
	spacing: Spacing = UNIT_SPACING;
	/** The Continent spacing slider: the clear space round each continent (`CONTINENT_MARGIN`), and so the radius. As `spacing`. */
	continentSpacing = 1;

	/** Drop every layout: the next `update` lays every planet out afresh (a mode or style change). */
	clear(): void {
		this.planets.clear();
		this.memberOf.clear();
	}

	get size(): number {
		return this.planets.size;
	}

	/** Whether a re-laid-out planet's plates are still easing to their new places. */
	get easing(): boolean {
		return this.animating;
	}

	/** The planet (core ID) a node belongs to, if any: itself for a core. */
	planetOf(id: string): string | undefined {
		return this.memberOf.get(id);
	}

	radius(core: string): number | undefined {
		return this.planets.get(core)?.layout.radius;
	}

	/** A surface plate's frame (none for a core, or a node on no planet). */
	place(id: string): PlanetPlace | undefined {
		const core = this.memberOf.get(id);
		return core === undefined ? undefined : this.planets.get(core)?.layout.places.get(id);
	}

	/**
	 * Lay out the planets of `trees` that are new or changed, keeping the rest.
	 * A changed planet keeps its continents where they were (by head ID) and,
	 * with `animate`, eases its plates from where they were. A planet whose
	 * style changed counts as changed (every planet, as the style is shared). Returns the cores
	 * whose radius grew, for the caller to check for collisions.
	 */
	update(trees: readonly PlanetTree[], sizeOf: PlateSize, style: ContinentStyle, phaseOf: (core: string) => number, now: number, animate: boolean): string[] {
		const next = new Map<string, Planet>();
		this.memberOf.clear();
		const grew: string[] = [];
		for (const tree of trees) {
			const key = planetKey(tree, sizeOf, style, this.spacing.node, this.continentSpacing);
			const old = this.planets.get(tree.core);
			let planet = old;
			if (old === undefined || old.key !== key) {
				const layout = layoutPlanet(tree, sizeOf, style, phaseOf(tree.core), old?.layout.centres, this.spacing.node, this.continentSpacing);
				let from: Map<string, Vec3> | null = null;
				if (animate && old !== undefined) {
					from = new Map();
					for (const [id, place] of old.layout.places) from.set(id, this.offsetOf(old, id, place, now));
					this.animating = true;
				}
				planet = { layout, key, from, start: now };
				if (old !== undefined && layout.radius > old.layout.radius) grew.push(tree.core);
			}
			next.set(tree.core, planet!);
			this.memberOf.set(tree.core, tree.core);
			for (const id of planet!.layout.places.keys()) this.memberOf.set(id, tree.core);
		}
		this.planets = next;
		return grew;
	}

	/** Where a plate shows on its planet `now`: easing from its old offset after a re-layout. */
	private offsetOf(planet: Planet, id: string, place: PlanetPlace, now: number): Vec3 {
		const from = planet.from?.get(id);
		if (from === undefined) return place.offset;
		const t = Math.min(1, (now - planet.start) / RELAYOUT_MS);
		const eased = t * (2 - t);
		return { x: from.x + (place.offset.x - from.x) * eased, y: from.y + (place.offset.y - from.y) * eased, z: from.z + (place.offset.z - from.z) * eased };
	}

	/**
	 * Put every surface plate at its core's position plus its offset, pinned
	 * there. Returns whether anything was placed. Without `force`, only while a
	 * re-layout is easing (a moving core places its plates in `step`).
	 */
	placeAll(bodyOf: (id: string) => PlanetBody | undefined, now: number, force = false): boolean {
		if (!force && !this.animating) return false;
		let easing = false;
		for (const planet of this.planets.values()) {
			const core = bodyOf(planet.layout.core);
			if (core?.x === undefined || core.y === undefined || core.z === undefined) continue;
			if (planet.from !== null && now - planet.start >= RELAYOUT_MS) planet.from = null;
			if (planet.from !== null) easing = true;
			for (const [id, place] of planet.layout.places) {
				const body = bodyOf(id);
				if (body === undefined) continue;
				const offset = this.offsetOf(planet, id, place, now);
				body.x = body.fx = core.x + offset.x;
				body.y = body.fy = core.y + offset.y;
				body.z = body.fz = core.z + offset.z;
				body.vx = body.vy = body.vz = 0;
			}
		}
		this.animating = easing;
		return true;
	}

	/**
	 * The planets' share of a simulation tick, run after the other forces:
	 * `lanes` pull (`pullLanes`), the pull links put on surface plates goes to
	 * their cores, planets closer than their radii plus `PLANET_GAP` push
	 * apart, free bodies on no planet (tags, files, ghosts) are pushed out of
	 * planets, and the plates are put back on their cores.
	 */
	step(bodyOf: (id: string) => PlanetBody | undefined, free: readonly PlanetBody[], alpha: number, now: number, lanes: readonly Lane[] = []): void {
		this.pullLanes(bodyOf, lanes, alpha, now);
		const cores: { body: PlanetBody; radius: number }[] = [];
		for (const planet of this.planets.values()) {
			const core = bodyOf(planet.layout.core);
			if (core?.x === undefined) continue;
			for (const id of planet.layout.places.keys()) {
				const body = bodyOf(id);
				if (body === undefined) continue;
				core.vx = (core.vx ?? 0) + (body.vx ?? 0);
				core.vy = (core.vy ?? 0) + (body.vy ?? 0);
				core.vz = (core.vz ?? 0) + (body.vz ?? 0);
			}
			cores.push({ body: core, radius: planet.layout.radius });
		}
		const push = (a: PlanetBody, b: PlanetBody, clear: number, share: number): void => {
			const [dx, dy, dz] = [(b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0), (b.z ?? 0) - (a.z ?? 0)];
			const d = Math.hypot(dx, dy, dz);
			if (d >= clear) return;
			const [ux, uy, uz] = d < 1e-6 ? [1, 0, 0] : [dx / d, dy / d, dz / d];
			const move = (clear - d) * Math.max(alpha, 0.1);
			if (a.fx === undefined) [a.vx, a.vy, a.vz] = [(a.vx ?? 0) - ux * move * (1 - share), (a.vy ?? 0) - uy * move * (1 - share), (a.vz ?? 0) - uz * move * (1 - share)];
			if (b.fx === undefined) [b.vx, b.vy, b.vz] = [(b.vx ?? 0) + ux * move * share, (b.vy ?? 0) + uy * move * share, (b.vz ?? 0) + uz * move * share];
		};
		const gap = PLANET_GAP * this.spacing.note;
		for (let i = 0; i < cores.length; i++) {
			const a = cores[i]!;
			for (let j = i + 1; j < cores.length; j++) push(a.body, cores[j]!.body, a.radius + cores[j]!.radius + gap, 0.5);
			for (const body of free) if (body.x !== undefined && body.fx === undefined) push(a.body, body, a.radius + gap / 2, 1);
		}
		this.placeAll(bodyOf, now, true);
	}

	/**
	 * d3's link force, for links between bodies: a planet is one body, so its
	 * lanes are counted for the whole planet, as a node's links are for the
	 * node. Each lane's strength is its `scale` over the fewer lanes at either
	 * body, and its correction is shared between the bodies by their lane
	 * counts (the busier body moves less), d3's own default strength and bias.
	 *
	 * Left to d3, a lane was counted at its plate: each pulled at up to a
	 * plate's full strength, and every plate's share went to the one core, so
	 * a planet with several lanes took several times a node's pull in a tick.
	 * It overshot and swung, and settled wherever the swing left it (with a
	 * tag or a few busy planets it flew apart): Note spacing ×3 could settle
	 * tighter than ×1. See `vault/Planner/3D Graph - Note spacing applies late and shrinks.md`.
	 *
	 * A lane's ends are measured where they will be this tick: a plate at its
	 * core plus its offset, each end ahead by its body's velocity, as d3 does.
	 */
	private pullLanes(bodyOf: (id: string) => PlanetBody | undefined, lanes: readonly Lane[], alpha: number, now: number): void {
		if (lanes.length === 0) return;
		const owner = (id: string): string => this.memberOf.get(id) ?? id;
		const count = new Map<string, number>();
		for (const lane of lanes) {
			const [a, b] = [owner(lane.source), owner(lane.target)];
			if (a === b) continue;
			count.set(a, (count.get(a) ?? 0) + 1);
			count.set(b, (count.get(b) ?? 0) + 1);
		}
		const at = (id: string, body: PlanetBody): Vec3 | null => {
			if (body.x === undefined || body.y === undefined || body.z === undefined) return null;
			const core = this.memberOf.get(id);
			const planet = core === undefined || core === id ? undefined : this.planets.get(core);
			const place = planet?.layout.places.get(id);
			const offset = planet === undefined || place === undefined ? { x: 0, y: 0, z: 0 } : this.offsetOf(planet, id, place, now);
			return { x: body.x + offset.x + (body.vx ?? 0), y: body.y + offset.y + (body.vy ?? 0), z: body.z + offset.z + (body.vz ?? 0) };
		};
		for (const lane of lanes) {
			const [ka, kb] = [owner(lane.source), owner(lane.target)];
			if (ka === kb) continue;
			const [a, b] = [bodyOf(ka), bodyOf(kb)];
			if (a === undefined || b === undefined) continue;
			const [pa, pb] = [at(lane.source, a), at(lane.target, b)];
			if (pa === null || pb === null) continue;
			const [ca, cb] = [count.get(ka) ?? 1, count.get(kb) ?? 1];
			const [dx, dy, dz] = [pb.x - pa.x || 1e-6, pb.y - pa.y, pb.z - pa.z];
			const l = Math.hypot(dx, dy, dz);
			const k = ((l - lane.rest) / l) * alpha * (lane.scale / Math.min(ca, cb));
			const toB = ca / (ca + cb);
			b.vx = (b.vx ?? 0) - dx * k * toB;
			b.vy = (b.vy ?? 0) - dy * k * toB;
			b.vz = (b.vz ?? 0) - dz * k * toB;
			a.vx = (a.vx ?? 0) + dx * k * (1 - toB);
			a.vy = (a.vy ?? 0) + dy * k * (1 - toB);
			a.vz = (a.vz ?? 0) + dz * k * (1 - toB);
		}
	}

	/** The cores among `cores` whose planet now overlaps another's (radius plus gap), with that other: what a re-layout must wake. */
	collisions(cores: readonly string[], bodyOf: (id: string) => PlanetBody | undefined): string[] {
		const hit = new Set<string>();
		for (const id of cores) {
			const a = bodyOf(id);
			const ra = this.radius(id);
			if (a?.x === undefined || ra === undefined) continue;
			for (const [other, planet] of this.planets) {
				const b = bodyOf(other);
				if (other === id || b?.x === undefined) continue;
				const d = Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0), (b.z ?? 0) - (a.z ?? 0));
				if (d < ra + planet.layout.radius + PLANET_GAP * this.spacing.note) hit.add(id).add(other);
			}
		}
		return [...hit];
	}
}

/** What a planet's layout depends on: its tree's shape, its plates' sizes, its continent style and the Node and Continent spacing. */
function planetKey(tree: PlanetTree, sizeOf: PlateSize, style: ContinentStyle, nodeSpacing: number, continentSpacing: number): string {
	const parts: string[] = [`${style.direction}/${style.balance}/${String(nodeSpacing)}/${String(continentSpacing)}|`];
	const visit = (branch: PlanetBranch): void => {
		const { width, height } = sizeOf(branch.id);
		parts.push(`${branch.id}:${width.toFixed(2)}x${height.toFixed(2)}(`);
		branch.children.forEach(visit);
		parts.push(")");
	};
	const root = sizeOf(tree.core);
	parts.push(`${root.width.toFixed(2)}|`);
	tree.continents.forEach(visit);
	return parts.join("");
}
