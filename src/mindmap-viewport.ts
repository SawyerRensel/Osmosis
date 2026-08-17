/**
 * Pan/zoom viewport math for the mind map.
 *
 * The map has always described its viewport as an SVG `viewBox` — an
 * (x, y, w, h) rectangle in node coordinates that the browser fits into the
 * SVG's box, and panning is a rewrite of that rectangle.
 *
 * That does not work in WKWebView. WebKit re-transforms SVG geometry on every
 * `viewBox` change, but a `<foreignObject>` descendant it has promoted to its
 * own compositing layer keeps the backing it was first given, in document
 * coordinates. The layer strands: node bodies stay welded to the screen at the
 * position and the scale they first painted at while the map slides away
 * underneath them. Since every node body in this view is HTML inside a
 * `<foreignObject>`, and Obsidian's markdown styles promote plenty of them
 * (callouts blend, code fences and callout bodies scroll, reveals animate),
 * there is no list of CSS properties to suppress that stays complete.
 *
 * So on iOS the map moves with a CSS transform instead. A CSS transform on an
 * ancestor is applied to descendant layers by the compositor — that is the
 * ordinary accelerated-scrolling contract, and it is the same thing Obsidian's
 * own Canvas does: `.canvas` is `transform-origin: 0 0` and its
 * `translate(...) scale(...)` is written from JS while `.canvas-wrapper` does
 * the clipping.
 *
 * These functions convert the one description into the other. The fit is
 * defined to reproduce `preserveAspectRatio="xMidYMid meet"` — the default the
 * SVG has always been painted with — so both paths put every pixel in the same
 * place and the rest of the view can keep reasoning in `viewBox` terms.
 */

export interface ViewBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A viewport's box in client (screen) coordinates. */
export interface ViewportBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface ViewBoxFit {
	/** Client pixels per node-coordinate unit. */
	scale: number;
	/** Slack on each axis, in client pixels, from centring the scaled box. */
	offsetX: number;
	offsetY: number;
}

/**
 * How a `viewBox` resolves inside a viewport of this size, under
 * `preserveAspectRatio="xMidYMid meet"`.
 */
export function viewBoxFit(
	viewBox: ViewBox,
	viewport: { width: number; height: number },
): ViewBoxFit {
	// Both boxes are degenerate while the view is still laying out — during the
	// first render, and on mobile whenever the pane is collapsed. The identity
	// leaves the map where it is instead of collapsing it to a point or
	// dividing by zero further down.
	if (viewBox.w <= 0 || viewBox.h <= 0) {
		return { scale: 1, offsetX: 0, offsetY: 0 };
	}
	if (viewport.width <= 0 || viewport.height <= 0) {
		return { scale: 1, offsetX: 0, offsetY: 0 };
	}

	// `meet` scales uniformly by the tighter of the two ratios; `xMidYMid`
	// centres whatever slack the looser axis is left with. The view keeps the
	// two aspect ratios equal (`handleContainerResize` derives w and h from the
	// container at the current zoom), so in practice both offsets are 0 and the
	// scale is the zoom — but reproducing the full rule means the transform
	// path cannot drift from the viewBox path if that ever stops holding.
	const scale = Math.min(
		viewport.width / viewBox.w,
		viewport.height / viewBox.h,
	);
	return {
		scale,
		offsetX: (viewport.width - viewBox.w * scale) / 2,
		offsetY: (viewport.height - viewBox.h * scale) / 2,
	};
}

/**
 * The CSS transform that paints `viewBox` into a viewport-sized element whose
 * own coordinate system is 1:1 with node coordinates — an `<svg>` carrying no
 * `viewBox` attribute of its own.
 *
 * Requires `transform-origin: 0 0` on the element, and requires it not to clip
 * at its own bounds: the visible region is no longer the element's box, so the
 * clipping belongs to a host around it.
 */
export function viewBoxTransform(
	viewBox: ViewBox,
	viewport: { width: number; height: number },
): string {
	const { scale, offsetX, offsetY } = viewBoxFit(viewBox, viewport);
	const tx = offsetX - viewBox.x * scale;
	const ty = offsetY - viewBox.y * scale;
	return `translate(${String(tx)}px, ${String(ty)}px) scale(${String(scale)})`;
}

/**
 * Client (screen) coordinates → node coordinates. The exact inverse of
 * {@link viewBoxTransform}, and equal to what `SVGSVGElement.getScreenCTM()`
 * returns on the viewBox path.
 */
export function clientToUser(
	viewBox: ViewBox,
	viewport: ViewportBox,
	clientX: number,
	clientY: number,
): { x: number; y: number } {
	const { scale, offsetX, offsetY } = viewBoxFit(viewBox, viewport);
	return {
		x: viewBox.x + (clientX - viewport.left - offsetX) / scale,
		y: viewBox.y + (clientY - viewport.top - offsetY) / scale,
	};
}

/**
 * Node coordinates → client (screen) coordinates. Only used by tests and by
 * anything that needs to check the two paths agree; the view itself reads
 * screen positions off the DOM, which already carries the transform.
 */
export function userToClient(
	viewBox: ViewBox,
	viewport: ViewportBox,
	userX: number,
	userY: number,
): { x: number; y: number } {
	const { scale, offsetX, offsetY } = viewBoxFit(viewBox, viewport);
	return {
		x: viewport.left + offsetX + (userX - viewBox.x) * scale,
		y: viewport.top + offsetY + (userY - viewBox.y) * scale,
	};
}
