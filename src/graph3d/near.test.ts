import { describe, it, expect } from "vitest";
import { MIN_STYLE_WIDTH_PX, PANEL_MAX_EM, PANEL_MEDIA_MAX_EM, nearMarkdown, panelBoxEm, panelWidthRule, plateWidthEm, styleWidthEm, styleWidthFromEm, unembed } from "./near";
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

	it("counts a code block's lines, fences included, and its padding", () => {
		const box = panelBoxEm(line("```yaml\nmainsail:\n  cloth: dacron\n  last_service: 2026-04\n```"))!;
		expect(box.height).toBeCloseTo(5 * 1.4 + 1.5 + 0.5);
	});

	it("wraps long code lines, as reading view does (pre-wrap)", () => {
		const short = panelBoxEm(line("```\nx\n```"))!;
		const long = panelBoxEm(line("```\n" + "x".repeat(100) + "\n```"))!;
		expect(long.width).toBe(PANEL_MAX_EM.width);
		expect(long.height - short.height).toBeCloseTo(3 * 1.4);
	});

	it("counts table rows but not the separator", () => {
		const box = panelBoxEm(line("| Part | Check |\n| --- | --- |\n| Clew ring | Corrosion |"))!;
		expect(box.height).toBeCloseTo(2 * 2 + 0.5);
	});

	it("gives a Markdown image in a line the media height", () => {
		const box = panelBoxEm(line("![chart](https://example.com/a.png)"))!;
		expect(box.height).toBeGreaterThanOrEqual(PANEL_MEDIA_MAX_EM);
	});

	it("gives every image on a line its own media row, under the line's text", () => {
		const one = panelBoxEm(line("![](flag-alpha.svg)"))!;
		const titled = panelBoxEm(line("- `Alpha` ![](flag-alpha.svg)", "`Alpha` ![](flag-alpha.svg)"))!;
		const two = panelBoxEm(line("- `Alpha Bravo` ![](flag-alpha.svg) ![](flag-bravo.svg)", "`Alpha Bravo` ![](flag-alpha.svg) ![](flag-bravo.svg)"))!;
		expect(titled.height).toBeCloseTo(one.height + 1.5);
		// Two full-height images and a title: past the panel's cap.
		expect(two.height).toBe(PANEL_MAX_EM.height);
	});

	it("counts an HTML image as an image", () => {
		const box = panelBoxEm(line('<img src="https://example.com/a.png" width="300">'))!;
		expect(box.height).toBeCloseTo(PANEL_MEDIA_MAX_EM + 0.5);
	});

	it("gives a table row the height of its fullest cell's images", () => {
		const box = panelBoxEm(line("| Hoist | Flags |\n| --- | --- |\n| AB | ![](flag-alpha.svg) ![](flag-bravo.svg) |\n| C | ![](flag-charlie.svg) |"))!;
		// Header, a row of two stacked images and a row of one: past the panel's cap.
		expect(box.height).toBe(PANEL_MAX_EM.height);
		const single = panelBoxEm(line("| Hoist | Flag | Flag |\n| --- | --- | --- |\n| AB | ![](flag-alpha.svg) | ![](flag-bravo.svg) |"))!;
		expect(single.height).toBeCloseTo(2 * 2 + PANEL_MEDIA_MAX_EM + 0.5);
	});

	it("never exceeds the panel's largest size", () => {
		const box = panelBoxEm(line("```\n" + "x\n".repeat(100) + "```"))!;
		expect(box).toEqual({ width: expect.any(Number) as number, height: PANEL_MAX_EM.height });
	});
});

describe("panelBoxEm for an osmosis card fence", () => {
	const schedule = ["id: hf-rows", "due: 2026-10-25T09:00:00.000Z", "stability: 4.0000", "difficulty: 5.5000", "reps: 2", "lapses: 0", "state: review", "lastReview: 2026-10-21T09:00:00.000Z", "learningSteps: 0", ""];
	const question = "Defines the number of horizontal lines shown in a text area. Used on `<textarea>`.";
	const fence = (header: string[], content: string[]): GraphNode => line(["````osmosis", ...header, ...content, "````"].join("\n"));
	const withCode = (header: string[]): GraphNode => fence(header, [question, "***", "```html", '<textarea name="comment" rows="4">', "</textarea>", "```"]);

	it("is at least as big as the card renders", () => {
		// The card as laid out at the panel's 16 px text, in px: border and padding (2 × 13),
		// the question's paragraph (1 em margins either side, about three rows at 20 px), the
		// divider (17), the answer's code block (1 em margins, 12 px padding either side, two
		// rows at 17.5 px), and the eye row (28); then the panel's own padding.
		const rendered = (26 + (32 + 3 * 20) + 17 + (32 + 24 + 2 * 17.5) + 28) / 16 + 0.5;
		const box = panelBoxEm(withCode(["id: hf-rows", ""]))!;
		expect(box.height).toBeGreaterThanOrEqual(rendered);
		expect(box.width).toBe(PANEL_MAX_EM.width);
	});

	it("does not count the header, which never renders", () => {
		expect(panelBoxEm(withCode(schedule))).toEqual(panelBoxEm(withCode(["id: hf-rows", ""])));
	});

	it("measures a nested code block as code, not as the fence's own", () => {
		const longCode = "x".repeat(100);
		const box = panelBoxEm(fence(["id: hf-long", ""], ["Q", "***", "```html", longCode, "```"]))!;
		const short = panelBoxEm(fence(["id: hf-long", ""], ["Q", "***", "```html", "x", "```"]))!;
		expect(box.height - short.height).toBeGreaterThanOrEqual(3 * 1.4);
	});

	it("counts a cloze's text twice: reading view draws it as front and back", () => {
		const cloze = panelBoxEm(fence(["id: hf-cloze", ""], ["A ==textarea== wraps soft lines."]))!;
		const basic = panelBoxEm(fence(["id: hf-basic", ""], ["A textarea wraps soft lines.", "***", "x"]))!;
		expect(cloze.height).toBeGreaterThanOrEqual(basic.height);
	});

	it("leaves an ordinary code block alone", () => {
		const yaml = panelBoxEm(line("```yaml\nid: x\n\nQ\n```"))!;
		expect(yaml.height).toBeLessThan(panelBoxEm(fence(["id: x", ""], ["Q"]))!.height);
	});
});

describe("node width", () => {
	const code = (...lines: string[]): GraphNode => {
		const node = line(["```ts", ...lines, "```"].join("\n"));
		node.source!.type = "codeblock";
		return node;
	};
	const styled = (node: GraphNode, width: number): GraphNode => ({ ...node, style: { width } });

	it("maps a width style to ems and back", () => {
		expect(styleWidthEm(130)).toBeCloseTo(10 + 0.8);
		expect(styleWidthFromEm(styleWidthEm(260))).toBe(260);
		expect(styleWidthFromEm(0)).toBe(MIN_STYLE_WIDTH_PX);
	});

	it("lays a node with a custom width out at exactly that width, past the default cap", () => {
		const wide = styled(line("- Clove hitch"), 520);
		expect(panelWidthRule(wide)).toEqual({ kind: "custom", em: styleWidthEm(520) });
		expect(panelBoxEm(wide)!.width).toBeCloseTo(styleWidthEm(520));
		expect(panelBoxEm(wide)!.width).toBeGreaterThan(PANEL_MAX_EM.width);
		expect(panelBoxEm(styled(line("- Clove hitch"), 100))!.width).toBeCloseTo(styleWidthEm(100));
	});

	it("wraps text taller in a narrower custom width", () => {
		const text = "word ".repeat(40);
		expect(panelBoxEm(styled(line(text), 100))!.height).toBeGreaterThan(panelBoxEm(styled(line(text), 600))!.height);
	});

	it("fits a code block to its longest line, past the 20em prose cap", () => {
		const em = (columns: number): number => panelBoxEm(code("a".repeat(40), "b".repeat(columns)))!.width;
		expect(panelWidthRule(code("x".repeat(80))).kind).toBe("code");
		expect(em(80)).toBeGreaterThan(PANEL_MAX_EM.width);
		expect(em(80)).toBeGreaterThan(em(60));
	});

	it("stops growing at 100 columns and wraps", () => {
		const at100 = panelBoxEm(code("a".repeat(100)))!;
		const at140 = panelBoxEm(code("a".repeat(140)))!;
		expect(at140.width).toBeCloseTo(at100.width);
		expect(at140.height).toBeGreaterThan(at100.height);
	});

	it("handles empty, one-line and wide-character code blocks", () => {
		expect(panelBoxEm(code())!.width).toBeGreaterThan(0);
		expect(panelBoxEm(code("x = 1"))!.width).toBeLessThan(PANEL_MAX_EM.width);
		// 50 wide characters are 100 columns, as 100 narrow ones.
		expect(panelBoxEm(code("日".repeat(50)))!.width).toBeCloseTo(panelBoxEm(code("a".repeat(100)))!.width);
	});

	it("lets a custom width beat the code fit", () => {
		const node = styled(code("a".repeat(90)), 150);
		expect(panelWidthRule(node).kind).toBe("custom");
		expect(panelBoxEm(node)!.width).toBeCloseTo(styleWidthEm(150));
	});

	it("leaves other nodes under the default cap", () => {
		expect(panelWidthRule(line("- " + "word ".repeat(80)))).toEqual({ kind: "default", em: PANEL_MAX_EM.width });
		expect(panelBoxEm(line("- " + "word ".repeat(80)))!.width).toBe(PANEL_MAX_EM.width);
	});

	it("does not fit an osmosis card fence like a code block", () => {
		const card = code("id: hf-x", "", "Q", "***", "A");
		card.source!.raw = "```osmosis\nid: hf-x\n\nQ\n***\nA\n```";
		expect(panelWidthRule(card).kind).toBe("default");
	});

	it("sizes a plate only when its width is set", () => {
		expect(plateWidthEm(line("- Clove hitch"))).toBeNull();
		const custom = plateWidthEm(styled(line("- Clove hitch"), 260))!;
		expect(custom.minEm).toBeCloseTo(styleWidthEm(260));
		expect(custom.textMaxEm).toBeCloseTo(styleWidthEm(260) - 0.8);
		expect(plateWidthEm(code("a".repeat(60)))!.minEm).toBeGreaterThan(20);
	});
});

describe("nearMarkdown for a line group (T75)", () => {
	const group = (raw: string, type: "heading" | "paragraph", content: string): GraphNode => {
		const node = line(raw, content);
		node.source!.type = type;
		return node;
	};

	it("keeps a heading group's cover image as an embed, above its heading", () => {
		const node = group("![[cover.png|300]]\n### Rigging", "heading", "Rigging");
		expect(nearMarkdown(node)).toBe("![[cover.png|300]]\n\n### Rigging");
	});

	it("draws a caption below the heading as its own block and drops trailing IDs", () => {
		const node = group("## Mooring ^os-a\nPick up the buoy from downwind.", "heading", "Mooring");
		expect(nearMarkdown(node)).toBe("## Mooring\n\nPick up the buoy from downwind.");
	});

	it("still turns a note embed or a PDF in a group into a link", () => {
		const node = group("See ![[Knots]] and ![[chart.pdf]]\n![[clip.mp4]]", "paragraph", "See");
		expect(nearMarkdown(node)).toBe("See [[Knots]] and [[chart.pdf]]\n![[clip.mp4]]");
	});

	it("dedents an indented group", () => {
		expect(nearMarkdown(group("\tFirst line\n\tsecond line", "paragraph", "First line\nsecond line"))).toBe("First line\nsecond line");
	});

	it("sizes a kept cover embed as an image", () => {
		const node = group("![[cover.png]]\n### Rigging", "heading", "Rigging");
		expect(panelBoxEm(node)!.height).toBeGreaterThanOrEqual(PANEL_MEDIA_MAX_EM);
	});

	it("leaves a single-line media embed a link, as before", () => {
		expect(nearMarkdown(line("![[cover.png]]"))).toBe("[[cover.png]]");
	});
});
