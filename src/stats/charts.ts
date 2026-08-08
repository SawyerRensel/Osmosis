/**
 * Hand-built inline SVG chart primitives.
 *
 * No CDN, no chart library: everything is drawn with Obsidian's `createSvg`,
 * the same way the rest of the plugin renders. Colours are never literals here
 * — every mark references a `--osmosis-series-*` custom property so a theme
 * swap repaints the whole dashboard from `styles.css` and light/dark need no
 * branch in this file.
 *
 * Charts are drawn at a measured pixel width rather than scaled through a
 * viewBox. A viewBox would shrink the axis text along with the plot, and these
 * live in a main-area tab that is routinely split to half a window — where
 * scaled labels stop being readable. The cost is that the view re-renders on
 * resize, which is cheap because the data is already in memory.
 */

/** One identity in a multi-series chart. */
export interface Series {
	key: string;
	label: string;
	/** A `var(--osmosis-series-*)` reference, never a literal colour. */
	color: string;
}

/** Chart geometry. Margins leave room for the axis text, nothing more. */
const MARGIN = { top: 10, right: 12, bottom: 26, left: 46 };
/** Bars never fill their slot — the leftover is deliberate air. */
const MAX_BAR_WIDTH = 24;
/** Surface-coloured gap separating touching marks. */
const GAP = 2;
/** Rounded data-end; the baseline end stays square. */
const BAR_RADIUS = 4;

// ── Shared chrome ─────────────────────────────────────────────

/**
 * A chart panel: heading, optional caption, and the plot area a chart draws
 * into. Returns the plot host so the caller can render into it and re-render
 * on resize without rebuilding the frame.
 */
export function chartPanel(
	parent: HTMLElement,
	title: string,
	caption?: string,
): HTMLElement {
	const panel = parent.createDiv({ cls: "osmosis-stats-panel" });
	panel.createEl("h3", { cls: "osmosis-stats-panel-title", text: title });
	if (caption !== undefined && caption !== "") {
		panel.createDiv({ cls: "osmosis-stats-panel-caption", text: caption });
	}
	return panel.createDiv({ cls: "osmosis-stats-plot" });
}

/**
 * A legend row: swatch, label, and the series total.
 *
 * Always present for two or more series — identity must never rest on colour
 * alone. Carrying the value here is also the relief the palette's light-mode
 * contrast warning requires: the lighter hues are never the only way to read a
 * number off this dashboard.
 */
export function renderLegend(
	parent: HTMLElement,
	series: readonly Series[],
	totals: Readonly<Record<string, number>>,
	format: (value: number) => string = (v) => v.toLocaleString(),
): void {
	const legend = parent.createDiv({ cls: "osmosis-stats-legend" });
	for (const item of series) {
		const row = legend.createDiv({ cls: "osmosis-stats-legend-item" });
		const swatch = row.createSpan({ cls: "osmosis-stats-swatch" });
		swatch.style.backgroundColor = item.color;
		row.createSpan({ cls: "osmosis-stats-legend-label", text: item.label });
		row.createSpan({
			cls: "osmosis-stats-legend-value",
			text: format(totals[item.key] ?? 0),
		});
	}
}

/** The empty state a graph shows instead of an axis with nothing under it. */
export function renderEmpty(parent: HTMLElement, message: string): void {
	parent.createDiv({ cls: "osmosis-stats-empty", text: message });
}

// ── Tooltips ──────────────────────────────────────────────────

/**
 * Attach a hover tooltip to a chart.
 *
 * One tooltip element per plot, rather than one per mark: a year heatmap has 365
 * targets and would otherwise build 365 detached nodes that mostly never show.
 *
 * The tip is parented to the *panel*, not the plot, and positioned against the
 * panel's box. The plot is the scroll container for wide charts — the heatmap is
 * 53 columns whatever the pane width — so a tip inside it is clipped at the
 * container's edge and its offset drifts by `scrollLeft` once scrolled. Hanging
 * it off the non-scrolling ancestor removes both faults at once.
 */
function attachTooltip(plot: HTMLElement): (target: Element, text: string) => void {
	const host = plot.closest<HTMLElement>(".osmosis-stats-panel") ?? plot;
	const tip = host.createDiv({ cls: "osmosis-stats-tooltip" });
	tip.hide();

	return (target: Element, text: string) => {
		target.addEventListener("mouseenter", (event: Event) => {
			const rect = host.getBoundingClientRect();
			const mouse = event as MouseEvent;
			tip.setText(text);
			tip.show();
			// Clamp inside the host so a tip near either edge of a split pane
			// stays whole. Measured after `show()`, since a hidden element has
			// no width to clamp against.
			const maxX = Math.max(0, rect.width - tip.offsetWidth);
			const x = Math.min(Math.max(mouse.clientX - rect.left, 0), maxX);
			tip.style.left = `${String(x)}px`;
			tip.style.top = `${String(Math.max(0, mouse.clientY - rect.top - tip.offsetHeight - 8))}px`;
		});
		target.addEventListener("mouseleave", () => {
			tip.hide();
		});
	};
}

// ── Bar charts ────────────────────────────────────────────────

/** One column: its x label, its per-series values, and its tooltip text. */
export interface BarDatum {
	label: string;
	values: Readonly<Record<string, number>>;
	tooltip: string;
}

export interface BarChartOptions {
	width: number;
	height: number;
	data: readonly BarDatum[];
	series: readonly Series[];
	/** Stacked shares one column per datum; grouped sits them side by side. */
	mode: "stacked" | "grouped";
	/** Formats y-axis ticks and tooltip values. */
	formatValue: (value: number) => string;
	/** Show every nth x label. Computed from the width when omitted. */
	labelEvery?: number;
}

/**
 * A stacked or grouped column chart.
 *
 * Segments are separated by a surface-coloured gap rather than a stroke — a
 * stroke would add ink that is not data, and the gap is what makes two
 * neighbouring hues read as distinct without relying on the hue difference
 * alone.
 */
export function barChart(plot: HTMLElement, options: BarChartOptions): void {
	const { width, height, data, series, mode, formatValue } = options;
	const showTip = attachTooltip(plot);

	const innerWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
	const innerHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);

	const totals = data.map((d) =>
		mode === "stacked"
			? series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0)
			: Math.max(0, ...series.map((s) => d.values[s.key] ?? 0)),
	);
	const max = niceCeiling(Math.max(0, ...totals));

	const svg = plot.createSvg("svg", { cls: "osmosis-stats-svg" });
	svg.setAttribute("width", String(width));
	svg.setAttribute("height", String(height));

	drawYAxis(svg, max, innerWidth, innerHeight, formatValue);

	const slot = innerWidth / Math.max(1, data.length);
	const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(1, slot - GAP));
	const groupWidth = mode === "grouped" ? Math.max(1, barWidth / series.length) : barWidth;

	const labelEvery = options.labelEvery ?? xLabelStride(data.length, innerWidth);

	data.forEach((datum, index) => {
		const slotX = MARGIN.left + index * slot;
		const centre = slotX + slot / 2;

		if (mode === "stacked") {
			let cursor = 0;
			// Draw upward from the baseline so the rounded cap lands on the
			// topmost non-empty segment and every join below it stays square.
			const stack = series
				.map((s) => ({ s, value: datum.values[s.key] ?? 0 }))
				.filter((part) => part.value > 0);

			stack.forEach((part, partIndex) => {
				const y0 = scaleY(cursor, max, innerHeight);
				cursor += part.value;
				const y1 = scaleY(cursor, max, innerHeight);
				const isTop = partIndex === stack.length - 1;
				// The gap eats into the segment below its neighbour, never below
				// the baseline.
				const bottom = partIndex === 0 ? y0 : y0 - GAP;
				const rect = barPath(
					svg,
					centre - barWidth / 2,
					y1,
					barWidth,
					Math.max(0.5, bottom - y1),
					isTop,
				);
				rect.setAttribute("fill", part.s.color);
				showTip(rect, datum.tooltip);
			});

			if (stack.length === 0) {
				// An invisible full-height target keeps zero days hoverable, so
				// "why is this day empty" is answerable.
				const hit = svg.createSvg("rect", { cls: "osmosis-stats-hit" });
				hit.setAttribute("x", String(centre - barWidth / 2));
				hit.setAttribute("y", String(MARGIN.top));
				hit.setAttribute("width", String(barWidth));
				hit.setAttribute("height", String(innerHeight));
				showTip(hit, datum.tooltip);
			}
		} else {
			series.forEach((s, seriesIndex) => {
				const value = datum.values[s.key] ?? 0;
				const y = scaleY(value, max, innerHeight);
				const x = centre - barWidth / 2 + seriesIndex * groupWidth;
				const rect = barPath(
					svg,
					x,
					y,
					Math.max(1, groupWidth - GAP),
					Math.max(0.5, MARGIN.top + innerHeight - y),
					true,
				);
				rect.setAttribute("fill", s.color);
				showTip(rect, datum.tooltip);
			});
		}

		// An empty label is a deliberate gap, not a missing value: bucketed
		// ranges label only the column that opens a month.
		if (datum.label !== "" && index % labelEvery === 0) {
			drawXLabel(svg, centre, height, datum.label);
		}
	});

	drawBaseline(svg, innerWidth, innerHeight);
}

// ── Histogram ─────────────────────────────────────────────────

export interface HistogramOptions {
	width: number;
	height: number;
	bins: readonly { start: number; end: number; count: number; cumulative: number }[];
	/** Colour reference for the bars — a single series, so no legend. */
	color: string;
	formatBin: (value: number) => string;
	/** Draw the running share as a line over the bars. */
	showCumulative: boolean;
}

/**
 * A distribution, optionally with its cumulative share drawn over it.
 *
 * The cumulative line shares the bar's axis by being plotted as a *fraction of
 * the plot height* rather than getting a second y-scale — a dual axis would
 * invite reading two incompatible scales off one frame. Its values are in the
 * tooltip, where they are exact.
 */
export function histogramChart(plot: HTMLElement, options: HistogramOptions): void {
	const { width, height, bins, color, formatBin, showCumulative } = options;
	const showTip = attachTooltip(plot);

	const innerWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
	const innerHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);
	const max = niceCeiling(Math.max(0, ...bins.map((b) => b.count)));

	const svg = plot.createSvg("svg", { cls: "osmosis-stats-svg" });
	svg.setAttribute("width", String(width));
	svg.setAttribute("height", String(height));

	drawYAxis(svg, max, innerWidth, innerHeight, (v) => v.toLocaleString());

	const slot = innerWidth / Math.max(1, bins.length);
	const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(1, slot - GAP));
	const labelEvery = xLabelStride(bins.length, innerWidth);

	bins.forEach((bin, index) => {
		const centre = MARGIN.left + index * slot + slot / 2;
		const y = scaleY(bin.count, max, innerHeight);
		const rect = barPath(
			svg,
			centre - barWidth / 2,
			y,
			barWidth,
			Math.max(0.5, MARGIN.top + innerHeight - y),
			true,
		);
		rect.setAttribute("fill", color);
		showTip(
			rect,
			`${formatBin(bin.start)}–${formatBin(bin.end)}: ${bin.count.toLocaleString()}` +
				` (${String(Math.round(bin.cumulative * 100))}% cumulative)`,
		);

		if (index % labelEvery === 0) {
			drawXLabel(svg, centre, height, formatBin(bin.start));
		}
	});

	if (showCumulative && bins.length > 0) {
		const points = bins
			.map((bin, index) => {
				const x = MARGIN.left + index * slot + slot / 2;
				const y = MARGIN.top + innerHeight - bin.cumulative * innerHeight;
				return `${String(x)},${String(y)}`;
			})
			.join(" ");
		const line = svg.createSvg("polyline", { cls: "osmosis-stats-cumulative" });
		line.setAttribute("points", points);
	}

	drawBaseline(svg, innerWidth, innerHeight);
}

// ── Pie ───────────────────────────────────────────────────────

export interface PieSlice {
	key: string;
	label: string;
	color: string;
	value: number;
}

/**
 * A part-to-whole pie.
 *
 * Slices are separated by a surface-coloured stroke — the ring-shaped
 * equivalent of the stacked bar's gap — and every slice is named with its count
 * and share in the legend, so the six categories are never told apart by hue
 * alone.
 */
export function pieChart(plot: HTMLElement, slices: readonly PieSlice[], size: number): void {
	const showTip = attachTooltip(plot);
	const total = slices.reduce((sum, slice) => sum + slice.value, 0);
	if (total === 0) {
		renderEmpty(plot, "No cards yet.");
		return;
	}

	const svg = plot.createSvg("svg", { cls: "osmosis-stats-svg" });
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));

	const radius = size / 2 - 2;
	const centre = size / 2;
	let angle = -Math.PI / 2; // start at twelve o'clock

	for (const slice of slices) {
		if (slice.value === 0) continue;
		const sweep = (slice.value / total) * Math.PI * 2;
		const path = svg.createSvg("path", { cls: "osmosis-stats-slice" });
		path.setAttribute("d", arcPath(centre, centre, radius, angle, angle + sweep));
		path.setAttribute("fill", slice.color);
		showTip(
			path,
			`${slice.label}: ${slice.value.toLocaleString()}` +
				` (${String(Math.round((slice.value / total) * 100))}%)`,
		);
		angle += sweep;
	}
}

// ── Calendar heatmap ──────────────────────────────────────────

export interface HeatmapDay {
	day: string;
	count: number;
	week: number;
	weekday: number;
}

export interface HeatmapOptions {
	days: readonly HeatmapDay[];
	weeks: number;
	/** Busiest day in the year — the top of the intensity ramp. */
	busiest: number;
	cell: number;
	describe: (day: HeatmapDay) => string;
}

/**
 * A year of study as a column-per-week grid.
 *
 * Intensity is a five-step single-hue ramp, which is what a sequential
 * (magnitude) encoding requires — a rainbow here would imply the days differ in
 * kind rather than in amount. Step 0 is a recessive "nothing happened" tone
 * rather than the palest blue, so an empty year reads as empty rather than as
 * faint activity.
 */
export function calendarHeatmap(plot: HTMLElement, options: HeatmapOptions): void {
	const { days, weeks, busiest, cell, describe } = options;
	const showTip = attachTooltip(plot);

	const width = weeks * cell + 30;
	const height = 7 * cell + 16;

	// Two classes must be an array: `createSvg` passes `cls` to
	// `classList.add()`, which rejects a token containing a space. The HTML
	// helpers accept a space-separated string, so the asymmetry is easy to trip.
	const svg = plot.createSvg("svg", { cls: ["osmosis-stats-svg", "osmosis-stats-heatmap"] });
	svg.setAttribute("width", String(width));
	svg.setAttribute("height", String(height));

	for (const [index, label] of ["Mon", "Wed", "Fri"].entries()) {
		const text = svg.createSvg("text", { cls: "osmosis-stats-axis-label" });
		text.setAttribute("x", "0");
		text.setAttribute("y", String((index * 2 + 1) * cell + cell - 3));
		text.setAttribute("text-anchor", "start");
		text.setText(label);
	}

	for (const day of days) {
		const rect = svg.createSvg("rect", { cls: "osmosis-stats-cell" });
		rect.setAttribute("x", String(30 + day.week * cell));
		rect.setAttribute("y", String(day.weekday * cell));
		rect.setAttribute("width", String(Math.max(1, cell - GAP)));
		rect.setAttribute("height", String(Math.max(1, cell - GAP)));
		rect.setAttribute("rx", "2");
		rect.setAttribute("fill", `var(--osmosis-heat-${String(heatStep(day.count, busiest))})`);
		showTip(rect, describe(day));
	}
}

/** Which of the five intensity steps a day's count falls in. */
export function heatStep(count: number, busiest: number): number {
	if (count <= 0) return 0;
	if (busiest <= 0) return 1;
	return Math.min(4, Math.max(1, Math.ceil((count / busiest) * 4)));
}

// ── Private drawing helpers ───────────────────────────────────

/**
 * A bar with its data-end rounded and its baseline end square.
 *
 * Drawn as a path rather than a `rect` with `rx`, because `rx` rounds all four
 * corners and would lift the bar off its own baseline.
 */
function barPath(
	svg: SVGSVGElement,
	x: number,
	y: number,
	width: number,
	height: number,
	roundTop: boolean,
): SVGPathElement {
	const r = roundTop ? Math.min(BAR_RADIUS, width / 2, height) : 0;
	const path = svg.createSvg("path", { cls: "osmosis-stats-bar" });
	path.setAttribute(
		"d",
		r === 0
			? `M${String(x)},${String(y)}h${String(width)}v${String(height)}h${String(-width)}z`
			: `M${String(x)},${String(y + height)}V${String(y + r)}` +
				`a${String(r)},${String(r)} 0 0 1 ${String(r)},${String(-r)}` +
				`h${String(width - 2 * r)}` +
				`a${String(r)},${String(r)} 0 0 1 ${String(r)},${String(r)}` +
				`V${String(y + height)}z`,
	);
	return path;
}

function drawYAxis(
	svg: SVGSVGElement,
	max: number,
	innerWidth: number,
	innerHeight: number,
	format: (value: number) => string,
): void {
	const ticks = 4;
	for (let i = 0; i <= ticks; i++) {
		const value = (max / ticks) * i;
		const y = scaleY(value, max, innerHeight);

		const grid = svg.createSvg("line", { cls: "osmosis-stats-gridline" });
		grid.setAttribute("x1", String(MARGIN.left));
		grid.setAttribute("x2", String(MARGIN.left + innerWidth));
		grid.setAttribute("y1", String(y));
		grid.setAttribute("y2", String(y));

		const text = svg.createSvg("text", { cls: "osmosis-stats-axis-label" });
		text.setAttribute("x", String(MARGIN.left - 6));
		text.setAttribute("y", String(y + 3));
		text.setAttribute("text-anchor", "end");
		text.setText(format(value));
	}
}

function drawBaseline(svg: SVGSVGElement, innerWidth: number, innerHeight: number): void {
	const axis = svg.createSvg("line", { cls: "osmosis-stats-baseline" });
	axis.setAttribute("x1", String(MARGIN.left));
	axis.setAttribute("x2", String(MARGIN.left + innerWidth));
	axis.setAttribute("y1", String(MARGIN.top + innerHeight));
	axis.setAttribute("y2", String(MARGIN.top + innerHeight));
}

function drawXLabel(svg: SVGSVGElement, x: number, height: number, label: string): void {
	const text = svg.createSvg("text", { cls: "osmosis-stats-axis-label" });
	text.setAttribute("x", String(x));
	text.setAttribute("y", String(height - 8));
	text.setAttribute("text-anchor", "middle");
	text.setText(label);
}

function scaleY(value: number, max: number, innerHeight: number): number {
	if (max <= 0) return MARGIN.top + innerHeight;
	return MARGIN.top + innerHeight - (value / max) * innerHeight;
}

/**
 * Round an axis maximum up to a clean number, so ticks read 0/500/1,000 rather
 * than 0/437/874.
 */
export function niceCeiling(value: number): number {
	if (value <= 0) return 1;
	const magnitude = 10 ** Math.floor(Math.log10(value));
	for (const step of [1, 2, 2.5, 5, 10]) {
		const candidate = step * magnitude;
		if (value <= candidate) return candidate;
	}
	return 10 * magnitude;
}

/**
 * How many columns to skip between x labels so they never collide.
 *
 * Labels are dropped rather than rotated or shrunk: a rotated axis is harder to
 * read than a sparser one, and shrinking loses the half-width legibility this
 * module measures pixel widths to protect.
 */
export function xLabelStride(count: number, innerWidth: number, labelWidth = 52): number {
	if (count <= 1) return 1;
	const fits = Math.max(1, Math.floor(innerWidth / labelWidth));
	return Math.max(1, Math.ceil(count / fits));
}

/** An SVG arc path for a pie slice, from centre out and back. */
function arcPath(
	cx: number,
	cy: number,
	r: number,
	from: number,
	to: number,
): string {
	// A full circle cannot be expressed as one arc — its start and end points
	// coincide and the renderer draws nothing.
	if (to - from >= Math.PI * 2 - 1e-9) {
		return (
			`M${String(cx)},${String(cy - r)}` +
			`A${String(r)},${String(r)} 0 1 1 ${String(cx - 0.01)},${String(cy - r)}z`
		);
	}
	const x0 = cx + r * Math.cos(from);
	const y0 = cy + r * Math.sin(from);
	const x1 = cx + r * Math.cos(to);
	const y1 = cy + r * Math.sin(to);
	const large = to - from > Math.PI ? 1 : 0;
	return (
		`M${String(cx)},${String(cy)}L${String(x0)},${String(y0)}` +
		`A${String(r)},${String(r)} 0 ${String(large)} 1 ${String(x1)},${String(y1)}z`
	);
}
