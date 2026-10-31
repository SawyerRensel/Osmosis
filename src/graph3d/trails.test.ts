import { describe, expect, it } from "vitest";
import type { Card } from "../database/types";
import type { GraphNode } from "./model";
import { cardsToGo, nextStop, routeStops, stopDone, threadNodeIds, threadSegments, type RouteStop } from "./trails";

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const DAY = 86_400_000;
const A = "tests/graph3d/Harbour Rules.md";
const B = "tests/graph3d/Crew Drills.md";

function card(overrides: Partial<Card> & { id: string }): Card {
	return { notePath: A, deck: "tests", cardType: "line", front: "front", back: "back", typeIn: false, sourceLine: 0, ...overrides };
}

function stop(overrides: Partial<RouteStop> & { key: string }): RouteStop {
	return { path: A, keys: [overrides.key], due: NOW - DAY, line: 0, ...overrides };
}

describe("routeStops", () => {
	it("makes one stop per due or new node across notes, and skips future, disabled and occlusion cards", () => {
		const occlusion = { image: "chart.png", shapes: [], target: "1", mode: "hide-all-guess-one" } as unknown as Card["occlusion"];
		const stops = routeStops(
			[
				card({ id: `${A}#^os-due`, blockId: "os-due", due: NOW - DAY, sourceLine: 4 }),
				card({ id: `${A}#^os-new`, blockId: "os-new", sourceLine: 2 }),
				card({ id: `${A}#^os-later`, blockId: "os-later", due: NOW + DAY }),
				card({ id: `${A}#^os-off`, blockId: "os-off", disabled: true, due: NOW - DAY }),
				card({ id: `${A}#^os-map/c1`, blockId: "os-map", cardType: "occlusion", occlusion, due: NOW - DAY }),
				card({ id: `${B}#^os-drill`, notePath: B, blockId: "os-drill", due: NOW - 3 * DAY, sourceLine: 9 }),
			],
			NOW,
		);
		expect(stops.map((s) => s.key).sort()).toEqual([`${A}#^os-due`, `${A}#^os-new`, `${B}#^os-drill`].sort());
		expect(stops.find((s) => s.key === `${A}#^os-new`)).toMatchObject({ path: A, due: NOW, line: 2 });
		expect(stops.find((s) => s.key === `${B}#^os-drill`)).toMatchObject({ path: B, due: NOW - 3 * DAY, line: 9 });
	});

	it("keeps a fence's due cards in ask order as one stop", () => {
		const stops = routeStops(
			[
				card({ id: "rr-sounds-c2", cardType: "explicit_cloze", due: NOW - DAY, sourceLine: 20 }),
				card({ id: "rr-sounds-c1", cardType: "explicit_cloze", due: NOW - 2 * DAY, sourceLine: 20 }),
				card({ id: "rr-sounds-c3", cardType: "explicit_cloze", due: NOW + DAY, sourceLine: 20 }),
			],
			NOW,
		);
		expect(stops).toEqual([{ key: "rr-sounds", path: A, keys: ["rr-sounds-c1", "rr-sounds-c2"], due: NOW - 2 * DAY, line: 20 }]);
	});
});

describe("nextStop", () => {
	const hops = new Map([[A, 0], [B, 1], ["far.md", 2]]);

	it("takes the nearest note first, wherever the most overdue card is", () => {
		const stops = [stop({ key: "far", path: "far.md", due: NOW - 9 * DAY }), stop({ key: "b", path: B, due: NOW - 5 * DAY }), stop({ key: "a", path: A, due: NOW - DAY })];
		expect(nextStop(stops, new Set(), hops)?.key).toBe("a");
		expect(nextStop(stops, new Set(), new Map([[A, 2], [B, 0], ["far.md", 1]]))?.key).toBe("b");
	});

	it("breaks a tie by most overdue, then by note order", () => {
		const stops = [stop({ key: "late", due: NOW - DAY, line: 1 }), stop({ key: "early", due: NOW - 4 * DAY, line: 9 })];
		expect(nextStop(stops, new Set(), hops)?.key).toBe("early");
		const same = [stop({ key: "second", line: 7 }), stop({ key: "first", line: 3 }), stop({ key: "other", path: "zz.md", line: 0 })];
		expect(nextStop(same, new Set(), new Map([[A, 0], ["zz.md", 0]]))?.key).toBe("first");
	});

	it("leaves a note it cannot reach until last", () => {
		const stops = [stop({ key: "lost", path: "island.md", due: NOW - 9 * DAY }), stop({ key: "far", path: "far.md" })];
		expect(nextStop(stops, new Set(), hops)?.key).toBe("far");
		expect(nextStop([stops[0]!], new Set(), hops)?.key).toBe("lost");
	});

	it("passes over finished stops and the one skipped, and ends with null", () => {
		const stops = [stop({ key: "a", keys: ["a1", "a2"] }), stop({ key: "b", path: B }), stop({ key: "c", path: "far.md" })];
		expect(nextStop(stops, new Set(["a1"]), hops)?.key).toBe("a");
		expect(nextStop(stops, new Set(["a1", "a2"]), hops)?.key).toBe("b");
		expect(nextStop(stops, new Set(["a1", "a2"]), hops, "b")?.key).toBe("c");
		expect(nextStop(stops, new Set(["a1", "a2", "b", "c"]), hops)).toBeNull();
		expect(nextStop([], new Set(), hops)).toBeNull();
	});

	it("walks a route in hop order as the position moves", () => {
		// A chain A - B - far: from A the walk is A's cards, then B's, then far's.
		const stops = [stop({ key: "far", path: "far.md" }), stop({ key: "b", path: B }), stop({ key: "a" })];
		const rated = new Set<string>();
		const order: string[] = [];
		let at = A;
		const chain = (from: string): Map<string, number> => {
			const index = [A, B, "far.md"];
			return new Map(index.map((path, i) => [path, Math.abs(i - index.indexOf(from))]));
		};
		for (let next = nextStop(stops, rated, chain(at)); next !== null; next = nextStop(stops, rated, chain(at))) {
			order.push(next.key);
			rated.add(next.key);
			at = next.path;
		}
		expect(order).toEqual(["a", "b", "far"]);
	});
});

describe("stopDone and cardsToGo", () => {
	it("count the cards of a route still unrated", () => {
		const stops = [stop({ key: "a", keys: ["a1", "a2"] }), stop({ key: "b", keys: ["b1"] })];
		expect(stopDone(stops[0]!, new Set(["a1"]))).toBe(false);
		expect(stopDone(stops[0]!, new Set(["a1", "a2"]))).toBe(true);
		expect(cardsToGo(stops, new Set())).toBe(3);
		expect(cardsToGo(stops, new Set(["a1", "b1"]))).toBe(1);
	});
});

function node(id: string, blockId?: string): GraphNode {
	return blockId === undefined
		? { id, kind: "note", label: id, path: A }
		: ({ id, kind: "line", label: id, path: A, source: { id: "x", type: "bullet", depth: 0, content: id, raw: id, blockId, children: [], range: { start: 0, end: 1 }, isTranscluded: false } } as GraphNode);
}

describe("threadNodeIds", () => {
	it("resolves card keys and node IDs, with null for a stop that is not loaded", () => {
		const nodes = [node("note:a"), node("line:a#1", "os-1")];
		expect(threadNodeIds(nodes, ["note:a", `${A}#^os-1`, `${B}#^os-2`])).toEqual(["note:a", "line:a#1", null]);
	});

	it("follows a stop whose node ID changed", () => {
		expect(threadNodeIds([node("line:a#new", "os-1")], [`${A}#^os-1`])).toEqual(["line:a#new"]);
	});
});

describe("threadSegments", () => {
	const at = (id: string): string | null => (id === "gone" ? null : id);

	it("joins consecutive stops that both have a position", () => {
		expect(threadSegments(["a", "b", "c"], at)).toEqual([["a", "b"], ["b", "c"]]);
	});

	it("breaks at a stop that is not loaded or has no position, and ignores a repeat", () => {
		expect(threadSegments(["a", null, "c", "d"], at)).toEqual([["c", "d"]]);
		expect(threadSegments(["a", "gone", "c"], at)).toEqual([]);
		expect(threadSegments(["a", "a", "b"], at)).toEqual([["a", "b"]]);
		expect(threadSegments([], at)).toEqual([]);
		expect(threadSegments(["a"], at)).toEqual([]);
	});
});
