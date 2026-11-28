import { describe, expect, it } from "vitest";
import type { GraphModel, GraphNode } from "./model";
import type { OsmosisNode } from "../types";
import { nodeColor } from "./appearance";
import { TAPER_STRENGTH_MAX } from "./taper";
import { MAX_CORE_LAYERS } from "./planets";
import {
	DEFAULT_OVERLAYS,
	edgeShown,
	linkPulls,
	linkStrengthScale,
	memoryColor,
	memoryStrengths,
	mistFromSlider,
	modelKey,
	nodeTags,
	continentStyleChanged,
	SPACING_MAX,
	SPACING_MIN,
	normalizeOverlays,
	spacingChanged,
	coreLayersChanged,
	spacingOf,
	overlayNodeColor,
	pullChanged,
	sliderFromMist,
	sliderFromTravel,
	soleNotePath,
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

	it("colours by Mind map style by default, and keeps a saved mode", () => {
		expect(DEFAULT_OVERLAYS.colorBy).toBe("style");
		expect(normalizeOverlays({ colorBy: "style" }).colorBy).toBe("style");
		expect(normalizeOverlays({ colorBy: "note" }).colorBy).toBe("note");
		expect(normalizeOverlays({ colorBy: "theme" }).colorBy).toBe("style");
	});

	it("tapers hierarchy edges by default, and clamps the taper strength", () => {
		expect(normalizeOverlays({}).taper).toBe(true);
		expect(normalizeOverlays({ taper: false }).taper).toBe(false);
		expect(normalizeOverlays({ taper: "no" }).taper).toBe(true);
		expect(normalizeOverlays({ taperStrength: 1.5 }).taperStrength).toBe(1.5);
		expect(normalizeOverlays({ taperStrength: 9 }).taperStrength).toBe(TAPER_STRENGTH_MAX);
		expect(normalizeOverlays({ taperStrength: "x" }).taperStrength).toBe(1);
	});

	it("reads the Layout choice, taking the removed Flat slices layout as organic", () => {
		expect(normalizeOverlays({}).layout).toBe("organic");
		expect(normalizeOverlays({ layout: "planets" }).layout).toBe("planets");
		expect(normalizeOverlays({ layout: "globe" }).layout).toBe("organic");
		const flat = normalizeOverlays({ layout: "flat", flatten: 0.75 });
		expect(flat.layout).toBe("organic");
		expect("flatten" in flat).toBe(false);
	});

	it("reads the continent defaults, falling back on junk", () => {
		expect(normalizeOverlays({}).continentDirection).toBe("left-right");
		expect(normalizeOverlays({}).continentBalance).toBe("one-side");
		const set = normalizeOverlays({ continentDirection: "radial", continentBalance: "alternating" });
		expect([set.continentDirection, set.continentBalance]).toEqual(["radial", "alternating"]);
		const junk = normalizeOverlays({ continentDirection: "spiral", continentBalance: 3 });
		expect([junk.continentDirection, junk.continentBalance]).toEqual(["left-right", "one-side"]);
	});

	it("says a continent default changed only while Planets is the layout", () => {
		const planets = { layout: "planets" as const, continentDirection: "left-right" as const, continentBalance: "one-side" as const };
		expect(continentStyleChanged(planets, { ...planets, continentDirection: "radial" })).toBe(true);
		expect(continentStyleChanged(planets, { ...planets, continentBalance: "both-sides" })).toBe(true);
		expect(continentStyleChanged(planets, planets)).toBe(false);
		expect(continentStyleChanged(planets, { ...planets, continentDirection: "radial", layout: "organic" })).toBe(false);
	});

	it("pulls links by default, for new and existing users", () => {
		expect(DEFAULT_OVERLAYS.linksPull).toBe(true);
		expect(normalizeOverlays({ forceBalance: 0.2 }).linksPull).toBe(true);
		expect(normalizeOverlays({ linksPull: false }).linksPull).toBe(false);
		expect(normalizeOverlays({ linksPull: "no" }).linksPull).toBe(true);
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
		nodes: [core("A.md"), line("l1", "A.md"), file("chart.png"), file("cover.png"), ghost, { id: "tag:sailing", kind: "tag", label: "#sailing" }],
		edges: [
			{ kind: "hierarchy", source: "note:A.md", target: "l1" },
			{ kind: "attachment", source: "l1", target: "file:chart.png" },
			{ kind: "attachment", source: "l1", target: "file:cover.png" },
			{ kind: "property", source: "note:A.md", target: "file:cover.png" },
			{ kind: "link", source: "l1", target: "ghost:Missing" },
			{ kind: "tag", source: "note:A.md", target: "tag:sailing" },
		],
	};

	it("shows everything with every owning toggle on", () => {
		expect(visibleModel(model, { ...DEFAULT_OVERLAYS.edges, attachment: true })).toBe(model);
	});

	it("drops an attachment only attachment edges reach, with its edges, and keeps one a property links to", () => {
		const shown = visibleModel(model, { ...DEFAULT_OVERLAYS.edges, attachment: false });
		expect(shown.nodes.map((node) => node.id)).toEqual(["note:A.md", "l1", "file:cover.png", "ghost:Missing", "tag:sailing"]);
		expect(shown.edges.map((edge) => `${edge.kind}>${edge.target}`)).toEqual([
			"hierarchy>l1",
			"attachment>file:cover.png",
			"property>file:cover.png",
			"link>ghost:Missing",
			"tag>tag:sailing",
		]);
	});

	it("drops an attachment a property reaches too once properties are off", () => {
		const shown = visibleModel(model, { ...DEFAULT_OVERLAYS.edges, attachment: false, property: false });
		expect(shown.nodes.map((node) => node.id)).not.toContain("file:cover.png");
	});

	it("drops the tag hubs, with their edges, with Tags off", () => {
		const shown = visibleModel(model, { ...DEFAULT_OVERLAYS.edges, attachment: true, tag: false });
		expect(shown.nodes.map((node) => node.id)).not.toContain("tag:sailing");
		expect(shown.edges.some((edge) => edge.kind === "tag")).toBe(false);
		expect(shown.nodes).toHaveLength(model.nodes.length - 1);
	});

	it("drops the ghosts, with their edges, with Unresolved links off", () => {
		const shown = visibleModel(model, { ...DEFAULT_OVERLAYS.edges, attachment: true, unresolved: false });
		expect(shown.nodes.map((node) => node.id)).not.toContain("ghost:Missing");
		expect(shown.edges.map((edge) => edge.target)).not.toContain("ghost:Missing");
		expect(shown.edges).toHaveLength(model.edges.length - 1);
	});

	it("keeps a hub another shown edge reaches", () => {
		const reached: GraphModel = {
			nodes: [...model.nodes, { id: "tag:other", kind: "tag", label: "other" }],
			edges: [...model.edges, { kind: "link", source: "l1", target: "tag:other" }],
		};
		expect(visibleModel(reached, { ...DEFAULT_OVERLAYS.edges, attachment: true, tag: false }).nodes.map((node) => node.id)).toContain("tag:other");
	});
});

describe("modelKey", () => {
	it("changes only with the toggles that add or remove plates", () => {
		const base = modelKey(DEFAULT_OVERLAYS.edges);
		expect(modelKey({ ...DEFAULT_OVERLAYS.edges, link: false, hierarchy: false })).toBe(base);
		for (const kind of ["attachment", "tag", "unresolved"] as const) expect(modelKey({ ...DEFAULT_OVERLAYS.edges, [kind]: !DEFAULT_OVERLAYS.edges[kind] })).not.toBe(base);
	});
});

describe("linkPulls", () => {
	const on = { edges: DEFAULT_OVERLAYS.edges, linksPull: true };

	it("pulls every shown kind", () => {
		for (const kind of ["hierarchy", "link", "embed", "property", "tag"] as const) expect(linkPulls(kind, false, on)).toBe(true);
	});

	it("stops pulling a kind that is hidden, and links into ghosts while Unresolved is off", () => {
		for (const kind of ["link", "embed", "property", "tag", "attachment"] as const) {
			expect(linkPulls(kind, false, { ...on, edges: { ...on.edges, [kind]: false } })).toBe(false);
		}
		expect(linkPulls("link", true, { ...on, edges: { ...on.edges, unresolved: false } })).toBe(false);
		expect(linkPulls("link", false, { ...on, edges: { ...on.edges, unresolved: false } })).toBe(true);
	});

	it("keeps pulling hierarchy with its toggle off: that one only hides the drawing", () => {
		expect(linkPulls("hierarchy", false, { ...on, edges: { ...on.edges, hierarchy: false } })).toBe(true);
	});

	it("stops pulling links, ghost targets included, with Links pull off, and leaves other kinds alone", () => {
		const off = { ...on, linksPull: false };
		expect(linkPulls("link", false, off)).toBe(false);
		expect(linkPulls("link", true, off)).toBe(false);
		expect(linkPulls("embed", false, off)).toBe(true);
		expect(linkPulls("hierarchy", false, off)).toBe(true);
	});
});

describe("pullChanged", () => {
	const on = { edges: DEFAULT_OVERLAYS.edges, linksPull: true };

	it("is true when an edge kind other than hierarchy, or Links pull, is toggled", () => {
		expect(pullChanged(on, { ...on, edges: { ...on.edges, tag: false } })).toBe(true);
		expect(pullChanged(on, { ...on, edges: { ...on.edges, unresolved: false } })).toBe(true);
		expect(pullChanged(on, { ...on, edges: { ...on.edges, attachment: true } })).toBe(true);
		expect(pullChanged(on, { ...on, linksPull: false })).toBe(true);
	});

	it("is false for the Hierarchy toggle and for nothing changing", () => {
		expect(pullChanged(on, { ...on, edges: { ...on.edges, hierarchy: false } })).toBe(false);
		expect(pullChanged(on, { ...on })).toBe(false);
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

	it("gives a sole H1 root its note's mean, unless the H1 has a card of its own", () => {
		const model: GraphModel = {
			nodes: [
				{ ...line("note:a.md", "a.md"), root: true },
				line("x", "a.md", { blockId: "os-x" }),
				{ ...line("note:b.md", "b.md", { blockId: "os-b" }), root: true },
				line("y", "b.md", { blockId: "os-y" }),
			],
			edges: [],
		};
		const cards: Record<string, number[]> = { "os-x": [0.4], "os-b": [0.9], "os-y": [0.1] };
		const strengths = memoryStrengths(model, (_path, blockId) => cards[blockId] ?? []);
		expect(strengths.get("note:a.md")).toBe(0.4);
		expect(strengths.get("note:b.md")).toBe(0.9);
	});
});

describe("spacing sliders", () => {
	it("default to x1 and read back, clamped to x0.5 to x3", () => {
		expect(DEFAULT_OVERLAYS.noteSpacing).toBe(1);
		expect(DEFAULT_OVERLAYS.nodeSpacing).toBe(1);
		expect(normalizeOverlays({}).noteSpacing).toBe(1);
		expect(normalizeOverlays({}).nodeSpacing).toBe(1);
		expect(normalizeOverlays({ noteSpacing: 2, nodeSpacing: 1.5 })).toMatchObject({ noteSpacing: 2, nodeSpacing: 1.5 });
		expect(normalizeOverlays({ noteSpacing: 10, nodeSpacing: 0 })).toMatchObject({ noteSpacing: SPACING_MAX, nodeSpacing: SPACING_MIN });
		expect(normalizeOverlays({ noteSpacing: -4 }).noteSpacing).toBe(SPACING_MIN);
		expect(SPACING_MIN).toBe(0.5);
		expect(SPACING_MAX).toBe(3);
	});

	it("takes the default for anything that is not a finite number", () => {
		expect(normalizeOverlays({ noteSpacing: "wide", nodeSpacing: Number.NaN })).toMatchObject({ noteSpacing: 1, nodeSpacing: 1 });
		expect(normalizeOverlays({ noteSpacing: Infinity }).noteSpacing).toBe(1);
		expect(normalizeOverlays({ continentSpacing: "wide" }).continentSpacing).toBe(1);
	});

	it("reads Continent spacing back at x1 by default, clamped to x0.5 to x3", () => {
		expect(DEFAULT_OVERLAYS.continentSpacing).toBe(1);
		expect(normalizeOverlays({}).continentSpacing).toBe(1);
		expect(normalizeOverlays({ continentSpacing: 2.25 }).continentSpacing).toBe(2.25);
		expect(normalizeOverlays({ continentSpacing: 9 }).continentSpacing).toBe(SPACING_MAX);
		expect(normalizeOverlays({ continentSpacing: 0.1 }).continentSpacing).toBe(SPACING_MIN);
	});

	it("tells when either moved, and hands the layout both", () => {
		const same = { noteSpacing: 1, nodeSpacing: 1, continentSpacing: 1, layout: "organic" as const };
		expect(spacingChanged(same, { ...same })).toBe(false);
		expect(spacingChanged(same, { ...same, noteSpacing: 1.5 })).toBe(true);
		expect(spacingChanged(same, { ...same, nodeSpacing: 2 })).toBe(true);
		// Continent spacing shapes Planets only.
		expect(spacingChanged(same, { ...same, continentSpacing: 2 })).toBe(false);
		expect(spacingChanged(same, { ...same, continentSpacing: 2, layout: "planets" })).toBe(true);
		expect(spacingOf({ noteSpacing: 2, nodeSpacing: 3 })).toEqual({ note: 2, node: 3 });
	});
});

describe("core layers", () => {
	it("defaults to one layer and reads back a whole number of layers in range", () => {
		expect(DEFAULT_OVERLAYS.coreLayers).toBe(1);
		expect(normalizeOverlays({}).coreLayers).toBe(1);
		expect(normalizeOverlays({ coreLayers: "many" }).coreLayers).toBe(1);
		expect(normalizeOverlays({ coreLayers: 3 }).coreLayers).toBe(3);
		expect(normalizeOverlays({ coreLayers: 2.6 }).coreLayers).toBe(3);
		expect(normalizeOverlays({ coreLayers: 40 }).coreLayers).toBe(MAX_CORE_LAYERS);
		expect(normalizeOverlays({ coreLayers: 0 }).coreLayers).toBe(1);
	});

	it("counts as a change only in Planets", () => {
		expect(coreLayersChanged({ coreLayers: 1 }, { layout: "planets", coreLayers: 3 })).toBe(true);
		expect(coreLayersChanged({ coreLayers: 3 }, { layout: "planets", coreLayers: 3 })).toBe(false);
		expect(coreLayersChanged({ coreLayers: 1 }, { layout: "organic", coreLayers: 3 })).toBe(false);
	});
});

describe("soleNotePath", () => {
	const core = (path: string): GraphNode => ({ id: `note:${path}`, kind: "note", label: path, path });

	it("is the note a scene of one note shows, its tags and attachments aside", () => {
		expect(soleNotePath([core("a.md"), line("a1", "a.md"), { id: "tag:#knots", kind: "tag", label: "#knots" }, { id: "att:chart.png", kind: "attachment", label: "chart", path: "chart.png" }])).toBe("a.md");
		// A sole-H1 note has no core: its lines alone name it.
		expect(soleNotePath([line("a1", "a.md")])).toBe("a.md");
	});

	it("is null for several notes, or none", () => {
		expect(soleNotePath([core("a.md"), line("b1", "b.md")])).toBeNull();
		expect(soleNotePath([])).toBeNull();
	});
});

describe("overlayNodeColor in Mind map style", () => {
	it("takes the note's hue, as the Note mode does", () => {
		const node = line("a1", "a.md");
		const context = { tags: new Map<string, string>(), strengths: new Map<string, number | null>() };
		expect(overlayNodeColor(node, "style", context)).toBe(nodeColor(node));
	});
});
