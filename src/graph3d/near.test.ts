import { describe, it, expect } from "vitest";
import { nearMarkdown, unembed } from "./near";
import type { GraphNode } from "./model";
import type { OsmosisNode } from "../types";

function line(raw: string, content = raw): GraphNode {
	const source: OsmosisNode = { id: "x", type: "paragraph", depth: 0, content, raw, children: [], range: { start: 0, end: raw.length }, isTranscluded: false };
	return { id: "line:a.md#x", kind: "line", label: content, path: "a.md", source };
}

describe("unembed", () => {
	it("turns an embedded note, heading or block into a link", () => {
		expect(unembed("![[Rigging]]")).toBe("[[Rigging]]");
		expect(unembed("![[Rigging.md#Running Rigging|rig]]")).toBe("[[Rigging.md#Running Rigging|rig]]");
		expect(unembed("see ![[Knots#^bowline]] here")).toBe("see [[Knots#^bowline]] here");
	});

	it("turns embedded media into links too: the attachment node plays it", () => {
		expect(unembed("![[knot-diagram.svg]]")).toBe("[[knot-diagram.svg]]");
		expect(unembed("![[clip.mp4|300]] and ![[bell.mp3]]")).toBe("[[clip.mp4|300]] and [[bell.mp3]]");
	});

	it("leaves Markdown images alone", () => {
		expect(unembed("![chart](https://example.com/a.png)")).toBe("![chart](https://example.com/a.png)");
	});
});

describe("nearMarkdown", () => {
	it("renders a line from its source, markers kept and indentation dropped", () => {
		expect(nearMarkdown(line("\t- Clove hitch", "Clove hitch"))).toBe("- Clove hitch");
		expect(nearMarkdown(line("## Bends", "Bends"))).toBe("## Bends");
	});

	it("dedents a multi-line block as a whole", () => {
		const callout = "\t> [!tip] Reefing\n\t> Reef early.";
		expect(nearMarkdown(line(callout))).toBe("> [!tip] Reefing\n> Reef early.");
	});

	it("falls back to content when the parser kept no raw text", () => {
		const node = line("", "Plain words");
		delete node.source!.raw;
		expect(nearMarkdown(node)).toBe("Plain words");
	});

	it("embeds media attachments and skips the rest", () => {
		expect(nearMarkdown({ id: "file:a.svg", kind: "attachment", label: "a.svg", path: "tests/a.svg" })).toBe("![[tests/a.svg]]");
		expect(nearMarkdown({ id: "file:a.pdf", kind: "attachment", label: "a.pdf", path: "a.pdf" })).toBeNull();
	});

	it("gives note cores, tags and ghosts no panel", () => {
		expect(nearMarkdown({ id: "note:a.md", kind: "note", label: "a", path: "a.md" })).toBeNull();
		expect(nearMarkdown({ id: "tag:x", kind: "tag", label: "#x" })).toBeNull();
		expect(nearMarkdown({ id: "ghost:x", kind: "ghost", label: "x" })).toBeNull();
	});
});
