import { describe, it, expect } from "vitest";
import {
	blocksInRange,
	computeRevealOrder,
	listItemIdsInRange,
	nextToReveal,
	type BlockRef,
	type ListItemRef,
} from "./line-reveal";

const block = (id: string, startLine: number, endLine = startLine): BlockRef => ({
	id,
	startLine,
	endLine,
});

describe("computeRevealOrder", () => {
	it("sorts line-card blocks by source position", () => {
		const blocks = [block("os-c3", 9), block("os-a1", 2), block("os-b2", 5)];
		const ids = new Set(["os-a1", "os-b2", "os-c3"]);
		expect(computeRevealOrder(blocks, ids)).toEqual(["os-a1", "os-b2", "os-c3"]);
	});

	it("excludes blocks that are not line cards (user block IDs on untagged lines)", () => {
		const blocks = [block("os-a1", 2), block("user-ref", 4), block("os-b2", 6)];
		const ids = new Set(["os-a1", "os-b2"]);
		expect(computeRevealOrder(blocks, ids)).toEqual(["os-a1", "os-b2"]);
	});

	it("returns empty order for a note with no line cards", () => {
		expect(computeRevealOrder([block("user-ref", 1)], new Set())).toEqual([]);
	});
});

describe("nextToReveal", () => {
	const order = ["os-a1", "os-b2", "os-c3"];

	it("returns the first card when nothing is revealed", () => {
		expect(nextToReveal(order, new Set())).toBe("os-a1");
	});

	it("returns the first unrevealed card in order", () => {
		expect(nextToReveal(order, new Set(["os-a1"]))).toBe("os-b2");
	});

	it("skips over revealed cards even out of order", () => {
		// Casual peeks before study start can reveal out of order
		expect(nextToReveal(order, new Set(["os-b2"]))).toBe("os-a1");
	});

	it("returns null when everything is revealed", () => {
		expect(nextToReveal(order, new Set(order))).toBeNull();
	});

	it("returns null for an empty order", () => {
		expect(nextToReveal([], new Set())).toBeNull();
	});
});

describe("blocksInRange", () => {
	const ids = new Set(["os-a1", "os-b2", "os-c3"]);

	it("returns blocks whose line falls inside the section range", () => {
		const blocks = [block("os-a1", 2), block("os-b2", 7), block("os-c3", 12)];
		expect(blocksInRange(blocks, ids, 5, 9).map((b) => b.id)).toEqual(["os-b2"]);
	});

	it("matches a multi-line block (table/code) that spans into the range", () => {
		// Standalone ^id after a table: the block span covers the table lines
		const blocks = [block("os-a1", 3, 8)];
		expect(blocksInRange(blocks, ids, 6, 10).map((b) => b.id)).toEqual(["os-a1"]);
		expect(blocksInRange(blocks, ids, 0, 3).map((b) => b.id)).toEqual(["os-a1"]);
		expect(blocksInRange(blocks, ids, 9, 12)).toEqual([]);
	});

	it("ignores non-line-card block IDs in range", () => {
		const blocks = [block("user-ref", 4)];
		expect(blocksInRange(blocks, ids, 0, 10)).toEqual([]);
	});

	it("sorts results by source position", () => {
		const blocks = [block("os-c3", 8), block("os-a1", 4)];
		expect(blocksInRange(blocks, ids, 0, 10).map((b) => b.id)).toEqual(["os-a1", "os-c3"]);
	});
});

describe("listItemIdsInRange", () => {
	const item = (startLine: number, id?: string): ListItemRef => ({ startLine, ...(id !== undefined ? { id } : {}) });

	it("aligns items with li document order, keeping untagged gaps", () => {
		const items = [item(2, "os-a1"), item(3), item(4, "os-b2")];
		expect(listItemIdsInRange(items, 2, 4)).toEqual(["os-a1", undefined, "os-b2"]);
	});

	it("filters to the section's line range (chunked list rendering)", () => {
		const items = [item(2, "os-a1"), item(5, "os-b2"), item(9, "os-c3")];
		expect(listItemIdsInRange(items, 4, 7)).toEqual(["os-b2"]);
	});

	it("keeps nested items in pre-order (source order)", () => {
		// Parent at line 2, its child at 3, next sibling at 4 — matches
		// querySelectorAll("li") document order.
		const items = [item(4, "os-c3"), item(2, "os-a1"), item(3, "os-b2")];
		expect(listItemIdsInRange(items, 2, 4)).toEqual(["os-a1", "os-b2", "os-c3"]);
	});

	it("returns empty for a section with no list items", () => {
		expect(listItemIdsInRange([], 0, 10)).toEqual([]);
	});
});
