import { describe, it, expect } from "vitest";
import { OsmosisParser } from "../parser";
import { buildGraph, type GraphModel, type LinkCacheLike, type LinkResolver, type NoteInput } from "./model";
import { collectEmbedded } from "./transcluded";
import { placeNodes } from "./positions";

const parser = new OsmosisParser();

/** A note whose cache lists every `![[…]]` as an embed and every `[[…]]` as a link, like Obsidian's. */
function note(path: string, md: string): NoteInput {
	const cache: LinkCacheLike = { links: [], embeds: [], tags: [] };
	for (const match of md.matchAll(/#([a-z][\w-]*)\b/g)) {
		if (md[match.index - 1] !== " ") continue;
		cache.tags!.push({ tag: match[0], position: { start: { line: 0, col: 0, offset: match.index }, end: { line: 0, col: 0, offset: match.index + match[0].length } } });
	}
	for (const match of md.matchAll(/(!?)\[\[([^\]]+)\]\]/g)) {
		const entry = { link: match[2]!, original: match[0], position: { start: { line: 0, col: 0, offset: match.index }, end: { line: 0, col: 0, offset: match.index + match[0].length } } };
		(match[1] === "!" ? cache.embeds : cache.links)!.push(entry);
	}
	return { tree: parser.parse(md, path), cache };
}

const FILES: Record<string, string> = {
	"Focus.md": [
		"# Focus",
		"- Own line #own",
		"## Whole",
		"![[Whole]]",
		"## Section",
		"![[Notes#Bends]]",
		"## Block",
		"![[Notes#^bowline]]",
		"## Plain",
		"- See [[Linked]] and [[Missing]] and [[chart.pdf]] and ![[diagram.svg]]",
	].join("\n"),
	"Whole.md": ["# Whole", "- Wide", "- Narrow"].join("\n"),
	"Notes.md": ["# Notes", "- Bowline ^bowline", "- Clove hitch", "## Bends", "- Sheet bend", "## Other", "- Not shown"].join("\n"),
	"Linked.md": "# Linked\n- Never loaded",
};

const resolverFor = (files: Record<string, string>): LinkResolver => (linkpath) => {
	const path = /\.[a-z0-9]+$/i.test(linkpath) ? linkpath : `${linkpath}.md`;
	return path in files || path === "chart.pdf" || path === "diagram.svg" ? path : null;
};

function readerFor(files: Record<string, string>): (path: string) => Promise<NoteInput | null> {
	return (path) => Promise.resolve(files[path] === undefined ? null : note(path, files[path]));
}

async function depthZero(files: Record<string, string> = FILES, focus = "Focus.md"): Promise<{ model: GraphModel; paths: string[] }> {
	const read = readerFor(files);
	const resolve = resolverFor(files);
	const embedded = await collectEmbedded((await read(focus))!, read, resolve);
	const model = buildGraph(embedded.notes, resolve, { contentOnly: true });
	return { model, paths: embedded.notes.map((n) => n.tree.filePath) };
}

const labels = (model: GraphModel, path: string): string[] => model.nodes.filter((n) => n.kind === "line" && n.path === path).map((n) => n.label);

describe("depth 0: collectEmbedded", () => {
	it("loads the focus and the notes it embeds, not the notes it links to", async () => {
		const { paths } = await depthZero();
		expect(paths).toEqual(["Focus.md", "Whole.md", "Notes.md"]);
	});

	it("shows a whole embedded note with its core", async () => {
		const { model } = await depthZero();
		expect(model.nodes.some((n) => n.id === "note:Whole.md")).toBe(true);
		expect(labels(model, "Whole.md")).toEqual(["Whole", "Wide", "Narrow"]);
	});

	it("shows only the heading section and the block an embed names", async () => {
		const { model } = await depthZero();
		expect(labels(model, "Notes.md")).toEqual(["Bowline", "Bends", "Sheet bend"]);
		// A partial note has no core.
		expect(model.nodes.some((n) => n.id === "note:Notes.md")).toBe(false);
	});

	it("draws an embed edge from the embedding line to each shown part", async () => {
		const { model } = await depthZero();
		const into = (label: string): { kind: string; source: string }[] => {
			const id = model.nodes.find((n) => n.label === label)!.id;
			return model.edges.filter((e) => e.target === id && e.kind === "embed").map(({ kind, source }) => ({ kind, source }));
		};
		expect(into("Bends")).toHaveLength(1);
		expect(into("Bowline")).toHaveLength(1);
		expect(model.edges.filter((e) => e.kind === "embed" && e.target === "note:Whole.md")).toHaveLength(1);
	});

	it("adds no node for plain links, to notes, unresolved targets or attachments", async () => {
		const { model } = await depthZero();
		expect(model.nodes.some((n) => n.path === "Linked.md" || n.kind === "ghost")).toBe(false);
		expect(model.nodes.some((n) => n.id === "file:chart.pdf")).toBe(false);
		expect(model.edges.some((e) => e.kind === "link")).toBe(false);
		// An embedded attachment is content, and tags are in the note's own text.
		expect(model.nodes.some((n) => n.id === "file:diagram.svg")).toBe(true);
		expect(model.nodes.some((n) => n.id === "tag:own")).toBe(true);
	});

	it("follows embeds nested in embedded content, once, through cycles", async () => {
		const files = {
			"A.md": "# A\n![[B#Part]]",
			"B.md": "# B\n- Top\n## Part\n![[C]]\n## Elsewhere\n![[D]]",
			"C.md": "# C\n- Deep\n## Back\n![[A]]",
			"D.md": "# D\n- Not reached",
		};
		const read = readerFor(files);
		const resolveAll = resolverFor(files);
		const real = await collectEmbedded((await read("A.md"))!, read, resolveAll);
		expect(real.notes.map((n) => n.tree.filePath)).toEqual(["A.md", "B.md", "C.md"]);
		expect(real.hops.get("C.md")).toBe(2);
		expect(real.via.get("C.md")).toBe("B.md");
		const model = buildGraph(real.notes, resolveAll, { contentOnly: true });
		expect(model.nodes.some((n) => n.label === "Top" || n.label === "Not reached")).toBe(false);
	});

	it("does not follow an embed that sits outside the part shown", async () => {
		const files = { "A.md": "# A\n![[B#One]]", "B.md": "# B\n## One\n- In\n## Two\n![[C]]", "C.md": "# C" };
		const read = readerFor(files);
		const embedded = await collectEmbedded((await read("A.md"))!, read, resolverFor(files));
		expect(embedded.notes.map((n) => n.tree.filePath)).toEqual(["A.md", "B.md"]);
	});

	it("merges two embeds of one note: a section and then the whole", async () => {
		const files = { "A.md": "# A\n![[B#Bends]]\n![[B]]", "B.md": "# B\n- Top\n## Bends\n- Bend" };
		const { model } = await depthZero(files, "A.md");
		expect(model.nodes.some((n) => n.id === "note:B.md")).toBe(true);
		expect(labels(model, "B.md")).toEqual(["B", "Top", "Bends", "Bend"]);
	});

	it("falls back to the whole note when the subpath matches nothing", async () => {
		const files = { "A.md": "# A\n![[B#Nowhere]]", "B.md": "# B\n- Only line" };
		const { model } = await depthZero(files, "A.md");
		expect(labels(model, "B.md")).toEqual(["B", "Only line"]);
	});

	it("keeps an empty focus note: its core alone", async () => {
		const { model } = await depthZero({ "Empty.md": "" }, "Empty.md");
		expect(model.nodes.map((n) => n.id)).toEqual(["note:Empty.md"]);
	});
});

describe("depth 0: placement", () => {
	it("seeds a section shown without its note beside the line that embeds it", async () => {
		const { model } = await depthZero();
		const embedder = model.edges.find((e) => e.kind === "embed" && model.nodes.find((n) => n.id === e.target)?.label === "Bends")!.source;
		const current = new Map([[embedder, { x: 500, y: 0, z: 0, pinned: true }]]);
		const placed = placeNodes(model, current, new Map([["Notes.md", "Focus.md"]]), () => 0.5);
		const bends = placed.get(model.nodes.find((n) => n.label === "Bends")!.id)!;
		expect(Math.hypot(bends.x - 500, bends.y, bends.z)).toBeGreaterThan(50);
	});
});
