// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { CLOZE_BLANK } from "../card-gen/explicit";
import type { Card } from "../database/types";
import type OsmosisPlugin from "../main";
import { dueOrNewFenceCardKeys } from "../study/spatial-study";
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

/**
 * An occluded fence being studied in the note.
 *
 * Reading view has two jobs on the same diagram. *Peek* is a reader looking at a
 * picture — every group blanked at once, none singled out, nothing recorded.
 * *Study* is a card player, exactly as sequential and spatial are, so it steps
 * through the shape groups one at a time and each step moves one card's
 * schedule. The two were the same rendering, which made contextual study a
 * second peek that answered three cards on one rating it then dropped: the
 * fence's own ID is not a card the store holds, so `recordRating` skipped it.
 */
const TWO_GROUPS = [
	"id: bridge",
	"occlude-a:",
	"  mode: hide-all-guess-one",
	"  shapes:",
	"    - group: c1",
	"      kind: rect",
	"      x: 0.31",
	"      y: 0.22",
	"      w: 0.14",
	"      h: 0.06",
	"    - group: c2",
	"      kind: rect",
	"      x: 0.6",
	"      y: 0.5",
	"      w: 0.1",
	"      h: 0.1",
	"",
	"![[bridge.svg]]{a}",
].join("\n");

const NOTE = "notes/bridges.md";

function groupCard(group: string): Card {
	return {
		id: `bridge-${group}`,
		notePath: NOTE,
		deck: "tests",
		cardType: "occlusion",
		front: "",
		back: "",
		typeIn: false,
		sourceLine: 0,
		occlusion: { image: "bridge.svg", mode: "hide-all-guess-one", shapes: [], target: group },
	};
}

/** The reviews a render's rating buttons actually recorded. */
interface Harness {
	el: HTMLElement;
	reviews: { cardId: string; rating: number }[];
	/** The keys handed to the session's progress pill, which counts fences. */
	ratedFences: string[];
	/**
	 * Draw the same fence again into the same element, as Obsidian does whenever
	 * the file changes — which a rating does, since flushing a schedule rewrites
	 * the note. The processor is kept, because the session state that has to
	 * survive that lives on it.
	 */
	rerender: () => void;
}

/** `cards` is read on every call, so a test can move a schedule mid-session. */
function renderFence(source: string, mode: "off" | "study", cards: Card[] = []): Harness {
	const reviews: { cardId: string; rating: number }[] = [];
	const ratedFences: string[] = [];
	const plugin = {
		app: {
			metadataCache: {
				getFirstLinkpathDest: (linkpath: string) =>
					linkpath === "bridge.svg" ? { path: linkpath } : null,
			},
			vault: { getResourcePath: (file: { path: string }) => `app://vault/${file.path}` },
		},
		cardStore: {
			getCardsByNote: () => cards,
			getCard: (id: string) => cards.find((card) => card.id === id),
		},
		// Mirrors the real processor: during a session the fences the scheduler
		// picked out are the questions, and only those take a rating.
		lineReveal: {
			revealMode: () => mode,
			isFenceTarget: (_path: string, fenceId: string) =>
				mode === "study" && dueOrNewFenceCardKeys(cards, Date.now()).has(fenceId),
			markFenceRated: (_path: string, key: string) => ratedFences.push(key),
		},
		createSessionManager: () => ({
			recordReview: (cardId: string, rating: number) => {
				reviews.push({ cardId, rating });
				return Promise.resolve();
			},
		}),
		refreshDashboard: () => { /* no dashboard in a test */ },
	} as unknown as OsmosisPlugin;

	const processor = new ContextualStudyProcessor(plugin);
	const el = document.createElement("div");
	const render = (): void => {
		el.replaceChildren();
		(processor as unknown as {
			renderCard: (s: string, e: HTMLElement, p: string) => void;
		}).renderCard(source, el, NOTE);
	};
	render();
	return { el, reviews, ratedFences, rerender: render };
}

/** The group each painted mask belongs to, by the role class the renderer gave it. */
function maskRoles(el: HTMLElement): string[] {
	return Array.from(el.querySelectorAll(".osmosis-occlusion-mask:not(.osmosis-hidden *)"))
		.map((mask) =>
			mask.classList.contains("is-target")
				? "target"
				: mask.classList.contains("is-revealed") ? "revealed" : "hidden",
		);
}

/** The step counter's text, or null on a card that is not stepping. */
function stepCount(el: HTMLElement): string | null {
	return el.querySelector(".osmosis-contextual-step")?.textContent ?? null;
}

describe("an occluded fence in contextual study", () => {
	it("singles out one shape group at a time instead of blanking them all", () => {
		const { el } = renderFence(TWO_GROUPS, "study", [groupCard("c1"), groupCard("c2")]);

		// `hide-all-guess-one`: c1 is the question, c2 stays covered as its sibling.
		// Not two anonymous blanks, which is what a reader gets in peek.
		expect(maskRoles(el)).toEqual(["target", "hidden"]);
		expect(stepCount(el)).toBe("1/2");
	});

	it("advances to the next group when the first is rated", () => {
		const { el, reviews } = renderFence(TWO_GROUPS, "study", [groupCard("c1"), groupCard("c2")]);

		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		// Revealing rings the group that was asked rather than clearing it, so the
		// answer still says where the question was.
		expect(maskRoles(el)).toEqual(["revealed", "hidden"]);

		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();

		// The rating reached the *group's* card. Rating the fence ID recorded
		// nothing at all: no such card exists for an occluded fence.
		expect(reviews).toEqual([{ cardId: "bridge-c1", rating: 3 }]);
		expect(stepCount(el)).toBe("2/2");
		expect(maskRoles(el)).toEqual(["hidden", "target"]);
	});

	it("reports the diagram as rated once every group has been answered", () => {
		const { el, reviews } = renderFence(TWO_GROUPS, "study", [groupCard("c1"), groupCard("c2")]);

		for (let i = 0; i < 2; i++) {
			el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
			el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();
		}

		expect(reviews.map((review) => review.cardId)).toEqual(["bridge-c1", "bridge-c2"]);
		expect(el.querySelector(".osmosis-contextual-rated")?.textContent).toBe("Rated");
		// Back to what the note shows outside study: every region ringed, so the
		// finished card still says where all the questions were.
		expect(maskRoles(el)).toEqual(["revealed", "revealed"]);
	});

	it("advances the pill on the fence key, not on the group that was rated", () => {
		const { el, ratedFences } = renderFence(TWO_GROUPS, "study", [groupCard("c1"), groupCard("c2")]);

		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();

		// A session's targets are fence keys. Handing the pill `bridge-c1` matched
		// no target, so it silently stayed put for the whole diagram.
		expect(ratedFences).toEqual(["bridge"]);
	});

	it("skips a group the scheduler would not ask now", () => {
		const later = { ...groupCard("c2"), due: Date.now() + 60_000 };
		const { el } = renderFence(TWO_GROUPS, "study", [groupCard("c1"), later]);

		// One due group out of two is one question, not two — the rule spatial
		// study already applies when it splits a node.
		expect(stepCount(el)).toBe("1/1");
	});

	it("shows the answer beneath the question when the note is not being studied", () => {
		const { el } = renderFence(TWO_GROUPS, "off", [groupCard("c1"), groupCard("c2")]);

		// Reading mode draws what live preview draws: the masked diagram, then the
		// unmasked one below it. Hiding an answer outright belongs to peek and
		// study — a reader scrolling past a note is not being asked anything.
		// No group is singled out on either, because nothing is being answered.
		expect(maskRoles(el)).toEqual(["hidden", "hidden", "revealed", "revealed"]);
		expect(stepCount(el)).toBeNull();
	});

	it("takes no rating and no clicks while the note is only being read", () => {
		const { el, reviews } = renderFence(TWO_GROUPS, "off", [groupCard("c1"), groupCard("c2")]);

		// The answer is already on screen, so clicking must not repaint the top
		// diagram to match it and leave the same picture up twice.
		el.querySelector<HTMLElement>(".osmosis-contextual-card")?.click();

		expect(maskRoles(el)).toEqual(["hidden", "hidden", "revealed", "revealed"]);
		expect(el.querySelector(".osmosis-contextual-rating")).toBeNull();
		expect(reviews).toEqual([]);
	});

	it("renders the fence's prose once, so an unoccluded diagram is not embedded twice", () => {
		// An occluded fence's two sides are the same markdown: the question is put
		// by the masks, not by withholding text. Drawing a side each would put the
		// elevation on screen twice and load it twice with it.
		const source = TWO_GROUPS.replace(
			"![[bridge.svg]]{a}",
			"The section, then the elevation.\n![[bridge.svg]]{a}\n![[span.svg]]",
		);
		const { el } = renderFence(source, "study", [groupCard("c1"), groupCard("c2")]);

		expect(el.textContent?.split("![[span.svg]]").length).toBe(2);
	});

	it("keeps the same image element from question to answer to next group", () => {
		// The scroll bug: redrawing the card rebuilt its `<img>`, which has no
		// height until the picture decodes again, so the note shortened under the
		// reader and reading view scrolled them off the diagram — on reveal and
		// again on rating. Repainting keeps the box exactly where it was.
		const { el } = renderFence(TWO_GROUPS, "study", [groupCard("c1"), groupCard("c2")]);
		const img = el.querySelector("img");

		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		expect(el.querySelector("img")).toBe(img);

		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();
		expect(el.querySelector("img")).toBe(img);
	});

	it("keeps its place in the sequence when the note re-renders mid-session", () => {
		const cards = [groupCard("c1"), groupCard("c2")];
		const { el, rerender } = renderFence(TWO_GROUPS, "study", cards);

		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();
		// Rating `c1` pushed it out of the due window, and flushing that schedule
		// rewrites the note — so Obsidian rebuilds the code block.
		cards[0] = { ...cards[0]!, due: Date.now() + 60_000 };
		rerender();

		// Still the second of two questions. Recomputing the sequence per render
		// dropped the answered group and renumbered what was left, so the card
		// came back claiming to be finished with `c2` never asked.
		expect(stepCount(el)).toBe("2/2");
		expect(maskRoles(el)).toEqual(["hidden", "target"]);
	});

	it("leaves a group with no card in the store out of the sequence", () => {
		// Sync has not caught up, or the fence has no `id:` to derive IDs from.
		// A question whose rating goes nowhere is not one worth asking.
		const { el } = renderFence(TWO_GROUPS, "study", [groupCard("c1")]);

		expect(stepCount(el)).toBe("1/1");
	});
});

/**
 * A fence rendered from the cards the store holds, rather than from a second
 * derivation of its source.
 *
 * The generator mints one card per cloze group (`<fenceId>-c1`, `-c2`, …) and a
 * pair for a bidirectional fence (`<fenceId>` and `-r`), each carrying a fully
 * rendered front and back. Reading view used to re-derive its own front and back
 * from the fence text and rate the *fence's* ID — which for anything that fans
 * out is not a card the store holds, so `recordRating` hit its "card not in
 * store" guard and every cloze review taken in a note was silently discarded.
 */
describe("a fence whose cards the store holds", () => {
	const CLOZE = [
		"id: rivers",
		"",
		"The ==c1:Nile== drains into the ==c2:Mediterranean==.",
	].join("\n");

	const PASSAGE = "The ==Nile== drains into the ==Mediterranean==.";

	/** As `generateExplicitCards` writes it: one group blanked, the rest intact. */
	function clozeCard(group: number, front: string): Card {
		return {
			id: `rivers-c${String(group)}`,
			notePath: NOTE,
			deck: "tests",
			cardType: "explicit_cloze",
			front,
			back: PASSAGE,
			typeIn: false,
			sourceLine: 0,
		};
	}

	const C1 = clozeCard(1, `The ${CLOZE_BLANK} drains into the ==Mediterranean==.`);
	const C2 = clozeCard(2, `The ==Nile== drains into the ${CLOZE_BLANK}.`);

	function frontText(el: HTMLElement): string {
		return el.querySelector(".osmosis-contextual-front")?.textContent ?? "";
	}

	it("records a cloze review against the group's own card, not the fence", () => {
		const { el, reviews } = renderFence(CLOZE, "study", [C1, C2]);

		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();

		// `rivers` is not a card. Rating it recorded nothing at all, so the
		// schedule never moved and the passage came back next session unanswered.
		expect(reviews).toEqual([{ cardId: "rivers-c1", rating: 3 }]);
	});

	it("advances the pill on the fence key, not on the card that was rated", () => {
		const { el, ratedFences } = renderFence(CLOZE, "study", [C1, C2]);

		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();

		// The session's targets are fence keys, so handing it `rivers-c1` left the
		// pill stuck and the session never recognised itself as finished.
		expect(ratedFences).toEqual(["rivers"]);
	});

	it("asks the question the generator wrote, not one re-derived here", () => {
		const { el } = renderFence(CLOZE, "study", [C1, C2]);

		// One group blanked. The derivation blanked *every* group at once and
		// called that one question, which is not a question any card asks.
		expect(frontText(el)).toBe(C1.front);
	});

	it("asks every group the fence derived, one at a time", () => {
		const { el, reviews } = renderFence(CLOZE, "study", [C1, C2]);

		expect(stepCount(el)).toBe("1/2");
		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();

		// The second group is a question in its own right, with its own schedule.
		// Asking only the first left `c2` and `c3` reachable in sequential alone.
		expect(stepCount(el)).toBe("2/2");
		expect(frontText(el)).toBe(C2.front);

		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();

		expect(reviews).toEqual([
			{ cardId: "rivers-c1", rating: 3 },
			{ cardId: "rivers-c2", rating: 3 },
		]);
		expect(el.querySelector(".osmosis-contextual-rated")?.textContent).toBe("Rated");
	});

	it("counts each group as a question of the session, not the fence once", () => {
		const { el, ratedFences } = renderFence(CLOZE, "study", [C1, C2]);

		for (let i = 0; i < 2; i++) {
			el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
			el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();
		}

		// Twice on the fence key: the pill counts questions, and the session's
		// targets are fences. Handing it the card IDs matched no target at all.
		expect(ratedFences).toEqual(["rivers", "rivers"]);
	});

	it("asks both directions of a bidirectional fence, forward first", () => {
		const BIDI = ["id: capital", "bidi: true", "", "France", "***", "Paris"].join("\n");
		const forward: Card = {
			id: "capital",
			notePath: NOTE,
			deck: "tests",
			cardType: "explicit_bidi",
			front: "France",
			back: "Paris",
			typeIn: false,
			sourceLine: 0,
		};
		const reverse: Card = { ...forward, id: "capital-r", front: "Paris", back: "France" };
		const { el, reviews } = renderFence(BIDI, "study", [forward, reverse]);

		expect(frontText(el)).toBe("France");
		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();

		// The reverse used to be reachable in sequential study and nowhere else.
		expect(frontText(el)).toBe("Paris");
		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();

		expect(reviews).toEqual([
			{ cardId: "capital", rating: 3 },
			{ cardId: "capital-r", rating: 3 },
		]);
	});

	it("keeps its place in the sequence when the note re-renders mid-session", () => {
		const cards = [C1, C2];
		const { el, rerender } = renderFence(CLOZE, "study", cards);

		el.querySelector<HTMLElement>(".osmosis-contextual-hidden")!.click();
		el.querySelector<HTMLElement>(".osmosis-rate-good")!.click();
		// Rating `c1` pushed it out of the due window, and any file change rebuilds
		// the code block's DOM.
		cards[0] = { ...C1, due: Date.now() + 60_000 };
		rerender();

		// Still on `c2`, and still the second of two. Re-resolving the plan would
		// drop the answered `c1`, leaving a fence that reports itself finished on
		// the answer to its first question.
		expect(frontText(el)).toBe(C2.front);
		expect(stepCount(el)).toBe("2/2");
	});

	it("shows no step counter on a fence that asks a single question", () => {
		const { el } = renderFence(CLOZE, "study", [C1]);

		// "1/1" says nothing the card does not already show.
		expect(stepCount(el)).toBeNull();
	});

	it("skips a card the scheduler would not ask now", () => {
		const notYet = { ...C1, due: Date.now() + 60_000 };
		const { el } = renderFence(CLOZE, "study", [notYet, C2]);

		// A fence is a target because *something* on it is due, so the question it
		// puts has to be one of the due ones.
		expect(frontText(el)).toBe(C2.front);
	});

	it("blanks every group at once while the note is only being read", () => {
		const { el } = renderFence(CLOZE, "off", [C1, C2]);

		// What live preview draws, and what the source says. Showing the *current
		// card's* blanking here — which is what playing a store card outside a
		// session gives you — hid `c2` from a reader who had started nothing.
		expect(frontText(el)).toBe(`The ${CLOZE_BLANK} drains into the ${CLOZE_BLANK}.`);
		expect(stepCount(el)).toBeNull();
	});

	it("falls back to the fence's own text when the store has no card for it", () => {
		// Never synced, or just typed. It renders as what it says, takes no rating,
		// and is not one of the session's questions.
		const { el, reviews } = renderFence(CLOZE, "study", []);

		el.querySelector<HTMLElement>(".osmosis-contextual-card")!.click();

		expect(frontText(el)).toBe(`The ${CLOZE_BLANK} drains into the ${CLOZE_BLANK}.`);
		expect(el.querySelector(".osmosis-contextual-rating")).toBeNull();
		expect(reviews).toEqual([]);
	});

	it("leaves an excluded fence on its own text, since its cards are disabled", () => {
		const disabled = [{ ...C1, disabled: true }, { ...C2, disabled: true }];
		const { el, reviews } = renderFence(CLOZE, "study", disabled);

		expect(frontText(el)).toBe(`The ${CLOZE_BLANK} drains into the ${CLOZE_BLANK}.`);
		expect(reviews).toEqual([]);
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

/**
 * What a note shows when nobody has started anything.
 *
 * Reading view used to hide every card's back and make the reader click each one
 * in turn, which turned an ordinary read of a card-bearing note into a quiz
 * nobody asked for. Hiding now belongs to peek and study alone: plain reading
 * mode draws what live preview draws, both sides in order.
 */
describe("a fence in plain reading mode", () => {
	const BASIC = [
		"id: basic1",
		"",
		"Which HTTP status code means the request succeeded but returned no body?",
		"***",
		"204 No Content.",
	].join("\n");

	const CLOZE = ["id: cloze1", "", "The ==Nile== is the longest river in ==Africa==."].join("\n");

	function basicCard(id: string): Card {
		return {
			id,
			notePath: NOTE,
			deck: "tests",
			cardType: "explicit",
			front: "",
			back: "",
			typeIn: false,
			sourceLine: 0,
		};
	}

	/** Present and not hidden — i.e. actually on screen. */
	function visible(el: HTMLElement, selector: string): boolean {
		const found = el.querySelector(selector);
		return found !== null && !found.classList.contains("osmosis-hidden");
	}

	it("shows a basic card's back without being asked", () => {
		const { el } = renderFence(BASIC, "off");

		expect(visible(el, ".osmosis-contextual-front")).toBe(true);
		expect(visible(el, ".osmosis-contextual-revealed")).toBe(true);
		expect(visible(el, ".osmosis-contextual-hidden")).toBe(false);
	});

	it("stacks a cloze card's blanked and filled-in halves, as live preview does", () => {
		const { el } = renderFence(CLOZE, "off");

		// Not collapsed onto the answer. Collapsing is what a reader gets after
		// *answering* a cloze — it keeps their eye on one body of text — and
		// nothing has been answered here.
		expect(visible(el, ".osmosis-contextual-front")).toBe(true);
		expect(visible(el, ".osmosis-study-divider")).toBe(true);
		expect(visible(el, ".osmosis-contextual-revealed")).toBe(true);
	});

	it("offers no rating, because reading is not answering", () => {
		const { el, reviews } = renderFence(BASIC, "off", [basicCard("basic1")]);

		el.querySelector<HTMLElement>(".osmosis-contextual-card")?.click();

		expect(el.querySelector(".osmosis-contextual-rating")).toBeNull();
		expect(reviews).toEqual([]);
	});

	it("hides the back of a card the session is asking", () => {
		// No `due` means never reviewed, which the scheduler counts as due now.
		const { el } = renderFence(BASIC, "study", [basicCard("basic1")]);

		expect(visible(el, ".osmosis-contextual-hidden")).toBe(true);
		expect(visible(el, ".osmosis-contextual-revealed")).toBe(false);
	});

	it("leaves a card the session is not asking fully readable", () => {
		const later = { ...basicCard("basic1"), due: Date.now() + 60_000 };
		const { el } = renderFence(BASIC, "study", [later]);

		// Context, not a question: a blank the reader could never clear is worse
		// than no blank at all.
		expect(visible(el, ".osmosis-contextual-hidden")).toBe(false);
		expect(visible(el, ".osmosis-contextual-revealed")).toBe(true);
	});
});
