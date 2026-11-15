import { describe, expect, it } from "vitest";
import { LinkPicker, linkMenuItems } from "./link-pick";

const tap = (target: string | null, linkable = true) => ({ target, linkable });

describe("LinkPicker", () => {
	it("passes taps through while not armed", () => {
		const picker = new LinkPicker();
		expect(picker.armed).toBe(false);
		expect(picker.tap(tap("b"))).toEqual({ kind: "pass" });
	});

	it("arms on the selection and links it to the next tapped node, once", () => {
		const picker = new LinkPicker();
		expect(picker.toggle(["a"])).toBe(true);
		expect(picker.from).toEqual(["a"]);
		expect(picker.tap(tap("b"))).toEqual({ kind: "link", sources: ["a"], target: "b" });
		expect(picker.armed).toBe(false);
		expect(picker.tap(tap("c"))).toEqual({ kind: "pass" });
	});

	it("links every source of a multi-selection", () => {
		const picker = new LinkPicker();
		picker.toggle(["a", "b"]);
		expect(picker.tap(tap("c"))).toEqual({ kind: "link", sources: ["a", "b"], target: "c" });
	});

	it("keeps the sources it was armed with, whatever the selection does after", () => {
		const picker = new LinkPicker();
		const selection = ["a"];
		picker.toggle(selection);
		selection.push("b");
		expect(picker.from).toEqual(["a"]);
	});

	it("does not arm with nothing selected", () => {
		const picker = new LinkPicker();
		expect(picker.toggle([])).toBe(false);
	});

	it("disarms when the button is tapped again", () => {
		const picker = new LinkPicker();
		picker.toggle(["a"]);
		expect(picker.toggle(["a"])).toBe(false);
		expect(picker.tap(tap("b"))).toEqual({ kind: "pass" });
	});

	it("cancels on a tap on empty space", () => {
		const picker = new LinkPicker();
		picker.toggle(["a"]);
		expect(picker.tap(tap(null))).toEqual({ kind: "cancel" });
		expect(picker.armed).toBe(false);
	});

	it("cancels on a tap on a source node", () => {
		const picker = new LinkPicker();
		picker.toggle(["a", "b"]);
		expect(picker.tap(tap("b"))).toEqual({ kind: "cancel" });
		expect(picker.armed).toBe(false);
	});

	it("ignores a node that cannot be linked to and stays armed", () => {
		const picker = new LinkPicker();
		picker.toggle(["a"]);
		expect(picker.tap(tap("tag", false))).toEqual({ kind: "ignore" });
		expect(picker.armed).toBe(true);
		expect(picker.tap(tap("b"))).toEqual({ kind: "link", sources: ["a"], target: "b" });
	});

	it("reports whether cancel ended an armed mode", () => {
		const picker = new LinkPicker();
		expect(picker.cancel()).toBe(false);
		picker.toggle(["a"]);
		expect(picker.cancel()).toBe(true);
		expect(picker.armed).toBe(false);
	});
});

describe("linkMenuItems", () => {
	const choices = (t: Parameters<typeof linkMenuItems>[0]) => linkMenuItems(t).map((item) => item.choice);
	const all = { canLink: true, canMove: true };

	it("offers a link and both moves for an ordinary line", () => {
		expect(choices({ ...all, line: true, root: false })).toEqual(["link", "under", "after"]);
	});

	it("offers no Move after for a sole-H1 root, but the end of its note", () => {
		expect(choices({ ...all, line: true, root: true })).toEqual(["link", "under", "end"]);
	});

	it("offers only the end of the note for a note (not a line)", () => {
		expect(choices({ ...all, line: false, root: true })).toEqual(["link", "end"]);
	});

	it("drops Add link when no source can take it", () => {
		expect(choices({ canLink: false, canMove: true, line: true, root: false })).toEqual(["under", "after"]);
	});

	it("offers no move when the sources may not move there", () => {
		expect(choices({ canLink: true, canMove: false, line: true, root: false })).toEqual(["link"]);
		expect(choices({ canLink: false, canMove: false, line: true, root: true })).toEqual([]);
	});

	it("gives each choice the drop menu's title and icon", () => {
		expect(linkMenuItems({ ...all, line: true, root: true }).map(({ title, icon }) => [title, icon])).toEqual([
			["Add link", "link"],
			["Move under", "corner-down-right"],
			["Move to end of note", "arrow-down-to-line"],
		]);
	});
});
