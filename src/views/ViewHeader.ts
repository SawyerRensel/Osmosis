import type { ItemView, Menu } from "obsidian";
import { PANE_MENU, headerItems, type HeaderItem, type HeaderView, type PaneMenuId } from "../view-header";

/**
 * Put the view's header buttons in the shared order (`headerItems`), left to
 * right, ahead of Obsidian's own. `addAction` leaves them in whatever order the
 * workspace likes, so the order is set here, once the view has made them all.
 * `buttons` holds what `addAction` returned, by item.
 */
export function arrangeViewHeader(view: ItemView, kind: HeaderView, buttons: Partial<Record<HeaderItem, HTMLElement>>): void {
	const container = view.containerEl.querySelector(".view-actions");
	if (!(container instanceof HTMLElement)) return;
	const ordered = headerItems(kind).flatMap((id) => buttons[id] ?? []);
	const ours = new Set<Element>(ordered);
	// Everything of ours goes before the first button that is not: Obsidian's own, at the right.
	const anchor = Array.from(container.children).find((child) => !ours.has(child)) ?? null;
	for (const el of ordered) container.insertBefore(el, anchor);
}

/** How a view runs one ⋯ menu entry: `checked` is a toggle's current state, `icon` overrides the default. */
export interface PaneMenuHandler {
	onClick: () => void;
	checked?: boolean;
	icon?: string;
}

/**
 * Add the view's entries (`PANE_MENU`) to the ⋯ pane menu, a separator between
 * groups and one at the end, so they stand ahead of Obsidian's own. Call it from
 * `onPaneMenu` before `super`.
 */
export function addPaneMenuItems(menu: Menu, kind: HeaderView, handlers: Partial<Record<PaneMenuId, PaneMenuHandler>>): void {
	let group: number | null = null;
	for (const entry of PANE_MENU[kind]) {
		const handler = handlers[entry.id];
		if (!handler) continue;
		if (group !== null && group !== entry.group) menu.addSeparator();
		group = entry.group;
		menu.addItem((item) => {
			item.setTitle(entry.title).setIcon(handler.icon ?? entry.icon).onClick(handler.onClick);
			if (entry.toggle) item.setChecked(handler.checked === true);
		});
	}
	menu.addSeparator();
}
