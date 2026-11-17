import { describe, it, expect } from "vitest";
import { OsmosisParser } from "./parser";
import { planStyleKeys, stampedStart } from "./mindmap-style-key";
import { buildPreferredSelector } from "./styles";
import { findNodeById, preorder } from "./graph3d/edit";
import type { OsmosisNode } from "./types";

const parser = new OsmosisParser();

const note = [
	"# Harbour Notes",
	"",
	"## Moorings",
	"",
	"- Check the mooring lines",
	"\t- Replace the worn cleat",
	"- Log the tide table ^tide-log",
	"",
	"Pack the galley stores.",
	"",
	"1. Plot the course",
	"",
	"```text",
	"berth: 4",
	"```",
	"",
].join("\n");

/** Plan the style key for the node whose content is `content`. */
function plan(text: string, content: string) {
	const root = parser.parse(text, "Harbour.md").root;
	const node = preorder(root).find((n) => n.content === content);
	if (!node) throw new Error(`no node ${content}`);
	return { node, root, result: planStyleKeys(text, root, [node]) };
}

const OS_ID = /^\^os-[0-9a-z]{6}$/;

describe("planStyleKeys", () => {
	it("reuses a line's existing block ID and edits nothing", () => {
		const { node, result } = plan(note, "Log the tide table");
		expect(result.selectors.get(node.id)).toBe("^tide-log");
		expect(result.content).toBe(note);
	});

	it("stamps an os- ID at the end of a heading", () => {
		const { node, result } = plan(note, "Moorings");
		const key = result.selectors.get(node.id)!;
		expect(key).toMatch(OS_ID);
		expect(result.content).toBe(note.replace("## Moorings", `## Moorings ${key}`));
	});

	it("stamps a bullet, a nested bullet, an ordered item and a paragraph", () => {
		for (const text of ["Check the mooring lines", "Replace the worn cleat", "Plot the course", "Pack the galley stores."]) {
			const { node, result } = plan(note, text);
			const key = result.selectors.get(node.id)!;
			expect(key).toMatch(OS_ID);
			expect(result.content.split("\n").filter((l) => l.endsWith(` ${key}`))).toHaveLength(1);
			expect(result.content.length).toBe(note.length + key.length + 1);
			// Reparsed, the line carries the ID and its content is unchanged.
			const again = preorder(parser.parse(result.content, "Harbour.md").root).find((n) => n.content === text);
			expect(again?.blockId).toBe(key.slice(1));
			expect(again?.id).toBe(node.id);
		}
	});

	it("stamps a code block on its own line after the fence", () => {
		const { node, result } = plan(note, "```text\nberth: 4\n```");
		const key = result.selectors.get(node.id)!;
		expect(key).toMatch(OS_ID);
		expect(result.content).toContain(`berth: 4\n\`\`\`\n${key}\n`);
		const again = findNodeById(parser.parse(result.content, "Harbour.md").root, node.id);
		expect(again?.blockId).toBe(key.slice(1));
	});

	it("keeps the _n: fallback for a paragraph line that runs on into the next", () => {
		// Two prose lines are one node now (T75); a comment-only line breaks
		// the node but not Obsidian's block, so "first line" still runs on.
		const text = "## Notes\n\nfirst line\n<!-- second line -->\n";
		const root = parser.parse(text, "N.md").root;
		const runOn = preorder(root).find((n) => n.type === "paragraph")!;
		const result = planStyleKeys(text, root, [runOn]);
		expect(result.selectors.get(runOn.id)).toBe(buildPreferredSelector(runOn));
		expect(result.selectors.get(runOn.id)).toMatch(/^_n:/);
		expect(result.content).toBe(text);
	});

	it("keeps the _n: fallback for the root, a card fence and an embed", () => {
		const text = "## Cards\n\n- Plain\n\n```osmosis\nQ: a\nA: b\n```\n\n![[Other note]]\n";
		const root = parser.parse(text, "C.md").root;
		const targets = [root, ...preorder(root).filter((n) => n.type === "codeblock" || n.type === "transclusion")];
		expect(targets.length).toBeGreaterThanOrEqual(2);
		const result = planStyleKeys(text, root, targets);
		for (const node of targets) expect(result.selectors.get(node.id)).toBe(buildPreferredSelector(node));
		expect(result.content).toBe(text);
	});

	it("keeps the fallback for a node pulled in by transclusion", () => {
		const root = parser.parse(note, "Harbour.md").root;
		const line = preorder(root).find((n) => n.content === "Check the mooring lines")!;
		const pulled: OsmosisNode = { ...line, isTranscluded: true, sourceFile: "Other.md" };
		const result = planStyleKeys(note, root, [pulled]);
		expect(result.selectors.get(pulled.id)).toBe(buildPreferredSelector(pulled));
		expect(result.content).toBe(note);
	});

	it("keeps the fallback for a line the text no longer contains", () => {
		const root = parser.parse(note, "Harbour.md").root;
		const gone = preorder(root).find((n) => n.content === "Plot the course")!;
		const edited = note.replace("1. Plot the course", "1. Plot another course");
		const result = planStyleKeys(edited, parser.parse(edited, "Harbour.md").root, [gone]);
		expect(result.selectors.get(gone.id)).toBe(buildPreferredSelector(gone));
		expect(result.content).toBe(edited);
	});

	it("stamps several lines at once with distinct IDs, none already in the note", () => {
		const root = parser.parse(note, "Harbour.md").root;
		const nodes = preorder(root).filter((n) => n.type === "bullet" || n.type === "heading" || n.type === "ordered");
		const result = planStyleKeys(note, root, nodes);
		const keys = nodes.map((n) => result.selectors.get(n.id)!);
		expect(new Set(keys).size).toBe(nodes.length);
		expect(result.selectors.get(nodes.find((n) => n.blockId === "tide-log")!.id)).toBe("^tide-log");
		const reparsed = preorder(parser.parse(result.content, "Harbour.md").root).filter((n) => n.blockId !== undefined);
		expect(reparsed.map((n) => `^${n.blockId}`).sort()).toEqual([...keys].sort());
	});
});

describe("stampedStart", () => {
	it("moves each line by the stamps made before it, so it is found at its new start", () => {
		const root = parser.parse(note, "Harbour.md").root;
		const lines = ["Check the mooring lines", "Replace the worn cleat", "Pack the galley stores."].map((content) => preorder(root).find((n) => n.content === content)!);
		const result = planStyleKeys(note, root, lines);
		const fresh = parser.parse(result.content, "Harbour.md").root;
		for (const line of lines) {
			const start = stampedStart(result, line.range.start);
			const found = preorder(fresh).find((n) => n.range.start === start);
			expect(found?.content).toBe(line.content);
		}
	});
});
