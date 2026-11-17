import { describe, expect, it } from "vitest";
import { arrowCandidates, pickInDirection, type ScreenOffset } from "./arrow-nav";

/** A candidate at `deg` degrees clockwise from screen right (y down), `distance` px away. */
function at(id: string, deg: number, distance: number): ScreenOffset {
	const rad = (deg * Math.PI) / 180;
	return { id, x: Math.cos(rad) * distance, y: Math.sin(rad) * distance };
}

describe("pickInDirection", () => {
	const around = [at("right", 0, 100), at("down", 90, 100), at("left", 180, 100), at("up", 270, 100)];

	it("picks the candidate on each axis, screen y down", () => {
		expect(pickInDirection(around, "right")).toBe("right");
		expect(pickInDirection(around, "down")).toBe("down");
		expect(pickInDirection(around, "left")).toBe("left");
		expect(pickInDirection(around, "up")).toBe("up");
	});

	it("returns null when nothing lies in the direction", () => {
		expect(pickInDirection([at("left", 180, 100), at("down", 90, 50)], "up")).toBeNull();
		expect(pickInDirection([], "right")).toBeNull();
	});

	it("rules out candidates past the off-axis cutoff", () => {
		expect(pickInDirection([at("a", -70, 10)], "right")).toBeNull();
		expect(pickInDirection([at("a", -60, 10)], "right")).toBe("a");
	});

	it("skips a candidate drawn on the primary itself", () => {
		expect(pickInDirection([{ id: "same", x: 0, y: 0 }], "up")).toBeNull();
	});

	it("breaks an exact tie by input order", () => {
		const a = { id: "a", x: 50, y: -50 };
		const b = { id: "b", x: -50, y: -50 };
		expect(pickInDirection([a, b], "up")).toBe("a");
		expect(pickInDirection([b, a], "up")).toBe("b");
	});

	it("prefers the shorter of two on the same angle", () => {
		expect(pickInDirection([at("far", 0, 300), at("near", 0, 80)], "right")).toBe("near");
	});

	it("prefers a far plate on the axis to a near one well off it", () => {
		expect(pickInDirection([at("near", 45, 100), at("far", 0, 250)], "right")).toBe("far");
	});

	it("prefers a near plate slightly off the axis to one on it but much farther", () => {
		expect(pickInDirection([at("near", 10, 100), at("far", 0, 250)], "right")).toBe("near");
	});

	it("treats siblings and children alike: only the screen decides", () => {
		const child = at("child", 40, 80);
		const sibling = at("sibling", 0, 120);
		expect(pickInDirection([child, sibling], "right")).toBe("sibling");
		expect(pickInDirection([child, sibling], "down")).toBe("child");
	});
});

describe("arrowCandidates", () => {
	const edges = [
		{ kind: "hierarchy" as const, source: "root", target: "p" },
		{ kind: "hierarchy" as const, source: "p", target: "a" },
		{ kind: "hierarchy" as const, source: "p", target: "b" },
		{ kind: "hierarchy" as const, source: "p", target: "c" },
		{ kind: "hierarchy" as const, source: "b", target: "b1" },
		{ kind: "hierarchy" as const, source: "a", target: "a1" },
		{ kind: "link" as const, source: "b", target: "other" },
		{ kind: "embed" as const, source: "elsewhere", target: "b" },
		{ kind: "tag" as const, source: "b", target: "tag" },
		{ kind: "link" as const, source: "b", target: "a" },
	];

	it("gathers parent, children, edge neighbours and siblings, each once", () => {
		expect(arrowCandidates("b", edges)).toEqual(["p", "b1", "other", "elsewhere", "tag", "a", "c"]);
	});

	it("leaves out a sibling's children and the grandparent", () => {
		const ids = arrowCandidates("b", edges);
		expect(ids).not.toContain("a1");
		expect(ids).not.toContain("root");
		expect(ids).not.toContain("b");
	});

	it("gives a root its children only", () => {
		expect(arrowCandidates("root", edges)).toEqual(["p"]);
	});
});
