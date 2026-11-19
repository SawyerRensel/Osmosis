import { describe, it, expect } from "vitest";
import type { Pos } from "obsidian";
import { OsmosisParser } from "../parser";
import { planStructural } from "./edit";
import {
	buildGraph,
	noteNodeId,
	tagNodeId,
	attachmentNodeId,
	ghostNodeId,
	linkTargetNode,
	isNoteRoot,
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
		const md = ["# Rigging", "- Halyards ^halyard", "# Running Rigging", "- Sheets"].join("\n");
		const model = buildGraph([note("Rigging.md", md)], resolverFor([]));
		const core = noteNodeId("Rigging.md");

		expect(model.nodes.find((n) => n.id === core)).toMatchObject({ kind: "note", label: "Rigging", path: "Rigging.md" });
		expect(model.nodes.filter((n) => n.kind === "line").map((n) => n.label)).toEqual([
			"Rigging", "Halyards", "Running Rigging", "Sheets",
		]);
		const hierarchy = model.edges.filter((e) => e.kind === "hierarchy");
		expect(hierarchy).toContainEqual({ kind: "hierarchy", source: core, target: lineId(model, "Rigging") });
		expect(hierarchy).toContainEqual({ kind: "hierarchy", source: core, target: lineId(model, "Running Rigging") });
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

describe("buildGraph: the note's root", () => {
	const FM = "---\ntags:\n  - sailing\nsee: \"[[Knots]]\"\n---\n";
	const BASICS = `${FM}\n# Sailing Basics\n\nLearn the ropes first.\n\n- Tie a [[Knots]]\n\t- Check it twice\n`;
	const KNOTS_MD = "# Knots\n\n- Bowline ^bowline\n";
	const basics = (md: string): NoteInput =>
		note("Sailing Basics.md", md, () => ({
			frontmatter: { tags: ["sailing"], see: "[[Knots]]" },
			frontmatterLinks: [{ key: "see", link: "Knots", original: "[[Knots]]" }],
		}));
	const linker = (link: string): NoteInput => {
		const md = `- See [[${link}]]`;
		return note("Log.md", md, (m) => ({ links: [ref(m, `[[${link}]]`, link)] }));
	};
	const resolve = resolverFor(["Sailing Basics.md", "Knots.md", "Log.md"]);
	const ROOT = noteNodeId("Sailing Basics.md");

	it("makes a sole H1 the root: no core, the H1 under the core's ID, with the frontmatter tags, properties and links into the note", () => {
		const model = buildGraph([basics(BASICS), note("Knots.md", KNOTS_MD), linker("Sailing Basics")], resolve);
		const root = model.nodes.find((n) => n.id === ROOT);
		expect(root).toMatchObject({ kind: "line", label: "Sailing Basics", path: "Sailing Basics.md", root: true });
		expect(isNoteRoot(root!)).toBe(true);
		expect(model.nodes.filter((n) => n.path === "Sailing Basics.md" && n.kind === "note")).toEqual([]);
		expect(model.nodes.filter((n) => n.root === true).map((n) => n.id)).toEqual([ROOT, noteNodeId("Knots.md")]);
		expect(model.edges).toContainEqual({ kind: "tag", source: ROOT, target: tagNodeId("sailing") });
		expect(model.edges).toContainEqual({ kind: "property", source: ROOT, target: noteNodeId("Knots.md") });
		expect(model.edges).toContainEqual({ kind: "link", source: lineId(model, "See [[Sailing Basics]]"), target: ROOT });
		// The H1 heads its note: no hierarchy edge into it, one out to each line under it.
		expect(model.edges.filter((e) => e.kind === "hierarchy" && e.target === ROOT)).toEqual([]);
		expect(model.edges).toContainEqual({ kind: "hierarchy", source: ROOT, target: lineId(model, "Learn the ropes first.") });
		expect(linkTargetNode(model, "Sailing Basics.md", "")).toBe(ROOT);
		expect(linkTargetNode(model, "Sailing Basics.md", "Sailing Basics")).toBe(ROOT);
	});

	it("lands a heading link to the sole H1 on the root", () => {
		const model = buildGraph([basics(BASICS), linker("Sailing Basics#Sailing Basics")], resolve);
		expect(model.edges).toContainEqual({ kind: "link", source: lineId(model, "See [[Sailing Basics#Sailing Basics]]"), target: ROOT });
	});

	it("keeps the core as the root with two H1s, or none", () => {
		for (const md of [`${BASICS}\n# Racing\n\n- Start on time\n`, `${FM}\n## Sailing Basics\n\n- Tie a [[Knots]]\n`, "- Just a list\n"]) {
			const model = buildGraph([basics(md)], resolve);
			expect(model.nodes.find((n) => n.id === ROOT)).toMatchObject({ kind: "note", label: "Sailing Basics" });
			expect(model.nodes.some((n) => n.root === true)).toBe(false);
			expect(model.edges).toContainEqual({ kind: "tag", source: ROOT, target: tagNodeId("sailing") });
		}
	});

	it("keeps the core as the root when anything sits outside the H1: a line before it", () => {
		const model = buildGraph([basics(`${FM}\nDraft, not reviewed.\n\n# Sailing Basics\n\n- Tie a [[Knots]]\n`)], resolve);
		expect(model.nodes.find((n) => n.id === ROOT)?.kind).toBe("note");
		expect(model.edges).toContainEqual({ kind: "hierarchy", source: ROOT, target: lineId(model, "Draft, not reviewed.") });
		expect(model.edges).toContainEqual({ kind: "hierarchy", source: ROOT, target: lineId(model, "Sailing Basics") });
	});

	it("keeps the root's ID across edits that keep the H1 sole, its text and block ID included", () => {
		const ids = (md: string): string[] => buildGraph([basics(md)], resolve).nodes.filter(isNoteRoot).map((n) => n.id);
		expect(ids(BASICS)).toEqual([ROOT]);
		expect(ids(BASICS.replace("# Sailing Basics", "# Sailing Fundamentals"))).toEqual([ROOT]);
		expect(ids(BASICS.replace("# Sailing Basics", "# Sailing Basics ^top"))).toEqual([ROOT]);
		expect(ids(BASICS.replace("- Check it twice", "- Check it twice\n- Coil the line"))).toEqual([ROOT]);
	});

	it("hands the ID to the core when a second H1 arrives; the first H1 becomes a line", () => {
		const model = buildGraph([basics(`${BASICS}\n# Racing\n`)], resolve);
		expect(model.nodes.find((n) => n.id === ROOT)?.kind).toBe("note");
		expect(lineId(model, "Sailing Basics")).toMatch(/^line:Sailing Basics\.md#/);
	});

	it("gives a note shown in part no root, sole H1 or not", () => {
		const tree = parser.parse(BASICS, "Sailing Basics.md");
		const h1 = tree.root.children[0]!;
		const model = buildGraph([{ tree, cache: null, only: new Set([h1.children[0]!]) }], resolve);
		expect(model.nodes.some(isNoteRoot)).toBe(false);
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

	it("draws no edge for a block or heading that is missing in another note, but does for a plain link", () => {
		const md = "- A [[Rigging#^gone]]\n- B [[Rigging#No Such Heading]]\n- C [[Rigging]]";
		const model = knots(md, (m) => ({
			links: [ref(m, "[[Rigging#^gone]]", "Rigging#^gone"), ref(m, "[[Rigging#No Such Heading]]", "Rigging#No Such Heading"), ref(m, "[[Rigging]]", "Rigging")],
		}));
		expect(edgesFrom(model, lineId(model, "A [[Rigging#^gone]]"))).toEqual([]);
		expect(edgesFrom(model, lineId(model, "B [[Rigging#No Such Heading]]"))).toEqual([]);
		expect(edgesFrom(model, lineId(model, "C [[Rigging]]"))).toEqual([{ kind: "link", target: noteNodeId("Rigging.md") }]);
		expect(model.nodes.some((n) => n.kind === "ghost")).toBe(false);
	});

	it("draws no edge for a missing same-note heading until the heading exists", () => {
		// The note is one H1, so its root is the H1 under the core's ID: the edge used to land there.
		const before = "# Plan\n- See [[#Nowhere]]";
		const missing = knots(before, (m) => ({ links: [ref(m, "[[#Nowhere]]", "#Nowhere")] }));
		expect(edgesFrom(missing, lineId(missing, "See [[#Nowhere]]"))).toEqual([]);
		expect(missing.edges.filter((e) => e.kind !== "hierarchy")).toEqual([]);

		const after = "# Plan\n- See [[#Nowhere]]\n## Nowhere";
		const found = knots(after, (m) => ({ links: [ref(m, "[[#Nowhere]]", "#Nowhere")] }));
		expect(edgesFrom(found, lineId(found, "See [[#Nowhere]]"))).toEqual([{ kind: "link", target: lineId(found, "Nowhere") }]);
	});

	it("draws no embed edge for a missing section", () => {
		const md = "- Bowline\n\n![[Rigging#No Such Heading]]";
		const model = knots(md, (m) => ({ embeds: [ref(m, "![[Rigging#No Such Heading]]", "Rigging#No Such Heading")] }));
		expect(model.edges.filter((e) => e.kind === "embed")).toEqual([]);
	});

	it("resolves a same-note heading ref", () => {
		const md = "# Bends\n- Back to [[#Bends]]";
		const model = knots(md, (m) => ({ links: [ref(m, "[[#Bends]]", "#Bends")] }));
		expect(edgesFrom(model, lineId(model, "Back to [[#Bends]]"))).toEqual([{ kind: "link", target: lineId(model, "Bends") }]);
	});

	it("gives a note embed line no plate: its parent's embed edge goes straight to the note's sole H1", () => {
		const md = "# Knots\n- Bowline\n\n![[Rigging]]";
		const model = knots(md, (m) => ({ embeds: [ref(m, "![[Rigging]]", "Rigging")] }));
		expect(model.nodes.some((n) => n.source?.type === "transclusion")).toBe(false);
		// One "Rigging" plate: the embedded note's H1, its root.
		expect(model.nodes.filter((n) => n.label === "Rigging")).toMatchObject([{ id: noteNodeId("Rigging.md"), kind: "line", root: true }]);
		expect(edgesFrom(model, noteNodeId("Knots.md"))).toEqual([{ kind: "embed", target: noteNodeId("Rigging.md") }]);
	});

	it("sends a whole-note embed to the file-name plate when the note has no sole H1", () => {
		const md = "## Knots\n![[Moorings]]";
		const moorings = note("Moorings.md", "- Swing mooring\n- Pile mooring");
		const model = buildGraph([note("Knots.md", md, (m) => ({ embeds: [ref(m, "![[Moorings]]", "Moorings")] })), moorings], resolverFor(["Knots.md", "Moorings.md"]));
		expect(model.nodes.find((n) => n.id === noteNodeId("Moorings.md"))).toMatchObject({ kind: "note", label: "Moorings" });
		expect(edgesFrom(model, lineId(model, "Knots"))).toEqual([{ kind: "embed", target: noteNodeId("Moorings.md") }]);
	});

	it("sends a heading embed and a block embed from the parent line to that heading's and block's plates", () => {
		const md = "# Knots\n- Sections\n  - ![[Rigging#Running Rigging]]\n- Blocks\n  - ![[Rigging#^halyard]]";
		const model = knots(md, (m) => ({
			embeds: [ref(m, "![[Rigging#Running Rigging]]", "Rigging#Running Rigging"), ref(m, "![[Rigging#^halyard]]", "Rigging#^halyard")],
		}));
		expect(model.nodes.some((n) => n.source?.type === "transclusion")).toBe(false);
		expect(edgesFrom(model, lineId(model, "Sections"))).toEqual([{ kind: "embed", target: lineId(model, "Running Rigging") }]);
		expect(edgesFrom(model, lineId(model, "Blocks"))).toEqual([{ kind: "embed", target: lineId(model, "Halyards") }]);
	});

	it("keeps a list item with text before its embed: the item's own plate carries the embed edge", () => {
		const md = "- Rigging overview ![[Rigging]]";
		const model = knots(md, (m) => ({ embeds: [ref(m, "![[Rigging]]", "Rigging")] }));
		expect(model.nodes.some((n) => n.source?.type === "transclusion")).toBe(false);
		expect(edgesFrom(model, lineId(model, "Rigging overview"))).toEqual([{ kind: "embed", target: noteNodeId("Rigging.md") }]);
	});

	it("re-parents anything under an embed line to the embed line's parent", () => {
		const md = "# Knots\n- Lines\n  - ![[Rigging]]";
		const tree = parser.parse(md, "Knots.md");
		// The parser hangs indented lines from the enclosing item, never from an embed; build one by hand.
		const embedLine = tree.root.children[0]!.children[0]!.children[0]!;
		expect(embedLine.type).toBe("transclusion");
		embedLine.children.push({ ...embedLine, id: "under", type: "bullet", content: "Coiled", raw: "Coiled", children: [], blockId: undefined });
		const model = buildGraph([{ tree, cache: { embeds: [ref(md, "![[Rigging]]", "Rigging")] } }, target()], resolverFor(files));
		const coiled = lineId(model, "Coiled");
		expect(model.edges.filter((e) => e.target === coiled)).toEqual([{ kind: "hierarchy", source: lineId(model, "Lines"), target: coiled }]);
	});

	it("lands a link to an embed line's block ID on the line above it", () => {
		const md = "# Knots\n- Lines\n  - ![[Rigging]] ^lines-embed\n- See [[#^lines-embed]]";
		const model = knots(md, (m) => ({ embeds: [ref(m, "![[Rigging]]", "Rigging")], links: [ref(m, "[[#^lines-embed]]", "#^lines-embed")] }));
		expect(edgesFrom(model, lineId(model, "See [[#^lines-embed]]"))).toEqual([{ kind: "link", target: lineId(model, "Lines") }]);
	});

	it("keeps the plate of an embed line that is a partial note's root: nothing is above it", () => {
		const md = "# Knots\n- ![[Rigging]] ^lines-embed";
		const tree = parser.parse(md, "Knots.md");
		const embedLine = tree.root.children[0]!.children[0]!;
		expect(embedLine.type).toBe("transclusion");
		const model = buildGraph([{ tree, cache: { embeds: [ref(md, "![[Rigging]]", "Rigging")] }, only: new Set([embedLine]) }, target()], resolverFor(files));
		const plate = model.nodes.find((n) => n.source === embedLine);
		expect(plate).toBeDefined();
		expect(edgesFrom(model, plate!.id)).toEqual([{ kind: "embed", target: noteNodeId("Rigging.md") }]);
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

describe("buildGraph: a link cache that lags an edit", () => {
	// A structural edit writes the file and rebuilds at once, while Obsidian's link
	// cache still holds the old bytes' offsets: the tree is new, the cache is old.
	const files = ["Rigging.md"];
	const staleCache = (md: string): LinkCacheLike => ({
		links: [...md.matchAll(/\[\[[^\]]*\]\]/g)].map((m) => ref(md, m[0], m[0].slice(2, -2))),
		tags: md.includes("#knot") ? [{ tag: "#knot", position: at(md, "#knot") }] : [],
	});
	/** `before` and the text after spawning an empty child under Alpha, as Tab in 3D edit mode writes it. */
	function spawnUnderAlpha(next: string): { before: string; after: string } {
		const before = ["# Plan", "- Alpha", next, "- Charlie"].join("\n");
		const tree = parser.parse(before, "Plan.md");
		const alpha = tree.root.children[0]?.children[0];
		if (alpha === undefined) throw new Error("no Alpha");
		const plan = planStructural("child", before, tree.root, alpha);
		if (plan === null) throw new Error("no plan");
		return { before, after: plan.text };
	}
	function staleModel(next: string): { model: GraphModel; fresh: string } {
		const { before, after } = spawnUnderAlpha(next);
		const model = buildGraph([{ tree: parser.parse(after, "Plan.md"), cache: staleCache(before) }, target()], resolverFor(files));
		const fresh = model.nodes.find((n) => n.kind === "line" && n.label === "");
		if (fresh === undefined) throw new Error("no spawned line");
		return { model, fresh: fresh.id };
	}

	it("draws no edge from a spawned plate for a stale missing-heading link (the reported edge to the root)", () => {
		// Before the fix: the stale `[[#Nowhere]]` offset fell inside the new line, and the missing heading fell back to the root.
		const { model, fresh } = staleModel("- [[#Nowhere]]");
		expect(edgesFrom(model, fresh)).toEqual([]);
	});

	it("draws no edge from a spawned plate for a stale resolved link or tag", () => {
		const { model, fresh } = staleModel("- [[Rigging]] #knot");
		expect(edgesFrom(model, fresh)).toEqual([]);
	});

	it("still places a reference whose line holds it", () => {
		const md = ["# Plan", "- Alpha", "- Charlie [[Rigging]] #knot"].join("\n");
		const model = buildGraph([{ tree: parser.parse(md, "Plan.md"), cache: staleCache(md) }, target()], resolverFor(files));
		expect(edgesFrom(model, lineId(model, "Charlie [[Rigging]] #knot"))).toEqual([
			{ kind: "link", target: noteNodeId("Rigging.md") },
			{ kind: "tag", target: tagNodeId("knot") },
		]);
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

describe("linkTargetNode", () => {
	const md = "# Rigging\n\n## Sheets  and Lines\n\n- Halyard ^halyard\n\n## Sheets and lines\n";
	const model = buildGraph([note("Boat.md", md)], resolverFor(["Boat.md"]));

	it("lands on the note core with no subpath", () => {
		expect(linkTargetNode(model, "Boat.md", "")).toBe(noteNodeId("Boat.md"));
	});

	it("lands on the first heading matching the last segment, ignoring case and spacing", () => {
		const id = linkTargetNode(model, "Boat.md", "Rigging#sheets and lines");
		const node = model.nodes.find((n) => n.id === id);
		expect(node?.label).toBe("Sheets  and Lines");
	});

	it("lands on a block's line", () => {
		expect(linkTargetNode(model, "Boat.md", "^halyard")).toBe("line:Boat.md#^halyard");
	});

	it("falls back to the core for a missing heading or block", () => {
		expect(linkTargetNode(model, "Boat.md", "Anchoring")).toBe(noteNodeId("Boat.md"));
		expect(linkTargetNode(model, "Boat.md", "^nope")).toBe(noteNodeId("Boat.md"));
	});

	it("is null for a note that isn't loaded", () => {
		expect(linkTargetNode(model, "Other.md", "")).toBeNull();
	});
});
