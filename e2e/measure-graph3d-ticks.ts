// Measures the 3D graph's d3 tick time on the stress web, headless, with the
// forces the scene sets up (`Graph3DScene`): plate-aware link distances, the
// many-body force limited as `settle.ts` limits it, no centring force, and,
// with a flatten slider position given, the flatten force and the note push
// (`src/graph3d/flatten.ts`). Then it runs on to rest and checks the shape.
//
//   node e2e/generate-graph3d-stress.mjs   # once, if e2e/fixtures/graph3d-stress/ is missing
//   npx esbuild e2e/measure-graph3d-ticks.ts --bundle --platform=node --format=esm --outfile=/tmp/osmosis-ticks.mjs
//   node /tmp/osmosis-ticks.mjs 0      # flatten off
//   node /tmp/osmosis-ticks.mjs 0.75   # the default flatten
//   node /tmp/osmosis-ticks.mjs 0.75 e2e/fixtures/graph3d "Galley Handbook.md"   # another web, from its focus note
//
// Every node starts free, as on first load. Plate sizes are estimated from
// label length (the scene measures them with its glyph atlas), so absolute
// numbers differ a little from the perf gauge's; compare runs of this script.
// The start is random (`placeNodes`), so shape numbers vary a little between runs.
//
// The shape checks, after 300 ticks: plates of two flat branches of one note
// that cut into each other (each plate counted as a sphere of half its width,
// since it turns to face the camera), the same for any two plates outside one
// branch, how far branch roots end up from their core (at flat depth 2 when
// flatten is off), and, at a whole flat depth, that every flat line lies in
// its slice's plane through the core, further out than its root, in order.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
import { OsmosisParser } from "../src/parser";
import { buildGraph, type GraphEdgeKind, type GraphNode, type LinkCacheLike } from "../src/graph3d/model";
import { placeNodes } from "../src/graph3d/positions";
import { chargeStrengths } from "../src/graph3d/settle";
import { linkDistance, nodeExtent, spriteLabel } from "../src/graph3d/appearance";
import { panelBoxEm } from "../src/graph3d/near";
import { FlatLayouts, flatCharges, flatDepth, flatIndex, flatLinkScale, flattenStep, FlatState, notePush, type FlatBranch } from "../src/graph3d/flatten";
import type { Vec3 } from "../src/graph3d/flight";

const LINE_PLATE_HEIGHT = 5;
const CORE_PLATE_HEIGHT = 10;
const PLATE_HEIGHT_EM = 1.75;
const TICKS = 120;

const flatten = Number(process.argv[2] ?? "0");
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
const branches = new FlatLayouts().branches(model.nodes, flatDepth(flatten), (node) => byId.get(node.id)!.size);
const index = flatIndex(branches);
const charge = chargeStrengths(bodies.map((b) => ({ ...b, pinned: false })), -30);
const shares = flatCharges(charge, branches);
const noteCores = new Map(bodies.filter((b) => b.kind === "note").map((b) => [b.path!, { body: b, strength: shares.get(b.id) ?? 0 }]));
const charged = bodies.filter((b) => charge.has(b.id)).map((body) => ({ body, path: body.path }));
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
		.strength((l: Link) => flatLinkScale(index, endId(l.source), endId(l.target)) / Math.max(1, Math.min(degree.get(endId(l.source)) ?? 1, degree.get(endId(l.target)) ?? 1))))
	.force("charge", limited)
	.stop();
const state = new FlatState();
const { twists } = state;
if (shares.size > 0) sim.force("notes", (alpha: number) => notePush(noteCores, charged, alpha));
let flatTime = 0;
if (branches.length > 0) {
	sim.force("flatten", (alpha: number) => {
		const start = performance.now();
		flattenStep(branches, (id) => byId.get(id), 0.6, alpha, state);
		flatTime += performance.now() - start;
	});
}
/** Every line of a branch below its root, with its offset from the root. */
const linesOf = (branch: FlatBranch): { id: string; dx: number; dy: number }[] =>
	branch.lines.flatMap((line) => [line, ...line.members.map((m) => ({ id: m.id, dx: line.dx + m.dx, dy: line.dy + m.dy }))]);

const times: number[] = [];
for (let i = 0; i < TICKS; i++) {
	const start = performance.now();
	sim.tick();
	times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const flatMean = flatTime / TICKS;
// Run on to rest (d3's alpha reaches its minimum after about 300 ticks) for the shape checks.
for (let i = TICKS; i < SHAPE_TICKS; i++) sim.tick();

// Shape: plates that cut into each other, of two flat branches of one note, and of any two outside one branch.
const radius = (id: string): number => plate(byId.get(id)!).width / 2;
const sliceOf = new Map<string, number>();
branches.forEach((branch, i) => {
	sliceOf.set(branch.root, i);
	for (const m of linesOf(branch)) sliceOf.set(m.id, i);
});
const cell = 2 * Math.max(1, ...bodies.map((b) => radius(b.id)));
const grid = new Map<string, string[]>();
const key = (x: number, y: number, z: number): string => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
for (const { id } of bodies) {
	const b = byId.get(id)!;
	const k = key(b.x!, b.y!, b.z!);
	(grid.get(k) ?? grid.set(k, []).get(k)!).push(id);
}
let clashes = 0;
let anyClashes = 0;
const clashing = new Set<string>();
for (const { id } of bodies) {
	const a = byId.get(id)!;
	const [cx, cy, cz] = [Math.floor(a.x! / cell), Math.floor(a.y! / cell), Math.floor(a.z! / cell)];
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
		for (const other of grid.get(`${cx + i},${cy + j},${cz + k}`) ?? []) {
			if (other <= id) continue;
			const [sa, sb] = [sliceOf.get(id), sliceOf.get(other)];
			if (sa !== undefined && sa === sb) continue;
			const b = byId.get(other)!;
			if (Math.hypot(a.x! - b.x!, a.y! - b.y!, a.z! - b.z!) >= radius(id) + radius(other)) continue;
			anyClashes++;
			if (sa === undefined || sb === undefined || branches[sa]!.core !== branches[sb]!.core) continue;
			clashes++;
			clashing.add(sa < sb ? `${sa}|${sb}` : `${sb}|${sa}`);
		}
	}
}
let siblingPairs = 0;
const perCore = new Map<string, number>();
for (const branch of branches) perCore.set(branch.core, (perCore.get(branch.core) ?? 0) + 1);
for (const n of perCore.values()) siblingPairs += (n * (n - 1)) / 2;
// Shape: how far each branch root ends up from its note's core (long spokes are roots thrown out).
const spokeBranches = branches.length > 0 ? branches : new FlatLayouts().branches(model.nodes, 2, (node) => byId.get(node.id)!.size);
const spokes = spokeBranches.map((branch) => {
	const [r, c] = [byId.get(branch.root)!, byId.get(branch.core)!];
	return Math.hypot(r.x! - c.x!, r.y! - c.y!, r.z! - c.z!);
}).sort((a, b) => a - b);
const pct = (q: number): string => (spokes.length === 0 ? "-" : spokes[Math.min(spokes.length - 1, Math.floor(q * spokes.length))]!.toFixed(0));

// A check, not a timing, for a whole flat depth (weight 1): every line of a branch sits in the plane through its
// core and root that holds its twist, further out than the root (its outward offset grows with depth), and
// siblings run along the slice in document order.
let offPlane = 0;
let inward = 0;
const reach = Math.max(...bodies.map((b) => Math.hypot(b.x!, b.y!, b.z!)));
let misordered = 0;
const vec = (b: Body): Vec3 => ({ x: b.x!, y: b.y!, z: b.z! });
const minus = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
for (const branch of branches) {
	if (branch.weight < 1) continue;
	const [root, core] = [vec(byId.get(branch.root)!), vec(byId.get(branch.core)!)];
	const r = minus(root, core);
	const len = Math.hypot(r.x, r.y, r.z) || 1;
	const u = { x: r.x / len, y: r.y / len, z: r.z / len };
	const v = twists.get(branch.root)!;
	const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
	for (const m of linesOf(branch)) {
		const d = minus(vec(byId.get(m.id)!), root);
		offPlane = Math.max(offPlane, Math.abs(dot(d, n)));
		if (dot(d, u) <= 0) inward++;
	}
	for (let i = 1; i < branch.lines.length; i++) {
		const [p, q] = [vec(byId.get(branch.lines[i - 1]!.id)!), vec(byId.get(branch.lines[i]!.id)!)];
		if (dot(minus(q, p), v) <= 0) misordered++;
	}
}
const mean = times.reduce((a, b) => a + b, 0) / times.length;
const members = branches.reduce((n, b) => n + linesOf(b).length, 0);
console.log(
	`flatten ${flatten} (flat depth ${flatDepth(flatten)}): ${bodies.length} nodes, ${links.length} edges, ${charge.size} charged, ` +
	`${branches.length} branches / ${members} members (setup ${setup.toFixed(1)} ms) · tick over ${TICKS}: mean ${mean.toFixed(2)} ms (flatten force ${flatMean.toFixed(2)} ms), ` +
	`median ${times[TICKS >> 1]!.toFixed(2)} ms, worst ${times[TICKS - 1]!.toFixed(2)} ms · off plane ≤ ${offPlane.toExponential(1)} · inward lines ${inward} · misordered siblings ${misordered} · farthest node ${reach.toFixed(0)}\n` +
	`  shape after ${SHAPE_TICKS} ticks: ${clashes} clashing plate pairs between sibling branches, ${clashing.size} of ${siblingPairs} sibling branch pairs clash; ${anyClashes} plate pairs clash in all (outside one branch) · root to core median ${pct(0.5)}, p90 ${pct(0.9)}, max ${pct(1)}`,
);
