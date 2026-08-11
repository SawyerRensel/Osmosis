import { describe, it, expect } from "vitest";
import { History, HISTORY_LIMIT } from "./occlusion-history";

/**
 * The editor's undo stack.
 *
 * Snapshots rather than command objects, so what these pin is the stack
 * discipline: that a redo branch is abandoned the moment you edit after undoing,
 * that the initial state is a floor you cannot undo past, and that the stack
 * stops growing rather than holding a session's worth of shape arrays.
 */
describe("History", () => {
	it("starts on its initial state, with nothing to undo or redo", () => {
		const history = new History("a");

		expect(history.current).toBe("a");
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
		expect(history.undo()).toBeNull();
		expect(history.redo()).toBeNull();
	});

	it("steps back and forward through pushed states", () => {
		const history = new History("a");
		history.push("b");
		history.push("c");

		expect(history.undo()).toBe("b");
		expect(history.undo()).toBe("a");
		expect(history.canUndo).toBe(false);
		expect(history.redo()).toBe("b");
		expect(history.redo()).toBe("c");
		expect(history.canRedo).toBe(false);
	});

	it("abandons the redo branch when a new state is pushed after an undo", () => {
		// The standard contract, and the only one that keeps history a single
		// line: editing after undoing means the future being undone is gone.
		const history = new History("a");
		history.push("b");
		history.undo();
		history.push("c");

		expect(history.canRedo).toBe(false);
		expect(history.current).toBe("c");
		expect(history.undo()).toBe("a");
	});

	it("never undoes past the state it opened on", () => {
		const history = new History("a");
		history.push("b");
		history.undo();

		expect(history.undo()).toBeNull();
		expect(history.current).toBe("a");
	});

	it("drops the oldest snapshot rather than growing without bound", () => {
		const history = new History(0);
		for (let i = 1; i <= HISTORY_LIMIT + 10; i++) history.push(i);

		expect(history.current).toBe(HISTORY_LIMIT + 10);
		let steps = 0;
		while (history.canUndo) {
			history.undo();
			steps++;
		}
		expect(steps).toBe(HISTORY_LIMIT - 1);
	});
});
