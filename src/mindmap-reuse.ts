/**
 * Which drawn node groups an edit's render pass can keep (T80).
 *
 * A full render pass used to throw the whole SVG away and draw every visible
 * node again, so the browser re-laid out every node's Markdown after every
 * edit. A pass that follows an edit now keeps each drawn group whose drawing
 * would come out the same, and moves it into place with a translation: a node
 * that only moved (the rows below an Enter) keeps its render. Everything else
 * is drawn fresh, exactly as before.
 *
 * Pure: the view hands in what it recorded at draw time and what the new
 * layout wants, and gets back the plan.
 */

/** A group already in the DOM, with what was recorded when it was drawn. */
export interface DrawnGroup<E> {
	id: string;
	el: E;
	/** Everything the drawing depends on except position; null = never reuse. */
	sig: string | null;
	/** Where it was drawn (layout + offset). */
	x: number;
	y: number;
}

/** A node the new pass wants on screen. */
export interface WantedNode<N> {
	id: string;
	node: N;
	sig: string;
	x: number;
	y: number;
}

export interface ReusePlan<E, N> {
	/** Groups to keep, each with the translation from where it was drawn. */
	keep: { el: E; dx: number; dy: number }[];
	/** Nodes with no matching group: draw them. */
	draw: N[];
	/** Groups to take out of the DOM. */
	remove: E[];
}

/**
 * Match wanted nodes to drawn groups by id and signature. One group per id at
 * most is kept; any duplicate group for an id is removed, as is every group
 * whose node is gone, off screen, or would draw differently.
 */
export function planReuse<E, N>(drawn: readonly DrawnGroup<E>[], wanted: readonly WantedNode<N>[]): ReusePlan<E, N> {
	const byId = new Map<string, DrawnGroup<E>>();
	const remove: E[] = [];
	for (const group of drawn) {
		if (group.sig === null || byId.has(group.id)) remove.push(group.el);
		else byId.set(group.id, group);
	}
	const keep: ReusePlan<E, N>["keep"] = [];
	const draw: N[] = [];
	for (const want of wanted) {
		const group = byId.get(want.id);
		if (group && group.sig === want.sig) {
			keep.push({ el: group.el, dx: want.x - group.x, dy: want.y - group.y });
			byId.delete(want.id);
		} else {
			draw.push(want.node);
		}
	}
	for (const group of byId.values()) remove.push(group.el);
	return { keep, draw, remove };
}

/** The group's `transform` attribute for a translation, or null for none. */
export function translateAttr(dx: number, dy: number): string | null {
	return dx === 0 && dy === 0 ? null : `translate(${String(dx)}, ${String(dy)})`;
}
