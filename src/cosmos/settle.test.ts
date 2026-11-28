import { describe, it, expect } from "vitest";
import { linkDistance } from "./appearance";
import { chargeStrengths, notePush, spaceCharges, type Body, type ChargeNode, type NoteBody } from "./settle";

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
	});

	it("never owes a pull: notes tighter than their lines owe nothing", () => {
		for (const note of [0.5, 1, 1.5, 2, 3]) {
			for (const node of [0.5, 1, 1.15, 2, 3]) {
				expect(spaceCharges(strengths(), pathOf, { note, node }, false).get("A.md") ?? 0).toBeLessThanOrEqual(0);
			}
		}
		expect(spaceCharges(strengths(), pathOf, { note: 1, node: 1.15 }, false).size).toBe(0);
	});

	it("pushes an overlapping note out, never in (Note x1, Node x1.15 pulled notes into one another)", () => {
		// Two notes almost on top of each other, as a re-settle can leave them: B's line must be pushed away from A's core.
		const map = new Map([["note:A.md", -30], ["line:A.md#1", -30], ["note:B.md", -30], ["line:B.md#1", -30]]);
		for (const spacing of [{ note: 1, node: 1.15 }, { note: 0.5, node: 1 }, { note: 3, node: 1 }]) {
			const owed = spaceCharges(new Map(map), (id) => (id.includes("A.md") ? "A.md" : "B.md"), spacing, false);
			const a = { x: 0, y: 0, z: 0 };
			const b = { x: 5, y: 0, z: 0 };
			const line = { x: 6, y: 0, z: 0, vx: 0 };
			const cores = new Map([["A.md", { body: a, strength: owed.get("A.md") ?? 0 }], ["B.md", { body: b, strength: owed.get("B.md") ?? 0 }]]);
			const charged: NoteBody[] = [{ body: line, path: "B.md" }];
			notePush(cores, charged, 1);
			expect(line.vx).toBeGreaterThanOrEqual(0);
		}
	});

	it("is recomputed from the base strengths each time: x1, x3, x1, x3 give the same charges", () => {
		const run = (note: number): [string, number][] => {
			const map = strengths();
			const owed = spaceCharges(map, pathOf, { note, node: 1.15 }, false);
			return [...map, ...owed];
		};
		const [first1, first3, second1, second3] = [run(1), run(3), run(1), run(3)];
		expect(second1).toEqual(first1);
		expect(second3).toEqual(first3);
	});

	it("charges everything by Note spacing in Planets, where only cores and stars are charged", () => {
		const map = strengths();
		const owed = spaceCharges(map, pathOf, { note: 2, node: 3 }, true);
		expect(map.get("note:A.md")).toBe(-120);
		expect(owed.size).toBe(0);
	});

	it("grows the total push between notes with Note spacing, at Note spacing squared once it passes Node spacing", () => {
		const total = (note: number, node: number): number => {
			const map = strengths();
			const owed = spaceCharges(map, pathOf, { note, node }, false);
			return -((map.get("note:A.md") ?? 0) + (map.get("line:A.md#1") ?? 0) + (owed.get("A.md") ?? 0));
		};
		for (const note of [1, 2, 3]) expect(total(note, 1)).toBeCloseTo(60 * note * note, 9);
		for (const node of [0.5, 1, 1.15, 2]) {
			let last = 0;
			for (const note of [0.5, 1, 1.5, 2, 2.5, 3]) {
				expect(total(note, node)).toBeGreaterThanOrEqual(last);
				last = total(note, node);
			}
			expect(total(3, node)).toBeGreaterThan(total(1, node));
		}
	});

	it("rests links between notes strictly farther apart at x3 than at x1", () => {
		for (const kind of ["link", "embed", "property", "tag", "attachment"] as const) {
			expect(linkDistance(kind, 5, 5, { note: 3, node: 1.15 })).toBeGreaterThan(linkDistance(kind, 5, 5, { note: 1, node: 1.15 }));
		}
	});
});


describe("notePush", () => {
	it("pushes every charged node of another note by what its core feels, and leaves the note's own lines alone", () => {
		const coreA: Body = { x: 0, y: 0, z: 0 };
		const coreB: Body = { x: 10, y: 0, z: 0 };
		const ownLine: Body = { x: 5, y: 0, z: 0, vx: 0 };
		const otherLine: Body = { x: 10, y: 50, z: 0, vx: 0, vy: 0 };
		const cores = new Map([["A.md", { body: coreA, strength: -100 }], ["B.md", { body: coreB, strength: 0 }]]);
		notePush(cores, [{ body: ownLine, path: "A.md" }, { body: coreB, path: "B.md" }, { body: otherLine, path: "B.md" }], 0.5);
		expect(ownLine.vx).toBe(0);
		// d3's law: strength × alpha / distance, away from the source.
		expect(coreB.vx).toBeCloseTo(5);
		// The same push as its core, so the note moves as a whole.
		expect(otherLine.vx).toBeCloseTo(5);
		expect(otherLine.vy).toBeCloseTo(0);
	});
});
