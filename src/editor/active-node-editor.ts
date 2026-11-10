/**
 * Which node editor stands in as the active Markdown view, and how a node
 * editor treats a blur that a modal caused. Pure: no `obsidian` import, so it
 * is unit-tested; `EmbeddableMarkdownEditor.ts` wires it to the workspace.
 *
 * Plugins such as QuickAdd find "the editor" through
 * `workspace.getActiveViewOfType(MarkdownView)`. A node editor lives in a mind
 * map or 3D graph leaf, so that lookup finds nothing, and they read an empty
 * selection. While a node editor is the active editor, Osmosis answers it with
 * a stand-in whose `editor` is the node's.
 */

/** A node editor as it was last focused: its `owner` is what it set as `workspace.activeEditor`, `view` the view it sits in. */
export interface FocusedNodeEditor<E> {
	editor: E;
	owner: unknown;
	view: unknown;
}

/**
 * The last-focused node editor, kept across a blur (the command palette or a
 * plugin's modal takes the focus before the command reads the editor) until it
 * is destroyed. Whether it still answers is decided at each lookup, as
 * Obsidian keeps `activeEditor`: another editor or leaf becoming active ends it.
 */
export class NodeEditorFocus<E> {
	private last: FocusedNodeEditor<E> | null = null;

	focus(entry: FocusedNodeEditor<E>): void {
		this.last = entry;
	}

	private answering = false;

	destroyed(editor: E): void {
		if (this.last?.editor === editor) this.last = null;
	}

	/**
	 * `answer`, for the workspace patch: `read` returns Obsidian's active editor
	 * and the active leaf's view. It is only called while a node editor could
	 * answer, and a lookup made while it runs gets null. Obsidian's
	 * `activeEditor` getter falls back to `getActiveViewOfType(MarkdownView)`
	 * when no editor is set, which lands back in the patch; without the guard
	 * that recursed until the stack overflowed, on every lookup in the app.
	 */
	answerGuarded(read: () => [activeEditor: unknown, activeView: unknown]): E | null {
		if (this.answering || this.last === null) return null;
		this.answering = true;
		try {
			const [activeEditor, activeView] = read();
			return this.answer(activeEditor, activeView);
		} finally {
			this.answering = false;
		}
	}

	/** The editor that answers a lookup, given Obsidian's active editor and the active leaf's view; null when none does. */
	answer(activeEditor: unknown, activeView: unknown): E | null {
		const last = this.last;
		if (last === null) return null;
		// Another editor (a note tab, a canvas card, another node) is the active one.
		if (activeEditor !== last.owner) return null;
		// Another leaf is active.
		if (activeView !== last.view) return null;
		return last.editor;
	}
}

/**
 * What a node editor held by a modal does next, checked while it waits:
 * `resume` when the focus came back to it; `wait` while a modal is still
 * open; `refocus` when the modal closed and left the focus on nothing (so the
 * edit carries on, as it does when Obsidian hands the focus back); `blur` when
 * the focus went somewhere else, which ends the edit as any blur does.
 */
export type HeldBlurStep = "resume" | "wait" | "refocus" | "blur";

export function heldBlurStep(state: { focused: boolean; modalOpen: boolean; focusOnNothing: boolean }): HeldBlurStep {
	if (state.focused) return "resume";
	if (state.modalOpen) return "wait";
	return state.focusOnNothing ? "refocus" : "blur";
}

/**
 * Replace `target[name]` with `wrap(original)`; the returned function undoes it.
 * Undoing restores the original when the wrapper is still in place (deleting
 * the own property when the method came from the prototype); when another
 * patch has wrapped ours since, ours turns into a pass-through instead, so
 * theirs survives (monkey-around's rule).
 */
export function wrapMethod<T extends object, K extends keyof T>(
	target: T,
	name: K,
	wrap: (original: T[K]) => T[K],
): () => void {
	const hadOwn = Object.prototype.hasOwnProperty.call(target, name);
	const original = target[name];
	let live = true;
	const wrapped = wrap(original) as unknown as (...args: unknown[]) => unknown;
	const wrapper = function (this: unknown, ...args: unknown[]): unknown {
		const fn = (live ? wrapped : original) as unknown as (...a: unknown[]) => unknown;
		return fn.apply(this, args);
	} as unknown as T[K];
	target[name] = wrapper;
	return () => {
		if (!live) return;
		live = false;
		if (target[name] !== wrapper) return;
		if (hadOwn) target[name] = original;
		else Reflect.deleteProperty(target, name);
	};
}
