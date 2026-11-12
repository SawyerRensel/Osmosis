import { describe, it, expect } from "vitest";
import { GRAPH3D_HIDDEN_BUTTONS, NAVBAR_STORAGE_KEYS, TOOLBAR_GROUPS, barToggles, canRunToolbarAction, navbarHidden, readNavbarPrefs, visibleGroups, type ButtonDef, type ToolbarState } from "./ToolRibbon";

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

	it("exposes every button as a command", () => {
		expect(defs.filter((d) => !d.command).map((d) => d.id)).toEqual([]);
	});
});

describe("TOOLBAR_GROUPS layout", () => {
	// The 2D/3D toggle is not here: it is the header's 2D | 3D pill (`view-header.ts`), and its command is registered in main.ts.
	it("keeps its buttons, groups and command names", () => {
		expect(TOOLBAR_GROUPS.map((group) => group.map((d) => `${d.id}:${d.command ?? "-"}`))).toEqual([
			["fit:Fit mind map to view", "zoom-in:Zoom in on mind map", "zoom-out:Zoom out of mind map", "center:Center mind map on root"],
			["fold-all:Collapse all under node", "unfold-all:Expand all under node"],
			["insert-parent:Insert parent node", "add-sibling:Add sibling node", "add-child:Add child node"],
			["move-up:Move node up", "move-down:Move node down", "move-left:Move node left", "move-right:Move node right"],
			["delete:Delete node"],
			["copy:Copy node", "cut:Cut node", "paste:Paste node"],
			["copy-style:Copy node style", "paste-style:Paste node style"],
			["undo:Undo mind map edit", "redo:Redo mind map edit"],
			["refresh:Refresh mind map"],
			["node-menu:Open node menu"],
		]);
	});
});

describe("the 3D graph's ribbon", () => {
	const groups = visibleGroups(TOOLBAR_GROUPS, GRAPH3D_HIDDEN_BUTTONS);
	const ids = groups.flat().map((d) => d.id);

	it("is TOOLBAR_GROUPS without fold and unfold", () => {
		expect(ids).not.toContain("fold-all");
		expect(ids).not.toContain("unfold-all");
		expect(ids).toEqual(TOOLBAR_GROUPS.flat().map((d) => d.id).filter((id) => id !== "fold-all" && id !== "unfold-all"));
	});

	it("drops the group the hidden buttons leave empty, and keeps the rest as they are", () => {
		expect(groups).toHaveLength(TOOLBAR_GROUPS.length - 1);
		expect(groups[0]).toEqual(TOOLBAR_GROUPS[0]);
		expect(groups[1]).toEqual(TOOLBAR_GROUPS[2]);
	});

	it("hides only fold/unfold: every other button has a 3D action", () => {
		expect([...GRAPH3D_HIDDEN_BUTTONS].sort()).toEqual(["fold-all", "unfold-all"]);
	});

	it("leaves 2D's own list alone", () => {
		expect(visibleGroups(TOOLBAR_GROUPS, new Set())).toEqual(TOOLBAR_GROUPS);
	});
});

describe("the bar's toggles", () => {
	const phone = { isMobile: true, touch: true };
	const desktop = { isMobile: false, touch: false };
	const touchDesktop = { isMobile: false, touch: true };

	it("has the navigation bar toggle on phones and tablets, in 2D and 3D", () => {
		expect(barToggles("2d", phone)).toEqual(["navbar"]);
		expect(barToggles("3d", phone)).toEqual(["navbar", "sticks"]);
	});

	it("has the joystick toggle in 3D on any touch screen, and never in 2D", () => {
		expect(barToggles("3d", touchDesktop)).toEqual(["sticks"]);
		expect(barToggles("2d", touchDesktop)).toEqual([]);
	});

	it("adds nothing on a desktop without a touch screen", () => {
		expect(barToggles("2d", desktop)).toEqual([]);
		expect(barToggles("3d", desktop)).toEqual([]);
	});
});

describe("navbarHidden", () => {
	const defaults = readNavbarPrefs(() => null);

	it("hides the navigation bar in edit mode and shows it in reading mode by default", () => {
		expect(defaults).toEqual({ edit: true, reading: false });
		expect(navbarHidden(true, true, defaults)).toBe(true);
		expect(navbarHidden(true, false, defaults)).toBe(false);
	});

	it("follows each mode's own preference", () => {
		const flipped = readNavbarPrefs((key) => (key === NAVBAR_STORAGE_KEYS.edit ? false : key === NAVBAR_STORAGE_KEYS.reading ? true : null));
		expect(navbarHidden(true, true, flipped)).toBe(false);
		expect(navbarHidden(true, false, flipped)).toBe(true);
	});

	it("never hides anything on desktop", () => {
		expect(navbarHidden(false, true, { edit: true, reading: true })).toBe(false);
	});
});
