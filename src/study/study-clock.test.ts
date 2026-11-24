import { describe, it, expect } from "vitest";
import { MAX_CARD_MS, StudyClock, capElapsed } from "./study-clock";

describe("capElapsed", () => {
	it("passes a short time through", () => {
		expect(capElapsed(15_000)).toBe(15_000);
	});

	it("caps a card left open at 60 s", () => {
		expect(capElapsed(120_000)).toBe(MAX_CARD_MS);
		expect(MAX_CARD_MS).toBe(60_000);
	});

	it("clamps negatives and non-finite values to 0", () => {
		expect(capElapsed(-5)).toBe(0);
		expect(capElapsed(Number.NaN)).toBe(0);
	});
});

describe("StudyClock", () => {
	it("times the first card from the session start", () => {
		const clock = new StudyClock();
		clock.start(1_000);
		expect(clock.lap(16_000)).toBe(15_000);
	});

	it("times each later card from the previous rating, not its reveal", () => {
		const clock = new StudyClock();
		clock.start(0);
		clock.lap(10_000);
		expect(clock.lap(35_000)).toBe(25_000);
	});

	it("caps a card left open for two minutes", () => {
		const clock = new StudyClock();
		clock.start(0);
		expect(clock.lap(120_000)).toBe(60_000);
		// The next card starts from that rating, not from 60 s in.
		expect(clock.lap(123_000)).toBe(3_000);
	});

	it("times a card from the undo that put it back", () => {
		const clock = new StudyClock();
		clock.start(0);
		clock.lap(5_000);
		clock.start(50_000);
		expect(clock.lap(58_000)).toBe(8_000);
	});

	it("reports null outside a session", () => {
		const clock = new StudyClock();
		expect(clock.lap(1_000)).toBeNull();
		clock.start(0);
		clock.stop();
		expect(clock.lap(1_000)).toBeNull();
	});
});
