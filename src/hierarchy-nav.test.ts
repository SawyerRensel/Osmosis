import { describe, expect, it } from "vitest";
import { arrowKeyStep, edgeHierarchy, hierarchyStep } from "./hierarchy-nav";

// harbour ─┬─ docks ─┬─ crane
//          │         └─ quay
//          ├─ office
//          └─ marina
const edges = [
	{ kind: "hierarchy", source: "harbour", target: "docks" },
	{ kind: "link", source: "office", target: "crane" },
	{ kind: "hierarchy", source: "docks", target: "crane" },
	{ kind: "hierarchy", source: "harbour", target: "office" },
	{ kind: "hierarchy", source: "docks", target: "quay" },
	{ kind: "hierarchy", source: "harbour", target: "marina" },
];
const tree = edgeHierarchy(edges);

describe("hierarchyStep", () => {
	it("walks to the previous and next sibling in order", () => {
		expect(hierarchyStep(tree, "office", "prevSibling")).toBe("docks");
		expect(hierarchyStep(tree, "office", "nextSibling")).toBe("marina");
	});

	it("stops at the ends of the siblings, with no wrap and no cousin", () => {
		expect(hierarchyStep(tree, "docks", "prevSibling")).toBeNull();
		expect(hierarchyStep(tree, "marina", "nextSibling")).toBeNull();
		expect(hierarchyStep(tree, "quay", "nextSibling")).toBeNull();
	});

	it("goes to the parent and the first child", () => {
		expect(hierarchyStep(tree, "quay", "parent")).toBe("docks");
		expect(hierarchyStep(tree, "docks", "firstChild")).toBe("crane");
		expect(hierarchyStep(tree, "harbour", "firstChild")).toBe("docks");
	});

	it("returns null at a root and at a leaf", () => {
		expect(hierarchyStep(tree, "harbour", "parent")).toBeNull();
		expect(hierarchyStep(tree, "harbour", "nextSibling")).toBeNull();
		expect(hierarchyStep(tree, "marina", "firstChild")).toBeNull();
	});

	it("ignores non-hierarchy edges", () => {
		expect(tree.parent("crane")).toBe("docks");
		expect(tree.children("office")).toEqual([]);
	});
});

describe("edgeHierarchy include", () => {
	it("leaves out nodes the filter rejects", () => {
		const visible = edgeHierarchy(edges, (id) => id !== "office" && id !== "crane");
		expect(hierarchyStep(visible, "docks", "nextSibling")).toBe("marina");
		expect(hierarchyStep(visible, "docks", "firstChild")).toBe("quay");
	});
});

describe("arrowKeyStep", () => {
	it("maps each arrow to one step, never mirrored", () => {
		expect(arrowKeyStep("ArrowUp")).toBe("prevSibling");
		expect(arrowKeyStep("ArrowDown")).toBe("nextSibling");
		expect(arrowKeyStep("ArrowLeft")).toBe("parent");
		expect(arrowKeyStep("ArrowRight")).toBe("firstChild");
		expect(arrowKeyStep("Enter")).toBeNull();
	});
});
