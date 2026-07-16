import { describe, it, expect } from "vitest";
import {
	extractTrailingBlockId,
	stripTrailingBlockId,
	generateBlockId,
	isOsmosisBlockId,
	OSMOSIS_BLOCK_ID_PREFIX,
} from "./block-id";

describe("extractTrailingBlockId", () => {
	it("extracts an Osmosis block ID from a bullet line", () => {
		const result = extractTrailingBlockId("- Mitochondria produce ATP ^os-a1b2c3");
		expect(result).not.toBeNull();
		expect(result?.id).toBe("os-a1b2c3");
		expect(result?.stripped).toBe("- Mitochondria produce ATP");
		expect(result?.idStart).toBe("- Mitochondria produce ATP".length);
	});

	it("extracts from a heading line", () => {
		const result = extractTrailingBlockId("## Cellular Respiration ^os-77c4b0");
		expect(result?.id).toBe("os-77c4b0");
		expect(result?.stripped).toBe("## Cellular Respiration");
	});

	it("extracts a user-authored block ID (no os- prefix)", () => {
		const result = extractTrailingBlockId("Some paragraph ^my-note-1");
		expect(result?.id).toBe("my-note-1");
		expect(result?.stripped).toBe("Some paragraph");
	});

	it("tolerates trailing whitespace after the ID", () => {
		const result = extractTrailingBlockId("- item ^os-abc123  ");
		expect(result?.id).toBe("os-abc123");
		expect(result?.stripped).toBe("- item");
	});

	it("returns null when there is no block ID", () => {
		expect(extractTrailingBlockId("- plain item")).toBeNull();
		expect(extractTrailingBlockId("## Heading")).toBeNull();
	});

	it("returns null for a caret that is not a trailing block ID", () => {
		// Caret mid-line
		expect(extractTrailingBlockId("2 ^ 8 equals 256")).toBeNull();
		// Footnote reference at end of line
		expect(extractTrailingBlockId("see the note [^1]")).toBeNull();
		// Invalid ID characters
		expect(extractTrailingBlockId("item ^os_a1!b2")).toBeNull();
	});

	it("returns null for a line that is only a block ID", () => {
		expect(extractTrailingBlockId("^os-a1b2c3")).toBeNull();
		expect(extractTrailingBlockId("  ^os-a1b2c3")).toBeNull();
	});

	it("only matches the last caret segment on the line", () => {
		const result = extractTrailingBlockId("uses ^caret notation ^os-x1y2z3");
		expect(result?.id).toBe("os-x1y2z3");
		expect(result?.stripped).toBe("uses ^caret notation");
	});
});

describe("stripTrailingBlockId", () => {
	it("strips a trailing block ID", () => {
		expect(stripTrailingBlockId("- item ^os-abc123")).toBe("- item");
	});

	it("returns the line unchanged when there is no ID", () => {
		expect(stripTrailingBlockId("- item")).toBe("- item");
	});
});

describe("generateBlockId", () => {
	it("generates IDs in the os-xxxxxx base36 format", () => {
		for (let i = 0; i < 100; i++) {
			expect(generateBlockId()).toMatch(/^os-[0-9a-z]{6}$/);
		}
	});

	it("avoids IDs in the existing set", () => {
		// Force collision handling by pre-populating and checking result absence
		const existing = new Set<string>();
		for (let i = 0; i < 50; i++) {
			const id = generateBlockId(existing);
			expect(existing.has(id)).toBe(false);
			existing.add(id);
		}
	});
});

describe("isOsmosisBlockId", () => {
	it("recognizes the os- prefix", () => {
		expect(isOsmosisBlockId(`${OSMOSIS_BLOCK_ID_PREFIX}a1b2c3`)).toBe(true);
		expect(isOsmosisBlockId("my-note-1")).toBe(false);
	});
});
