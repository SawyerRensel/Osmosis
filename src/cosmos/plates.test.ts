import { describe, it, expect } from "vitest";
import { GlyphPacker, PLATE_HEIGHT_EM, PLATE_PAD_X_EM, PLATE_TEXTURE_WIDTH, ShapeCache, drainWithin, layoutPlate, plateTextureRows, shapeKey } from "./plates";

/** A monospace-ish font for tests: every character 10 px wide, "W" 20, the ellipsis 6. */
const advance = (char: string) => (char === "W" ? 20 : char === "…" ? 6 : 10);
const FONT = 40;

describe("layoutPlate", () => {
	it("keeps a plate at least minWidth wide, its text centred", () => {
		const plate = layoutPlate("abc", advance, FONT, Infinity, 500);
		expect(plate.width).toBe(500);
		expect(plate.glyphs.map((g) => g.x)).toEqual([-15, -5, 5]);
		expect(layoutPlate("abc", advance, FONT, Infinity, 5).width).toBe(30 + 2 * PLATE_PAD_X_EM * FONT);
	});

	it("places each glyph at its pen position, centred on the plate", () => {
		const plate = layoutPlate("abc", advance, FONT, Infinity);
		// 30 px of text: pens at -15, -5, 5.
		expect(plate.glyphs.map((g) => [g.char, g.x])).toEqual([["a", -15], ["b", -5], ["c", 5]]);
	});

	it("advances by each character's own width", () => {
		const plate = layoutPlate("aWa", advance, FONT, Infinity);
		expect(plate.glyphs.map((g) => g.x)).toEqual([-20, -10, 10]);
	});

	it("sizes the plate from the text, with padding, and its height from the font", () => {
		const plate = layoutPlate("aWa", advance, FONT, Infinity);
		expect(plate.width).toBe(40 + 2 * PLATE_PAD_X_EM * FONT);
		expect(plate.height).toBe(PLATE_HEIGHT_EM * FONT);
	});

	it("advances over spaces without drawing them", () => {
		const plate = layoutPlate("a b", advance, FONT, Infinity);
		expect(plate.glyphs.map((g) => [g.char, g.x])).toEqual([["a", -15], ["b", 5]]);
	});

	it("treats a surrogate pair as one character", () => {
		const plate = layoutPlate("a\u{1F600}", advance, FONT, Infinity);
		expect(plate.glyphs.map((g) => g.char)).toEqual(["a", "\u{1F600}"]);
	});

	it("truncates text wider than the limit with an ellipsis", () => {
		// 7 characters is 70 px; at most 50 px fits four characters and the ellipsis (46 px).
		const plate = layoutPlate("abcdefg", advance, FONT, 50);
		expect(plate.glyphs.map((g) => g.char).join("")).toBe("abcd…");
		expect(plate.width).toBe(46 + 2 * PLATE_PAD_X_EM * FONT);
	});

	it("drops trailing spaces before the ellipsis", () => {
		const plate = layoutPlate("abc defg", advance, FONT, 50);
		expect(plate.glyphs.map((g) => g.char).join("")).toBe("abc…");
	});

	it("leaves text that fits alone", () => {
		expect(layoutPlate("abcde", advance, FONT, 50).glyphs).toHaveLength(5);
	});

	it("gives empty text a plate of padding only", () => {
		const plate = layoutPlate("", advance, FONT, Infinity);
		expect(plate.glyphs).toEqual([]);
		expect(plate.width).toBe(2 * PLATE_PAD_X_EM * FONT);
	});
});

describe("GlyphPacker", () => {
	const overlaps = (a: { page: number; x: number; y: number; width: number; height: number }, b: typeof a) =>
		a.page === b.page && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

	it("packs slots along a row, then starts the next row", () => {
		const packer = new GlyphPacker(100, 20);
		expect(packer.slot("a", 40)).toMatchObject({ page: 0, x: 0, y: 0, width: 40, height: 20, fresh: true });
		expect(packer.slot("b", 40)).toMatchObject({ page: 0, x: 40, y: 0 });
		expect(packer.slot("c", 40)).toMatchObject({ page: 0, x: 0, y: 20 });
	});

	it("reuses a character's slot instead of packing it again", () => {
		const packer = new GlyphPacker(100, 20);
		const first = packer.slot("a", 40);
		const again = packer.slot("a", 40);
		expect(again).toMatchObject({ page: first.page, x: first.x, y: first.y, fresh: false });
		expect(packer.slot("b", 40).x).toBe(40);
	});

	it("starts a new page when one is full", () => {
		const packer = new GlyphPacker(100, 50);
		// Two rows of two per page.
		const slots = ["a", "b", "c", "d", "e"].map((char) => packer.slot(char, 50));
		expect(slots.map((s) => s.page)).toEqual([0, 0, 0, 0, 1]);
		expect(slots[4]).toMatchObject({ x: 0, y: 0 });
		expect(packer.pages).toBe(2);
	});

	it("never overlaps two slots", () => {
		const packer = new GlyphPacker(128, 16);
		const slots = Array.from({ length: 300 }, (_, i) => packer.slot(String.fromCharCode(33 + i), 7 + ((i * 13) % 30)));
		for (const s of slots) {
			expect(s.x + s.width).toBeLessThanOrEqual(128);
			expect(s.y + s.height).toBeLessThanOrEqual(128);
		}
		for (let i = 0; i < slots.length; i++) {
			for (let j = i + 1; j < slots.length; j++) expect(overlaps(slots[i]!, slots[j]!)).toBe(false);
		}
	});

	it("clamps a slot wider than the page to the page", () => {
		const packer = new GlyphPacker(100, 20);
		expect(packer.slot("x", 300)).toMatchObject({ x: 0, width: 100 });
	});
});

describe("plate layout cache and slicing (T78)", () => {
	it("keys a layout by its text and every size it was laid out at", () => {
		expect(shapeKey("Mooring", 5, 20, 0)).toBe(shapeKey("Mooring", 5, 20, 0));
		expect(shapeKey("Mooring", 5, 20, 0)).not.toBe(shapeKey("Mooring", 12, 20, 0));
		expect(shapeKey("Mooring", 5, 20, 0)).not.toBe(shapeKey("Mooring", 5, 30, 0));
		expect(shapeKey("Mooring", 5, 20, 0)).not.toBe(shapeKey("Mooring", 5, 20, 8));
		expect(shapeKey("a|b", 5, 20, 0)).not.toBe(shapeKey("b", 5, 20, 0));
		expect(shapeKey("Mooring", 5, 20, 0)).toBe(shapeKey("Mooring", 5, 20, 0, "rounded-rect"));
		expect(shapeKey("Mooring", 5, 20, 0, "diamond")).not.toBe(shapeKey("Mooring", 5, 20, 0));
	});

	it("keeps every cached layout until the cache outgrows its limit, then only the live ones", () => {
		const cache = new ShapeCache<{ name: string }>();
		const [jib, boom, mast] = [{ name: "jib" }, { name: "boom" }, { name: "mast" }];
		cache.set("jib", jib);
		cache.set("boom", boom);
		cache.set("mast", mast);
		cache.trim([jib], 3);
		expect(cache.size).toBe(3);
		cache.trim([jib], 2);
		expect(cache.size).toBe(1);
		expect(cache.get("jib")).toBe(jib);
		expect(cache.get("boom")).toBeUndefined();
	});

	it("drains a queue a time budget at a time, always moving at least one item", () => {
		let now = 0;
		const done: number[] = [];
		const run = (item: number): void => {
			done.push(item);
			now += item;
		};
		const items = [1, 1, 1, 5, 1, 1];
		let at = drainWithin(items, 0, run, 3, () => now);
		expect(at).toBe(3);
		at = drainWithin(items, at, run, 3, () => now);
		expect(at).toBe(4);
		at = drainWithin(items, at, run, 3, () => now);
		expect(at).toBe(6);
		expect(done).toEqual(items);
		expect(drainWithin(items, 6, run, 3, () => now)).toBe(6);
	});

	it("sizes the plate-centre texture in whole rows", () => {
		expect(plateTextureRows(0)).toBe(1);
		expect(plateTextureRows(PLATE_TEXTURE_WIDTH)).toBe(1);
		expect(plateTextureRows(PLATE_TEXTURE_WIDTH + 1)).toBe(2);
		expect(plateTextureRows(30865)).toBe(Math.ceil(30865 / PLATE_TEXTURE_WIDTH));
	});
});

describe("plate alignment and faces (T131)", () => {
	const advance = (): number => 10;

	it("centres text by default and sits it by alignment within the padding of a wider plate", () => {
		const centred = layoutPlate("ab", advance, 10, 1000, 100);
		expect(centred.glyphs[0]!.x).toBe(-10);
		const left = layoutPlate("ab", advance, 10, 1000, 100, "left");
		expect(left.glyphs[0]!.x).toBe(-50 + PLATE_PAD_X_EM * 10);
		const right = layoutPlate("ab", advance, 10, 1000, 100, "right");
		expect(right.glyphs[1]!.x + 10).toBeCloseTo(50 - PLATE_PAD_X_EM * 10);
		expect(right.width).toBe(100);
	});

	it("keys a plate by its face", () => {
		expect(shapeKey("Mooring", 5, 20, 0, "rounded-rect", "")).toBe(shapeKey("Mooring", 5, 20, 0));
		expect(shapeKey("Mooring", 5, 20, 0, "rounded-rect", "Georgia|700||center")).not.toBe(shapeKey("Mooring", 5, 20, 0));
	});
});
