import { describe, it, expect } from "vitest";
import { chooseLabelled, type LabelBudget } from "./lod";

const BUDGET: LabelBudget = { enter: 100, exit: 120, max: 3 };

const at = (entries: Record<string, number>) => Object.entries(entries).map(([id, distance]) => ({ id, distance }));

describe("chooseLabelled", () => {
	it("labels nodes inside the enter distance", () => {
		expect([...chooseLabelled(at({ a: 50, b: 99, c: 101 }), new Set(), BUDGET)].sort()).toEqual(["a", "b"]);
	});

	it("keeps a labelled node out to the exit distance, but no further", () => {
		const current = new Set(["a", "b"]);
		expect([...chooseLabelled(at({ a: 110, b: 121 }), current, BUDGET)]).toEqual(["a"]);
	});

	it("does not label a new node between enter and exit", () => {
		expect(chooseLabelled(at({ a: 110 }), new Set(), BUDGET).size).toBe(0);
	});

	it("keeps only the nearest within the budget", () => {
		const chosen = chooseLabelled(at({ a: 40, b: 10, c: 90, d: 20, e: 60 }), new Set(), BUDGET);
		expect([...chosen].sort()).toEqual(["a", "b", "d"]);
	});

	it("lets a nearer newcomer displace a labelled node at the edge of the budget", () => {
		const chosen = chooseLabelled(at({ a: 10, b: 20, c: 115, d: 30 }), new Set(["a", "b", "c"]), BUDGET);
		expect([...chosen].sort()).toEqual(["a", "b", "d"]);
	});
});
