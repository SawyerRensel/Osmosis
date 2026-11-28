import { describe, it, expect } from "vitest";
import { computeHorizon, diffLoaded, noteAdjacency, withBacklinkers, withEmbedded, type ResolvedLinks } from "./horizon";

/** A chain A → B → C → D → E, linked forward only. */
const CHAIN: ResolvedLinks = {
	"A.md": { "B.md": 1 },
	"B.md": { "C.md": 2 },
	"C.md": { "D.md": 1 },
	"D.md": { "E.md": 1 },
	"E.md": {},
};

describe("computeHorizon", () => {
	it("loads notes within depth and prefetches the next ring", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "A.md", 2, true);
		expect([...horizon.loaded]).toEqual(["A.md", "B.md", "C.md"]);
		expect([...horizon.prefetch]).toEqual(["D.md"]);
		expect(horizon.hops.get("C.md")).toBe(2);
		expect(horizon.hops.get("D.md")).toBe(3);
		expect(horizon.hops.has("E.md")).toBe(false);
	});

	it("records the nearer note that reached each note", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "B.md", 2, true);
		expect(horizon.via.get("A.md")).toBe("B.md");
		expect(horizon.via.get("D.md")).toBe("C.md");
		expect(horizon.via.has("B.md")).toBe(false);
	});

	it("follows only outgoing links without backlinks", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "C.md", 1, false);
		expect([...horizon.loaded]).toEqual(["C.md", "D.md"]);
		expect([...horizon.prefetch]).toEqual(["E.md"]);
		expect(horizon.hops.has("B.md")).toBe(false);
	});

	it("keeps a note that links back when the focus also links to it", () => {
		const links: ResolvedLinks = { "A.md": { "B.md": 1 }, "B.md": { "A.md": 1 }, "Fan.md": { "A.md": 1 } };
		const horizon = computeHorizon(noteAdjacency(links), "A.md", 2, false);
		expect([...horizon.loaded]).toEqual(["A.md", "B.md"]);
	});

	it("counts backlinks as hops when they are on", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "C.md", 1, true);
		expect([...horizon.loaded].sort()).toEqual(["B.md", "C.md", "D.md"]);
		expect([...horizon.prefetch].sort()).toEqual(["A.md", "E.md"]);
	});

	it("takes the shortest distance when paths of different lengths meet", () => {
		const links: ResolvedLinks = { "A.md": { "B.md": 1, "C.md": 1 }, "B.md": { "C.md": 1 } };
		expect(computeHorizon(noteAdjacency(links), "A.md", 2, true).hops.get("C.md")).toBe(1);
	});

	it("survives cycles and self-links", () => {
		const links: ResolvedLinks = { "A.md": { "A.md": 1, "B.md": 1 }, "B.md": { "A.md": 1 } };
		const horizon = computeHorizon(noteAdjacency(links), "A.md", 3, true);
		expect([...horizon.loaded]).toEqual(["A.md", "B.md"]);
		expect(horizon.prefetch.size).toBe(0);
	});

	it("loads only the focus at depth 0, prefetching its neighbours", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "B.md", 0, true);
		expect([...horizon.loaded]).toEqual(["B.md"]);
		expect([...horizon.prefetch].sort()).toEqual(["A.md", "C.md"]);
	});

	it("loads an unlinked focus on its own", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "Lonely.md", 2, true);
		expect([...horizon.loaded]).toEqual(["Lonely.md"]);
		expect(horizon.prefetch.size).toBe(0);
	});

	it("does not hop through an attachment shared by two notes", () => {
		const links: ResolvedLinks = {
			"A.md": { "deck-plan.svg": 1 },
			"Far.md": { "deck-plan.svg": 1 },
		};
		const horizon = computeHorizon(noteAdjacency(links), "A.md", 3, true);
		expect([...horizon.loaded]).toEqual(["A.md"]);
		expect(horizon.hops.has("deck-plan.svg")).toBe(false);
		expect(horizon.hops.has("Far.md")).toBe(false);
	});
});

describe("diffLoaded", () => {
	it("reports arrivals and departures when the focus hops", () => {
		const adjacency = noteAdjacency(CHAIN);
		const before = computeHorizon(adjacency, "A.md", 1, true);
		const after = computeHorizon(adjacency, "B.md", 1, true);
		expect(diffLoaded(before.loaded, after.loaded)).toEqual({ arriving: ["C.md"], departing: [] });

		const further = computeHorizon(adjacency, "D.md", 1, true);
		const { arriving, departing } = diffLoaded(after.loaded, further.loaded);
		expect(arriving.sort()).toEqual(["D.md", "E.md"]);
		expect(departing.sort()).toEqual(["A.md", "B.md"]);
	});

	it("is empty when the loaded set is unchanged", () => {
		const loaded = new Set(["A.md", "B.md"]);
		expect(diffLoaded(loaded, new Set(loaded))).toEqual({ arriving: [], departing: [] });
	});
});

describe("withEmbedded (depth 0)", () => {
	it("loads the focus alone, with its linked notes as the prefetch ring", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "B.md", 0, false);
		expect([...horizon.loaded]).toEqual(["B.md"]);
		expect([...horizon.prefetch]).toEqual(["C.md"]);
	});

	it("adds the embedded notes as loaded, not prefetched, with their distance and the note that embedded them", () => {
		const base = computeHorizon(noteAdjacency(CHAIN), "B.md", 0, false);
		const horizon = withEmbedded(base, new Map([["B.md", 0], ["C.md", 1], ["X.md", 2]]), new Map([["C.md", "B.md"], ["X.md", "C.md"]]));
		expect([...horizon.loaded]).toEqual(["B.md", "C.md", "X.md"]);
		expect([...horizon.prefetch]).toEqual([]);
		expect(horizon.hops.get("X.md")).toBe(2);
		expect(horizon.via.get("X.md")).toBe("C.md");
		expect(horizon.focus).toBe("B.md");
	});
});

describe("withBacklinkers (depth 0 with Backlinks on)", () => {
	/** A and D link to B; B links to C and E; D links to C too. */
	const LINKS: ResolvedLinks = {
		"A.md": { "B.md": 1 },
		"B.md": { "C.md": 1, "E.md": 1 },
		"C.md": {},
		"D.md": { "B.md": 1, "C.md": 1 },
		"E.md": {},
	};
	const adjacency = noteAdjacency(LINKS);
	const alone = () => withEmbedded(computeHorizon(adjacency, "B.md", 0, false), new Map([["B.md", 0]]), new Map());

	it("with Backlinks off (not applied), the loaded set is the focus and what it embeds", () => {
		expect([...alone().loaded]).toEqual(["B.md"]);
	});

	it("adds the notes that link to the focus, one hop out and reached from the focus", () => {
		const horizon = withBacklinkers(alone(), adjacency);
		expect([...horizon.loaded].sort()).toEqual(["A.md", "B.md", "D.md"]);
		expect(horizon.hops.get("A.md")).toBe(1);
		expect(horizon.via.get("D.md")).toBe("B.md");
		expect([...horizon.prefetch].sort()).toEqual(["C.md", "E.md"]);
	});

	it("does not duplicate a note that is both embedded and linking to the focus", () => {
		const base = withEmbedded(computeHorizon(adjacency, "B.md", 0, false), new Map([["B.md", 0], ["A.md", 1]]), new Map([["A.md", "B.md"]]));
		const horizon = withBacklinkers(base, adjacency);
		expect([...horizon.loaded].sort()).toEqual(["A.md", "B.md", "D.md"]);
		expect(horizon.hops.get("A.md")).toBe(1);
		expect(horizon.via.get("A.md")).toBe("B.md");
	});

	it("takes a note the focus links to out of the prefetch ring when it links back", () => {
		const mutual = noteAdjacency({ "B.md": { "C.md": 1 }, "C.md": { "B.md": 1 } });
		const horizon = withBacklinkers(computeHorizon(mutual, "B.md", 0, false), mutual);
		expect([...horizon.loaded].sort()).toEqual(["B.md", "C.md"]);
		expect([...horizon.prefetch]).toEqual([]);
	});

	it("walks backward from the focus only, not from an embedded note", () => {
		const links = noteAdjacency({ ...LINKS, "F.md": { "C.md": 1 } });
		const base = withEmbedded(computeHorizon(links, "B.md", 0, false), new Map([["B.md", 0], ["C.md", 1]]), new Map([["C.md", "B.md"]]));
		const horizon = withBacklinkers(base, links);
		expect([...horizon.loaded].sort()).toEqual(["A.md", "B.md", "C.md", "D.md"]);
	});
});

describe("noteAdjacency exclude", () => {
	it("drops excluded paths on either end, so a sidecar is no note's backlinker", () => {
		const adjacency = noteAdjacency(
			{ "Osmosis/Data/abc.osmosis.md": { "Knots.md": 1 }, "Knots.md": { "Tides.md": 1 } },
			(path) => path.startsWith("Osmosis/Data/"),
		);
		expect(adjacency.backward.get("Knots.md")).toBeUndefined();
		expect(adjacency.forward.get("Knots.md")).toEqual(new Set(["Tides.md"]));
	});
});
