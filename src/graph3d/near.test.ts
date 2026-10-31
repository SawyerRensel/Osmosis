import { describe, it, expect } from "vitest";
import { PANEL_MAX_EM, PANEL_MEDIA_MAX_EM, nearMarkdown, panelBoxEm, unembed } from "./near";
import type { CardOcclusion } from "../database/types";
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

	it("stands in for an occlusion card's diagram, keyed by the image and sized as one", () => {
		const occlusion: CardOcclusion = { image: "diagrams/span (1).svg", shapes: [], target: "c1", mode: "hide-all-guess-one" };
		const covered: GraphNode = { ...line("![[span.svg]] ^os-span"), masks: { occlusion, side: "front" } };
		const revealed: GraphNode = { ...covered, masks: { occlusion, side: "back" } };
		const other: GraphNode = { ...covered, masks: { occlusion: { ...occlusion, image: "other.svg" }, side: "front" } };
		// Revealing keeps the text, so the panel only repaints; another diagram refills it.
		expect(nearMarkdown(revealed)).toBe(nearMarkdown(covered));
		expect(nearMarkdown(other)).not.toBe(nearMarkdown(covered));
		expect(panelBoxEm(covered)?.height).toBeGreaterThanOrEqual(PANEL_MEDIA_MAX_EM);
	});

	it("gives note cores, tags and ghosts no panel", () => {
		expect(nearMarkdown({ id: "note:a.md", kind: "note", label: "a", path: "a.md" })).toBeNull();
		expect(nearMarkdown({ id: "tag:x", kind: "tag", label: "#x" })).toBeNull();
		expect(nearMarkdown({ id: "ghost:x", kind: "ghost", label: "x" })).toBeNull();
	});
});

describe("panelBoxEm", () => {
	const attachment = (path: string): GraphNode => ({ id: `file:${path}`, kind: "attachment", label: path, path });

	it("gives nodes without a panel no box", () => {
		expect(panelBoxEm({ id: "note:a.md", kind: "note", label: "a", path: "a.md" })).toBeNull();
		expect(panelBoxEm(attachment("a.pdf"))).toBeNull();
	});

	it("reserves the full media box for an image or video, whatever its real aspect", () => {
		for (const path of ["knot-diagram.svg", "wake-pattern.mp4"]) {
			const box = panelBoxEm(attachment(path))!;
			expect(box.width).toBe(PANEL_MAX_EM.width);
			expect(box.height).toBeGreaterThanOrEqual(PANEL_MEDIA_MAX_EM);
		}
	});

	it("reserves a player strip for audio", () => {
		const box = panelBoxEm(attachment("ship-bell.mp3"))!;
		expect(box.height).toBeLessThan(5);
	});

	it("keeps a short line about the size of its plate", () => {
		const box = panelBoxEm(line("- Fenders out", "Fenders out"))!;
		expect(box.width).toBeLessThan(10);
		expect(box.height).toBeLessThan(2.5);
	});

	it("wraps long prose at the panel's width", () => {
		const box = panelBoxEm(line("word ".repeat(80).trim()))!;
		expect(box.width).toBe(PANEL_MAX_EM.width);
		expect(box.height).toBeGreaterThan(5 * 1.5);
	});

	it("counts a code block's lines, fences included", () => {
		const box = panelBoxEm(line("```yaml\nmainsail:\n  cloth: dacron\n  last_service: 2026-04\n```"))!;
		expect(box.height).toBeCloseTo(5 * 1.4 + 0.5);
	});

	it("counts table rows but not the separator", () => {
		const box = panelBoxEm(line("| Part | Check |\n| --- | --- |\n| Clew ring | Corrosion |"))!;
		expect(box.height).toBeCloseTo(2 * 2 + 0.5);
	});

	it("gives a Markdown image in a line the media height", () => {
		const box = panelBoxEm(line("![chart](https://example.com/a.png)"))!;
		expect(box.height).toBeGreaterThanOrEqual(PANEL_MEDIA_MAX_EM);
	});

	it("never exceeds the panel's largest size", () => {
		const box = panelBoxEm(line("```\n" + "x\n".repeat(100) + "```"))!;
		expect(box).toEqual({ width: expect.any(Number) as number, height: PANEL_MAX_EM.height });
	});
});
