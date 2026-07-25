import { describe, it, expect, beforeEach } from "vitest";
import { FSRSScheduler, parseSteps, type FSRSRating } from "./FSRSScheduler";

let scheduler: FSRSScheduler;

beforeEach(() => {
	scheduler = new FSRSScheduler();
});

describe("FSRSScheduler", () => {
	describe("createNewSchedule", () => {
		it("creates a schedule with new state and zero stability", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule(now);
			expect(schedule.state).toBe("new");
			expect(schedule.stability).toBe(0);
			expect(schedule.difficulty).toBe(0);
			expect(schedule.due).toBe(now);
			expect(schedule.lastReview).toBeNull();
			expect(schedule.reps).toBe(0);
			expect(schedule.lapses).toBe(0);
		});
	});

	describe("review", () => {
		it("transitions new card to learning/review on Good", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule(now);
			const result = scheduler.review(schedule, 3, now); // Good

			expect(result.schedule.stability).toBeGreaterThan(0);
			expect(result.schedule.difficulty).toBeGreaterThan(0);
			expect(result.schedule.reps).toBe(1);
			expect(result.schedule.lapses).toBe(0);
			expect(result.schedule.due).toBeGreaterThan(now);
		});

		it("intervals increase after successive Good ratings", () => {
			const now = Date.now();
			let schedule = scheduler.createNewSchedule(now);

			const intervals: number[] = [];
			let currentTime = now;

			for (let i = 0; i < 5; i++) {
				const result = scheduler.review(schedule, 3, currentTime); // Good
				const interval = result.schedule.due - currentTime;
				intervals.push(interval);
				currentTime = result.schedule.due;
				schedule = result.schedule;
			}

			// After first review (learning), intervals should generally increase
			expect(intervals[intervals.length - 1]!).toBeGreaterThan(intervals[0]!);
		});

		it("Again rating resets to relearning and increases lapses", () => {
			const now = Date.now();
			let schedule = scheduler.createNewSchedule(now);

			// First review it a few times with Good to get into review state
			let currentTime = now;
			for (let i = 0; i < 3; i++) {
				const result = scheduler.review(schedule, 3, currentTime);
				currentTime = result.schedule.due;
				schedule = result.schedule;
			}

			const lapsesBeforeAgain = schedule.lapses;
			const stabilityBeforeAgain = schedule.stability;

			// Now rate Again
			const result = scheduler.review(schedule, 1, currentTime);
			expect(result.schedule.lapses).toBe(lapsesBeforeAgain + 1);
			expect(result.schedule.state).toMatch(/learning|relearning/);
			expect(result.schedule.stability).toBeLessThan(stabilityBeforeAgain);
		});

		it("Easy rating gives longer intervals than Good", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule(now);

			const goodResult = scheduler.review(schedule, 3, now); // Good
			const easyResult = scheduler.review(schedule, 4, now); // Easy

			const goodInterval = goodResult.schedule.due - now;
			const easyInterval = easyResult.schedule.due - now;
			expect(easyInterval).toBeGreaterThanOrEqual(goodInterval);
		});
	});

	describe("performance", () => {
		it("computes a single review in under 1ms", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule(now);

			// Warm up
			scheduler.review(schedule, 3, now);

			const iterations = 1000;
			const start = performance.now();
			for (let i = 0; i < iterations; i++) {
				scheduler.review(schedule, 3 as FSRSRating, now);
			}
			const elapsed = performance.now() - start;
			const perCard = elapsed / iterations;

			expect(perCard).toBeLessThan(1); // AC: <1ms per card
		});
	});

	describe("all ratings", () => {
		it("handles all four ratings on a new card", () => {
			const now = Date.now();
			const ratings: FSRSRating[] = [1, 2, 3, 4];

			for (const rating of ratings) {
				const schedule = scheduler.createNewSchedule(now);
				const result = scheduler.review(schedule, rating, now);

				expect(result.schedule.reps).toBe(1);
				expect(result.schedule.due).toBeGreaterThanOrEqual(now);
			}
		});
	});

	describe("round-trip consistency", () => {
		it("schedule can be reviewed multiple times", () => {
			const now = Date.now();
			let schedule = scheduler.createNewSchedule(now);
			let currentTime = now;

			// Simulate 10 reviews with mixed ratings
			const ratings: FSRSRating[] = [3, 3, 2, 3, 4, 3, 1, 3, 3, 4];
			for (const rating of ratings) {
				const result = scheduler.review(schedule, rating, currentTime);
				currentTime = result.schedule.due;
				schedule = result.schedule;
			}

			expect(schedule.reps).toBe(10);
			expect(schedule.stability).toBeGreaterThan(0);
			expect(schedule.difficulty).toBeGreaterThan(0);
		});
	});

	describe("learning steps", () => {
		it("new schedule has learningSteps = 0", () => {
			const schedule = scheduler.createNewSchedule();
			expect(schedule.learningSteps).toBe(0);
		});

		it("new card rated Good enters learning state at step 1", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule(now);
			const result = scheduler.review(schedule, 3, now); // Good
			expect(result.schedule.state).toBe("learning");
			expect(result.schedule.learningSteps).toBe(1);
		});

		it("new card rated Again stays in learning at step 0", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule(now);
			const result = scheduler.review(schedule, 1, now); // Again
			expect(result.schedule.state).toBe("learning");
			expect(result.schedule.learningSteps).toBe(0);
		});

		it("learning card at step 1 rated Good graduates to review", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule(now);
			// First review: Good → learning step 1
			const r1 = scheduler.review(schedule, 3, now);
			expect(r1.schedule.state).toBe("learning");
			// Second review: Good → graduates to review
			const r2 = scheduler.review(r1.schedule, 3, r1.schedule.due);
			expect(r2.schedule.state).toBe("review");
			expect(r2.schedule.learningSteps).toBe(0);
		});

		it("preserves learning_steps counter across reviews", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule(now);
			const r1 = scheduler.review(schedule, 3, now); // Good → step 1
			// Simulate passing the schedule through persistence (like what the modal does)
			const roundTripped = { ...r1.schedule };
			const r2 = scheduler.review(roundTripped, 1, r1.schedule.due); // Again → back to step 0
			expect(r2.schedule.state).toBe("learning");
			expect(r2.schedule.learningSteps).toBe(0);
		});

		it("review card rated Again enters relearning", () => {
			const now = Date.now();
			let schedule = scheduler.createNewSchedule(now);
			let t = now;
			// Graduate to review state
			for (let i = 0; i < 3; i++) {
				const r = scheduler.review(schedule, 3, t);
				t = r.schedule.due;
				schedule = r.schedule;
			}
			expect(schedule.state).toBe("review");

			// Rate Again → relearning
			const result = scheduler.review(schedule, 1, t);
			expect(result.schedule.state).toBe("relearning");
			expect(result.schedule.learningSteps).toBe(0);
		});
	});
});

describe("parseSteps", () => {
	it("parses comma-separated step string", () => {
		expect(parseSteps("1m, 10m")).toEqual(["1m", "10m"]);
	});

	it("handles single step", () => {
		expect(parseSteps("10m")).toEqual(["10m"]);
	});

	it("handles hours and days", () => {
		expect(parseSteps("1m, 1h, 1d")).toEqual(["1m", "1h", "1d"]);
	});

	it("filters out invalid steps", () => {
		expect(parseSteps("1m, invalid, 10m")).toEqual(["1m", "10m"]);
	});

	it("handles empty string", () => {
		expect(parseSteps("")).toEqual([]);
	});

	it("handles whitespace-only", () => {
		expect(parseSteps("  ,  ")).toEqual([]);
	});
});
