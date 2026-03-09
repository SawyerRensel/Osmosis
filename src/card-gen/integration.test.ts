import { describe, it, expect, beforeEach } from "vitest";
import { CardStore } from "../store/CardStore";
import { FSRSScheduler } from "../database/FSRSScheduler";
import { processNote } from "./note-processor";
import type { Card } from "../database/types";

let store: CardStore;
let scheduler: FSRSScheduler;

beforeEach(() => {
	store = new CardStore();
	scheduler = new FSRSScheduler();
});

function syncCards(markdown: string, notePath = "test.md"): void {
	const result = processNote(markdown, notePath, {});
	if (!result.enabled) return;
	for (const genCard of result.cards) {
		const card: Card = {
			id: genCard.id,
			notePath,
			deck: genCard.deck,
			cardType: genCard.card_type,
			front: genCard.front,
			back: genCard.back,
			typeIn: genCard.typeIn,
			sourceLine: genCard.sourceLine,
			stability: genCard.stability,
			difficulty: genCard.difficulty,
			due: genCard.due,
			lastReview: genCard.lastReview,
			reps: genCard.reps,
			lapses: genCard.lapses,
			state: genCard.state,
		};
		store.addCard(card);
	}
}

describe("SR pipeline integration", () => {
	it("generate → store → schedule → review lifecycle", () => {
		const md = `---
osmosis-cards: true
---

\`\`\`osmosis
id: abc123

What is 2+2?
***
4
\`\`\`
`;
		syncCards(md);

		// Card should be in store as new
		const card = store.getCard("abc123");
		expect(card).toBeDefined();
		expect(card!.front).toContain("What is 2+2?");
		expect(card!.due).toBeUndefined(); // new card

		// Should appear in new cards
		expect(store.getNewCards()).toHaveLength(1);
		expect(store.getDueCards(Date.now())).toHaveLength(0);

		// Schedule and review
		const now = Date.now();
		const newSchedule = scheduler.createNewSchedule(now);
		const result = scheduler.review(newSchedule, 3, now); // Good

		store.updateSchedule("abc123", {
			stability: result.schedule.stability,
			difficulty: result.schedule.difficulty,
			due: result.schedule.due,
			lastReview: result.schedule.lastReview ?? now,
			reps: result.schedule.reps,
			lapses: result.schedule.lapses,
			state: result.schedule.state,
		});

		// Should now be scheduled, not new
		expect(store.getNewCards()).toHaveLength(0);
		const updated = store.getCard("abc123");
		expect(updated!.reps).toBe(1);
		expect(updated!.stability).toBeGreaterThan(0);
	});

	it("bidi cards are scheduled independently", () => {
		const md = `---
osmosis-cards: true
---

\`\`\`osmosis
id: bidi123
bidi: true

Front
***
Back
\`\`\`
`;
		syncCards(md);

		const forward = store.getCard("bidi123");
		const reverse = store.getCard("bidi123-r");
		expect(forward).toBeDefined();
		expect(reverse).toBeDefined();
		expect(forward!.cardType).toBe("explicit_bidi");
		expect(reverse!.cardType).toBe("explicit_bidi");

		// Review forward only
		const now = Date.now();
		const schedule = scheduler.createNewSchedule(now);
		const result = scheduler.review(schedule, 3, now);
		store.updateSchedule("bidi123", {
			stability: result.schedule.stability,
			difficulty: result.schedule.difficulty,
			due: result.schedule.due,
			lastReview: result.schedule.lastReview ?? now,
			reps: result.schedule.reps,
			lapses: result.schedule.lapses,
			state: result.schedule.state,
		});

		// Forward reviewed, reverse still new
		expect(store.getCard("bidi123")!.reps).toBe(1);
		expect(store.getCard("bidi123-r")!.reps).toBeUndefined();
	});

	it("cloze cards generate correctly", () => {
		const md = `---
osmosis-cards: true
---

\`\`\`osmosis
id: cloze123

The capital of ==France== is ==Paris==
\`\`\`
`;
		syncCards(md);

		const c1 = store.getCard("cloze123-c1");
		const c2 = store.getCard("cloze123-c2");
		expect(c1).toBeDefined();
		expect(c2).toBeDefined();
		expect(c1!.cardType).toBe("explicit_cloze");
		expect(c1!.front).toContain("########");
	});

	it("card content updates on source change", () => {
		const md1 = `---
osmosis-cards: true
---

\`\`\`osmosis
id: update123

Old front
***
Old back
\`\`\`
`;
		syncCards(md1);
		expect(store.getCard("update123")!.front).toContain("Old front");

		// Simulate update: re-sync with new content
		store.removeCardsByNote("test.md");
		const md2 = `---
osmosis-cards: true
---

\`\`\`osmosis
id: update123

New front
***
New back
\`\`\`
`;
		syncCards(md2);
		expect(store.getCard("update123")!.front).toContain("New front");
	});

	it("determinism: same note always produces same cards", () => {
		const md = `---
osmosis-cards: true
---

\`\`\`osmosis
id: det123

Q
***
A
\`\`\`
`;
		syncCards(md);
		const first = store.getCard("det123");
		expect(first).toBeDefined();

		// Re-sync
		store.removeCardsByNote("test.md");
		syncCards(md);
		const second = store.getCard("det123");
		expect(second).toBeDefined();
		expect(second!.front).toBe(first!.front);
		expect(second!.back).toBe(first!.back);
	});

	it("FSRS rating progression: Again < Hard < Good < Easy intervals", () => {
		const now = Date.now();
		const schedule = scheduler.createNewSchedule(now);

		const againResult = scheduler.review(schedule, 1, now);
		const hardResult = scheduler.review(schedule, 2, now);
		const goodResult = scheduler.review(schedule, 3, now);
		const easyResult = scheduler.review(schedule, 4, now);

		// Intervals should generally increase with better ratings
		const againInterval = againResult.schedule.due - now;
		const hardInterval = hardResult.schedule.due - now;
		const goodInterval = goodResult.schedule.due - now;
		const easyInterval = easyResult.schedule.due - now;

		expect(easyInterval).toBeGreaterThanOrEqual(goodInterval);
		expect(goodInterval).toBeGreaterThanOrEqual(hardInterval);
		expect(hardInterval).toBeGreaterThanOrEqual(againInterval);
	});

	it("schedule data parsed from fence metadata", () => {
		const md = `---
osmosis-cards: true
---

\`\`\`osmosis
id: sched123
due: 2026-03-15T00:00:00.000Z
stability: 4.5
difficulty: 5.2
reps: 3
lapses: 0
state: review
last-review: 2026-03-10T00:00:00.000Z

Front
***
Back
\`\`\`
`;
		syncCards(md);
		const card = store.getCard("sched123");
		expect(card).toBeDefined();
		expect(card!.stability).toBe(4.5);
		expect(card!.difficulty).toBe(5.2);
		expect(card!.reps).toBe(3);
		expect(card!.lapses).toBe(0);
		expect(card!.state).toBe("review");
		expect(card!.due).toBe(new Date("2026-03-15T00:00:00.000Z").getTime());
		expect(card!.lastReview).toBe(new Date("2026-03-10T00:00:00.000Z").getTime());

		// Should show as due (past date relative to now)
		expect(store.getNewCards()).toHaveLength(0);
	});
});
