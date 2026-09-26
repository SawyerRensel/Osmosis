import { describe, it, expect } from "vitest";
import { TOOLBAR_GROUPS, canRunToolbarAction, type ButtonDef, type ToolbarState } from "./ToolRibbon";

const idle: ToolbarState = { hasSelection: true, isEditing: false, hasFile: true, isReadingMode: false };
const def = (flags: Partial<ButtonDef>): ButtonDef => ({ id: "x", icon: "x", label: "X", action: "undo", ...flags });

describe("canRunToolbarAction", () => {
	it("runs a plain action with or without a selection", () => {
		expect(canRunToolbarAction(def({}), idle)).toBe(true);
		expect(canRunToolbarAction(def({}), { ...idle, hasSelection: false })).toBe(true);
	});

	it("needs a selection when the button does", () => {
		expect(canRunToolbarAction(def({ needsSelection: true }), { ...idle, hasSelection: false })).toBe(false);
	});

	it("refuses edit-only actions in reading mode", () => {
		expect(canRunToolbarAction(def({ editOnly: true }), { ...idle, isReadingMode: true })).toBe(false);
		expect(canRunToolbarAction(def({}), { ...idle, isReadingMode: true })).toBe(true);
	});

	it("runs nothing while a node is being edited", () => {
		// The node editor's own keys (e.g. Move line up) must reach it.
		expect(canRunToolbarAction(def({}), { ...idle, isEditing: true })).toBe(false);
	});
});

describe("TOOLBAR_GROUPS commands", () => {
	const defs = TOOLBAR_GROUPS.flat();

	it("gives every button a unique id and every command a unique name", () => {
		const ids = defs.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
		const names = defs.flatMap((d) => (d.command ? [d.command] : []));
		expect(new Set(names).size).toBe(names.length);
	});

	it("exposes every button as a command except map properties, which already has one", () => {
		expect(defs.filter((d) => !d.command).map((d) => d.id)).toEqual(["open-properties"]);
	});
});
