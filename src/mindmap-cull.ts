/**
 * Pure viewport maths for the Mind Map's culling: which boxes are in view,
 * where the first frame looks, and how many entering nodes one cull pass may
 * draw before it hands the rest to the next frame.
 */
import type { ViewBox } from "./mindmap-viewport";

/** Does a box (map coordinates) overlap the viewBox grown by `margin` on every side? */
export function rectInView(
	x: number,
	y: number,
	w: number,
	h: number,
	view: ViewBox,
	margin: number,
): boolean {
	const vx = view.x - margin;
	const vy = view.y - margin;
	const vw = view.w + margin * 2;
	const vh = view.h + margin * 2;
	return x + w > vx && x < vx + vw && y + h > vy && y < vy + vh;
}

/**
 * The viewBox and zoom that frame the whole map (content of `contentW` ×
 * `contentH`, padding included) centred in a `containerW` × `containerH`
 * viewport. A zero-sized container falls back to the content size, as the
 * view always has.
 */
export function fitViewBox(
	contentW: number,
	contentH: number,
	containerW: number,
	containerH: number,
	minZoom: number,
	maxZoom: number,
): { viewBox: ViewBox; zoom: number } {
	const cw = containerW || contentW;
	const ch = containerH || contentH;
	const zoom = Math.max(minZoom, Math.min(cw / contentW, ch / contentH, maxZoom));
	const w = cw / zoom;
	const h = ch / zoom;
	return {
		viewBox: { x: (contentW - w) / 2, y: (contentH - h) / 2, w, h },
		zoom,
	};
}

/**
 * Draw items in order until `budgetMs` has passed, and return the ones left
 * over. The first item is always drawn, so a pass always makes progress.
 * `urgent` items come first: they are what is already on screen.
 */
export function drawWithinBudget<T>(
	urgent: readonly T[],
	rest: readonly T[],
	budgetMs: number,
	now: () => number,
	draw: (item: T) => void,
): T[] {
	const deadline = now() + budgetMs;
	const deferred: T[] = [];
	let drew = false;
	for (const list of [urgent, rest]) {
		for (const item of list) {
			if (drew && now() > deadline) {
				deferred.push(item);
				continue;
			}
			draw(item);
			drew = true;
		}
	}
	return deferred;
}
