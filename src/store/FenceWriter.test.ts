import { describe, it, expect } from "vitest";
import { generateExplicitCards } from "../card-gen/explicit";
import type { OcclusionShape } from "../database/types";
import {
	FenceWriter,
	updateFenceSchedule,
	updateFenceExclude,
	updateFenceOcclusion,
	removeFenceSchedule,
	removeFence,
	fenceHasOwnDeck,
	type ScheduleFields,
} from "./FenceWriter";

const baseSchedule: ScheduleFields = {
	stability: 4.5,
	difficulty: 5.2,
	due: new Date("2026-03-15T00:00:00.000Z").getTime(),
	lastReview: new Date("2026-03-10T00:00:00.000Z").getTime(),
	reps: 3,
	lapses: 0,
	state: "review",
	learningSteps: 0,
};

describe("updateFenceSchedule", () => {
	it("inserts schedule into fence with only id metadata", () => {
		const content = `\`\`\`osmosis
id: abc123

What is 2+2?
***
4
\`\`\``;

		const result = updateFenceSchedule(content, "abc123", baseSchedule);

		expect(result).toContain("id: abc123");
		expect(result).toContain("due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("stability: 4.5000");
		expect(result).toContain("difficulty: 5.2000");
		expect(result).toContain("reps: 3");
		expect(result).toContain("lapses: 0");
		expect(result).toContain("state: review");
		expect(result).toContain("lastReview: 2026-03-10T00:00:00.000Z");
		expect(result).toContain("learningSteps: 0");
		// Content should be preserved
		expect(result).toContain("What is 2+2?");
		expect(result).toContain("4");
	});

	it("updates existing schedule fields", () => {
		const content = `\`\`\`osmosis
id: abc123
due: 2026-01-01T00:00:00.000Z
stability: 1.0000
difficulty: 2.0000
reps: 1
lapses: 0
state: learning
last-review: 2025-12-30T00:00:00.000Z

What is 2+2?
***
4
\`\`\``;

		const result = updateFenceSchedule(content, "abc123", baseSchedule);

		expect(result).toContain("due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("stability: 4.5000");
		expect(result).toContain("reps: 3");
		// Should not duplicate keys
		const dueCount = (result.match(/^due:/gm) ?? []).length;
		expect(dueCount).toBe(1);
	});

	it("nests the schedule under `r:` for a bidi reverse card", () => {
		const content = `\`\`\`osmosis
id: abc123
bidi: true

Front
***
Back
\`\`\``;

		const result = updateFenceSchedule(content, "abc123-r", baseSchedule);

		expect(result).toContain("r:\n  due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("  stability: 4.5000");
		expect(result).toContain("  reps: 3");
		// Base schedule fields should not be present
		expect(result).not.toMatch(/^due:/m);
	});

	it("nests the schedule under `cN:` for cloze cards", () => {
		const content = `\`\`\`osmosis
id: abc123

The capital of ==France== is ==Paris==
\`\`\``;

		const result = updateFenceSchedule(content, "abc123-c1", baseSchedule);

		expect(result).toContain("c1:\n  due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("  stability: 4.5000");
	});

	it("nests the schedule under `cN:` for inline cloze cards", () => {
		const content = `\`\`\`\`osmosis
id: test-inline-02

\`\`\`python
def :::c1:greet:::(:::c2:name:::):
    return f"Hello, :::c2:name:::"
\`\`\`
\`\`\`\``;

		const result = updateFenceSchedule(content, "test-inline-02-c1", baseSchedule);

		expect(result).toContain("c1:\n  due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("  stability: 4.5000");
	});

	it("returns original content if fence not found", () => {
		const content = `\`\`\`osmosis
id: other123

Q
***
A
\`\`\``;

		const result = updateFenceSchedule(content, "abc123", baseSchedule);
		expect(result).toBe(content);
	});

	it("handles multiple fences, updates only the target", () => {
		const content = `\`\`\`osmosis
id: first

Q1
***
A1
\`\`\`

\`\`\`osmosis
id: second

Q2
***
A2
\`\`\``;

		const result = updateFenceSchedule(content, "second", baseSchedule);

		// First fence should be untouched
		const lines = result.split("\n");
		const firstFenceEnd = lines.indexOf("```", 1);
		const firstFenceContent = lines.slice(0, firstFenceEnd + 1).join("\n");
		expect(firstFenceContent).not.toContain("due:");

		// Second fence should have schedule
		expect(result).toContain("due: 2026-03-15T00:00:00.000Z");
	});

	it("ensures blank line between metadata and content when none exists", () => {
		const content = `\`\`\`osmosis
id: abc123
What is 2+2?
***
4
\`\`\``;

		const result = updateFenceSchedule(content, "abc123", baseSchedule);

		const lines = result.split("\n");
		// Find where metadata ends and content begins
		const contentIdx = lines.findIndex((l) => l.includes("What is 2+2?"));
		expect(lines[contentIdx - 1]!.trim()).toBe("");
	});

	it("does not double blank lines when separator already exists", () => {
		const content = `\`\`\`osmosis
id: abc123

What is 2+2?
***
4
\`\`\``;

		const result = updateFenceSchedule(content, "abc123", baseSchedule);

		// Count blank lines between last metadata and content
		const lines = result.split("\n");
		const contentIdx = lines.findIndex((l) => l.includes("What is 2+2?"));
		let blankCount = 0;
		for (let i = contentIdx - 1; i >= 0; i--) {
			if (lines[i]!.trim() === "") blankCount++;
			else break;
		}
		expect(blankCount).toBe(1);
	});

	it("preserves non-schedule metadata", () => {
		const content = `\`\`\`osmosis
id: abc123
deck: python/basics
hint: Think about it

Q
***
A
\`\`\``;

		const result = updateFenceSchedule(content, "abc123", baseSchedule);

		expect(result).toContain("deck: python/basics");
		expect(result).toContain("hint: Think about it");
		expect(result).toContain("due: 2026-03-15T00:00:00.000Z");
	});

	it("does not treat prose content lines containing colons as metadata", () => {
		// Regression: `The :::mito::: is…` matches `\w[\w-]*: .+`, and the old
		// scanner accepted any such line as metadata. Result was schedule keys
		// getting appended AFTER the content line, not before it.
		const content = [
			"```osmosis",
			"id: abc123",
			"",
			"The :::mitochondria::: is the powerhouse of the :::cell:::.",
			"```",
		].join("\n");

		const result = updateFenceSchedule(content, "abc123-c1", baseSchedule);
		const lines = result.split("\n");

		// Find the content line and the first schedule line
		const contentIdx = lines.findIndex((l) => l.includes(":::mitochondria:::"));
		const scheduleIdx = lines.findIndex((l) => l.startsWith("c1:"));

		expect(contentIdx).toBeGreaterThan(-1);
		expect(scheduleIdx).toBeGreaterThan(-1);
		// Schedule must appear BEFORE content, not after
		expect(scheduleIdx).toBeLessThan(contentIdx);
	});

	it("writes schedule into 4-backtick code cloze fence", () => {
		const content = `\`\`\`\`osmosis
id: codeclz
\n\`\`\`python
def fib(n):
    return n  # osmosis-cloze
\`\`\`
\`\`\`\``;

		const result = updateFenceSchedule(content, "codeclz-c1", baseSchedule);

		expect(result).toContain("c1:\n  due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("  stability: 4.5000");
		// Inner ``` should not be treated as fence end
		expect(result).toContain("```python");
		expect(result).toContain("def fib(n):");
	});
});

describe("updateFenceExclude", () => {
	it("adds exclude: true to a fence that has none", () => {
		const content = `\`\`\`osmosis
id: abc123

What is 2+2?
***
4
\`\`\``;

		const result = updateFenceExclude(content, "abc123", true);

		expect(result).toContain("exclude: true");
		expect(result).toContain("What is 2+2?");
	});

	it("inserts exclude: true after the id line", () => {
		const content = `\`\`\`osmosis
id: abc123
deck: math

Q
***
A
\`\`\``;

		const result = updateFenceExclude(content, "abc123", true);
		const lines = result.split("\n");
		const idIdx = lines.findIndex((l) => l.includes("id: abc123"));
		expect(lines[idIdx + 1]).toBe("exclude: true");
	});

	it("removes exclude line when setting to false", () => {
		const content = `\`\`\`osmosis
id: abc123
exclude: true

Q
***
A
\`\`\``;

		const result = updateFenceExclude(content, "abc123", false);

		expect(result).not.toContain("exclude");
		expect(result).toContain("Q");
	});

	it("no-ops when fence already has exclude: true and writing true", () => {
		const content = `\`\`\`osmosis
id: abc123
exclude: true

Q
***
A
\`\`\``;

		const result = updateFenceExclude(content, "abc123", true);
		expect(result).toBe(content);
	});

	it("no-ops when fence has no exclude and writing false", () => {
		const content = `\`\`\`osmosis
id: abc123

Q
***
A
\`\`\``;

		const result = updateFenceExclude(content, "abc123", false);
		expect(result).toBe(content);
	});

	it("works with derived card IDs (uses base fence ID)", () => {
		const content = `\`\`\`osmosis
id: abc123
bidi: true

Front
***
Back
\`\`\``;

		const result = updateFenceExclude(content, "abc123-r", true);
		expect(result).toContain("exclude: true");
	});

	it("returns original content if fence not found", () => {
		const content = `\`\`\`osmosis
id: other

Q
***
A
\`\`\``;

		const result = updateFenceExclude(content, "abc123", true);
		expect(result).toBe(content);
	});
});

describe("removeFenceSchedule", () => {
	it("removes the fence card's own schedule keys", () => {
		const content = `\`\`\`osmosis
id: abc123
due: 2026-03-15T00:00:00.000Z
stability: 4.5000
difficulty: 5.2000
reps: 3
lapses: 0
state: review
last-review: 2026-03-10T00:00:00.000Z
learning-steps: 0

Which strait separates Europe from Asia at Istanbul?
***
The Bosphorus
\`\`\``;

		const result = removeFenceSchedule(content, "abc123");

		expect(result).toContain("id: abc123");
		expect(result).not.toContain("due:");
		expect(result).not.toContain("stability:");
		expect(result).not.toContain("state: review");
		expect(result).toContain("The Bosphorus");
	});

	it("preserves non-schedule metadata", () => {
		const content = `\`\`\`osmosis
id: abc123
deck: geography
exclude: true
hint: a city on two continents
due: 2026-03-15T00:00:00.000Z
stability: 4.5000

Q
***
A
\`\`\``;

		const result = removeFenceSchedule(content, "abc123");

		expect(result).toContain("id: abc123");
		expect(result).toContain("deck: geography");
		expect(result).toContain("exclude: true");
		expect(result).toContain("hint: a city on two continents");
		expect(result).not.toContain("due:");
		expect(result).not.toContain("stability:");
	});

	// The sibling cases: one metadata block holds every card the fence generates,
	// so an unscoped removal is silent, irreversible data loss for the others.
	it("leaves a bidi reverse card's schedule alone when resetting the forward card", () => {
		const content = `\`\`\`osmosis
id: bidi01
bidi: true
due: 2026-03-15T00:00:00.000Z
stability: 4.5000
state: review
r-due: 2026-04-01T00:00:00.000Z
r-stability: 9.1000
r-state: review

Longest river in Africa
***
The Nile
\`\`\``;

		const result = removeFenceSchedule(content, "bidi01");

		expect(result).not.toContain("\ndue:");
		expect(result).not.toContain("\nstability:");
		expect(result).not.toContain("\nstate: review");
		expect(result).toContain("r-due: 2026-04-01T00:00:00.000Z");
		expect(result).toContain("r-stability: 9.1000");
		expect(result).toContain("r-state: review");
	});

	it("leaves the forward card's schedule alone when resetting the bidi reverse", () => {
		const content = `\`\`\`osmosis
id: bidi01
bidi: true
due: 2026-03-15T00:00:00.000Z
stability: 4.5000
r-due: 2026-04-01T00:00:00.000Z
r-stability: 9.1000

Longest river in Africa
***
The Nile
\`\`\``;

		const result = removeFenceSchedule(content, "bidi01-r");

		expect(result).toContain("due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("stability: 4.5000");
		expect(result).not.toContain("r-due:");
		expect(result).not.toContain("r-stability:");
	});

	it("resets one cloze group without touching its siblings", () => {
		const content = `\`\`\`osmosis
id: cloze1
c1-due: 2026-03-15T00:00:00.000Z
c1-stability: 4.5000
c1-reps: 3
c2-due: 2026-04-01T00:00:00.000Z
c2-stability: 9.1000
c2-reps: 7
c3-due: 2026-05-01T00:00:00.000Z

The ==Danube== rises in the Black Forest and empties into the ==Black Sea==.
\`\`\``;

		const result = removeFenceSchedule(content, "cloze1-c2");

		expect(result).toContain("c1-due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("c1-stability: 4.5000");
		expect(result).toContain("c1-reps: 3");
		expect(result).not.toContain("c2-due:");
		expect(result).not.toContain("c2-stability:");
		expect(result).not.toContain("c2-reps:");
		expect(result).toContain("c3-due: 2026-05-01T00:00:00.000Z");
	});

	it("does not mistake c10 for c1", () => {
		const content = `\`\`\`osmosis
id: cloze1
c1-due: 2026-03-15T00:00:00.000Z
c10-due: 2026-04-01T00:00:00.000Z

The ==first== and the ==tenth==.
\`\`\``;

		expect(removeFenceSchedule(content, "cloze1-c1")).toContain("c10-due:");
		expect(removeFenceSchedule(content, "cloze1-c1")).not.toContain("c1-due:");
		expect(removeFenceSchedule(content, "cloze1-c10")).toContain("c1-due:");
	});

	it("returns original content if fence not found", () => {
		const content = `\`\`\`osmosis
id: other
due: 2026-03-15T00:00:00.000Z

Q
***
A
\`\`\``;

		expect(removeFenceSchedule(content, "abc123")).toBe(content);
	});
});

describe("removeFence", () => {
	it("removes the whole fence and reports it", () => {
		const content = `# Rivers

Some prose above.

\`\`\`osmosis
id: abc123

Which river flows through ten countries?
***
The Danube
\`\`\`

Some prose below.`;

		const result = removeFence(content, "abc123");

		expect(result.removed).toBe(true);
		expect(result.content).not.toContain("osmosis");
		expect(result.content).not.toContain("The Danube");
		expect(result.content).toContain("Some prose above.");
		expect(result.content).toContain("Some prose below.");
	});

	it("collapses the blank lines the fence sat between", () => {
		const content = `Above.

\`\`\`osmosis
id: abc123

Q
***
A
\`\`\`

Below.`;

		const result = removeFence(content, "abc123");

		expect(result.content).toBe("Above.\n\nBelow.");
	});

	it("keeps a code cloze's inner fence from ending it early", () => {
		const content = `Above.

\`\`\`\`osmosis
id: codeclz

\`\`\`python
def river_length(name):
    return LENGTHS[name]  # osmosis-cloze
\`\`\`
\`\`\`\`

Below.`;

		const result = removeFence(content, "codeclz-c1");

		expect(result.removed).toBe(true);
		expect(result.content).toBe("Above.\n\nBelow.");
		expect(result.content).not.toContain("python");
	});

	it("removes the fence a derived card came from", () => {
		const content = `\`\`\`osmosis
id: bidi01
bidi: true

Longest river in Africa
***
The Nile
\`\`\``;

		expect(removeFence(content, "bidi01-r").content).toBe("");
		expect(removeFence(content, "bidi01-c2").content).toBe("");
	});

	it("leaves other fences in the note untouched", () => {
		const content = `\`\`\`osmosis
id: keep01

Kept question
***
Kept answer
\`\`\`

\`\`\`osmosis
id: drop01

Dropped question
***
Dropped answer
\`\`\``;

		const result = removeFence(content, "drop01");

		expect(result.content).toContain("id: keep01");
		expect(result.content).toContain("Kept answer");
		expect(result.content).not.toContain("Dropped question");
	});

	it("removes an unterminated fence through to the end of the file", () => {
		const content = `Above.

\`\`\`osmosis
id: abc123

Q
***
A`;

		const result = removeFence(content, "abc123");

		expect(result.removed).toBe(true);
		expect(result.content).toBe("Above.\n");
	});

	it("removes a fence at the very start of the note", () => {
		const content = `\`\`\`osmosis
id: abc123

Q
***
A
\`\`\`

Below.`;

		expect(removeFence(content, "abc123").content).toBe("Below.");
	});

	it("reports nothing removed when the fence is not found", () => {
		const content = `\`\`\`osmosis
id: other

Q
***
A
\`\`\``;

		const result = removeFence(content, "abc123");

		expect(result.removed).toBe(false);
		expect(result.content).toBe(content);
	});
});

describe("fenceHasOwnDeck", () => {
	it("is true when the fence declares a deck", () => {
		const content = `\`\`\`osmosis
id: arch02
deck: architecture/gothic

What element carries a Gothic vault's thrust to an outer pier?
***
The flying buttress
\`\`\``;

		expect(fenceHasOwnDeck(content, "arch02")).toBe(true);
	});

	it("is false when it does not", () => {
		const content = `\`\`\`osmosis
id: arch01

Which dome did Brunelleschi raise over Florence Cathedral?
***
Santa Maria del Fiore
\`\`\``;

		expect(fenceHasOwnDeck(content, "arch01")).toBe(false);
	});

	it("answers for a derived card via its base fence", () => {
		const content = `\`\`\`osmosis
id: cloze1
deck: architecture/gothic

The ==flying buttress== carries thrust to an ==outer pier==.
\`\`\``;

		expect(fenceHasOwnDeck(content, "cloze1-c2")).toBe(true);
	});

	it("does not read a deck line out of the card's content", () => {
		const content = `\`\`\`osmosis
id: abc123

What does the shipping label read?
***
deck: below the waterline
\`\`\``;

		expect(fenceHasOwnDeck(content, "abc123")).toBe(false);
	});

	it("is false when the fence is not found", () => {
		expect(fenceHasOwnDeck("no fences here", "abc123")).toBe(false);
	});
});

describe("occlusion fences", () => {
	/**
	 * The shape block opens with a valueless key and continues as indented
	 * lines — neither of which the metadata scans recognised before. Left
	 * unhandled, the scan ended at `occlude-a:`, and the schedule keys plus the
	 * blank line these writers append to separate metadata from content landed
	 * *inside* the block, cutting the shapes off from their header.
	 *
	 * The corruption is invisible in the text (every shape line is still
	 * present, just below a blank line) and only shows up on the next parse, so
	 * these assert on what the fence parses back to rather than on how it
	 * reads.
	 */
	const occlusionFence = `\`\`\`osmosis
id: bridge
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - { group: c1, kind: rect, x: 0.31, y: 0.22, w: 0.14, h: 0.06 }
    - { group: c2, kind: ellipse, x: 0.55, y: 0.4, rx: 0.08, ry: 0.05 }

![[bridge-cross-section.png]]{a}
\`\`\``;

	/** The shapes a fence still yields after a write, by group. */
	const shapesOf = (content: string): Record<string, number> => {
		const counts: Record<string, number> = {};
		const card = generateExplicitCards(content).find((c) => c.occlusion);
		for (const shape of card?.occlusion?.shapes ?? []) {
			counts[shape.group] = (counts[shape.group] ?? 0) + 1;
		}
		return counts;
	};

	it("still parses to the same shapes after a schedule write", () => {
		const result = updateFenceSchedule(occlusionFence, "bridge-c1", baseSchedule);

		expect(shapesOf(result)).toEqual({ c1: 1, c2: 1 });
		expect(generateExplicitCards(result).map((c) => c.id)).toEqual(["bridge-c1", "bridge-c2"]);
	});

	it("writes the group's schedule where the parser reads it back", () => {
		const result = updateFenceSchedule(occlusionFence, "bridge-c1", baseSchedule);
		const c1 = generateExplicitCards(result).find((c) => c.id === "bridge-c1")!;

		expect(c1.stability).toBeCloseTo(baseSchedule.stability, 4);
		expect(c1.due).toBe(baseSchedule.due);
		// ...and leaves its sibling new.
		expect(generateExplicitCards(result).find((c) => c.id === "bridge-c2")!.stability).toBeUndefined();
	});

	it("keeps the shape block contiguous, with the embed still in the content", () => {
		const lines = updateFenceSchedule(occlusionFence, "bridge-c1", baseSchedule).split("\n");
		const blockStart = lines.indexOf("occlude-a:");
		const lastShape = lines.findLastIndex((l) => l.trim().startsWith("- { group:"));

		expect(blockStart).toBeGreaterThan(-1);
		expect(lines.slice(blockStart, lastShape)).not.toContain("");
		expect(lines.at(-2)).toBe("![[bridge-cross-section.png]]{a}");
	});

	it("removes one group's schedule and leaves the shapes and its sibling alone", () => {
		const scheduled = updateFenceSchedule(
			updateFenceSchedule(occlusionFence, "bridge-c1", baseSchedule),
			"bridge-c2",
			baseSchedule,
		);
		const result = removeFenceSchedule(scheduled, "bridge-c1");

		expect(shapesOf(result)).toEqual({ c1: 1, c2: 1 });
		expect(generateExplicitCards(result).find((c) => c.id === "bridge-c1")!.stability).toBeUndefined();
		expect(generateExplicitCards(result).find((c) => c.id === "bridge-c2")!.stability).toBeCloseTo(4.5, 4);
	});

	it("suspends the fence without disturbing the shape block", () => {
		const result = updateFenceExclude(occlusionFence, "bridge-c1", true);

		expect(shapesOf(result)).toEqual({ c1: 1, c2: 1 });
		expect(generateExplicitCards(result).every((c) => c.disabled === true)).toBe(true);
	});

	it("finds the fence when the shape block precedes the id line", () => {
		const idLast = `\`\`\`osmosis
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - { group: c1, kind: rect, x: 0.31, y: 0.22, w: 0.14, h: 0.06 }
id: bridge

![[bridge-cross-section.png]]{a}
\`\`\``;
		const result = updateFenceSchedule(idLast, "bridge-c1", baseSchedule);

		expect(shapesOf(result)).toEqual({ c1: 1 });
		expect(generateExplicitCards(result)[0]!.stability).toBeCloseTo(4.5, 4);
	});

	it("deletes the whole fence, shapes included", () => {
		const { content, removed } = removeFence(occlusionFence, "bridge-c1");
		expect(removed).toBe(true);
		expect(content).not.toContain("occlude-a:");
		expect(content).not.toContain("group: c1");
	});
});

/**
 * Migration happens on write: a fence is rewritten only for the card being
 * reviewed, so a multi-group fence spends time half-converted. These assert on
 * what the fence *reparses to* rather than on its text — a string assertion
 * passes straight through the failure mode this format change risks, where the
 * separator blank line lands inside a block and severs it from its key.
 */
describe("schedule format migration", () => {
	const legacyFence = [
		"```osmosis",
		"id: bridge",
		"deck: Engineering/Bridges",
		"c1-due: 2026-08-10T11:53:55.956Z",
		"c1-stability: 0.0349",
		"c1-difficulty: 9.5929",
		"c1-reps: 3",
		"c1-lapses: 0",
		"c1-state: learning",
		"c1-last-review: 2026-08-10T11:52:55.956Z",
		"c1-learning-steps: 0",
		"c2-due: 2026-08-11T11:53:59.562Z",
		"c2-stability: 1.2000",
		"c3-due: 2026-08-12T11:54:03.101Z",
		"",
		"The ==Danube== rises in the ==Black Forest== and empties into the ==Black Sea==.",
		"```",
	].join("\n");

	/** The card the fence reparses to, by ID. */
	const reparse = (content: string, cardId: string) =>
		generateExplicitCards(content).find((card) => card.id === cardId)!;

	it("converts the reviewed group to a nested block and drops its flat keys", () => {
		const result = updateFenceSchedule(legacyFence, "bridge-c1", baseSchedule);

		expect(result).toContain("c1:\n  due: 2026-03-15T00:00:00.000Z");
		expect(result).not.toMatch(/^c1-/m);

		const c1 = reparse(result, "bridge-c1");
		expect(c1.due).toBe(baseSchedule.due);
		expect(c1.stability).toBe(4.5);
		expect(c1.reps).toBe(3);
		expect(c1.state).toBe("review");
		expect(c1.lastReview).toBe(baseSchedule.lastReview);
	});

	it("leaves the groups that were not reviewed in their flat form, intact", () => {
		const result = updateFenceSchedule(legacyFence, "bridge-c1", baseSchedule);

		expect(result).toContain("c2-due: 2026-08-11T11:53:59.562Z");
		expect(result).toContain("c3-due: 2026-08-12T11:54:03.101Z");

		expect(reparse(result, "bridge-c2").due).toBe(new Date("2026-08-11T11:53:59.562Z").getTime());
		expect(reparse(result, "bridge-c2").stability).toBe(1.2);
		expect(reparse(result, "bridge-c3").due).toBe(new Date("2026-08-12T11:54:03.101Z").getTime());
	});

	it("keeps the fence's content and other metadata below the migrated block", () => {
		const result = updateFenceSchedule(legacyFence, "bridge-c1", baseSchedule);

		expect(result).toContain("deck: Engineering/Bridges");
		expect(reparse(result, "bridge-c1").deck).toBe("Engineering/Bridges");
		expect(reparse(result, "bridge-c1").back)
			.toContain("The ==Danube== rises in the ==Black Forest== and empties into the ==Black Sea==.");
	});

	it("updates a nested block in place on the second write, rather than adding another", () => {
		const once = updateFenceSchedule(legacyFence, "bridge-c1", baseSchedule);
		const twice = updateFenceSchedule(once, "bridge-c1", {
			...baseSchedule,
			due: new Date("2026-09-01T00:00:00.000Z").getTime(),
			reps: 4,
		});

		expect((twice.match(/^c1:$/gm) ?? []).length).toBe(1);
		expect(reparse(twice, "bridge-c1").due).toBe(new Date("2026-09-01T00:00:00.000Z").getTime());
		expect(reparse(twice, "bridge-c1").reps).toBe(4);
		// The siblings still survive a second pass.
		expect(reparse(twice, "bridge-c2").stability).toBe(1.2);
	});

	it("migrates each group independently as it comes up for review", () => {
		const afterC1 = updateFenceSchedule(legacyFence, "bridge-c1", baseSchedule);
		const afterC2 = updateFenceSchedule(afterC1, "bridge-c2", {
			...baseSchedule,
			due: new Date("2026-10-01T00:00:00.000Z").getTime(),
		});

		expect(afterC2).not.toMatch(/^c2-/m);
		expect(afterC2).toContain("c3-due: 2026-08-12T11:54:03.101Z");
		expect(reparse(afterC2, "bridge-c1").due).toBe(baseSchedule.due);
		expect(reparse(afterC2, "bridge-c2").due).toBe(new Date("2026-10-01T00:00:00.000Z").getTime());
		expect(reparse(afterC2, "bridge-c3").due).toBe(new Date("2026-08-12T11:54:03.101Z").getTime());
	});

	it("never lands the metadata/content separator inside a block", () => {
		const noBlank = [
			"```osmosis",
			"id: bridge",
			"The ==Danube== rises in the Black Forest.",
			"```",
		].join("\n");
		const result = updateFenceSchedule(noBlank, "bridge-c1", baseSchedule);
		const lines = result.split("\n");

		// Every indented body line must still sit above the first blank line.
		const blankIdx = lines.findIndex((line) => line.trim() === "");
		const lastIndented = lines.reduce((acc, line, idx) => (/^\s+\S/.test(line) ? idx : acc), -1);
		expect(lastIndented).toBeLessThan(blankIdx);
		expect(reparse(result, "bridge-c1").due).toBe(baseSchedule.due);
	});

	it("migrates the fence's own card's field names to camelCase", () => {
		const content = [
			"```osmosis",
			"id: plain",
			"due: 2026-01-01T00:00:00.000Z",
			"last-review: 2025-12-30T00:00:00.000Z",
			"learning-steps: 2",
			"",
			"Front",
			"***",
			"Back",
			"```",
		].join("\n");
		const result = updateFenceSchedule(content, "plain", baseSchedule);

		expect(result).toContain("lastReview: 2026-03-10T00:00:00.000Z");
		expect(result).not.toContain("last-review:");
		expect(result).not.toContain("learning-steps:");
		expect((result.match(/lastReview:/g) ?? []).length).toBe(1);
		expect(reparse(result, "plain").lastReview).toBe(baseSchedule.lastReview);
	});

	it("does not reach into a sibling's nested block when writing the fence's own card", () => {
		const content = [
			"```osmosis",
			"id: bidi01",
			"bidi: true",
			"r:",
			"  due: 2026-04-01T00:00:00.000Z",
			"  stability: 9.1000",
			"",
			"Longest river in Africa",
			"***",
			"The Nile",
			"```",
		].join("\n");
		const result = updateFenceSchedule(content, "bidi01", baseSchedule);

		expect(reparse(result, "bidi01").due).toBe(baseSchedule.due);
		expect(reparse(result, "bidi01-r").due).toBe(new Date("2026-04-01T00:00:00.000Z").getTime());
		expect(reparse(result, "bidi01-r").stability).toBe(9.1);
	});

	it("removes a whole nested block, not just its key line", () => {
		const migrated = updateFenceSchedule(legacyFence, "bridge-c1", baseSchedule);
		const result = removeFenceSchedule(migrated, "bridge-c1");

		expect(result).not.toContain("c1:");
		expect(result).not.toContain("stability: 4.5000");
		expect(reparse(result, "bridge-c1").due).toBeUndefined();
		expect(reparse(result, "bridge-c1").stability).toBeUndefined();
		// Siblings survive.
		expect(reparse(result, "bridge-c2").stability).toBe(1.2);
		expect(reparse(result, "bridge-c3").due).toBe(new Date("2026-08-12T11:54:03.101Z").getTime());
	});

	it("does not strip a sibling's nested block when resetting the fence's own card", () => {
		const content = [
			"```osmosis",
			"id: bidi01",
			"bidi: true",
			"due: 2026-03-15T00:00:00.000Z",
			"stability: 4.5000",
			"r:",
			"  due: 2026-04-01T00:00:00.000Z",
			"  stability: 9.1000",
			"",
			"Longest river in Africa",
			"***",
			"The Nile",
			"```",
		].join("\n");
		const result = removeFenceSchedule(content, "bidi01");

		expect(reparse(result, "bidi01").due).toBeUndefined();
		expect(reparse(result, "bidi01-r").due).toBe(new Date("2026-04-01T00:00:00.000Z").getTime());
		expect(reparse(result, "bidi01-r").stability).toBe(9.1);
	});

	it("does not mistake a c10 block for c1", () => {
		const content = [
			"```osmosis",
			"id: cloze1",
			"c1:",
			"  due: 2026-03-15T00:00:00.000Z",
			"c10:",
			"  due: 2026-04-01T00:00:00.000Z",
			"",
			"The ==first== and the ==tenth==.",
			"```",
		].join("\n");
		const result = removeFenceSchedule(content, "cloze1-c1");

		expect(reparse(result, "cloze1-c1").due).toBeUndefined();
		// c10 has no cloze occurrence here, so it generates no card to reparse —
		// its block surviving in the text is the whole assertion.
		expect(result).toContain("c10:\n  due: 2026-04-01T00:00:00.000Z");
	});
});

/**
 * The editor's fence writer. These assert on the `OcclusionSet` a fence
 * *reparses to*, not on its text: the failure this format risks is the
 * separator blank line landing inside the shape block, which leaves every line
 * present and correct-looking while severing the shapes from their key.
 */
describe("updateFenceOcclusion", () => {
	const rect: OcclusionShape = { group: "c1", kind: "rect", x: 0.31, y: 0.22, w: 0.14, h: 0.06 };
	const ellipse: OcclusionShape = { group: "c2", kind: "ellipse", x: 0.55, y: 0.4, rx: 0.08, ry: 0.05 };

	/** Every shape the fence's occlusion cards carry, for one labelled embed. */
	const reparseShapes = (content: string, image: string): OcclusionShape[] =>
		generateExplicitCards(content).find((c) => c.occlusion?.image === image)?.occlusion?.shapes ?? [];

	const plainFence = `\`\`\`osmosis
id: bridge

![[bridge-cross-section.png]]{a}
\`\`\``;

	it("inserts a shape set into a fence that had none", () => {
		const result = updateFenceOcclusion(plainFence, "bridge", "a", {
			mode: "hide-all-guess-one",
			shapes: [rect, ellipse],
		});
		expect(reparseShapes(result, "bridge-cross-section.png")).toEqual([rect, ellipse]);
	});

	it("writes block mappings, matching the frontmatter carrier", () => {
		const result = updateFenceOcclusion(plainFence, "bridge", "a", {
			mode: "hide-all-guess-one",
			shapes: [rect],
		});
		expect(result).toContain("    - group: c1\n      kind: rect\n");
	});

	it("round-trips the mode", () => {
		const result = updateFenceOcclusion(plainFence, "bridge", "a", {
			mode: "hide-one-guess-one",
			shapes: [rect],
		});
		const card = generateExplicitCards(result).find((c) => c.occlusion);
		expect(card?.occlusion?.mode).toBe("hide-one-guess-one");
	});

	it("replaces the block on a second write instead of appending another", () => {
		const once = updateFenceOcclusion(plainFence, "bridge", "a", {
			mode: "hide-all-guess-one",
			shapes: [rect],
		});
		const moved: OcclusionShape = { ...rect, x: 0.5 };
		const twice = updateFenceOcclusion(once, "bridge", "a", {
			mode: "hide-all-guess-one",
			shapes: [moved],
		});
		expect(twice.match(/occlude-a:/g)).toHaveLength(1);
		expect(reparseShapes(twice, "bridge-cross-section.png")).toEqual([moved]);
	});

	it("keeps a second embed's shape set distinct and in place", () => {
		const twoEmbeds = `\`\`\`osmosis
id: bridge
occlude-b:
  mode: hide-all-guess-one
  shapes:
    - group: c5
      kind: rect
      x: 0.1
      y: 0.1
      w: 0.2
      h: 0.2

![[bridge-cross-section.png]]{a}
![[span-elevation.png]]{b}
\`\`\``;
		const result = updateFenceOcclusion(twoEmbeds, "bridge", "a", {
			mode: "hide-all-guess-one",
			shapes: [rect],
		});

		expect(reparseShapes(result, "bridge-cross-section.png")).toEqual([rect]);
		expect(reparseShapes(result, "span-elevation.png"))
			.toEqual([{ group: "c5", kind: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }]);
	});

	it("preserves a schedule block written before it", () => {
		const scheduled = updateFenceSchedule(plainFence, "bridge-c1", baseSchedule);
		const result = updateFenceOcclusion(scheduled, "bridge", "a", {
			mode: "hide-all-guess-one",
			shapes: [rect],
		});

		expect(reparseShapes(result, "bridge-cross-section.png")).toEqual([rect]);
		expect(generateExplicitCards(result).find((c) => c.id === "bridge-c1")?.due).toBe(baseSchedule.due);
	});

	it("removes the block when every shape is deleted", () => {
		const once = updateFenceOcclusion(plainFence, "bridge", "a", {
			mode: "hide-all-guess-one",
			shapes: [rect],
		});
		const cleared = updateFenceOcclusion(once, "bridge", "a", { mode: "hide-all-guess-one", shapes: [] });

		expect(cleared).not.toContain("occlude-a:");
		expect(generateExplicitCards(cleared).some((c) => c.occlusion)).toBe(false);
	});

	it("upgrades a flow-mapping block written before PR #20", () => {
		const flow = `\`\`\`osmosis
id: bridge
occlude-a:
  mode: hide-all-guess-one
  shapes:
    - { group: c1, kind: rect, x: 0.31, y: 0.22, w: 0.14, h: 0.06 }

![[bridge-cross-section.png]]{a}
\`\`\``;
		const result = updateFenceOcclusion(flow, "bridge", "a", {
			mode: "hide-all-guess-one",
			shapes: [rect, ellipse],
		});

		expect(result).not.toContain("- {");
		expect(reparseShapes(result, "bridge-cross-section.png")).toEqual([rect, ellipse]);
	});

	it("writes the bare `occlude:` spelling for an unlabelled single embed", () => {
		const bare = `\`\`\`osmosis
id: bridge

![[bridge-cross-section.png]]
\`\`\``;
		const result = updateFenceOcclusion(bare, "bridge", "", {
			mode: "hide-all-guess-one",
			shapes: [rect],
		});

		expect(result).toContain("occlude:");
		expect(reparseShapes(result, "bridge-cross-section.png")).toEqual([rect]);
	});

	it("leaves content untouched when no fence carries the id", () => {
		expect(updateFenceOcclusion(plainFence, "missing", "a", {
			mode: "hide-all-guess-one",
			shapes: [rect],
		})).toBe(plainFence);
	});
});

describe("staged schedule writes", () => {
	const note = `\`\`\`osmosis
id: abc123

What is 2+2?
***
4
\`\`\`

\`\`\`osmosis
id: def456

Capital of France?
***
Paris
\`\`\``;

	/** A vault of one note, recording every modify so coalescing is visible. */
	function makeVault(content = note) {
		const files = new Map<string, string>([["notes/cards.md", content]]);
		const modifies: string[] = [];
		const vault = {
			getFileByPath: (path: string) =>
				files.has(path) ? ({ path } as import("obsidian").TFile) : null,
			cachedRead: (file: { path: string }) => Promise.resolve(files.get(file.path)!),
			modify: (file: { path: string }, data: string) => {
				files.set(file.path, data);
				modifies.push(file.path);
				return Promise.resolve();
			},
		};
		return {
			writer: new FenceWriter(vault as unknown as import("obsidian").Vault),
			files,
			modifies,
		};
	}

	// The point of the whole mechanism: rating a fence in reading view must not
	// rewrite the section the reader is looking at.
	it("leaves the note untouched until it is flushed", () => {
		const { writer, files, modifies } = makeVault();

		writer.stageSchedule("notes/cards.md", "abc123", baseSchedule);

		expect(modifies).toHaveLength(0);
		expect(files.get("notes/cards.md")).toBe(note);
		expect([...writer.getPendingSchedules("notes/cards.md").keys()]).toEqual(["abc123"]);
		expect(writer.pendingPaths()).toEqual(["notes/cards.md"]);
	});

	it("writes a whole session's ratings in a single modify", async () => {
		const { writer, files, modifies } = makeVault();

		writer.stageSchedule("notes/cards.md", "abc123", baseSchedule);
		writer.stageSchedule("notes/cards.md", "def456", { ...baseSchedule, reps: 7 });
		await writer.flush();

		expect(modifies).toEqual(["notes/cards.md"]);
		const written = files.get("notes/cards.md")!;
		expect(written).toContain("reps: 3");
		expect(written).toContain("reps: 7");
		expect(writer.pendingPaths()).toEqual([]);
	});

	it("keeps only the last rating of a card answered twice", async () => {
		const { writer, files, modifies } = makeVault();

		writer.stageSchedule("notes/cards.md", "abc123", baseSchedule);
		writer.stageSchedule("notes/cards.md", "abc123", { ...baseSchedule, reps: 9 });
		await writer.flush();

		expect(modifies).toEqual(["notes/cards.md"]);
		expect(files.get("notes/cards.md")).toContain("reps: 9");
		expect(files.get("notes/cards.md")).not.toContain("reps: 3");
	});

	// An undone review on a new card. Staged rather than written through, so the
	// rating it reverts cannot resurrect it at flush time.
	it("flushes a staged removal after the rating it undoes", async () => {
		const { writer, files } = makeVault();

		writer.stageSchedule("notes/cards.md", "abc123", baseSchedule);
		writer.stageRemoveSchedule("notes/cards.md", "abc123");
		await writer.flush();

		expect(files.get("notes/cards.md")).toBe(note);
	});

	it("reports a staged removal as null so readers do not fall back to the fence", () => {
		const { writer } = makeVault();

		writer.stageRemoveSchedule("notes/cards.md", "abc123");

		expect(writer.getPendingSchedules("notes/cards.md").get("abc123")).toBeNull();
	});

	it("drops staged entries for a note that has since been deleted", async () => {
		const { writer, modifies } = makeVault();

		writer.stageSchedule("gone.md", "abc123", baseSchedule);
		await writer.flush();

		expect(modifies).toHaveLength(0);
		expect(writer.pendingPaths()).toEqual([]);
	});
});
