import {
	BOX,
	FIT,
	isDoubleTap,
	isZoomed,
	panBy,
	pinchState,
	wheelZoomFactor,
	zoomAbout,
	windowIn,
	zoomStyle,
	type BoxPoint,
	type ScreenRect,
	type Tap,
	type ZoomState,
	type ZoomWindow,
} from "../study/image-zoom";
import { zoomBy } from "../study/occlusion-geometry";

/**
 * Pinch and Ctrl+wheel zoom for the images on a study surface (T104): the
 * Flashcard study tab's card, and a note's reading view during Note study.
 *
 * One controller per surface, listening on its root and finding the picture at
 * event time, so images that arrive later — an embed resolving after the
 * markdown, an occlusion card's answer side redrawn on reveal — need nothing
 * attached to them. A picture is either an occluded diagram's
 * `.osmosis-occlusion` wrapper, zoomed as a whole so its masks and labels come
 * with it, or a bare `<img>`.
 *
 * The zoom is drawn in place: the picture's box keeps its size in the layout, so
 * nothing on the card moves, and the magnified picture spills out of the box
 * over the study area around it, which styles.css clips (batch 14, F2). The
 * pan is held to the part of that area on screen, which the surface supplies as
 * `areaOf` and which is measured as each gesture starts. A plain wheel is never
 * taken, so the card scrolls exactly as it did; a mouse or one finger pans only
 * a picture that is already zoomed.
 */

const ZOOMED_CLASS = "osmosis-zoomed";
const PANNING_CLASS = "is-panning";
/** Movement, in px, that turns a press on a zoomed picture into a pan rather than a click or tap. */
const DRAG_PX = 6;

/** Each zoomed picture's zoom; a picture at fit has no entry. */
const zooms = new WeakMap<HTMLElement, ZoomState>();

/** `picture`'s current zoom — fit for one never zoomed, or null. */
export function zoomOf(picture: HTMLElement | null): ZoomState {
	return (picture && zooms.get(picture)) ?? FIT;
}

/** Draw `picture` at `state`. Also how a redrawn copy of a picture takes over its predecessor's zoom. */
export function setZoom(picture: HTMLElement, state: ZoomState): void {
	if (isZoomed(state)) zooms.set(picture, state);
	else zooms.delete(picture);
	picture.toggleClass(ZOOMED_CLASS, isZoomed(state));
	picture.setCssProps(zoomStyle(state));
}

/**
 * `el`'s content box on screen: inside its padding, border and scrollbar. For a
 * scroller that is the part of its content on view, less the room it keeps
 * clear for whatever floats over its edges.
 */
export function contentRect(el: HTMLElement): ScreenRect {
	const rect = el.getBoundingClientRect();
	const style = getComputedStyle(el);
	const left = rect.left + el.clientLeft;
	const top = rect.top + el.clientTop;
	return {
		left: left + parseFloat(style.paddingLeft),
		top: top + parseFloat(style.paddingTop),
		right: left + el.clientWidth - parseFloat(style.paddingRight),
		bottom: top + el.clientHeight - parseFloat(style.paddingBottom),
	};
}

/** A picture's box in the layout, which a zoom never changes. */
interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface Pan {
	picture: HTMLElement;
	pointerId: number;
	start: ZoomState;
	box: Box;
	window: ZoomWindow;
	x: number;
	y: number;
	moved: boolean;
}

interface Pinch {
	picture: HTMLElement;
	start: ZoomState;
	box: Box;
	window: ZoomWindow;
	center: BoxPoint;
	spread: number;
}

export class ImageZoom {
	private readonly off: (() => void)[] = [];
	/** A mouse (or one finger) dragging a zoomed picture. */
	private pan: Pan | null = null;
	private pinch: Pinch | null = null;
	/** The last tap on a zoomed picture, for telling a double tap. */
	private lastTap: (Tap & { picture: HTMLElement }) | null = null;
	/** Set by a drag that just ended, so the click it is about to produce does not count as one. */
	private swallowClick = false;

	/**
	 * @param root  The surface: every picture under it zooms.
	 * @param areaOf  The study area on screen that a zoomed picture may fill —
	 *   the area styles.css clips it to, or the visible part of it.
	 */
	constructor(
		private readonly root: HTMLElement,
		private readonly areaOf: () => ScreenRect,
	) {
		// Not passive: zooming takes the event away from the card's scroll.
		this.listen("wheel", (e) => this.onWheel(e), { passive: false });
		this.listen("pointerdown", (e) => this.onPointerDown(e));
		this.listen("pointermove", (e) => this.onPointerMove(e));
		this.listen("pointerup", (e) => this.endPan(e));
		this.listen("pointercancel", (e) => this.endPan(e));
		// Capture, so a drag's click is gone before a reveal listener below sees it.
		this.listen("click", (e) => this.onClick(e), { capture: true });
		this.listen("dblclick", (e) => this.onDoubleClick(e));
		this.listen("dragstart", (e) => {
			if (isZoomed(zoomOf(this.pictureAt(e.target)))) e.preventDefault();
		});
		this.listen("touchstart", (e) => this.onTouchStart(e), { passive: true });
		// Not passive: a pinch or a pan must stop the card scrolling under it.
		this.listen("touchmove", (e) => this.onTouchMove(e), { passive: false });
		this.listen("touchend", (e) => this.onTouchEnd(e), { passive: false });
		this.listen("touchcancel", () => this.endTouch(), { passive: true });
	}

	/** Stop listening and put every picture under the root back at fit. */
	destroy(): void {
		for (const off of this.off.splice(0)) off();
		this.pan = null;
		this.pinch = null;
		this.lastTap = null;
		for (const picture of Array.from(this.root.querySelectorAll<HTMLElement>(`.${ZOOMED_CLASS}`))) {
			setZoom(picture, FIT);
		}
	}

	private listen<K extends keyof HTMLElementEventMap>(
		type: K,
		handler: (e: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions,
	): void {
		this.root.addEventListener(type, handler, options);
		this.off.push(() => this.root.removeEventListener(type, handler, options));
	}

	/**
	 * The picture `target` belongs to, or null. An occluded diagram zooms as its
	 * wrapper, so a press on a mask or a label counts; its floating rating
	 * buttons do not.
	 */
	private pictureAt(target: EventTarget | null): HTMLElement | null {
		// Duck-typed rather than `instanceof`, which fails for a tab in a popout window
		const el = target as Element | null;
		if (el === null || typeof el.closest !== "function" || !this.root.contains(el)) return null;
		if (el.closest(".osmosis-occlusion-rating-anchor")) return null;
		const diagram = el.closest<HTMLElement>(".osmosis-occlusion");
		if (diagram && this.root.contains(diagram)) return diagram;
		return el.tagName === "IMG" ? el as HTMLElement : null;
	}

	/**
	 * Where `picture`'s box sits on screen. A bare image carries the transform
	 * itself, so its bounding rect is the magnified picture's; undo the offset to
	 * find the box. A diagram's wrapper is never transformed, only its layers.
	 */
	private boxOf(picture: HTMLElement): Box {
		const rect = picture.getBoundingClientRect();
		const width = picture.offsetWidth;
		const height = picture.offsetHeight;
		if (picture.tagName !== "IMG") return { left: rect.left, top: rect.top, width, height };
		const state = zoomOf(picture);
		return { left: rect.left - state.x * width, top: rect.top - state.y * height, width, height };
	}

	/** The study area as a window onto `box`. */
	private windowFor(box: Box): ZoomWindow {
		const area = this.areaOf();
		if (area.right <= area.left || area.bottom <= area.top) return BOX;
		return windowIn({ left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height }, area);
	}

	private static pointIn(box: Box, clientX: number, clientY: number): BoxPoint {
		return {
			x: box.width > 0 ? (clientX - box.left) / box.width : 0,
			y: box.height > 0 ? (clientY - box.top) / box.height : 0,
		};
	}

	// ── Wheel ─────────────────────────────────────────────────────

	/** Ctrl+wheel, or a touchpad pinch (which arrives as one), zooms about the pointer. */
	private onWheel(e: WheelEvent): void {
		if (!e.ctrlKey) return;
		const picture = this.pictureAt(e.target);
		if (!picture) return;
		e.preventDefault();
		const state = zoomOf(picture);
		const zoom = zoomBy(state.zoom, wheelZoomFactor(e.deltaY, e.deltaMode));
		if (zoom === state.zoom) return;
		const box = this.boxOf(picture);
		setZoom(picture, zoomAbout(state, zoom, ImageZoom.pointIn(box, e.clientX, e.clientY), this.windowFor(box)));
	}

	// ── Mouse ─────────────────────────────────────────────────────

	private onPointerDown(e: PointerEvent): void {
		// Touch is handled by the touch events, which can tell one finger from two
		if (e.pointerType === "touch" || e.button !== 0) return;
		const picture = this.pictureAt(e.target);
		if (!picture || !isZoomed(zoomOf(picture))) return;
		const box = this.boxOf(picture);
		this.pan = {
			picture,
			pointerId: e.pointerId,
			start: zoomOf(picture),
			box,
			window: this.windowFor(box),
			x: e.clientX,
			y: e.clientY,
			moved: false,
		};
	}

	private onPointerMove(e: PointerEvent): void {
		const pan = this.pan;
		if (!pan || e.pointerType === "touch" || e.pointerId !== pan.pointerId) return;
		if (!this.dragTo(pan, e.clientX, e.clientY)) return;
		e.preventDefault();
		if (!pan.picture.hasPointerCapture(e.pointerId)) {
			// Only once it is a drag: capturing on press would retarget a plain
			// click to the wrapper.
			pan.picture.setPointerCapture(e.pointerId);
			pan.picture.addClass(PANNING_CLASS);
		}
	}

	private endPan(e: PointerEvent): void {
		const pan = this.pan;
		// A touch pan shares the field, and a touch's pointer ID may equal its identifier
		if (!pan || e.pointerType === "touch" || e.pointerId !== pan.pointerId) return;
		this.pan = null;
		pan.picture.removeClass(PANNING_CLASS);
		if (!pan.moved) return;
		this.swallowClick = true;
		// The click follows the pointerup straight away; one that never comes must not eat a later one.
		window.setTimeout(() => { this.swallowClick = false; }, 0);
	}

	/** Move `pan` to the pointer, once it has gone far enough to be a drag. Whether it is one. */
	private dragTo(pan: Pan, clientX: number, clientY: number): boolean {
		const dx = clientX - pan.x;
		const dy = clientY - pan.y;
		if (!pan.moved && Math.hypot(dx, dy) < DRAG_PX) return false;
		pan.moved = true;
		setZoom(pan.picture, panBy(pan.start, dx / pan.box.width, dy / pan.box.height, pan.window));
		return true;
	}

	private onClick(e: MouseEvent): void {
		if (!this.swallowClick) return;
		this.swallowClick = false;
		e.preventDefault();
		e.stopPropagation();
	}

	private onDoubleClick(e: MouseEvent): void {
		const picture = this.pictureAt(e.target);
		if (!picture || !isZoomed(zoomOf(picture))) return;
		e.preventDefault();
		setZoom(picture, FIT);
	}

	// ── Touch ─────────────────────────────────────────────────────

	private onTouchStart(e: TouchEvent): void {
		const [a, b] = [e.touches[0], e.touches[1]];
		if (e.touches.length === 2 && a && b) {
			const picture = this.pictureAt(a.target) ?? this.pictureAt(b.target);
			if (!picture) return;
			this.pan = null;
			this.lastTap = null;
			const box = this.boxOf(picture);
			this.pinch = {
				picture,
				start: zoomOf(picture),
				box,
				window: this.windowFor(box),
				center: ImageZoom.pointIn(box, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
				spread: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
			};
			// The study tab already treats a second finger as "not a swipe", so the
			// event keeps propagating.
			return;
		}
		if (e.touches.length !== 1 || !a) {
			this.endTouch();
			return;
		}
		const picture = this.pictureAt(a.target);
		if (!picture || !isZoomed(zoomOf(picture))) return;
		this.startTouchPan(picture, a);
		// A finger on a zoomed picture pans it: not the start of a swipe.
		e.stopPropagation();
	}

	private startTouchPan(picture: HTMLElement, touch: Touch): void {
		const box = this.boxOf(picture);
		this.pan = {
			picture,
			pointerId: touch.identifier,
			start: zoomOf(picture),
			box,
			window: this.windowFor(box),
			x: touch.clientX,
			y: touch.clientY,
			moved: false,
		};
	}

	private onTouchMove(e: TouchEvent): void {
		const pinch = this.pinch;
		const [a, b] = [e.touches[0], e.touches[1]];
		if (pinch && a && b) {
			if (e.cancelable) e.preventDefault();
			e.stopPropagation();
			const center = ImageZoom.pointIn(pinch.box, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
			const spread = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
			setZoom(pinch.picture, pinchState(pinch.start, pinch.center, center, pinch.spread > 0 ? spread / pinch.spread : 1, pinch.window));
			return;
		}
		const pan = this.pan;
		const touch = a && pan && a.identifier === pan.pointerId ? a : null;
		if (!pan || !touch || e.touches.length !== 1) return;
		// Every move, the small ones too: a browser that sees one go through may
		// commit to scrolling the card, after which no move can be cancelled.
		// Cancelling a move does not cancel the tap's click.
		if (e.cancelable) e.preventDefault();
		e.stopPropagation();
		this.dragTo(pan, touch.clientX, touch.clientY);
	}

	private onTouchEnd(e: TouchEvent): void {
		const pinch = this.pinch;
		if (pinch) {
			if (e.touches.length >= 2) return;
			this.pinch = null;
			// One finger still down carries on as a pan of what the pinch left zoomed.
			const rest = e.touches[0];
			if (rest && isZoomed(zoomOf(pinch.picture))) this.startTouchPan(pinch.picture, rest);
			return;
		}

		const pan = this.pan;
		const touch = e.changedTouches[0];
		if (!pan || e.touches.length > 0 || !touch) return;
		this.pan = null;
		if (pan.moved) return;

		// A tap on a zoomed picture; a second one straight after resets it to fit.
		const tap = { at: e.timeStamp, x: touch.clientX, y: touch.clientY };
		const last = this.lastTap;
		if (last && last.picture === pan.picture && isDoubleTap(last, tap)) {
			this.lastTap = null;
			// No click: the second tap was the reset, not a second tap on the card.
			if (e.cancelable) e.preventDefault();
			setZoom(pan.picture, FIT);
			return;
		}
		this.lastTap = { ...tap, picture: pan.picture };
	}

	private endTouch(): void {
		this.pinch = null;
		this.pan = null;
	}
}
