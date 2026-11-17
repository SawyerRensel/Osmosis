import { describe, expect, it } from "vitest";
import { findCounter, findInText, findMatches, indexAfterReplace, planReplace, replaceableLine, replaceRanges, rewriteLines, spliceContent, stepMatch, type FindItem } from "./find-replace";
import { OsmosisParser } from "./parser";
import type { OsmosisNode } from "./types";

const items: FindItem[] = [
	{ id: "a1", note: "Harbour.md", text: "Sail at dawn, trim the sail", replaceable: true },
	{ id: "a0", note: "Harbour.md", text: "Harbour", replaceable: false },
	{ id: "b1", note: "Rigging.md", text: "Mainsail halyard", replaceable: true },
	{ id: "a2", note: "Harbour.md", text: "Moorings", replaceable: true },
	{ id: "a3", note: "Harbour.md", text: "SAIL plan", replaceable: true },
];

describe("findMatches", () => {
	it("returns matches in item order with ranges, case-insensitive by default", () => {
		expect(findMatches(items, "sail", false)).toEqual([
			{ item: 0, id: "a1", note: "Harbour.md", start: 0, end: 4 },
			{ item: 0, id: "a1", note: "Harbour.md", start: 23, end: 27 },
			{ item: 2, id: "b1", note: "Rigging.md", start: 4, end: 8 },
			{ item: 4, id: "a3", note: "Harbour.md", start: 0, end: 4 },
		]);
	});

	it("honours the case toggle", () => {
		expect(findMatches(items, "sail", true).map((m) => [m.id, m.start])).toEqual([["a1", 23], ["b1", 4]]);
	});

	it("matches nothing for an empty query", () => {
		expect(findMatches(items, "", false)).toEqual([]);
	});

	it("takes regex characters literally", () => {
		const text = "cost (approx.) $5 * 2 [a|b] ^x \\y";
		for (const query of ["(approx.)", "$5", "*", "[a|b]", "^x", "\\y", "."]) {
			const found = findInText(text, query, false);
			expect(found.length).toBeGreaterThan(0);
			expect(text.slice(found[0]!.start, found[0]!.end)).toBe(query);
		}
		expect(findInText("abc", ".", false)).toEqual([]);
	});

	it("does not overlap matches", () => {
		expect(findInText("aaaa", "aa", false)).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
	});
});

describe("stepMatch", () => {
	it("goes forward and back, wrapping", () => {
		expect(stepMatch(0, 3, false)).toBe(1);
		expect(stepMatch(2, 3, false)).toBe(0);
		expect(stepMatch(0, 3, true)).toBe(2);
		expect(stepMatch(1, 3, true)).toBe(0);
	});

	it("starts at the first (or, backward, the last) match", () => {
		expect(stepMatch(-1, 3, false)).toBe(0);
		expect(stepMatch(-1, 3, true)).toBe(2);
		expect(stepMatch(7, 3, false)).toBe(0);
	});

	it("is -1 with no matches", () => {
		expect(stepMatch(-1, 0, false)).toBe(-1);
		expect(stepMatch(0, 0, true)).toBe(-1);
	});
});

describe("findCounter", () => {
	it("shows i of N, N matches before a step, No matches, or nothing", () => {
		expect(findCounter("sail", 1, 4)).toBe("2 of 4");
		expect(findCounter("sail", -1, 4)).toBe("4 matches");
		expect(findCounter("sail", -1, 1)).toBe("1 match");
		expect(findCounter("sail", -1, 0)).toBe("No matches");
		expect(findCounter("", -1, 0)).toBe("");
	});
});

describe("replaceRanges", () => {
	it("replaces each range with the literal replacement", () => {
		expect(replaceRanges("Sail at dawn, trim the sail", [{ start: 0, end: 4 }, { start: 23, end: 27 }], "$& jib")).toBe("$& jib at dawn, trim the $& jib");
	});
});

describe("planReplace", () => {
	const matches = findMatches(items, "sail", false);

	it("Replace all edits only the current match's note", () => {
		const plan = planReplace(items, matches, 0, "jib", true);
		expect(plan?.note).toBe("Harbour.md");
		expect([...(plan?.texts ?? [])]).toEqual([["a1", "jib at dawn, trim the jib"], ["a3", "jib plan"]]);
		expect(plan?.replaced).toBe(3);
		expect(plan?.elsewhere).toBe(1);
		expect(plan?.fixed).toBe(0);
	});

	it("Replace all from a match in the other note leaves the first note alone", () => {
		const plan = planReplace(items, matches, 2, "jib", true);
		expect([...(plan?.texts ?? [])]).toEqual([["b1", "Mainjib halyard"]]);
		expect(plan?.elsewhere).toBe(3);
	});

	it("Replace edits the current match only", () => {
		const plan = planReplace(items, matches, 1, "jib", false);
		expect([...(plan?.texts ?? [])]).toEqual([["a1", "Sail at dawn, trim the jib"]]);
		expect(plan?.replaced).toBe(1);
	});

	it("counts matches it can't replace and returns null when none can be", () => {
		const found = findMatches(items, "harbour", false);
		expect(planReplace(items, found, 0, "x", true)).toBeNull();
		const mixed = findMatches(items, "r", false).filter((m) => m.note === "Harbour.md");
		const plan = planReplace(items, mixed, 0, "R", true);
		expect(plan?.fixed).toBe(2);
		expect(plan?.texts.get("a2")).toBe("MooRings");
	});

	it("is null without a current match", () => {
		expect(planReplace(items, matches, -1, "jib", false)).toBeNull();
	});
});

describe("indexAfterReplace", () => {
	it("stays on the same index, which is now the next match", () => {
		expect(indexAfterReplace(1, "sail", "jib", false, 3)).toBe(1);
		expect(indexAfterReplace(3, "sail", "jib", false, 3)).toBe(0);
	});

	it("steps over the query inside the replacement", () => {
		expect(indexAfterReplace(1, "sail", "Sail", false, 4)).toBe(2);
		expect(indexAfterReplace(1, "sail", "Sail", true, 3)).toBe(1);
	});
});

describe("spliceContent", () => {
	it("replaces the content at the end of a list or heading line", () => {
		expect(spliceContent("- [ ] trim the sail", "trim the sail", "trim the jib")).toBe("- [ ] trim the jib");
		expect(spliceContent("## Sail sail", "Sail sail", "jib jib")).toBe("## jib jib");
	});

	it("finds content inside a wrapper", () => {
		expect(spliceContent("![[Sail plan]]", "Sail plan", "Jib plan")).toBe("![[Jib plan]]");
	});

	it("is null when the content is not in the line", () => {
		expect(spliceContent("- something else", "trim the sail", "x")).toBeNull();
		expect(spliceContent("- ", "", "x")).toBeNull();
	});
});

describe("rewriteLines", () => {
	const note = [
		"# Sail plan",
		"",
		"- Trim the sail ^os-abc123",
		"  - [ ] Check sail ties",
		"1. Hoist the sail",
		"",
		"## Reefing the sail",
		"",
		"> A reefed sail",
		"> holds in a squall",
		"",
		"```",
		"sail = 3",
		"```",
		"",
	].join("\n");
	const root = new OsmosisParser().parse(note, "Sail plan.md").root;
	const lines: OsmosisNode[] = [];
	const walk = (node: OsmosisNode): void => {
		for (const child of node.children) {
			lines.push(child);
			walk(child);
		}
	};
	walk(root);
	const byContent = (start: string): OsmosisNode => {
		const line = lines.find((l) => l.content.startsWith(start));
		if (line === undefined) throw new Error(`no line ${start}`);
		return line;
	};
	const replaceAll = (line: OsmosisNode): { line: OsmosisNode; text: string } => ({ line, text: line.content.replace(/sail/g, "jib") });

	it("rewrites every kind of line in place, keeping markers, indentation and block IDs", () => {
		const targets = ["Sail plan", "Trim the sail", "[ ] Check sail", "Hoist", "Reefing", "> A reefed", "```"].map(byContent);
		const out = rewriteLines(note, targets.map(replaceAll));
		expect(out?.text).toBe(note.replace(/sail/g, "jib"));
		expect(out?.text).toContain("- Trim the jib ^os-abc123");
		expect(out?.text).toContain("  - [ ] Check jib ties");
		for (const line of out?.lines ?? []) expect(out?.text.slice(line.start, line.start + line.after.length)).toBe(line.after);
	});

	it("leaves lines it was not given alone", () => {
		const out = rewriteLines(note, [replaceAll(byContent("Hoist"))]);
		expect(out?.text).toBe(note.replace("Hoist the sail", "Hoist the jib"));
		expect(out?.lines).toEqual([{ before: "1. Hoist the sail", after: "1. Hoist the jib", start: note.indexOf("1. Hoist") }]);
	});

	it("is null when the note changed since it was parsed", () => {
		const moved = "Intro\n" + note;
		expect(rewriteLines(moved, [replaceAll(byContent("Hoist"))])).toBeNull();
	});
});

describe("replaceableLine", () => {
	it("refuses embeds and osmosis fences", () => {
		expect(replaceableLine({ type: "transclusion", content: "Rigging" })).toBe(false);
		expect(replaceableLine({ type: "codeblock", content: "```osmosis\nid: x\n```" })).toBe(false);
		expect(replaceableLine({ type: "codeblock", content: "```\nsail = 3\n```" })).toBe(true);
		expect(replaceableLine({ type: "bullet", content: "Trim the sail" })).toBe(true);
	});
});
