import { describe, expect, it } from "vitest";
import { heldBlurStep, NodeEditorFocus, wrapMethod } from "./active-node-editor";

describe("NodeEditorFocus", () => {
	const mapView = { name: "mind map" };
	const graphView = { name: "3D graph" };
	const noteView = { name: "note tab" };

	function focused(name: string, view: unknown) {
		const owner = { name: `${name} owner` };
		return { editor: name, owner, view };
	}

	it("answers nothing before a node editor is focused", () => {
		expect(new NodeEditorFocus<string>().answer(null, mapView)).toBeNull();
	});

	it("answers with the focused editor while it is the active editor in the active leaf", () => {
		const focus = new NodeEditorFocus<string>();
		const node = focused("node", mapView);
		focus.focus(node);
		expect(focus.answer(node.owner, mapView)).toBe("node");
	});

	it("keeps answering after a blur (the palette took the focus): nothing but focus and destroy change it", () => {
		const focus = new NodeEditorFocus<string>();
		const node = focused("node", graphView);
		focus.focus(node);
		// A blur reports nothing to the tracker; the lookup still sees the same active editor and leaf.
		expect(focus.answer(node.owner, graphView)).toBe("node");
	});

	it("stops answering once the editor is destroyed", () => {
		const focus = new NodeEditorFocus<string>();
		const node = focused("node", mapView);
		focus.focus(node);
		focus.destroyed("node");
		expect(focus.answer(node.owner, mapView)).toBeNull();
	});

	it("ignores the destruction of an editor it is not tracking", () => {
		const focus = new NodeEditorFocus<string>();
		const second = focused("second", mapView);
		focus.focus(focused("first", mapView));
		focus.focus(second);
		focus.destroyed("first");
		expect(focus.answer(second.owner, mapView)).toBe("second");
	});

	it("does not answer when another editor is active (a note tab's own editor)", () => {
		const focus = new NodeEditorFocus<string>();
		focus.focus(focused("node", mapView));
		expect(focus.answer({ name: "note editor" }, mapView)).toBeNull();
		expect(focus.answer(null, mapView)).toBeNull();
	});

	it("does not answer when another leaf is active", () => {
		const focus = new NodeEditorFocus<string>();
		const node = focused("node", mapView);
		focus.focus(node);
		expect(focus.answer(node.owner, noteView)).toBeNull();
		expect(focus.answer(node.owner, null)).toBeNull();
	});

	it("answers for the editor focused last", () => {
		const focus = new NodeEditorFocus<string>();
		const first = focused("first", mapView);
		const second = focused("second", graphView);
		focus.focus(first);
		focus.focus(second);
		expect(focus.answer(second.owner, graphView)).toBe("second");
		expect(focus.answer(first.owner, mapView)).toBeNull();
	});
});

describe("heldBlurStep", () => {
	it("resumes when the focus is back in the editor, modal or not", () => {
		expect(heldBlurStep({ focused: true, modalOpen: true, focusOnNothing: false })).toBe("resume");
		expect(heldBlurStep({ focused: true, modalOpen: false, focusOnNothing: false })).toBe("resume");
	});

	it("waits while a modal is open", () => {
		expect(heldBlurStep({ focused: false, modalOpen: true, focusOnNothing: false })).toBe("wait");
		expect(heldBlurStep({ focused: false, modalOpen: true, focusOnNothing: true })).toBe("wait");
	});

	it("refocuses when the modal closed and left the focus on nothing", () => {
		expect(heldBlurStep({ focused: false, modalOpen: false, focusOnNothing: true })).toBe("refocus");
	});

	it("blurs (ends the edit) when the modal closed and the focus went elsewhere", () => {
		expect(heldBlurStep({ focused: false, modalOpen: false, focusOnNothing: false })).toBe("blur");
	});
});

describe("wrapMethod", () => {
	class Workspace {
		lookup(type: string): string {
			return `real ${type}`;
		}
	}

	it("wraps the method, passing `this` and the arguments through", () => {
		const workspace = new Workspace();
		const undo = wrapMethod(workspace, "lookup", (original) => function (this: Workspace, type: string) {
			return type === "markdown" ? "stand-in" : original.call(this, type);
		});
		expect(workspace.lookup("markdown")).toBe("stand-in");
		expect(workspace.lookup("graph")).toBe("real graph");
		undo();
	});

	it("undoing a prototype method deletes the own property, leaving the prototype's", () => {
		const workspace = new Workspace();
		const undo = wrapMethod(workspace, "lookup", () => () => "wrapped");
		undo();
		expect(Object.prototype.hasOwnProperty.call(workspace, "lookup")).toBe(false);
		expect(workspace.lookup("markdown")).toBe("real markdown");
	});

	it("undoing an own method puts the original back", () => {
		const own = (type: string) => `own ${type}`;
		const target = { lookup: own };
		const undo = wrapMethod(target, "lookup", () => () => "wrapped");
		expect(target.lookup("x")).toBe("wrapped");
		undo();
		expect(target.lookup).toBe(own);
	});

	it("when another patch wrapped ours, undoing turns ours into a pass-through and keeps theirs", () => {
		const workspace = new Workspace();
		const undoOurs = wrapMethod(workspace, "lookup", () => () => "ours");
		const undoTheirs = wrapMethod(workspace, "lookup", (inner) => function (this: Workspace, type: string) {
			return `theirs(${inner.call(this, type)})`;
		});
		undoOurs();
		expect(workspace.lookup("markdown")).toBe("theirs(real markdown)");
		undoTheirs();
		expect(workspace.lookup("markdown")).toBe("real markdown");
	});

	it("undoing twice is harmless", () => {
		const workspace = new Workspace();
		const undo = wrapMethod(workspace, "lookup", () => () => "wrapped");
		undo();
		undo();
		expect(workspace.lookup("markdown")).toBe("real markdown");
	});
});
