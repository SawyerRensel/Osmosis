// Measures Cosmos's d3 tick time on the stress web, headless, with the
// forces the scene sets up (`CosmosScene`): plate-aware link distances, the
// many-body force limited as `settle.ts` limits it, and no centring force.
// Organic by default; Planets with `planets`. Organic then runs on to rest
// and counts clashing plates.
//
//   node e2e/generate-graph3d-stress.mjs   # once, if e2e/fixtures/graph3d-stress/ is missing
//   npx esbuild e2e/measure-graph3d-ticks.ts --bundle --platform=node --format=esm --outfile=/tmp/osmosis-ticks.mjs
//   node /tmp/osmosis-ticks.mjs organic
//   node /tmp/osmosis-ticks.mjs organic e2e/fixtures/graph3d "Galley Handbook.md"   # another web, from its focus note
//   node /tmp/osmosis-ticks.mjs planets   # Planets mode: only planet cores and free stars simulate (`planets.ts`)
//
// Every node starts free, as on first load. Plate sizes are estimated from
// label length (the scene measures them with its glyph atlas), so absolute
// numbers differ a little from the perf gauge's; compare runs of this script.
// The start is random (`placeNodes`), so shape numbers vary a little between runs.
//
// The shape check, after 300 ticks: pairs of plates that cut into each other
// (each plate counted as a sphere of half its width, since it turns to face
// the camera).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
import { OsmosisParser } from "../src/parser";
import { buildGraph, type GraphEdgeKind, type GraphNode, type LinkCacheLike } from "../src/cosmos/model";
import { placeNodes } from "../src/cosmos/positions";
import { chargeStrengths } from "../src/cosmos/settle";
import { linkDistance, nodeExtent, spriteLabel } from "../src/cosmos/appearance";
import { panelBoxEm } from "../src/cosmos/near";
import { DEFAULT_CONTINENT_STYLE, PlanetWorld, planetTrees } from "../src/cosmos/planets";

const LINE_PLATE_HEIGHT = 5;
const CORE_PLATE_HEIGHT = 10;
const PLATE_HEIGHT_EM = 1.75;
const TICKS = 120;

const planets = process.argv[2] === "planets";
const dir = join(process.cwd(), process.argv[3] ?? "e2e/fixtures/graph3d-stress");
const focus = process.argv[4] ?? "Stress Hub.md";
const SHAPE_TICKS = 300;
const parser = new OsmosisParser();
const names = new Set(readdirSync(dir).filter((f) => f.endsWith(".md")));
const notes = [...names].map((file) => {
	const text = readFileSync(join(dir, file), "utf8");
	const cache: LinkCacheLike = { links: [], tags: [] };
	for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) cache.links!.push({ link: m[1]!, original: m[0], displayText: m[1]!, position: { start: { line: 0, col: 0, offset: m.index }, end: { line: 0, col: 0, offset: m.index + m[0].length } } });
	for (const m of text.matchAll(/#stress\/\w+/g)) cache.tags!.push({ tag: m[0], position: { start: { line: 0, col: 0, offset: m.index }, end: { line: 0, col: 0, offset: m.index + m[0].length } } });
	return { tree: parser.parse(text, file), cache };
});
const model = buildGraph(notes, (linkpath) => (names.has(`${linkpath}.md`) ? `${linkpath}.md` : null));

/** A plate's size in world units, estimated: half an em a character, padded, capped as the scene caps it. */
function plate(node: GraphNode): { width: number; height: number } {
	const core = node.kind === "note";
	const height = core ? CORE_PLATE_HEIGHT : LINE_PLATE_HEIGHT;
	const em = height / PLATE_HEIGHT_EM;
	const text = core ? node.label : spriteLabel(node.label);
	return { width: Math.min(core ? 30 : 20, text.length * 0.5 + 0.8) * em, height };
}
const emWorld = LINE_PLATE_HEIGHT / PLATE_HEIGHT_EM;

interface Body extends GraphNode {
	extent: number;
	size: { width: number; height: number };
	x?: number;
	y?: number;
	z?: number;
	vx?: number;
	vy?: number;
	vz?: number;
	fx?: number;
}
const placed = placeNodes(model, new Map(), new Map([[focus, focus]]));
const bodies: Body[] = model.nodes.map((node) => {
	const p = plate(node);
	const panel = panelBoxEm(node);
	const at = placed.get(node.id)!;
	return {
		...node,
		extent: nodeExtent(p, panel, emWorld),
		size: { width: Math.max(p.width, (panel?.width ?? 0) * emWorld), height: Math.max(p.height, (panel?.height ?? 0) * emWorld) },
		x: at.x,
		y: at.y,
		z: at.z,
	};
});
const byId = new Map(bodies.map((b) => [b.id, b]));

const t0 = performance.now();
// Planets mode lays each note out geometrically once; only cores and stars feel the many-body force.
const world = new PlanetWorld();
let planetSetup = 0;
if (planets) {
	const start = performance.now();
	world.update(planetTrees(model.nodes, model.edges), (id) => byId.get(id)!.size, DEFAULT_CONTINENT_STYLE, () => 0, 0, false);
	planetSetup = performance.now() - start;
}
const stars = bodies.filter((b) => planets && world.planetOf(b.id) === undefined);
const charge = chargeStrengths(bodies.filter((b) => (world.planetOf(b.id) ?? b.id) === b.id).map((b) => ({ ...b, pinned: false })), -30);
const setup = performance.now() - t0;

const degree = new Map<string, number>();
for (const e of model.edges) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
type Link = { kind: GraphEdgeKind; source: string | Body; target: string | Body };
const links: Link[] = model.edges.map((e) => ({ kind: e.kind, source: e.source, target: e.target }));
const endId = (end: string | Body): string => (typeof end === "string" ? end : end.id);

const many = forceManyBody<Body>().strength((n: Body) => charge.get(n.id) ?? 0);
const limited = Object.assign((alpha: number) => many(alpha), {
	initialize: (nodes: Body[], ...args: unknown[]) => (many.initialize as (n: Body[], ...a: unknown[]) => void)(nodes.filter((n) => charge.has(n.id)), ...args),
});
const sim = forceSimulation<Body>(bodies, 3)
	.velocityDecay(0.4)
	.force("link", forceLink<Body, Link>(links).id((n: Body) => n.id)
		.distance((l: Link) => linkDistance(l.kind, (l.source as Body).extent, (l.target as Body).extent))
		.strength((l: Link) => (planets && world.planetOf(endId(l.source)) !== undefined && world.planetOf(endId(l.source)) === world.planetOf(endId(l.target)) ? 0 : 1) / Math.max(1, Math.min(degree.get(endId(l.source)) ?? 1, degree.get(endId(l.target)) ?? 1))))
	.force("charge", limited)
	.stop();
let planetTime = 0;
if (planets) {
	sim.force("planets", (alpha: number) => {
		const start = performance.now();
		world.step((id) => byId.get(id), stars, alpha, 0);
		planetTime += performance.now() - start;
	});
}
const times: number[] = [];
for (let i = 0; i < TICKS; i++) {
	const start = performance.now();
	sim.tick();
	times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
if (planets) {
	// No shape check on planets: plates packed on each surface make the clash grid quadratic.
	const mean = times.reduce((a, b) => a + b, 0) / times.length;
	console.log(
		`planets: ${bodies.length} nodes, ${world.size} planets, ${stars.length} stars, ${charge.size} charged, layout ${planetSetup.toFixed(1)} ms · ` +
		`tick over ${TICKS}: mean ${mean.toFixed(2)} ms (planets force ${(planetTime / TICKS).toFixed(2)} ms), median ${times[TICKS >> 1]!.toFixed(2)} ms, worst ${times[TICKS - 1]!.toFixed(2)} ms`,
	);
	process.exit(0);
}
// Run on to rest (d3's alpha reaches its minimum after about 300 ticks) for the shape check.
for (let i = TICKS; i < SHAPE_TICKS; i++) sim.tick();

// Shape: plates that cut into each other.
const radius = (id: string): number => plate(byId.get(id)!).width / 2;
const cell = 2 * Math.max(1, ...bodies.map((b) => radius(b.id)));
const grid = new Map<string, string[]>();
const key = (x: number, y: number, z: number): string => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
for (const { id } of bodies) {
	const b = byId.get(id)!;
	const k = key(b.x!, b.y!, b.z!);
	(grid.get(k) ?? grid.set(k, []).get(k)!).push(id);
}
let clashes = 0;
for (const { id } of bodies) {
	const a = byId.get(id)!;
	const [cx, cy, cz] = [Math.floor(a.x! / cell), Math.floor(a.y! / cell), Math.floor(a.z! / cell)];
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
		for (const other of grid.get(`${cx + i},${cy + j},${cz + k}`) ?? []) {
			if (other <= id) continue;
			const b = byId.get(other)!;
			if (Math.hypot(a.x! - b.x!, a.y! - b.y!, a.z! - b.z!) < radius(id) + radius(other)) clashes++;
		}
	}
}
const reach = Math.max(...bodies.map((b) => Math.hypot(b.x!, b.y!, b.z!)));
const mean = times.reduce((a, b) => a + b, 0) / times.length;
console.log(
	`organic: ${bodies.length} nodes, ${links.length} edges, ${charge.size} charged (setup ${setup.toFixed(1)} ms) · tick over ${TICKS}: mean ${mean.toFixed(2)} ms, ` +
	`median ${times[TICKS >> 1]!.toFixed(2)} ms, worst ${times[TICKS - 1]!.toFixed(2)} ms · farthest node ${reach.toFixed(0)}\n` +
	`  shape after ${SHAPE_TICKS} ticks: ${clashes} clashing plate pairs`,
);
