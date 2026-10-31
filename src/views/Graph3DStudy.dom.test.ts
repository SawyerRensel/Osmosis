// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import "../test/obsidian-stub";
import type { Card } from "../database/types";
import type { GraphModel, GraphNode } from "../graph3d/model";
import type OsmosisPlugin from "../main";
import type { OsmosisNode } from "../types";
import { Graph3DStudy, type StudyHost } from "./Graph3DStudy";

/**
 * The session's bookkeeping, driven the way the view drives it. Two things are
 * pinned here because only the session can get them wrong:
 * - the current card survives its node being re-created under a new ID (writing
 *   a rating into a fence changes the fence's text, so its parse ID), and
 * - the due-driven path collects cards beyond the loaded area, flies to them in
 *   hop order and records the thread.
 */

const NOW = Date.now();
const DAY = 86_400_000;
const HOME = "tests/Harbour Rules.md";
const DRILLS = "tests/Crew Drills.md";
const FAR = "tests/Knots.md";

function card(overrides: Partial<Card> & { id: string }): Card {
	return { notePath: HOME, deck: "tests", cardType: "line", front: "front", back: "back", typeIn: false, sourceLine: 0, ...overrides };
}

function source(overrides: Partial<OsmosisNode>): OsmosisNode {
	return { id: "h", type: "bullet", depth: 0, content: "text", children: [], range: { start: 0, end: 10 }, ...overrides } as OsmosisNode;
}

function note(path: string): GraphNode {
	return { id: `note:${path}`, kind: "note", label: path, path, source: source({ type: "root" }) };
}

function lineNode(path: string, blockId: string): GraphNode {
	return { id: `line:${path}#^${blockId}`, kind: "line", label: blockId, path, source: source({ blockId, content: blockId, raw: blockId }) };
}

/** A cloze fence; `version` stands for the schedule written into its text, which changes the node's ID. */
function fenceNode(path: string, id: string, version: number): GraphNode {
	const content = `\`\`\`osmosis\nid: ${id}\nc1:\n  reps: ${String(version)}\n\nOne ==c1:two== ==c2:three==\n\`\`\``;
	return { id: `line:${path}#f${String(version)}`, kind: "line", label: content, path, source: source({ id: `f${String(version)}`, type: "codeblock", content, raw: content }) };
}

interface Harness {
	study: Graph3DStudy;
	host: StudyHost & { goTos: string[]; threads: (string | null)[][]; focus: string };
	/** Show a model, as the view hands it to the scene: through `decorate`. */
	show: (model: GraphModel) => GraphModel;
	panel: () => HTMLElement;
	rated: string[];
}

function harness(cards: Card[], loaded: string[], hops: Record<string, number>): Harness {
	const rated: string[] = [];
	const root = document.createElement("div");
	document.body.appendChild(root);
	const plugin = {
		isCardStoreReady: true,
		cardStoreReady: Promise.resolve(),
		cardStore: { getCardsByNote: (path: string) => cards.filter((c) => c.notePath === path) },
		createSessionManager: () => ({
			recordReview: (id: string): Promise<void> => {
				rated.push(id);
				return Promise.resolve();
			},
		}),
		refreshDashboard: () => undefined,
		scheduleStore: { flush: () => Promise.resolve() },
		reviewLog: { flush: () => Promise.resolve() },
	} as unknown as OsmosisPlugin;
	let shown: GraphModel = { nodes: [], edges: [] };
	const host = {
		goTos: [] as string[],
		threads: [] as (string | null)[][],
		focus: HOME,
		redraw: () => void study.decorate(shown),
		hop: () => undefined,
		nearest: (ids: readonly string[]) => ids[0] ?? null,
		focusPath() {
			return host.focus;
		},
		loadedNotes: () => loaded,
		hopsFrom: () => new Map(Object.entries(hops)),
		goTo(path: string) {
			host.goTos.push(path);
			host.focus = path;
		},
		thread(ids: readonly (string | null)[]) {
			host.threads.push([...ids]);
		},
	};
	const study = new Graph3DStudy(root, plugin, host);
	const show = (model: GraphModel): GraphModel => study.decorate((shown = model));
	return { study, host, show, panel: () => root.querySelector<HTMLElement>(".osmosis-graph3d-study")!, rated };
}

const model = (nodes: GraphNode[]): GraphModel => ({ nodes, edges: [] });
const buttonsOf = (el: HTMLElement): HTMLButtonElement[] => Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
const buttons = (el: HTMLElement): string[] => buttonsOf(el).map((b) => b.textContent ?? "");
const press = (el: HTMLElement, label: string): void => buttonsOf(el).find((b) => b.textContent === label)!.click();

beforeEach(() => {
	document.body.empty();
});

describe("the current card through a fence rewrite", () => {
	it("stays current when rating one blank re-creates the node under a new ID", async () => {
		const cards = [
			card({ id: "sounds-c1", cardType: "explicit_cloze", front: "One [...] three", back: "One two three", due: NOW - DAY }),
			card({ id: "sounds-c2", cardType: "explicit_cloze", front: "One two [...]", back: "One two three", due: NOW - DAY }),
		];
		const { study, host, show, rated } = harness(cards, [HOME], {});
		const before = fenceNode(HOME, "sounds", 0);
		const first = model([note(HOME), before]);
		study.start();
		show(first);
		study.clicked(before);
		expect(study.reveal()).toBe(true);
		await study.rate(3);
		expect(rated).toEqual(["sounds-c1"]);

		// The schedule flush lands: same fence, new text, new node ID.
		const after = fenceNode(HOME, "sounds", 1);
		expect(after.id).not.toBe(before.id);
		show(model([note(HOME), after]));
		// Space (reveal) works at once: the node is still the current card, now asking its second blank.
		expect(study.reveal()).toBe(true);
		expect(host.goTos).toEqual([]);
	});
});

describe("the due-driven path", () => {
	const cards = [
		card({ id: `${HOME}#^os-home`, blockId: "os-home", due: NOW - DAY, sourceLine: 5 }),
		card({ id: `${DRILLS}#^os-drill`, notePath: DRILLS, blockId: "os-drill", due: NOW - 2 * DAY }),
		card({ id: `${FAR}#^os-far`, notePath: FAR, blockId: "os-far", due: NOW - 9 * DAY }),
	];
	const hops = { [HOME]: 0, [DRILLS]: 1, [FAR]: 2 };
	// The route is collected from the notes within depth of the start (HOME and DRILLS); FAR is out of reach.
	const loaded = [HOME, DRILLS];

	it("offers the two paths and no dead third, and starts on free", () => {
		const { study, show, panel } = harness(cards, loaded, hops);
		study.start();
		show(model([note(HOME)]));
		expect(buttons(panel())).toEqual(["Free", "Due-driven", "Next"]);
		expect(panel().querySelector(".osmosis-graph3d-study-paths .mod-cta")?.textContent).toBe("Free");
	});

	it("collects cards beyond the loaded area, flies in hop order, and threads the visits", async () => {
		const { study, host, show, panel, rated } = harness(cards, loaded, hops);
		study.start();
		const home = model([note(HOME), lineNode(HOME, "os-home")]);
		show(home);
		press(panel(), "Due-driven");
		show(home);
		// Two cards on the route (FAR is beyond the depth of the start note), one in the loaded model.
		expect(panel().querySelector(".osmosis-graph3d-study-progress")?.textContent).toBe("0 reviewed · 2 to go");

		// First stop: the card in the note you stand on.
		press(panel(), "Next");
		expect(host.goTos).toEqual([HOME]);
		show(home);
		expect(study.reveal()).toBe(true);
		await study.rate(3);
		expect(rated).toEqual([`${HOME}#^os-home`]);

		// Second stop: its note is not in the model shown, so the session asks to go there.
		press(panel(), "Next");
		expect(host.goTos).toEqual([HOME, DRILLS]);
		const drills = model([note(DRILLS), lineNode(DRILLS, "os-drill"), note(HOME), lineNode(HOME, "os-home")]);
		show(drills);
		expect(study.reveal()).toBe(true); // Landed: the drill card is the current one.
		expect(host.threads[host.threads.length - 1]).toEqual([`note:${HOME}`, `line:${HOME}#^os-home`, `line:${DRILLS}#^os-drill`]);

		// Back in the home model the drills are not loaded, so the thread breaks there instead of bridging.
		await study.rate(3);
		show(home);
		expect(host.threads[host.threads.length - 1]).toEqual([`note:${HOME}`, `line:${HOME}#^os-home`, null]);
		expect(panel().querySelector(".osmosis-graph3d-study-progress")?.textContent).toBe("2 reviewed · 0 to go");
		expect(panel().textContent).toContain("The route is finished");
		expect(buttonsOf(panel()).find((b) => b.textContent === "Next")?.disabled).toBe(true);
	});

	it("hides only route cards, and draws no thread in free exploration", () => {
		const { study, host, show, panel } = harness([...cards, card({ id: `${FAR}#^os-also`, notePath: FAR, blockId: "os-also", due: NOW - DAY })], loaded, hops);
		study.start();
		const far = lineNode(FAR, "os-far");
		const wide = model([note(HOME), lineNode(HOME, "os-home"), note(FAR), far]);
		// Free exploration hides what is due anywhere in the loaded model.
		expect(show(wide).nodes.find((n) => n.id === far.id)?.label).toBe("?");
		press(panel(), "Due-driven");
		// Due-driven leaves a note outside the route showing.
		expect(show(wide).nodes.find((n) => n.id === far.id)?.label).toBe("os-far");
		press(panel(), "Free");
		expect(show(wide).nodes.find((n) => n.id === far.id)?.label).toBe("?");
		expect(host.threads[host.threads.length - 1]).toEqual([]);
	});
});
