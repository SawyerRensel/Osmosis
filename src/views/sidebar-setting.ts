import { Setting } from "obsidian";

/**
 * A setting row for the style sidebar (`PropertiesSidebarView`), laid out as a grid: name and control share
 * the first line, description spans the full width below it (see styles.css).
 *
 * Obsidian builds the description as a *grandchild* of the row, inside
 * `.setting-item-info` next to the name, and a grandchild cannot be given a
 * grid area of its own. Lifting it to a direct child is what makes the layout
 * expressible — the alternative, `display: contents` on the info wrapper, is
 * flagged as only partially supported by Obsidian's CSS lint.
 *
 * Safe to do at construction time: `Setting` creates `descEl` in its
 * constructor and `setDesc()` only writes text into it, so a description added
 * later still lands in the element this moved.
 */
export function sidebarSetting(parent: HTMLElement): Setting {
	const setting = new Setting(parent);
	setting.settingEl.appendChild(setting.descEl);
	return setting;
}
