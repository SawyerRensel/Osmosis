import { describe, it, expect } from "vitest";
import { stepBackQueue } from "./undo-queue";

/** Cards are plain objects so identity (not value) decides removal. */
const mk = (name: string) => ({ name });
const names = (q: { name: string }[]) => q.map((c) => c.name);

describe("stepBackQueue", () => {
	it("rate then undo shows the rated card once (queue unchanged)", () => {
		const [a, b, c] = [mk("a"), mk("b"), mk("c")];
		// a was rated: currentIndex advanced 0 -> 1, a stays at queue[0].
		const out = stepBackQueue({ queue: [a, b, c], currentIndex: 1 });
		expect(out.currentIndex).toBe(0);
		expect(names(out.queue)).toEqual(["a", "b", "c"]);
		// Re-rating a moves on to b, not a again.
		expect(out.queue[out.currentIndex + 1]).toBe(b);
	});

	it("exclude then undo shows the excluded card once", () => {
		const [a, b] = [mk("a"), mk("b")];
		const out = stepBackQueue({ queue: [a, b], currentIndex: 1 });
		expect(out.currentIndex).toBe(0);
		expect(out.queue).toHaveLength(2);
	});

	it("undo then redo leaves the remaining count unchanged", () => {
		const q = [mk("a"), mk("b"), mk("c")];
		const before = q.length - 1;
		const out = stepBackQueue({ queue: q, currentIndex: 1 });
		const after = out.queue.length - (out.currentIndex + 1);
		expect(after).toBe(before);
	});

	it("learning card whose timer has not fired: nothing to remove", () => {
		const [a, b] = [mk("a"), mk("b")];
		const deferred = mk("a-learning");
		const out = stepBackQueue({ queue: [a, b], currentIndex: 1 }, deferred);
		expect(names(out.queue)).toEqual(["a", "b"]);
		expect(out.currentIndex).toBe(0);
	});

	it("learning card whose timer already fired: the deferred copy is removed", () => {
		const [a, b] = [mk("a"), mk("b")];
		const deferred = mk("a-learning");
		// Timer fired while b was on screen: copy inserted after it.
		const out = stepBackQueue({ queue: [a, b, deferred], currentIndex: 1 }, deferred);
		expect(names(out.queue)).toEqual(["a", "b"]);
		expect(out.currentIndex).toBe(0);
	});

	it("fired while waiting (copy at the old currentIndex) is removed too", () => {
		const a = mk("a");
		const deferred = mk("a-learning");
		const out = stepBackQueue({ queue: [a, deferred], currentIndex: 1 }, deferred);
		expect(names(out.queue)).toEqual(["a"]);
		expect(out.currentIndex).toBe(0);
	});

	it("does not mutate its input", () => {
		const q = [mk("a"), mk("b")];
		stepBackQueue({ queue: q, currentIndex: 1 });
		expect(q).toHaveLength(2);
	});
});
