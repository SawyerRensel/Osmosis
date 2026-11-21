/**
 * Pure helpers for the flashcard study tab (`FlashcardStudyView`), kept out
 * of `src/views/` so they can be unit-tested without Obsidian.
 */

import type { StudyScope } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Format the time until a card would next be due, for the label above a rating
 * button: `<1m`, `10m`, `3h`, `4d`, `1.5mo`, `2.1y`. Months and years keep one
 * decimal, as Anki's do, since a whole number hides most of the difference
 * between Good and Easy at that range.
 */
export function formatInterval(ms: number): string {
	if (ms < MINUTE) return "<1m";
	if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`;
	if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
	if (ms < MONTH) return `${Math.round(ms / DAY)}d`;
	if (ms < YEAR) return `${oneDecimal(ms / MONTH)}mo`;
	return `${oneDecimal(ms / YEAR)}y`;
}

function oneDecimal(n: number): string {
	return String(Math.round(n * 10) / 10);
}

/** A finished one-finger gesture, as the study tab measured it. */
export interface SwipeSample {
	/** Horizontal travel in px, positive to the right. */
	dx: number;
	/** Vertical travel in px, positive downward (screen coordinates). */
	dy: number;
	/** Duration of the touch in ms. */
	ms: number;
	/**
	 * Whether the card scrolled during the touch. A drag that moved the card's
	 * own scroll position was reading, not a gesture — a tall card has to be
	 * swiped up to be read at all.
	 */
	scrolled: boolean;
}

/** Shortest upward travel that counts as a swipe, in px. */
export const SWIPE_MIN_DISTANCE = 60;
/** Longest touch that still counts as a swipe rather than a slow drag, in ms. */
export const SWIPE_MAX_MS = 600;

/**
 * Whether a touch is the swipe up that toggles the navigation bar: quick,
 * mostly vertical (at least twice as far up as sideways), long enough not to
 * be a jittery tap, and not a scroll of the card.
 */
export function isNavbarSwipe(sample: SwipeSample): boolean {
	if (sample.scrolled) return false;
	if (sample.ms > SWIPE_MAX_MS) return false;
	const up = -sample.dy;
	if (up < SWIPE_MIN_DISTANCE) return false;
	return up >= 2 * Math.abs(sample.dx);
}

/** The tab's title while no session is on screen: the picker, empty and complete screens. */
export const STUDY_TAB_IDLE_TITLE = "Study";

/**
 * The study tab's title, which is the session's only title (T109): nothing in
 * the tab's content repeats it.
 *
 * - no session: "Study"
 * - all decks: "All decks"
 * - a deck: its own name, the last segment of its path
 * - a note: its H1 when it has exactly one, else the file name without
 *   extension. `h1s` is the note's level-1 headings, in order.
 */
export function studyTabTitle(scope: StudyScope | null, h1s: readonly string[] = []): string {
	if (scope === null) return STUDY_TAB_IDLE_TITLE;
	switch (scope.type) {
		case "all":
			return "All decks";
		case "single":
		case "parent":
			return lastSegment(scope.deck) || scope.deck;
		case "note": {
			const h1 = h1s.length === 1 ? h1s[0]!.trim() : "";
			return h1 !== "" ? h1 : lastSegment(scope.notePath).replace(/\.md$/i, "");
		}
	}
}

function lastSegment(path: string): string {
	return path.split("/").filter((p) => p.length > 0).pop() ?? "";
}

/**
 * A line card's ancestor breadcrumb with its leading segments dropped while
 * they only repeat what the tab already says, compared case-insensitively.
 * The first segment is always the note's name, which in a session over that
 * note (or its same-named deck) the tab already shows; `titles` lists every
 * name that counts — the tab title, and a note session's file name when its
 * H1 is the title. An empty result means the breadcrumb said nothing new.
 */
export function crumbsBelowTitle(crumbs: readonly string[], titles: readonly string[]): string[] {
	const keys = new Set(titles.map((t) => t.trim().toLowerCase()));
	let start = 0;
	while (start < crumbs.length && keys.has(crumbs[start]!.trim().toLowerCase())) start++;
	return crumbs.slice(start);
}
