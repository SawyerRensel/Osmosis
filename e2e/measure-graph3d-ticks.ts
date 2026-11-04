// Measures the 3D graph's d3 tick time on the stress web, headless, with the
// forces the scene sets up (`Graph3DScene`): plate-aware link distances, the
// many-body force limited as `settle.ts` limits it, no centring force, and,
// with a flatten slider position given, the flatten force
// (`src/graph3d/flatten.ts`).
//
//   node e2e/generate-graph3d-stress.mjs   # once, if e2e/fixtures/graph3d-stress/ is missing
//   npx esbuild e2e/measure-graph3d-ticks.ts --bundle --platform=node --format=esm --outfile=/tmp/osmosis-ticks.mjs
//   node /tmp/osmosis-ticks.mjs 0      # flatten off
//   node /tmp/osmosis-ticks.mjs 0.75   # the default flatten
//
// Every node starts free, as on first load. Plate sizes are estimated from
// label length (the scene measures them with its glyph atlas), so absolute
// numbers differ a little from the perf gauge's; compare runs of this script.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
import { OsmosisParser } from "../src/parser";
import { buildGraph, type GraphEdgeKind, type GraphNode, type LinkCacheLike } from "../src/graph3d/model";
import { placeNodes } from "../src/graph3d/positions";
import { chargeStrengths } from "../src/graph3d/settle";
import { linkDistance, nodeExtent, spriteLabel } from "../src/graph3d/appearance";
import { panelBoxEm } from "../src/graph3d/near";
import { branchOf, FlatLayouts, flatCharges, flatDepth, flattenStep, sameBranch } from "../src/graph3d/flatten";

const LINE_PLATE_HEIGHT = 5;
const CORE_PLATE_HEIGHT = 10;
const PLATE_HEIGHT_EM = 1.75;
const TICKS = 120;

const flatten = Number(process.argv[2] ?? "0");
const dir = join(process.cwd(), "e2e/fixtures/graph3d-stress");
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
const placed = placeNodes(model, new Map(), new Map([["Stress Hub.md", "Stress Hub.md"]]));
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
const of = branchOf(branches);
const charge = flatCharges(chargeStrengths(bodies.map((b) => ({ ...b, pinned: false })), -30), branches);
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
		.strength((l: Link) => (sameBranch(of, endId(l.source), endId(l.target)) ? 0 : 1 / Math.max(1, Math.min(degree.get(endId(l.source)) ?? 1, degree.get(endId(l.target)) ?? 1)))))
	.force("charge", limited)
	.stop();
if (branches.length > 0) sim.force("flatten", () => flattenStep(branches, (id) => byId.get(id), 0.6));

const times: number[] = [];
for (let i = 0; i < TICKS; i++) {
	const start = performance.now();
	sim.tick();
	times.push(performance.now() - start);
}
times.sort((a, b) => a - b);

// A check, not a timing: every free member sits in its branch's plane (normal from core to root), and siblings run top to bottom in document order.
let offPlane = 0;
const reach = Math.max(...bodies.map((b) => Math.hypot(b.x!, b.y!, b.z!)));
let misordered = 0;
for (const branch of branches) {
	const [root, core] = [byId.get(branch.root)!, byId.get(branch.core)!];
	const n = { x: root.x! - core.x!, y: root.y! - core.y!, z: root.z! - core.z! };
	const len = Math.hypot(n.x, n.y, n.z) || 1;
	for (const m of branch.members) {
		const b = byId.get(m.id)!;
		offPlane = Math.max(offPlane, Math.abs(((b.x! - root.x!) * n.x + (b.y! - root.y!) * n.y + (b.z! - root.z!) * n.z) / len));
	}
	for (let i = 1; i < branch.members.length; i++) if (branch.members[i]!.dx === branch.members[i - 1]!.dx && branch.members[i]!.dy <= branch.members[i - 1]!.dy) misordered++;
}
const mean = times.reduce((a, b) => a + b, 0) / times.length;
const members = branches.reduce((n, b) => n + b.members.length, 0);
console.log(
	`flatten ${flatten} (flat depth ${flatDepth(flatten)}): ${bodies.length} nodes, ${links.length} edges, ${charge.size} charged, ` +
	`${branches.length} branches / ${members} members (setup ${setup.toFixed(1)} ms) · tick over ${TICKS}: mean ${mean.toFixed(2)} ms, ` +
	`median ${times[TICKS >> 1]!.toFixed(2)} ms, worst ${times[TICKS - 1]!.toFixed(2)} ms · off plane ≤ ${offPlane.toExponential(1)} · misordered siblings ${misordered} · farthest node ${reach.toFixed(0)}`,
);
