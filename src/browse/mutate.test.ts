import { describe, it, expect, beforeEach } from "vitest";
import type { TFile } from "obsidian";
import type { Card } from "../database/types";
import { CardStore } from "../store/CardStore";
import { removeFenceSchedule, updateFenceExclude } from "../store/FenceWriter";
import {
	applyDelete,
	applyDeleteOps,
	buildDeletions,
	changeDeck,
	planByNote,
	previewDelete,
	resetCards,
	setSuspended,
	type MutationDeps,
} from "./mutate";
import { MutationHistory } from "./history";

// ── Fixture ───────────────────────────────────────────────────

/**
 * A note shaped like `e2e/fixtures/browser-mixed.md`: one bidi fence carrying two
 * cards' schedules in one metadata block, plus two line cards. Line numbers are
 * asserted against, so the layout matters.
 */
const RIVERS_LINES = [
	"---",                                                                        // 0
	"osmosis-cards: true",                                                        // 1
	"osmosis-deck: geography",                                                    // 2
	"---",                                                                        // 3
	"",                                                                           // 4
	"# Rivers",                                                                   // 5
	"",                                                                           // 6
	"```osmosis",                                                                 // 7
	"id: brw-bidi01",                                                             // 8
	"bidi: true",                                                                 // 9
	"due: 2026-03-15T00:00:00.000Z",                                              // 10
	"stability: 4.5000",                                                          // 11
	"r-due: 2026-04-01T00:00:00.000Z",                                            // 12
	"r-stability: 9.1000",                                                        // 13
	"",                                                                           // 14
	"Longest river in Africa",                                                    // 15
	"***",                                                                        // 16
	"The Nile",                                                                   // 17
	"```",                                                                        // 18
	"",                                                                           // 19
	"- The Amazon carries more water than the next seven rivers combined. ^os-brwln01", // 20
	"- The Caspian Sea is the largest inland body of water on Earth. ^os-brwln02",      // 21
];
const RIVERS = RIVERS_LINES.join("\n");

const RIVERS_PATH = "Geography/Rivers.md";

function makeCard(overrides: Partial<Card> & { id: string }): Card {
	return {
		notePath: RIVERS_PATH,
		deck: "geography",
		cardType: "explicit",
		front: "Front",
		back: "Back",
		typeIn: false,
		sourceLine: 0,
		...overrides,
	};
}

/** The bidi forward card, its reverse sibling, and two line cards. */
function riversCards(): Card[] {
	return [
		makeCard({
			id: "brw-bidi01",
			cardType: "explicit_bidi",
			sourceLine: 7,
			due: Date.parse("2026-03-15T00:00:00.000Z"),
			stability: 4.5,
			reps: 3,
			state: "review",
		}),
		makeCard({
			id: "brw-bidi01-r",
			cardType: "explicit_bidi",
			sourceLine: 7,
			due: Date.parse("2026-04-01T00:00:00.000Z"),
			stability: 9.1,
			reps: 7,
			state: "review",
		}),
		makeCard({
			id: "os-brwln01",
			cardType: "line",
			blockId: "os-brwln01",
			sourceLine: 20,
			due: Date.parse("2026-03-20T00:00:00.000Z"),
			reps: 2,
			state: "review",
		}),
		makeCard({ id: "os-brwln02", cardType: "line", blockId: "os-brwln02", sourceLine: 21 }),
	];
}

// ── Harness ───────────────────────────────────────────────────

interface Harness {
	deps: MutationDeps;
	store: CardStore;
	contents: Map<string, string>;
	/** Calls the fake `ScheduleStore` received, in order. */
	lineWrites: string[];
}

/**
 * Deps over an in-memory file map.
 *
 * The fence writer runs the *real* pure transforms, so the per-fence sibling
 * behaviour is exercised end to end. The line-card writer is a recorder: its
 * frontmatter serialisation is `ScheduleStore`'s job and already has its own
 * tests, so what matters here is that the right calls are made and flushed.
 */
function harness(files: Record<string, string> = { [RIVERS_PATH]: RIVERS }): Harness {
	const contents = new Map(Object.entries(files));
	const store = new CardStore();
	const lineWrites: string[] = [];

	// Test double — nothing under test reads a file for anything but its path.
	const asFile = (path: string): TFile => ({ path }) as never;
	const readPath = (path: string): string => contents.get(path) ?? "";

	const deps: MutationDeps = {
		cardStore: store,
		fenceWriter: {
			writeExclude: (file, cardId, exclude) => {
				contents.set(file.path, updateFenceExclude(readPath(file.path), cardId, exclude));
				return Promise.resolve();
			},
			removeSchedule: (file, cardId) => {
				contents.set(file.path, removeFenceSchedule(readPath(file.path), cardId));
				return Promise.resolve();
			},
		},
		lineCards: {
			setDisabled: (notePath, blockId, disabled) => {
				lineWrites.push(`setDisabled ${notePath} ${blockId} ${String(disabled)}`);
			},
			removeSchedule: (notePath, blockId) => {
				lineWrites.push(`removeSchedule ${notePath} ${blockId}`);
			},
			flushPath: (notePath) => {
				lineWrites.push(`flush ${notePath}`);
				return Promise.resolve();
			},
		},
		files: {
			read: (file) => Promise.resolve(readPath(file.path)),
			process: (file, fn) => {
				const next = fn(readPath(file.path));
				contents.set(file.path, next);
				return Promise.resolve(next);
			},
			// Flat scalar keys only — all `changeDeck` writes, and all the tests need.
			processFrontMatter: (file, fn) => {
				const lines = readPath(file.path).split("\n");
				const hasFm = lines[0] === "---";
				const end = hasFm ? lines.indexOf("---", 1) : -1;
				const frontmatter: Record<string, unknown> = {};
				if (end > 0) {
					for (const line of lines.slice(1, end)) {
						const match = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
						if (match) frontmatter[match[1]!] = match[2]!;
					}
				}
				fn(frontmatter);
				const serialised = Object.entries(frontmatter).map(([k, v]) => `${k}: ${String(v)}`);
				const body = end > 0 ? lines.slice(end + 1) : lines;
				contents.set(file.path, ["---", ...serialised, "---", ...body].join("\n"));
				return Promise.resolve();
			},
		},
		resolveFile: (notePath) => (contents.has(notePath) ? asFile(notePath) : null),
	};

	return { deps, store, contents, lineWrites };
}

function seeded(): Harness {
	const h = harness();
	for (const card of riversCards()) h.store.addCard(card);
	return h;
}

// ── Pure planning ─────────────────────────────────────────────

describe("planByNote", () => {
	it("splits a note's selection into line cards and fence groups", () => {
		const cards = riversCards();
		const plans = planByNote(cards, () => cards);

		expect(plans).toHaveLength(1);
		expect(plans[0]!.notePath).toBe(RIVERS_PATH);
		expect(plans[0]!.lineCards.map((c) => c.id)).toEqual(["os-brwln01", "os-brwln02"]);
		expect(plans[0]!.fences).toHaveLength(1);
		expect(plans[0]!.fences[0]!.baseId).toBe("brw-bidi01");
	});

	it("collapses a fence's cards into one group", () => {
		const cards = riversCards();
		const plans = planByNote([cards[0]!, cards[1]!], () => cards);

		expect(plans[0]!.fences).toHaveLength(1);
		expect(plans[0]!.fences[0]!.selected.map((c) => c.id))
			.toEqual(["brw-bidi01", "brw-bidi01-r"]);
		expect(plans[0]!.fences[0]!.siblings).toEqual([]);
	});

	it("finds the unselected siblings a fence would drag along", () => {
		const cards = riversCards();
		const plans = planByNote([cards[0]!], () => cards);

		expect(plans[0]!.fences[0]!.selected.map((c) => c.id)).toEqual(["brw-bidi01"]);
		expect(plans[0]!.fences[0]!.siblings.map((c) => c.id)).toEqual(["brw-bidi01-r"]);
	});

	it("groups cloze groups under one fence and never counts a line card as a sibling", () => {
		const cards = [
			makeCard({ id: "cloze1-c1", cardType: "explicit_cloze", sourceLine: 4 }),
			makeCard({ id: "cloze1-c2", cardType: "explicit_cloze", sourceLine: 4 }),
			makeCard({ id: "cloze1-c3", cardType: "explicit_cloze", sourceLine: 4 }),
			makeCard({ id: "os-line01", cardType: "line", blockId: "os-line01", sourceLine: 9 }),
		];

		const plans = planByNote([cards[1]!], () => cards);

		expect(plans[0]!.fences[0]!.baseId).toBe("cloze1");
		expect(plans[0]!.fences[0]!.siblings.map((c) => c.id)).toEqual(["cloze1-c1", "cloze1-c3"]);
	});

	it("splits across notes and sorts them", () => {
		const b = makeCard({ id: "b1", notePath: "B.md" });
		const a = makeCard({ id: "a1", notePath: "A.md" });
		const plans = planByNote([b, a], (path) => (path === "A.md" ? [a] : [b]));

		expect(plans.map((p) => p.notePath)).toEqual(["A.md", "B.md"]);
	});
});

describe("buildDeletions", () => {
	it("orders ops descending by source line", () => {
		const cards = riversCards();
		const deletions = buildDeletions(cards, () => cards);

		expect(deletions[0]!.ops).toEqual([
			{ kind: "line", sourceLine: 21 },
			{ kind: "line", sourceLine: 20 },
			{ kind: "fence", cardId: "brw-bidi01", sourceLine: 7 },
		]);
	});

	it("counts a fence's unselected siblings among the cards that will go", () => {
		const cards = riversCards();
		const deletions = buildDeletions([cards[0]!], () => cards);

		expect(deletions[0]!.cards.map((c) => c.id)).toEqual(["brw-bidi01", "brw-bidi01-r"]);
		expect(deletions[0]!.siblings.map((c) => c.id)).toEqual(["brw-bidi01-r"]);
	});

	it("emits one fence op however many of its cards are selected", () => {
		const cards = riversCards();
		const deletions = buildDeletions([cards[0]!, cards[1]!], () => cards);

		expect(deletions[0]!.ops.filter((op) => op.kind === "fence")).toHaveLength(1);
	});
});

describe("applyDeleteOps", () => {
	it("strips a line card's block ID and leaves the prose", () => {
		const result = applyDeleteOps(RIVERS, [{ kind: "line", sourceLine: 20 }]);

		expect(result).toContain("The Amazon carries more water than the next seven rivers combined.");
		expect(result).not.toContain("^os-brwln01");
		expect(result).toContain("^os-brwln02");
	});

	it("removes a fence card's whole fence", () => {
		const result = applyDeleteOps(RIVERS, [
			{ kind: "fence", cardId: "brw-bidi01", sourceLine: 7 },
		]);

		expect(result).not.toContain("Longest river in Africa");
		expect(result).not.toContain("id: brw-bidi01");
		expect(result).toContain("# Rivers");
		expect(result).toContain("^os-brwln01");
	});

	// The reason ops are descending: the fence removal above deletes twelve lines,
	// so any line op applied after it would land twelve lines off target.
	it("keeps line targets accurate when a fence above them is removed too", () => {
		const cards = riversCards();
		const deletions = buildDeletions(cards, () => cards);
		const result = applyDeleteOps(RIVERS, deletions[0]!.ops);

		expect(result).not.toContain("^os-brwln01");
		expect(result).not.toContain("^os-brwln02");
		expect(result).not.toContain("Longest river in Africa");
		expect(result).toContain("The Amazon carries more water");
		expect(result).toContain("The Caspian Sea is the largest inland body of water on Earth.");
	});

	it("is unchanged by an op for a card that is already gone", () => {
		const once = applyDeleteOps(RIVERS, [{ kind: "fence", cardId: "brw-bidi01", sourceLine: 7 }]);
		const twice = applyDeleteOps(once, [{ kind: "fence", cardId: "brw-bidi01", sourceLine: 7 }]);

		expect(twice).toBe(once);
	});
});

// ── Suspend / unsuspend ───────────────────────────────────────

describe("setSuspended", () => {
	let h: Harness;
	beforeEach(() => { h = seeded(); });

	it("suspends a line card in the store and through the frontmatter writer", async () => {
		const outcome = await setSuspended(h.deps, [h.store.getCard("os-brwln01")!], true);

		expect(h.store.getCard("os-brwln01")!.disabled).toBe(true);
		// The leading flush settles any schedule write still inside ScheduleStore's
		// debounce, so the `before` snapshot cannot swallow a just-recorded review.
		expect(h.lineWrites).toEqual([
			`flush ${RIVERS_PATH}`,
			`setDisabled ${RIVERS_PATH} os-brwln01 true`,
			`flush ${RIVERS_PATH}`,
		]);
		expect(outcome!.message).toBe("Suspended 1 card.");
	});

	it("writes exclude: true for a fence card", async () => {
		await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);

		expect(h.contents.get(RIVERS_PATH)).toContain("exclude: true");
	});

	// `exclude:` is per-fence in the file format, so the sibling comes along
	// whether or not we want it to. The store has to agree, or the 2s re-sync
	// disables the sibling anyway and the row flickers.
	it("suspends the whole fence and says how many cards that took", async () => {
		const outcome = await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);

		expect(h.store.getCard("brw-bidi01")!.disabled).toBe(true);
		expect(h.store.getCard("brw-bidi01-r")!.disabled).toBe(true);
		expect(outcome!.message).toBe(
			"Suspended 2 cards. 1 card shared a fence with your selection and was suspended too.",
		);
	});

	it("does not report spillover when the whole fence was selected", async () => {
		const outcome = await setSuspended(
			h.deps,
			[h.store.getCard("brw-bidi01")!, h.store.getCard("brw-bidi01-r")!],
			true,
		);

		expect(outcome!.message).toBe("Suspended 2 cards.");
	});

	it("round-trips: unsuspend restores the card and removes the fence key", async () => {
		await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);
		const outcome = await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], false);

		expect(h.store.getCard("brw-bidi01")!.disabled).toBeUndefined();
		expect(h.contents.get(RIVERS_PATH)).not.toContain("exclude:");
		expect(outcome!.message).toContain("Unsuspended 2 cards.");
	});

	it("preserves FSRS state through a suspend/unsuspend round trip", async () => {
		const before = { ...h.store.getCard("brw-bidi01")! };

		await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);
		await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], false);

		const after = h.store.getCard("brw-bidi01")!;
		expect(after.due).toBe(before.due);
		expect(after.stability).toBe(before.stability);
		expect(after.reps).toBe(before.reps);
		expect(after.state).toBe(before.state);
		expect(h.contents.get(RIVERS_PATH)).toContain("due: 2026-03-15T00:00:00.000Z");
	});

	it("skips cards already in the target state", async () => {
		await setSuspended(h.deps, [h.store.getCard("os-brwln01")!], true);
		h.lineWrites.length = 0;

		const outcome = await setSuspended(
			h.deps,
			[h.store.getCard("os-brwln01")!, h.store.getCard("os-brwln02")!],
			true,
		);

		expect(outcome!.message).toBe("Suspended 1 card.");
		expect(h.lineWrites).toEqual([
			`flush ${RIVERS_PATH}`,
			`setDisabled ${RIVERS_PATH} os-brwln02 true`,
			`flush ${RIVERS_PATH}`,
		]);
	});

	it("returns null when there is nothing to do", async () => {
		expect(await setSuspended(h.deps, [], true)).toBeNull();
		await setSuspended(h.deps, [h.store.getCard("os-brwln01")!], true);
		expect(await setSuspended(h.deps, [h.store.getCard("os-brwln01")!], true)).toBeNull();
	});

	it("records a snapshot of every card it changed", async () => {
		const outcome = await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);

		expect(outcome!.record.cards.map((c) => c.id)).toEqual(["brw-bidi01", "brw-bidi01-r"]);
		expect(outcome!.record.cards[0]!.before!.disabled).toBeUndefined();
		expect(outcome!.record.cards[0]!.after!.disabled).toBe(true);
		expect(outcome!.record.files).toHaveLength(1);
		expect(outcome!.record.files[0]!.before).toBe(RIVERS);
		expect(outcome!.record.files[0]!.after).toContain("exclude: true");
	});
});

// ── Reset ─────────────────────────────────────────────────────

describe("resetCards", () => {
	let h: Harness;
	beforeEach(() => { h = seeded(); });

	it("clears a fence card's schedule in the store and the fence", async () => {
		const outcome = await resetCards(h.deps, [h.store.getCard("brw-bidi01")!]);

		const card = h.store.getCard("brw-bidi01")!;
		expect(card.due).toBeUndefined();
		expect(card.stability).toBeUndefined();
		expect(card.state).toBeUndefined();
		expect(outcome!.message).toBe("Reset 1 card to new. Review history was kept.");
	});

	// The data-loss case this whole feature turns on: one metadata block holds both
	// cards' schedules, and an unscoped removal would silently clear the sibling.
	it("does not clear a sibling card's schedule from the same fence", async () => {
		await resetCards(h.deps, [h.store.getCard("brw-bidi01")!]);

		const sibling = h.store.getCard("brw-bidi01-r")!;
		expect(sibling.due).toBe(Date.parse("2026-04-01T00:00:00.000Z"));
		expect(sibling.stability).toBe(9.1);
		expect(sibling.reps).toBe(7);

		const content = h.contents.get(RIVERS_PATH)!;
		expect(content).toContain("r-due: 2026-04-01T00:00:00.000Z");
		expect(content).toContain("r-stability: 9.1000");
		expect(content).not.toMatch(/^due:/m);
		expect(content).not.toMatch(/^stability:/m);
	});

	it("resets a line card through the frontmatter writer", async () => {
		await resetCards(h.deps, [h.store.getCard("os-brwln01")!]);

		expect(h.store.getCard("os-brwln01")!.due).toBeUndefined();
		expect(h.lineWrites).toEqual([
			`flush ${RIVERS_PATH}`,
			`removeSchedule ${RIVERS_PATH} os-brwln01`,
			`flush ${RIVERS_PATH}`,
		]);
	});

	it("skips cards that are already new", async () => {
		const outcome = await resetCards(h.deps, [h.store.getCard("os-brwln02")!]);
		expect(outcome).toBeNull();
	});

	it("leaves the note's other cards and its prose alone", async () => {
		await resetCards(h.deps, [h.store.getCard("brw-bidi01")!]);

		const content = h.contents.get(RIVERS_PATH)!;
		expect(content).toContain("Longest river in Africa");
		expect(content).toContain("^os-brwln01");
		expect(content).toContain("id: brw-bidi01");
	});
});

// ── Delete ────────────────────────────────────────────────────

describe("previewDelete / applyDelete", () => {
	let h: Harness;
	beforeEach(() => { h = seeded(); });

	it("counts the cards, the siblings and the notes before touching anything", async () => {
		const preview = await previewDelete(h.deps, [h.store.getCard("brw-bidi01")!]);

		expect(preview.cardCount).toBe(2);
		expect(preview.siblingCount).toBe(1);
		expect(preview.notePaths).toEqual([RIVERS_PATH]);
		expect(h.contents.get(RIVERS_PATH)).toBe(RIVERS);
	});

	it("counts user-authored block IDs, which deleting can break links to", async () => {
		h.store.addCard(makeCard({ id: "my-own-id", cardType: "line", blockId: "my-own-id", sourceLine: 21 }));
		h.contents.set(RIVERS_PATH, RIVERS.replace("^os-brwln02", "^my-own-id"));

		const clean = await previewDelete(h.deps, [h.store.getCard("os-brwln01")!]);
		expect(clean.userIdCount).toBe(0);

		const dirty = await previewDelete(h.deps, [h.store.getCard("my-own-id")!]);
		expect(dirty.userIdCount).toBe(1);
	});

	it("deletes a line card by stripping its ID, leaving the prose", async () => {
		const preview = await previewDelete(h.deps, [h.store.getCard("os-brwln01")!]);
		const outcome = await applyDelete(h.deps, preview);

		expect(h.store.getCard("os-brwln01")).toBeUndefined();
		expect(h.contents.get(RIVERS_PATH)).toContain("The Amazon carries more water");
		expect(h.contents.get(RIVERS_PATH)).not.toContain("^os-brwln01");
		expect(outcome!.message).toBe("Deleted 1 card from 1 note.");
	});

	it("deletes a fence card's whole fence, siblings included", async () => {
		const preview = await previewDelete(h.deps, [h.store.getCard("brw-bidi01")!]);
		const outcome = await applyDelete(h.deps, preview);

		expect(h.store.getCard("brw-bidi01")).toBeUndefined();
		expect(h.store.getCard("brw-bidi01-r")).toBeUndefined();
		expect(h.contents.get(RIVERS_PATH)).not.toContain("Longest river in Africa");
		expect(outcome!.message).toBe("Deleted 2 cards from 1 note.");
	});

	it("records the deleted cards as absent afterwards", async () => {
		const preview = await previewDelete(h.deps, [h.store.getCard("os-brwln01")!]);
		const outcome = await applyDelete(h.deps, preview);

		expect(outcome!.record.cards[0]!.before!.id).toBe("os-brwln01");
		expect(outcome!.record.cards[0]!.after).toBeNull();
	});
});

// ── Change deck ───────────────────────────────────────────────

describe("changeDeck", () => {
	let h: Harness;
	beforeEach(() => { h = seeded(); });

	it("writes osmosis-deck and moves the note's cards", async () => {
		const outcome = await changeDeck(h.deps, [RIVERS_PATH], "hydrology");

		expect(h.contents.get(RIVERS_PATH)).toContain("osmosis-deck: hydrology");
		expect(h.store.getCard("os-brwln01")!.deck).toBe("hydrology");
		expect(h.store.getCard("brw-bidi01")!.deck).toBe("hydrology");
		expect(outcome!.message).toBe('Moved 4 cards to "hydrology".');
	});

	it("leaves a fence that sets its own deck alone, and reports it", async () => {
		h.contents.set(RIVERS_PATH, RIVERS.replace("bidi: true", "bidi: true\ndeck: geography/rivers"));

		const outcome = await changeDeck(h.deps, [RIVERS_PATH], "hydrology");

		expect(h.store.getCard("brw-bidi01")!.deck).toBe("geography");
		expect(h.store.getCard("brw-bidi01-r")!.deck).toBe("geography");
		expect(h.store.getCard("os-brwln01")!.deck).toBe("hydrology");
		expect(outcome!.message).toBe(
			'Moved 2 cards to "hydrology". 2 cards set their own deck in the fence and were left alone.',
		);
	});

	it("clearing the deck falls back to the note's folder", async () => {
		const outcome = await changeDeck(h.deps, [RIVERS_PATH], "");

		expect(h.contents.get(RIVERS_PATH)).not.toContain("osmosis-deck");
		expect(h.store.getCard("os-brwln01")!.deck).toBe("Geography");
		expect(outcome!.message).toBe("Moved 4 cards to their folder deck.");
	});

	it("returns null for a note with no cards", async () => {
		h.contents.set("Empty.md", "# Empty");
		expect(await changeDeck(h.deps, ["Empty.md"], "hydrology")).toBeNull();
	});
});

// ── Undo / redo ───────────────────────────────────────────────

describe("MutationHistory", () => {
	let h: Harness;
	let history: MutationHistory;
	beforeEach(() => {
		h = seeded();
		history = new MutationHistory(h.deps);
	});

	it("has nothing to undo until a mutation is pushed", async () => {
		expect(history.undoLabel).toBeNull();
		expect(await history.undo()).toEqual({ ok: false, reason: "empty" });
	});

	it("undoes a suspend, restoring the note and the cards", async () => {
		const outcome = await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);
		history.push(outcome!.record);
		expect(history.undoLabel).toBe("Suspend 2 cards");

		expect(await history.undo()).toEqual({ ok: true, label: "Suspend 2 cards" });
		expect(h.contents.get(RIVERS_PATH)).toBe(RIVERS);
		expect(h.store.getCard("brw-bidi01")!.disabled).toBeUndefined();
		expect(h.store.getCard("brw-bidi01-r")!.disabled).toBeUndefined();
	});

	it("redoes what it undid", async () => {
		const outcome = await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);
		history.push(outcome!.record);
		await history.undo();

		expect(history.redoLabel).toBe("Suspend 2 cards");
		expect(await history.redo()).toEqual({ ok: true, label: "Suspend 2 cards" });
		expect(h.contents.get(RIVERS_PATH)).toContain("exclude: true");
		expect(h.store.getCard("brw-bidi01")!.disabled).toBe(true);
		expect(history.redoLabel).toBeNull();
	});

	it("brings deleted cards back, prose and fence alike", async () => {
		const preview = await previewDelete(h.deps, [
			h.store.getCard("brw-bidi01")!,
			h.store.getCard("os-brwln01")!,
		]);
		const outcome = await applyDelete(h.deps, preview);
		history.push(outcome!.record);

		expect(await history.undo()).toMatchObject({ ok: true });
		expect(h.contents.get(RIVERS_PATH)).toBe(RIVERS);
		expect(h.store.getCard("brw-bidi01")!.due).toBe(Date.parse("2026-03-15T00:00:00.000Z"));
		expect(h.store.getCard("brw-bidi01-r")!.stability).toBe(9.1);
		expect(h.store.getCard("os-brwln01")!.reps).toBe(2);
	});

	it("restores a reset card's full FSRS state", async () => {
		const before = { ...h.store.getCard("brw-bidi01")! };
		const outcome = await resetCards(h.deps, [h.store.getCard("brw-bidi01")!]);
		history.push(outcome!.record);

		await history.undo();

		expect(h.store.getCard("brw-bidi01")).toEqual(before);
		expect(h.contents.get(RIVERS_PATH)).toBe(RIVERS);
	});

	it("undoes a deck change, frontmatter included", async () => {
		const outcome = await changeDeck(h.deps, [RIVERS_PATH], "hydrology");
		history.push(outcome!.record);

		await history.undo();

		expect(h.contents.get(RIVERS_PATH)).toBe(RIVERS);
		expect(h.store.getCard("os-brwln01")!.deck).toBe("geography");
	});

	it("unwinds several mutations in reverse order", async () => {
		history.push((await setSuspended(h.deps, [h.store.getCard("os-brwln01")!], true))!.record);
		history.push((await resetCards(h.deps, [h.store.getCard("brw-bidi01")!]))!.record);

		expect(history.undoLabel).toBe("Reset 1 card");
		await history.undo();
		expect(history.undoLabel).toBe("Suspend 1 card");
		await history.undo();

		expect(history.undoLabel).toBeNull();
		expect(h.store.getCard("os-brwln01")!.disabled).toBeUndefined();
		expect(h.store.getCard("brw-bidi01")!.due).toBe(Date.parse("2026-03-15T00:00:00.000Z"));
	});

	it("drops the redo branch when a new mutation lands", async () => {
		history.push((await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true))!.record);
		await history.undo();
		expect(history.redoLabel).not.toBeNull();

		history.push((await resetCards(h.deps, [h.store.getCard("brw-bidi01")!]))!.record);

		expect(history.redoLabel).toBeNull();
	});

	// The hazard of restoring whole-file snapshots: an edit made after the
	// mutation would be overwritten. Losing the race is better than winning it.
	it("refuses to undo a note that changed since the mutation", async () => {
		const outcome = await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);
		history.push(outcome!.record);

		h.contents.set(RIVERS_PATH, `${h.contents.get(RIVERS_PATH)!}\n\n- A line added since. ^os-later1`);

		expect(await history.undo()).toEqual({ ok: false, reason: "conflict", path: RIVERS_PATH });
		expect(h.contents.get(RIVERS_PATH)).toContain("A line added since.");
		expect(h.contents.get(RIVERS_PATH)).toContain("exclude: true");
		// Still undoable once the conflict is resolved.
		expect(history.undoLabel).toBe("Suspend 2 cards");
	});

	it("refuses to undo when the note is gone", async () => {
		const outcome = await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true);
		history.push(outcome!.record);
		h.contents.delete(RIVERS_PATH);

		expect(await history.undo()).toEqual({ ok: false, reason: "missing", path: RIVERS_PATH });
	});

	it("writes nothing when one note of a multi-note mutation conflicts", async () => {
		h.contents.set("Other.md", RIVERS);
		h.store.addCard(makeCard({ id: "other-line", notePath: "Other.md", cardType: "line", blockId: "os-brwln01", sourceLine: 20 }));

		const outcome = await setSuspended(
			h.deps,
			[h.store.getCard("brw-bidi01")!, h.store.getCard("other-line")!],
			true,
		);
		history.push(outcome!.record);

		const suspended = h.contents.get(RIVERS_PATH)!;
		h.contents.set("Other.md", "changed out from under us");

		expect(await history.undo()).toEqual({ ok: false, reason: "conflict", path: "Other.md" });
		// The note that *could* have been restored was left alone too.
		expect(h.contents.get(RIVERS_PATH)).toBe(suspended);
	});

	it("evicts the oldest entry past its limit", async () => {
		const small = new MutationHistory(h.deps, 2);
		small.push({ label: "one", files: [], cards: [] });
		small.push({ label: "two", files: [], cards: [] });
		small.push({ label: "three", files: [], cards: [] });

		expect(small.undoLabel).toBe("three");
		await small.undo();
		expect(small.undoLabel).toBe("two");
		await small.undo();
		expect(small.undoLabel).toBeNull();
	});

	it("clear() empties both stacks", async () => {
		history.push((await setSuspended(h.deps, [h.store.getCard("brw-bidi01")!], true))!.record);
		await history.undo();
		history.clear();

		expect(history.undoLabel).toBeNull();
		expect(history.redoLabel).toBeNull();
	});
});
