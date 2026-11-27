import { describe, expect, it } from "vitest";
import type { Vault } from "obsidian";
import { generateExplicitCards } from "../card-gen/explicit";
import {
	FENCES_FRONTMATTER_KEY,
	applyFenceEdits,
	fenceEntryFromContent,
	overlayFenceCards,
	parseFenceEntry,
	parseFencesFrontmatter,
} from "./fence-sidecar";
import { FenceWriter, type FenceNoteData, type ScheduleFields } from "./FenceWriter";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);

function schedule(overrides: Partial<ScheduleFields> = {}): ScheduleFields {
	return {
		stability: 3.25,
		difficulty: 5.5,
		due: T0 + DAY,
		lastReview: T0,
		reps: 2,
		lapses: 0,
		state: "review",
		learningSteps: 0,
		...overrides,
	};
}

/** A note with a basic, a bidi and a two-group cloze fence — header schedules on the bidi one. */
const NOTE = [
	"# Knots",
	"",
	"```osmosis",
	"id: basic1",
	"",
	"Which knot makes a fixed loop?",
	"***",
	"A bowline",
	"```",
	"",
	"```osmosis",
	"id: bidi1",
	"bidi: true",
	"exclude: true",
	"due: 2026-10-01T00:00:00.000Z",
	"stability: 1.0000",
	"difficulty: 4.0000",
	"reps: 1",
	"lapses: 0",
	"state: review",
	"lastReview: 2026-09-30T00:00:00.000Z",
	"learningSteps: 0",
	"r:",
	"  due: 2026-10-02T00:00:00.000Z",
	"  stability: 2.0000",
	"  difficulty: 4.0000",
	"  reps: 1",
	"  lapses: 0",
	"  state: review",
	"  lastReview: 2026-09-30T00:00:00.000Z",
	"  learningSteps: 0",
	"  buriedUntil: 2026-10-05T00:00:00.000Z",
	"",
	"Port",
	"***",
	"Left",
	"```",
	"",
	"```osmosis",
	"id: cloze1",
	"",
	"Reef a sail with ==c1:reef points== and ==c2:a reefing line==.",
	"```",
	"",
].join("\n");

function fences(fm: Record<string, unknown>): Record<string, Record<string, unknown>> {
	return fm[FENCES_FRONTMATTER_KEY] as Record<string, Record<string, unknown>>;
}

describe("applyFenceEdits", () => {
	it("writes the fence's own card flat, and derived cards under r: / cN:", () => {
		const fm: Record<string, unknown> = {};
		applyFenceEdits(fm, NOTE, [
			{ kind: "schedule", cardId: "basic1", schedule: schedule() },
			{ kind: "schedule", cardId: "cloze1-c1", schedule: schedule({ reps: 1 }) },
			{ kind: "schedule", cardId: "cloze1-c2", schedule: schedule({ reps: 3 }) },
		]);
		const basic = parseFenceEntry(fences(fm)["basic1"])!;
		expect(basic.cards.get("")!.schedule!.due).toBe(T0 + DAY);
		expect(basic.cards.get("")!.schedule!.stability).toBe(3.25);
		const cloze = parseFenceEntry(fences(fm)["cloze1"])!;
		expect(cloze.cards.get("c1")!.schedule!.reps).toBe(1);
		expect(cloze.cards.get("c2")!.schedule!.reps).toBe(3);
		expect(cloze.cards.has("")).toBe(false);
		expect(Object.keys(fences(fm)["cloze1"]!).sort()).toEqual(["c1", "c2"]);
	});

	it("seeds a fence's first entry from its header, then applies the edit", () => {
		const fm: Record<string, unknown> = {};
		applyFenceEdits(fm, NOTE, [{ kind: "schedule", cardId: "bidi1", schedule: schedule() }]);
		const entry = fences(fm)["bidi1"]!;
		expect(entry["exclude"]).toBe(true);
		const overlay = parseFenceEntry(entry)!;
		// The edited card has the new schedule; the reverse keeps the header's.
		expect(overlay.cards.get("")!.schedule!.due).toBe(T0 + DAY);
		expect(overlay.cards.get("r")!.schedule!.due).toBe(Date.parse("2026-10-02T00:00:00.000Z"));
		expect(overlay.cards.get("r")!.buriedUntil).toBe(Date.parse("2026-10-05T00:00:00.000Z"));
	});

	it("does not reseed a fence that already has an entry", () => {
		const fm: Record<string, unknown> = { [FENCES_FRONTMATTER_KEY]: { bidi1: {} } };
		applyFenceEdits(fm, NOTE, [{ kind: "buried", cardId: "bidi1", until: T0 }]);
		expect(Object.keys(fences(fm)["bidi1"]!)).toEqual(["buriedUntil"]);
	});

	it("a schedule write clears the card's bury; removal leaves an owning entry", () => {
		const fm: Record<string, unknown> = {};
		applyFenceEdits(fm, NOTE, [
			{ kind: "buried", cardId: "cloze1-c1", until: T0 + DAY },
			{ kind: "buried", cardId: "basic1", until: T0 + DAY },
		]);
		expect(parseFenceEntry(fences(fm)["cloze1"])!.cards.get("c1")!.buriedUntil).toBeDefined();
		expect(parseFenceEntry(fences(fm)["cloze1"])!.cards.get("c1")!.schedule).toBeNull();

		applyFenceEdits(fm, NOTE, [
			{ kind: "schedule", cardId: "cloze1-c1", schedule: schedule() },
			{ kind: "schedule", cardId: "basic1", schedule: null },
		]);
		expect(parseFenceEntry(fences(fm)["cloze1"])!.cards.get("c1")!.buriedUntil).toBeUndefined();
		// Reset to new: nothing left, but the (empty) entry still owns the fence.
		expect(fences(fm)["basic1"]).toEqual({});
	});

	it("un-burying a derived card drops its emptied block", () => {
		const fm: Record<string, unknown> = { [FENCES_FRONTMATTER_KEY]: { cloze1: {} } };
		applyFenceEdits(fm, NOTE, [{ kind: "buried", cardId: "cloze1-c2", until: T0 }]);
		applyFenceEdits(fm, NOTE, [{ kind: "buried", cardId: "cloze1-c2", until: null }]);
		expect(fences(fm)["cloze1"]).toEqual({});
	});

	it("sets and clears exclude on the fence, whichever card asked", () => {
		const fm: Record<string, unknown> = {};
		applyFenceEdits(fm, NOTE, [{ kind: "exclude", cardId: "cloze1-c2", exclude: true }]);
		expect(fences(fm)["cloze1"]).toEqual({ exclude: true });
		applyFenceEdits(fm, NOTE, [{ kind: "exclude", cardId: "cloze1", exclude: false }]);
		expect(fences(fm)["cloze1"]).toEqual({});
	});
});

describe("fenceEntryFromContent", () => {
	it("is empty for a fence with no review data, or one not in the note", () => {
		expect(fenceEntryFromContent(NOTE, "basic1")).toEqual({});
		expect(fenceEntryFromContent(NOTE, "missing")).toEqual({});
	});
});

describe("overlayFenceCards", () => {
	it("takes a fenced card's state from its sidecar entry, which wins over the header", () => {
		const cards = generateExplicitCards(NOTE);
		const header = cards.find((c) => c.id === "bidi1")!;
		expect(header.disabled).toBe(true);
		expect(header.due).toBe(Date.parse("2026-10-01T00:00:00.000Z"));

		const fm: Record<string, unknown> = { [FENCES_FRONTMATTER_KEY]: { bidi1: {} } };
		applyFenceEdits(fm, NOTE, [
			{ kind: "schedule", cardId: "bidi1-r", schedule: schedule({ reps: 7 }) },
			{ kind: "schedule", cardId: "cloze1-c2", schedule: schedule({ reps: 4 }) },
		]);
		const overlaid = overlayFenceCards(cards, parseFencesFrontmatter(fm[FENCES_FRONTMATTER_KEY]));
		const byId = new Map(overlaid.map((c) => [c.id, c]));

		// bidi1's entry owns it: the header's schedule, bury and exclude are gone.
		expect(byId.get("bidi1")!.due).toBeUndefined();
		expect(byId.get("bidi1")!.disabled).toBeUndefined();
		expect(byId.get("bidi1-r")!.reps).toBe(7);
		expect(byId.get("bidi1-r")!.buriedUntil).toBeUndefined();
		// Each cloze group keeps its own schedule; an unmentioned group stays new.
		expect(byId.get("cloze1-c2")!.reps).toBe(4);
		expect(byId.get("cloze1-c1")!.due).toBeUndefined();
		// A fence with no entry passes through.
		expect(byId.get("basic1")).toBe(cards.find((c) => c.id === "basic1"));
	});

	it("marks every card of an excluded fence disabled", () => {
		const cards = generateExplicitCards(NOTE);
		const overlaid = overlayFenceCards(cards, parseFencesFrontmatter({ cloze1: { exclude: true } }));
		expect(overlaid.filter((c) => c.id.startsWith("cloze1")).map((c) => c.disabled)).toEqual([true, true]);
	});

	it("skips hand-edited garbage", () => {
		expect(parseFencesFrontmatter({ a: "nope", b: [1] }).size).toBe(0);
		expect(parseFencesFrontmatter("nope").size).toBe(0);
	});
});

describe("FenceWriter in sidecar mode", () => {
	function makeHarness(mode: "note" | "sidecar") {
		const notePath = "sailing/knots.md";
		const files = new Map<string, string>([[notePath, NOTE]]);
		const sidecar: Record<string, unknown> = {};
		let processes = 0;
		const vault = {
			getFileByPath: (path: string) => (files.has(path) ? ({ path } as import("obsidian").TFile) : null),
			cachedRead: (file: { path: string }) => Promise.resolve(files.get(file.path)!),
			modify: (file: { path: string }, data: string) => {
				files.set(file.path, data);
				return Promise.resolve();
			},
			process: (file: { path: string }, fn: (data: string) => string) => {
				files.set(file.path, fn(files.get(file.path)!));
				return Promise.resolve();
			},
		};
		const noteData: FenceNoteData = {
			modeOf: () => mode,
			process: (_file, fn) => {
				processes++;
				fn(sidecar);
				return Promise.resolve();
			},
		};
		const writer = new FenceWriter(vault as unknown as Vault, noteData);
		return { writer, file: { path: notePath } as import("obsidian").TFile, files, notePath, sidecar, processes: () => processes };
	}

	it("writes schedules, buries and exclude to the sidecar and leaves the note byte-for-byte", async () => {
		const h = makeHarness("sidecar");
		await h.writer.writeSchedule(h.file, "basic1", schedule());
		await h.writer.writeSchedule(h.file, "bidi1-r", schedule({ reps: 5 }));
		await h.writer.writeBuried(h.file, "cloze1-c1", T0 + DAY);
		await h.writer.writeExclude(h.file, "cloze1", true);
		await h.writer.removeSchedule(h.file, "basic1");

		expect(h.files.get(h.notePath)).toBe(NOTE);
		const parsed = parseFencesFrontmatter(h.sidecar[FENCES_FRONTMATTER_KEY]);
		expect(parsed.get("bidi1")!.cards.get("r")!.schedule!.reps).toBe(5);
		expect(parsed.get("cloze1")!.cards.get("c1")!.buriedUntil).toBe(T0 + DAY);
		expect(parsed.get("cloze1")!.exclude).toBe(true);
		expect(parsed.get("basic1")!.cards.size).toBe(0);
	});

	it("flushes note study's staged reviews to the sidecar in one write", async () => {
		const h = makeHarness("sidecar");
		h.writer.stageSchedule(h.notePath, "cloze1-c1", schedule({ reps: 1 }));
		h.writer.stageSchedule(h.notePath, "cloze1-c2", schedule({ reps: 2 }));
		await h.writer.flushPath(h.notePath);

		expect(h.processes()).toBe(1);
		expect(h.files.get(h.notePath)).toBe(NOTE);
		expect(h.writer.getPendingSchedules(h.notePath).size).toBe(0);
		const cloze = parseFencesFrontmatter(h.sidecar[FENCES_FRONTMATTER_KEY]).get("cloze1")!;
		expect(cloze.cards.get("c1")!.schedule!.reps).toBe(1);
		expect(cloze.cards.get("c2")!.schedule!.reps).toBe(2);
	});

	it("keeps writing into the fence header in note mode", async () => {
		const h = makeHarness("note");
		await h.writer.writeSchedule(h.file, "basic1", schedule());
		expect(h.processes()).toBe(0);
		expect(h.files.get(h.notePath)).not.toBe(NOTE);
		expect(h.sidecar[FENCES_FRONTMATTER_KEY]).toBeUndefined();
	});
});
