import { beforeEach, describe, expect, it } from "vitest";
import { Notice, TFile, type App } from "obsidian";
import { EditHistory } from "./edit-history";
import { EditPipeline } from "./edit-pipeline";
import { migrateBlockIdentity, moveAcrossFiles, readMovedScheduleEntries, type MoveContext } from "./edit-moves";
import { dropContext, normalizeWrite, resolveInsertSite } from "./mindmap-edit";
import { OsmosisParser } from "./parser";
import type { OsmosisNode } from "./types";

/**
 * The cross-note move, extracted unchanged from `MindMapView`, run against a
 * fake vault. These pin what the mind map did: the destination is written
 * before the origin, review history follows the block IDs, and the whole
 * gesture is one undo step over both notes.
 */

const parser = new OsmosisParser();
/** The stub's record of notices shown (not on the real `Notice` type). */
const shown = (Notice as unknown as { shown: string[] }).shown;

const DOCK = [
	"---",
	'{"osmosis-schedule":{"os-fend01":{"due":"2026-10-01"},"os-keep01":{"due":"2026-10-02"}}}',
	"---",
	"- Rig the fenders ^os-fend01",
	"\t- Two on the bow",
	"- Coil the lines ^os-keep01",
	"",
].join("\n");

const HARBOUR = ["# Harbour", "", "- Visitor pontoon", ""].join("\n");

interface Fake {
	files: Record<string, string>;
	log: string[];
	ctx: MoveContext;
	history: EditHistory;
	failWrite: Set<string>;
}

/** Frontmatter is JSON on one line (valid YAML), so the stub's `parseYaml` reads it. */
function splitFrontmatter(content: string): { fm: Record<string, unknown>; body: string } {
	const match = /^---\n(.*)\n---\n/.exec(content);
	if (!match?.[1]) return { fm: {}, body: content };
	return { fm: JSON.parse(match[1]) as Record<string, unknown>, body: content.slice(match[0].length) };
}

function fake(initial: Record<string, string>): Fake {
	const files = { ...initial };
	const log: string[] = [];
	const failWrite = new Set<string>();
	const tfiles = new Map<string, TFile>();
	for (const path of Object.keys(files)) tfiles.set(path, Object.assign(new TFile(), { path, basename: path.replace(/\.md$/, "") }));
	const app = {
		vault: {
			getFileByPath: (path: string) => tfiles.get(path) ?? null,
			read: (file: TFile) => Promise.resolve(files[file.path] ?? ""),
			modify: (file: TFile, content: string) => {
				if (failWrite.has(file.path)) return Promise.reject(new Error("disk full"));
				log.push(`write ${file.path}`);
				files[file.path] = content;
				return Promise.resolve();
			},
		},
		fileManager: {
			processFrontMatter: (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
				const { fm, body } = splitFrontmatter(files[file.path] ?? "");
				fn(fm);
				files[file.path] = Object.keys(fm).length > 0 ? `---\n${JSON.stringify(fm)}\n---\n${body}` : body;
				log.push(`frontmatter ${file.path}`);
				return Promise.resolve();
			},
		},
	} as unknown as App;
	const history = new EditHistory(() => ({ maxSteps: 50, maxMemoryMB: 20 }));
	const edits = new EditPipeline(app, history, () => "Dock.md", () => undefined);
	const ctx: MoveContext = {
		app,
		edits,
		write: (file, content) => edits.write(file, normalizeWrite(content)),
		processFrontMatter: async (file, fn) => {
			await edits.processFrontMatter(file, fn);
		},
		plugin: {
			scheduleStore: {
				flushPath: (path) => {
					log.push(`flush ${path}`);
					return Promise.resolve();
				},
			},
			cardSync: { handleBlockMove: (from, to, ids) => log.push(`cards ${from} -> ${to}: ${[...ids].join(",")}`) },
			refreshDashboard: () => log.push("dashboard"),
		},
		settle: () => {
			log.push("settle");
			return Promise.resolve();
		},
	};
	return { files, log, ctx, history, failWrite };
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

/** Move "Rig the fenders" (and its child) under "Visitor pontoon", as the 3D graph's "Move under" does. */
async function moveFendersUnderPontoon(f: Fake): ReturnType<typeof moveAcrossFiles> {
	const fenders = find(parser.parse(f.files["Dock.md"]!, "Dock.md").root, "Rig the fenders");
	const pontoon = find(parser.parse(f.files["Harbour.md"]!, "Harbour.md").root, "Visitor pontoon");
	const site = resolveInsertSite(pontoon, pontoon.children.length, () => "Harbour.md");
	return moveAcrossFiles(f.ctx, [fenders], site, "Dock.md", (src) => dropContext(pontoon, pontoon.children.length, src));
}

beforeEach(() => {
	shown.length = 0;
});

describe("moveAcrossFiles", () => {
	it("moves the subtree with its block IDs, re-levelled for the destination, and its review history with it", async () => {
		const f = fake({ "Dock.md": DOCK, "Harbour.md": HARBOUR });
		const moved = await moveFendersUnderPontoon(f);

		expect(f.files["Harbour.md"]).toBe(
			[
				'---',
				'{"osmosis-schedule":{"os-fend01":{"due":"2026-10-01"}}}',
				"---",
				"# Harbour",
				"",
				"- Visitor pontoon",
				"\t- Rig the fenders ^os-fend01",
				"\t\t- Two on the bow",
				"",
			].join("\n"),
		);
		expect(f.files["Dock.md"]).toBe(['---', '{"osmosis-schedule":{"os-keep01":{"due":"2026-10-02"}}}', "---", "- Coil the lines ^os-keep01", ""].join("\n"));
		expect(moved).not.toBeNull();
		expect(moved!.text.slice(moved!.start).startsWith("\t- Rig the fenders ^os-fend01\n")).toBe(true);
	});

	it("writes the destination before the origin, then the schedules, all before re-syncing", async () => {
		const f = fake({ "Dock.md": DOCK, "Harbour.md": HARBOUR });
		await moveFendersUnderPontoon(f);
		expect(f.log).toEqual([
			"write Harbour.md",
			"write Dock.md",
			"flush Dock.md",
			"frontmatter Harbour.md",
			"frontmatter Dock.md",
			"cards Dock.md -> Harbour.md: os-fend01",
			"dashboard",
			"settle",
		]);
	});

	it("is one undo step over both notes, text and schedules together", async () => {
		const f = fake({ "Dock.md": DOCK, "Harbour.md": HARBOUR });
		await moveFendersUnderPontoon(f);
		// Filed under every file it wrote, so either note's Ctrl+Z finds it.
		const restored = await f.ctx.edits.step("Harbour.md", false);
		expect(restored?.map((file) => file.path).sort()).toEqual(["Dock.md", "Harbour.md"]);
		expect(f.files["Dock.md"]).toBe(DOCK);
		expect(f.files["Harbour.md"]).toBe(HARBOUR);
		expect(f.history.undo("Dock.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("leaves both notes as they were when the destination can't be written", async () => {
		const f = fake({ "Dock.md": DOCK, "Harbour.md": HARBOUR });
		f.failWrite.add("Harbour.md");
		expect(await moveFendersUnderPontoon(f)).toBeNull();
		expect(f.files["Dock.md"]).toBe(DOCK);
		expect(f.files["Harbour.md"]).toBe(HARBOUR);
		expect(shown).toEqual(["Osmosis: couldn't write Harbour — move cancelled"]);
		expect(f.log).toEqual(["settle"]);
		expect(f.history.undo("Dock.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("duplicates rather than loses the block when the origin can't be written, and undo removes the copy", async () => {
		const f = fake({ "Dock.md": DOCK, "Harbour.md": HARBOUR });
		f.failWrite.add("Dock.md");
		expect(await moveFendersUnderPontoon(f)).toBeNull();
		expect(f.files["Dock.md"]).toBe(DOCK);
		expect(f.files["Harbour.md"]).toContain("Rig the fenders ^os-fend01");
		expect(shown).toEqual(["Osmosis: moved into Harbour but couldn't update Dock — undo to revert"]);
		await f.ctx.edits.step("Dock.md", false);
		expect(f.files["Harbour.md"]).toBe(HARBOUR);
	});

	it("does nothing, and does not re-sync, when a note has gone", async () => {
		const f = fake({ "Dock.md": DOCK });
		const fenders = find(parser.parse(DOCK, "Dock.md").root, "Rig the fenders");
		const moved = await moveAcrossFiles(f.ctx, [fenders], { path: "Gone.md", offset: 0 }, "Dock.md", () => ({ type: "bullet", depth: 0 }));
		expect(moved).toBeNull();
		expect(shown).toEqual(["Osmosis: the destination note is no longer available"]);
		expect(f.log).toEqual([]);
	});

	it("writes no frontmatter for lines without block IDs", async () => {
		const plain = "- Stow the boat hook\n- Coil the lines\n";
		const f = fake({ "Dock.md": plain, "Harbour.md": HARBOUR });
		const hook = find(parser.parse(plain, "Dock.md").root, "Stow the boat hook");
		const pontoon = find(parser.parse(HARBOUR, "Harbour.md").root, "Visitor pontoon");
		const site = resolveInsertSite(pontoon, 0, () => "Harbour.md");
		await moveAcrossFiles(f.ctx, [hook], site, "Dock.md", (src) => dropContext(pontoon, 0, src));
		expect(f.files["Harbour.md"]).toBe("# Harbour\n\n- Visitor pontoon\n\t- Stow the boat hook\n");
		expect(f.files["Dock.md"]).toBe("- Coil the lines\n");
		expect(f.log).toEqual(["write Harbour.md", "write Dock.md", "settle"]);
	});
});

describe("readMovedScheduleEntries", () => {
	it("flushes pending ratings first, then reads only the moved IDs' entries from the note's bytes", async () => {
		const f = fake({ "Dock.md": DOCK });
		const entries = await readMovedScheduleEntries(f.ctx, "Dock.md", new Set(["os-fend01"]));
		expect(entries).toEqual({ "os-fend01": { due: "2026-10-01" } });
		expect(f.log).toEqual(["flush Dock.md"]);
	});

	it("reads nothing for no IDs", async () => {
		const f = fake({ "Dock.md": DOCK });
		expect(await readMovedScheduleEntries(f.ctx, "Dock.md", new Set())).toEqual({});
		expect(f.log).toEqual([]);
	});
});

describe("migrateBlockIdentity", () => {
	it("keeps the destination's own entries and drops the origin's key when it empties", async () => {
		const f = fake({
			"Dock.md": '---\n{"osmosis-schedule":{"os-fend01":{"due":"a"}}}\n---\n- x\n',
			"Harbour.md": '---\n{"osmosis-schedule":{"os-moor01":{"due":"b"}}}\n---\n- y\n',
		});
		await migrateBlockIdentity(f.ctx, "Dock.md", "Harbour.md", new Set(["os-fend01"]), { "os-fend01": { due: "a" } });
		expect(f.files["Harbour.md"]).toBe('---\n{"osmosis-schedule":{"os-moor01":{"due":"b"},"os-fend01":{"due":"a"}}}\n---\n- y\n');
		expect(f.files["Dock.md"]).toBe("- x\n");
	});

	it("does nothing within one note", async () => {
		const f = fake({ "Dock.md": DOCK });
		await migrateBlockIdentity(f.ctx, "Dock.md", "Dock.md", new Set(["os-fend01"]), { "os-fend01": {} });
		expect(f.log).toEqual([]);
		expect(f.files["Dock.md"]).toBe(DOCK);
	});
});
