/**
 * Reusable color picker component for Osmosis mind map styling.
 *
 * Three sections:
 *  1. Theme palette — auto-populated from active theme colors
 *  2. Custom palette — user-saved colors, persistent in plugin settings
 *  3. Hex input + gradient/hue selector for freeform picking
 *
 * Usage:
 *   const picker = new ColorPicker({
 *     app, plugin, initialColor: "#ff0000",
 *     themeColors: extractThemeColors(theme),
 *     onChange: (color) => { ... },
 *   });
 *   picker.open(anchorEl);
 */

import type { App } from "obsidian";
import type OsmosisPlugin from "../main";
import type { ThemeDefinition, NodeStyle, BorderStyle, TextStyle, BranchStyle } from "../styles";

// ─── Theme Color Extraction ────────────────────────────────────────────────

/** Extract all unique colors from a ThemeDefinition for the theme palette. */
export function extractThemeColors(theme: ThemeDefinition | undefined): string[] {
	if (!theme) return [];

	const colors = new Set<string>();

	function addNodeColors(style: NodeStyle | undefined): void {
		if (!style) return;
		if (style.fill) colors.add(style.fill);
		if (style.background) colors.add(style.background);
		addBorderColors(style.border);
		addTextColors(style.text);
		addBranchColors(style.branchLine);
	}

	function addBorderColors(border: BorderStyle | undefined): void {
		if (border?.color) colors.add(border.color);
	}

	function addTextColors(text: TextStyle | undefined): void {
		if (text?.color) colors.add(text.color);
	}

	function addBranchColors(branch: BranchStyle | undefined): void {
		if (branch?.color) colors.add(branch.color);
	}

	// Base style
	addNodeColors(theme.base);

	// Depth styles
	for (const depth of Object.values(theme.depths)) {
		addNodeColors(depth);
	}

	// Branch line
	addBranchColors(theme.branchLine);

	// Background
	if (theme.background) colors.add(theme.background);

	// Branch colors palette
	if (theme.branchColors) {
		for (const c of theme.branchColors) {
			colors.add(c);
		}
	}

	return [...colors];
}

// ─── Color Utilities ───────────────────────────────────────────────────────

/** Validate a hex color string (#RGB or #RRGGBB). */
function isValidHex(hex: string): boolean {
	return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}

/** Normalize a 3-char hex to 6-char. */
function normalizeHex(hex: string): string {
	if (hex.length === 4) {
		return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
	}
	return hex.toLowerCase();
}

/** Convert hex to HSL. Returns [h, s, l] with h in [0,360], s and l in [0,1]. */
function hexToHsl(hex: string): [number, number, number] {
	const norm = normalizeHex(hex);
	const r = parseInt(norm.slice(1, 3), 16) / 255;
	const g = parseInt(norm.slice(3, 5), 16) / 255;
	const b = parseInt(norm.slice(5, 7), 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;

	if (max === min) return [0, 0, l];

	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

	let h = 0;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;

	return [h * 360, s, l];
}

/** Convert HSL to hex. h in [0,360], s and l in [0,1]. */
function hslToHex(h: number, s: number, l: number): string {
	const hNorm = h / 360;
	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};

	let r: number, g: number, b: number;
	if (s === 0) {
		r = g = b = l;
	} else {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, hNorm + 1 / 3);
		g = hue2rgb(p, q, hNorm);
		b = hue2rgb(p, q, hNorm - 1 / 3);
	}

	const toHex = (c: number) =>
		Math.round(c * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ─── Color Picker Component ────────────────────────────────────────────────

export interface ColorPickerOptions {
	app: App;
	plugin: OsmosisPlugin;
	initialColor: string;
	themeColors: string[];
	onChange: (color: string) => void;
}

export class ColorPicker {
	private options: ColorPickerOptions;
	private popoverEl: HTMLElement | null = null;
	private currentColor: string;
	private currentHsl: [number, number, number];
	private hexInput: HTMLInputElement | null = null;
	private satLightCanvas: HTMLCanvasElement | null = null;
	private hueSlider: HTMLInputElement | null = null;
	private previewSwatch: HTMLElement | null = null;
	private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

	constructor(options: ColorPickerOptions) {
		this.options = options;
		this.currentColor = isValidHex(options.initialColor)
			? normalizeHex(options.initialColor)
			: "#000000";
		this.currentHsl = hexToHsl(this.currentColor);
	}

	/** Open the picker as a popover below the anchor element. */
	open(anchor: HTMLElement): void {
		this.close();

		const popover = document.body.createDiv({
			cls: "osmosis-color-picker",
		});
		this.popoverEl = popover;

		// Position below anchor
		const rect = anchor.getBoundingClientRect();
		popover.style.setProperty("--picker-top", `${rect.bottom + 4}px`);
		popover.style.setProperty("--picker-left", `${rect.left}px`);

		// Theme palette
		this.renderSection(popover, "Theme", () =>
			this.renderSwatchGrid(popover, this.options.themeColors, "osmosis-cp-theme"),
		);

		// Custom palette
		this.renderSection(popover, "Custom", () =>
			this.renderCustomPalette(popover),
		);

		// Freeform selector
		this.renderSection(popover, "Custom color", () =>
			this.renderFreeformSelector(popover),
		);

		// Close on outside click
		this.outsideClickHandler = (e: MouseEvent) => {
			if (
				this.popoverEl &&
				!this.popoverEl.contains(e.target as Node) &&
				!anchor.contains(e.target as Node)
			) {
				this.close();
			}
		};
		setTimeout(() => {
			document.addEventListener("mousedown", this.outsideClickHandler!);
		}, 0);
	}

	/** Close the popover. */
	close(): void {
		if (this.outsideClickHandler) {
			document.removeEventListener("mousedown", this.outsideClickHandler);
			this.outsideClickHandler = null;
		}
		this.popoverEl?.remove();
		this.popoverEl = null;
	}

	private renderSection(
		parent: HTMLElement,
		title: string,
		contentFn: () => void,
	): void {
		const label = parent.createDiv({ cls: "osmosis-cp-section-label" });
		label.createSpan({ text: title });
		contentFn();
	}

	// ─── Swatch Grid ─────────────────────────────────────────

	private renderSwatchGrid(
		parent: HTMLElement,
		colors: string[],
		cls: string,
	): HTMLElement {
		const grid = parent.createDiv({ cls: `osmosis-cp-swatches ${cls}` });

		for (const color of colors) {
			const swatch = grid.createDiv({ cls: "osmosis-cp-swatch" });
			swatch.style.setProperty("--swatch-color", color);
			if (color.toLowerCase() === this.currentColor) {
				swatch.addClass("is-selected");
			}
			swatch.addEventListener("click", () => {
				this.selectColor(color);
			});
			swatch.setAttribute("title", color);
		}

		return grid;
	}

	// ─── Custom Palette ──────────────────────────────────────

	private renderCustomPalette(parent: HTMLElement): void {
		const wrapper = parent.createDiv({ cls: "osmosis-cp-custom-wrapper" });
		const colors = this.options.plugin.settings.customColors;

		const grid = this.renderSwatchGrid(wrapper, colors, "osmosis-cp-custom");

		// "+" button to add current color
		const addBtn = grid.createDiv({
			cls: "osmosis-cp-swatch osmosis-cp-add-btn",
			text: "+",
		});
		addBtn.setAttribute("title", "Save current color");
		addBtn.addEventListener("click", () => {
			if (!colors.includes(this.currentColor)) {
				colors.push(this.currentColor);
				void this.options.plugin.saveSettings();
				this.refreshCustomPalette(wrapper);
			}
		});

		// Right-click to remove swatches
		grid.addEventListener("contextmenu", (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.hasClass("osmosis-cp-swatch") &&
				!target.hasClass("osmosis-cp-add-btn")
			) {
				e.preventDefault();
				const color = getComputedStyle(target)
					.getPropertyValue("--swatch-color")
					.trim();
				const idx = colors.indexOf(color);
				if (idx >= 0) {
					colors.splice(idx, 1);
					void this.options.plugin.saveSettings();
					this.refreshCustomPalette(wrapper);
				}
			}
		});
	}

	private refreshCustomPalette(wrapper: HTMLElement): void {
		wrapper.empty();
		const colors = this.options.plugin.settings.customColors;
		const grid = this.renderSwatchGrid(
			wrapper,
			colors,
			"osmosis-cp-custom",
		);

		const addBtn = grid.createDiv({
			cls: "osmosis-cp-swatch osmosis-cp-add-btn",
			text: "+",
		});
		addBtn.setAttribute("title", "Save current color");
		addBtn.addEventListener("click", () => {
			if (!colors.includes(this.currentColor)) {
				colors.push(this.currentColor);
				void this.options.plugin.saveSettings();
				this.refreshCustomPalette(wrapper);
			}
		});

		grid.addEventListener("contextmenu", (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.hasClass("osmosis-cp-swatch") &&
				!target.hasClass("osmosis-cp-add-btn")
			) {
				e.preventDefault();
				const color = getComputedStyle(target)
					.getPropertyValue("--swatch-color")
					.trim();
				const idx = colors.indexOf(color);
				if (idx >= 0) {
					colors.splice(idx, 1);
					void this.options.plugin.saveSettings();
					this.refreshCustomPalette(wrapper);
				}
			}
		});
	}

	// ─── Freeform Selector ───────────────────────────────────

	private renderFreeformSelector(parent: HTMLElement): void {
		const freeform = parent.createDiv({ cls: "osmosis-cp-freeform" });

		// Saturation/Lightness canvas
		const canvasWrapper = freeform.createDiv({
			cls: "osmosis-cp-canvas-wrapper",
		});
		const canvas = canvasWrapper.createEl("canvas", {
			cls: "osmosis-cp-sl-canvas",
		});
		canvas.width = 200;
		canvas.height = 150;
		this.satLightCanvas = canvas;
		this.drawSatLightCanvas();

		// Crosshair indicator
		const crosshair = canvasWrapper.createDiv({
			cls: "osmosis-cp-crosshair",
		});
		this.positionCrosshair(crosshair);

		// Canvas click/drag
		const handleCanvasInput = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
			const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

			// x = saturation, y = lightness (1 - y so top is light)
			this.currentHsl[1] = x;
			this.currentHsl[2] = 1 - y;
			this.updateFromHsl();
			this.positionCrosshair(crosshair);
		};

		let dragging = false;
		canvas.addEventListener("mousedown", (e) => {
			dragging = true;
			handleCanvasInput(e);
		});
		document.addEventListener("mousemove", (e) => {
			if (dragging) handleCanvasInput(e);
		});
		document.addEventListener("mouseup", () => {
			dragging = false;
		});

		// Hue slider
		const hueRow = freeform.createDiv({ cls: "osmosis-cp-hue-row" });
		hueRow.createSpan({ text: "H", cls: "osmosis-cp-label" });
		const hueSlider = hueRow.createEl("input", {
			cls: "osmosis-cp-hue-slider",
			type: "range",
		});
		hueSlider.min = "0";
		hueSlider.max = "360";
		hueSlider.value = String(Math.round(this.currentHsl[0]));
		this.hueSlider = hueSlider;

		hueSlider.addEventListener("input", () => {
			this.currentHsl[0] = Number(hueSlider.value);
			this.drawSatLightCanvas();
			this.updateFromHsl();
			this.positionCrosshair(crosshair);
		});

		// Preview swatch + hex input
		const inputRow = freeform.createDiv({ cls: "osmosis-cp-input-row" });

		const preview = inputRow.createDiv({ cls: "osmosis-cp-preview" });
		preview.style.setProperty("--swatch-color", this.currentColor);
		this.previewSwatch = preview;

		const hexInput = inputRow.createEl("input", {
			cls: "osmosis-cp-hex-input",
			type: "text",
			value: this.currentColor,
		});
		hexInput.setAttribute("maxlength", "7");
		hexInput.setAttribute("spellcheck", "false");
		this.hexInput = hexInput;

		hexInput.addEventListener("input", () => {
			let val = hexInput.value.trim();
			if (!val.startsWith("#")) val = "#" + val;

			if (isValidHex(val)) {
				hexInput.removeClass("is-invalid");
				this.currentColor = normalizeHex(val);
				this.currentHsl = hexToHsl(this.currentColor);
				this.drawSatLightCanvas();
				this.positionCrosshair(crosshair);
				if (this.hueSlider) {
					this.hueSlider.value = String(Math.round(this.currentHsl[0]));
				}
				this.updatePreview();
				this.options.onChange(this.currentColor);
			} else {
				hexInput.addClass("is-invalid");
			}
		});
	}

	private drawSatLightCanvas(): void {
		const canvas = this.satLightCanvas;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = canvas.width;
		const h = canvas.height;
		const hue = this.currentHsl[0];

		// Draw the gradient: x = saturation (0 to 1), y = lightness (1 to 0)
		const imageData = ctx.createImageData(w, h);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const s = x / (w - 1);
				const l = 1 - y / (h - 1);
				const hex = hslToHex(hue, s, l);
				const r = parseInt(hex.slice(1, 3), 16);
				const g = parseInt(hex.slice(3, 5), 16);
				const b = parseInt(hex.slice(5, 7), 16);
				const idx = (y * w + x) * 4;
				imageData.data[idx] = r;
				imageData.data[idx + 1] = g;
				imageData.data[idx + 2] = b;
				imageData.data[idx + 3] = 255;
			}
		}
		ctx.putImageData(imageData, 0, 0);
	}

	private positionCrosshair(crosshair: HTMLElement): void {
		const s = this.currentHsl[1];
		const l = this.currentHsl[2];
		crosshair.style.left = `${s * 100}%`;
		crosshair.style.top = `${(1 - l) * 100}%`;
	}

	private updateFromHsl(): void {
		this.currentColor = hslToHex(
			this.currentHsl[0],
			this.currentHsl[1],
			this.currentHsl[2],
		);
		if (this.hexInput) {
			this.hexInput.value = this.currentColor;
			this.hexInput.removeClass("is-invalid");
		}
		this.updatePreview();
		this.options.onChange(this.currentColor);
	}

	private updatePreview(): void {
		this.previewSwatch?.style.setProperty(
			"--swatch-color",
			this.currentColor,
		);
		// Update selected state on swatches
		const swatches = this.popoverEl?.querySelectorAll(".osmosis-cp-swatch");
		if (swatches) {
			for (let i = 0; i < swatches.length; i++) {
				const el = swatches[i] as HTMLElement;
				const swatchColor = getComputedStyle(el)
					.getPropertyValue("--swatch-color")
					.trim();
				el.toggleClass(
					"is-selected",
					swatchColor.toLowerCase() === this.currentColor,
				);
			}
		}
	}

	private selectColor(color: string): void {
		this.currentColor = normalizeHex(color);
		this.currentHsl = hexToHsl(this.currentColor);

		if (this.hexInput) {
			this.hexInput.value = this.currentColor;
			this.hexInput.removeClass("is-invalid");
		}
		if (this.hueSlider) {
			this.hueSlider.value = String(Math.round(this.currentHsl[0]));
		}
		this.drawSatLightCanvas();
		this.updatePreview();
		if (this.satLightCanvas) {
			const crosshair = this.satLightCanvas.parentElement?.querySelector(
				".osmosis-cp-crosshair",
			);
			if (crosshair instanceof HTMLElement) {
				this.positionCrosshair(crosshair);
			}
		}
		this.options.onChange(this.currentColor);
	}
}
