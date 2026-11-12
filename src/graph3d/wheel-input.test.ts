import { describe, expect, it } from "vitest";
import { wheelLogZoom } from "./depth";
import { GESTURE_GAP_MS, WheelClassifier, commonStep, wheelAction, type WheelSample, type WheelSource } from "./wheel-input";

/** Feed `deltas` ([deltaX, deltaY]) to a fresh classifier, `every` ms apart from `start`, and return each answer. */
function run(deltas: [number, number][], every = 8, start = 1000, deltaMode = 0, classifier = new WheelClassifier()): WheelSource[] {
	return deltas.map(([deltaX, deltaY], i) => classifier.classify({ deltaX, deltaY, deltaMode, t: start + i * every }));
}

const vertical = (values: number[]): [number, number][] => values.map((v) => [0, v]);

describe("commonStep", () => {
	it("is the notch for whole multiples of one", () => {
		expect(commonStep(300, 100)).toBe(100);
		expect(commonStep(120, 360)).toBe(120);
		expect(commonStep(53.333333, 106.666667)).toBeCloseTo(53.333333, 5);
	});

	it("finds a finer step when neither delta is a multiple of the other (macOS wheel acceleration)", () => {
		expect(commonStep(12.000732421875, 8.00048828125)).toBeCloseTo(4.000244140625, 6);
	});

	it("allows rounding at odd display scales", () => {
		expect(commonStep(67, 133)).toBe(67);
	});

	it("falls below a wheel step for touchpad deltas", () => {
		expect(commonStep(5.3, 8.1)).toBeLessThan(2);
	});
});

describe("WheelClassifier", () => {
	it("keeps a notched wheel a wheel, slow or spun fast, coalesced or not", () => {
		expect(run(vertical([100, 100, 300, -100, 200]), 16)).toEqual(Array(5).fill("wheel"));
		expect(run(vertical([-120, -120, -240, -120]), 120)).toEqual(Array(4).fill("wheel"));
		expect(run(vertical([53.333333, 53.333333, 106.666667, 160]), 30)).toEqual(Array(4).fill("wheel"));
	});

	it("keeps a wheel a wheel at a display scale that rounds its deltas", () => {
		expect(run(vertical([67, 133, 67, 200, 67]))).toEqual(Array(5).fill("wheel"));
	});

	it("keeps a macOS mouse wheel (multiples of 4.000244 px, accelerated) a wheel", () => {
		const step = 4.000244140625;
		expect(run(vertical([3, 2, 1, 5, 9].map((k) => k * step)))).toEqual(Array(5).fill("wheel"));
	});

	it("keeps a smooth high-resolution wheel (small even steps at a high rate) a wheel", () => {
		expect(run(vertical([12.5, 12.5, 25, 12.5, 37.5, 12.5, 12.5]), 4)).toEqual(Array(7).fill("wheel"));
	});

	it("keeps Shift + wheel (sent sideways) a wheel", () => {
		expect(run([[100, 0], [100, 0], [200, 0]])).toEqual(["wheel", "wheel", "wheel"]);
	});

	it("keeps line and page deltas a wheel, even with both axes", () => {
		expect(run([[0, 3], [1, 3], [0, 0.5]], 8, 1000, 1)).toEqual(["wheel", "wheel", "wheel"]);
	});

	it("calls a diagonal swipe a touchpad on its first event", () => {
		expect(run([[-2.5, 4.2], [-3.1, 6.8]])).toEqual(["touchpad", "touchpad"]);
	});

	it("calls a swipe whose axes arrive in separate events (Windows) a touchpad", () => {
		expect(run([[0, 10], [5, 0], [0, 15]])).toEqual(["wheel", "touchpad", "touchpad"]);
	});

	it("calls an axis-locked vertical swipe a touchpad within a few events", () => {
		const answers = run(vertical([5.3, 8.1, 11.9, 15.2, 18.7, 21.4]));
		expect(answers.indexOf("touchpad")).toBeGreaterThan(-1);
		expect(answers.indexOf("touchpad")).toBeLessThanOrEqual(2);
		// Sticky: nothing after the first touchpad answer goes back to the wheel.
		expect(answers.slice(answers.indexOf("touchpad")).every((a) => a === "touchpad")).toBe(true);
	});

	it("calls a sub-2 px delta a touchpad at once", () => {
		expect(run(vertical([1.5]))).toEqual(["touchpad"]);
	});

	it("stays a touchpad for the rest of the gesture, even for notch-sized deltas", () => {
		expect(run(vertical([1.2, 3.7, 100, 120, 100]))).toEqual(Array(5).fill("touchpad"));
	});

	it("stays a touchpad through pauses shorter than the gesture gap (momentum, slow fingers)", () => {
		const classifier = new WheelClassifier();
		const events: WheelSample[] = [
			{ deltaX: 0, deltaY: 1.2, deltaMode: 0, t: 0 },
			{ deltaX: 0, deltaY: 100, deltaMode: 0, t: GESTURE_GAP_MS - 10 },
			{ deltaX: 0, deltaY: 100, deltaMode: 0, t: 2 * GESTURE_GAP_MS - 20 },
		];
		expect(events.map((e) => classifier.classify(e))).toEqual(["touchpad", "touchpad", "touchpad"]);
	});

	it("starts over after a pause: a wheel notch after a swipe zooms", () => {
		const classifier = new WheelClassifier();
		expect(run([[-2.5, 4.2]], 8, 0, 0, classifier)).toEqual(["touchpad"]);
		expect(run(vertical([100, 100]), 16, GESTURE_GAP_MS + 1, 0, classifier)).toEqual(["wheel", "wheel"]);
	});

	it("starts over after a pause: a swipe after a wheel turns", () => {
		const classifier = new WheelClassifier();
		run(vertical([100, 100]), 16, 0, 0, classifier);
		expect(run([[-2.5, 4.2]], 8, 1000, 0, classifier)).toEqual(["touchpad"]);
	});

	it("ignores events that move nothing", () => {
		expect(run([[0, 0], [0, 100], [0, 0], [0, 200]])).toEqual(Array(4).fill("wheel"));
	});
});

describe("wheelAction", () => {
	const event = (deltaX: number, deltaY: number, mods: { ctrlKey?: boolean; shiftKey?: boolean; deltaMode?: number } = {}) => ({
		deltaX,
		deltaY,
		deltaMode: mods.deltaMode ?? 0,
		ctrlKey: mods.ctrlKey ?? false,
		shiftKey: mods.shiftKey ?? false,
	});

	it("zooms for a mouse wheel, as before", () => {
		expect(wheelAction(event(0, -100), "wheel", false)).toEqual({ kind: "zoom", logZoom: wheelLogZoom({ deltaY: -100, deltaMode: 0, ctrlKey: false }) });
	});

	it("keeps a pinch (ctrl-wheel with Control up) at its sped-up rate, from either source", () => {
		const pinch = wheelLogZoom({ deltaY: -4.8, deltaMode: 0, ctrlKey: true });
		expect(wheelAction(event(0, -4.8, { ctrlKey: true }), "wheel", false)).toEqual({ kind: "zoom", logZoom: pinch });
		expect(wheelAction(event(0, -4.8, { ctrlKey: true }), "touchpad", false)).toEqual({ kind: "zoom", logZoom: pinch });
	});

	it("zooms Ctrl + mouse wheel at the plain wheel's rate (no ×10)", () => {
		const action = wheelAction(event(0, -100, { ctrlKey: true }), "wheel", true);
		expect(action).toEqual({ kind: "zoom", logZoom: wheelLogZoom({ deltaY: -100, deltaMode: 0, ctrlKey: false }) });
	});

	it("zooms Ctrl + swipe at the wheel's rate, in as the fingers move up", () => {
		// Fingers up scrolls the page down: a positive deltaY.
		const up = wheelAction(event(0, 100, { ctrlKey: true }), "touchpad", true);
		expect(up).toEqual({ kind: "zoom", logZoom: wheelLogZoom({ deltaY: -100, deltaMode: 0, ctrlKey: false }) });
		expect(up.kind === "zoom" && up.logZoom > 0).toBe(true);
		const down = wheelAction(event(0, -100, { ctrlKey: true }), "touchpad", true);
		expect(down.kind === "zoom" && down.logZoom < 0).toBe(true);
	});

	it("turns the view for a swipe, moving with the fingers", () => {
		expect(wheelAction(event(3, -4), "touchpad", false)).toEqual({ kind: "rotate", dx: -3, dy: 4 });
	});

	it("pans for Shift + swipe", () => {
		expect(wheelAction(event(3, -4, { shiftKey: true }), "touchpad", false)).toEqual({ kind: "pan", dx: -3, dy: 4 });
	});

	it("prefers Ctrl's zoom over Shift's pan", () => {
		expect(wheelAction(event(0, 10, { ctrlKey: true, shiftKey: true }), "touchpad", true).kind).toBe("zoom");
	});
});
