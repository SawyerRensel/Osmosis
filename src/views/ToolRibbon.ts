import { setIcon } from "obsidian";

/** Toolbar state used to enable/disable context-sensitive buttons. */
export interface ToolbarState {
	hasSelection: boolean;
	isEditing: boolean;
	hasFile: boolean;
	isReadingMode: boolean;
}

export interface ToolbarActions {
	fitToView: () => void;
	zoomIn: () => void;
	zoomOut: () => void;
	centerOnRoot: () => void;
	foldAll: () => void;
	unfoldAll: () => void;
	insertParent: () => void;
	addSibling: () => void;
	addChild: () => void;
	moveUp: () => void;
	moveDown: () => void;
	moveLeft: () => void;
	moveRight: () => void;
	deleteNode: () => void;
	copy: () => void;
	cut: () => void;
	paste: () => void;
	copyStyle: () => void;
	pasteStyle: () => void;
	undo: () => void;
	redo: () => void;
	refresh: () => void;
	openProperties: () => void;
	openNodeMenu: (btn: HTMLElement) => void;
}

export interface ButtonDef {
	id: string;
	icon: string;
	label: string;
	/** Name of the matching Obsidian command, so it can be given a hotkey. Omitted when a command already exists elsewhere. */
	command?: string;
	/** The action to run. It receives its own button, which menu-opening actions anchor to. */
	action: keyof ToolbarActions;
	/** Button requires a node to be selected */
	needsSelection?: boolean;
	/** Button mutates the map — hidden in reading mode */
	editOnly?: boolean;
}

/** The toolbar's buttons, in display order, one inner array per divider-separated group. */
export const TOOLBAR_GROUPS: ButtonDef[][] = [
	[
		{ id: "fit", icon: "maximize", label: "Fit to view", command: "Fit mind map to view", action: "fitToView" },
		{ id: "zoom-in", icon: "zoom-in", label: "Zoom in", command: "Zoom in on mind map", action: "zoomIn" },
		{ id: "zoom-out", icon: "zoom-out", label: "Zoom out", command: "Zoom out of mind map", action: "zoomOut" },
		{ id: "center", icon: "home", label: "Center on root", command: "Center mind map on root", action: "centerOnRoot" },
	],
	[
		{ id: "fold-all", icon: "chevrons-down-up", label: "Collapse all", command: "Collapse all under node", action: "foldAll", needsSelection: true },
		{ id: "unfold-all", icon: "chevrons-up-down", label: "Expand all", command: "Expand all under node", action: "unfoldAll", needsSelection: true },
	],
	[
		{ id: "insert-parent", icon: "arrow-right-to-line", label: "Insert parent", command: "Insert parent node", action: "insertParent", needsSelection: true, editOnly: true },
		{ id: "add-sibling", icon: "arrow-down-from-line", label: "Add sibling", command: "Add sibling node", action: "addSibling", needsSelection: true, editOnly: true },
		{ id: "add-child", icon: "arrow-right-from-line", label: "Add child", command: "Add child node", action: "addChild", needsSelection: true, editOnly: true },
	],
	[
		{ id: "move-up", icon: "arrow-up", label: "Move up", command: "Move node up", action: "moveUp", needsSelection: true, editOnly: true },
		{ id: "move-down", icon: "arrow-down", label: "Move down", command: "Move node down", action: "moveDown", needsSelection: true, editOnly: true },
		{ id: "move-left", icon: "arrow-left", label: "Move left", command: "Move node left", action: "moveLeft", needsSelection: true, editOnly: true },
		{ id: "move-right", icon: "arrow-right", label: "Move right", command: "Move node right", action: "moveRight", needsSelection: true, editOnly: true },
	],
	[
		{ id: "delete", icon: "trash-2", label: "Delete", command: "Delete node", action: "deleteNode", needsSelection: true, editOnly: true },
	],
	[
		{ id: "copy", icon: "copy", label: "Copy", command: "Copy node", action: "copy", needsSelection: true },
		{ id: "cut", icon: "scissors", label: "Cut", command: "Cut node", action: "cut", needsSelection: true, editOnly: true },
		{ id: "paste", icon: "clipboard-paste", label: "Paste", command: "Paste node", action: "paste", needsSelection: true, editOnly: true },
	],
	[
		{ id: "copy-style", icon: "pipette", label: "Copy style", command: "Copy node style", action: "copyStyle", needsSelection: true, editOnly: true },
		{ id: "paste-style", icon: "paint-bucket", label: "Paste style", command: "Paste node style", action: "pasteStyle", needsSelection: true, editOnly: true },
	],
	[
		{ id: "undo", icon: "undo-2", label: "Undo", command: "Undo mind map edit", action: "undo", editOnly: true },
		{ id: "redo", icon: "redo-2", label: "Redo", command: "Redo mind map edit", action: "redo", editOnly: true },
	],
	[
		{ id: "refresh", icon: "refresh-cw", label: "Refresh mind map", command: "Refresh mind map", action: "refresh" },
		// "Open mind map properties" is already a command (main.ts).
		{ id: "open-properties", icon: "paintbrush", label: "Map properties", action: "openProperties" },
	],
	[
		// A phone has no right-click, and a long press there has to stay
		// free for dragging a node, so this is how touch opens the menu.
		{ id: "node-menu", icon: "more-vertical", label: "More actions", command: "Open node menu", action: "openNodeMenu" },
	],
];

/**
 * Whether a button's action may run in the given state — the same rule that
 * disables or hides the button itself.
 */
export function canRunToolbarAction(def: ButtonDef, state: ToolbarState): boolean {
	if (state.isEditing) return false;
	if (def.needsSelection && !state.hasSelection) return false;
	if (def.editOnly && state.isReadingMode) return false;
	return true;
}

/**
 * A sticky action bar rendered at the bottom of the mind map view.
 * Provides GUI buttons for existing keyboard-only actions.
 */
export class ToolRibbon {
	private el: HTMLElement;
	private buttons = new Map<string, HTMLButtonElement>();
	private state: ToolbarState = { hasSelection: false, isEditing: false, hasFile: false, isReadingMode: false };
	private savedScrollLeft = 0;

	constructor(
		private container: HTMLElement,
		private actions: ToolbarActions,
	) {
		this.el = createDiv();
		this.el.className = "osmosis-toolbar";

		const groups = TOOLBAR_GROUPS;
		for (let gi = 0; gi < groups.length; gi++) {
			const group = groups[gi];
			if (!group) continue;
			for (const def of group) {
				const btn = createEl("button");
				btn.className = "osmosis-toolbar-btn clickable-icon";
				btn.setAttribute("aria-label", def.label);
				btn.setAttribute("title", def.label);
				btn.dataset.action = def.id;
				if (def.needsSelection) {
					btn.dataset.needsSelection = "true";
				}
				if (def.editOnly) {
					btn.dataset.editOnly = "true";
				}
				setIcon(btn, def.icon);
				btn.addEventListener("pointerdown", (e) => {
					// Prevent focus stealing from the mind map container
					e.preventDefault();
					e.stopPropagation();
				});
				btn.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.runAction(def, btn);
				});
				this.buttons.set(def.id, btn);
				this.el.appendChild(btn);
			}
			// Add divider between groups (except after last)
			if (gi < groups.length - 1) {
				const divider = createDiv();
				divider.className = "osmosis-toolbar-divider";
				this.el.appendChild(divider);
			}
		}

		// Prevent pointer-up on toolbar buttons from bubbling to the mind map
		// container, which would deselect the current node on mobile (touch)
		// before the click handler fires.
		this.el.addEventListener("pointerup", (e) => {
			e.stopPropagation();
		});

		// Prevent wheel events on the toolbar from panning the mind map
		this.el.addEventListener("wheel", (e) => {
			e.stopPropagation();
			// Scroll the toolbar horizontally if it overflows
			this.el.scrollLeft += e.deltaX || e.deltaY;
		}, { passive: true });

		this.container.appendChild(this.el);
	}

	/** Detach toolbar before container.empty() to preserve scroll position. */
	detach(): void {
		if (this.el.parentElement) {
			this.savedScrollLeft = this.el.scrollLeft;
			this.el.remove();
		}
	}

	/** Re-append toolbar to the container (needed after container.empty()). */
	attach(): void {
		if (!this.el.parentElement) {
			this.container.appendChild(this.el);
			this.el.scrollLeft = this.savedScrollLeft;
		}
	}

	/** Update button enabled/disabled state. */
	updateState(state: ToolbarState): void {
		this.state = state;

		if (state.isEditing) {
			this.el.addClass("osmosis-toolbar-hidden");
			return;
		}

		this.el.removeClass("osmosis-toolbar-hidden");

		for (const [, btn] of this.buttons) {
			if (btn.dataset.needsSelection === "true") {
				btn.toggleClass("is-disabled", !state.hasSelection);
				btn.disabled = !state.hasSelection;
			}
			btn.toggleClass(
				"osmosis-toolbar-btn-hidden",
				state.isReadingMode && btn.dataset.editOnly === "true",
			);
		}

		// Collapse dividers that no longer separate any visible buttons
		// (reading mode hides whole groups).
		let visibleSinceLastDivider = 0;
		for (const child of Array.from(this.el.children)) {
			const el = child as HTMLElement;
			if (el.classList.contains("osmosis-toolbar-divider")) {
				const show = visibleSinceLastDivider > 0;
				el.toggleClass("osmosis-toolbar-btn-hidden", !show);
				if (show) visibleSinceLastDivider = 0;
			} else if (!el.classList.contains("osmosis-toolbar-btn-hidden")) {
				visibleSinceLastDivider++;
			}
		}
	}

	/**
	 * Run a button's action on behalf of its command, under the rule that
	 * governs the button. With `checking`, only report whether it would run.
	 */
	trigger(def: ButtonDef, state: ToolbarState, checking: boolean): boolean {
		const btn = this.buttons.get(def.id);
		if (!btn || !canRunToolbarAction(def, state)) return false;
		if (!checking) this.runAction(def, btn);
		return true;
	}

	private runAction(def: ButtonDef, btn: HTMLButtonElement): void {
		const action: (btn: HTMLButtonElement) => void = this.actions[def.action];
		action(btn);
	}

	destroy(): void {
		this.el.remove();
		this.buttons.clear();
	}
}
