/**
 * Pure queue arithmetic for flashcard-study undo.
 *
 * Rating or excluding a card advances `currentIndex` but leaves the card in
 * `queue` at `currentIndex - 1`, so stepping back is just a decrement: the
 * card is already there. (Re-inserting it as well showed it twice.)
 *
 * A rating that sent the card to learning also queued a deferred copy. If that
 * copy's timer already fired, the copy is in the queue and has to come out;
 * otherwise it would reappear after the card was rated again.
 */

export interface UndoQueueState<T> {
	queue: T[];
	currentIndex: number;
}

/**
 * Step back over the last advance. `firedDeferred` is the deferred copy
 * created by the undone rating, if any; it is removed (by identity) when
 * present in the queue, and ignored when it never fired.
 */
export function stepBackQueue<T>(
	state: UndoQueueState<T>,
	firedDeferred?: T,
): UndoQueueState<T> {
	const queue = state.queue.slice();
	let currentIndex = state.currentIndex - 1;
	if (firedDeferred !== undefined) {
		const at = queue.indexOf(firedDeferred);
		// Undo is LIFO, so a fired copy always sits after the card being restored.
		if (at > currentIndex) queue.splice(at, 1);
	}
	return { queue, currentIndex: Math.max(0, currentIndex) };
}
