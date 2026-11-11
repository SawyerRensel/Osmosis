import { describe, it, expect } from "vitest";
import {
	DETAIL_LIMIT,
	NEAR_BUDGET,
	NEAR_BUDGET_RANGE,
	NEAR_ENTER_SCALE,
	NEAR_EXIT_RATIO,
	NEAR_EXIT_SCALE,
	NEAR_EXIT_SCREEN,
	NEAR_EXIT_VISIBILITY,
	NEAR_ENTER_VISIBILITY,
	NEAR_KEEP_BONUS,
	chooseNear,
	cleanNearTier,
	defaultNearTier,
	detailFromSlider,
	enterScaleFromDetail,
	NEAR_ENTER_SCREEN,
	nearScreenDistance,
	panelHalfNdc,
	panelScale,
	sliderFromDetail,
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

describe("chooseNear with a panel size threshold", () => {
	const enter = 1.2;
	const exit = enter * NEAR_EXIT_RATIO;

	it("enters at the given threshold, not the default", () => {
		// Scale 0.8 passes the default threshold (0.6) but not 1.2.
		const p = probe("a", 100 / 0.8);
		expect(chooseNear([p], none, 24).has("a")).toBe(true);
		expect(chooseNear([p], none, 24, enter).has("a")).toBe(false);
		expect(chooseNear([probe("a", 100 / enter - 1)], none, 24, enter).has("a")).toBe(true);
	});

	it("keeps the exit-to-enter ratio, so the hysteresis band scales with it", () => {
		expect(exit).toBeCloseTo(0.9);
		const between = 100 / ((enter + exit) / 2);
		expect(chooseNear([probe("a", between)], none, 24, enter).has("a")).toBe(false);
		expect(chooseNear([probe("a", between)], new Set(["a"]), 24, enter).has("a")).toBe(true);
		expect(chooseNear([probe("a", 100 / exit + 1)], new Set(["a"]), 24, enter).has("a")).toBe(false);
	});

	it("at a lower threshold, takes in farther nodes and holds them farther out", () => {
		const low = 0.3;
		expect(chooseNear([probe("a", 100 / low - 1)], none, 24, low).has("a")).toBe(true);
		expect(chooseNear([probe("a", 100 / (low * NEAR_EXIT_RATIO) + 1)], new Set(["a"]), 24, low).has("a")).toBe(false);
		expect(chooseNear([probe("a", 100 / (low * NEAR_EXIT_RATIO) - 1)], new Set(["a"]), 24, low).has("a")).toBe(true);
	});

	it("does not flicker at the boundary as the scale wobbles around it", () => {
		let current = new Set<string>();
		let changes = 0;
		for (let i = 0; i < 100; i++) {
			// Scale wobbles ±5% around the enter threshold.
			const scale = enter * (1 + 0.05 * Math.sin(i));
			const next = chooseNear([probe("a", 100, { scale })], current, 24, enter);
			if (next.has("a") !== current.has("a")) changes++;
			current = next;
		}
		expect(changes).toBe(1);
	});
});

describe("near tier settings", () => {
	it("defaults to today's budget and threshold", () => {
		expect(defaultNearTier(false)).toEqual({ detail: 1, budget: NEAR_BUDGET.desktop });
		expect(defaultNearTier(true)).toEqual({ detail: 1, budget: NEAR_BUDGET.mobile });
		expect(enterScaleFromDetail(1)).toBe(NEAR_ENTER_SCALE);
	});

	it("maps more detail to a lower enter scale, with the slider in log steps", () => {
		expect(enterScaleFromDetail(2)).toBeCloseTo(0.3);
		expect(DETAIL_LIMIT).toBe(4);
		expect(enterScaleFromDetail(DETAIL_LIMIT)).toBeCloseTo(0.15);
		expect(enterScaleFromDetail(1 / DETAIL_LIMIT)).toBeCloseTo(2.4);
		expect(sliderFromDetail(DETAIL_LIMIT)).toBeCloseTo(2);
		expect(sliderFromDetail(detailFromSlider(0.75))).toBeCloseTo(0.75);
	});

	it("allows up to 128 live panels on desktop and mobile, with the defaults inside the range", () => {
		expect(NEAR_BUDGET_RANGE.desktop.max).toBe(128);
		expect(NEAR_BUDGET_RANGE.mobile.max).toBe(128);
		expect(NEAR_BUDGET.desktop).toBeLessThanOrEqual(NEAR_BUDGET_RANGE.desktop.max);
		expect(cleanNearTier({ budget: 128 }, true).budget).toBe(128);
	});

	it("chooses up to a budget of 128 from more candidates", () => {
		const probes = Array.from({ length: 200 }, (_, i) => ({ id: `n${String(i)}`, depth: 10 + i, scale: 1, x: 0, y: 0, visibility: 1 }));
		expect(chooseNear(probes, new Set(), 128).size).toBe(128);
	});

	it("cleans stored values: bad ones fall back, numbers clamp to the device's range", () => {
		expect(cleanNearTier(undefined, false)).toEqual(defaultNearTier(false));
		expect(cleanNearTier({ detail: "x", budget: NaN }, true)).toEqual(defaultNearTier(true));
		expect(cleanNearTier({ detail: 100, budget: 1000 }, false)).toEqual({ detail: DETAIL_LIMIT, budget: NEAR_BUDGET_RANGE.desktop.max });
		expect(cleanNearTier({ detail: 0.01, budget: 1000 }, true)).toEqual({ detail: 1 / DETAIL_LIMIT, budget: NEAR_BUDGET_RANGE.mobile.max });
		expect(cleanNearTier({ detail: 1, budget: 0 }, false).budget).toBe(NEAR_BUDGET_RANGE.desktop.min);
		expect(cleanNearTier({ detail: 1, budget: 7.6 }, false).budget).toBe(8);
	});
});

describe("panelHalfNdc", () => {
	it("is the panel's drawn half-size over the viewport's half-size", () => {
		// 320 x 480 px laid out, drawn at 2x, in a 1280 x 960 viewport: 640 x 960 px drawn, 320 and 480 px a side from the centre.
		expect(panelHalfNdc(320, 480, 2, { width: 1280, height: 960 })).toEqual({ x: 0.5, y: 1 });
	});
});

describe("chooseNear with a panel's extent", () => {
	/** A tall panel: its centre is below the screen, its body reaches back up into it. */
	const tall = (extra: Partial<NearProbe> = {}) => probe("a", 50, { y: -1.6, halfY: 0.8, ...extra });

	it("keeps a tall panel whose centre left the screen while its body is still in view", () => {
		expect(nearScreenDistance(tall())).toBeCloseTo(0.8);
		expect(chooseNear([tall()], new Set(["a"]), 24).has("a")).toBe(true);
	});

	it("lets a tall panel enter by its body too", () => {
		expect(chooseNear([tall()], none, 24).has("a")).toBe(true);
	});

	it("drops the same panel once it is short, so its box is off screen", () => {
		expect(chooseNear([tall({ halfY: 0.2 })], new Set(["a"]), 24).has("a")).toBe(false);
		expect(chooseNear([tall({ halfY: 0.2 })], none, 24).has("a")).toBe(false);
	});

	it("holds the hysteresis band on the box's edge: a member leaves past the exit margin, not the enter one", () => {
		const between = { y: -(NEAR_ENTER_SCREEN + NEAR_EXIT_SCREEN) / 2 - 0.5, halfY: 0.5 };
		expect(chooseNear([probe("a", 50, between)], none, 24).has("a")).toBe(false);
		expect(chooseNear([probe("a", 50, between)], new Set(["a"]), 24).has("a")).toBe(true);
		expect(chooseNear([probe("a", 50, { y: -NEAR_EXIT_SCREEN - 0.51, halfY: 0.5 })], new Set(["a"]), 24).has("a")).toBe(false);
	});

	it("counts the width too", () => {
		expect(chooseNear([probe("a", 50, { x: 1.5, halfX: 0.6 })], none, 24).has("a")).toBe(true);
		expect(chooseNear([probe("a", 50, { x: 1.5, halfX: 0.1 })], none, 24).has("a")).toBe(false);
	});

	it("changes nothing for a centre on screen, whatever the extent", () => {
		expect(nearScreenDistance(probe("a", 50, { x: 0.9, y: -0.9, halfX: 0.3, halfY: 0.3 }))).toBeLessThanOrEqual(NEAR_ENTER_SCREEN);
		expect(chooseNear([probe("a", 50, { x: 0.9, halfX: 0.3 })], none, 24).has("a")).toBe(true);
	});

	it("still needs the centre in front of the camera, and the scale and mist rules", () => {
		expect(chooseNear([tall({ depth: -5, scale: 10 })], new Set(["a"]), 24).size).toBe(0);
		expect(chooseNear([tall({ scale: 0.01 })], new Set(["a"]), 24).size).toBe(0);
		expect(chooseNear([tall({ visibility: 0 })], new Set(["a"]), 24).size).toBe(0);
	});
});
