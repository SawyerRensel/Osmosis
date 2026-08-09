import { describe, it, expect } from "vitest";
import { splitFenceHeader } from "../card-gen/explicit";

describe("splitFenceHeader", () => {
	it("ends the header at the blank line, as it always has", () => {
		const lines = ["id: abc", "deck: Geography", "", "Front", "***", "Back"];
		expect(splitFenceHeader(lines)).toEqual({ contentStart: 3, exclude: false, hasOcclusion: false });
	});

	it("reads exclude off the header", () => {
		expect(splitFenceHeader(["id: abc", "exclude: true", "", "x"]).exclude).toBe(true);
	});

	it("ends the header at content that is not a metadata line", () => {
		const lines = ["id: abc", "The bridge carries four lanes.", "***", "Back"];
		expect(splitFenceHeader(lines).contentStart).toBe(1);
	});

	/**
	 * The shape block is the header's only multi-line key. Before it was
	 * handled, the scan stopped on `occlude-a:` and reading view rendered every
	 * shape line as literal text above the diagram.
	 */
	it("consumes a shape block whole, leaving the content at the embed", () => {
		const lines = [
			"id: bridge",
			"occlude-a:",
			"  mode: hide-all-guess-one",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.31, y: 0.22, w: 0.14, h: 0.06 }",
			"",
			"![[bridge.png]]{a}",
		];
		const { contentStart, hasOcclusion } = splitFenceHeader(lines);

		expect(hasOcclusion).toBe(true);
		expect(lines.slice(contentStart).join("\n").trim()).toBe("![[bridge.png]]{a}");
	});

	it("consumes several shape blocks and the keys between them", () => {
		const lines = [
			"id: bridge",
			"occlude-a:",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }",
			"deck: Engineering",
			"occlude-b:",
			"  shapes:",
			"    - { group: c2, kind: rect, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }",
			"",
			"![[a.png]]{a}",
			"![[b.png]]{b}",
		];
		expect(splitFenceHeader(lines).contentStart).toBe(9);
	});

	it("still reports exclude when a shape block sits beside it", () => {
		const lines = [
			"id: bridge",
			"exclude: true",
			"occlude-a:",
			"  shapes:",
			"    - { group: c1, kind: rect, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }",
			"",
			"![[bridge.png]]{a}",
		];
		expect(splitFenceHeader(lines)).toMatchObject({ exclude: true, hasOcclusion: true });
	});

	it("reports no occlusion for an ordinary cloze fence", () => {
		expect(splitFenceHeader(["id: abc", "", "The span is ==120 metres== long."]).hasOcclusion).toBe(false);
	});
});
