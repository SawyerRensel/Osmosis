import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TFile } from "obsidian";
import type { ScheduleData } from "../database/types";
import {
	ScheduleStore,
	SCHEDULE_FRONTMATTER_KEY,
	applyScheduleEntries,
	serializeScheduleEntry,
	parseScheduleEntry,
	parseScheduleFrontmatter,
	parseDisabledFrontmatter,
	formatLocalTimestamp,
	parseTimestamp,
} from "./ScheduleStore";

const baseSchedule: ScheduleData = {
	stability: 4.2,
	difficulty: 5.1,
	due: new Date(2026, 6, 15, 10, 30, 0).getTime(),
	lastReview: new Date(2026, 6, 8, 9, 12, 0).getTime(),
	reps: 3,
	lapses: 0,
	state: "review",
	learningSteps: 0,
};

describe("formatLocalTimestamp / parseTimestamp", () => {
	it("formats epoch ms as a local ISO datetime without timezone suffix", () => {
		const epoch = new Date(2026, 6, 15, 10, 30, 0).getTime();
		expect(formatLocalTimestamp(epoch)).toBe("2026-07-15T10:30:00");
	});

	it("pads single-digit date and time components", () => {
		const epoch = new Date(2026, 0, 5, 9, 5, 7).getTime();
		expect(formatLocalTimestamp(epoch)).toBe("2026-01-05T09:05:07");
	});

	it("round-trips epoch → local ISO → epoch (second precision)", () => {
		const epoch = new Date(2026, 6, 15, 10, 30, 42).getTime();
		expect(parseTimestamp(formatLocalTimestamp(epoch))).toBe(epoch);
	});

	it("parses timezone-less ISO strings as local time", () => {
		expect(parseTimestamp("2026-07-15T10:30:00")).toBe(
			new Date(2026, 6, 15, 10, 30, 0).getTime(),
		);
	});

	it("parses ISO strings with explicit timezone", () => {
		expect(parseTimestamp("2026-07-15T10:30:00Z")).toBe(
			Date.UTC(2026, 6, 15, 10, 30, 0),
		);
	});

	it("accepts Date objects (unquoted YAML timestamps parse to Date)", () => {
		const d = new Date(2026, 6, 15, 10, 30, 0);
		expect(parseTimestamp(d)).toBe(d.getTime());
	});

	it("accepts finite numbers as epoch ms", () => {
		expect(parseTimestamp(1234567890)).toBe(1234567890);
	});

	it("rejects invalid values", () => {
		expect(parseTimestamp("not a date")).toBeNull();
		expect(parseTimestamp(new Date("invalid"))).toBeNull();
		expect(parseTimestamp(NaN)).toBeNull();
		expect(parseTimestamp(null)).toBeNull();
		expect(parseTimestamp(undefined)).toBeNull();
		expect(parseTimestamp({})).toBeNull();
	});
});

describe("serializeScheduleEntry", () => {
	it("serializes all fields with local ISO timestamps", () => {
		expect(serializeScheduleEntry(baseSchedule)).toEqual({
			due: "2026-07-15T10:30:00",
			stability: 4.2,
			difficulty: 5.1,
			lastReview: "2026-07-08T09:12:00",
			reps: 3,
			lapses: 0,
			state: "review",
			learningSteps: 0,
		});
	});

	it("omits lastReview when null", () => {
		const entry = serializeScheduleEntry({ ...baseSchedule, lastReview: null });
		expect(entry).not.toHaveProperty("lastReview");
	});

	it("rounds stability and difficulty to 4 decimals", () => {
		const entry = serializeScheduleEntry({
			...baseSchedule,
			stability: 4.123456789,
			difficulty: 5.987654321,
		});
		expect(entry.stability).toBe(4.1235);
		expect(entry.difficulty).toBe(5.9877);
	});
});

describe("parseScheduleEntry", () => {
	it("parses a fully-populated entry", () => {
		const parsed = parseScheduleEntry(serializeScheduleEntry(baseSchedule));
		expect(parsed).toEqual(baseSchedule);
	});

	it("parses Date-valued timestamps (unquoted YAML)", () => {
		const parsed = parseScheduleEntry({
			due: new Date(2026, 6, 15, 10, 30, 0),
			stability: 1,
			difficulty: 2,
			reps: 1,
			lapses: 0,
			state: "learning",
			learningSteps: 1,
		});
		expect(parsed?.due).toBe(new Date(2026, 6, 15, 10, 30, 0).getTime());
		expect(parsed?.state).toBe("learning");
		expect(parsed?.lastReview).toBeNull();
	});

	it("returns null when due is missing or unparseable", () => {
		expect(parseScheduleEntry({ stability: 1 })).toBeNull();
		expect(parseScheduleEntry({ due: "garbage" })).toBeNull();
	});

	it("returns null for non-object values", () => {
		expect(parseScheduleEntry("2026-07-15T10:30:00")).toBeNull();
		expect(parseScheduleEntry(null)).toBeNull();
		expect(parseScheduleEntry([1, 2])).toBeNull();
	});

	it("applies defaults for missing or invalid optional fields", () => {
		const parsed = parseScheduleEntry({ due: "2026-07-15T10:30:00" });
		expect(parsed).toEqual({
			stability: 0,
			difficulty: 0,
			due: new Date(2026, 6, 15, 10, 30, 0).getTime(),
			lastReview: null,
			reps: 0,
			lapses: 0,
			state: "review",
			learningSteps: 0,
		});
	});

	it("falls back to review for unknown states and rejects negative counts", () => {
		const parsed = parseScheduleEntry({
			due: "2026-07-15T10:30:00",
			state: "suspended",
			reps: -3,
			lapses: 1.5,
		});
		expect(parsed?.state).toBe("review");
		expect(parsed?.reps).toBe(0);
		expect(parsed?.lapses).toBe(0);
	});
});

describe("parseScheduleFrontmatter", () => {
	it("parses a map of block ID → schedule, skipping invalid entries", () => {
		const raw = {
			"os-a1b2c3": serializeScheduleEntry(baseSchedule),
			"os-broken": { stability: 1 }, // no due
			"os-junk": "not an object",
		};
		const result = parseScheduleFrontmatter(raw);
		expect(result.size).toBe(1);
		expect(result.get("os-a1b2c3")).toEqual(baseSchedule);
	});

	it("returns an empty map for non-object values", () => {
		expect(parseScheduleFrontmatter(undefined).size).toBe(0);
		expect(parseScheduleFrontmatter(null).size).toBe(0);
		expect(parseScheduleFrontmatter("yes").size).toBe(0);
		expect(parseScheduleFrontmatter([1]).size).toBe(0);
	});
});

describe("applyScheduleEntries", () => {
	it("creates the osmosis-schedule key when absent", () => {
		const fm: Record<string, unknown> = { "osmosis-cards": true };
		applyScheduleEntries(fm, new Map([["os-a1b2c3", baseSchedule]]), new Map());
		expect(fm["osmosis-cards"]).toBe(true);
		expect(fm[SCHEDULE_FRONTMATTER_KEY]).toEqual({
			"os-a1b2c3": serializeScheduleEntry(baseSchedule),
		});
	});

	it("preserves entries for other cards", () => {
		const fm: Record<string, unknown> = {
			[SCHEDULE_FRONTMATTER_KEY]: {
				"os-other1": serializeScheduleEntry({ ...baseSchedule, reps: 9 }),
			},
		};
		applyScheduleEntries(fm, new Map([["os-a1b2c3", baseSchedule]]), new Map());
		const map = fm[SCHEDULE_FRONTMATTER_KEY] as Record<string, unknown>;
		expect(Object.keys(map).sort()).toEqual(["os-a1b2c3", "os-other1"]);
	});

	it("removes entries and drops the key when it becomes empty", () => {
		const fm: Record<string, unknown> = {
			[SCHEDULE_FRONTMATTER_KEY]: {
				"os-a1b2c3": serializeScheduleEntry(baseSchedule),
			},
		};
		applyScheduleEntries(fm, new Map([["os-a1b2c3", null]]), new Map());
		expect(fm).not.toHaveProperty(SCHEDULE_FRONTMATTER_KEY);
	});

	it("replaces a corrupt non-object osmosis-schedule value", () => {
		const fm: Record<string, unknown> = { [SCHEDULE_FRONTMATTER_KEY]: "corrupt" };
		applyScheduleEntries(fm, new Map([["os-a1b2c3", baseSchedule]]), new Map());
		expect(fm[SCHEDULE_FRONTMATTER_KEY]).toEqual({
			"os-a1b2c3": serializeScheduleEntry(baseSchedule),
		});
	});

	it("writes a schedule-less disabled stub", () => {
		const fm: Record<string, unknown> = {};
		applyScheduleEntries(fm, new Map(), new Map([["os-a1b2c3", true]]));
		expect(fm[SCHEDULE_FRONTMATTER_KEY]).toEqual({ "os-a1b2c3": { disabled: true } });
	});

	it("merges disabled onto an existing schedule without wiping it", () => {
		const fm: Record<string, unknown> = {};
		applyScheduleEntries(fm, new Map([["os-a1b2c3", baseSchedule]]), new Map());
		applyScheduleEntries(fm, new Map(), new Map([["os-a1b2c3", true]]));
		expect(fm[SCHEDULE_FRONTMATTER_KEY]).toEqual({
			"os-a1b2c3": { ...serializeScheduleEntry(baseSchedule), disabled: true },
		});
	});

	it("keeps the schedule when re-enabling (disabled removed, history intact)", () => {
		const fm: Record<string, unknown> = {
			[SCHEDULE_FRONTMATTER_KEY]: {
				"os-a1b2c3": { ...serializeScheduleEntry(baseSchedule), disabled: true },
			},
		};
		applyScheduleEntries(fm, new Map(), new Map([["os-a1b2c3", false]]));
		expect(fm[SCHEDULE_FRONTMATTER_KEY]).toEqual({
			"os-a1b2c3": serializeScheduleEntry(baseSchedule),
		});
	});

	it("drops a disabled-only entry (and the key) when re-enabled", () => {
		const fm: Record<string, unknown> = {
			[SCHEDULE_FRONTMATTER_KEY]: { "os-a1b2c3": { disabled: true } },
		};
		applyScheduleEntries(fm, new Map(), new Map([["os-a1b2c3", false]]));
		expect(fm).not.toHaveProperty(SCHEDULE_FRONTMATTER_KEY);
	});

	it("a schedule write does not disturb a sibling's disabled flag", () => {
		const fm: Record<string, unknown> = {
			[SCHEDULE_FRONTMATTER_KEY]: { "os-other1": { disabled: true } },
		};
		applyScheduleEntries(fm, new Map([["os-a1b2c3", baseSchedule]]), new Map());
		const map = fm[SCHEDULE_FRONTMATTER_KEY] as Record<string, unknown>;
		expect(map["os-other1"]).toEqual({ disabled: true });
	});
});

describe("parseDisabledFrontmatter", () => {
	it("collects block IDs flagged disabled, including schedule-less stubs", () => {
		const raw = {
			"os-a1b2c3": { disabled: true },
			"os-d4e5f6": { ...serializeScheduleEntry(baseSchedule), disabled: true },
			"os-g7h8i9": serializeScheduleEntry(baseSchedule),
		};
		expect([...parseDisabledFrontmatter(raw)].sort()).toEqual(["os-a1b2c3", "os-d4e5f6"]);
	});

	it("ignores non-true disabled values and non-objects", () => {
		expect(parseDisabledFrontmatter({ "os-a": { disabled: "true" } }).size).toBe(0);
		expect(parseDisabledFrontmatter(undefined).size).toBe(0);
		expect(parseDisabledFrontmatter("x").size).toBe(0);
	});
});

describe("ScheduleStore", () => {
	interface Harness {
		store: ScheduleStore;
		frontmatters: Map<string, Record<string, unknown>>;
		writeCounts: Map<string, number>;
		processFrontMatter: ReturnType<typeof vi.fn>;
	}

	function makeHarness(options?: {
		missingPaths?: Set<string>;
		failWrites?: () => boolean;
	}): Harness {
		const frontmatters = new Map<string, Record<string, unknown>>();
		const writeCounts = new Map<string, number>();

		const processFrontMatter = vi.fn(
			(file: TFile, fn: (fm: Record<string, unknown>) => void): Promise<void> => {
				if (options?.failWrites?.()) {
					return Promise.reject(new Error("write failed"));
				}
				writeCounts.set(file.path, (writeCounts.get(file.path) ?? 0) + 1);
				let fm = frontmatters.get(file.path);
				if (!fm) {
					fm = {};
					frontmatters.set(file.path, fm);
				}
				fn(fm);
				return Promise.resolve();
			},
		);

		const store = new ScheduleStore(
			{ processFrontMatter: processFrontMatter as never },
			(notePath: string) =>
				options?.missingPaths?.has(notePath)
					? null
					: // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast -- test double, no real vault
						({ path: notePath } as TFile),
		);

		return { store, frontmatters, writeCounts, processFrontMatter };
	}

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("flushes a staged schedule after the debounce window", async () => {
		const h = makeHarness();
		h.store.setSchedule("note.md", "os-a1b2c3", baseSchedule);

		expect(h.processFrontMatter).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(2000);

		expect(h.writeCounts.get("note.md")).toBe(1);
		expect(h.frontmatters.get("note.md")?.[SCHEDULE_FRONTMATTER_KEY]).toEqual({
			"os-a1b2c3": serializeScheduleEntry(baseSchedule),
		});
	});

	it("coalesces rapid ratings into one write with the latest values", async () => {
		const h = makeHarness();
		h.store.setSchedule("note.md", "os-a1b2c3", { ...baseSchedule, reps: 1 });
		await vi.advanceTimersByTimeAsync(1000);
		h.store.setSchedule("note.md", "os-a1b2c3", { ...baseSchedule, reps: 2 });
		h.store.setSchedule("note.md", "os-d4e5f6", baseSchedule);
		await vi.advanceTimersByTimeAsync(2000);

		expect(h.writeCounts.get("note.md")).toBe(1);
		const map = h.frontmatters.get("note.md")?.[SCHEDULE_FRONTMATTER_KEY] as Record<
			string,
			{ reps: number }
		>;
		expect(map["os-a1b2c3"]?.reps).toBe(2);
		expect(Object.keys(map).sort()).toEqual(["os-a1b2c3", "os-d4e5f6"]);
	});

	it("each staged write resets the debounce timer", async () => {
		const h = makeHarness();
		h.store.setSchedule("note.md", "os-a1b2c3", baseSchedule);
		await vi.advanceTimersByTimeAsync(1500);
		h.store.setSchedule("note.md", "os-a1b2c3", { ...baseSchedule, reps: 4 });
		await vi.advanceTimersByTimeAsync(1500);
		expect(h.processFrontMatter).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(500);
		expect(h.writeCounts.get("note.md")).toBe(1);
	});

	it("flush() writes immediately and cancels the timer", async () => {
		const h = makeHarness();
		h.store.setSchedule("note.md", "os-a1b2c3", baseSchedule);
		await h.store.flush();

		expect(h.writeCounts.get("note.md")).toBe(1);
		expect(h.store.hasPendingWrites()).toBe(false);

		// Timer must not fire a second write
		await vi.advanceTimersByTimeAsync(3000);
		expect(h.writeCounts.get("note.md")).toBe(1);
	});

	it("flush() covers multiple notes", async () => {
		const h = makeHarness();
		h.store.setSchedule("a.md", "os-aaaaaa", baseSchedule);
		h.store.setSchedule("b.md", "os-bbbbbb", baseSchedule);
		await h.store.flush();

		expect(h.writeCounts.get("a.md")).toBe(1);
		expect(h.writeCounts.get("b.md")).toBe(1);
	});

	it("removeSchedule deletes the entry and drops an emptied key", async () => {
		const h = makeHarness();
		h.frontmatters.set("note.md", {
			[SCHEDULE_FRONTMATTER_KEY]: {
				"os-a1b2c3": serializeScheduleEntry(baseSchedule),
			},
		});
		h.store.removeSchedule("note.md", "os-a1b2c3");
		await h.store.flush();

		expect(h.frontmatters.get("note.md")).not.toHaveProperty(SCHEDULE_FRONTMATTER_KEY);
	});

	it("exposes pending entries until flushed", async () => {
		const h = makeHarness();
		h.store.setSchedule("note.md", "os-a1b2c3", baseSchedule);
		h.store.removeSchedule("note.md", "os-d4e5f6");

		expect(h.store.getPendingEntry("note.md", "os-a1b2c3")).toEqual(baseSchedule);
		expect(h.store.getPendingEntry("note.md", "os-d4e5f6")).toBeNull();
		expect(h.store.getPendingEntry("note.md", "os-none")).toBeUndefined();

		await h.store.flush();
		expect(h.store.getPendingEntry("note.md", "os-a1b2c3")).toBeUndefined();
	});

	it("drops pending entries for unresolvable (deleted) notes", async () => {
		const h = makeHarness({ missingPaths: new Set(["gone.md"]) });
		h.store.setSchedule("gone.md", "os-a1b2c3", baseSchedule);
		await h.store.flush();

		expect(h.processFrontMatter).not.toHaveBeenCalled();
		expect(h.store.hasPendingWrites()).toBe(false);
	});

	it("re-stages entries when the write fails, and retries on next flush", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		let fail = true;
		const h = makeHarness({ failWrites: () => fail });

		h.store.setSchedule("note.md", "os-a1b2c3", baseSchedule);
		await h.store.flush();

		expect(consoleError).toHaveBeenCalled();
		expect(h.store.hasPendingWrites()).toBe(true);

		fail = false;
		await h.store.flush();
		expect(h.frontmatters.get("note.md")?.[SCHEDULE_FRONTMATTER_KEY]).toEqual({
			"os-a1b2c3": serializeScheduleEntry(baseSchedule),
		});
		expect(h.store.hasPendingWrites()).toBe(false);
	});

	it("a rating staged during a failed write is not clobbered by the re-stage", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		let fail = true;
		const h = makeHarness({ failWrites: () => fail });

		h.store.setSchedule("note.md", "os-a1b2c3", { ...baseSchedule, reps: 1 });
		const flushing = h.store.flushPath("note.md");
		// Newer rating lands while the (failing) write is in flight
		h.store.setSchedule("note.md", "os-a1b2c3", { ...baseSchedule, reps: 2 });
		await flushing;

		expect(consoleError).toHaveBeenCalled();
		expect(h.store.getPendingEntry("note.md", "os-a1b2c3")?.reps).toBe(2);

		fail = false;
		await h.store.flush();
		const map = h.frontmatters.get("note.md")?.[SCHEDULE_FRONTMATTER_KEY] as Record<
			string,
			{ reps: number }
		>;
		expect(map["os-a1b2c3"]?.reps).toBe(2);
	});

	it("reports isWriting only during the write", async () => {
		const h = makeHarness();
		expect(h.store.isWriting("note.md")).toBe(false);
		h.store.setSchedule("note.md", "os-a1b2c3", baseSchedule);
		expect(h.store.isWriting("note.md")).toBe(false);
		await h.store.flush();
		expect(h.store.isWriting("note.md")).toBe(false);
	});
});
