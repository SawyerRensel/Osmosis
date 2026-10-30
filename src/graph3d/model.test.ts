import { describe, it, expect } from "vitest";
import type { Pos } from "obsidian";
import { OsmosisParser } from "../parser";
import {
	buildGraph,
	noteNodeId,
	tagNodeId,
	attachmentNodeId,
	ghostNodeId,
	type GraphModel,
	type LinkCacheLike,
	type LinkResolver,
	type NoteInput,
} from "./model";

const parser = new OsmosisParser();

/** A cache position at the first occurrence of `text` in `md`. */
function at(md: string, text: string): Pos {
	const offset = md.indexOf(text);
	if (offset === -1) throw new Error(`"${text}" not in fixture`);
	const loc = { line: 0, col: 0, offset };
	return { start: loc, end: { ...loc, offset: offset + text.length } };
}

/** A link or embed cache entry for the first `original` in `md`. */
function ref(md: string, original: string, link: string): { link: string; original: string; position: Pos } {
	return { link, original, position: at(md, original) };
}

function note(path: string, md: string, cache: (md: string) => LinkCacheLike = () => ({})): NoteInput {
	return { tree: parser.parse(md, path), cache: cache(md) };
}

/** Resolves `Name` to `Name.md` (or the name itself when it has an extension) among `files`. */
function resolverFor(files: string[]): LinkResolver {
	return (linkpath) => {
		const path = /\.[a-z0-9]+$/i.test(linkpath) ? linkpath : `${linkpath}.md`;
		return files.includes(path) ? path : null;
	};
}

/** The line node whose content is `content`. */
function lineId(model: GraphModel, content: string): string {
	const node = model.nodes.find((n) => n.kind === "line" && n.label === content);
	if (node === undefined) throw new Error(`no line "${content}"`);
	return node.id;
}

function edgesFrom(model: GraphModel, source: string): { kind: string; target: string }[] {
	return model.edges.filter((e) => e.source === source && e.kind !== "hierarchy").map(({ kind, target }) => ({ kind, target }));
}

const TARGET_MD = ["# Rigging", "- Halyards ^halyard", "## Running Rigging", "- Sheets"].join("\n");
const target = (): NoteInput => note("Rigging.md", TARGET_MD);

describe("buildGraph: notes and lines", () => {
	it("makes a core per note, a node per line, and hierarchy edges down the tree", () => {
		const model = buildGraph([target()], resolverFor([]));
		const core = noteNodeId("Rigging.md");

		expect(model.nodes.find((n) => n.id === core)).toMatchObject({ kind: "note", label: "Rigging", path: "Rigging.md" });
		expect(model.nodes.filter((n) => n.kind === "line").map((n) => n.label)).toEqual([
			"Rigging", "Halyards", "Running Rigging", "Sheets",
		]);
		const hierarchy = model.edges.filter((e) => e.kind === "hierarchy");
		expect(hierarchy).toContainEqual({ kind: "hierarchy", source: core, target: lineId(model, "Rigging") });
		expect(hierarchy).toContainEqual({ kind: "hierarchy", source: lineId(model, "Rigging"), target: lineId(model, "Halyards") });
		expect(hierarchy).toContainEqual({ kind: "hierarchy", source: lineId(model, "Running Rigging"), target: lineId(model, "Sheets") });
		expect(hierarchy).toHaveLength(4);
	});

	it("keys a line by its block ID when it has one", () => {
		const model = buildGraph([target()], resolverFor([]));
		expect(lineId(model, "Halyards")).toBe("line:Rigging.md#^halyard");
		expect(lineId(model, "Sheets")).toMatch(/^line:Rigging\.md#[0-9a-f]+$/);
	});

	it("keeps both lines when a block ID is duplicated", () => {
		const model = buildGraph([note("A.md", "- One ^dup\n- Two ^dup")], resolverFor([]));
		expect(model.nodes.filter((n) => n.kind === "line")).toHaveLength(2);
	});

	it("gives lines in different notes with the same content different IDs", () => {
		const model = buildGraph([note("A.md", "- Same"), note("B.md", "- Same")], resolverFor([]));
		const ids = model.nodes.filter((n) => n.kind === "line").map((n) => n.id);
		expect(new Set(ids).size).toBe(2);
	});
});

describe("buildGraph: link resolution", () => {
	const files = ["Knots.md", "Rigging.md", "deck-plan.svg"];

	function knots(md: string, cache: (md: string) => LinkCacheLike): GraphModel {
		return buildGraph([note("Knots.md", md, cache), target()], resolverFor(files));
	}

	it("resolves a block ref to the line carrying that block ID", () => {
		const md = "- Bowline\n- Tied to [[Rigging#^halyard]]";
		const model = knots(md, (m) => ({ links: [ref(m, "[[Rigging#^halyard]]", "Rigging#^halyard")] }));
		expect(edgesFrom(model, lineId(model, "Tied to [[Rigging#^halyard]]"))).toEqual([
			{ kind: "link", target: "line:Rigging.md#^halyard" },
		]);
	});

	it("resolves a heading ref to the heading's line, ignoring case and spacing", () => {
		const md = "- See [[Rigging#running  rigging]]";
		const model = knots(md, (m) => ({ links: [ref(m, "[[Rigging#running  rigging]]", "Rigging#running  rigging")] }));
		expect(edgesFrom(model, lineId(model, "See [[Rigging#running  rigging]]"))).toEqual([
			{ kind: "link", target: lineId(model, "Running Rigging") },
		]);
	});

	it("resolves a nested heading ref by its last segment", () => {
		const md = "- See [[Rigging#Rigging#Running Rigging]]";
		const model = knots(md, (m) => ({ links: [ref(m, "[[Rigging#Rigging#Running Rigging]]", "Rigging#Rigging#Running Rigging")] }));
		expect(edgesFrom(model, lineId(model, "See [[Rigging#Rigging#Running Rigging]]"))[0]?.target).toBe(lineId(model, "Running Rigging"));
	});

	it("resolves a bare link to the note core", () => {
		const md = "- Uses [[Rigging]]";
		const model = knots(md, (m) => ({ links: [ref(m, "[[Rigging]]", "Rigging")] }));
		expect(edgesFrom(model, lineId(model, "Uses [[Rigging]]"))).toEqual([{ kind: "link", target: noteNodeId("Rigging.md") }]);
	});

	it("falls back to the note core when the block or heading is missing", () => {
		const md = "- A [[Rigging#^gone]]\n- B [[Rigging#No Such Heading]]";
		const model = knots(md, (m) => ({
			links: [ref(m, "[[Rigging#^gone]]", "Rigging#^gone"), ref(m, "[[Rigging#No Such Heading]]", "Rigging#No Such Heading")],
		}));
		expect(edgesFrom(model, lineId(model, "A [[Rigging#^gone]]"))[0]?.target).toBe(noteNodeId("Rigging.md"));
		expect(edgesFrom(model, lineId(model, "B [[Rigging#No Such Heading]]"))[0]?.target).toBe(noteNodeId("Rigging.md"));
	});

	it("resolves a same-note heading ref", () => {
		const md = "# Bends\n- Back to [[#Bends]]";
		const model = knots(md, (m) => ({ links: [ref(m, "[[#Bends]]", "#Bends")] }));
		expect(edgesFrom(model, lineId(model, "Back to [[#Bends]]"))).toEqual([{ kind: "link", target: lineId(model, "Bends") }]);
	});

	it("makes an embed edge from the embedding line", () => {
		const md = "- Bowline\n\n![[Rigging]]";
		const model = knots(md, (m) => ({ embeds: [ref(m, "![[Rigging]]", "Rigging")] }));
		const embedLine = model.nodes.find((n) => n.kind === "line" && n.source?.type === "transclusion");
		expect(embedLine).toBeDefined();
		expect(edgesFrom(model, embedLine?.id ?? "")).toEqual([{ kind: "embed", target: noteNodeId("Rigging.md") }]);
	});

	it("places a trailing list-item embed on the lifted embed line, not its parent", () => {
		const md = "- Rigging overview ![[Rigging]]";
		const model = knots(md, (m) => ({ embeds: [ref(m, "![[Rigging]]", "Rigging")] }));
		const parent = lineId(model, "Rigging overview");
		const embedLine = model.nodes.find((n) => n.kind === "line" && n.source?.type === "transclusion");
		expect(embedLine).toBeDefined();
		expect(edgesFrom(model, parent)).toEqual([]);
		expect(edgesFrom(model, embedLine?.id ?? "")).toEqual([{ kind: "embed", target: noteNodeId("Rigging.md") }]);
	});

	it("places a link on the later line of a multiline blockquote", () => {
		const md = "> First line\n> then [[Rigging]]";
		const model = knots(md, (m) => ({ links: [ref(m, "[[Rigging]]", "Rigging")] }));
		const quote = model.nodes.find((n) => n.kind === "line" && n.source?.type === "blockquote");
		expect(edgesFrom(model, quote?.id ?? "")).toEqual([{ kind: "link", target: noteNodeId("Rigging.md") }]);
	});

	it("makes a property edge from the note core for a frontmatter link", () => {
		const md = "---\nsee: \"[[Rigging]]\"\n---\n- Bowline";
		const model = knots(md, () => ({ frontmatterLinks: [{ key: "see", link: "Rigging", original: "[[Rigging]]" }] }));
		expect(edgesFrom(model, noteNodeId("Knots.md"))).toEqual([{ kind: "property", target: noteNodeId("Rigging.md") }]);
	});

	it("makes a ghost node for an unresolved link", () => {
		const md = "- Check [[Tide Tables]]\n- And [[tide tables#High Water]]";
		const model = knots(md, (m) => ({
			links: [ref(m, "[[Tide Tables]]", "Tide Tables"), ref(m, "[[tide tables#High Water]]", "tide tables#High Water")],
		}));
		const ghosts = model.nodes.filter((n) => n.kind === "ghost");
		expect(ghosts).toEqual([{ id: ghostNodeId("Tide Tables"), kind: "ghost", label: "Tide Tables" }]);
		expect(edgesFrom(model, lineId(model, "Check [[Tide Tables]]"))).toEqual([{ kind: "link", target: ghostNodeId("Tide Tables") }]);
		expect(edgesFrom(model, lineId(model, "And [[tide tables#High Water]]"))).toEqual([{ kind: "link", target: ghostNodeId("Tide Tables") }]);
	});

	it("makes an attachment node and edge for a linked or embedded file", () => {
		const md = "- Plan [[deck-plan.svg]]\n- ![[deck-plan.svg]]";
		const model = knots(md, (m) => ({
			links: [ref(m, "[[deck-plan.svg]]", "deck-plan.svg")],
			embeds: [ref(m, "![[deck-plan.svg]]", "deck-plan.svg")],
		}));
		const file = attachmentNodeId("deck-plan.svg");
		expect(model.nodes.filter((n) => n.kind === "attachment")).toEqual([
			{ id: file, kind: "attachment", label: "deck-plan.svg", path: "deck-plan.svg" },
		]);
		const fromLines = model.edges.filter((e) => e.target === file);
		expect(fromLines.map((e) => e.kind)).toEqual(["attachment", "attachment"]);
		expect(new Set(fromLines.map((e) => e.source)).size).toBe(2);
	});

	it("drops a link to a note that is not loaded", () => {
		const md = "- Uses [[Rigging]]";
		const model = buildGraph(
			[note("Knots.md", md, (m) => ({ links: [ref(m, "[[Rigging]]", "Rigging")] }))],
			resolverFor(files),
		);
		expect(model.edges.filter((e) => e.kind !== "hierarchy")).toEqual([]);
		expect(model.nodes.some((n) => n.id === noteNodeId("Rigging.md"))).toBe(false);
	});

	it("dedupes repeated links from one line to one target", () => {
		const md = "- [[Rigging]] and [[Rigging]] again";
		const model = knots(md, (m) => {
			const first = m.indexOf("[[Rigging]]");
			const second = m.indexOf("[[Rigging]]", first + 1);
			const pos = (offset: number): Pos => ({ start: { line: 0, col: 0, offset }, end: { line: 0, col: 0, offset } });
			return {
				links: [
					{ link: "Rigging", original: "[[Rigging]]", position: pos(first) },
					{ link: "Rigging", original: "[[Rigging]]", position: pos(second) },
				],
			};
		});
		expect(model.edges.filter((e) => e.kind === "link")).toHaveLength(1);
	});

	it("tolerates a note with no link cache", () => {
		const model = buildGraph([{ tree: parser.parse("- Bowline", "Knots.md"), cache: null }], resolverFor(files));
		expect(model.nodes).toHaveLength(2);
	});
});

describe("buildGraph: tags", () => {
	it("makes one hub per tag, shared across notes and case", () => {
		const a = "- Bowline #knots";
		const b = "- Halyards #Knots/Loops and #knots";
		const model = buildGraph(
			[
				note("A.md", a, (m) => ({ tags: [{ tag: "#knots", position: at(m, "#knots") }] })),
				note("B.md", b, (m) => ({
					tags: [
						{ tag: "#Knots/Loops", position: at(m, "#Knots/Loops") },
						{ tag: "#knots", position: at(m, "#knots") },
					],
				})),
			],
			resolverFor([]),
		);
		const hubs = model.nodes.filter((n) => n.kind === "tag");
		expect(hubs.map((n) => n.id)).toEqual([tagNodeId("knots"), tagNodeId("knots/loops")]);
		expect(edgesFrom(model, lineId(model, "Bowline #knots"))).toEqual([{ kind: "tag", target: tagNodeId("knots") }]);
		expect(edgesFrom(model, lineId(model, "Halyards #Knots/Loops and #knots"))).toEqual([
			{ kind: "tag", target: tagNodeId("knots/loops") },
			{ kind: "tag", target: tagNodeId("knots") },
		]);
	});

	it("joins frontmatter tags to the note core, in list or string form", () => {
		const model = buildGraph(
			[
				note("A.md", "- x", () => ({ frontmatter: { tags: ["#sailing", "rope"] } })),
				note("B.md", "- y", () => ({ frontmatter: { tags: "sailing, weather" } })),
				note("C.md", "- z", () => ({ frontmatter: { tag: "rope" } })),
			],
			resolverFor([]),
		);
		expect(edgesFrom(model, noteNodeId("A.md"))).toEqual([
			{ kind: "tag", target: tagNodeId("sailing") },
			{ kind: "tag", target: tagNodeId("rope") },
		]);
		expect(edgesFrom(model, noteNodeId("B.md"))).toEqual([
			{ kind: "tag", target: tagNodeId("sailing") },
			{ kind: "tag", target: tagNodeId("weather") },
		]);
		expect(edgesFrom(model, noteNodeId("C.md"))).toEqual([{ kind: "tag", target: tagNodeId("rope") }]);
		expect(model.nodes.find((n) => n.id === tagNodeId("sailing"))?.label).toBe("#sailing");
	});
});
