import { describe, it, expect } from "vitest";
import {
	NEAR_ENTER_SCALE,
	NEAR_EXIT_SCALE,
	NEAR_EXIT_SCREEN,
	NEAR_EXIT_VISIBILITY,
	NEAR_ENTER_VISIBILITY,
	NEAR_KEEP_BONUS,
	chooseNear,
	panelScale,
	type NearProbe,
} from "./lod";

/** A probe on screen, fully visible, with its scale following its depth (scale 1 at depth 100). */
function probe(id: string, depth: number, extra: Partial<NearProbe> = {}): NearProbe {
	return { id, depth, scale: panelScale(depth, 100, 1), x: 0, y: 0, visibility: 1, ...extra };
}

const none = new Set<string>();

describe("panelScale", () => {
	it("halves as the depth doubles", () => {
		expect(panelScale(100, 500, 5)).toBeCloseTo(1);
		expect(panelScale(200, 500, 5)).toBeCloseTo(0.5);
	});

	it("is 0 at or behind the camera", () => {
		expect(panelScale(0, 500, 5)).toBe(0);
		expect(panelScale(-10, 500, 5)).toBe(0);
	});
});

describe("chooseNear", () => {
	it("takes in a node once it is large enough on screen", () => {
		expect(chooseNear([probe("a", 100 / NEAR_ENTER_SCALE - 1)], none, 24)).toEqual(new Set(["a"]));
		expect(chooseNear([probe("a", 100 / NEAR_ENTER_SCALE + 1)], none, 24)).toEqual(new Set());
	});

	it("keeps a member between the exit and entry scales, so a node at the boundary doesn't flicker", () => {
		const between = 100 / ((NEAR_ENTER_SCALE + NEAR_EXIT_SCALE) / 2);
		expect(chooseNear([probe("a", between)], none, 24).has("a")).toBe(false);
		expect(chooseNear([probe("a", between)], new Set(["a"]), 24).has("a")).toBe(true);
		expect(chooseNear([probe("a", 100 / NEAR_EXIT_SCALE + 1)], new Set(["a"]), 24).has("a")).toBe(false);
	});

	it("needs the centre on screen to enter, and lets a member drift past the edge before it leaves", () => {
		const offEdge = { x: (1 + NEAR_EXIT_SCREEN) / 2 };
		expect(chooseNear([probe("a", 50, offEdge)], none, 24).has("a")).toBe(false);
		expect(chooseNear([probe("a", 50, offEdge)], new Set(["a"]), 24).has("a")).toBe(true);
		expect(chooseNear([probe("a", 50, { y: -NEAR_EXIT_SCREEN - 0.1 })], new Set(["a"]), 24).has("a")).toBe(false);
	});

	it("has hysteresis in the mist too", () => {
		const misty = { visibility: (NEAR_ENTER_VISIBILITY + NEAR_EXIT_VISIBILITY) / 2 };
		expect(chooseNear([probe("a", 50, misty)], none, 24).has("a")).toBe(false);
		expect(chooseNear([probe("a", 50, misty)], new Set(["a"]), 24).has("a")).toBe(true);
		expect(chooseNear([probe("a", 50, { visibility: NEAR_EXIT_VISIBILITY / 2 })], new Set(["a"]), 24).has("a")).toBe(false);
	});

	it("never takes a node behind the camera", () => {
		expect(chooseNear([probe("a", -5, { scale: 10 })], new Set(["a"]), 24).size).toBe(0);
	});

	it("holds the budget, nearest first", () => {
		const probes = Array.from({ length: 100 }, (_, i) => probe(`n${String(i).padStart(3, "0")}`, 20 + i));
		const near = chooseNear(probes, none, 24);
		expect(near.size).toBe(24);
		for (let i = 0; i < 24; i++) expect(near.has(`n${String(i).padStart(3, "0")}`)).toBe(true);
		expect(chooseNear(probes, none, 12).size).toBe(12);
	});

	it("keeps a member against a newcomer that is only slightly nearer", () => {
		const member = probe("member", 100);
		const slightlyNearer = probe("newcomer", 100 * (1 - NEAR_KEEP_BONUS / 2));
		expect(chooseNear([member, slightlyNearer], new Set(["member"]), 1)).toEqual(new Set(["member"]));
		const muchNearer = probe("newcomer", 100 * (1 - NEAR_KEEP_BONUS * 2));
		expect(chooseNear([member, muchNearer], new Set(["member"]), 1)).toEqual(new Set(["newcomer"]));
	});

	it("is stable while flying through a dense area: membership changes only at the margins", () => {
		// A row of nodes 10 units apart; the camera moves 1 unit a frame along it.
		const ids = Array.from({ length: 200 }, (_, i) => i);
		let current = new Set<string>();
		let changes = 0;
		for (let camera = 0; camera < 1000; camera++) {
			const probes = ids.map((i) => probe(`n${i}`, i * 10 - camera + 5));
			const next = chooseNear(probes, current, 24);
			expect(next.size).toBeLessThanOrEqual(24);
			for (const id of next) if (!current.has(id)) changes++;
			current = next;
		}
		// Each node enters once as the camera passes it: no flicker in and out.
		expect(changes).toBeLessThanOrEqual(ids.length);
	});
});
