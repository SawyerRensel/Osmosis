import { beforeEach, describe, expect, it } from "vitest";
import { ParseCache } from "./cache";
import type { OsmosisNode } from "./types";
import { subtreeEnd } from "./mindmap-edit";
import { clipboardItem, copyStyleOf, fillClipboard, nodeClipboard, pasteInto, pasteMigrates, spendCut, stylePasteOverrides } from "./node-clipboard";

const cache = new ParseCache();
const rootOf = (path: string, content: string): OsmosisNode => cache.get(path, content).root;
const find = (node: OsmosisNode, content: string): OsmosisNode | null => {
	if (node.content === content) return node;
	for (const child of node.children) {
		const hit = find(child, content);
		if (hit !== null) return hit;
	}
	return null;
};

/** What either view does on Copy: one item per picked line, carrying its subtree's bytes. */
function copyLines(path: string, text: string, contents: string[], isCut: boolean): void {
	const root = rootOf(path, text);
	const items = contents.map((content) => {
		const line = find(root, content)!;
		return clipboardItem(line, text.slice(line.range.start, subtreeEnd(line)));
	});
	fillClipboard(items, isCut, path);
}

const SOURCE = "# Harbour\n\n- Moorings ^os-aaaaaaaa\n\t- Winter berths\n- Fuel dock\n";
const DEST = "# Marina\n\n- Slips\n";

beforeEach(() => {
	fillClipboard([], false, null);
});

describe("the shared node clipboard", () => {
	it("keeps a copy's subtree and pastes it under the target in another note, with fresh identity", () => {
		copyLines("harbour.md", SOURCE, ["Moorings"], false);
		expect(nodeClipboard.text).toContain("Winter berths");
		const dest = rootOf("marina.md", DEST);
		const out = pasteInto(DEST, find(dest, "Slips")!);
		expect(out).toBe("# Marina\n\n- Slips\n\t- Moorings\n\t\t- Winter berths\n");
		expect(out).not.toContain("^os-");
	});

	it("keeps a cut's block IDs, and reports it as a move into another note", () => {
		copyLines("harbour.md", SOURCE, ["Moorings"], true);
		const out = pasteInto(DEST, find(rootOf("marina.md", DEST), "Slips")!);
		expect(out).toContain("^os-aaaaaaaa");
		expect(pasteMigrates("marina.md")).toBe(true);
		expect(pasteMigrates("harbour.md")).toBe(false);
		spendCut();
		expect(pasteMigrates("marina.md")).toBe(false);
	});

	it("re-levels each item against the target on its own", () => {
		copyLines("harbour.md", SOURCE, ["Moorings", "Fuel dock"], false);
		const out = pasteInto("# Marina\n\n## Piers\n", find(rootOf("marina.md", "# Marina\n\n## Piers\n"), "Piers")!);
		expect(out).toContain("- Moorings\n\t- Winter berths\n- Fuel dock");
	});

	it("pastes nothing identity-bearing for text from outside Osmosis", () => {
		fillClipboard([{ type: "bullet", depth: 0, content: "Ext ^os-bbbbbbbb", text: "- Ext ^os-bbbbbbbb" }], false, null);
		expect(pasteInto(DEST, find(rootOf("marina.md", DEST), "Slips")!)).toContain("^os-bbbbbbbb");
		expect(pasteMigrates("marina.md")).toBe(false);
	});
});

describe("the shared style clipboard", () => {
	it("has nothing to paste until a style is copied", () => {
		fillClipboard([], false, null);
		copyStyleOf({ fill: { color: "#abc" } } as never);
		expect(stylePasteOverrides(["a"])).not.toBeNull();
	});

	it("replaces the target's visual keys, carrying the class by name", () => {
		copyStyleOf({ class: "warning", fill: { color: "#abc" } } as never);
		expect(nodeClipboard.style).not.toHaveProperty("class");
		const overrides = stylePasteOverrides(["a", "b"])!;
		expect([...overrides.keys()]).toEqual(["a", "b"]);
		const a = overrides.get("a") as Record<string, unknown>;
		expect(a["class"]).toBe("warning");
		expect(a["fill"]).toEqual({ color: "#abc" });
		// A key the source lacked is present and undefined: that clears it on the target.
		expect("border" in a && a["border"] === undefined).toBe(true);
		// Pasted values are copies, not shared references.
		expect(overrides.get("b")?.fill).not.toBe(a["fill"]);
	});
});
