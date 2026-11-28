import { describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import { convertBranchToNote } from "./convert-branch";
import { EditHistory } from "./edit-history";
import { EditPipeline } from "./edit-pipeline";
import type { MoveContext } from "./edit-moves";
import { normalizeWrite } from "./mindmap-edit";
import { OsmosisParser } from "./parser";
import type { OsmosisNode } from "./types";

/**
 * Convert branch carrying `osmosis-styles` between notes in either mode
 * (T127): the source's styles are read from and removed from the file that
 * holds them, and the new note's land where `targetFor` sends its data.
 */

const parser = new OsmosisParser();
const SIDECAR_FOLDER = "Osmosis/Schedule";

const STYLES = {
	styles: {
		"^os-sail01": { fill: "#ff0000" },
		"^os-keep01": { fill: "#00ff00" },
	},
};

const BODY = [
	"# Voyage",
	"",
	"- Raise the sail ^os-sail01",
	"\t- Check the halyard",
	"- Coil the lines ^os-keep01",
	"",
].join("\n");

const withFrontmatter = (fm: Record<string, unknown>, body: string): string => `---\n${JSON.stringify(fm)}\n---\n${body}`;

/** Frontmatter is JSON on one line (valid YAML), so the stub's `parseYaml` reads it. */
function splitFrontmatter(content: string): { fm: Record<string, unknown>; body: string } {
	const match = /^---\n(.*)\n---\n/.exec(content);
	if (!match?.[1]) return { fm: {}, body: content };
	return { fm: JSON.parse(match[1]) as Record<string, unknown>, body: content.slice(match[0].length) };
}

const fmOf = (content: string | undefined): Record<string, unknown> => splitFrontmatter(content ?? "").fm;

interface Fake {
	files: Record<string, string>;
	ctx: MoveContext;
	source: TFile;
}

/**
 * A vault holding `Voyage.md`. `sidecars` maps a note to its sidecar; `dataLocation`
 * is where a note with neither gets its data (the new note, here).
 */
function fake(initial: Record<string, string>, sidecars: Record<string, string>, dataLocation: "note" | "sidecar"): Fake {
	const files = { ...initial };
	const index = { ...sidecars };
	const tfiles = new Map<string, TFile>();
	const tfile = (path: string): TFile => {
		let file = tfiles.get(path);
		if (!file) tfiles.set(path, (file = Object.assign(new TFile(), { path, basename: path.replace(/^.*\//, "").replace(/\.md$/, "") })));
		return file;
	};
	for (const path of Object.keys(files)) tfile(path);
	const exists = (path: string): TFile | null => (path in files ? tfile(path) : null);
	const app = {
		vault: {
			getFileByPath: exists,
			getAbstractFileByPath: exists,
			read: (file: TFile) => Promise.resolve(files[file.path] ?? ""),
			modify: (file: TFile, content: string) => {
				files[file.path] = content;
				return Promise.resolve();
			},
			create: (path: string, content: string) => {
				files[path] = content;
				return Promise.resolve(tfile(path));
			},
			createFolder: () => Promise.resolve(),
			process: (file: TFile, fn: (data: string) => string) => {
				files[file.path] = fn(files[file.path] ?? "");
				return Promise.resolve(files[file.path]);
			},
		},
		metadataCache: {
			resolvedLinks: {},
			getFirstLinkpathDest: () => null,
			fileToLinktext: (file: TFile) => file.basename,
		},
		fileManager: {
			processFrontMatter: (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				const { fm, body } = splitFrontmatter(files[file.path] ?? "");
				fn(fm);
				files[file.path] = Object.keys(fm).length > 0 ? withFrontmatter(fm, body) : body;
				return Promise.resolve();
			},
		},
	} as unknown as App;
	const edits = new EditPipeline(app, new EditHistory(() => ({ maxSteps: 50, maxMemoryMB: 20 })), () => "Voyage.md", () => undefined);
	const ctx: MoveContext = {
		app,
		edits,
		write: (file, content) => edits.write(file, normalizeWrite(content)),
		processFrontMatter: async (file, fn) => {
			await edits.processFrontMatter(file, fn);
		},
		plugin: {
			scheduleStore: { flushPath: () => Promise.resolve() },
			noteData: {
				sidecarOf: (file) => {
					const path = index[file.path];
					return path === undefined ? null : tfile(path);
				},
				targetFor: (file) => {
					const own = index[file.path];
					if (own !== undefined) return Promise.resolve(tfile(own));
					if (dataLocation === "note") return Promise.resolve(file);
					const path = `${SIDECAR_FOLDER}/${file.basename}.osmosis.md`;
					files[path] = withFrontmatter({ "osmosis-note": `[[${file.basename}]]` }, "");
					index[file.path] = path;
					return Promise.resolve(tfile(path));
				},
			},
			cardSync: { handleBlockMove: () => undefined },
			refreshDashboard: () => undefined,
		},
	};
	return { files, ctx, source: tfile("Voyage.md") };
}

function find(root: OsmosisNode, content: string): OsmosisNode {
	const walk = (node: OsmosisNode): OsmosisNode | null => {
		if (node.content === content) return node;
		for (const child of node.children) {
			const found = walk(child);
			if (found !== null) return found;
		}
		return null;
	};
	const node = walk(root);
	if (node === null) throw new Error(`no node "${content}"`);
	return node;
}

async function convertSail(f: Fake): Promise<string> {
	const line = find(parser.parse(f.files["Voyage.md"]!, "Voyage.md").root, "Raise the sail");
	const converted = await convertBranchToNote(f.ctx, { folder: "", template: "" }, f.source, line.id);
	if (converted === null) throw new Error("conversion bailed");
	return converted.file.path;
}

const stylesIn = (content: string | undefined): unknown => fmOf(content)["osmosis-styles"];

describe("convertBranchToNote carries styles in each note's mode", () => {
	it("note to note: the styles move between the two notes' own frontmatter", async () => {
		const f = fake({ "Voyage.md": withFrontmatter({ "osmosis-styles": STYLES }, BODY) }, {}, "note");
		const created = await convertSail(f);

		expect(stylesIn(f.files[created])).toEqual({ styles: { "^os-sail01": { fill: "#ff0000" } } });
		expect(stylesIn(f.files["Voyage.md"])).toEqual({ styles: { "^os-keep01": { fill: "#00ff00" } } });
		expect(Object.keys(f.files).some((path) => path.startsWith(SIDECAR_FOLDER))).toBe(false);
	});

	it("sidecar to sidecar: both notes' frontmatter stays free of styles", async () => {
		const sidecar = `${SIDECAR_FOLDER}/a1b2c3d4.osmosis.md`;
		const f = fake(
			{
				"Voyage.md": BODY,
				[sidecar]: withFrontmatter({ "osmosis-note": "[[Voyage]]", "osmosis-styles": STYLES }, ""),
			},
			{ "Voyage.md": sidecar },
			"sidecar",
		);
		const created = await convertSail(f);
		const createdSidecar = `${SIDECAR_FOLDER}/Raise the sail.osmosis.md`;

		expect(stylesIn(f.files[createdSidecar])).toEqual({ styles: { "^os-sail01": { fill: "#ff0000" } } });
		expect(stylesIn(f.files[sidecar])).toEqual({ styles: { "^os-keep01": { fill: "#00ff00" } } });
		expect(stylesIn(f.files[created])).toBeUndefined();
		expect(stylesIn(f.files["Voyage.md"])).toBeUndefined();
	});

	it("sidecar source to a note-mode new note", async () => {
		const sidecar = `${SIDECAR_FOLDER}/a1b2c3d4.osmosis.md`;
		const f = fake(
			{
				"Voyage.md": BODY,
				[sidecar]: withFrontmatter({ "osmosis-note": "[[Voyage]]", "osmosis-styles": STYLES }, ""),
			},
			{ "Voyage.md": sidecar },
			"note",
		);
		const created = await convertSail(f);

		expect(stylesIn(f.files[created])).toEqual({ styles: { "^os-sail01": { fill: "#ff0000" } } });
		expect(stylesIn(f.files[sidecar])).toEqual({ styles: { "^os-keep01": { fill: "#00ff00" } } });
		expect(stylesIn(f.files["Voyage.md"])).toBeUndefined();
	});

	it("note-mode source to a sidecar-mode new note", async () => {
		const f = fake({ "Voyage.md": withFrontmatter({ "osmosis-styles": STYLES }, BODY) }, {}, "sidecar");
		const created = await convertSail(f);
		const createdSidecar = `${SIDECAR_FOLDER}/Raise the sail.osmosis.md`;

		expect(stylesIn(f.files[createdSidecar])).toEqual({ styles: { "^os-sail01": { fill: "#ff0000" } } });
		expect(stylesIn(f.files[created])).toBeUndefined();
		expect(stylesIn(f.files["Voyage.md"])).toEqual({ styles: { "^os-keep01": { fill: "#00ff00" } } });
	});

	it("a sidecar without styles leaves them read from, and removed from, the note", async () => {
		const sidecar = `${SIDECAR_FOLDER}/a1b2c3d4.osmosis.md`;
		const f = fake(
			{
				"Voyage.md": withFrontmatter({ "osmosis-styles": STYLES }, BODY),
				[sidecar]: withFrontmatter({ "osmosis-note": "[[Voyage]]" }, ""),
			},
			{ "Voyage.md": sidecar },
			"note",
		);
		const created = await convertSail(f);

		expect(stylesIn(f.files[created])).toEqual({ styles: { "^os-sail01": { fill: "#ff0000" } } });
		expect(stylesIn(f.files["Voyage.md"])).toEqual({ styles: { "^os-keep01": { fill: "#00ff00" } } });
		expect(stylesIn(f.files[sidecar])).toBeUndefined();
	});
});
