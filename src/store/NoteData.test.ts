import { describe, expect, it } from "vitest";
import { TFile, type App } from "obsidian";
import { NoteData, type NoteDataSettings } from "./NoteData";

/**
 * NoteData against a fake vault. Frontmatter lives in a map standing in for
 * the metadata cache, updated synchronously by `processFrontMatter` — the real
 * cache lags, but nothing here depends on that.
 */

type Handler = (...args: unknown[]) => void;

function fake(initial: Record<string, Record<string, unknown>>, settings: Partial<NoteDataSettings> = {}) {
	const fm = new Map<string, Record<string, unknown>>(Object.entries(initial));
	const files = new Map<string, TFile>();
	const folders = new Set<string>();
	const handlers = new Map<string, Handler>();
	const config = new Map<string, unknown>();
	const log: string[] = [];
	const file = (path: string): TFile => {
		let f = files.get(path);
		if (!f) files.set(path, (f = Object.assign(new TFile(), { path })));
		return f;
	};
	for (const path of fm.keys()) file(path);
	const on = (name: string, handler: Handler) => {
		handlers.set(name, handler);
		return { name };
	};
	const fire = (name: string, ...args: unknown[]) => handlers.get(name)?.(...args);
	/** Rename a file in the fake vault and fire the event, as Obsidian does. */
	const rename = (from: string, to: string) => {
		const f = files.get(from)!;
		files.delete(from);
		(f as { path: string }).path = to;
		files.set(to, f);
		const data = fm.get(from);
		fm.delete(from);
		if (data) fm.set(to, data);
		fire("vault:rename", f, from);
	};
	const app = {
		vault: {
			getFileByPath: (path: string) => files.get(path) ?? null,
			getAbstractFileByPath: (path: string) => files.get(path) ?? (folders.has(path) ? { path } : null),
			getMarkdownFiles: () => [...files.values()],
			createFolder: (path: string) => {
				folders.add(path);
				log.push(`mkdir ${path}`);
				return Promise.resolve();
			},
			create: (path: string, content: string) => {
				const link = /osmosis-note: "(.*)"/.exec(content)?.[1];
				fm.set(path, link === undefined ? {} : { "osmosis-note": link });
				log.push(`create ${path}`);
				const created = file(path);
				fire("vault:create", created);
				return Promise.resolve(created);
			},
			rename: (f: TFile, to: string) => {
				log.push(`rename ${f.path} -> ${to}`);
				rename(f.path, to);
				return Promise.resolve();
			},
			getConfig: (key: string) => config.get(key),
			setConfig: (key: string, value: unknown) => config.set(key, value),
			on: (name: string, handler: Handler) => on(`vault:${name}`, handler),
		},
		metadataCache: {
			getFileCache: (f: TFile) => (fm.has(f.path) ? { frontmatter: fm.get(f.path) } : null),
			getFirstLinkpathDest: (linkpath: string) => files.get(`${linkpath}.md`) ?? null,
			on: (name: string, handler: Handler) => on(`meta:${name}`, handler),
		},
		fileManager: {
			processFrontMatter: (f: TFile, fn: (fm: Record<string, unknown>) => void) => {
				const data = fm.get(f.path) ?? {};
				fn(data);
				fm.set(f.path, data);
				log.push(`frontmatter ${f.path}`);
				return Promise.resolve();
			},
			trashFile: (f: TFile) => {
				files.delete(f.path);
				fm.delete(f.path);
				log.push(`trash ${f.path}`);
				fire("vault:delete", f);
				return Promise.resolve();
			},
		},
	} as unknown as App;
	let excluded = 0;
	const noteData = new NoteData(
		app,
		() => ({ dataLocation: "sidecar", sidecarFolder: "Osmosis/Data", ...settings }),
		(path) => path.startsWith("Osmosis/Reviews/"),
		() => { excluded++; },
	);
	noteData.attach({ registerEvent: () => undefined });
	/** Add a note to the fake vault and fire `create`. */
	const create = (path: string) => {
		fm.set(path, {});
		fire("vault:create", file(path));
	};
	/** Delete a note from the fake vault and fire `delete`. */
	const remove = (path: string) => {
		const f = files.get(path)!;
		files.delete(path);
		fm.delete(path);
		fire("vault:delete", f);
	};
	return { noteData, fm, files, file, log, fire, rename, create, remove, config, excluded: () => excluded };
}

/** Let queued renames and writes run: they are promise chains, a few microtasks deep. */
async function settle(): Promise<void> {
	for (let i = 0; i < 50; i++) await Promise.resolve();
}

const SCHEDULE = { due: "2026-11-01T09:00:00", stability: 3, difficulty: 5, reps: 1, lapses: 0, state: "review", learningSteps: 0 };

describe("NoteData.modeOf", () => {
	it("follows the setting for a note with no Osmosis data", () => {
		const g = fake({ "Knots.md": { "osmosis-cards": true } });
		expect(g.noteData.modeOf(g.file("Knots.md"))).toBe("sidecar");
		const f = fake({ "Knots.md": {} }, { dataLocation: "note" });
		expect(f.noteData.modeOf(f.file("Knots.md"))).toBe("note");
	});

	it("keeps a note with in-note schedules in the note, whatever the setting", () => {
		const f = fake({ "Knots.md": { "osmosis-schedule": { "os-bowline": SCHEDULE } } });
		expect(f.noteData.modeOf(f.file("Knots.md"))).toBe("note");
	});

	it("is sidecar once a sidecar is indexed by name, whatever the setting", () => {
		const f = fake({ "Sailing/Knots.md": {}, "Osmosis/Data/Knots.osmosis.md": {} }, { dataLocation: "note" });
		f.noteData.rebuildIndex();
		expect(f.noteData.modeOf(f.file("Sailing/Knots.md"))).toBe("sidecar");
		expect(f.noteData.sidecarOf(f.file("Sailing/Knots.md"))?.path).toBe("Osmosis/Data/Knots.osmosis.md");
	});
});

describe("NoteData.process", () => {
	it("creates the folder, excludes it, and makes one sidecar named after the note on the first write", async () => {
		const f = fake({ "Sailing/Knots.md": { "osmosis-cards": true } });
		f.config.set("userIgnoreFilters", ["Archive/"]);
		f.noteData.rebuildIndex();
		const note = f.file("Sailing/Knots.md");
		await Promise.all([
			f.noteData.process(note, (fm) => { fm["osmosis-schedule"] = { "os-bowline": SCHEDULE }; }),
			f.noteData.process(note, (fm) => { (fm["osmosis-schedule"] as Record<string, unknown>)["os-cleat"] = SCHEDULE; }),
		]);
		expect(f.log.filter((line) => line.startsWith("create"))).toEqual(["create Osmosis/Data/Knots.osmosis.md"]);
		expect(f.log[0]).toBe("mkdir Osmosis/Data");
		expect(f.config.get("userIgnoreFilters")).toEqual(["Archive/", "Osmosis/Data/"]);
		expect(f.excluded()).toBe(1);
		expect(f.fm.get("Osmosis/Data/Knots.osmosis.md")).toEqual({
			"osmosis-note": "[[Sailing/Knots]]",
			"osmosis-schedule": { "os-bowline": SCHEDULE, "os-cleat": SCHEDULE },
		});
		expect(f.fm.get("Sailing/Knots.md")).toEqual({ "osmosis-cards": true });
		expect(f.noteData.frontmatter(note)["osmosis-schedule"]).toEqual({ "os-bowline": SCHEDULE, "os-cleat": SCHEDULE });
	});

	it("writes in-note for a note-mode note", async () => {
		const f = fake({ "Knots.md": { "osmosis-schedule": {} } });
		f.noteData.rebuildIndex();
		await f.noteData.process(f.file("Knots.md"), (fm) => { fm["osmosis-schedule"] = { "os-bowline": SCHEDULE }; });
		expect(f.log).toEqual(["frontmatter Knots.md"]);
	});

	it("qualifies a new sidecar whose basename another note shares, and ignores review-log shards", async () => {
		const f = fake({ "Travel/Pantry.md": {}, "Home/Pantry.md": {}, "Osmosis/Reviews/Knots.md": {}, "Knots.md": {} });
		f.noteData.rebuildIndex();
		await f.noteData.process(f.file("Travel/Pantry.md"), () => undefined);
		await f.noteData.process(f.file("Knots.md"), () => undefined);
		expect(f.log.filter((line) => line.startsWith("create"))).toEqual([
			"create Osmosis/Data/Travel.Pantry.osmosis.md",
			"create Osmosis/Data/Knots.osmosis.md",
		]);
	});
});

describe("NoteData following the note", () => {
	it("renames the sidecar and repoints its link when the note is renamed", async () => {
		const f = fake({ "Knots.md": {}, "Osmosis/Data/Knots.osmosis.md": { "osmosis-note": "[[Knots]]" } });
		f.noteData.rebuildIndex();
		f.rename("Knots.md", "Sailing/Hitches.md");
		await settle();
		const sidecar = "Osmosis/Data/Hitches.osmosis.md";
		expect(f.noteData.sidecarOf(f.file("Sailing/Hitches.md"))?.path).toBe(sidecar);
		expect(f.fm.get(sidecar)?.["osmosis-note"]).toBe("[[Sailing/Hitches]]");
		expect(f.files.has("Osmosis/Data/Knots.osmosis.md")).toBe(false);
	});

	it("qualifies an existing sidecar when a collision appears, and unqualifies it when the collision goes", async () => {
		const f = fake({ "Travel/Pantry.md": {}, "Osmosis/Data/Pantry.osmosis.md": { "osmosis-note": "[[Travel/Pantry]]" } });
		f.noteData.rebuildIndex();
		const note = f.file("Travel/Pantry.md");
		f.create("Home/Pantry.md");
		await settle();
		expect(f.noteData.sidecarOf(note)?.path).toBe("Osmosis/Data/Travel.Pantry.osmosis.md");
		expect(f.noteData.sidecarOf(f.file("Home/Pantry.md"))).toBeNull();

		f.rename("Home/Pantry.md", "Home/Larder.md");
		await settle();
		expect(f.noteData.sidecarOf(note)?.path).toBe("Osmosis/Data/Pantry.osmosis.md");
	});

	it("keeps writing to the sidecar while its rename is queued, without making a second one", async () => {
		const f = fake({ "Knots.md": {}, "Osmosis/Data/Knots.osmosis.md": { "osmosis-note": "[[Knots]]" } });
		f.noteData.rebuildIndex();
		f.rename("Knots.md", "Hitches.md");
		await f.noteData.process(f.file("Hitches.md"), (fm) => { fm["osmosis-schedule"] = { "os-bowline": SCHEDULE }; });
		await settle();
		expect(f.log.some((line) => line.startsWith("create"))).toBe(false);
		expect(f.fm.get("Osmosis/Data/Hitches.osmosis.md")?.["osmosis-schedule"]).toEqual({ "os-bowline": SCHEDULE });
	});

	it("trashes the sidecar when the note is deleted, and unqualifies the survivor", async () => {
		const f = fake({
			"Travel/Pantry.md": {},
			"Home/Pantry.md": {},
			"Osmosis/Data/Travel.Pantry.osmosis.md": {},
			"Osmosis/Data/Home.Pantry.osmosis.md": {},
		});
		f.noteData.rebuildIndex();
		f.remove("Home/Pantry.md");
		await settle();
		expect(f.log).toContain("trash Osmosis/Data/Home.Pantry.osmosis.md");
		expect(f.noteData.sidecarOf(f.file("Travel/Pantry.md"))?.path).toBe("Osmosis/Data/Pantry.osmosis.md");
	});

	it("tells listeners when a sidecar changes or goes away", () => {
		const f = fake({ "Knots.md": {}, "Osmosis/Data/Knots.osmosis.md": {} });
		f.noteData.rebuildIndex();
		const seen: string[] = [];
		f.noteData.onChange((path) => seen.push(path));
		const sidecar = f.file("Osmosis/Data/Knots.osmosis.md");
		f.fire("meta:changed", sidecar);
		f.fire("meta:changed", f.file("Knots.md"));
		f.files.delete(sidecar.path);
		f.fire("vault:delete", sidecar);
		expect(seen).toEqual(["Knots.md", "Knots.md"]);
		expect(f.noteData.sidecarOf(f.file("Knots.md"))).toBeNull();
	});
});

describe("NoteData orphans", () => {
	it("renames an old hash-named sidecar to its note's name, found by its link", async () => {
		const f = fake({ "Sailing/Knots.md": {}, "Osmosis/Data/a3f9c2e1.osmosis.md": { "osmosis-note": "[[Sailing/Knots]]" } });
		const seen: string[] = [];
		f.noteData.onChange((path) => seen.push(path));
		f.noteData.rebuildIndex();
		await settle();
		expect(f.noteData.sidecarOf(f.file("Sailing/Knots.md"))?.path).toBe("Osmosis/Data/Knots.osmosis.md");
		expect(seen).toEqual(["Sailing/Knots.md"]);
	});

	it("leaves an orphan whose note has its own sidecar, or whose link names no note, and counts it", async () => {
		const f = fake({
			"Knots.md": {},
			"Osmosis/Data/Knots.osmosis.md": {},
			"Osmosis/Data/a3f9c2e1.osmosis.md": { "osmosis-note": "[[Knots]]" },
			"Osmosis/Data/Tides.osmosis.md": { "osmosis-note": "[[Tides]]" },
		});
		f.noteData.rebuildIndex();
		expect(await f.noteData.reconcile()).toBe(2);
		expect(f.noteData.sidecarOf(f.file("Knots.md"))?.path).toBe("Osmosis/Data/Knots.osmosis.md");
		expect(f.log.some((line) => line.startsWith("rename"))).toBe(false);
	});
});
