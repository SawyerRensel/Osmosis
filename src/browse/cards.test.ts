import { describe, it, expect } from "vitest";
import type { Card, CardType } from "../database/types";
import {
	DEFAULT_BROWSE_OPTIONS,
	FILTERABLE_CARD_TYPES,
	TILE_HEIGHT,
	buildFlat,
	buildGroups,
	cardTypeOptionKey,
	dayOffset,
	effectiveState,
	filterCards,
	formatDue,
	matchesDueWindow,
	matchesSearch,
	matchesState,
	matchesTypes,
	previewText,
	readBrowseOptions,
	sortCards,
	toRow,
	typeLabel,
	type BrowseOptions,
} from "./cards";

/** Local noon on a fixed day, so day-boundary maths never straddles a DST edge. */
const NOW = new Date(2026, 7, 8, 12, 0, 0, 0).getTime();

function daysFromNow(days: number, hour = 12): number {
	const d = new Date(NOW);
	d.setDate(d.getDate() + days);
	d.setHours(hour, 0, 0, 0);
	return d.getTime();
}

function card(overrides: Partial<Card> & { id: string }): Card {
	return {
		notePath: "Geography/Rivers.md",
		deck: "geography",
		cardType: "line",
		front: "front",
		back: "back",
		typeIn: false,
		sourceLine: 0,
		...overrides,
	};
}

/** A reviewed card, so schedule-dependent behaviour has something to act on. */
function reviewed(overrides: Partial<Card> & { id: string }): Card {
	return card({
		due: daysFromNow(1),
		state: "review",
		stability: 10,
		difficulty: 5,
		reps: 3,
		lapses: 0,
		lastReview: daysFromNow(-1),
		learningSteps: 0,
		...overrides,
	});
}

function options(overrides: Partial<BrowseOptions> = {}): BrowseOptions {
	return { ...DEFAULT_BROWSE_OPTIONS, ...overrides };
}

describe("readBrowseOptions", () => {
	it("returns defaults when the base file has no values", () => {
		expect(readBrowseOptions(() => undefined)).toEqual(DEFAULT_BROWSE_OPTIONS);
	});

	it("reads every option through", () => {
		const stored: Record<string, unknown> = {
			layout: "cards",
			cardState: "learning",
			dueWindow: "30d",
			sortBy: "lapses",
			showDisabled: true,
			search: "danube",
			tileHeight: 320,
		};
		expect(readBrowseOptions((key) => stored[key])).toMatchObject({
			layout: "cards",
			cardState: "learning",
			dueWindow: "30d",
			sortBy: "lapses",
			showDisabled: true,
			search: "danube",
			tileHeight: 320,
		});
	});

	it("falls back to the default for a value a hand-edited base file got wrong", () => {
		const stored: Record<string, unknown> = { layout: "grid", sortBy: 7 };
		const result = readBrowseOptions((key) => stored[key]);
		expect(result.layout).toBe("table");
		expect(result.sortBy).toBe("due");
	});

	it("treats any non-true showDisabled as false", () => {
		expect(readBrowseOptions(() => "true").showDisabled).toBe(false);
	});

	it("trims the search query", () => {
		expect(readBrowseOptions(() => "  danube  ").search).toBe("danube");
	});

	it("clamps the tile height into the slider's range", () => {
		expect(readBrowseOptions(() => 10_000).tileHeight).toBe(TILE_HEIGHT.max);
		expect(readBrowseOptions(() => 1).tileHeight).toBe(TILE_HEIGHT.min);
		expect(readBrowseOptions(() => "not a number").tileHeight).toBe(TILE_HEIGHT.default);
	});

	describe("card type toggles", () => {
		it("shows every type when nothing is stored", () => {
			expect(readBrowseOptions(() => undefined).cardTypes)
				.toEqual(new Set(FILTERABLE_CARD_TYPES));
		});

		it("treats a missing type as on, so a new card type is not hidden by an old base", () => {
			const stored: Record<string, unknown> = { [cardTypeOptionKey("line")]: false };
			const types = readBrowseOptions((key) => stored[key]).cardTypes;
			expect(types.has("line")).toBe(false);
			expect(types.has("explicit")).toBe(true);
		});

		it("keeps a multi-selection of types", () => {
			const stored: Record<string, unknown> = {
				[cardTypeOptionKey("explicit_bidi")]: false,
				[cardTypeOptionKey("explicit_cloze")]: false,
				[cardTypeOptionKey("line")]: false,
			};
			expect(readBrowseOptions((key) => stored[key]).cardTypes)
				.toEqual(new Set<CardType>(["explicit", "code_cloze"]));
		});
	});
});

describe("effectiveState", () => {
	it("is new when the card has no due date", () => {
		expect(effectiveState(card({ id: "a" }))).toBe("new");
	});

	it("reads the state of a scheduled card", () => {
		expect(effectiveState(reviewed({ id: "a", state: "relearning" }))).toBe("relearning");
	});

	it("lets a missing due date override a stale state field", () => {
		expect(effectiveState(card({ id: "a", state: "review" }))).toBe("new");
	});
});

describe("matchesState", () => {
	it("matches everything under 'all'", () => {
		expect(matchesState(card({ id: "a" }), "all")).toBe(true);
		expect(matchesState(reviewed({ id: "b" }), "all")).toBe(true);
	});

	it("selects by effective state", () => {
		const learning = reviewed({ id: "a", state: "learning" });
		expect(matchesState(learning, "learning")).toBe(true);
		expect(matchesState(learning, "review")).toBe(false);
	});
});

describe("matchesTypes", () => {
	const bidi = card({ id: "a", cardType: "explicit_bidi" });

	it("treats an empty selection as no constraint, not as nothing", () => {
		expect(matchesTypes(bidi, new Set())).toBe(true);
	});

	it("selects several types at once", () => {
		const pair = new Set<CardType>(["explicit", "code_cloze"]);
		expect(matchesTypes(card({ id: "b", cardType: "explicit" }), pair)).toBe(true);
		expect(matchesTypes(card({ id: "c", cardType: "code_cloze" }), pair)).toBe(true);
		expect(matchesTypes(bidi, pair)).toBe(false);
	});
});

describe("matchesSearch", () => {
	const subject = card({
		id: "brw-susp01",
		deck: "geography",
		front: "Which strait separates Europe from Asia?",
		back: "The Bosphorus",
	});

	it("matches everything on an empty query", () => {
		expect(matchesSearch(subject, "")).toBe(true);
	});

	it("finds a card by its answer, which is the half the list does not show", () => {
		expect(matchesSearch(subject, "Bosphorus")).toBe(true);
	});

	it("ignores case", () => {
		expect(matchesSearch(subject, "bOsPhOrUs")).toBe(true);
	});

	it("matches the question, deck and id too", () => {
		expect(matchesSearch(subject, "strait")).toBe(true);
		expect(matchesSearch(subject, "geography")).toBe(true);
		expect(matchesSearch(subject, "susp01")).toBe(true);
	});

	it("rejects a miss", () => {
		expect(matchesSearch(subject, "danube")).toBe(false);
	});
});

describe("dayOffset", () => {
	it("is zero anywhere inside today", () => {
		expect(dayOffset(daysFromNow(0, 0), NOW)).toBe(0);
		expect(dayOffset(daysFromNow(0, 23), NOW)).toBe(0);
	});

	it("counts whole days either side", () => {
		expect(dayOffset(daysFromNow(3), NOW)).toBe(3);
		expect(dayOffset(daysFromNow(-6), NOW)).toBe(-6);
	});
});

describe("matchesDueWindow", () => {
	const overdue = reviewed({ id: "a", due: daysFromNow(-6) });
	const dueToday = reviewed({ id: "b", due: daysFromNow(0, 23) });
	const dueSoon = reviewed({ id: "c", due: daysFromNow(5) });
	const dueLater = reviewed({ id: "d", due: daysFromNow(20) });
	const dueFarOff = reviewed({ id: "e", due: daysFromNow(90) });
	const brandNew = card({ id: "f" });

	it("matches everything under 'any', new cards included", () => {
		for (const c of [overdue, dueToday, dueSoon, dueFarOff, brandNew]) {
			expect(matchesDueWindow(c, "any", NOW)).toBe(true);
		}
	});

	it("isolates the backlog under 'overdue'", () => {
		expect(matchesDueWindow(overdue, "overdue", NOW)).toBe(true);
		expect(matchesDueWindow(dueToday, "overdue", NOW)).toBe(false);
		expect(matchesDueWindow(dueSoon, "overdue", NOW)).toBe(false);
	});

	it("includes the backlog in every forward window", () => {
		for (const window of ["today", "7d", "30d"] as const) {
			expect(matchesDueWindow(overdue, window, NOW)).toBe(true);
		}
	});

	it("bounds each forward window", () => {
		expect(matchesDueWindow(dueSoon, "today", NOW)).toBe(false);
		expect(matchesDueWindow(dueSoon, "7d", NOW)).toBe(true);
		expect(matchesDueWindow(dueLater, "7d", NOW)).toBe(false);
		expect(matchesDueWindow(dueLater, "30d", NOW)).toBe(true);
		expect(matchesDueWindow(dueFarOff, "30d", NOW)).toBe(false);
	});

	it("excludes new cards from every window but 'any'", () => {
		for (const window of ["overdue", "today", "7d", "30d"] as const) {
			expect(matchesDueWindow(brandNew, window, NOW)).toBe(false);
		}
	});
});

describe("filterCards", () => {
	it("hides suspended cards by default", () => {
		const cards = [card({ id: "a" }), card({ id: "b", disabled: true })];
		expect(filterCards(cards, options(), NOW).map((c) => c.id)).toEqual(["a"]);
	});

	it("shows suspended cards when asked", () => {
		const cards = [card({ id: "a" }), card({ id: "b", disabled: true })];
		const shown = filterCards(cards, options({ showDisabled: true }), NOW);
		expect(shown.map((c) => c.id)).toEqual(["a", "b"]);
	});

	it("never hides deck-excluded cards, which are studied in place", () => {
		const cards = [card({ id: "a", excludeFromDecks: true })];
		expect(filterCards(cards, options(), NOW).map((c) => c.id)).toEqual(["a"]);
	});

	it("applies state, type, due and search filters together", () => {
		const cards = [
			reviewed({ id: "match", cardType: "explicit", state: "review", due: daysFromNow(2), front: "Danube" }),
			reviewed({ id: "wrong-type", cardType: "line", state: "review", due: daysFromNow(2), front: "Danube" }),
			reviewed({ id: "wrong-state", cardType: "explicit", state: "learning", due: daysFromNow(2), front: "Danube" }),
			reviewed({ id: "too-far", cardType: "explicit", state: "review", due: daysFromNow(40), front: "Danube" }),
			reviewed({ id: "wrong-text", cardType: "explicit", state: "review", due: daysFromNow(2), front: "Nile" }),
		];
		const result = filterCards(
			cards,
			options({
				cardState: "review",
				cardTypes: new Set(["explicit"]),
				dueWindow: "7d",
				search: "danube",
			}),
			NOW,
		);
		expect(result.map((c) => c.id)).toEqual(["match"]);
	});
});

describe("sortCards", () => {
	it("sorts due dates soonest first, new cards last", () => {
		const cards = [
			card({ id: "new" }),
			reviewed({ id: "later", due: daysFromNow(9) }),
			reviewed({ id: "sooner", due: daysFromNow(1) }),
		];
		expect(sortCards(cards, "due").map((c) => c.id)).toEqual(["sooner", "later", "new"]);
	});

	it("sorts state through the lifecycle", () => {
		const cards = [
			reviewed({ id: "review", state: "review" }),
			card({ id: "new" }),
			reviewed({ id: "relearning", state: "relearning" }),
			reviewed({ id: "learning", state: "learning" }),
		];
		expect(sortCards(cards, "state").map((c) => c.id))
			.toEqual(["new", "learning", "relearning", "review"]);
	});

	it("puts the hardest, most-lapsed and most-reviewed cards first", () => {
		const cards = [
			reviewed({ id: "mild", difficulty: 2, lapses: 0, reps: 1 }),
			reviewed({ id: "harsh", difficulty: 9, lapses: 7, reps: 20 }),
		];
		for (const key of ["difficulty", "lapses", "reps"] as const) {
			expect(sortCards(cards, key).map((c) => c.id)).toEqual(["harsh", "mild"]);
		}
	});

	it("puts the weakest cards first when sorting by stability", () => {
		const cards = [
			reviewed({ id: "strong", stability: 200 }),
			reviewed({ id: "weak", stability: 2 }),
		];
		expect(sortCards(cards, "stability").map((c) => c.id)).toEqual(["weak", "strong"]);
	});

	it("sinks cards missing the key whichever way the key runs", () => {
		const cards = [
			card({ id: "unreviewed" }),
			reviewed({ id: "reviewed", difficulty: 4, stability: 4 }),
		];
		expect(sortCards(cards, "difficulty").map((c) => c.id)).toEqual(["reviewed", "unreviewed"]);
		expect(sortCards(cards, "stability").map((c) => c.id)).toEqual(["reviewed", "unreviewed"]);
	});

	it("sorts note and deck alphabetically", () => {
		const cards = [
			card({ id: "b", notePath: "Zoning.md", deck: "urban" }),
			card({ id: "a", notePath: "Aqueducts.md", deck: "architecture" }),
		];
		expect(sortCards(cards, "note").map((c) => c.id)).toEqual(["a", "b"]);
		expect(sortCards(cards, "deck").map((c) => c.id)).toEqual(["a", "b"]);
	});

	it("breaks ties by note, then source line, then id, so renders are stable", () => {
		const cards = [
			card({ id: "z", notePath: "A.md", sourceLine: 5 }),
			card({ id: "a", notePath: "A.md", sourceLine: 5 }),
			card({ id: "m", notePath: "A.md", sourceLine: 1 }),
			card({ id: "b", notePath: "B.md", sourceLine: 0 }),
		];
		expect(sortCards(cards, "due").map((c) => c.id)).toEqual(["m", "a", "z", "b"]);
	});

	it("orders by document position under 'base', not by any card field", () => {
		const cards = [
			reviewed({ id: "late-line", sourceLine: 90, due: daysFromNow(1) }),
			reviewed({ id: "early-line", sourceLine: 2, due: daysFromNow(99) }),
		];
		expect(sortCards(cards, "base").map((c) => c.id)).toEqual(["early-line", "late-line"]);
	});

	it("returns a new array rather than sorting in place", () => {
		const cards = [reviewed({ id: "b", due: daysFromNow(9) }), reviewed({ id: "a", due: daysFromNow(1) })];
		const sorted = sortCards(cards, "due");
		expect(sorted).not.toBe(cards);
		expect(cards.map((c) => c.id)).toEqual(["b", "a"]);
	});
});

describe("buildGroups", () => {
	const rivers = "Geography/Rivers.md";
	const spanish = "Languages/Spanish.md";

	const byNote = new Map<string, Card[]>([
		[rivers, [
			reviewed({ id: "r2", notePath: rivers, sourceLine: 8, due: daysFromNow(4) }),
			reviewed({ id: "r1", notePath: rivers, sourceLine: 2, due: daysFromNow(1) }),
		]],
		[spanish, [
			card({ id: "s1", notePath: spanish, deck: "es", cardType: "explicit" }),
		]],
	]);
	const lookup = (path: string): Card[] => byNote.get(path) ?? [];

	it("expands one note into its cards, keeping the note order Bases gave", () => {
		const groups = buildGroups([spanish, rivers], lookup, options(), NOW);
		expect(groups.map((g) => g.notePath)).toEqual([spanish, rivers]);
		expect(groups[1]?.cards.map((c) => c.id)).toEqual(["r1", "r2"]);
	});

	it("collects the distinct decks a note's cards land in", () => {
		const mixed = "Mixed.md";
		const groups = buildGroups(
			[mixed],
			() => [
				card({ id: "a", notePath: mixed, deck: "urban" }),
				card({ id: "b", notePath: mixed, deck: "architecture" }),
				card({ id: "c", notePath: mixed, deck: "urban" }),
			],
			options(),
			NOW,
		);
		expect(groups[0]?.decks).toEqual(["architecture", "urban"]);
	});

	it("drops a note whose cards are all filtered out", () => {
		const groups = buildGroups([spanish, rivers], lookup, options({ cardState: "review" }), NOW);
		expect(groups.map((g) => g.notePath)).toEqual([rivers]);
	});

	it("returns nothing when a note has no cards at all", () => {
		expect(buildGroups(["Empty.md"], () => [], options(), NOW)).toEqual([]);
	});
});

describe("buildFlat", () => {
	it("merges every note into one globally sorted list", () => {
		const byNote = new Map<string, Card[]>([
			["A.md", [reviewed({ id: "a-hard", notePath: "A.md", difficulty: 3 })]],
			["B.md", [reviewed({ id: "b-harder", notePath: "B.md", difficulty: 9 })]],
		]);
		const flat = buildFlat(
			["A.md", "B.md"],
			(path) => byNote.get(path) ?? [],
			options({ sortBy: "difficulty" }),
			NOW,
		);
		expect(flat.map((c) => c.id)).toEqual(["b-harder", "a-hard"]);
	});

	it("applies the same filters as the grouped layouts", () => {
		const flat = buildFlat(
			["A.md"],
			() => [card({ id: "a" }), card({ id: "b", disabled: true })],
			options(),
			NOW,
		);
		expect(flat.map((c) => c.id)).toEqual(["a"]);
	});

	/**
	 * The reason "base" is a sort value at all: under any other value the merged
	 * list is sorted as a whole, which interleaves notes and discards the order
	 * Bases produced.
	 */
	it("keeps the base's note order under 'base', rather than interleaving notes", () => {
		const byNote = new Map<string, Card[]>([
			["Second.md", [
				reviewed({ id: "s2", notePath: "Second.md", sourceLine: 9, due: daysFromNow(1) }),
				reviewed({ id: "s1", notePath: "Second.md", sourceLine: 1, due: daysFromNow(8) }),
			]],
			["First.md", [
				reviewed({ id: "f1", notePath: "First.md", sourceLine: 3, due: daysFromNow(4) }),
			]],
		]);
		const lookup = (path: string): Card[] => byNote.get(path) ?? [];

		expect(buildFlat(["Second.md", "First.md"], lookup, options({ sortBy: "base" }), NOW)
			.map((c) => c.id)).toEqual(["s1", "s2", "f1"]);

		// ...whereas a card-field sort deliberately ignores which note is which.
		expect(buildFlat(["Second.md", "First.md"], lookup, options({ sortBy: "due" }), NOW)
			.map((c) => c.id)).toEqual(["s2", "f1", "s1"]);
	});
});

describe("typeLabel", () => {
	it("names every card type Osmosis generates", () => {
		const types: CardType[] = ["explicit", "explicit_bidi", "explicit_cloze", "code_cloze", "line"];
		for (const type of types) {
			expect(typeLabel(type)).not.toBe("");
		}
		expect(typeLabel("explicit_bidi")).toBe("Bidirectional");
	});
});

describe("formatDue", () => {
	it("dashes a card with no schedule", () => {
		expect(formatDue(undefined, NOW)).toBe("—");
	});

	it("reads the backlog as distance", () => {
		expect(formatDue(daysFromNow(-6), NOW)).toBe("6d overdue");
		expect(formatDue(daysFromNow(-1), NOW)).toBe("1d overdue");
	});

	it("names the next two days", () => {
		expect(formatDue(daysFromNow(0, 23), NOW)).toBe("today");
		expect(formatDue(daysFromNow(1), NOW)).toBe("tomorrow");
	});

	it("falls back to a calendar date further out", () => {
		expect(formatDue(daysFromNow(30), NOW)).toMatch(/\d/);
	});

	it("carries the year once the date leaves this one", () => {
		const nextYear = new Date(2027, 2, 3, 12).getTime();
		expect(formatDue(nextYear, NOW)).toMatch(/2027/);
	});
});

describe("previewText", () => {
	it("collapses the newlines and indentation a cloze or code card carries", () => {
		expect(previewText("first\n\n   second\tthird  ")).toBe("first second third");
	});

	it("leaves a short front alone", () => {
		expect(previewText("The Danube")).toBe("The Danube");
	});

	it("truncates a long front to one scannable line", () => {
		const result = previewText("word ".repeat(40));
		expect(result.length).toBeLessThanOrEqual(80);
		expect(result.endsWith("…")).toBe(true);
	});
});

describe("toRow", () => {
	it("projects a reviewed card into display strings", () => {
		const row = toRow(
			reviewed({
				id: "a", deck: "geography", front: "Longest river in Africa", back: "The Nile",
				stability: 12.34, difficulty: 5.67, reps: 4, lapses: 1,
			}),
			NOW,
		);
		expect(row).toMatchObject({
			state: "review",
			typeLabel: "Line",
			deck: "geography",
			due: "tomorrow",
			stability: "12.3",
			difficulty: "5.7",
			reps: "4",
			lapses: "1",
			front: "Longest river in Africa",
			back: "The Nile",
			suspended: false,
		});
	});

	it("previews the back the same way as the front", () => {
		const row = toRow(card({ id: "a", back: "first\n\n   second  " }), NOW);
		expect(row.back).toBe("first second");
	});

	it("dashes every schedule field of a new card", () => {
		const row = toRow(card({ id: "a" }), NOW);
		expect(row.state).toBe("new");
		for (const field of [row.due, row.stability, row.difficulty, row.reps, row.lapses]) {
			expect(field).toBe("—");
		}
	});

	it("dashes an empty deck rather than rendering a blank cell", () => {
		expect(toRow(card({ id: "a", deck: "" }), NOW).deck).toBe("—");
	});

	it("flags a suspended card", () => {
		expect(toRow(card({ id: "a", disabled: true }), NOW).suspended).toBe(true);
	});
});
