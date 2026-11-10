import { describe, it, expect } from "vitest";
import { chargeStrengths, spaceCharges, type ChargeNode } from "./settle";

const note = (path: string, pinned: boolean): ChargeNode => ({ id: `note:${path}`, kind: "note", path, pinned });
const line = (path: string, n: number, pinned: boolean): ChargeNode => ({ id: `line:${path}#${n}`, kind: "line", path, pinned });

describe("chargeStrengths", () => {
	it("leaves a settled world's lines out, keeping each core at its cluster's strength", () => {
		const strengths = chargeStrengths([note("A.md", true), line("A.md", 1, true), line("A.md", 2, true)], -30);
		expect([...strengths]).toEqual([["note:A.md", -90]]);
	});

	it("keeps every node of a note that has a free line, at the base strength", () => {
		const nodes = [note("A.md", true), line("A.md", 1, true), line("A.md", 2, false), note("B.md", true), line("B.md", 1, true)];
		const strengths = chargeStrengths(nodes, -30);
		expect(strengths.get("note:A.md")).toBe(-30);
		expect(strengths.get("line:A.md#1")).toBe(-30);
		expect(strengths.get("line:A.md#2")).toBe(-30);
		expect(strengths.get("note:B.md")).toBe(-60);
		expect(strengths.has("line:B.md#1")).toBe(false);
	});

	it("charges a pinned sole H1 root as its note's core", () => {
		const root: ChargeNode = { id: "note:A.md", kind: "line", path: "A.md", root: true, pinned: true };
		expect([...chargeStrengths([root, line("A.md", 1, true), line("A.md", 2, true)], -30)]).toEqual([["note:A.md", -90]]);
		expect(chargeStrengths([root, line("A.md", 1, false)], -30).get("note:A.md")).toBe(-30);
	});

	it("includes free hubs and leaves pinned ones out", () => {
		const nodes: ChargeNode[] = [
			{ id: "tag:rope", kind: "tag", pinned: false },
			{ id: "tag:sail", kind: "tag", pinned: true },
		];
		expect([...chargeStrengths(nodes, -30).keys()]).toEqual(["tag:rope"]);
	});
});

describe("spaceCharges", () => {
	const pathOf = (id: string): string | undefined => (id.startsWith("tag:") ? undefined : "A.md");
	const strengths = (): Map<string, number> => new Map([["note:A.md", -30], ["line:A.md#1", -30], ["tag:x", -30]]);

	it("changes nothing at x1, and owes nothing", () => {
		const map = strengths();
		const owed = spaceCharges(map, pathOf, { note: 1, node: 1 }, false);
		expect([...map]).toEqual([...strengths()]);
		expect(owed.size).toBe(0);
	});

	it("scales a note's lines by Node spacing squared and pathless nodes by Note spacing squared", () => {
		const map = strengths();
		spaceCharges(map, pathOf, { note: 3, node: 2 }, false);
		expect(map.get("line:A.md#1")).toBe(-120);
		expect(map.get("tag:x")).toBe(-270);
	});

	it("owes each note the difference between the two, as a push from the note as a whole", () => {
		const owed = spaceCharges(strengths(), pathOf, { note: 3, node: 2 }, false);
		expect(owed.get("A.md")).toBe(-60 * (9 - 4));
		expect(owed.has("tag:x")).toBe(false);
		// Looser notes owe more push; tighter notes owe less (an attraction that cancels part of the lines').
		expect(spaceCharges(strengths(), pathOf, { note: 1, node: 2 }, false).get("A.md")).toBeGreaterThan(0);
	});

	it("charges everything by Note spacing in Planets, where only cores and stars are charged", () => {
		const map = strengths();
		const owed = spaceCharges(map, pathOf, { note: 2, node: 3 }, true);
		expect(map.get("note:A.md")).toBe(-120);
		expect(owed.size).toBe(0);
	});

	it("grows the total push between notes with Note spacing", () => {
		let last = 0;
		for (const note of [0.5, 1, 2, 3]) {
			const map = strengths();
			const owed = spaceCharges(map, pathOf, { note, node: 1 }, false);
			const total = -((map.get("note:A.md") ?? 0) + (map.get("line:A.md#1") ?? 0) + (owed.get("A.md") ?? 0));
			expect(total).toBeCloseTo(60 * note * note, 9);
			expect(total).toBeGreaterThan(last);
			last = total;
		}
	});
});
