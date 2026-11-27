import { describe, expect, it } from "vitest";
import { generateExplicitCards } from "../card-gen/explicit";
import { listFenceIds, stripFenceReviewState, writeFenceReviewState } from "./FenceWriter";
import { FENCES_FRONTMATTER_KEY, parseFenceEntry } from "./fence-sidecar";
import {
	MoveCheckError,
	extractFenceState,
	frontmatterOfText,
	injectFenceState,
	planIntoNote,
	planToSidecar,
	splitFrontmatter,
	type YamlCodec,
} from "./sidecar-move";

/** JSON is valid YAML, so it stands in for Obsidian's codec. */
const json: YamlCodec = { parse: (text) => JSON.parse(text) as unknown, stringify: (value) => `${JSON.stringify(value)}\n` };

function note(frontmatter: Record<string, unknown> | null, body: string): string {
	return frontmatter === null ? body : `---\n${JSON.stringify(frontmatter)}\n---\n${body}`;
}

/**
 * Fence headers in the layout the writers produce — whole-second ISO
 * timestamps, four-place numbers, block-mapping shapes — taken from the
 * `fence-card-types.md` and `occlusion.md` fixtures.
 */
const FENCES = `# Sailing drills

\`\`\`osmosis
id: fct-knots
c1:
  due: 2026-08-09T09:00:00.000Z
  stability: 4.2000
  difficulty: 5.9892
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-05T09:00:00.000Z
  learningSteps: 0
c2:
  due: 2026-08-10T09:00:00.000Z
  stability: 3.1000
  difficulty: 5.4000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-07T09:00:00.000Z
  learningSteps: 0
  buriedUntil: 2026-08-12T04:00:00.000Z

A ==c1:bowline== makes a fixed loop; a ==c2:cleat hitch== ties off to a cleat.
\`\`\`

\`\`\`osmosis
id: fct-points
bidi: true
deck: Sailing/Points
due: 2026-08-09T09:00:00.000Z
stability: 5.4000
difficulty: 5.1000
reps: 3
lapses: 0
state: review
lastReview: 2026-08-04T09:00:00.000Z
learningSteps: 0
r:
  due: 2026-08-08T09:00:00.000Z
  stability: 9.1000
  difficulty: 4.8000
  reps: 2
  lapses: 0
  state: review
  lastReview: 2026-08-06T09:00:00.000Z
  learningSteps: 0

Which point of sail has the wind directly behind?
***
A run.
\`\`\`

\`\`\`osmosis
id: fct-basic
exclude: true
type-in: true
due: 2026-08-10T09:00:00.000Z
stability: 6.7000
difficulty: 4.6000
reps: 3
lapses: 0
state: review
lastReview: 2026-08-03T09:00:00.000Z
learningSteps: 0

Which side of a boat is port?
***
The left, facing forward.
\`\`\`

\`\`\`osmosis
id: fct-new

Which knot joins two ropes of different thickness?
***
A sheet bend.
\`\`\`

\`\`\`osmosis
id: bridge-parts
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - group: c1
      kind: rect
      x: 0.1188
      y: 0.5225
      w: 0.1375
      h: 0.08
    - group: c2
      kind: ellipse
      x: 0.825
      y: 0.56
      rx: 0.065
      ry: 0.05
occlude-b:
  mode: hide-one-guess-one
  shapes:
    - group: c3
      kind: poly
      points: [[0.395, 0.505], [0.605, 0.505], [0.5, 0.36]]
c1:
  due: 2026-08-14T09:00:00.000Z
  stability: 2.5000
  difficulty: 6.0000
  reps: 1
  lapses: 0
  state: review
  lastReview: 2026-08-12T09:00:00.000Z
  learningSteps: 0

![[bridge-cross-section.svg]]{a}
![[span-elevation.svg]]{b}
\`\`\`
`;

const SCHEDULE = {
	"sail-01": { due: "2026-08-12T09:00:00", stability: 4.21, difficulty: 5.5, reps: 3, lapses: 0, state: "review", learningSteps: 0 },
};
const STYLES = { theme: "harbour", direction: "right" };

/** What the card generator reads off a text, minus line numbers (a move shifts them). */
function cards(content: string): unknown[] {
	return generateExplicitCards(content).map(({ sourceLine: _line, ...card }) => card);
}

describe("listFenceIds", () => {
	it("lists every fence id once, in order", () => {
		expect(listFenceIds(FENCES)).toEqual(["fct-knots", "fct-points", "fct-basic", "fct-new", "bridge-parts"]);
	});
});

describe("extractFenceState / injectFenceState", () => {
	it("round-trips canonical fences byte for byte", () => {
		const { content, fences } = extractFenceState(FENCES);
		expect(injectFenceState(content, fences)).toBe(FENCES);
	});

	it("leaves only the card's definition in each header", () => {
		const { content, fences } = extractFenceState(FENCES);
		expect(content).not.toMatch(/due:|stability:|buriedUntil:|exclude:|occlude|^c\d:|^r:/m);
		expect(content).toContain("id: fct-points\nbidi: true\ndeck: Sailing/Points\n\nWhich point");
		expect(content).toContain("id: fct-basic\ntype-in: true\n\nWhich side");
		expect(Object.keys(fences)).toEqual(["fct-knots", "fct-points", "fct-basic", "bridge-parts"]);
	});

	it("carries every card's state into the entries", () => {
		const { fences } = extractFenceState(FENCES);
		const knots = parseFenceEntry(fences["fct-knots"])!;
		expect(knots.cards.get("c2")?.buriedUntil).toBe(Date.parse("2026-08-12T04:00:00.000Z"));
		expect(knots.cards.get("c1")?.schedule?.due).toBe(Date.parse("2026-08-09T09:00:00.000Z"));
		expect(parseFenceEntry(fences["fct-basic"])!.exclude).toBe(true);
		const bridge = parseFenceEntry(fences["bridge-parts"])!;
		expect([...bridge.occlusions.keys()]).toEqual(["a", "b"]);
		expect(bridge.occlusions.get("a")!.shapes).toHaveLength(2);
	});

	it("generates the same cards after the round trip", () => {
		const { content, fences } = extractFenceState(FENCES);
		expect(cards(injectFenceState(content, fences))).toEqual(cards(FENCES));
	});

	it("skips an entry that is not a mapping, leaving the header alone", () => {
		expect(injectFenceState(FENCES, { "fct-basic": "garbled" })).toBe(FENCES);
	});
});

describe("writeFenceReviewState", () => {
	it("writes a schedule without lastReview, and a bury on a card with no schedule", () => {
		const content = "```osmosis\nid: abc\nbidi: true\n\nFront\n***\nBack\n```";
		const written = writeFenceReviewState(content, "abc", parseFenceEntry({
			due: "2026-08-09T09:00:00Z", stability: 1, difficulty: 5, reps: 1, lapses: 0, state: "review", learningSteps: 0,
			r: { buriedUntil: "2026-08-10T04:00:00Z" },
		})!);
		expect(written).toBe([
			"```osmosis", "id: abc", "bidi: true",
			"due: 2026-08-09T09:00:00.000Z", "stability: 1.0000", "difficulty: 5.0000",
			"reps: 1", "lapses: 0", "state: review", "learningSteps: 0",
			"r:", "  buriedUntil: 2026-08-10T04:00:00.000Z",
			"", "Front", "***", "Back", "```",
		].join("\n"));
	});

	it("replaces stale header state, legacy flat keys included", () => {
		const content = "```osmosis\nid: abc\nc1-due: 2026-01-01T00:00:00.000Z\nc1-reps: 4\nexclude: true\n\nA ==c1:jib== sheet.\n```";
		expect(stripFenceReviewState(content, "abc")).toBe("```osmosis\nid: abc\n\nA ==c1:jib== sheet.\n```");
		expect(writeFenceReviewState(content, "abc", parseFenceEntry({})!)).toBe("```osmosis\nid: abc\n\nA ==c1:jib== sheet.\n```");
	});
});

describe("splitFrontmatter", () => {
	it("splits off the block, empty or not", () => {
		expect(splitFrontmatter("---\n---\nBody")).toEqual({ block: "---\n---\n", yaml: "", body: "Body" });
		expect(splitFrontmatter("---\na: 1\n---\nBody").yaml).toBe("a: 1");
		expect(splitFrontmatter("No properties").block).toBeNull();
	});

	it("does not end the block at a `---` inside a line", () => {
		expect(splitFrontmatter("---\na: x---\nb: 2\n---\nBody").yaml).toBe("a: x---\nb: 2");
	});
});

describe("planToSidecar", () => {
	const original = note({ "osmosis-cards": true, "osmosis-schedule": SCHEDULE, "osmosis-styles": STYLES }, FENCES);

	it("moves the frontmatter keys and the fence state out of the note", () => {
		const plan = planToSidecar(original, undefined, json);
		expect(plan.moved).toBe(true);
		expect(frontmatterOfText(plan.note, json)).toEqual({ "osmosis-cards": true });
		expect(plan.note).not.toMatch(/due:|occlude/);
		expect(plan.sidecar["osmosis-schedule"]).toEqual(SCHEDULE);
		expect(plan.sidecar["osmosis-styles"]).toEqual(STYLES);
		expect(Object.keys(plan.sidecar[FENCES_FRONTMATTER_KEY] as object)).toEqual(["fct-knots", "fct-points", "fct-basic", "bridge-parts"]);
	});

	it("keeps the sidecar's data where both hold some", () => {
		const newer = { ...SCHEDULE["sail-01"], reps: 4 };
		const sidecar = {
			"osmosis-note": "[[Drills]]",
			"osmosis-schedule": { "sail-01": newer, "sail-02": newer },
			"osmosis-styles": { theme: "fog" },
			[FENCES_FRONTMATTER_KEY]: { "fct-basic": {} },
		};
		const plan = planToSidecar(original, sidecar, json);
		expect(plan.sidecar["osmosis-schedule"]).toEqual({ "sail-01": newer, "sail-02": newer });
		expect(plan.sidecar["osmosis-styles"]).toEqual({ theme: "fog" });
		// The emptied entry owns its fence: the header's stale `exclude` does not come back.
		expect((plan.sidecar[FENCES_FRONTMATTER_KEY] as Record<string, unknown>)["fct-basic"]).toEqual({});
		expect(plan.note).toContain("id: fct-basic\ntype-in: true\n\n");
	});

	it("leaves untouched properties' text as it was", () => {
		const raw = `---\nosmosis-cards: true # keep me\n---\n${FENCES}`;
		const plan = planToSidecar(raw, undefined, { parse: () => ({ "osmosis-cards": true }), stringify: () => "never\n" });
		expect(plan.note.startsWith("---\nosmosis-cards: true # keep me\n---\n")).toBe(true);
	});

	it("reports nothing to move for a note with no data", () => {
		const plain = note({ "osmosis-cards": true }, "```osmosis\nid: fct-new\n\nQ\n***\nA\n```\n");
		const plan = planToSidecar(plain, undefined, json);
		expect(plan).toEqual({ note: plain, sidecar: {}, moved: false });
	});

	it("refuses a plan whose written properties would read back differently", () => {
		const lossy: YamlCodec = { parse: (text) => json.parse(text), stringify: (value) => json.stringify({ ...(value as object), "osmosis-schedule": { "sail-99": SCHEDULE["sail-01"] } }) };
		expect(() => planToSidecar(note({ "osmosis-cards": true, "osmosis-styles": STYLES }, FENCES), undefined, lossy)).toThrow(MoveCheckError);
	});

	it("refuses properties that are not a mapping", () => {
		expect(() => planToSidecar("---\n[\"osmosis-schedule\"]\n---\nBody", undefined, json)).toThrow(MoveCheckError);
	});

	it("leaves a note with no data alone, whatever its properties", () => {
		expect(planToSidecar("---\nnot: [valid\n---\nBody", undefined, json).moved).toBe(false);
	});
});

describe("planIntoNote", () => {
	it("round-trips note → sidecar → note", () => {
		const original = note({ "osmosis-cards": true, "osmosis-schedule": SCHEDULE, "osmosis-styles": STYLES }, FENCES);
		const out = planToSidecar(original, undefined, json);
		const back = planIntoNote(out.note, { "osmosis-note": "[[Drills]]", ...out.sidecar }, json);
		expect(back.dropped).toBe(0);
		expect(back.note).toBe(original);
	});

	it("takes the sidecar's side of a half-moved note", () => {
		const half = note({ "osmosis-cards": true, "osmosis-styles": STYLES }, FENCES);
		const back = planIntoNote(half, {
			"osmosis-styles": { theme: "fog" },
			[FENCES_FRONTMATTER_KEY]: { "fct-basic": { due: "2026-09-01T09:00:00Z", stability: 9, difficulty: 4, reps: 5, lapses: 0, state: "review", learningSteps: 0 } },
		}, json);
		expect(frontmatterOfText(back.note, json)["osmosis-styles"]).toEqual({ theme: "fog" });
		// The entry owns the fence: its schedule replaces the header's, and the header's `exclude` goes.
		expect(back.note).toContain("id: fct-basic\ntype-in: true\ndue: 2026-09-01T09:00:00.000Z\n");
		expect(back.note).not.toContain("exclude: true");
		// A fence with no entry keeps its header.
		expect(back.note).toContain("r:\n  due: 2026-08-08T09:00:00.000Z");
	});

	it("drops entries for fences the note no longer has, and counts them", () => {
		const back = planIntoNote(note({ "osmosis-cards": true }, FENCES), {
			[FENCES_FRONTMATTER_KEY]: { gone1: { exclude: true }, gone2: {}, "fct-new": { exclude: true } },
		}, json);
		expect(back.dropped).toBe(2);
		expect(back.note).toContain("id: fct-new\nexclude: true\n");
	});

	it("refuses a plan whose note would read back without its schedule", () => {
		const lossy: YamlCodec = { parse: (text) => json.parse(text), stringify: (value) => json.stringify({ ...(value as object), "osmosis-schedule": {} }) };
		expect(() => planIntoNote(note({ "osmosis-cards": true }, FENCES), { "osmosis-schedule": SCHEDULE }, lossy)).toThrow(MoveCheckError);
	});

	it("pins a note with no frontmatter data to note mode", () => {
		const back = planIntoNote("```osmosis\nid: fct-new\n\nQ\n***\nA\n```\n", { [FENCES_FRONTMATTER_KEY]: { "fct-new": { exclude: true } } }, json);
		expect(frontmatterOfText(back.note, json)).toEqual({ "osmosis-schedule": {} });
	});

	it("folds the note's own osmosis-fences into the headers", () => {
		const back = planIntoNote(note({ [FENCES_FRONTMATTER_KEY]: { "fct-new": { exclude: true } }, "osmosis-schedule": SCHEDULE }, FENCES), {}, json);
		expect(frontmatterOfText(back.note, json)).toEqual({ "osmosis-schedule": SCHEDULE });
		expect(back.note).toContain("id: fct-new\nexclude: true\n");
	});
});
