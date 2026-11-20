import { describe, expect, it } from "vitest";
import { writeWidthStyle } from "./width-style";

describe("writeWidthStyle", () => {
	it("creates the osmosis-styles entry on a note without one", () => {
		const fm: Record<string, unknown> = { title: "Rigging" };
		writeWidthStyle(fm, "^os-a1b2c3", "_n:abc", 260);
		expect(fm["osmosis-styles"]).toEqual({ styles: { "^os-a1b2c3": { width: 260 } } });
		expect(fm["title"]).toBe("Rigging");
	});

	it("keeps the rest of the node's style and the other nodes' styles", () => {
		const fm: Record<string, unknown> = {
			"osmosis-styles": { styles: { "^os-a1b2c3": { fill: "#fff", width: 100 }, "^other": { width: 50 } }, baseStyle: { shape: "pill" } },
		};
		writeWidthStyle(fm, "^os-a1b2c3", "_n:abc", 300);
		expect(fm["osmosis-styles"]).toEqual({ styles: { "^os-a1b2c3": { fill: "#fff", width: 300 }, "^other": { width: 50 } }, baseStyle: { shape: "pill" } });
	});

	it("moves a style left under the stable-ID selector to the block-ID one", () => {
		const fm: Record<string, unknown> = { "osmosis-styles": { styles: { "_n:abc": { fill: "#eee" } } } };
		writeWidthStyle(fm, "^os-a1b2c3", "_n:abc", 120);
		expect(fm["osmosis-styles"]).toEqual({ styles: { "^os-a1b2c3": { fill: "#eee", width: 120 } } });
	});

	it("writes under the stable-ID selector when the line cannot take a block ID", () => {
		const fm: Record<string, unknown> = {};
		writeWidthStyle(fm, "_n:abc", "_n:abc", 90);
		expect(fm["osmosis-styles"]).toEqual({ styles: { "_n:abc": { width: 90 } } });
	});
});
