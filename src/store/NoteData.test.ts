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
				return Promise.resolve(file(path));
			},
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
				return Promise.resolve();
			},
		},
	} as unknown as App;
	const noteData = new NoteData(app, () => ({ dataLocation: "sidecar", sidecarFolder: "Osmosis/Schedule", ...settings }));
	noteData.attach({ registerEvent: () => undefined });
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
	return { noteData, fm, files, file, log, fire, rename };
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

	it("is sidecar once a sidecar is indexed, whatever the setting", () => {
		const f = fake({ "Knots.md": {}, "Osmosis/Schedule/abc.osmosis.md": { "osmosis-note": "[[Knots]]" } }, { dataLocation: "note" });
		f.noteData.rebuildIndex();
		expect(f.noteData.modeOf(f.file("Knots.md"))).toBe("sidecar");
		expect(f.noteData.sidecarOf(f.file("Knots.md"))?.path).toBe("Osmosis/Schedule/abc.osmosis.md");
	});
});

describe("NoteData.process", () => {
	it("creates the folder and one hashed sidecar on the first write, leaving the note untouched", async () => {
		const f = fake({ "Sailing/Knots.md": { "osmosis-cards": true } });
		const note = f.file("Sailing/Knots.md");
		await Promise.all([
			f.noteData.process(note, (fm) => { fm["osmosis-schedule"] = { "os-bowline": SCHEDULE }; }),
			f.noteData.process(note, (fm) => { (fm["osmosis-schedule"] as Record<string, unknown>)["os-cleat"] = SCHEDULE; }),
		]);
		const creates = f.log.filter((line) => line.startsWith("create"));
		expect(creates).toHaveLength(1);
		const sidecarPath = creates[0]!.slice("create ".length);
		expect(sidecarPath).toMatch(/^Osmosis\/Schedule\/[0-9a-f]{8}\.osmosis\.md$/);
		expect(f.log[0]).toBe("mkdir Osmosis/Schedule");
		expect(f.fm.get(sidecarPath)).toEqual({
			"osmosis-note": "[[Sailing/Knots]]",
			"osmosis-schedule": { "os-bowline": SCHEDULE, "os-cleat": SCHEDULE },
		});
		expect(f.fm.get("Sailing/Knots.md")).toEqual({ "osmosis-cards": true });
		expect(f.noteData.frontmatter(note)["osmosis-schedule"]).toEqual({ "os-bowline": SCHEDULE, "os-cleat": SCHEDULE });
	});

	it("writes in-note for a note-mode note", async () => {
		const f = fake({ "Knots.md": { "osmosis-schedule": {} } });
		await f.noteData.process(f.file("Knots.md"), (fm) => { fm["osmosis-schedule"] = { "os-bowline": SCHEDULE }; });
		expect(f.log).toEqual(["frontmatter Knots.md"]);
	});

	it("re-salts past a name taken by another note's sidecar", async () => {
		const first = fake({ "Knots.md": {} });
		await first.noteData.process(first.file("Knots.md"), () => undefined);
		const hashed = first.log.find((line) => line.startsWith("create"))!.slice("create ".length);

		const f = fake({ "Knots.md": {}, "Tides.md": {}, [hashed]: { "osmosis-note": "[[Tides]]" } });
		f.noteData.rebuildIndex();
		await f.noteData.process(f.file("Knots.md"), () => undefined);
		const created = f.log.find((line) => line.startsWith("create"))!.slice("create ".length);
		expect(created).not.toBe(hashed);
		expect(f.noteData.sidecarOf(f.file("Tides.md"))?.path).toBe(hashed);
	});
});

describe("NoteData following the note", () => {
	it("re-keys and repoints the sidecar when the note is renamed", async () => {
		const f = fake({ "Knots.md": {}, "Osmosis/Schedule/abc.osmosis.md": { "osmosis-note": "[[Knots]]" } });
		f.noteData.rebuildIndex();
		f.rename("Knots.md", "Sailing/Knots.md");
		await Promise.resolve();
		expect(f.noteData.sidecarOf(f.file("Sailing/Knots.md"))?.path).toBe("Osmosis/Schedule/abc.osmosis.md");
		expect(f.fm.get("Osmosis/Schedule/abc.osmosis.md")?.["osmosis-note"]).toBe("[[Sailing/Knots]]");
	});

	it("trashes the sidecar when the note is deleted", async () => {
		const f = fake({ "Knots.md": {}, "Osmosis/Schedule/abc.osmosis.md": { "osmosis-note": "[[Knots]]" } });
		f.noteData.rebuildIndex();
		const note = f.file("Knots.md");
		f.files.delete("Knots.md");
		f.fire("vault:delete", note);
		await Promise.resolve();
		expect(f.log).toEqual(["trash Osmosis/Schedule/abc.osmosis.md"]);
	});

	it("tells listeners when a sidecar changes or goes away", () => {
		const f = fake({ "Knots.md": {}, "Osmosis/Schedule/abc.osmosis.md": { "osmosis-note": "[[Knots]]" } });
		const seen: string[] = [];
		f.noteData.onChange((path) => seen.push(path));
		const sidecar = f.file("Osmosis/Schedule/abc.osmosis.md");
		f.fire("meta:changed", sidecar);
		f.fire("meta:changed", f.file("Knots.md"));
		f.fire("vault:delete", sidecar);
		expect(seen).toEqual(["Knots.md", "Knots.md"]);
		expect(f.noteData.sidecarOf(f.file("Knots.md"))).toBeNull();
	});
});
