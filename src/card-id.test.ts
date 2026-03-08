import { describe, it, expect } from "vitest";
import {
	extractCardIds,
	generateCardId,
	formatCardIdComment,
	insertCardIdAtLine,
	removeCardId,
	associateIdsWithNodes,
	OSMOSIS_ID_STRIP_REGEX,
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

	it("extracts multiple IDs on the same line (cloze case)", () => {
		const md =
			"Python uses ==duck typing== <!--osmosis-id:aaa11111--> for ==polymorphism== <!--osmosis-id:bbb22222-->.";
		const ids = extractCardIds(md);
		expect(ids).toHaveLength(2);
		expect(ids[0]!.id).toBe("aaa11111");
		expect(ids[1]!.id).toBe("bbb22222");
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

describe("formatCardIdComment", () => {
	it("formats an ID as an HTML comment", () => {
		expect(formatCardIdComment("abc12345")).toBe(
			"<!--osmosis-id:abc12345-->",
		);
	});
});

describe("insertCardIdAtLine", () => {
	it("inserts ID at end of first line", () => {
		const md = "## Topic\nBody text";
		const result = insertCardIdAtLine(md, "abc12345", 0);
		expect(result).toBe(
			"## Topic <!--osmosis-id:abc12345-->\nBody text",
		);
	});

	it("inserts ID at end of second line", () => {
		const md = "## Topic\nBody text\nMore text";
		const result = insertCardIdAtLine(md, "abc12345", 10);
		expect(result).toBe(
			"## Topic\nBody text <!--osmosis-id:abc12345-->\nMore text",
		);
	});

	it("inserts ID at end of file when no trailing newline", () => {
		const md = "## Topic";
		const result = insertCardIdAtLine(md, "abc12345", 0);
		expect(result).toBe("## Topic <!--osmosis-id:abc12345-->");
	});
});

describe("removeCardId", () => {
	it("removes an ID comment from markdown", () => {
		const md = "## Topic <!--osmosis-id:abc12345-->\nBody";
		const result = removeCardId(md, "abc12345");
		expect(result).toBe("## Topic\nBody");
	});

	it("removes only the specified ID", () => {
		const md =
			"## Topic <!--osmosis-id:aaa11111--> <!--osmosis-id:bbb22222-->";
		const result = removeCardId(md, "aaa11111");
		expect(result).toBe("## Topic <!--osmosis-id:bbb22222-->");
	});

	it("returns unchanged markdown if ID not found", () => {
		const md = "## Topic\nBody";
		expect(removeCardId(md, "notfound")).toBe(md);
	});
});

describe("associateIdsWithNodes", () => {
	it("associates ID on same line as node", () => {
		const ids = [{ id: "abc12345", start: 9, end: 35, line: 0 }];
		const nodes = [{ nodeId: "node1", startLine: 0, endLine: 0 }];
		const result = associateIdsWithNodes(ids, nodes);
		expect(result.get("node1")).toBe("abc12345");
	});

	it("associates ID on line after node", () => {
		const ids = [{ id: "abc12345", start: 30, end: 56, line: 2 }];
		const nodes = [{ nodeId: "node1", startLine: 0, endLine: 1 }];
		const result = associateIdsWithNodes(ids, nodes);
		expect(result.get("node1")).toBe("abc12345");
	});

	it("does not associate ID far from node", () => {
		const ids = [{ id: "abc12345", start: 100, end: 126, line: 5 }];
		const nodes = [{ nodeId: "node1", startLine: 0, endLine: 1 }];
		const result = associateIdsWithNodes(ids, nodes);
		expect(result.has("node1")).toBe(false);
	});

	it("associates multiple IDs to multiple nodes", () => {
		const ids = [
			{ id: "aaa11111", start: 9, end: 35, line: 0 },
			{ id: "bbb22222", start: 50, end: 76, line: 2 },
		];
		const nodes = [
			{ nodeId: "node1", startLine: 0, endLine: 0 },
			{ nodeId: "node2", startLine: 2, endLine: 2 },
		];
		const result = associateIdsWithNodes(ids, nodes);
		expect(result.get("node1")).toBe("aaa11111");
		expect(result.get("node2")).toBe("bbb22222");
	});
});

describe("OSMOSIS_ID_STRIP_REGEX", () => {
	it("strips ID comments from content", () => {
		const content = "## Topic <!--osmosis-id:abc12345-->";
		expect(content.replace(OSMOSIS_ID_STRIP_REGEX, "")).toBe("## Topic");
	});

	it("strips multiple IDs", () => {
		const content =
			"Text ==term== <!--osmosis-id:aaa11111--> more ==word== <!--osmosis-id:bbb22222-->";
		expect(content.replace(OSMOSIS_ID_STRIP_REGEX, "")).toBe(
			"Text ==term== more ==word==",
		);
	});

	it("does not affect content without IDs", () => {
		const content = "## Normal Heading";
		expect(content.replace(OSMOSIS_ID_STRIP_REGEX, "")).toBe(content);
	});
});
