/**
 * Font family picker component for Osmosis mind map styling.
 *
 * - Desktop (Electron): uses queryLocalFonts() to enumerate system fonts
 * - Mobile / fallback: curated list of common web-safe fonts
 * - Discovers WOFF2 files in .obsidian/plugins/Osmosis/fonts/
 * - Uses document.fonts.check() to detect availability
 *
 * Usage:
 *   const picker = new FontPicker({ app, plugin, initialFont, onChange });
 *   picker.render(containerEl);
 */

import { Platform } from "obsidian";
import type { App } from "obsidian";
import type OsmosisPlugin from "../main";

// ─── Curated Font List (mobile / fallback) ─────────────────────────────────

const CURATED_FONTS = [
	"Inter",
	"system-ui",
	"Arial",
	"Helvetica",
	"Verdana",
	"Tahoma",
	"Trebuchet MS",
	"Georgia",
	"Times New Roman",
	"Palatino",
	"Garamond",
	"Courier New",
	"Lucida Console",
	"Monaco",
	"Segoe UI",
	"Roboto",
	"SF Pro",
	"Menlo",
	"Consolas",
];

// ─── Font Discovery ────────────────────────────────────────────────────────

interface FontInfo {
	family: string;
	available: boolean;
	source: "system" | "curated" | "custom";
}

/** Query system fonts via the Local Font Access API (Electron desktop only). */
async function querySystemFonts(): Promise<string[]> {
	// queryLocalFonts is only available in secure contexts (Electron desktop)
	if (
		Platform.isMobile ||
		typeof window === "undefined" ||
		!("queryLocalFonts" in window)
	) {
		return [];
	}

	try {
		const queryFn = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts;
		if (!queryFn) return [];
		const fonts = await queryFn();
		const families = new Set<string>();
		for (const font of fonts) {
			families.add(font.family);
		}
		return [...families].sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: "base" }),
		);
	} catch {
		// Permission denied or API unavailable
		return [];
	}
}

/** Discover WOFF2 files in .obsidian/plugins/Osmosis/fonts/. */
async function discoverCustomFonts(app: App): Promise<string[]> {
	const fontsDir = `${app.vault.configDir}/plugins/Osmosis/fonts`;

	try {
		const adapter = app.vault.adapter;
		const exists = await adapter.exists(fontsDir);
		if (!exists) return [];

		const listing = await adapter.list(fontsDir);
		const woff2Files = listing.files.filter((f: string) =>
			f.toLowerCase().endsWith(".woff2"),
		);

		const families: string[] = [];
		for (const filePath of woff2Files) {
			const fileName = filePath.split("/").pop() ?? "";
			// Derive font family name from filename (strip extension, replace dashes)
			const family = fileName
				.replace(/\.woff2$/i, "")
				.replace(/[-_]/g, " ")
				.replace(/\b\w/g, (c) => c.toUpperCase());
			families.push(family);

			// Inject @font-face rule
			await injectFontFace(app, family, filePath);
		}

		return families;
	} catch {
		return [];
	}
}

/** Track which fonts we've already loaded to avoid duplicates. */
const loadedFontFamilies = new Set<string>();

/** Load a WOFF2 file via the FontFace API. */
async function injectFontFace(
	app: App,
	family: string,
	filePath: string,
): Promise<void> {
	if (loadedFontFamilies.has(family)) return;

	try {
		const adapter = app.vault.adapter;
		const data = await adapter.readBinary(filePath);
		const font = new FontFace(family, data);
		await font.load();
		// FontFaceSet.add exists in all browsers but is missing from older TS lib types
		(document.fonts as unknown as { add(font: FontFace): void }).add(font);
		loadedFontFamilies.add(family);
	} catch {
		// Silently ignore font loading failures
	}
}


/** Check if a font family is available on the current device. */
function isFontAvailable(family: string): boolean {
	try {
		return document.fonts.check(`12px "${family}"`);
	} catch {
		return false;
	}
}

/** Build a CSS font-family fallback chain. */
export function buildFontFamilyChain(userChoice: string): string {
	if (!userChoice || userChoice === "system-ui") {
		return "system-ui, sans-serif";
	}
	return `'${userChoice}', 'Inter', sans-serif`;
}

// ─── Font Picker Component ─────────────────────────────────────────────────

export interface FontPickerOptions {
	app: App;
	plugin: OsmosisPlugin;
	initialFont: string;
	onChange: (font: string) => void;
}

export class FontPicker {
	private options: FontPickerOptions;
	private fonts: FontInfo[] = [];
	private loaded = false;
	private dropdownEl: HTMLSelectElement | null = null;
	private containerEl: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private listEl: HTMLElement | null = null;
	private popoverEl: HTMLElement | null = null;
	private currentFont: string;
	private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

	constructor(options: FontPickerOptions) {
		this.options = options;
		this.currentFont = options.initialFont || "";
	}

	/** Render the font picker into the given container. */
	async render(container: HTMLElement): Promise<void> {
		this.containerEl = container;
		await this.loadFonts();

		const wrapper = container.createDiv({ cls: "osmosis-font-picker" });

		// Display button showing current font
		const btn = wrapper.createEl("button", {
			cls: "osmosis-fp-trigger",
		});
		this.updateTriggerButton(btn);

		btn.addEventListener("click", () => {
			if (this.popoverEl) {
				this.closePopover();
			} else {
				this.openPopover(btn);
			}
		});
	}

	private async loadFonts(): Promise<void> {
		if (this.loaded) return;

		const fontMap = new Map<string, FontInfo>();

		// 1. System fonts (desktop only)
		const systemFonts = await querySystemFonts();
		for (const family of systemFonts) {
			fontMap.set(family.toLowerCase(), {
				family,
				available: true,
				source: "system",
			});
		}

		// 2. Curated fonts (always included)
		for (const family of CURATED_FONTS) {
			const key = family.toLowerCase();
			if (!fontMap.has(key)) {
				fontMap.set(key, {
					family,
					available: isFontAvailable(family),
					source: "curated",
				});
			}
		}

		// 3. Custom WOFF2 fonts
		const customFonts = await discoverCustomFonts(this.options.app);
		for (const family of customFonts) {
			const key = family.toLowerCase();
			fontMap.set(key, {
				family,
				available: true, // We just injected the @font-face
				source: "custom",
			});
		}

		this.fonts = [...fontMap.values()].sort((a, b) =>
			a.family.localeCompare(b.family, undefined, { sensitivity: "base" }),
		);
		this.loaded = true;
	}

	private updateTriggerButton(btn: HTMLElement): void {
		btn.empty();
		const label = this.currentFont || "Default";
		btn.createSpan({ text: label, cls: "osmosis-fp-label" });

		if (this.currentFont && !isFontAvailable(this.currentFont)) {
			btn.createSpan({
				text: " (fallback)",
				cls: "osmosis-fp-fallback-badge",
			});
		}
	}

	// ─── Popover ─────────────────────────────────────────────

	private openPopover(anchor: HTMLElement): void {
		this.closePopover();

		const popover = document.body.createDiv({
			cls: "osmosis-font-popover",
		});
		this.popoverEl = popover;

		// Position below anchor, clamped to stay within viewport
		const rect = anchor.getBoundingClientRect();
		const popoverWidth = Math.max(rect.width, 200);
		const left = Math.min(rect.left, window.innerWidth - popoverWidth - 8);
		popover.style.setProperty("--fp-top", `${rect.bottom + 4}px`);
		popover.style.setProperty("--fp-left", `${Math.max(8, left)}px`);
		popover.style.setProperty(
			"--fp-width",
			`${popoverWidth}px`,
		);

		// Search input
		const search = popover.createEl("input", {
			cls: "osmosis-fp-search",
			type: "text",
			placeholder: "Search fonts...",
		});
		search.setAttribute("spellcheck", "false");
		this.searchInput = search;

		// Font list
		const list = popover.createDiv({ cls: "osmosis-fp-list" });
		this.listEl = list;

		this.renderFontList("");

		search.addEventListener("input", () => {
			this.renderFontList(search.value.trim().toLowerCase());
		});

		// Focus search
		search.focus();

		// Close on outside click
		this.outsideClickHandler = (e: MouseEvent) => {
			if (
				this.popoverEl &&
				!this.popoverEl.contains(e.target as Node) &&
				!anchor.contains(e.target as Node)
			) {
				this.closePopover();
			}
		};
		setTimeout(() => {
			document.addEventListener("mousedown", this.outsideClickHandler!);
		}, 0);
	}

	private closePopover(): void {
		if (this.outsideClickHandler) {
			document.removeEventListener("mousedown", this.outsideClickHandler);
			this.outsideClickHandler = null;
		}
		this.popoverEl?.remove();
		this.popoverEl = null;
		this.listEl = null;
		this.searchInput = null;
	}

	private renderFontList(filter: string): void {
		const list = this.listEl;
		if (!list) return;
		list.empty();

		// "Default" option (clear font)
		const defaultItem = list.createDiv({ cls: "osmosis-fp-item" });
		defaultItem.createSpan({ text: "Default (inherit)" });
		if (!this.currentFont) {
			defaultItem.addClass("is-selected");
		}
		defaultItem.addEventListener("click", () => {
			this.selectFont("");
		});

		// Group: Custom fonts first, then system/curated
		const customFonts = this.fonts.filter((f) => f.source === "custom");
		const otherFonts = this.fonts.filter((f) => f.source !== "custom");

		const renderGroup = (
			fonts: FontInfo[],
			label: string | null,
		): void => {
			const filtered = filter
				? fonts.filter((f) =>
						f.family.toLowerCase().includes(filter),
					)
				: fonts;

			if (filtered.length === 0) return;

			if (label) {
				list.createDiv({
					cls: "osmosis-fp-group-label",
					text: label,
				});
			}

			for (const font of filtered) {
				const item = list.createDiv({ cls: "osmosis-fp-item" });
				const nameSpan = item.createSpan({
					text: font.family,
				});
				// Preview the font in its own typeface
				nameSpan.style.fontFamily = `'${font.family}', sans-serif`;

				if (!font.available) {
					item.createSpan({
						text: " (unavailable)",
						cls: "osmosis-fp-unavailable",
					});
				}

				if (font.family === this.currentFont) {
					item.addClass("is-selected");
				}

				item.addEventListener("click", () => {
					this.selectFont(font.family);
				});
			}
		};

		if (customFonts.length > 0) {
			renderGroup(customFonts, "Custom fonts");
		}
		renderGroup(otherFonts, customFonts.length > 0 ? "System fonts" : null);
	}

	private selectFont(family: string): void {
		this.currentFont = family;
		this.options.onChange(family);
		this.closePopover();

		// Update the trigger button
		const btn = this.containerEl?.querySelector(".osmosis-fp-trigger");
		if (btn instanceof HTMLElement) {
			this.updateTriggerButton(btn);
		}
	}

	/** Update the displayed font without triggering onChange. */
	setFont(family: string): void {
		this.currentFont = family;
		const btn = this.containerEl?.querySelector(".osmosis-fp-trigger");
		if (btn instanceof HTMLElement) {
			this.updateTriggerButton(btn);
		}
	}
}
