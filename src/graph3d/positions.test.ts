import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { buildGraph, noteNodeId, tagNodeId, type GraphModel, type LinkResolver } from "./model";
import { placeNodes, type Placed } from "./positions";

const parser = new OsmosisParser();
const noLinks: LinkResolver = () => null;

const RIGGING = ["# Rigging", "- Halyards ^halyard", "  - Main halyard", "- Sheets"].join("\n");
const KNOTS = ["# Knots", "- Bowline", "- Cleat hitch"].join("\n");

function model(...notes: [path: string, md: string][]): GraphModel {
	return buildGraph(notes.map(([path, md]) => ({ tree: parser.parse(md, path), cache: { tags: [] } })), noLinks);
}

function id(graph: GraphModel, label: string): string {
	const node = graph.nodes.find((n) => n.label === label);
	if (node === undefined) throw new Error(`no node "${label}"`);
	return node.id;
}

function distance(a: Placed, b: Placed): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe("placeNodes", () => {
	it("seeds a first note free, its lines near their parents", () => {
		const graph = model(["Rigging.md", RIGGING]);
		const placed = placeNodes(graph, new Map(), new Map());
		expect([...placed.values()].every((p) => !p.pinned)).toBe(true);
		const halyards = placed.get(id(graph, "Halyards"));
		const main = placed.get(id(graph, "Main halyard"));
		expect(distance(halyards as Placed, main as Placed)).toBeCloseTo(10);
	});

	it("keeps nodes already in the scene where they are", () => {
		const graph = model(["Rigging.md", RIGGING]);
		const core = noteNodeId("Rigging.md");
		const current = new Map<string, Placed>([[core, { x: 5, y: 6, z: 7, pinned: false }]]);
		expect(placeNodes(graph, current, new Map()).get(core)).toEqual({ x: 5, y: 6, z: 7, pinned: false });
	});

	it("seeds a new note beside the note that pulled it in", () => {
		const graph = model(["Rigging.md", RIGGING], ["Knots.md", KNOTS]);
		const rigging = noteNodeId("Rigging.md");
		const current = new Map<string, Placed>([[rigging, { x: 500, y: 0, z: 0, pinned: true }]]);
		const placed = placeNodes(graph, current, new Map([["Knots.md", "Rigging.md"]]));
		const knots = placed.get(noteNodeId("Knots.md")) as Placed;
		expect(knots.pinned).toBe(false);
		expect(distance(knots, current.get(rigging) as Placed)).toBeCloseTo(120);
	});

	it("moves only an edited line, which re-settles near its parent", () => {
		const before = model(["Rigging.md", RIGGING]);
		const current = new Map<string, Placed>(before.nodes.map((n, i) => [n.id, { x: 100 + i * 10, y: i, z: -i, pinned: true }]));
		const after = model(["Rigging.md", RIGGING.replace("Main halyard", "Peak halyard")]);
		const placed = placeNodes(after, current, new Map());

		const edited = placed.get(id(after, "Peak halyard")) as Placed;
		const parent = placed.get(id(after, "Halyards")) as Placed;
		expect(edited.pinned).toBe(false);
		expect(distance(edited, parent)).toBeCloseTo(10);
		const others = after.nodes.filter((n) => n.label !== "Peak halyard");
		for (const n of others) expect(placed.get(n.id)).toEqual(current.get(n.id));
	});

	it("seeds a new hub beside a neighbour", () => {
		const graph: GraphModel = {
			nodes: [
				{ id: "note:A.md", kind: "note", label: "A", path: "A.md" },
				{ id: tagNodeId("sail"), kind: "tag", label: "#sail" },
			],
			edges: [{ kind: "tag", source: "note:A.md", target: tagNodeId("sail") }],
		};
		const current = new Map<string, Placed>([["note:A.md", { x: 50, y: 0, z: 0, pinned: true }]]);
		const sail = placeNodes(graph, current, new Map()).get(tagNodeId("sail")) as Placed;
		expect(sail.pinned).toBe(false);
		expect(distance(sail, { x: 50, y: 0, z: 0, pinned: true })).toBeCloseTo(10);
	});
});
