import { describe, it, expect } from "vitest";
import { updateFenceSchedule, type ScheduleFields } from "./FenceWriter";

const baseSchedule: ScheduleFields = {
	stability: 4.5,
	difficulty: 5.2,
	due: new Date("2026-03-15T00:00:00.000Z").getTime(),
	lastReview: new Date("2026-03-10T00:00:00.000Z").getTime(),
	reps: 3,
	lapses: 0,
	state: "review",
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
});
