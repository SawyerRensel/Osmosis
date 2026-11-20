/**
 * Style-sidebar color picker, built on Pickr (`@simonwep/pickr`, nano theme).
 *
 * One instance is one picker session: it opens on construction, anchored to the
 * swatch that was clicked, and is destroyed for good by `close()` — or when
 * Pickr hides itself (outside click/tap, Escape). Reopening creates a fresh one,
 * so nothing outlives the popup.
 *
 * The swatch row holds the active theme's colors, then the user's custom
 * palette on a row of its own. Pickr's Save button is relabeled "Add to
 * palette": picks already apply live through `onChange`, so the button's only
 * job is to append the current color to the custom palette. Right-click a
 * custom swatch to remove it.
 *
 * Pickr's CSS (nano theme) is vendored into `styles.css`, because Obsidian
 * plugins ship a single stylesheet and may not inject `<style>` elements.
 */

import Pickr from "@simonwep/pickr";
import { rgbToHex } from "../color-palette";

export interface PickrColorPickerOptions {
	/** The swatch the popup anchors to. */
	anchor: HTMLElement;
	/** The stored color to open on. Falls back to `fallbackColor` if Pickr can't parse it. */
	initialColor: string;
	fallbackColor: string;
	themeColors: string[];
	/** The settings array itself; it is mutated in place when the user adds or removes a color. */
	customColors: string[];
	/** Persist `customColors` after a change. */
	saveCustomColors: () => void;
	/** Called on every live change with a lowercase `#rrggbb` color. */
	onChange: (color: string) => void;
	/** Called once, when the session ends. */
	onClose: () => void;
}

/** The parts of Pickr's `getRoot()` this wrapper uses (typed `object` upstream). */
interface PickrRoot {
	app: HTMLElement;
	swatches: HTMLElement;
}

interface SwatchEntry {
	color: string;
	custom: boolean;
}

/** Marks the first custom swatch so CSS can start it on a new row. */
const CUSTOM_START_CLS = "osmosis-pickr-custom-start";

export class PickrColorPicker {
	readonly anchor: HTMLElement;
	private readonly options: PickrColorPickerOptions;
	private readonly pickr: Pickr;
	private readonly root: PickrRoot;
	/** Parallel to the swatch buttons, in DOM order (addSwatch skips colors it can't parse). */
	private readonly swatches: SwatchEntry[] = [];
	private initialized = false;
	private closed = false;

	constructor(options: PickrColorPickerOptions) {
		this.options = options;
		this.anchor = options.anchor;

		this.pickr = Pickr.create({
			el: options.anchor,
			useAsButton: true,
			theme: "nano",
			appClass: "osmosis-pickr",
			default: options.initialColor || options.fallbackColor,
			defaultRepresentation: "HEXA",
			position: "bottom-end",
			lockOpacity: true,
			components: {
				preview: true,
				hue: true,
				opacity: false,
				interaction: { input: true, save: true },
			},
			i18n: {
				"btn:save": "Add to palette",
				"aria:btn:save": "Add the current color to the custom palette",
			},
		});
		this.root = this.pickr.getRoot() as PickrRoot;

		for (const color of options.themeColors) this.addSwatch(color, false);
		for (const color of options.customColors) this.addSwatch(color, true);
		this.markCustomStart();

		this.pickr.on("init", () => this.handleInit());
		this.pickr.on("change", (color: Pickr.HSVaColor | null) => {
			if (!color || this.closed) return;
			const [r = 0, g = 0, b = 0] = color.toRGBA();
			options.onChange(rgbToHex(r, g, b));
		});
		this.pickr.on("save", (color: Pickr.HSVaColor | null) => {
			if (color) this.addCustomColor(color);
		});
		this.pickr.on("hide", () => this.close());

		this.root.swatches.addEventListener("contextmenu", this.handleContextMenu);
		// Keep presses inside the popup from reaching document-level handlers
		// (the mind map's own selection logic). Pickr's handlers sit on the
		// elements inside the popup, so they have already run.
		for (const type of ["mousedown", "touchstart", "pointerdown"]) {
			this.root.app.addEventListener(type, stopPropagation);
		}

		this.pickr.show();
	}

	/** End the session: hide, report `onClose`, and destroy Pickr's DOM and listeners. */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.pickr.hide();
		this.root.swatches.removeEventListener("contextmenu", this.handleContextMenu);
		for (const type of ["mousedown", "touchstart", "pointerdown"]) {
			this.root.app.removeEventListener(type, stopPropagation);
		}
		this.options.onClose();
		// Pickr's setup loop re-requests animation frames until its popup has a
		// width; destroying before that first frame would leave it spinning on a
		// detached element. So before init, defer the destroy to handleInit.
		if (this.initialized) this.pickr.destroyAndRemove();
	}

	private handleInit(): void {
		this.initialized = true;
		if (this.closed) {
			this.pickr.destroyAndRemove();
			return;
		}
		// `default` failed to parse (an empty or non-color value): open on the fallback.
		if (!this.pickr.setColor(this.options.initialColor, true)) {
			this.pickr.setColor(this.options.fallbackColor, true);
		}
	}

	private addSwatch(color: string, custom: boolean): void {
		if (!this.pickr.addSwatch(color)) return;
		this.swatches.push({ color, custom });
		const button = this.root.swatches.lastElementChild;
		button?.setAttribute("title", custom ? `${color} (right-click to remove)` : color);
	}

	private addCustomColor(color: Pickr.HSVaColor): void {
		const [r = 0, g = 0, b = 0] = color.toRGBA();
		const hex = rgbToHex(r, g, b);
		const custom = this.options.customColors;
		if (custom.includes(hex)) return;
		custom.push(hex);
		this.options.saveCustomColors();
		this.addSwatch(hex, true);
		this.markCustomStart();
	}

	private readonly handleContextMenu = (e: MouseEvent): void => {
		const buttons = Array.from(this.root.swatches.children);
		const index = buttons.findIndex((b) => b === e.target || b.contains(e.target as Node));
		const entry = this.swatches[index];
		if (!entry?.custom) return;
		e.preventDefault();

		const custom = this.options.customColors;
		const at = custom.indexOf(entry.color);
		if (at >= 0) {
			custom.splice(at, 1);
			this.options.saveCustomColors();
		}
		this.pickr.removeSwatch(index);
		this.swatches.splice(index, 1);
		this.markCustomStart();
	};

	private markCustomStart(): void {
		const first = this.swatches.findIndex((s) => s.custom);
		Array.from(this.root.swatches.children).forEach((button, i) => {
			button.toggleClass(CUSTOM_START_CLS, i === first);
		});
	}
}

function stopPropagation(e: Event): void {
	e.stopPropagation();
}
