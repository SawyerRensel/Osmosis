import { describe, expect, it } from "vitest";
import type { GraphModel, GraphNode } from "./model";
import type { OsmosisNode } from "../types";
import { nodeColor } from "./appearance";
import {
	DEFAULT_OVERLAYS,
	edgeShown,
	linkStrengthScale,
	memoryColor,
	memoryStrengths,
	mistFromSlider,
	nodeTags,
	normalizeOverlays,
	overlayNodeColor,
	sliderFromMist,
	sliderFromTravel,
	travelFromSlider,
	typeColor,
	visibleModel,
} from "./overlays";

const line = (id: string, path: string, source: Partial<OsmosisNode> = {}): GraphNode => ({
	id,
	kind: "line",
	label: id,
	path,
	source: { type: "bullet", ...source } as OsmosisNode,
});

describe("normalizeOverlays", () => {
	it("gives the defaults for nothing saved", () => {
		expect(normalizeOverlays(undefined)).toEqual(DEFAULT_OVERLAYS);
		expect(normalizeOverlays("junk")).toEqual(DEFAULT_OVERLAYS);
	});

	it("keeps valid fields and replaces malformed ones", () => {
		const overlays = normalizeOverlays({
			colorBy: "memory",
			edges: { tag: false, link: "no", unknown: false },
			forceBalance: 7,
			mist: Number.NaN,
			bloom: true,
			particles: 1,
			labels: "plates",
			travelSpeed: 2,
		});
		expect(overlays.travelSpeed).toBe(2);
		expect(overlays.colorBy).toBe("memory");
		expect(overlays.edges.tag).toBe(false);
		expect(overlays.edges.link).toBe(true);
		expect(overlays.edges).not.toHaveProperty("unknown");
		expect(overlays.forceBalance).toBe(1);
		expect(overlays.mist).toBe(1);
		// Bloom was removed: an old saved value loads and is dropped.
		expect(overlays).not.toHaveProperty("bloom");
		expect(overlays.particles).toBe(false);
		expect(overlays.labels).toBe("plates");
	});

	it("flattens moderately by default, for new and existing users, and clamps a saved flatten", () => {
		expect(normalizeOverlays({ forceBalance: 0.2 }).flatten).toBe(0.75);
		expect(normalizeOverlays({ flatten: 0 }).flatten).toBe(0);
		expect(normalizeOverlays({ flatten: 3 }).flatten).toBe(1);
		expect(normalizeOverlays({ flatten: "flat" }).flatten).toBe(0.75);
	});

	it("does not share the default edges object", () => {
		normalizeOverlays(undefined).edges.link = false;
		expect(DEFAULT_OVERLAYS.edges.link).toBe(true);
	});
});

describe("default overlays", () => {
	it("start with attachments off and everything else on", () => {
		expect(DEFAULT_OVERLAYS.edges.attachment).toBe(false);
		expect(Object.entries(DEFAULT_OVERLAYS.edges).filter(([, shown]) => !shown)).toEqual([["attachment", false]]);
	});
});

describe("visibleModel", () => {
	const core = (path: string): GraphNode => ({ id: `note:${path}`, kind: "note", label: path, path });
	const file = (path: string): GraphNode => ({ id: `file:${path}`, kind: "attachment", label: path, path });
	const ghost: GraphNode = { id: "ghost:Missing", kind: "ghost", label: "Missing" };
	const model: GraphModel = {
		nodes: [core("A.md"), line("l1", "A.md"), file("chart.png"), file("cover.png"), ghost],
		edges: [
			{ kind: "hierarchy", source: "note:A.md", target: "l1" },
			{ kind: "attachment", source: "l1", target: "file:chart.png" },
			{ kind: "attachment", source: "l1", target: "file:cover.png" },
			{ kind: "property", source: "note:A.md", target: "file:cover.png" },
			{ kind: "link", source: "l1", target: "ghost:Missing" },
		],
	};

	it("shows everything with attachments on", () => {
		expect(visibleModel(model, { ...DEFAULT_OVERLAYS.edges, attachment: true })).toBe(model);
	});

	it("drops an attachment only attachment edges reach, with its edges, and keeps one a property links to", () => {
		const shown = visibleModel(model, { ...DEFAULT_OVERLAYS.edges, attachment: false, unresolved: false });
		expect(shown.nodes.map((node) => node.id)).toEqual(["note:A.md", "l1", "file:cover.png", "ghost:Missing"]);
		expect(shown.edges.map((edge) => `${edge.kind}>${edge.target}`)).toEqual([
			"hierarchy>l1",
			"attachment>file:cover.png",
			"property>file:cover.png",
			"link>ghost:Missing",
		]);
	});
});

describe("edgeShown", () => {
	it("hides an edge whose kind is off, or that reaches a ghost while unresolved is off", () => {
		const edges = { ...DEFAULT_OVERLAYS.edges, embed: false, unresolved: false };
		expect(edgeShown("link", false, edges)).toBe(true);
		expect(edgeShown("embed", false, edges)).toBe(false);
		expect(edgeShown("link", true, edges)).toBe(false);
	});
});

describe("linkStrengthScale", () => {
	it("leaves every link at d3's default in the middle", () => {
		expect(linkStrengthScale("hierarchy", 0.5)).toBe(1);
		expect(linkStrengthScale("link", 0.5)).toBe(1);
	});

	it("loosens cross-note links toward hierarchy, and hierarchy toward organic, never past the floor", () => {
		expect(linkStrengthScale("hierarchy", 0)).toBe(1);
		expect(linkStrengthScale("embed", 0)).toBe(0.1);
		expect(linkStrengthScale("tag", 0.25)).toBe(0.5);
		expect(linkStrengthScale("hierarchy", 1)).toBe(0.1);
		expect(linkStrengthScale("link", 1)).toBe(1);
	});
});

describe("mist slider", () => {
	it("maps log₂ positions to multipliers and back", () => {
		expect(mistFromSlider(0)).toBe(1);
		expect(mistFromSlider(-2)).toBe(0.25);
		expect(sliderFromMist(4)).toBe(2);
	});
});

describe("travel speed", () => {
	it("defaults to 1 and clamps a saved value to 0.25-4", () => {
		expect(DEFAULT_OVERLAYS.travelSpeed).toBe(1);
		expect(normalizeOverlays({ travelSpeed: 100 }).travelSpeed).toBe(4);
		expect(normalizeOverlays({ travelSpeed: 0 }).travelSpeed).toBe(0.25);
		expect(normalizeOverlays({ travelSpeed: "fast" }).travelSpeed).toBe(1);
		expect(normalizeOverlays({ travelSpeed: Number.NaN }).travelSpeed).toBe(1);
	});

	it("maps log₂ slider positions to speeds and back", () => {
		expect(travelFromSlider(0)).toBe(1);
		expect(travelFromSlider(-2)).toBe(0.25);
		expect(travelFromSlider(2)).toBe(4);
		expect(sliderFromTravel(0.5)).toBe(-1);
	});
});

describe("memoryColor", () => {
	it("distinguishes no card, a new card, and a ramp from 50% to 100%", () => {
		expect(memoryColor(undefined)).toBe("hsl(0, 0%, 42%)");
		expect(memoryColor(null)).toBe("hsl(210, 70%, 62%)");
		expect(memoryColor(0.2)).toBe("hsl(0, 70%, 55%)");
		expect(memoryColor(0.75)).toBe("hsl(60, 70%, 55%)");
		expect(memoryColor(1)).toBe("hsl(120, 70%, 55%)");
	});
});

describe("typeColor", () => {
	it("colours lines by parse type and leaves hubs their own colour", () => {
		expect(typeColor(line("a", "n.md", { type: "heading" }))).not.toBe(typeColor(line("b", "n.md", { type: "bullet" })));
		const tag: GraphNode = { id: "tag:x", kind: "tag", label: "#x" };
		expect(typeColor(tag)).toBe(nodeColor(tag));
	});
});

describe("nodeTags", () => {
	const model: GraphModel = {
		nodes: [
			{ id: "note:a.md", kind: "note", label: "a", path: "a.md" },
			line("h", "a.md"),
			line("h1", "a.md"),
			line("h2", "a.md"),
			{ id: "note:b.md", kind: "note", label: "b", path: "b.md" },
			line("b1", "b.md"),
			{ id: "tag:crew", kind: "tag", label: "#crew" },
			{ id: "tag:boat", kind: "tag", label: "#boat" },
		],
		edges: [
			{ kind: "hierarchy", source: "note:a.md", target: "h" },
			{ kind: "hierarchy", source: "h", target: "h1" },
			{ kind: "hierarchy", source: "h", target: "h2" },
			{ kind: "hierarchy", source: "note:b.md", target: "b1" },
			{ kind: "tag", source: "note:a.md", target: "tag:boat" },
			{ kind: "tag", source: "h", target: "tag:crew" },
			{ kind: "tag", source: "h2", target: "tag:boat" },
		],
	};

	it("takes a node's own first tag, else the nearest tagged ancestor's", () => {
		const tags = nodeTags(model);
		expect(tags.get("note:a.md")).toBe("boat");
		expect(tags.get("h")).toBe("crew");
		expect(tags.get("h1")).toBe("crew");
		expect(tags.get("h2")).toBe("boat");
		expect(tags.get("tag:crew")).toBe("crew");
		expect(tags.has("b1")).toBe(false);
	});

	it("colours untagged nodes grey and tagged ones by tag", () => {
		const context = { tags: nodeTags(model), strengths: new Map() };
		const b1 = model.nodes.find((n) => n.id === "b1")!;
		const h1 = model.nodes.find((n) => n.id === "h1")!;
		const tagHub = model.nodes.find((n) => n.id === "tag:crew")!;
		expect(overlayNodeColor(b1, "tag", context)).toBe("hsl(0, 0%, 42%)");
		expect(overlayNodeColor(h1, "tag", context)).toBe(overlayNodeColor(tagHub, "tag", context));
	});
});

describe("memoryStrengths", () => {
	it("takes a line's weakest card, marks unreviewed cards null, and averages a note's reviewed lines", () => {
		const model: GraphModel = {
			nodes: [
				{ id: "note:a.md", kind: "note", label: "a", path: "a.md" },
				line("x", "a.md", { blockId: "os-x" }),
				line("y", "a.md", { blockId: "os-y" }),
				line("z", "a.md", { blockId: "os-z" }),
				line("plain", "a.md"),
				{ id: "note:b.md", kind: "note", label: "b", path: "b.md" },
			],
			edges: [],
		};
		const cards: Record<string, (number | null)[]> = { "os-x": [0.9, 0.6], "os-y": [1], "os-z": [null] };
		const strengths = memoryStrengths(model, (path, blockId) => (path === "a.md" ? cards[blockId] ?? [] : []));
		expect(strengths.get("x")).toBe(0.6);
		expect(strengths.get("y")).toBe(1);
		expect(strengths.get("z")).toBeNull();
		expect(strengths.has("plain")).toBe(false);
		expect(strengths.get("note:a.md")).toBeCloseTo(0.8);
		expect(strengths.has("note:b.md")).toBe(false);
	});
});
