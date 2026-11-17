import { describe, expect, it } from "vitest";
import { doubleClickEdit, enterSavesEdit } from "./edit-keys";

describe("enterSavesEdit", () => {
	it("saves on plain Enter", () => expect(enterSavesEdit(false, false)).toBe(true));
	it("leaves Shift+Enter to CodeMirror, for a new line", () => expect(enterSavesEdit(false, true)).toBe(false));
	it("leaves Mod+Enter to the submit binding", () => {
		expect(enterSavesEdit(true, false)).toBe(false);
		expect(enterSavesEdit(true, true)).toBe(false);
	});
});

describe("doubleClickEdit", () => {
	const line = { isLine: true, hasSource: true };
	it("opens the editor in edit mode", () => expect(doubleClickEdit(line, true, false)).toBe("open"));
	it("turns edit mode on first when it is off", () => expect(doubleClickEdit(line, false, false)).toBe("enable"));
	it("ignores a node that is not a line", () => expect(doubleClickEdit({ isLine: false, hasSource: false }, false, false)).toBe("none"));
	it("ignores a line without a source", () => expect(doubleClickEdit({ isLine: true, hasSource: false }, true, false)).toBe("none"));
	it("ignores everything while a study session blocks editing", () => {
		expect(doubleClickEdit(line, true, true)).toBe("none");
		expect(doubleClickEdit(line, false, true)).toBe("none");
	});
});
