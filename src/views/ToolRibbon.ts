import { Platform, View, setIcon, type App } from "obsidian";

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

/** The 2D/3D toggle's command. It has no toolbar button: the header's 2D | 3D pill (`view-header.ts`) is its button. */
export const TOGGLE_3D_COMMAND = { id: "mindmap-toggle-3d", icon: "orbit", name: "Toggle between 2D mind map and 3D graph" };

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
	],
	[
		// A phone has no right-click, and a long press there has to stay
		// free for dragging a node, so this is how touch opens the menu.
		{ id: "node-menu", icon: "more-vertical", label: "More actions", command: "Open node menu", action: "openNodeMenu" },
	],
];

/**
 * The buttons the 3D graph's ribbon leaves out: it draws `TOOLBAR_GROUPS`
 * like the mind map, minus what has no 3D equivalent yet. Fold and unfold
 * wait for the Fold idea ("3D Graph - Fold and unfold branches").
 */
export const GRAPH3D_HIDDEN_BUTTONS: ReadonlySet<string> = new Set(["fold-all", "unfold-all"]);

/** `groups` without the buttons of `hidden`, and without any group that leaves empty (so no stray divider). */
export function visibleGroups(groups: readonly ButtonDef[][], hidden: ReadonlySet<string>): ButtonDef[][] {
	return groups.map((group) => group.filter((def) => !hidden.has(def.id))).filter((group) => group.length > 0);
}

/**
 * The Osmosis bar's own toggles, after its last group: Obsidian's navigation
 * bar (phones, both views), the 3D graph's walk and fly joysticks (3D on a
 * touch screen, desktops with one included) and the 3D graph's controls help,
 * always the last button. They are view settings, not map actions, so they
 * have no commands.
 */
export type BarToggle = "navbar" | "sticks" | "help";

const BAR_TOGGLE_DEFS: Record<BarToggle, { icon: string; label: string }> = {
	navbar: { icon: "panel-bottom", label: "Hide navigation bar" },
	sticks: { icon: "gamepad-2", label: "Walk and fly joysticks" },
	help: { icon: "help", label: "Controls" },
};

/** Which toggles the bar shows in `view` on this device, in order. */
export function barToggles(view: "2d" | "3d", device: { isPhone: boolean; touch: boolean }): BarToggle[] {
	const toggles: BarToggle[] = [];
	if (device.isPhone) toggles.push("navbar");
	if (view === "3d" && device.touch) toggles.push("sticks");
	if (view === "3d") toggles.push("help");
	return toggles;
}

/**
 * Whether the bar shows: never while a node is being edited, and on a phone
 * only in edit mode, where it takes the navigation bar's slot as Obsidian's
 * editing toolbar does. Desktops and tablets show it in both modes.
 */
export function barShown(state: ToolbarState, isPhone: boolean): boolean {
	return !state.isEditing && !(isPhone && state.isReadingMode);
}

/**
 * The per-device preference (Obsidian's vault-scoped localStorage) to hide
 * the navigation bar while a map is in edit mode: on unless the bar's toggle
 * turned it off. Reading mode always shows the navigation bar.
 */
export const NAVBAR_STORAGE_KEY = "osmosis-hide-navbar-edit";

export function readNavbarPref(load: (key: string) => unknown): boolean {
	return load(NAVBAR_STORAGE_KEY) !== false;
}

/** Whether Obsidian's navigation bar is hidden: on a phone, in edit mode, unless turned off. Tablets and desktops show no navigation bar. */
export function navbarHidden(isPhone: boolean, editMode: boolean, hideInEdit: boolean): boolean {
	return isPhone && editMode && hideInEdit;
}

/** Body class that hides `.mobile-navbar` (styles.css), set only while a map that asks for it is the active view. */
export const HIDE_NAVBAR_CLASS = "osmosis-hide-navbar";

/** A view whose bar can hide the navigation bar: the mind map and the 3D graph. */
export interface NavbarHost {
	/** Whether the map is in edit mode, the only mode that hides the navigation bar. */
	navbarEditMode(): boolean;
}

function isNavbarHost(view: View): view is View & NavbarHost {
	return typeof (view as Partial<NavbarHost>).navbarEditMode === "function";
}

/** Whether the navigation bar is hidden for a map in this mode, on this device. */
export function hidesNavbar(app: App, editMode: boolean): boolean {
	return navbarHidden(Platform.isPhone, editMode, readNavbarPref((key) => app.loadLocalStorage(key)));
}

/** The bar's navbar toggle (shown only in edit mode, on phones): flip the preference, then apply it. */
export function toggleNavbarPref(app: App): void {
	app.saveLocalStorage(NAVBAR_STORAGE_KEY, !readNavbarPref((key) => app.loadLocalStorage(key)));
	syncNavbar(app);
}

/**
 * Put the body class in line with the active view: on only while it is a map
 * whose mode hides the navigation bar, so Obsidian's navigation is never left
 * hidden elsewhere. Run on `active-leaf-change` (main.ts), on a mode change,
 * and on close, where `except` is the closing view, which no longer counts.
 */
export function syncNavbar(app: App, except: View | null = null): void {
	const view = app.workspace.getActiveViewOfType(View);
	const hide = view !== null && view !== except && isNavbarHost(view) && hidesNavbar(app, view.navbarEditMode());
	document.body.toggleClass(HIDE_NAVBAR_CLASS, hide);
}

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
 * The Osmosis bar: the map's actions as a strip of icon buttons at the bottom
 * centre of the view, in the look of Obsidian's mobile editing toolbar
 * (styles.css). Desktop and tablet show it in both modes; a phone shows it
 * in edit mode only, in the navigation bar's slot (`barShown`).
 */
export class ToolRibbon {
	/** The rounded strip; `listEl` inside it scrolls, as in Obsidian's toolbar (`mobile-toolbar-options-list-container` / `-list`). */
	private el: HTMLElement;
	private listEl: HTMLElement;
	private buttons = new Map<string, HTMLButtonElement>();
	private toggleButtons = new Map<BarToggle, HTMLButtonElement>();
	private state: ToolbarState = { hasSelection: false, isEditing: false, hasFile: false, isReadingMode: false };
	private savedScrollLeft = 0;

	constructor(
		private container: HTMLElement,
		private actions: ToolbarActions,
		/**
		 * Buttons to leave out (the 3D graph's, see `GRAPH3D_HIDDEN_BUTTONS`), a class for the bar, and
		 * the bar's own toggles (`barToggles`) with what each click does.
		 */
		options: { hidden?: ReadonlySet<string>; cls?: string; toggles?: { id: BarToggle; onClick: () => void }[] } = {},
	) {
		// `mod-raised` is Obsidian's raised surface (blur and shadow on phones), which its toolbar and navigation bar use too.
		this.el = createDiv({ cls: "osmosis-toolbar mod-raised" });
		if (options.cls !== undefined) this.el.addClass(options.cls);
		this.listEl = this.el.createDiv({ cls: "osmosis-toolbar-list" });

		const groups = visibleGroups(TOOLBAR_GROUPS, options.hidden ?? new Set());
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
				this.listEl.appendChild(btn);
			}
			// Add divider between groups (except after last)
			if (gi < groups.length - 1) {
				const divider = createDiv();
				divider.className = "osmosis-toolbar-divider";
				this.listEl.appendChild(divider);
			}
		}

		const toggles = options.toggles ?? [];
		if (toggles.length > 0) this.listEl.createDiv({ cls: "osmosis-toolbar-divider" });
		for (const { id, onClick } of toggles) {
			const { icon, label } = BAR_TOGGLE_DEFS[id];
			const btn = this.listEl.createEl("button", { cls: "osmosis-toolbar-btn clickable-icon", attr: { "aria-label": label, title: label, "aria-pressed": "false" } });
			btn.dataset.toggle = id;
			setIcon(btn, icon);
			btn.addEventListener("pointerdown", (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick();
			});
			this.toggleButtons.set(id, btn);
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
			this.listEl.scrollLeft += e.deltaX || e.deltaY;
		}, { passive: true });

		this.container.appendChild(this.el);
	}

	/** Detach toolbar before container.empty() to preserve scroll position. */
	detach(): void {
		if (this.el.parentElement) {
			this.savedScrollLeft = this.listEl.scrollLeft;
			this.el.remove();
		}
	}

	/** Re-append toolbar to the container (needed after container.empty()). */
	attach(): void {
		if (!this.el.parentElement) {
			this.container.appendChild(this.el);
			this.listEl.scrollLeft = this.savedScrollLeft;
		}
	}

	/** Update button enabled/disabled state. */
	updateState(state: ToolbarState): void {
		this.state = state;

		if (!barShown(state, Platform.isPhone)) {
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
		for (const child of Array.from(this.listEl.children)) {
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

	/** A toggle's button, for what anchors to it (the 3D controls help). */
	toggleButton(id: BarToggle): HTMLButtonElement | undefined {
		return this.toggleButtons.get(id);
	}

	/** Show a toggle as on or off. */
	setPressed(id: BarToggle, on: boolean): void {
		const btn = this.toggleButtons.get(id);
		btn?.toggleClass("is-active", on);
		btn?.setAttribute("aria-pressed", String(on));
	}

	destroy(): void {
		this.el.remove();
		this.buttons.clear();
		this.toggleButtons.clear();
	}
}
