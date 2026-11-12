import { describe, expect, it } from "vitest";
import { CONTROL_GROUPS, type ControlGroupId } from "./controls-help";

const EXPECTED: ControlGroupId[] = ["mouse", "touchpad", "gizmos", "keys", "edit-keys", "editing", "touch", "settings"];

describe("CONTROL_GROUPS", () => {
	it("has a group for each kind of control, in order", () => {
		expect(CONTROL_GROUPS.map((g) => g.id)).toEqual(EXPECTED);
	});

	it("gives every group a title and at least one entry", () => {
		for (const group of CONTROL_GROUPS) {
			expect(group.title).not.toBe("");
			expect(group.entries.length).toBeGreaterThan(0);
		}
	});

	it("has no empty input or action", () => {
		for (const entry of CONTROL_GROUPS.flatMap((g) => g.entries)) {
			expect(entry.input.trim()).not.toBe("");
			expect(entry.action.trim()).not.toBe("");
		}
	});
});
