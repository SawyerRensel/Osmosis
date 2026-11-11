import type { ItemView } from "obsidian";
import { headerItems, type HeaderItem, type HeaderView } from "../view-header";

/** The 2D | 3D pill, as a header item. The active side is highlighted; the other switches the leaf to that view. */
function createViewSwitch(active: HeaderView, onSwitch: (to: HeaderView) => void): HTMLElement {
	const pill = createDiv({ cls: "osmosis-view-switch", attr: { role: "group", "aria-label": "Mind map or 3D graph" } });
	for (const side of ["2d", "3d"] as const) {
		const on = side === active;
		const button = pill.createEl("button", {
			cls: "osmosis-view-switch-option",
			text: side === "2d" ? "2D" : "3D",
			attr: { "aria-pressed": String(on), "aria-label": side === "2d" ? "Mind map view" : "3D graph view" },
		});
		button.toggleClass("is-active", on);
		// The active side is where you already are.
		button.addEventListener("click", () => {
			if (!on) onSwitch(side);
		});
	}
	return pill;
}

/**
 * Put the view's header buttons in the shared order (`headerItems`), left to
 * right, ahead of Obsidian's own. `addAction` leaves them in whatever order the
 * workspace likes, so the order is set here, once the view has made them all.
 * Adds the 2D | 3D pill, which stands first. `buttons` holds what `addAction`
 * returned, by item.
 */
export function arrangeViewHeader(view: ItemView, kind: HeaderView, buttons: Partial<Record<HeaderItem, HTMLElement>>, onSwitch: (to: HeaderView) => void): void {
	const container = view.containerEl.querySelector(".view-actions");
	if (!(container instanceof HTMLElement)) return;
	const items: Partial<Record<HeaderItem, HTMLElement>> = { ...buttons, switch: createViewSwitch(kind, onSwitch) };
	const ordered = headerItems(kind).flatMap((id) => items[id] ?? []);
	const ours = new Set<Element>(ordered);
	// Everything of ours goes before the first button that is not: Obsidian's own, at the right.
	const anchor = Array.from(container.children).find((child) => !ours.has(child)) ?? null;
	for (const el of ordered) container.insertBefore(el, anchor);
}
