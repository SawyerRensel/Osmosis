import { describe, expect, it } from "vitest";
import { planReuse, translateAttr, type DrawnGroup, type WantedNode } from "./mindmap-reuse";

const drawn = (id: string, sig: string | null, x = 0, y = 0): DrawnGroup<string> => ({ id, el: `el-${id}`, sig, x, y });
const wanted = (id: string, sig: string, x = 0, y = 0): WantedNode<string> => ({ id, node: `node-${id}`, sig, x, y });

describe("planReuse", () => {
	it("keeps a group whose signature matches, with the move since it was drawn", () => {
		const plan = planReuse([drawn("a", "s", 10, 20)], [wanted("a", "s", 10, 55)]);
		expect(plan).toEqual({ keep: [{ el: "el-a", dx: 0, dy: 35 }], draw: [], remove: [] });
	});

	it("redraws a node whose signature changed and removes its old group", () => {
		const plan = planReuse([drawn("a", "old")], [wanted("a", "new")]);
		expect(plan).toEqual({ keep: [], draw: ["node-a"], remove: ["el-a"] });
	});

	it("draws new nodes and removes groups no longer wanted", () => {
		const plan = planReuse([drawn("gone", "s")], [wanted("new", "s")]);
		expect(plan).toEqual({ keep: [], draw: ["node-new"], remove: ["el-gone"] });
	});

	it("never reuses a group recorded as not reusable", () => {
		const plan = planReuse([drawn("a", null)], [wanted("a", "s")]);
		expect(plan).toEqual({ keep: [], draw: ["node-a"], remove: ["el-a"] });
	});

	it("keeps one group per id and removes duplicates", () => {
		const plan = planReuse(
			[drawn("a", "s"), { id: "a", el: "dup", sig: "s", x: 0, y: 0 }],
			[wanted("a", "s")],
		);
		expect(plan.keep.map((k) => k.el)).toEqual(["el-a"]);
		expect(plan.remove).toEqual(["dup"]);
	});
});

describe("translateAttr", () => {
	it("is null when the group has not moved", () => {
		expect(translateAttr(0, 0)).toBeNull();
		expect(translateAttr(-4, 12.5)).toBe("translate(-4, 12.5)");
	});
});
