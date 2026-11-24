import type { Card } from "../database/types";

/**
 * Anki's manual Bury: a card the user set aside until the next day.
 *
 * Osmosis has no day-rollover setting, so the day starts at local midnight.
 * A bury is stored as the instant it ends (`buriedUntil`, epoch ms in memory);
 * one that has passed behaves exactly as if it were absent, and is dropped the
 * next time that card's schedule is written.
 */

/** The next local midnight after `now`, epoch ms. */
export function nextDayStart(now: number): number {
	const d = new Date(now);
	d.setHours(24, 0, 0, 0);
	return d.getTime();
}

/** True while the card is buried at `now`. */
export function isBuried(card: Pick<Card, "buriedUntil">, now: number): boolean {
	return card.buriedUntil !== undefined && card.buriedUntil > now;
}
