import { describe, expect, it } from "vitest";
import type { Vault } from "obsidian";
import { generateExplicitCards } from "../card-gen/explicit";
import { fenceDiagrams, serializeOccludeBlock } from "../card-gen/occlusion";
import type { OcclusionSet } from "../database/types";
import {
	FENCES_FRONTMATTER_KEY,
	applyFenceEdits,
	fenceEntryFromContent,
	fenceOcclusionOverrides,
	injectFenceOcclusions,
	occlusionKey,
	parseFenceEntry,
	parseFencesFrontmatter,
} from "./fence-sidecar";
import { FenceWriter, readFenceOcclusions, type FenceNoteData } from "./FenceWriter";

const MAST: OcclusionSet = {
	mode: "hide-all-guess-one",
	shapes: [
		{ group: "c1", kind: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
		{ group: "c2", kind: "ellipse", x: 0.6, y: 0.5, rx: 0.1, ry: 0.05, rotation: 15 },
	],
	annotations: [{ x: 0.05, y: 0.9, w: 0.25, h: 0.14, text: "Mast: \"step\"" }],
};

const HULL: OcclusionSet = {
	mode: "hide-one-guess-one",
	shapes: [{ group: "c3", kind: "poly", points: [[0.1, 0.1], [0.5, 0.2], [0.3, 0.6]] }],
};

/** A fence with two labelled diagrams, shapes in the header, and a c1 schedule. */
const NOTE = [
	"# Rigging",
	"",
	"```osmosis",
	"id: rig1",
	...serializeOccludeBlock("a", MAST),
	...serializeOccludeBlock("b", HULL),
	"c1:",
	"  due: 2026-10-01T00:00:00.000Z",
	"  stability: 1.0000",
	"  difficulty: 4.0000",
	"  reps: 1",
	"  lapses: 0",
	"  state: review",
	"  lastReview: 2026-09-30T00:00:00.000Z",
	"  learningSteps: 0",
	"",
	"Name the parts of the rig.",
	"![[sloop-rig.png]]{a}",
	"![[sloop-hull.png]]{b}",
	"```",
	"",
].join("\n");

function fences(fm: Record<string, unknown>): Record<string, Record<string, unknown>> {
	return fm[FENCES_FRONTMATTER_KEY] as Record<string, Record<string, unknown>>;
}

describe("sidecar occlusion shapes", () => {
	it("extracts the header's shape sets into the entry, keyed as in the header", () => {
		const entry = fenceEntryFromContent(NOTE, "rig1");
		expect(Object.keys(entry).sort()).toEqual(["c1", occlusionKey("a"), occlusionKey("b")].sort());
		const overlay = parseFenceEntry(entry)!;
		expect(overlay.occlusions.get("a")).toEqual(MAST);
		expect(overlay.occlusions.get("b")).toEqual(HULL);
		expect(overlay.cards.get("c1")!.schedule!.reps).toBe(1);
	});

	it("reads the bare occlude key as the unlabelled embed", () => {
		const overlay = parseFenceEntry({ occlude: { mode: "hide-all-guess-one", shapes: [{ group: "c1", kind: "rect", x: 0, y: 0, w: 1, h: 1 }] } })!;
		expect([...overlay.occlusions.keys()]).toEqual([""]);
		expect(parseFenceEntry({})!.occlusions.size).toBe(0);
	});

	it("seeds a first sidecar write with the header's shapes, whatever the edit", () => {
		const fm: Record<string, unknown> = {};
		applyFenceEdits(fm, NOTE, [{ kind: "exclude", cardId: "rig1", exclude: true }]);
		const overlay = parseFenceEntry(fences(fm)["rig1"])!;
		expect(overlay.occlusions.get("a")).toEqual(MAST);
		expect(overlay.occlusions.get("b")).toEqual(HULL);
	});

	it("replaces one embed's set, and deletes it when no shapes are left", () => {
		const fm: Record<string, unknown> = {};
		const moved: OcclusionSet = { mode: "hide-all-guess-one", shapes: [{ group: "c1", kind: "rect", x: 0.4, y: 0.4, w: 0.2, h: 0.2 }] };
		applyFenceEdits(fm, NOTE, [{ kind: "occlusion", cardId: "rig1", label: "a", set: moved }]);
		let overlay = parseFenceEntry(fences(fm)["rig1"])!;
		expect(overlay.occlusions.get("a")).toEqual(moved);
		expect(overlay.occlusions.get("b")).toEqual(HULL);

		applyFenceEdits(fm, NOTE, [{ kind: "occlusion", cardId: "rig1", label: "b", set: { mode: "hide-one-guess-one", shapes: [] } }]);
		overlay = parseFenceEntry(fences(fm)["rig1"])!;
		expect(fences(fm)["rig1"]![occlusionKey("b")]).toBeUndefined();
		expect([...overlay.occlusions.keys()]).toEqual(["a"]);
		// The schedule seeded from the header rides along untouched.
		expect(overlay.cards.get("c1")!.schedule!.reps).toBe(1);
	});

	it("generates the same cards from sidecar shapes as from header shapes", () => {
		const fromHeader = generateExplicitCards(NOTE);
		const stripped = injectFenceOcclusions(NOTE, "rig1", new Map());
		expect(readFenceOcclusions(stripped, "rig1").size).toBe(0);

		const overlays = parseFencesFrontmatter({ rig1: fenceEntryFromContent(NOTE, "rig1") });
		const fromSidecar = generateExplicitCards(stripped, fenceOcclusionOverrides(overlays));
		expect(fromSidecar.map((card) => card.id)).toEqual(fromHeader.map((card) => card.id));
		expect(fromSidecar.map((card) => card.id)).toEqual(["rig1-c1", "rig1-c2", "rig1-c3"]);
		expect(fromSidecar.map((card) => card.occlusion)).toEqual(fromHeader.map((card) => card.occlusion));
	});

	it("ignores the header's shapes once the fence has an entry, even one without shapes", () => {
		const overlays = parseFencesFrontmatter({ rig1: {} });
		const cards = generateExplicitCards(NOTE, fenceOcclusionOverrides(overlays));
		expect(cards.filter((card) => card.card_type === "occlusion")).toEqual([]);
	});

	it("paints diagrams from given sets instead of the header's", () => {
		const body = NOTE.split("\n").slice(3, -2);
		const contentStart = body.indexOf("") + 1;
		expect(fenceDiagrams(body, contentStart).diagrams).toHaveLength(2);
		const only = fenceDiagrams(body, contentStart, new Map([["b", HULL]]));
		expect(only.diagrams.map((d) => d.image)).toEqual(["sloop-hull.png"]);
		expect(fenceDiagrams(body, contentStart, new Map()).diagrams).toEqual([]);
	});

	it("injects sets back into the header losslessly", () => {
		const stripped = injectFenceOcclusions(NOTE, "rig1", new Map());
		const back = injectFenceOcclusions(stripped, "rig1", new Map([["a", MAST], ["b", HULL]]));
		expect(readFenceOcclusions(back, "rig1")).toEqual(new Map([["a", MAST], ["b", HULL]]));
		expect(generateExplicitCards(back).map((card) => card.id)).toEqual(generateExplicitCards(NOTE).map((card) => card.id));
		// The schedule and the card's content are where they were.
		expect(back).toContain("c1:\n  due: 2026-10-01T00:00:00.000Z");
		expect(back).toContain("\n\nName the parts of the rig.");
		expect(injectFenceOcclusions(NOTE, "nope", new Map())).toBe(NOTE);
	});
});

describe("FenceWriter.writeOcclusion", () => {
	function makeHarness(mode: "note" | "sidecar") {
		const notePath = "sailing/rigging.md";
		const files = new Map<string, string>([[notePath, NOTE]]);
		const sidecar: Record<string, unknown> = {};
		const vault = {
			getFileByPath: (path: string) => (files.has(path) ? ({ path } as import("obsidian").TFile) : null),
			cachedRead: (file: { path: string }) => Promise.resolve(files.get(file.path)!),
			modify: (file: { path: string }, data: string) => {
				files.set(file.path, data);
				return Promise.resolve();
			},
		};
		const noteData: FenceNoteData = {
			modeOf: () => mode,
			process: (_file, fn) => {
				fn(sidecar);
				return Promise.resolve();
			},
		};
		const writer = new FenceWriter(vault as unknown as Vault, noteData);
		return { writer, file: { path: notePath } as import("obsidian").TFile, files, notePath, sidecar };
	}

	const NEW_SET: OcclusionSet = { mode: "hide-all-guess-one", shapes: [{ group: "c4", kind: "rect", x: 0.7, y: 0.7, w: 0.1, h: 0.1 }] };

	it("writes shapes to the sidecar entry and leaves the note byte-for-byte in sidecar mode", async () => {
		const h = makeHarness("sidecar");
		await h.writer.writeOcclusion(h.file, "rig1", "b", NEW_SET);
		expect(h.files.get(h.notePath)).toBe(NOTE);
		const overlay = parseFencesFrontmatter(h.sidecar[FENCES_FRONTMATTER_KEY]).get("rig1")!;
		expect(overlay.occlusions.get("b")).toEqual(NEW_SET);
		expect(overlay.occlusions.get("a")).toEqual(MAST);
	});

	it("keeps writing shapes into the fence header in note mode", async () => {
		const h = makeHarness("note");
		await h.writer.writeOcclusion(h.file, "rig1", "b", NEW_SET);
		expect(h.sidecar[FENCES_FRONTMATTER_KEY]).toBeUndefined();
		expect(readFenceOcclusions(h.files.get(h.notePath)!, "rig1").get("b")).toEqual(NEW_SET);
	});
});
