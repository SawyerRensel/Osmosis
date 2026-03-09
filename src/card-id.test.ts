import { describe, it, expect } from "vitest";
import {
	extractCardIds,
	generateCardId,
} from "./card-id";

describe("extractCardIds", () => {
	it("extracts IDs from headings", () => {
		const md = "## Topic <!--osmosis-id:abc12345-->\nSome body text.";
		const ids = extractCardIds(md);
		expect(ids).toHaveLength(1);
		expect(ids[0]!.id).toBe("abc12345");
		expect(ids[0]!.line).toBe(0);
	});

	it("extracts multiple IDs from different lines", () => {
		const md = [
			"## Heading <!--osmosis-id:aaa11111-->",
			"Body text with ==term== <!--osmosis-id:bbb22222-->",
			"Another line",
			"## Heading 2 <!--osmosis-id:ccc33333-->",
		].join("\n");
		const ids = extractCardIds(md);
		expect(ids).toHaveLength(3);
		expect(ids[0]!.id).toBe("aaa11111");
		expect(ids[1]!.id).toBe("bbb22222");
		expect(ids[2]!.id).toBe("ccc33333");
	});

	it("returns empty array for markdown without IDs", () => {
		const md = "## Heading\nBody text\n- list item";
		expect(extractCardIds(md)).toHaveLength(0);
	});

	it("handles IDs at end of file with no trailing newline", () => {
		const md = "## Topic <!--osmosis-id:endoffile-->";
		const ids = extractCardIds(md);
		expect(ids).toHaveLength(1);
		expect(ids[0]!.id).toBe("endoffile");
	});

	it("records correct start/end offsets", () => {
		const md = "## Topic <!--osmosis-id:abc12345-->";
		const ids = extractCardIds(md);
		expect(ids[0]!.start).toBe(9);
		expect(ids[0]!.end).toBe(md.length);
	});
});

describe("generateCardId", () => {
	it("produces an 8-character hex string", () => {
		const id = generateCardId();
		expect(id).toMatch(/^[a-f0-9]{8}$/);
		expect(id).toHaveLength(8);
	});

	it("produces unique values", () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateCardId()));
		expect(ids.size).toBe(100);
	});
});
