import { describe, it, expect } from "vitest";
import { chargeStrengths, type ChargeNode } from "./settle";

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

	it("includes free hubs and leaves pinned ones out", () => {
		const nodes: ChargeNode[] = [
			{ id: "tag:rope", kind: "tag", pinned: false },
			{ id: "tag:sail", kind: "tag", pinned: true },
		];
		expect([...chargeStrengths(nodes, -30).keys()]).toEqual(["tag:rope"]);
	});
});
