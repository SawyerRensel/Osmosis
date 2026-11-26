/**
 * How long a card took, for the review log's `e` field and Stats' Time.
 *
 * Anki counts at most 60 s per card, so a card left open while the user is
 * away does not inflate the day's total. Every study surface shares that cap.
 */
export const MAX_CARD_MS = 60_000;

/** `ms` clamped to `0..MAX_CARD_MS` (and `0` for a non-finite value). */
export function capElapsed(ms: number): number {
	if (!Number.isFinite(ms) || ms < 0) return 0;
	return Math.min(ms, MAX_CARD_MS);
}

/**
 * Times a study session card by card, from the moment each became the current
 * question rather than from its reveal.
 *
 * Note, line, mind map and Cosmos study have no "question shown" event: the
 * cards sit in the note or map with everything else, and the user may spend a
 * while reading before revealing one. What they spend is still study time, so
 * the anchor is the later of the session starting and the previous rating
 * (or an undo, which puts a card back in front of the user).
 */
export class StudyClock {
	private since: number | null = null;

	/** Anchor now: the session just started, or a card was put back by an undo. */
	start(now = Date.now()): void {
		this.since = now;
	}

	/** Forget the anchor, so a stale one cannot time the next session. */
	stop(): void {
		this.since = null;
	}

	/**
	 * The (capped) time since the anchor, which then moves to `now` for the
	 * next card. `null` when no session is running.
	 */
	lap(now = Date.now()): number | null {
		if (this.since === null) return null;
		const elapsed = capElapsed(now - this.since);
		this.since = now;
		return elapsed;
	}
}
