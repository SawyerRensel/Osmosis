// @vitest-environment jsdom
import "obsidian";
import { describe, it, expect } from "vitest";
import { mountAboveInlineTitle, StudyProgressStrip } from "./StudyProgressStrip";

describe("StudyProgressStrip", () => {
	it("builds the bar and the three counts, and fills them in", () => {
		const parent = document.createElement("div");
		const strip = new StudyProgressStrip(parent);
		strip.setProgress(140);
		strip.setCounts({ new: 3, learn: 1, due: 2, current: "learn" });

		const fill = parent.querySelector<HTMLElement>(".osmosis-study-progress > .osmosis-study-progress-bar > .osmosis-study-progress-fill");
		expect(fill?.style.getPropertyValue("--osmosis-progress-width")).toBe("100%");
		const counts = Array.from(parent.querySelectorAll(".osmosis-study-counts > .osmosis-study-count"));
		expect(counts.map((el) => el.textContent)).toEqual(["3", "1", "2"]);
		expect(counts.map((el) => el.classList.contains("is-current"))).toEqual([false, true, false]);
		expect(counts[0]?.getAttribute("aria-label")).toBe("New: 3");
	});
});

describe("mountAboveInlineTitle", () => {
	function sizer(withTitle: boolean): { sizer: HTMLElement; title: HTMLElement | null } {
		const sizerEl = document.createElement("div");
		sizerEl.className = "markdown-preview-sizer";
		sizerEl.appendChild(document.createElement("div")).className = "markdown-preview-pusher";
		const header = sizerEl.appendChild(document.createElement("div"));
		header.className = "mod-header";
		let title: HTMLElement | null = null;
		if (withTitle) {
			title = header.appendChild(document.createElement("div"));
			title.className = "inline-title";
		}
		sizerEl.appendChild(document.createElement("div")).className = "markdown-preview-section";
		return { sizer: sizerEl, title };
	}

	it("goes directly above the inline title", () => {
		const { sizer: s, title } = sizer(true);
		const el = document.createElement("div");
		mountAboveInlineTitle(s, el);
		expect(el.nextSibling).toBe(title);
		mountAboveInlineTitle(s, el);
		expect(s.querySelectorAll("div").length).toBe(5);
		expect(el.nextSibling).toBe(title);
	});

	it("falls back to the top of the sizer with no inline title", () => {
		const { sizer: s } = sizer(false);
		const el = document.createElement("div");
		mountAboveInlineTitle(s, el);
		expect(s.firstChild).toBe(el);
		mountAboveInlineTitle(s, el);
		expect(s.firstChild).toBe(el);
	});
});
