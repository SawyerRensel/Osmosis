/**
 * The one rating bar every study surface draws (T136): flashcard study, note
 * fence cards, note line cards, mind map study and Cosmos study. Four buttons,
 * Again / Hard / Good / Easy, each with the interval it would schedule above
 * its label.
 *
 * No `obsidian` import (only its global DOM helpers, which the test stub
 * installs), so the assembly is unit-tested here rather than through each view. Each surface still decides where the bar goes and
 * what a rating does; this only builds the row.
 */

import type { FSRSRating } from "../database/FSRSScheduler";
import type { Card } from "../database/types";
import { formatInterval } from "./study-view";

/** The four ratings, in button order, with the class that colours each. */
export const RATINGS: readonly { label: string; rating: FSRSRating; cls: string }[] = [
	{ label: "Again", rating: 1, cls: "osmosis-rate-again" },
	{ label: "Hard", rating: 2, cls: "osmosis-rate-hard" },
	{ label: "Good", rating: 3, cls: "osmosis-rate-good" },
	{ label: "Easy", rating: 4, cls: "osmosis-rate-easy" },
];

/** How long until the card would be due under each rating, in ms (`StudySessionManager.previewIntervals`). */
export type IntervalPreview = Record<FSRSRating, number>;

export interface RatingBarOptions {
	/** Called with the rating a button stands for. The click does not propagate past the bar. */
	onRate: (rating: FSRSRating) => void;
	/** The intervals to show now; omit to fill them later with `setIntervals`. */
	intervals?: IntervalPreview | null;
	/** Extra classes for the bar, space-separated: the surface's placement. */
	cls?: string;
	/**
	 * Draw the bar in its own dark rounded panel (`.osmosis-rating-panel`). Off
	 * where the bar already sits in one: the flashcard tab's action panel and
	 * Cosmos's study panel.
	 */
	panel?: boolean;
}

export interface RatingBar {
	el: HTMLElement;
	/** The four buttons, in `RATINGS` order. */
	buttons: HTMLButtonElement[];
	/** Show these intervals over the buttons; null blanks them, and an empty label takes no room. */
	setIntervals(intervals: IntervalPreview | null): void;
}

/** Build the rating bar and append it to `parent`. */
export function renderRatingBar(parent: Element, options: RatingBarOptions): RatingBar {
	const el = parent.createDiv({
		cls: ["osmosis-rating", options.panel === true ? "osmosis-rating-panel" : "", options.cls ?? ""]
			.filter((c) => c !== "")
			.join(" "),
	});

	const intervalEls: HTMLElement[] = [];
	const buttons = RATINGS.map(({ label, rating, cls }) => {
		const btn = el.createEl("button", { cls, attr: { "aria-label": `${label} (${String(rating)})` } });
		intervalEls.push(btn.createSpan({ cls: "osmosis-rate-interval" }));
		btn.createSpan({ cls: "osmosis-rate-label", text: label });
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			options.onRate(rating);
		});
		return btn;
	});

	const setIntervals = (intervals: IntervalPreview | null): void => {
		RATINGS.forEach(({ rating }, i) => {
			intervalEls[i]!.textContent = intervals === null ? "" : formatInterval(intervals[rating]);
		});
	};
	setIntervals(options.intervals ?? null);

	return { el, buttons, setIntervals };
}

/**
 * Which of an item's cards the bar previews, when one line, node or fence
 * carries several (a cloze's groups, a reversed pair) and one rating reaches
 * them all: the first card due, in study-queue order. That is the due card
 * that has waited longest, else the first new card, else (nothing due, as
 * when peeking) the card due soonest. Null when none of `ids` is in `cards`.
 */
export function previewCardId(cards: readonly Card[], ids: readonly string[], now: number): string | null {
	const wanted = new Set(ids);
	const own = cards.filter((card) => wanted.has(card.id));
	// `ids` order decides ties and the new-card pick, not the store's order.
	own.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
	const byDue = (a: Card, b: Card): number => a.due! - b.due!;
	const scheduled = own.filter((card) => card.due !== undefined);
	const overdue = scheduled.filter((card) => card.due! <= now).sort(byDue);
	const pick = overdue[0] ?? own.find((card) => card.due === undefined) ?? scheduled.sort(byDue)[0];
	return pick?.id ?? null;
}
