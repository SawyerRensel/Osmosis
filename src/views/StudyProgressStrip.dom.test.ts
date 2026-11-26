// @vitest-environment jsdom
import "obsidian";
import { describe, it, expect } from "vitest";
import { mountAtScrollerTop, StudyProgressStrip } from "./StudyProgressStrip";

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

describe("mountAtScrollerTop", () => {
	function scroller(): HTMLElement {
		const scrollerEl = document.createElement("div");
		scrollerEl.className = "markdown-preview-view";
		const sizerEl = scrollerEl.appendChild(document.createElement("div"));
		sizerEl.className = "markdown-preview-sizer";
		sizerEl.appendChild(document.createElement("div")).className = "inline-title";
		return scrollerEl;
	}

	it("goes above the sizer, outside the part Obsidian virtualizes", () => {
		const s = scroller();
		const el = document.createElement("div");
		mountAtScrollerTop(s, el);
		expect(s.firstChild).toBe(el);
		expect((el.nextSibling as HTMLElement).className).toBe("markdown-preview-sizer");
		mountAtScrollerTop(s, el);
		expect(s.children.length).toBe(2);
		expect(s.firstChild).toBe(el);
	});
});
