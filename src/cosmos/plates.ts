/**
 * Label plates built from a shared glyph atlas. See
 * `vault/Planner/3D Graph - Plates for every node.md`.
 *
 * Every node in Cosmos is a plate: a rounded rectangle with a run of
 * text on it. Each character the loaded area uses is drawn once into a shared
 * atlas texture, and a plate is a list of glyph quads placed by the
 * characters' measured advances (no kerning or ligatures).
 *
 * Pure: the scene measures characters with the theme font and passes the
 * advances in; everything here is in font px.
 */

/** Horizontal padding either side of the text, in ems. */
export const PLATE_PAD_X_EM = 0.4;
/** Plate height in ems: a 1.25 em line box and 0.25 em above and below. */
export const PLATE_HEIGHT_EM = 1.75;
/** A line plate's height in world units (every label but a note title). */
export const LINE_PLATE_HEIGHT = 5;
/** Outline width, in ems. */
export const PLATE_STROKE_EM = 0.07;
/** Corner radius, as a share of the plate's height. */
export const PLATE_RADIUS = 0.3;

const ELLIPSIS = "…";

export interface PlateGlyph {
	char: string;
	/** Left edge of the character's advance, relative to the plate's centre. */
	x: number;
}

export interface PlateLayout {
	/** Glyphs to draw; spaces advance the pen but aren't drawn. */
	glyphs: PlateGlyph[];
	width: number;
	height: number;
}

/**
 * Lay `text` out on a plate, with `advance` giving each character's width at
 * `fontPx`. Text wider than `maxWidth` is cut at a character and ends in an
 * ellipsis. The plate is at least `minWidth` wide (its text stays centred), for
 * a node whose style or code block sets its width.
 */
export function layoutPlate(text: string, advance: (char: string) => number, fontPx: number, maxWidth: number, minWidth = 0): PlateLayout {
	let chars = Array.from(text);
	const widths = chars.map(advance);
	let textWidth = sum(widths);
	if (textWidth > maxWidth) {
		const room = maxWidth - advance(ELLIPSIS);
		let kept = 0;
		let width = 0;
		while (kept < chars.length && width + widths[kept]! <= room) width += widths[kept++]!;
		while (kept > 0 && chars[kept - 1]!.trim() === "") width -= widths[--kept]!;
		chars = [...chars.slice(0, kept), ELLIPSIS];
		widths.length = kept;
		widths.push(advance(ELLIPSIS));
		textWidth = width + widths[kept]!;
	}
	const glyphs: PlateGlyph[] = [];
	let pen = -textWidth / 2;
	chars.forEach((char, i) => {
		if (char.trim() !== "") glyphs.push({ char, x: pen });
		pen += widths[i]!;
	});
	return { glyphs, width: Math.max(minWidth, textWidth + 2 * PLATE_PAD_X_EM * fontPx), height: PLATE_HEIGHT_EM * fontPx };
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

/** Where a character sits in the atlas, in px of its page. */
export interface GlyphSlot {
	page: number;
	x: number;
	y: number;
	width: number;
	height: number;
	/** The slot is new: its character still has to be drawn into it. */
	fresh: boolean;
}

/**
 * Packs characters into square atlas pages of `pageSize` px, in rows of
 * `rowHeight` px, a new page when one is full. A character packed once keeps
 * its slot, so it is drawn only once.
 */
export class GlyphPacker {
	private readonly slots = new Map<string, GlyphSlot>();
	private page = 0;
	private x = 0;
	private y = 0;

	constructor(private readonly pageSize: number, private readonly rowHeight: number) {}

	get pages(): number {
		return this.slots.size === 0 ? 0 : this.page + 1;
	}

	slot(char: string, width: number): GlyphSlot {
		const known = this.slots.get(char);
		if (known !== undefined) return { ...known, fresh: false };
		const w = Math.min(this.pageSize, Math.ceil(width));
		if (this.x + w > this.pageSize) {
			this.x = 0;
			this.y += this.rowHeight;
		}
		if (this.y + this.rowHeight > this.pageSize) {
			this.page++;
			this.x = 0;
			this.y = 0;
		}
		const slot: GlyphSlot = { page: this.page, x: this.x, y: this.y, width: w, height: this.rowHeight, fresh: true };
		this.slots.set(char, slot);
		this.x += w;
		return slot;
	}
}

/** The cache key of a plate laid out from `text` at this height and these widths (`CosmosPlates.shape`). */
export function shapeKey(text: string, height: number, maxEm: number, minEm: number): string {
	return `${height}|${maxEm}|${minEm}|${text}`;
}

/**
 * Plate layouts by `shapeKey`, so a node whose text and size are unchanged
 * (a hop back, a refocus, a re-parse) reuses its layout. Values are shared:
 * never mutate one. `trim` bounds it to the plates in use once it outgrows
 * its limit.
 */
export class ShapeCache<T extends object> {
	private readonly entries = new Map<string, T>();

	get size(): number {
		return this.entries.size;
	}

	get(key: string): T | undefined {
		return this.entries.get(key);
	}

	set(key: string, value: T): void {
		this.entries.set(key, value);
	}

	clear(): void {
		this.entries.clear();
	}

	/** Past `limit` entries, drop every one that isn't in `live`. */
	trim(live: Iterable<T>, limit: number): void {
		if (this.entries.size <= limit) return;
		const keep = new Set(live);
		for (const [key, value] of this.entries) if (!keep.has(value)) this.entries.delete(key);
	}
}

/**
 * Run `run` on `items` from index `from` on, until `budgetMs` has passed by
 * `clock` (at least one item runs, so the queue always moves). Returns the
 * index of the first item not run.
 */
export function drainWithin<T>(items: readonly T[], from: number, run: (item: T) => void, budgetMs: number, clock: () => number): number {
	const start = clock();
	let i = from;
	while (i < items.length) {
		run(items[i++]!);
		if (clock() - start >= budgetMs) break;
	}
	return i;
}

/** Plates per row of the plate-centre texture the glyph shader reads its plate's centre and opacity from. */
export const PLATE_TEXTURE_WIDTH = 1024;

/** Rows the plate-centre texture needs for `count` plates (at least one). */
export function plateTextureRows(count: number): number {
	return Math.max(1, Math.ceil(count / PLATE_TEXTURE_WIDTH));
}
