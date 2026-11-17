// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { findModeToggle } from "./LineRevealProcessor";

/**
 * The note header's anchor. Obsidian's `addAction` builds every header action as
 * `button.clickable-icon.view-action`, so a selector that asks for an `<a>` never
 * finds the reading/editing toggle, and the 🧠 and Study buttons lose their place
 * directly left of it.
 */
describe("findModeToggle", () => {
	function header(): HTMLElement {
		const actions = document.createElement("div");
		actions.className = "view-actions";
		for (const label of ["Bookmark", "Current view: editing\nClick to read", "More options"]) {
			const button = document.createElement("button");
			button.className = "clickable-icon view-action";
			button.setAttribute("aria-label", label);
			actions.appendChild(button);
		}
		return actions;
	}

	it("finds Obsidian's toggle, which is a <button>", () => {
		const actions = header();
		expect(findModeToggle(actions)).toBe(actions.children[1]);
	});

	it("returns null when the row has no toggle", () => {
		const actions = header();
		actions.children[1]?.remove();
		expect(findModeToggle(actions)).toBeNull();
	});
});
