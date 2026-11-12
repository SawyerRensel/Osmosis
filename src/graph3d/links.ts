/**
 * Clicking links in the 3D graph's near-tier panels. See
 * `vault/Planner/3D Graph - Clickable links in panels.md`.
 *
 * Panels never take the pointer (a drag over one still orbits), so the scene
 * finds the link under a click itself: the panel drawn on top there
 * (`frontPanelAt`), then the link inside it. `linkClickAction` decides what
 * the click does. A link fires only on the focused node, the one the camera
 * last flew to, or a node close to it; anywhere else a click on a link is an
 * ordinary click on its node, so a careless click while navigating never
 * leaves for another map.
 */

/** World distance from the focused node within which a node's links fire: about the camera's standoff after a flight to a line, so the neighbourhood in view. */
export const LINK_REACH = 60;

/**
 * - `none`: nothing.
 * - `node`: an ordinary click: on the link's node on a link, else on the node under the pointer.
 * - `follow`: go within this graph to the link's target.
 * - `follow-tab`: the target in a new 3D graph tab.
 * - `open-note`: the target in a note view, in a new tab.
 * - `external`: an external URL, in the browser.
 */
export type LinkClick = "none" | "node" | "follow" | "follow-tab" | "open-note" | "external";

export interface LinkClickInput {
	/** The press ended within the click slop of where it began; a drag is never a click. */
	click: boolean;
	/** The link under the pointer, or `null` for none. */
	link: { external: boolean } | null;
	/** The link's node is the focused node. */
	isFocus: boolean;
	/** World distance from the link's node to the focused node; `Infinity` with no focus. */
	focusDistance: number;
	/** Ctrl, or Cmd on macOS. */
	mod: boolean;
	alt: boolean;
	/** Shift, Ctrl or Cmd: a press with one is OrbitControls' pan, which never flies. */
	panKey: boolean;
	/** A finger, not a mouse or pen: a tap on a link is a tap on its node (links open from the long-press menu). */
	touch: boolean;
}

/**
 * What a click on the 3D graph does. Modifiers mirror the mind map's link
 * clicks (`MindMapView.openNodeLink`): plain stays in the medium, Mod opens
 * the same medium in a new tab, Mod+Alt opens a note view in a new tab, and
 * external URLs always go to the browser. On touch a link never fires: a
 * finger that lands on one is as likely to be starting a drag, so a tap there
 * is a tap on its node and the link opens from the long-press menu.
 */
export function linkClickAction(input: LinkClickInput): LinkClick {
	if (!input.click) return "none";
	const { link } = input;
	if (link === null) return input.panKey ? "none" : "node";
	if (input.touch) return "node";
	if (!input.isFocus && !(input.focusDistance <= LINK_REACH)) return "node";
	if (link.external) return "external";
	if (input.mod && input.alt) return "open-note";
	if (input.mod) return "follow-tab";
	return "follow";
}

/**
 * Whether a press released at (`x`, `y`) is a click: it ended in a release
 * (not a cancel, which is the system taking the pointer) within `slop` px of
 * where it began. The release's own position counts as well as the moves seen
 * before it, since a quick flick can reach the release with no move between.
 */
export function releaseIsClick(press: { x: number; y: number }, x: number, y: number, cancelled: boolean, slop: number): boolean {
	return !cancelled && Math.hypot(x - press.x, y - press.y) <= slop;
}

/** Link text up to this long goes into the long-press menu's label. */
export const LINK_LABEL_MAX = 30;

/** The long-press menu item that opens a link: its text when short, else plain "Open link". */
export function openLinkTitle(text: string): string {
	const label = text.trim().replace(/\s+/g, " ");
	return label === "" || label.length > LINK_LABEL_MAX ? "Open link" : `Open link "${label}"`;
}

/** A rectangle on screen, in CSS px. */
export interface ScreenRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** A panel as drawn: its box on screen and its view depth. */
export interface DrawnPanel {
	id: string;
	rect: ScreenRect;
	depth: number;
}

/** A plate as drawn: its box on screen and its view depth. */
export interface DrawnPlate {
	id: string;
	halfWidth: number;
	halfHeight: number;
	x: number;
	y: number;
	depth: number;
}

export function rectContains(rect: ScreenRect, x: number, y: number): boolean {
	return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * The panel drawn on top at (`x`, `y`), or `null` when none is, or a plate
 * nearer than every panel there covers the point (a nearer plate is cut out
 * of the panels behind it). A panel covers its own plate.
 */
export function frontPanelAt(x: number, y: number, panels: readonly DrawnPanel[], plates: readonly DrawnPlate[]): string | null {
	let front: DrawnPanel | null = null;
	for (const panel of panels) {
		if (rectContains(panel.rect, x, y) && (front === null || panel.depth < front.depth)) front = panel;
	}
	if (front === null) return null;
	const withPanels = new Set(panels.map((panel) => panel.id));
	for (const plate of plates) {
		if (plate.depth >= front.depth || withPanels.has(plate.id)) continue;
		if (Math.abs(plate.x - x) <= plate.halfWidth && Math.abs(plate.y - y) <= plate.halfHeight) return null;
	}
	return front.id;
}

/**
 * The number for the next node link written into a note: one past the highest
 * `^N` marker already used as a link's display text there (`[[Note#^id|^N]]`,
 * or `[^N](…)` when the vault writes markdown links), 1 when there is none.
 * Markers are never renumbered, so a deleted link leaves a gap and the next
 * link still takes the next number. The marker is plain text: `[^1]` inside a
 * wikilink would end it at its `]]`.
 */
export function nextLinkMarker(content: string): number {
	let highest = 0;
	for (const match of content.matchAll(/\|\^(\d+)\]\]|\[\^(\d+)\]\(/g)) {
		highest = Math.max(highest, Number(match[1] ?? match[2]));
	}
	return highest + 1;
}

/** A node link's display text: `^N`. */
export function linkMarker(n: number): string {
	return `^${n}`;
}
