import { describe, expect, it } from "vitest";
import { HINT_FAR_DEPTH, HINT_KEEP_BONUS, HINT_MAX, HINT_NEAR_DEPTH, chooseHints, HINT_FULL_PX, HINT_MAX_PUSHES, HINT_MIN_PX, HINT_STACK_GAP_PX, exitDistance, hintBox, hintFade, hintSizeFade, hintText, hintedKind, noteName, plainLabel, readableAngle, stackHints, type HintSpan } from "./edge-hints";

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

describe("readableAngle", () => {
	it("runs along a rightward edge as is", () => {
		expect(readableAngle(1, 0)).toEqual({ angle: 0, flipped: false });
		expect(readableAngle(1, 1).angle).toBeCloseTo(Math.PI / 4);
		expect(readableAngle(1, -1)).toMatchObject({ flipped: false });
		expect(readableAngle(1, -1).angle).toBeCloseTo(-Math.PI / 4);
	});
	it("flips a leftward edge so the text is never upside down", () => {
		expect(readableAngle(-1, 0).angle).toBeCloseTo(0);
		expect(readableAngle(-1, 0).flipped).toBe(true);
		expect(readableAngle(-1, 1).angle).toBeCloseTo(-Math.PI / 4);
		expect(readableAngle(-1, -1).angle).toBeCloseTo(Math.PI / 4);
		expect(readableAngle(-1, -1).flipped).toBe(true);
	});
	it("stays within ±90° for every direction, and reads a vertical edge bottom to top", () => {
		for (let i = 0; i < 64; i++) {
			const a = (i / 64) * 2 * Math.PI;
			const { angle } = readableAngle(Math.cos(a), Math.sin(a));
			expect(angle).toBeGreaterThan(-Math.PI / 2 - 1e-9);
			expect(angle).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
		}
		expect(readableAngle(0, 1)).toEqual({ angle: Math.PI / 2, flipped: false });
		expect(readableAngle(0, -1).angle).toBeCloseTo(Math.PI / 2);
		expect(readableAngle(0, -1).flipped).toBe(true);
		expect(readableAngle(0, 0)).toEqual({ angle: 0, flipped: false });
	});
});

describe("hintSizeFade", () => {
	it("hides a hint too small to read and fades it in, not pops", () => {
		expect(hintSizeFade(2)).toBe(0);
		expect(hintSizeFade(HINT_MIN_PX)).toBe(0);
		expect(hintSizeFade((HINT_MIN_PX + HINT_FULL_PX) / 2)).toBeCloseTo(0.5);
		expect(hintSizeFade(HINT_FULL_PX)).toBe(1);
		expect(hintSizeFade(40)).toBe(1);
		expect(hintSizeFade(Number.NaN)).toBe(0);
	});
});

describe("hintBox", () => {
	it("grows with the text and has a fixed height", () => {
		expect(hintBox("Mooring lines").length).toBeGreaterThan(hintBox("Knots").length);
		expect(hintBox("Mooring lines").height).toBe(hintBox("Knots").height);
	});
});

describe("stackHints", () => {
	const span = (id: string, degrees: number, group = "n", start = 20): HintSpan => ({ id, group, angle: (degrees * Math.PI) / 180, start, length: 60, height: 10 });
	it("leaves hints on well-separated edges where they are", () => {
		const out = stackHints([span("a", 0), span("b", 90), span("c", 180), span("d", -45)]);
		expect([...out.entries()]).toEqual([["a", 0], ["b", 0], ["c", 0], ["d", 0]]);
	});
	it("pushes a hint on a nearly parallel edge out past the earlier one", () => {
		const out = stackHints([span("a", 0), span("b", 5)]);
		expect(out.get("a")).toBe(0);
		expect(out.get("b")).toBe(60 + HINT_STACK_GAP_PX);
	});
	it("drops a hint still in the way after the most pushes allowed", () => {
		const spans = Array.from({ length: HINT_MAX_PUSHES + 2 }, (_, i) => span(`h${i}`, i));
		const out = stackHints(spans);
		expect(out.size).toBe(HINT_MAX_PUSHES + 1);
		expect(out.has(`h${HINT_MAX_PUSHES + 1}`)).toBe(false);
	});
	it("only stacks hints at the same node", () => {
		const out = stackHints([span("a", 0, "n1"), span("b", 0, "n2")]);
		expect(out.get("b")).toBe(0);
	});
	it("treats angles across ±180° as close", () => {
		const out = stackHints([span("a", 179), span("b", -179)]);
		expect(out.get("b")).toBeGreaterThan(0);
	});
	it("keeps an earlier hint in place when a newcomer arrives after it", () => {
		const before = stackHints([span("a", 0), span("b", 4)]);
		const after = stackHints([span("a", 0), span("b", 4), span("c", 2)]);
		expect(after.get("a")).toBe(before.get("a"));
		expect(after.get("b")).toBe(before.get("b"));
		expect(after.get("c")).toBeGreaterThan(0);
	});
});
