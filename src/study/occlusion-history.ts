/**
 * Undo/redo for the occlusion editor: a stack of whole-document snapshots.
 *
 * Deliberately snapshots rather than command objects. A shape set numbers in the
 * tens and the editor already rebuilds its entire overlay from scratch on every
 * pointer move, so a copy of the document per committed change costs nothing
 * measurable and removes the class of bug where an undo command and its redo
 * disagree about what they inverted.
 *
 * The unit of history is a *committed* change — a pointer release, a delete, a
 * group assignment — never a pointer-move frame. Pushing per frame would turn
 * one drag into fifty undo steps and make the feature useless.
 *
 * Lives outside `src/views/` for the usual reason: vitest cannot import
 * `obsidian`, so anything the modal's correctness rests on is tested here.
 */

/** How many snapshots to keep. Beyond this the oldest is dropped. */
export const HISTORY_LIMIT = 100;

export class History<T> {
	private readonly stack: T[];
	private index = 0;

	constructor(initial: T) {
		this.stack = [initial];
	}

	/**
	 * Record a new state, discarding any redo branch.
	 *
	 * Editing after an undo abandons the future that was undone — the standard
	 * contract, and the only one that keeps the stack a single line of history.
	 */
	push(state: T): void {
		this.stack.length = this.index + 1;
		this.stack.push(state);
		if (this.stack.length > HISTORY_LIMIT) this.stack.shift();
		this.index = this.stack.length - 1;
	}

	/** The state one step back, or null when there is nothing to undo. */
	undo(): T | null {
		if (!this.canUndo) return null;
		this.index -= 1;
		return this.stack[this.index]!;
	}

	/** The state one step forward, or null when nothing was undone. */
	redo(): T | null {
		if (!this.canRedo) return null;
		this.index += 1;
		return this.stack[this.index]!;
	}

	get canUndo(): boolean {
		return this.index > 0;
	}

	get canRedo(): boolean {
		return this.index < this.stack.length - 1;
	}

	/** The state currently in force. */
	get current(): T {
		return this.stack[this.index]!;
	}
}
