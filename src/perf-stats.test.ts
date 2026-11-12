import { describe, expect, it } from "vitest";
import { LoafStats, Rolling, loafLine, loafPhases, untimedMs } from "./perf-stats";

describe("Rolling", () => {
	it("averages and maxes the samples in the window", () => {
		const r = new Rolling();
		r.push(0, 10);
		r.push(500, 20);
		r.push(1000, 30);
		expect(r.avg()).toBe(20);
		expect(r.max()).toBe(30);
		r.prune(1200, 1000);
		expect(r.count).toBe(2);
		expect(r.avg()).toBe(25);
	});

	it("is zero when empty", () => {
		const r = new Rolling();
		expect(r.avg()).toBe(0);
		expect(r.max()).toBe(0);
	});
});

describe("loafPhases", () => {
	it("splits a rendered frame into script, rAF and style+layout", () => {
		expect(loafPhases({ startTime: 100, duration: 60, renderStart: 120, styleAndLayoutStart: 140 })).toEqual({ scriptMs: 20, renderMs: 20, styleLayoutMs: 20 });
	});

	it("counts a frame that never rendered as script", () => {
		expect(loafPhases({ startTime: 100, duration: 70, renderStart: 0, styleAndLayoutStart: 0 })).toEqual({ scriptMs: 70, renderMs: 0, styleLayoutMs: 0 });
	});
});

describe("untimedMs", () => {
	it("is the frame less the timed parts, never negative", () => {
		expect(untimedMs(28, [1.5, 0.8])).toBeCloseTo(25.7);
		expect(untimedMs(2, [1.5, 0.8])).toBe(0);
	});
});

describe("LoafStats and loafLine", () => {
	it("averages long frames in the window", () => {
		const s = new LoafStats();
		s.push({ startTime: 0, duration: 60, renderStart: 10, styleAndLayoutStart: 30 });
		s.push({ startTime: 900, duration: 80, renderStart: 930, styleAndLayoutStart: 950 });
		s.prune(1500, 1000);
		expect(s.summary()).toEqual({ count: 1, durationMs: 80, scriptMs: 30, renderMs: 20, styleLayoutMs: 30 });
	});

	it("falls back to the untimed remainder", () => {
		const empty = new LoafStats().summary();
		expect(loafLine(false, empty, 25.71)).toBe("browser: LoAF unsupported · untimed 25.7 ms/frame");
		expect(loafLine(true, empty, 3)).toContain("no frame over 50 ms");
	});
});
