import { describe, expect, it } from "vitest";
import { isTrail, parseTrail, serializeTrail, stopLink, type TrailStop } from "./trail-note";

describe("parseTrail", () => {
	it("reads a note, a block and a heading stop, one per list item, in order", () => {
		const text = [
			"---",
			"osmosis-trail: true",
			"---",
			"",
			"# Harbour trail",
			"",
			"Walk it in order.",
			"",
			"- [[Sailing Basics]]",
			"- [[Rules of the Road#^os-rr1]]",
			"* [[Rules of the Road#Lights and sounds]]",
			"1. [[Tide Cards#^os-td1|the tide]]",
		].join("\n");
		expect(parseTrail(text)).toEqual([
			{ target: "Sailing Basics", subpath: "" },
			{ target: "Rules of the Road", subpath: "^os-rr1" },
			{ target: "Rules of the Road", subpath: "Lights and sounds" },
			{ target: "Tide Cards", subpath: "^os-td1" },
		]);
	});

	it("takes the first link of an item, and skips prose, embeds, empty links and code fences", () => {
		const text = [
			"A line mentioning [[Not A Stop]].",
			"- [[Knots#^bowline]] then [[Rigging]] afterwards",
			"- no link here",
			"- ![[knot-diagram.svg]]",
			"- [[]]",
			"```",
			"- [[Inside A Fence]]",
			"```",
			"  - [[Nested Stop]]",
			"2) [[#Own Heading]]",
		].join("\n");
		expect(parseTrail(text)).toEqual([
			{ target: "Knots", subpath: "^bowline" },
			{ target: "Nested Stop", subpath: "" },
			{ target: "", subpath: "Own Heading" },
		]);
	});

	it("keeps a nested heading path whole, and finds no stops in a note without any", () => {
		expect(parseTrail("- [[Weather#Fronts#Cold]]")).toEqual([{ target: "Weather", subpath: "Fronts#Cold" }]);
		expect(parseTrail("# Nothing here\n\nJust prose.")).toEqual([]);
		expect(parseTrail("")).toEqual([]);
	});

	it("does not mistake the frontmatter for stops", () => {
		expect(parseTrail("---\nrelated:\n  - \"[[Hidden]]\"\nosmosis-trail: true\n---\n- [[Shown]]")).toEqual([{ target: "Shown", subpath: "" }]);
	});
});

describe("serializeTrail", () => {
	const stops: TrailStop[] = [
		{ target: "Sailing Basics", subpath: "" },
		{ target: "folder/Rules of the Road", subpath: "^os-rr1" },
		{ target: "Rules of the Road", subpath: "Lights and sounds" },
		{ target: "", subpath: "Own Heading" },
		{ target: "Weather", subpath: "Fronts#Cold" },
	];

	it("writes the marker and one list item per stop, and reads back to the same stops", () => {
		const text = serializeTrail(stops, "Harbour trail");
		expect(text.startsWith("---\nosmosis-trail: true\n---\n")).toBe(true);
		expect(text).toContain("# Harbour trail");
		expect(parseTrail(text)).toEqual(stops);
		expect(parseTrail(serializeTrail(stops))).toEqual(stops);
	});

	it("round-trips the empty trail", () => {
		expect(parseTrail(serializeTrail([]))).toEqual([]);
	});

	it("round-trips text through parse then serialize", () => {
		const text = serializeTrail(stops);
		expect(serializeTrail(parseTrail(text))).toBe(text);
	});

	it("names a stop as a wikilink", () => {
		expect(stopLink({ target: "Knots", subpath: "^bowline" })).toBe("[[Knots#^bowline]]");
		expect(stopLink({ target: "Knots", subpath: "" })).toBe("[[Knots]]");
	});
});

describe("isTrail", () => {
	it("is the osmosis-trail marker set to true", () => {
		expect(isTrail({ "osmosis-trail": true })).toBe(true);
		expect(isTrail({ "osmosis-trail": false })).toBe(false);
		expect(isTrail({ "osmosis-trail": "true" })).toBe(false);
		expect(isTrail(undefined)).toBe(false);
	});
});
