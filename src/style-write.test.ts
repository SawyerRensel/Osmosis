import { describe, expect, it } from "vitest";
import { clearStyleOverride, combineStyleUpdates, mergeStyleOverride, writeStyleOverride } from "./style-write";

describe("mergeStyleOverride", () => {
	it("sets and deletes simple keys, keeping keys the update does not name", () => {
		expect(mergeStyleOverride({ fill: "#111", shape: "pill", width: 200 }, { fill: "#222", shape: undefined })).toEqual({ fill: "#222", width: 200 });
	});

	it("merges compound keys sub-key by sub-key and drops one left empty", () => {
		const existing = { text: { color: "#000", size: 14 }, border: { width: 2 } };
		expect(mergeStyleOverride(existing, { text: { size: 18 }, border: { width: undefined } })).toEqual({ text: { color: "#000", size: 18 } });
		expect(mergeStyleOverride(existing, { text: undefined })).toEqual({ border: { width: 2 } });
	});
});

describe("writeStyleOverride", () => {
	it("writes under the selector, migrating a legacy entry", () => {
		const fm: Record<string, unknown> = { "osmosis-styles": { styles: { "_n:abc": { fill: "#111" } } } };
		writeStyleOverride(fm, "^os-x1", "_n:abc", { text: { color: "#fff" } });
		expect(fm).toEqual({ "osmosis-styles": { styles: { "^os-x1": { fill: "#111", text: { color: "#fff" } } } } });
	});

	it("removes an emptied entry and the empty mapping", () => {
		const fm: Record<string, unknown> = { title: "Harbour", "osmosis-styles": { styles: { "^os-x1": { fill: "#111" } } } };
		writeStyleOverride(fm, "^os-x1", "_n:abc", { fill: undefined });
		expect(fm).toEqual({ title: "Harbour" });
	});

	it("keeps the rest of the mapping", () => {
		const fm: Record<string, unknown> = { "osmosis-styles": { theme: "Ocean" } };
		writeStyleOverride(fm, "^os-x1", "_n:abc", { fill: "#123" });
		expect(fm).toEqual({ "osmosis-styles": { theme: "Ocean", styles: { "^os-x1": { fill: "#123" } } } });
	});
});

describe("clearStyleOverride", () => {
	it("clears the named keys under every selector", () => {
		const fm: Record<string, unknown> = { "osmosis-styles": { styles: { "^os-x1": { fill: "#1", width: 90 }, "_n:abc": { fill: "#2" } } } };
		clearStyleOverride(fm, ["^os-x1", "_n:abc"], ["fill"]);
		expect(fm).toEqual({ "osmosis-styles": { styles: { "^os-x1": { width: 90 } } } });
	});

	it("clears everything without keys", () => {
		const fm: Record<string, unknown> = { "osmosis-styles": { styles: { "^os-x1": { fill: "#1" } } } };
		clearStyleOverride(fm, ["^os-x1"]);
		expect(fm).toEqual({});
	});
});

describe("combineStyleUpdates", () => {
	it("lets the later update win and merges compound keys", () => {
		expect(combineStyleUpdates({ fill: "#1", text: { color: "#a" } }, { fill: "#2", text: { size: 12 } })).toEqual({ fill: "#2", text: { color: "#a", size: 12 } });
	});

	it("keeps a deletion", () => {
		const combined = combineStyleUpdates({ fill: "#1" }, { fill: undefined });
		expect("fill" in combined).toBe(true);
		expect(combined.fill).toBeUndefined();
	});
});
