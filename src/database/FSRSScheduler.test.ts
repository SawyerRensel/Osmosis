import { describe, it, expect, beforeEach } from "vitest";
import { FSRSScheduler, type FSRSRating } from "./FSRSScheduler";

let scheduler: FSRSScheduler;

beforeEach(() => {
	scheduler = new FSRSScheduler();
});

describe("FSRSScheduler", () => {
	describe("createNewSchedule", () => {
		it("creates a schedule with new state and zero stability", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule("card-1", now);
			expect(schedule.card_id).toBe("card-1");
			expect(schedule.state).toBe("new");
			expect(schedule.stability).toBe(0);
			expect(schedule.difficulty).toBe(0);
			expect(schedule.due).toBe(now);
			expect(schedule.last_review).toBeNull();
			expect(schedule.reps).toBe(0);
			expect(schedule.lapses).toBe(0);
		});
	});

	describe("review", () => {
		it("transitions new card to learning/review on Good", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule("card-1", now);
			const result = scheduler.review(schedule, 3, now); // Good

			expect(result.schedule.card_id).toBe("card-1");
			expect(result.schedule.stability).toBeGreaterThan(0);
			expect(result.schedule.difficulty).toBeGreaterThan(0);
			expect(result.schedule.reps).toBe(1);
			expect(result.schedule.lapses).toBe(0);
			expect(result.schedule.due).toBeGreaterThan(now);
			expect(result.reviewLog.rating).toBe(3);
		});

		it("intervals increase after successive Good ratings", () => {
			const now = Date.now();
			let schedule = scheduler.createNewSchedule("card-1", now);

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
			// Compare the last interval to the first — it should be larger
			expect(intervals[intervals.length - 1]!).toBeGreaterThan(intervals[0]!);
		});

		it("Again rating resets to relearning and increases lapses", () => {
			const now = Date.now();
			let schedule = scheduler.createNewSchedule("card-1", now);

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
			const schedule = scheduler.createNewSchedule("card-1", now);

			const goodResult = scheduler.review(schedule, 3, now); // Good
			const easyResult = scheduler.review(schedule, 4, now); // Easy

			const goodInterval = goodResult.schedule.due - now;
			const easyInterval = easyResult.schedule.due - now;
			expect(easyInterval).toBeGreaterThanOrEqual(goodInterval);
		});

		it("produces valid review log data", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule("card-1", now);
			const result = scheduler.review(schedule, 3, now);

			expect(result.reviewLog.rating).toBe(3);
			expect(result.reviewLog.reviewed_at).toBe(now);
			expect(typeof result.reviewLog.elapsed_days).toBe("number");
			expect(typeof result.reviewLog.scheduled_days).toBe("number");
		});
	});

	describe("performance", () => {
		it("computes a single review in under 1ms", () => {
			const now = Date.now();
			const schedule = scheduler.createNewSchedule("card-1", now);

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
				const schedule = scheduler.createNewSchedule(`card-r${rating}`, now);
				const result = scheduler.review(schedule, rating, now);

				expect(result.schedule.reps).toBe(1);
				expect(result.schedule.due).toBeGreaterThanOrEqual(now);
				expect(result.reviewLog.rating).toBe(rating);
			}
		});
	});

	describe("round-trip consistency", () => {
		it("schedule can be reviewed multiple times", () => {
			const now = Date.now();
			let schedule = scheduler.createNewSchedule("card-1", now);
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
});
