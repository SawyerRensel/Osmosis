import { describe, it, expect } from "vitest";
import { GRAPH3D_HIDDEN_BUTTONS, TOOLBAR_GROUPS, barShown, barToggles, canRunToolbarAction, navbarHidden, visibleGroups, type ButtonDef, type ToolbarState } from "./ToolRibbon";

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
			["insert-parent:Insert parent node", "add-sibling:Add sibling node", "add-child:Add child node"],
			["move-up:Move node up", "move-down:Move node down", "move-left:Outdent node", "move-right:Indent node"],
			["delete:Delete node"],
			["add-link:Add link to node"],
			["fit:Fit mind map to view", "zoom-in:Zoom in on mind map", "zoom-out:Zoom out of mind map", "center:Center mind map on root"],
			["fold-all:Collapse all under node", "unfold-all:Expand all under node"],
			["copy:Copy node", "cut:Cut node", "paste:Paste node"],
			["copy-style:Copy node style", "paste-style:Paste node style"],
			["undo:Undo mind map edit", "redo:Redo mind map edit"],
			["refresh:Refresh mind map"],
			["node-menu:Open node menu"],
		]);
	});

	it("draws the editing core first, so it fills a phone's eight slots", () => {
		const bar = TOOLBAR_GROUPS.flat().filter((d) => !d.noButton);
		expect(bar.slice(0, 8).map((d) => d.id)).toEqual(["insert-parent", "add-sibling", "add-child", "move-up", "move-down", "move-left", "move-right", "delete"]);
	});

	it("keeps zoom as commands with no buttons", () => {
		const zoom = TOOLBAR_GROUPS.flat().filter((d) => d.noButton);
		expect(zoom.map((d) => `${d.id}:${d.command ?? "-"}`)).toEqual(["zoom-in:Zoom in on mind map", "zoom-out:Zoom out of mind map"]);
	});

	it("uses Obsidian's editor icons for moves and circle chevrons for creating", () => {
		const icon = (id: string) => TOOLBAR_GROUPS.flat().find((d) => d.id === id)?.icon;
		expect(["insert-parent", "add-sibling", "add-child"].map(icon)).toEqual(["circle-chevron-left", "circle-chevron-down", "circle-chevron-right"]);
		expect(["move-up", "move-down", "move-left", "move-right"].map(icon)).toEqual(["lucide-corner-right-up", "lucide-corner-right-down", "lucide-outdent", "lucide-indent"]);
	});

	it("wires outdent and indent to tree depth, not screen side", () => {
		const action = (id: string) => TOOLBAR_GROUPS.flat().find((d) => d.id === id)?.action;
		expect(action("move-left")).toBe("outdent");
		expect(action("move-right")).toBe("indent");
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
		const fold = TOOLBAR_GROUPS.findIndex((group) => group.some((d) => d.id === "fold-all"));
		expect(groups).toEqual(TOOLBAR_GROUPS.filter((_, i) => i !== fold));
	});

	it("hides only fold/unfold: every other button has a 3D action", () => {
		expect([...GRAPH3D_HIDDEN_BUTTONS].sort()).toEqual(["fold-all", "unfold-all"]);
	});

	it("leaves 2D's own list alone", () => {
		expect(visibleGroups(TOOLBAR_GROUPS, new Set())).toEqual(TOOLBAR_GROUPS);
	});
});

describe("the bar's toggles", () => {
	const touch = { touch: true };
	const mouse = { touch: false };

	it("has the joystick toggle in 3D on any touch screen, and never in 2D", () => {
		expect(barToggles("3d", touch)).toEqual(["sticks", "help"]);
		expect(barToggles("2d", touch)).toEqual([]);
	});

	it("ends the 3D bar with the controls help on every device, and gives 2D none", () => {
		expect(barToggles("3d", mouse)).toEqual(["help"]);
		expect(barToggles("2d", mouse)).toEqual([]);
	});

	it("has no navigation bar toggle", () => {
		for (const device of [touch, mouse]) {
			expect(barToggles("3d", device)).not.toContain("navbar");
			expect(barToggles("2d", device)).not.toContain("navbar");
		}
	});
});

describe("barShown", () => {
	it("shows on desktop and tablet in both modes", () => {
		expect(barShown(idle, false)).toBe(true);
		expect(barShown({ ...idle, isReadingMode: true }, false)).toBe(true);
	});

	it("shows on a phone in edit mode only", () => {
		expect(barShown(idle, true)).toBe(true);
		expect(barShown({ ...idle, isReadingMode: true }, true)).toBe(false);
	});

	it("hides while a node is being edited", () => {
		expect(barShown({ ...idle, isEditing: true }, false)).toBe(false);
		expect(barShown({ ...idle, isEditing: true }, true)).toBe(false);
	});
});

describe("navbarHidden", () => {
	it("always hides the navigation bar on a phone in edit mode", () => {
		expect(navbarHidden(true, true)).toBe(true);
	});

	it("always shows it in reading mode", () => {
		expect(navbarHidden(true, false)).toBe(false);
	});

	it("never hides anything on desktop or tablet", () => {
		expect(navbarHidden(false, true)).toBe(false);
	});
});
