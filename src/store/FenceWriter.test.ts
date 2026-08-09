import { describe, it, expect } from "vitest";
import { generateExplicitCards } from "../card-gen/explicit";
import {
	updateFenceSchedule,
	updateFenceExclude,
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
		expect(result).toContain("last-review: 2026-03-10T00:00:00.000Z");
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

	it("writes prefixed keys for bidi reverse card", () => {
		const content = `\`\`\`osmosis
id: abc123
bidi: true

Front
***
Back
\`\`\``;

		const result = updateFenceSchedule(content, "abc123-r", baseSchedule);

		expect(result).toContain("r-due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("r-stability: 4.5000");
		expect(result).toContain("r-reps: 3");
		// Base schedule fields should not be present
		expect(result).not.toMatch(/^due:/m);
	});

	it("writes prefixed keys for cloze cards", () => {
		const content = `\`\`\`osmosis
id: abc123

The capital of ==France== is ==Paris==
\`\`\``;

		const result = updateFenceSchedule(content, "abc123-c1", baseSchedule);

		expect(result).toContain("c1-due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("c1-stability: 4.5000");
	});

	it("writes prefixed keys for inline cloze cards", () => {
		const content = `\`\`\`\`osmosis
id: test-inline-02

\`\`\`python
def :::c1:greet:::(:::c2:name:::):
    return f"Hello, :::c2:name:::"
\`\`\`
\`\`\`\``;

		const result = updateFenceSchedule(content, "test-inline-02-c1", baseSchedule);

		expect(result).toContain("c1-due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("c1-stability: 4.5000");
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
		const scheduleIdx = lines.findIndex((l) => l.startsWith("c1-due:"));

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

		expect(result).toContain("c1-due: 2026-03-15T00:00:00.000Z");
		expect(result).toContain("c1-stability: 4.5000");
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
