import { describe, it, expect } from "vitest";
import { refocusPath } from "./refocus";

describe("refocusPath", () => {
	it("makes another note's line or core the focus note", () => {
		expect(refocusPath({ kind: "line", path: "Knots.md" }, "Sailing Basics.md")).toBe("Knots.md");
		expect(refocusPath({ kind: "note", path: "Knots.md" }, "Sailing Basics.md")).toBe("Knots.md");
	});

	it("does nothing for a node already in the focus note", () => {
		expect(refocusPath({ kind: "line", path: "Knots.md" }, "Knots.md")).toBeNull();
		expect(refocusPath({ kind: "note", path: "Knots.md" }, "Knots.md")).toBeNull();
	});

	it("refocuses on any note when there is no focus yet", () => {
		expect(refocusPath({ kind: "line", path: "Knots.md" }, null)).toBe("Knots.md");
	});

	it("never refocuses on a tag, attachment or unresolved link", () => {
		expect(refocusPath({ kind: "tag" }, "Knots.md")).toBeNull();
		expect(refocusPath({ kind: "attachment", path: "chart.png" }, "Knots.md")).toBeNull();
		expect(refocusPath({ kind: "ghost" }, "Knots.md")).toBeNull();
	});
});
