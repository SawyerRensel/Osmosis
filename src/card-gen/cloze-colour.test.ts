import { describe, it, expect } from "vitest";
import { CLOZE_BLANK, generateExplicitCards } from "./explicit";
import {
	CLOZE_COLOURS,
	colourAnswer,
	colourBlank,
	parseHighlightBody,
	parseHighlightToken,
} from "./cloze-colour";

describe("parseHighlightBody", () => {
	it("reads each of the six colour emoji and strips it from the answer", () => {
		const expected = [
			["🔴", "red"], ["🟠", "orange"], ["🟡", "yellow"],
			["🟢", "green"], ["🔵", "blue"], ["🟣", "purple"],
		];
		expect(CLOZE_COLOURS.map((c) => [c.emoji, c.colour])).toEqual(expected);
		for (const [emoji, colour] of expected) {
			expect(parseHighlightBody(`${emoji}Danube`)).toEqual({ colour, text: "Danube" });
		}
	});

	it("leaves a plain highlight uncoloured and untouched", () => {
		expect(parseHighlightBody("Danube")).toEqual({ colour: null, text: "Danube" });
		expect(parseHighlightBody("c2:Danube")).toEqual({ colour: null, text: "Danube" });
	});

	it("does not treat an emoji mid-text as a colour", () => {
		expect(parseHighlightBody("Danube 🔴 river")).toEqual({ colour: null, text: "Danube 🔴 river" });
		expect(parseHighlightBody("Danube🟢")).toEqual({ colour: null, text: "Danube🟢" });
	});

	it("leaves a non-colour emoji as text", () => {
		expect(parseHighlightBody("⭐Danube")).toEqual({ colour: null, text: "⭐Danube" });
		expect(parseHighlightBody("⚫Danube")).toEqual({ colour: null, text: "⚫Danube" });
	});

	it("keeps an emoji with nothing after it as the text", () => {
		expect(parseHighlightBody("🔴")).toEqual({ colour: null, text: "🔴" });
	});

	it("reads a colour beside a group label, in either order", () => {
		expect(parseHighlightBody("🔴c1:Danube")).toEqual({ colour: "red", text: "Danube" });
		expect(parseHighlightBody("c1:🔵Danube")).toEqual({ colour: "blue", text: "Danube" });
	});

	it("only strips one colour emoji", () => {
		expect(parseHighlightBody("🔴🟢Danube")).toEqual({ colour: "red", text: "🟢Danube" });
	});
});

describe("parseHighlightToken", () => {
	it("reads the inside of a whole token", () => {
		expect(parseHighlightToken("==🟣Danube==")).toEqual({ colour: "purple", text: "Danube" });
		expect(parseHighlightToken("==Danube==")).toEqual({ colour: null, text: "Danube" });
	});
});

describe("colourBlank and colourAnswer", () => {
	it("leave an uncoloured cloze exactly as it was", () => {
		expect(colourBlank(CLOZE_BLANK, null)).toBe(CLOZE_BLANK);
		expect(colourAnswer("==Danube==")).toBe("==Danube==");
		expect(colourAnswer("==c1:Danube==")).toBe("==Danube==");
	});

	it("mark a coloured one with its colour class and drop the emoji", () => {
		expect(colourBlank(CLOZE_BLANK, "green")).toBe(
			`<span class="osmosis-cloze-blank osmosis-cloze-green">${CLOZE_BLANK}</span>`,
		);
		expect(colourAnswer("==🟢c1:Danube==")).toBe(
			'<mark class="osmosis-cloze-mark osmosis-cloze-green">Danube</mark>',
		);
	});
});

describe("generated cloze cards", () => {
	const fence = (line: string) =>
		["```osmosis", "id: rivers", "", line, "```"].join("\n");

	it("generates the same cards for a coloured cloze as for the plain one, but for the colour", () => {
		const plain = generateExplicitCards(fence("The ==Danube== meets the ==Rhine== nowhere."));
		const coloured = generateExplicitCards(fence("The ==🔵Danube== meets the ==🟢Rhine== nowhere."));
		expect(coloured.map((c) => c.id)).toEqual(plain.map((c) => c.id));
		expect(coloured.map((c) => c.id)).toEqual(["rivers-c1", "rivers-c2"]);
	});

	it("leaves a plain cloze's front and back as they were", () => {
		const [c1, c2] = generateExplicitCards(fence("The ==Danube== meets the ==Rhine== nowhere."));
		expect(c1!.front).toBe(`The ${CLOZE_BLANK} meets the ==Rhine== nowhere.`);
		expect(c1!.back).toBe("The ==Danube== meets the ==Rhine== nowhere.");
		expect(c2!.front).toBe(`The ==Danube== meets the ${CLOZE_BLANK} nowhere.`);
	});

	it("blanks and reveals a coloured cloze in its colour, with the emoji gone", () => {
		const [c1, c2] = generateExplicitCards(fence("The ==🔵Danube== meets the ==🟢Rhine== nowhere."));
		const blue = "osmosis-cloze-blue";
		const green = "osmosis-cloze-green";
		expect(c1!.front).toBe(
			`The <span class="osmosis-cloze-blank ${blue}">${CLOZE_BLANK}</span> meets the <mark class="osmosis-cloze-mark ${green}">Rhine</mark> nowhere.`,
		);
		expect(c1!.back).toBe(
			`The <mark class="osmosis-cloze-mark ${blue}">Danube</mark> meets the <mark class="osmosis-cloze-mark ${green}">Rhine</mark> nowhere.`,
		);
		expect(c2!.front).toContain(`<span class="osmosis-cloze-blank ${green}">`);
		expect(c1!.back).not.toMatch(/🔵|🟢/);
	});

	it("keeps a colour cloze's group label working", () => {
		const cards = generateExplicitCards(fence("==🔴c1:Danube== and ==c1:🟠Rhine== share one card; ==Elbe== has its own."));
		expect(cards.map((c) => c.id)).toEqual(["rivers-c1", "rivers-c2"]);
		expect(cards[0]!.front).toBe(
			`<span class="osmosis-cloze-blank osmosis-cloze-red">${CLOZE_BLANK}</span> and <span class="osmosis-cloze-blank osmosis-cloze-orange">${CLOZE_BLANK}</span> share one card; ==Elbe== has its own.`,
		);
	});

	it("does not colour from an emoji mid-text, and leaves **bold** alone", () => {
		const [c1, c2] = generateExplicitCards(fence("A ==stop 🔴 sign== and **🔴bold**."));
		expect(c1!.front).toBe(`A ${CLOZE_BLANK} and **🔴bold**.`);
		expect(c1!.back).toBe("A ==stop 🔴 sign== and **🔴bold**.");
		expect(c2!.front).toBe(`A ==stop 🔴 sign== and ${CLOZE_BLANK}.`);
	});
});
