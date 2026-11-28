import { describe, expect, it } from "vitest";
import { DEFAULT_OVERLAYS, OVERLAY_EDGE_KINDS } from "./overlays";
import { SETTINGS_SECTIONS, controlShown, normalizeCollapsed, toggleCollapsed, type SettingsControl } from "./settings-sections";

const placed = SETTINGS_SECTIONS.flatMap((section) => section.controls);

describe("SETTINGS_SECTIONS", () => {
	it("places every overlay setting exactly once, edges one toggle per kind", () => {
		const overlayControls: SettingsControl[] = [
			...(Object.keys(DEFAULT_OVERLAYS).filter((key) => key !== "edges") as SettingsControl[]),
			...OVERLAY_EDGE_KINDS.map((kind): SettingsControl => `edge:${kind}`),
		];
		for (const control of overlayControls) expect(placed.filter((c) => c === control)).toHaveLength(1);
		expect(new Set(placed).size).toBe(placed.length);
	});

	it("keeps the view and device settings the Overlays menu had", () => {
		for (const control of ["depth", "backlinks", "clickSelectsOnly", "panelDetail", "livePanels"] as const) expect(placed).toContain(control);
	});

	it("puts Layout first, with plain section names", () => {
		expect(SETTINGS_SECTIONS[0]?.controls[0]).toBe("layout");
		expect(SETTINGS_SECTIONS.map((section) => section.name)).toEqual(["Layout & spacing", "Show", "Edges", "Camera", "Look"]);
	});
});

describe("controlShown", () => {
	it("shows the continent controls in Planets only, Balance only with sides", () => {
		for (const control of ["continentSpacing", "continentDirection", "continentBalance"] as const) {
			expect(controlShown(control, { layout: "planets", continentDirection: "top-down" })).toBe(true);
			expect(controlShown(control, { layout: "organic", continentDirection: "top-down" })).toBe(false);
		}
		expect(controlShown("continentBalance", { layout: "planets", continentDirection: "radial" })).toBe(false);
		expect(controlShown("continentDirection", { layout: "planets", continentDirection: "radial" })).toBe(true);
	});

	it("shows every other control in every layout", () => {
		for (const layout of ["organic", "planets"] as const) {
			for (const control of ["noteSpacing", "nodeSpacing", "forceBalance", "linksPull", "mist"] as const) expect(controlShown(control, { layout, continentDirection: "radial" })).toBe(true);
		}
	});
});

describe("collapse state", () => {
	it("keeps known section IDs once, dropping anything else", () => {
		expect(normalizeCollapsed(["edges", "look", "edges", "forces", 3, null])).toEqual(["edges", "look"]);
		expect(normalizeCollapsed(undefined)).toEqual([]);
		expect(normalizeCollapsed("edges")).toEqual([]);
	});

	it("collapses and opens a section", () => {
		expect(toggleCollapsed(["edges"], "look", true)).toEqual(["edges", "look"]);
		expect(toggleCollapsed(["edges", "look"], "edges", false)).toEqual(["look"]);
		expect(toggleCollapsed(["edges"], "edges", true)).toEqual(["edges"]);
	});
});
