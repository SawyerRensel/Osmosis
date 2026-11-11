import { describe, expect, it } from "vitest";
import { HINT_FAR_DEPTH, HINT_KEEP_BONUS, HINT_MAX, HINT_NEAR_DEPTH, chooseHints, exitDistance, hintFade, hintText, hintedKind, labelShift, noteName, plainLabel } from "./edge-hints";

const probe = (id: string, depth: number, x = 0, y = 0) => ({ id, depth, x, y });

describe("hintedKind", () => {
	it("hints link and embed edges only", () => {
		expect(hintedKind("link")).toBe(true);
		expect(hintedKind("embed")).toBe(true);
		for (const kind of ["hierarchy", "tag", "property", "attachment"] as const) expect(hintedKind(kind)).toBe(false);
	});
});

describe("hintFade", () => {
	it("is 0 beyond far, 1 within near, and monotonic between", () => {
		expect(hintFade(HINT_FAR_DEPTH + 50)).toBe(0);
		expect(hintFade(HINT_FAR_DEPTH)).toBe(0);
		expect(hintFade(HINT_NEAR_DEPTH)).toBe(1);
		expect(hintFade(5)).toBe(1);
		let last = 1;
		for (let d = HINT_NEAR_DEPTH; d <= HINT_FAR_DEPTH; d += 10) {
			const f = hintFade(d);
			expect(f).toBeLessThanOrEqual(last);
			last = f;
		}
		const mid = hintFade((HINT_NEAR_DEPTH + HINT_FAR_DEPTH) / 2);
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);
	});
});

describe("chooseHints", () => {
	it("keeps the nearest 8 of many, nearest first", () => {
		const probes = Array.from({ length: 20 }, (_, i) => probe(`e${String(i).padStart(2, "0")}`, 100 + (19 - i)));
		const chosen = chooseHints(probes, new Set());
		expect(chosen).toHaveLength(HINT_MAX);
		expect(chosen[0]).toBe("e19");
		expect(chosen).toEqual(Array.from({ length: 8 }, (_, i) => `e${19 - i}`));
	});

	it("drops candidates that are beyond far or off screen", () => {
		const chosen = chooseHints([probe("far", HINT_FAR_DEPTH + 1), probe("off", 100, 1.05, 0), probe("ok", 100, 0.9, -0.9)], new Set());
		expect(chosen).toEqual(["ok"]);
	});

	it("lets a member drift further off screen than a newcomer may enter", () => {
		expect(chooseHints([probe("a", 100, 1.1, 0)], new Set(["a"]))).toEqual(["a"]);
		expect(chooseHints([probe("a", 100, 1.1, 0)], new Set())).toEqual([]);
		expect(chooseHints([probe("a", 100, 1.3, 0)], new Set(["a"]))).toEqual([]);
	});

	it("keeps a member over a slightly nearer newcomer when full (hysteresis)", () => {
		const probes = [probe("old", 100), probe("new", 100 * (1 - HINT_KEEP_BONUS / 2))];
		expect(chooseHints(probes, new Set(["old"]), 1)).toEqual(["old"]);
		expect(chooseHints(probes, new Set(), 1)).toEqual(["new"]);
		expect(chooseHints([probe("old", 100), probe("new", 60)], new Set(["old"]), 1)).toEqual(["new"]);
	});

	it("breaks ties by id so the set is stable", () => {
		expect(chooseHints([probe("b", 100), probe("a", 100)], new Set(), 1)).toEqual(["a"]);
	});
});

describe("plainLabel", () => {
	it("strips heading, list and emphasis markers and shows links as their text", () => {
		expect(plainLabel("## Reefing the **main**")).toBe("Reefing the main");
		expect(plainLabel("- [ ] See [[Anchors|the anchor]] and [[Knots]] ^abc")).toBe("See the anchor and Knots");
		expect(plainLabel("\n  [site](https://example.com) `code`")).toBe("site code");
	});
});

describe("hintText", () => {
	const here = { path: "Sailing/Basics.md" };
	it("names Note > Heading for a heading in another note", () => {
		expect(hintText(here, { kind: "line", label: "## Anchor types", path: "Sailing/Anchors.md" })).toBe("Anchors > Anchor types");
	});
	it("names just the note for another note's root or core", () => {
		expect(hintText(here, { kind: "note", label: "Anchors", path: "Sailing/Anchors.md" })).toBe("Anchors");
		expect(hintText(here, { kind: "line", label: "# Anchoring", path: "Sailing/Anchors.md", root: true })).toBe("Anchors");
	});
	it("uses the node's own text inside the same note", () => {
		expect(hintText(here, { kind: "line", label: "Check the **chain**", path: "Sailing/Basics.md" })).toBe("Check the chain");
	});
	it("uses the link text for a ghost", () => {
		expect(hintText(here, { kind: "ghost", label: "Unwritten" })).toBe("Unwritten");
	});
	it("truncates long text with an ellipsis", () => {
		const text = hintText(here, { kind: "line", label: "x".repeat(100), path: "Sailing/Basics.md" });
		expect(text).toHaveLength(40);
		expect(text.endsWith("…")).toBe(true);
	});
});

describe("noteName", () => {
	it("drops folders and the extension", () => {
		expect(noteName("a/b/Sailing Basics.md")).toBe("Sailing Basics");
		expect(noteName("Note.md")).toBe("Note");
	});
});

describe("exitDistance", () => {
	const right = { x: 1, y: 0, z: 0 };
	const up = { x: 0, y: 1, z: 0 };
	it("is the half width along the screen's x and half height along its y", () => {
		expect(exitDistance({ x: 1, y: 0, z: 0 }, { width: 8, height: 2 }, right, up)).toBeCloseTo(8);
		expect(exitDistance({ x: 0, y: -1, z: 0 }, { width: 8, height: 2 }, right, up)).toBeCloseTo(2);
	});
	it("takes the nearer side on a diagonal and is 0 along the view", () => {
		const s = Math.SQRT1_2;
		expect(exitDistance({ x: s, y: s, z: 0 }, { width: 8, height: 2 }, right, up)).toBeCloseTo(2 / s);
		expect(exitDistance({ x: 0, y: 0, z: 1 }, { width: 8, height: 2 }, right, up)).toBe(0);
	});
});

describe("labelShift", () => {
	it("puts the label's near side on the anchor", () => {
		expect(labelShift(1, 0)).toEqual({ x: 0, y: -50 });
		expect(labelShift(-1, 0)).toEqual({ x: -100, y: -50 });
		expect(labelShift(0, 1)).toEqual({ x: -50, y: -100 });
		expect(labelShift(0, 0)).toEqual({ x: -50, y: -50 });
	});
});
