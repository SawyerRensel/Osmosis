import { describe, expect, it } from "vitest";
import { LinkPicker } from "./link-pick";

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
