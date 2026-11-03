import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { computeLayout } from "../layout";
import { buildGraph, noteNodeId } from "./model";
import { frameDistance, landingChain, landingZoom, liftOffFocus, liftOffFrame, liftOffScale, liftOffSeeds, mapLineHeight, readLanding, readLiftOff, type LiftOff, type MapBox } from "./liftoff";

const parser = new OsmosisParser();
const note = "# Passage plan\n\n- Leave on the ebb\n\t- Clear the bar by noon\n- Anchor in the bay\n";
const tree = parser.parse(note, "Passage.md");
const model = buildGraph([{ tree, cache: null }], () => null);
const PLATE = 5;

/** The map's boxes for `note`, as `MindMapView.switchTo3D` builds them from `computeLayout`. */
function boxesOf(): MapBox[] {
	return computeLayout(tree).nodes.map((n) => ({
		path: "Passage.md",
		start: n.source.range.start,
		root: n.source.type === "root",
		x: n.rect.x,
		y: n.rect.y,
		width: n.rect.width,
		height: n.rect.height,
	}));
}

const lineId = (text: string): string => model.nodes.find((n) => n.kind === "line" && n.label.includes(text))!.id;

describe("mapLineHeight", () => {
	it("is the median box height, leaving out the root", () => {
		expect(mapLineHeight([{ height: 0, root: true }, { height: 28 }, { height: 28 }, { height: 90 }])).toBe(28);
		expect(mapLineHeight([{ height: 20 }, { height: 30 }])).toBe(25);
	});

	it("falls back to the layout's default node height", () => {
		expect(mapLineHeight([])).toBe(28);
		expect(mapLineHeight([{ height: 0, root: true }])).toBe(28);
	});
});

describe("liftOffSeeds", () => {
	const boxes = boxesOf();
	const viewport = { x: 0, y: 0, w: 800, h: 600 };
	const liftOff: LiftOff = { boxes, viewport, focus: null };
	const seeds = liftOffSeeds(model, liftOff, PLATE, () => 0.5);
	const scale = liftOffScale(boxes, PLATE);

	it("seeds every line the map drew, and the note's core", () => {
		const lines = model.nodes.filter((n) => n.kind === "line").map((n) => n.id);
		expect([...seeds.keys()].sort()).toEqual([...lines, noteNodeId("Passage.md")].sort());
	});

	it("keeps the map's picture: centred on the viewport, scaled to plate height, y flipped", () => {
		const box = boxes.find((b) => b.start === note.indexOf("- Leave"))!;
		const seed = seeds.get(lineId("Leave on the ebb"))!;
		expect(seed.x).toBeCloseTo((box.x + box.width / 2 - 400) * scale);
		expect(seed.y).toBeCloseTo(-(box.y + box.height / 2 - 300) * scale);
		// A child is right of its parent, and the later sibling below the earlier one, as on the map.
		expect(seeds.get(lineId("Clear the bar"))!.x).toBeGreaterThan(seed.x);
		expect(seeds.get(lineId("Anchor in the bay"))!.y).toBeLessThan(seed.y);
	});

	it("lays lines flat at z = 0, give or take a hair, and free", () => {
		const jittered = liftOffSeeds(model, liftOff, PLATE, () => 1);
		for (const id of model.nodes.filter((n) => n.kind === "line").map((n) => n.id)) {
			expect(seeds.get(id)!.z).toBe(0);
			expect(Math.abs(jittered.get(id)!.z)).toBeLessThanOrEqual(PLATE);
			expect(seeds.get(id)!.pinned).toBe(false);
		}
	});

	it("puts the note's core behind the map", () => {
		expect(seeds.get(noteNodeId("Passage.md"))!.z).toBeLessThan(-PLATE);
	});

	it("scales a line's box to a line plate", () => {
		expect(mapLineHeight(boxes) * scale).toBeCloseTo(PLATE);
	});

	it("skips boxes the model has no node for (another note, a stale offset)", () => {
		const stray: MapBox = { path: "Elsewhere.md", start: 0, root: false, x: 0, y: 0, width: 50, height: 28 };
		const moved: MapBox = { ...boxes[1]!, start: 9999 };
		expect(liftOffSeeds(model, { ...liftOff, boxes: [stray, moved] }, PLATE).size).toBe(0);
	});
});

describe("liftOffFocus", () => {
	const boxes = boxesOf();
	const viewport = { x: 0, y: 0, w: 800, h: 600 };

	it("finds the selected line by its note and start", () => {
		const focus = { path: "Passage.md", start: note.indexOf("\t- Clear"), root: false };
		expect(liftOffFocus(model, { boxes, viewport, focus })).toBe(lineId("Clear the bar"));
	});

	it("finds the note, or nothing", () => {
		expect(liftOffFocus(model, { boxes, viewport, focus: { path: "Passage.md", start: 0, root: true } })).toBe(noteNodeId("Passage.md"));
		expect(liftOffFocus(model, { boxes, viewport, focus: null })).toBeNull();
		expect(liftOffFocus(model, { boxes, viewport, focus: { path: "Passage.md", start: 3, root: false } })).toBeNull();
	});
});

describe("camera hand-over", () => {
	it("frames the viewport's height, scaled to the world", () => {
		const boxes: MapBox[] = [{ path: "a.md", start: 0, root: false, x: 0, y: 0, width: 100, height: 20 }];
		expect(liftOffFrame({ boxes, viewport: { x: 0, y: 0, w: 900, h: 400 }, focus: null }, PLATE)).toBeCloseTo(100);
	});

	it("stands far enough back to see that height edge to edge", () => {
		expect(frameDistance(100, 90)).toBeCloseTo(50);
		expect(frameDistance(200, 60)).toBeCloseTo(100 / Math.tan(Math.PI / 6));
	});

	it("lands at the zoom that draws a line as tall as the plate was, within the map's limits", () => {
		const lines = [{ height: 28 }, { height: 28 }];
		expect(landingZoom(56, lines, 0.1, 5)).toBeCloseTo(2);
		expect(landingZoom(1, lines, 0.1, 5)).toBe(0.1);
		expect(landingZoom(1000, lines, 0.1, 5)).toBe(5);
	});

	it("round-trips: a map lifted off and landed again comes back at its zoom", () => {
		// A map at zoom z draws a 28-unit line 28·z px tall; lifted, that line is a plate seen at the same size.
		const zoom = 1.6;
		expect(landingZoom(28 * zoom, [{ height: 28 }], 0.1, 5)).toBeCloseTo(zoom);
	});
});

describe("reading hand-overs back from view state", () => {
	const valid = {
		boxes: [{ path: "a.md", start: 4, root: false, x: 1, y: 2, width: 3, height: 4 }, { path: "a.md", start: "x" }],
		viewport: { x: 0, y: 0, w: 10, h: 20 },
		focus: { path: "a.md", start: 4 },
	};

	it("reads a lift-off, dropping malformed boxes", () => {
		expect(readLiftOff(valid)).toEqual({
			boxes: [{ path: "a.md", start: 4, root: false, x: 1, y: 2, width: 3, height: 4 }],
			viewport: { x: 0, y: 0, w: 10, h: 20 },
			focus: { path: "a.md", start: 4, root: false },
		});
	});

	it("refuses one with no usable viewport, or none at all", () => {
		expect(readLiftOff(undefined)).toBeNull();
		expect(readLiftOff({ ...valid, viewport: { x: 0, y: 0, w: 10, h: 0 } })).toBeNull();
		expect(readLiftOff({ ...valid, boxes: "no" })).toBeNull();
	});

	it("reads a landing", () => {
		expect(readLanding({ focus: { path: "a.md", start: 0, root: true }, platePx: 12 })).toEqual({ focus: { path: "a.md", start: 0, root: true }, platePx: 12 });
		expect(readLanding({ focus: null, platePx: -1 })).toEqual({ focus: null, platePx: null });
		expect(readLanding(null)).toBeNull();
	});
});

describe("landingChain", () => {
	it("is the focused line and its ancestors, root first", () => {
		const chain = landingChain(tree.root, "Passage.md", { path: "Passage.md", start: note.indexOf("\t- Clear"), root: false });
		expect(chain.map((n) => n.content)).toEqual(["", "Passage plan", "Leave on the ebb", "Clear the bar by noon"]);
	});

	it("is empty for a note, another note's line, or a line that moved", () => {
		const start = note.indexOf("- Anchor");
		expect(landingChain(tree.root, "Passage.md", { path: "Passage.md", start: 0, root: true })).toEqual([]);
		expect(landingChain(tree.root, "Passage.md", { path: "Other.md", start, root: false })).toEqual([]);
		expect(landingChain(tree.root, "Passage.md", { path: "Passage.md", start: start + 1, root: false })).toEqual([]);
		expect(landingChain(tree.root, "Passage.md", null)).toEqual([]);
	});
});
