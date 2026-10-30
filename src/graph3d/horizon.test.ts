import { describe, it, expect } from "vitest";
import { computeHorizon, diffLoaded, noteAdjacency, type ResolvedLinks } from "./horizon";

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
		const horizon = computeHorizon(noteAdjacency(CHAIN), "A.md", 2);
		expect([...horizon.loaded]).toEqual(["A.md", "B.md", "C.md"]);
		expect([...horizon.prefetch]).toEqual(["D.md"]);
		expect(horizon.hops.get("C.md")).toBe(2);
		expect(horizon.hops.get("D.md")).toBe(3);
		expect(horizon.hops.has("E.md")).toBe(false);
	});

	it("records the nearer note that reached each note", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "B.md", 2);
		expect(horizon.via.get("A.md")).toBe("B.md");
		expect(horizon.via.get("D.md")).toBe("C.md");
		expect(horizon.via.has("B.md")).toBe(false);
	});

	it("counts backlinks as hops", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "C.md", 1);
		expect([...horizon.loaded].sort()).toEqual(["B.md", "C.md", "D.md"]);
		expect([...horizon.prefetch].sort()).toEqual(["A.md", "E.md"]);
	});

	it("takes the shortest distance when paths of different lengths meet", () => {
		const links: ResolvedLinks = { "A.md": { "B.md": 1, "C.md": 1 }, "B.md": { "C.md": 1 } };
		expect(computeHorizon(noteAdjacency(links), "A.md", 2).hops.get("C.md")).toBe(1);
	});

	it("survives cycles and self-links", () => {
		const links: ResolvedLinks = { "A.md": { "A.md": 1, "B.md": 1 }, "B.md": { "A.md": 1 } };
		const horizon = computeHorizon(noteAdjacency(links), "A.md", 3);
		expect([...horizon.loaded]).toEqual(["A.md", "B.md"]);
		expect(horizon.prefetch.size).toBe(0);
	});

	it("loads only the focus at depth 0, prefetching its neighbours", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "B.md", 0);
		expect([...horizon.loaded]).toEqual(["B.md"]);
		expect([...horizon.prefetch].sort()).toEqual(["A.md", "C.md"]);
	});

	it("loads an unlinked focus on its own", () => {
		const horizon = computeHorizon(noteAdjacency(CHAIN), "Lonely.md", 2);
		expect([...horizon.loaded]).toEqual(["Lonely.md"]);
		expect(horizon.prefetch.size).toBe(0);
	});

	it("does not hop through an attachment shared by two notes", () => {
		const links: ResolvedLinks = {
			"A.md": { "deck-plan.svg": 1 },
			"Far.md": { "deck-plan.svg": 1 },
		};
		const horizon = computeHorizon(noteAdjacency(links), "A.md", 3);
		expect([...horizon.loaded]).toEqual(["A.md"]);
		expect(horizon.hops.has("deck-plan.svg")).toBe(false);
		expect(horizon.hops.has("Far.md")).toBe(false);
	});
});

describe("diffLoaded", () => {
	it("reports arrivals and departures when the focus hops", () => {
		const adjacency = noteAdjacency(CHAIN);
		const before = computeHorizon(adjacency, "A.md", 1);
		const after = computeHorizon(adjacency, "B.md", 1);
		expect(diffLoaded(before.loaded, after.loaded)).toEqual({ arriving: ["C.md"], departing: [] });

		const further = computeHorizon(adjacency, "D.md", 1);
		const { arriving, departing } = diffLoaded(after.loaded, further.loaded);
		expect(arriving.sort()).toEqual(["D.md", "E.md"]);
		expect(departing.sort()).toEqual(["A.md", "B.md"]);
	});

	it("is empty when the loaded set is unchanged", () => {
		const loaded = new Set(["A.md", "B.md"]);
		expect(diffLoaded(loaded, new Set(loaded))).toEqual({ arriving: [], departing: [] });
	});
});
