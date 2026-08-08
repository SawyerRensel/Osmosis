import { describe, it, expect } from "vitest";
import { orderPanels } from "./panelOrder";

const PANELS = [{ id: "a" }, { id: "b" }, { id: "c" }];

const ids = (panels: { id: string }[]): string[] => panels.map((panel) => panel.id);

describe("orderPanels", () => {
	it("keeps the default order when nothing is saved", () => {
		expect(ids(orderPanels(PANELS, []))).toEqual(["a", "b", "c"]);
	});

	it("follows the saved order", () => {
		expect(ids(orderPanels(PANELS, ["c", "a", "b"]))).toEqual(["c", "a", "b"]);
	});

	it("appends panels the saved order never saw", () => {
		expect(ids(orderPanels(PANELS, ["c", "a"]))).toEqual(["c", "a", "b"]);
	});

	it("ignores saved IDs that no longer exist", () => {
		expect(ids(orderPanels(PANELS, ["gone", "b"]))).toEqual(["b", "a", "c"]);
	});

	it("renders a duplicated saved ID once", () => {
		expect(ids(orderPanels(PANELS, ["b", "b", "a"]))).toEqual(["b", "a", "c"]);
	});
});
