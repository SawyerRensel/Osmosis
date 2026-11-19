/**
 * Pure helpers for the sequential study tab (`SequentialStudyView`), kept out
 * of `src/views/` so they can be unit-tested without Obsidian.
 */

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
