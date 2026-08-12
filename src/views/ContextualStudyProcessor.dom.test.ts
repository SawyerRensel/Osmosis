// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type OsmosisPlugin from "../main";
import { ContextualStudyProcessor } from "./ContextualStudyProcessor";

/**
 * What text a fence hands to the markdown renderer.
 *
 * The `{a}` marker binds an embed to its shape set and lives in the user's own
 * file, so every render surface has to strip it — an acceptance criterion in
 * its own right. It regressed once already: stripping was done inside the
 * occlusion branch alone, and a fence that *also* carried a `***` separator
 * returned from the branch above it with the markers intact, putting a literal
 * `{a}` under the diagram in reading view.
 */
type Parsed = {
	front: string;
	back: string;
	cardId: string;
	exclude: boolean;
	occlusions?: { image: string }[];
} | null;

/** `parseFenceContent` is private; the fence text in, card text out is the contract. */
function parse(source: string): Parsed {
	const processor = new ContextualStudyProcessor({} as unknown as OsmosisPlugin);
	return (processor as unknown as { parseFenceContent: (s: string) => Parsed })
		.parseFenceContent(source);
}

const shapes = [
	"occlude-a:",
	"  mode: hide-all-guess-one",
	"  shapes:",
	"    - group: c1",
	"      kind: rect",
	"      x: 0.31",
	"      y: 0.22",
	"      w: 0.14",
	"      h: 0.06",
].join("\n");

describe("parseFenceContent — embed labels", () => {
	it("hands an occlusion fence's diagram to the mask renderer, not to markdown", () => {
		const parsed = parse(`id: bridge\n${shapes}\n\n![[bridge.svg]]{a}`);

		// The embed leaves the markdown entirely: `renderOcclusion` draws the
		// picture, so leaving it in would render the diagram twice — once masked
		// and once not. Nothing is left here but the (absent) prose.
		expect(parsed?.front).toBe("");
		expect(parsed?.occlusions?.map((o) => o.image)).toEqual(["bridge.svg"]);
		expect(parsed?.front).not.toContain("{a}");
	});

	it("strips the label from a fence that also has a separator", () => {
		// The regression: this branch returns before the occlusion one is reached.
		const parsed = parse(`id: bridge\n${shapes}\n\n![[bridge.svg]]{a}\n***\nThe deck slab.`);

		expect(parsed?.front).toBe("![[bridge.svg]]");
		expect(parsed?.back).toBe("The deck slab.");
	});

	it("keeps an embed that has no shape set, and strips its label", () => {
		// Only `a` is occluded. `b` is ordinary content: taking it out with the
		// masked one would make the second diagram vanish from the note.
		const parsed = parse(`id: bridge\n${shapes}\n\n![[a.svg]]{a}\n![[b.svg]]{b}`);

		expect(parsed?.occlusions?.map((o) => o.image)).toEqual(["a.svg"]);
		expect(parsed?.front).toBe("![[b.svg]]");
		expect(parsed?.front).not.toContain("{b}");
	});

	it("carries the prose around a diagram through to the card body", () => {
		const parsed = parse(`id: bridge\n${shapes}\n\nWhich parts carry load?\n![[bridge.svg]]{a}`);

		expect(parsed?.front).toBe("Which parts carry load?");
		expect(parsed?.occlusions?.map((o) => o.image)).toEqual(["bridge.svg"]);
	});

	it("occludes a single-embed fence, which carries no label at all", () => {
		const bare = shapes.replace("occlude-a:", "occlude:");
		const parsed = parse(`id: bridge\n${bare}\n\n![[bridge.svg]]`);

		expect(parsed?.occlusions?.map((o) => o.image)).toEqual(["bridge.svg"]);
		expect(parsed?.front).toBe("");
	});

	it("leaves the user's own braces alone", () => {
		// The marker is anchored to a preceding embed precisely so prose and
		// LaTeX survive: `{x}` on its own is the author's text.
		const parsed = parse("id: sets\n\nThe set ==$\\{x\\}$== is closed.");

		expect(parsed?.back).toContain("$\\{x\\}$");
	});
});

describe("parseFenceContent — what counts as a card", () => {
	it("returns nothing for a fence with no separator, cloze, or occlusion", () => {
		// `generateExplicitCards` skips this shape too. Reading view renders it
		// as a draft preview rather than a card, so the two agree.
		expect(parse("id: draft\n\nWhich parts carry load?\n\n![[span.svg]]")).toBeNull();
	});

	it("still makes a card from a separator fence holding only an image", () => {
		const parsed = parse("id: bridge\n\n![[span.svg]]\n***\nThe main span.");

		expect(parsed?.front).toBe("![[span.svg]]");
		expect(parsed?.back).toBe("The main span.");
	});
});
