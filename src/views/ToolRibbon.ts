import { setIcon } from "obsidian";

/** Toolbar state used to enable/disable context-sensitive buttons. */
export interface ToolbarState {
	hasSelection: boolean;
	isEditing: boolean;
	hasFile: boolean;
}

interface ButtonDef {
	id: string;
	icon: string;
	label: string;
	action: () => void;
	/** Button requires a node to be selected */
	needsSelection?: boolean;
}

/**
 * A sticky action bar rendered at the bottom of the mind map view.
 * Provides GUI buttons for existing keyboard-only actions.
 */
export class ToolRibbon {
	private el: HTMLElement;
	private buttons = new Map<string, HTMLButtonElement>();
	private state: ToolbarState = { hasSelection: false, isEditing: false, hasFile: false };
	private savedScrollLeft = 0;

	constructor(
		private container: HTMLElement,
		actions: {
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
			indent: () => void;
			outdent: () => void;
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
		},
	) {
		this.el = document.createElement("div");
		this.el.className = "osmosis-toolbar";

		const groups: ButtonDef[][] = [
			[
				{ id: "fit", icon: "maximize", label: "Fit to view", action: actions.fitToView },
				{ id: "zoom-in", icon: "zoom-in", label: "Zoom in", action: actions.zoomIn },
				{ id: "zoom-out", icon: "zoom-out", label: "Zoom out", action: actions.zoomOut },
				{ id: "center", icon: "home", label: "Center on root", action: actions.centerOnRoot },
			],
			[
				{ id: "fold-all", icon: "chevrons-down-up", label: "Collapse all", action: actions.foldAll, needsSelection: true },
				{ id: "unfold-all", icon: "chevrons-up-down", label: "Expand all", action: actions.unfoldAll, needsSelection: true },
			],
			[
				{ id: "insert-parent", icon: "arrow-right-to-line", label: "Insert parent", action: actions.insertParent, needsSelection: true },
				{ id: "add-sibling", icon: "arrow-down-from-line", label: "Add sibling", action: actions.addSibling, needsSelection: true },
				{ id: "add-child", icon: "arrow-right-from-line", label: "Add child", action: actions.addChild, needsSelection: true },
			],
			[
				{ id: "move-up", icon: "chevrons-up", label: "Move up", action: actions.moveUp, needsSelection: true },
				{ id: "move-down", icon: "chevrons-down", label: "Move down", action: actions.moveDown, needsSelection: true },
				{ id: "indent", icon: "indent-increase", label: "Indent", action: actions.indent, needsSelection: true },
				{ id: "outdent", icon: "indent-decrease", label: "Outdent", action: actions.outdent, needsSelection: true },
			],
			[
				{ id: "delete", icon: "trash-2", label: "Delete", action: actions.deleteNode, needsSelection: true },
			],
			[
				{ id: "copy", icon: "copy", label: "Copy", action: actions.copy, needsSelection: true },
				{ id: "cut", icon: "scissors", label: "Cut", action: actions.cut, needsSelection: true },
				{ id: "paste", icon: "clipboard-paste", label: "Paste", action: actions.paste, needsSelection: true },
			],
			[
				{ id: "copy-style", icon: "paintbrush", label: "Copy style", action: actions.copyStyle, needsSelection: true },
				{ id: "paste-style", icon: "paint-bucket", label: "Paste style", action: actions.pasteStyle, needsSelection: true },
			],
			[
				{ id: "undo", icon: "undo-2", label: "Undo", action: actions.undo },
				{ id: "redo", icon: "redo-2", label: "Redo", action: actions.redo },
			],
			[
				{ id: "refresh", icon: "refresh-cw", label: "Refresh mind map", action: actions.refresh },
				{ id: "open-properties", icon: "settings", label: "Map properties", action: actions.openProperties },
			],
		];

		for (let gi = 0; gi < groups.length; gi++) {
			const group = groups[gi];
			if (!group) continue;
			for (const def of group) {
				const btn = document.createElement("button");
				btn.className = "osmosis-toolbar-btn clickable-icon";
				btn.setAttribute("aria-label", def.label);
				btn.setAttribute("title", def.label);
				btn.dataset.action = def.id;
				if (def.needsSelection) {
					btn.dataset.needsSelection = "true";
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
					def.action();
				});
				this.buttons.set(def.id, btn);
				this.el.appendChild(btn);
			}
			// Add divider between groups (except after last)
			if (gi < groups.length - 1) {
				const divider = document.createElement("div");
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
		}
	}

	destroy(): void {
		this.el.remove();
		this.buttons.clear();
	}
}
