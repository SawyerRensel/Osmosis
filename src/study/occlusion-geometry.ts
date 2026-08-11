import type { OcclusionAnnotation, OcclusionShape } from "../database/types";

/**
 * The geometry behind the occlusion editor: normalising pointer input, hit
 * testing, resize handles, and shape mutation.
 *
 * Lives outside `src/views/` because vitest cannot import `obsidian` — the same
 * reason `occlusion-masks.ts` sits here and `splitFenceHeader` sits in
 * `card-gen/explicit.ts`. `OcclusionEditorModal` is meant to stay a thin shell
 * over this file, so the arithmetic that decides where a mask lands is unit
 * tested rather than eyeballed through a canvas.
 *
 * Everything here works in the image's normalised 0–1 space, which is the same
 * space the study renderer paints in. That is what makes a shape drawn in the
 * editor land on the same pixels during study: the editor canvas reuses the
 * renderer's wrapper/`viewBox="0 0 1 1"`/`preserveAspectRatio="none"` contract,
 * so the two never need to agree on a pixel size.
 */

/** A normalised axis-aligned box — the bounding box every shape is edited through. */
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** A point in normalised 0–1 image space. */
export interface Point {
	x: number;
	y: number;
}

/** The eight resize handles, named by compass point. */
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const HANDLE_IDS: readonly HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * The smallest edge a mask may have, normalised.
 *
 * Below this a mask is invisible at any realistic image size, which would leave
 * a card that cannot be answered and a shape that cannot be grabbed to delete.
 * Both the draw gesture and every resize enforce it.
 */
export const MIN_SHAPE_SIZE = 0.005;

/** The rendered box of the image, in client pixels. `DOMRect` satisfies this. */
export interface PixelBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** Clamp to the 0–1 range a normalised coordinate has to stay inside. */
export function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * A client-space pointer position as a normalised image coordinate.
 *
 * Clamped, because a drag holds pointer capture and so keeps reporting
 * positions after it leaves the image — an unclamped mask would extend past
 * the picture, where the study renderer's SVG simply clips it away.
 */
export function toNormalized(clientX: number, clientY: number, box: PixelBox): Point {
	return {
		x: box.width === 0 ? 0 : clamp01((clientX - box.left) / box.width),
		y: box.height === 0 ? 0 : clamp01((clientY - box.top) / box.height),
	};
}

/** A press, kept only so the next one can be judged a double click. */
export interface Click {
	/** `Date.now()` at the press. */
	time: number;
	point: Point;
}

/** How long after a press a second one still counts as a double click. */
export const DOUBLE_CLICK_MS = 400;

/**
 * Whether a press continues the previous one into a double click.
 *
 * The editor detects double clicks itself rather than listening for the native
 * `dblclick`. The overlay is destroyed and rebuilt on every pointer release, so
 * the two constituent clicks land on different elements and the browser is left
 * to fall back to their common ancestor — and pointer capture makes that
 * fragile enough not to build a gesture on. Timing and proximity are
 * deterministic and work the same however the browser routes its compatibility
 * mouse events.
 *
 * Proximity is per-axis for the reason every tolerance here is: the 0–1 space
 * is stretched to the image's aspect ratio.
 */
export function isDoubleClick(
	previous: Click | null,
	time: number,
	point: Point,
	tolerance: Point,
): boolean {
	if (!previous) return false;
	if (time - previous.time > DOUBLE_CLICK_MS) return false;
	return (
		Math.abs(point.x - previous.point.x) <= tolerance.x &&
		Math.abs(point.y - previous.point.y) <= tolerance.y
	);
}

/** The box spanned by two corners of a drag, in either direction. */
export function boxFromDrag(from: Point, to: Point): Box {
	return {
		x: Math.min(from.x, to.x),
		y: Math.min(from.y, to.y),
		w: Math.abs(to.x - from.x),
		h: Math.abs(to.y - from.y),
	};
}

/** True when a box is too small to be a usable mask — a click, not a drag. */
export function isDegenerate(box: Box): boolean {
	return box.w < MIN_SHAPE_SIZE || box.h < MIN_SHAPE_SIZE;
}

/**
 * A shape's bounding box. Every edit — move, resize, handle placement — goes
 * through the box, so the three kinds need only differ in how they convert
 * back (`shapeWithBox`).
 */
export function shapeBox(shape: OcclusionShape): Box {
	switch (shape.kind) {
		case "rect":
			return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
		case "ellipse":
			// x/y are the centre, matching Anki's ellipse handles.
			return { x: shape.x - shape.rx, y: shape.y - shape.ry, w: shape.rx * 2, h: shape.ry * 2 };
		case "poly": {
			const xs = shape.points.map(([x]) => x);
			const ys = shape.points.map(([, y]) => y);
			const x = Math.min(...xs);
			const y = Math.min(...ys);
			return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
		}
	}
}

/**
 * The same shape re-fitted to a new bounding box.
 *
 * Polygons cannot be drawn until phase 4, but a set loaded from an existing
 * note may already contain one, so it has to survive being moved and resized
 * rather than being silently dropped or left behind. Its points scale with the
 * box; a degenerate source box (every point on one axis) translates instead of
 * dividing by zero.
 */
export function shapeWithBox(shape: OcclusionShape, box: Box): OcclusionShape {
	switch (shape.kind) {
		case "rect":
			return { ...shape, x: box.x, y: box.y, w: box.w, h: box.h };
		case "ellipse":
			return { ...shape, x: box.x + box.w / 2, y: box.y + box.h / 2, rx: box.w / 2, ry: box.h / 2 };
		case "poly": {
			const from = shapeBox(shape);
			const scaleX = from.w === 0 ? 0 : box.w / from.w;
			const scaleY = from.h === 0 ? 0 : box.h / from.h;
			return {
				...shape,
				points: shape.points.map(([x, y]): [number, number] => [
					box.x + (x - from.x) * scaleX,
					box.y + (y - from.y) * scaleY,
				]),
			};
		}
	}
}

/** Build a freshly drawn shape of `kind` from the box the pointer swept out. */
export function shapeFromBox(kind: "rect" | "ellipse", group: string, box: Box): OcclusionShape {
	return kind === "rect"
		? { group, kind: "rect", x: box.x, y: box.y, w: box.w, h: box.h }
		: {
			group,
			kind: "ellipse",
			x: box.x + box.w / 2,
			y: box.y + box.h / 2,
			rx: box.w / 2,
			ry: box.h / 2,
		};
}

/** Whether a point falls inside a shape, tested against its true outline. */
export function containsPoint(shape: OcclusionShape, point: Point): boolean {
	switch (shape.kind) {
		case "rect": {
			const box = shapeBox(shape);
			return (
				point.x >= box.x && point.x <= box.x + box.w &&
				point.y >= box.y && point.y <= box.y + box.h
			);
		}
		case "ellipse": {
			if (shape.rx === 0 || shape.ry === 0) return false;
			const dx = (point.x - shape.x) / shape.rx;
			const dy = (point.y - shape.y) / shape.ry;
			return dx * dx + dy * dy <= 1;
		}
		case "poly":
			return pointInPolygon(shape.points, point);
	}
}

/** Standard ray-casting point-in-polygon test. */
function pointInPolygon(points: readonly [number, number][], point: Point): boolean {
	let inside = false;
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const [xi, yi] = points[i]!;
		const [xj, yj] = points[j]!;
		if (yi > point.y !== yj > point.y) {
			const crossing = xi + ((point.y - yi) / (yj - yi)) * (xj - xi);
			if (point.x < crossing) inside = !inside;
		}
	}
	return inside;
}

/**
 * Index of the shape under a point, or -1.
 *
 * Searched last-to-first because shapes paint in source order, so the last one
 * drawn is the one on top and the one the user means to grab.
 */
export function hitTest(shapes: readonly OcclusionShape[], point: Point): number {
	for (let i = shapes.length - 1; i >= 0; i--) {
		if (containsPoint(shapes[i]!, point)) return i;
	}
	return -1;
}

/** Where a handle sits on a box, in normalised space. */
export function handlePoint(box: Box, handle: HandleId): Point {
	const midX = box.x + box.w / 2;
	const midY = box.y + box.h / 2;
	const right = box.x + box.w;
	const bottom = box.y + box.h;
	switch (handle) {
		case "nw": return { x: box.x, y: box.y };
		case "n": return { x: midX, y: box.y };
		case "ne": return { x: right, y: box.y };
		case "e": return { x: right, y: midY };
		case "se": return { x: right, y: bottom };
		case "s": return { x: midX, y: bottom };
		case "sw": return { x: box.x, y: bottom };
		case "w": return { x: box.x, y: midY };
	}
}

/**
 * The handle under a point, or null.
 *
 * `tolerance` is per-axis because the 0–1 space is stretched to the image's
 * aspect ratio: one normalised unit is a different number of pixels on x than
 * on y, so a single scalar would make handles easy to grab on the short axis
 * and nearly impossible on the long one. Corners are tested before edges, so
 * the overlapping region at a corner resizes both axes.
 */
export function handleAt(box: Box, point: Point, tolerance: Point): HandleId | null {
	for (const handle of HANDLE_IDS) {
		const at = handlePoint(box, handle);
		if (Math.abs(point.x - at.x) <= tolerance.x && Math.abs(point.y - at.y) <= tolerance.y) {
			return handle;
		}
	}
	return null;
}

/**
 * Move a box by a normalised delta, kept wholly inside the image.
 *
 * Clamping the *box* rather than each edge means a drag past the border stops
 * the shape at the edge and keeps its size, instead of squashing it — which is
 * what a user dragging quickly past the corner expects.
 */
export function moveBox(box: Box, dx: number, dy: number): Box {
	return {
		...box,
		x: Math.min(Math.max(box.x + dx, 0), Math.max(0, 1 - box.w)),
		y: Math.min(Math.max(box.y + dy, 0), Math.max(0, 1 - box.h)),
	};
}

/**
 * The box that results from dragging `handle` to `point`.
 *
 * The opposite edge is fixed, so a drag past it flips the box rather than
 * inverting its width — the shape follows the pointer, as every drawing tool
 * does. Edges the handle does not own are untouched, and `MIN_SHAPE_SIZE` is
 * enforced on the axes the handle moves.
 */
export function resizeBox(box: Box, handle: HandleId, point: Point): Box {
	const touchesLeft = handle === "nw" || handle === "w" || handle === "sw";
	const touchesRight = handle === "ne" || handle === "e" || handle === "se";
	const touchesTop = handle === "nw" || handle === "n" || handle === "ne";
	const touchesBottom = handle === "sw" || handle === "s" || handle === "se";

	let left = box.x;
	let right = box.x + box.w;
	let top = box.y;
	let bottom = box.y + box.h;

	if (touchesLeft) left = clamp01(point.x);
	if (touchesRight) right = clamp01(point.x);
	if (touchesTop) top = clamp01(point.y);
	if (touchesBottom) bottom = clamp01(point.y);

	const next = boxFromDrag({ x: left, y: top }, { x: right, y: bottom });
	if (touchesLeft || touchesRight) next.w = Math.max(next.w, MIN_SHAPE_SIZE);
	if (touchesTop || touchesBottom) next.h = Math.max(next.h, MIN_SHAPE_SIZE);
	return next;
}

// ── Polygons ──────────────────────────────────────────────────

/**
 * The fewest vertices a polygon may keep.
 *
 * Two points enclose no area, so the mask would be invisible and the card
 * unanswerable — the same reason `MIN_SHAPE_SIZE` exists for the other kinds.
 * `parseShape` drops a sub-three-point poly on read, and vertex deletion
 * refuses to create one.
 */
export const MIN_POLY_POINTS = 3;

/** A polygon from the vertices a draft collected, or null when there are too few. */
export function polyFromPoints(group: string, points: readonly Point[]): OcclusionShape | null {
	if (points.length < MIN_POLY_POINTS) return null;
	return { group, kind: "poly", points: points.map((p): [number, number] => [p.x, p.y]) };
}

/**
 * Index of the vertex under a point, or null.
 *
 * `tolerance` is per-axis for the same reason `handleAt`'s is: the 0–1 space is
 * stretched to the image's aspect ratio, so one normalised unit is a different
 * number of pixels on each axis.
 */
export function vertexAt(
	points: readonly [number, number][],
	point: Point,
	tolerance: Point,
): number | null {
	for (let i = 0; i < points.length; i++) {
		const [x, y] = points[i]!;
		if (Math.abs(point.x - x) <= tolerance.x && Math.abs(point.y - y) <= tolerance.y) return i;
	}
	return null;
}

/** The same polygon with one vertex dragged to `point`. Other kinds pass through. */
export function withVertexMoved(shape: OcclusionShape, index: number, point: Point): OcclusionShape {
	if (shape.kind !== "poly" || index < 0 || index >= shape.points.length) return shape;
	const points = shape.points.map((p): [number, number] => [...p]);
	points[index] = [clamp01(point.x), clamp01(point.y)];
	return { ...shape, points };
}

/**
 * The same polygon without one vertex, or unchanged at the floor.
 *
 * Refusing rather than deleting the shape is deliberate: the user asked to drop
 * a point, not to lose the mask and, with it, a card that may be deep into
 * review.
 */
export function withVertexRemoved(shape: OcclusionShape, index: number): OcclusionShape {
	if (shape.kind !== "poly" || shape.points.length <= MIN_POLY_POINTS) return shape;
	if (index < 0 || index >= shape.points.length) return shape;
	return { ...shape, points: shape.points.filter((_, i) => i !== index) };
}

/**
 * The same polygon with a vertex inserted on whichever edge passes closest to
 * `point`, and the index it landed at.
 *
 * Distance is measured in normalised space rather than pixels, so on a very
 * wide image the comparison leans slightly towards horizontal edges. The point
 * comes from a click on the outline, where the nearest edge is not in doubt, so
 * correcting for the aspect ratio would buy nothing.
 */
export function withVertexInserted(
	shape: OcclusionShape,
	point: Point,
): { shape: OcclusionShape; index: number } {
	if (shape.kind !== "poly") return { shape, index: -1 };

	let bestEdge = 0;
	let bestDistance = Infinity;
	let bestAt: Point = point;
	for (let i = 0; i < shape.points.length; i++) {
		const from = shape.points[i]!;
		const to = shape.points[(i + 1) % shape.points.length]!;
		const at = closestPointOnSegment(from, to, point);
		const distance = Math.hypot(at.x - point.x, at.y - point.y);
		if (distance < bestDistance) {
			bestDistance = distance;
			bestEdge = i;
			bestAt = at;
		}
	}

	const points = shape.points.map((p): [number, number] => [...p]);
	points.splice(bestEdge + 1, 0, [bestAt.x, bestAt.y]);
	return { shape: { ...shape, points }, index: bestEdge + 1 };
}

/** The point on segment `from`–`to` nearest `point`. */
function closestPointOnSegment(
	from: readonly [number, number],
	to: readonly [number, number],
	point: Point,
): Point {
	const dx = to[0] - from[0];
	const dy = to[1] - from[1];
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq === 0) return { x: from[0], y: from[1] };
	const t = Math.min(1, Math.max(0, ((point.x - from[0]) * dx + (point.y - from[1]) * dy) / lengthSq));
	return { x: from[0] + t * dx, y: from[1] + t * dy };
}

// ── Multi-shape operations ────────────────────────────────────

/** Which edge or axis an align operation lines the selection up on. */
export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** The smallest box containing every one of `boxes`. Empty input gives a zero box. */
export function unionBox(boxes: readonly Box[]): Box {
	if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
	const left = Math.min(...boxes.map((b) => b.x));
	const top = Math.min(...boxes.map((b) => b.y));
	const right = Math.max(...boxes.map((b) => b.x + b.w));
	const bottom = Math.max(...boxes.map((b) => b.y + b.h));
	return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Line the shapes at `indices` up against the selection's own bounding box.
 *
 * The reference is the selection rather than the image, matching every drawing
 * tool: aligning left means "to the leftmost of these", not "to the edge of the
 * picture", which would stack every mask on the border.
 *
 * Sizes never change — only the position along the aligned axis — so a mask
 * that was drawn to fit a label still fits it afterwards.
 */
export function alignShapes(
	shapes: readonly OcclusionShape[],
	indices: readonly number[],
	alignment: Alignment,
): OcclusionShape[] {
	const chosen = indices.filter((i) => i >= 0 && i < shapes.length);
	if (chosen.length < 2) return [...shapes];

	const bounds = unionBox(chosen.map((i) => shapeBox(shapes[i]!)));
	const next = [...shapes];
	for (const i of chosen) {
		const box = shapeBox(shapes[i]!);
		next[i] = shapeWithBox(shapes[i]!, { ...box, ...alignedOrigin(box, bounds, alignment) });
	}
	return next;
}

/** Where one box's origin moves to under an alignment. */
function alignedOrigin(box: Box, bounds: Box, alignment: Alignment): Partial<Box> {
	switch (alignment) {
		case "left": return { x: bounds.x };
		case "center": return { x: bounds.x + (bounds.w - box.w) / 2 };
		case "right": return { x: bounds.x + bounds.w - box.w };
		case "top": return { y: bounds.y };
		case "middle": return { y: bounds.y + (bounds.h - box.h) / 2 };
		case "bottom": return { y: bounds.y + bounds.h - box.h };
	}
}

/**
 * Move the shapes at `indices` together by a normalised delta.
 *
 * The *union* box is what gets clamped to the image, not each shape: clamping
 * individually would let a shape that reaches the edge stop while its
 * neighbours carried on, quietly deforming a group the user had arranged.
 */
export function moveShapes(
	shapes: readonly OcclusionShape[],
	indices: readonly number[],
	dx: number,
	dy: number,
): OcclusionShape[] {
	const chosen = indices.filter((i) => i >= 0 && i < shapes.length);
	if (chosen.length === 0) return [...shapes];

	const bounds = unionBox(chosen.map((i) => shapeBox(shapes[i]!)));
	const moved = moveBox(bounds, dx, dy);
	const actualX = moved.x - bounds.x;
	const actualY = moved.y - bounds.y;

	const next = [...shapes];
	for (const i of chosen) {
		const box = shapeBox(shapes[i]!);
		next[i] = shapeWithBox(shapes[i]!, { ...box, x: box.x + actualX, y: box.y + actualY });
	}
	return next;
}

/** How far a duplicate is nudged off its original, so the copy is visible. */
export const DUPLICATE_OFFSET = 0.02;

/** A deep copy of a shape — `points` included, which a spread would share. */
export function cloneShape(shape: OcclusionShape): OcclusionShape {
	return shape.kind === "poly"
		? { ...shape, points: shape.points.map((p): [number, number] => [...p]) }
		: { ...shape };
}

/**
 * A copy of a shape, nudged clear of the original and kept inside the image.
 *
 * The copy keeps its source's `group`, so duplicating a mask adds a second
 * shape to the same card rather than minting a new one. Duplicating is how you
 * cover a repeated feature that belongs to one answer; a copy that started its
 * own card would turn one card into two behind the user's back.
 */
export function duplicateShape(shape: OcclusionShape, offset = DUPLICATE_OFFSET): OcclusionShape {
	return shapeWithBox(cloneShape(shape), moveBox(shapeBox(shape), offset, offset));
}

/** A copy of an annotation, nudged clear of the original. */
export function duplicateAnnotation(
	annotation: OcclusionAnnotation,
	offset = DUPLICATE_OFFSET,
): OcclusionAnnotation {
	return {
		...annotation,
		x: clamp01(annotation.x + offset),
		y: clamp01(annotation.y + offset),
	};
}

// ── Zoom ──────────────────────────────────────────────────────

/**
 * Zoom bounds. 1 *is* zoom-to-fit — the canvas at rest already shows the whole
 * image — so there is nothing below it worth reaching, and clamping there keeps
 * "zoom out" and "zoom to fit" from disagreeing about where the floor is.
 */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
export const ZOOM_STEP = 1.25;

/** The zoom level `factor` steps away from `zoom`, clamped to the usable range. */
export function zoomBy(zoom: number, factor: number): number {
	const next = zoom * factor;
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 1000) / 1000));
}

/**
 * The next free `cN` group label, given every label already spoken for.
 *
 * `used` must span the whole *carrier*, not just the set being edited. A fence
 * derives its occlusion card IDs as `<fenceId>-cN` across all of its labelled
 * embeds, so two diagrams in one fence both numbering from `c1` would derive
 * the same IDs and the second card would overwrite the first in the store.
 *
 * Numbering continues above the highest in use rather than filling gaps: a
 * reused number would inherit the deleted group's schedule, presenting a
 * brand-new mask as a card already deep into review.
 */
export function nextGroup(used: Iterable<string>): string {
	let highest = 0;
	for (const label of used) {
		const match = /^c(\d+)$/.exec(label);
		if (match) {
			const num = parseInt(match[1]!, 10);
			if (num > highest) highest = num;
		}
	}
	return `c${String(highest + 1)}`;
}

/** Every group label a shape list uses, in first-appearance order. */
export function usedGroups(shapes: readonly OcclusionShape[]): string[] {
	const seen = new Set<string>();
	for (const shape of shapes) seen.add(shape.group);
	return [...seen];
}
