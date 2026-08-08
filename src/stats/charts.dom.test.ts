// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import {
	barChart,
	calendarHeatmap,
	chartPanel,
	histogramChart,
	pieChart,
	renderLegend,
} from "./charts";
import { calendarYear, histogram } from "./aggregate";

/**
 * Smoke tests that every chart actually draws.
 *
 * These exist because a single exception in one chart blanked eleven panels:
 * the view draws them in one loop, so a throw anywhere takes out everything
 * after it. Asserting "it produced marks and did not throw" is cheap and
 * catches exactly that class of failure, which no amount of pure-function
 * coverage would have.
 *
 * Obsidian's DOM helpers are polyfilled below rather than mocked away, because
 * the helpers are what the charts are built out of — `createSvg`'s namespace
 * handling in particular.
 */

beforeAll(() => {
	const el = window.Element.prototype as unknown as Record<string, unknown>;
	const node = window.Node.prototype as unknown as Record<string, unknown>;

	/**
	 * The HTML helpers accept a space-separated class string.
	 */
	function apply(target: Element, o?: { cls?: string | string[]; text?: string }): Element {
		if (o?.cls !== undefined) {
			target.setAttribute("class", Array.isArray(o.cls) ? o.cls.join(" ") : o.cls);
		}
		if (o?.text !== undefined) target.textContent = o.text;
		return target;
	}

	/**
	 * `createSvg` does not — it hands `cls` to `classList.add()`, which throws
	 * `InvalidCharacterError` on a token containing a space. Reproducing that
	 * asymmetry is the whole point of this polyfill: a forgiving stub here let a
	 * two-class heatmap `<svg>` through, and it threw in Obsidian and blanked
	 * every panel drawn after it.
	 */
	function applySvg(target: Element, o?: { cls?: string | string[] }): Element {
		if (o?.cls === undefined) return target;
		for (const token of Array.isArray(o.cls) ? o.cls : [o.cls]) {
			target.classList.add(token);
		}
		return target;
	}

	el["createEl"] = function (this: Element, tag: string, o?: { cls?: string; text?: string }) {
		return this.appendChild(apply(document.createElement(tag), o));
	};
	el["createDiv"] = function (this: Element, o?: { cls?: string; text?: string }) {
		return this.appendChild(apply(document.createElement("div"), o));
	};
	el["createSpan"] = function (this: Element, o?: { cls?: string; text?: string }) {
		return this.appendChild(apply(document.createElement("span"), o));
	};
	el["createSvg"] = function (this: Element, tag: string, o?: { cls?: string | string[] }) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", tag);
		return this.appendChild(applySvg(svg, o));
	};
	node["setText"] = function (this: Node, text: string) {
		this.textContent = text;
	};
	el["show"] = function (this: HTMLElement) {
		this.style.display = "";
	};
	el["hide"] = function (this: HTMLElement) {
		this.style.display = "none";
	};
	el["addClass"] = function (this: Element, cls: string) {
		this.classList.add(cls);
	};
	el["empty"] = function (this: Element) {
		this.textContent = "";
	};
});

function host(): HTMLElement {
	const div = document.createElement("div");
	document.body.appendChild(div);
	return div;
}

const CLASS_SERIES = [
	{ key: "learning", label: "Learning", color: "var(--osmosis-series-learning)" },
	{ key: "young", label: "Young", color: "var(--osmosis-series-young)" },
	{ key: "mature", label: "Mature", color: "var(--osmosis-series-mature)" },
	{ key: "relearning", label: "Relearning", color: "var(--osmosis-series-relearning)" },
];

describe("barChart", () => {
	const data = [
		{ label: "1 Aug", values: { learning: 3, young: 5, mature: 2, relearning: 1 }, tooltip: "a" },
		{ label: "2 Aug", values: { learning: 0, young: 0, mature: 0, relearning: 0 }, tooltip: "b" },
	];

	it("draws a stacked column per datum", () => {
		const plot = host();
		barChart(plot, {
			width: 600,
			height: 200,
			data,
			series: CLASS_SERIES,
			mode: "stacked",
			formatValue: (v) => String(v),
		});
		expect(plot.querySelectorAll("path.osmosis-stats-bar").length).toBe(4);
	});

	it("keeps an all-zero column hoverable", () => {
		const plot = host();
		barChart(plot, {
			width: 600,
			height: 200,
			data,
			series: CLASS_SERIES,
			mode: "stacked",
			formatValue: (v) => String(v),
		});
		expect(plot.querySelectorAll("rect.osmosis-stats-hit").length).toBe(1);
	});

	it("draws one bar per series when grouped", () => {
		const plot = host();
		barChart(plot, {
			width: 600,
			height: 200,
			data: [{ label: "Again", values: { young: 4, mature: 2 }, tooltip: "x" }],
			series: CLASS_SERIES.slice(1, 3),
			mode: "grouped",
			formatValue: (v) => String(v),
		});
		expect(plot.querySelectorAll("path.osmosis-stats-bar").length).toBe(2);
	});

	it("survives an empty dataset", () => {
		const plot = host();
		expect(() => {
			barChart(plot, {
				width: 600,
				height: 200,
				data: [],
				series: CLASS_SERIES,
				mode: "stacked",
				formatValue: (v) => String(v),
			});
		}).not.toThrow();
	});

	it("survives a single narrow column", () => {
		const plot = host();
		expect(() => {
			barChart(plot, {
				width: 280,
				height: 120,
				data: [{ label: "x", values: { learning: 1 }, tooltip: "t" }],
				series: CLASS_SERIES,
				mode: "stacked",
				formatValue: (v) => String(v),
			});
		}).not.toThrow();
	});
});

describe("histogramChart", () => {
	it("draws a bar per bin and a cumulative line", () => {
		const plot = host();
		histogramChart(plot, {
			width: 600,
			height: 200,
			bins: histogram([1, 2, 3, 40], 50, 10),
			color: "var(--osmosis-series-new)",
			formatBin: (v) => String(Math.round(v)),
			showCumulative: true,
		});
		expect(plot.querySelectorAll("path.osmosis-stats-bar").length).toBe(10);
		expect(plot.querySelectorAll("polyline.osmosis-stats-cumulative").length).toBe(1);
	});

	it("survives bins that are all empty", () => {
		const plot = host();
		expect(() => {
			histogramChart(plot, {
				width: 600,
				height: 200,
				bins: histogram([], 10, 5),
				color: "var(--osmosis-series-new)",
				formatBin: (v) => String(v),
				showCumulative: true,
			});
		}).not.toThrow();
	});
});

describe("pieChart", () => {
	it("draws a slice per non-zero value", () => {
		const plot = host();
		pieChart(
			plot,
			[
				{ key: "a", label: "A", color: "var(--x)", value: 3 },
				{ key: "b", label: "B", color: "var(--y)", value: 0 },
				{ key: "c", label: "C", color: "var(--z)", value: 7 },
			],
			200,
		);
		expect(plot.querySelectorAll("path.osmosis-stats-slice").length).toBe(2);
	});

	it("draws a whole circle when one slice is everything", () => {
		const plot = host();
		pieChart(plot, [{ key: "a", label: "A", color: "var(--x)", value: 9 }], 200);
		const slice = plot.querySelector("path.osmosis-stats-slice");
		expect(slice?.getAttribute("d")).toContain("A");
	});

	it("shows an empty state rather than a zero-radius pie", () => {
		const plot = host();
		pieChart(plot, [{ key: "a", label: "A", color: "var(--x)", value: 0 }], 200);
		expect(plot.querySelector(".osmosis-stats-empty")).not.toBeNull();
	});
});

describe("calendarHeatmap", () => {
	it("draws a cell for every day of the year", () => {
		const plot = host();
		const grid = calendarYear({}, 2026);
		calendarHeatmap(plot, {
			days: grid.days,
			weeks: grid.weeks,
			busiest: grid.busiestCount,
			cell: 13,
			describe: (day) => day.day,
		});
		expect(plot.querySelectorAll("rect.osmosis-stats-cell").length).toBe(365);
	});

	it("survives a year with no reviews at all", () => {
		const plot = host();
		const grid = calendarYear({}, 2026);
		expect(() => {
			calendarHeatmap(plot, {
				days: grid.days,
				weeks: grid.weeks,
				busiest: 0,
				cell: 13,
				describe: (day) => day.day,
			});
		}).not.toThrow();
	});
});

describe("chrome", () => {
	it("builds a panel with a title and a plot host", () => {
		const parent = host();
		const plot = chartPanel(parent, "Reviews", "Answers per day.");
		expect(parent.querySelector(".osmosis-stats-panel-title")?.textContent).toBe("Reviews");
		expect(plot.classList.contains("osmosis-stats-plot")).toBe(true);
	});

	it("renders a legend row per series, each carrying its value", () => {
		const plot = host();
		renderLegend(plot, CLASS_SERIES, { learning: 3, young: 5, mature: 2, relearning: 1 });
		expect(plot.querySelectorAll(".osmosis-stats-legend-item").length).toBe(4);
		expect(plot.querySelectorAll(".osmosis-stats-legend-value")[1]?.textContent).toBe("5");
	});
});
