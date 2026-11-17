import { describe, it, expect } from "vitest";
import { readMapState, writeMapState } from "./mindmap-state";

/** These pin `MindMapView.getState` / `setState` as they were before the 2D/3D toggle shared them. */
describe("mind map view state", () => {
	it("saves file and pinned only with a file", () => {
		expect(writeMapState("Harbour.md", false, true)).toEqual({ readingMode: true, file: "Harbour.md", pinned: false });
		expect(writeMapState(null, true, false)).toEqual({ readingMode: false });
	});

	it("round-trips", () => {
		for (const pinned of [true, false]) {
			for (const readingMode of [true, false]) {
				expect(readMapState(writeMapState("Harbour.md", pinned, readingMode))).toEqual({ file: "Harbour.md", pinned, readingMode });
			}
		}
	});

	it("pins a named file unless the state says otherwise", () => {
		expect(readMapState({ file: "Harbour.md" }).pinned).toBe(true);
		expect(readMapState({ file: "Harbour.md", pinned: "no" }).pinned).toBe(true);
		expect(readMapState({ file: "Harbour.md", pinned: false }).pinned).toBe(false);
	});

	it("reads nothing from a state without the fields", () => {
		expect(readMapState(undefined)).toEqual({ file: null, pinned: true, readingMode: null });
		expect(readMapState({ file: 3, readingMode: "yes" })).toEqual({ file: null, pinned: true, readingMode: null });
	});
});
