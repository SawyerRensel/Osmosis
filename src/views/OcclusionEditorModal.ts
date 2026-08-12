import { Modal, setIcon, type App } from "obsidian";
import type {
	OcclusionAnnotation,
	OcclusionMode,
	OcclusionSet,
	OcclusionShape,
} from "../database/types";
import {
	alignShapes,
	anchoredScroll,
	angleFrom,
	annotationWithRotation,
	bearingPoint,
	boxFromDrag,
	clamp01,
	cloneShape,
	containsPoint,
	duplicateAnnotation,
	duplicateShape,
	fitWidth,
	HANDLE_IDS,
	handleAt,
	handlePoint,
	hitTest,
	isDegenerate,
	isDoubleClick,
	moveShapes,
	nextGroup,
	polyFromPoints,
	resizeAnchored,
	ROTATE_HANDLE_PX,
	rotationHandlePoint,
	rotationTransform,
	shapeBox,
	shapeCenter,
	shapeFromBox,
	shapeRotation,
	shapeWithBox,
	snapRotation,
	toNormalized,
	unrotatePoint,
	usedGroups,
	vertexAt,
	withRotation,
	withVertexInserted,
	withVertexMoved,
	withVertexRemoved,
	zoomBy,
	ZOOM_STEP,
	type Alignment,
	type Box,
	type Click,
	type HandleId,
	type Point,
} from "../study/occlusion-geometry";
import { History } from "../study/occlusion-history";
import { positionAnnotation } from "./OcclusionRenderer";

/**
 * The canvas editor for image occlusion: draw, move, resize, group, annotate,
 * align, and delete masks over an image.
 *
 * Deliberately a thin shell. Every piece of arithmetic — normalising pointer
 * input, hit testing, resize handles, vertex editing, alignment, group
 * allocation — lives in `study/occlusion-geometry.ts`, and undo/redo in
 * `study/occlusion-history.ts`, because vitest cannot import `obsidian` and
 * geometry is where this feature's correctness actually is. What is left here
 * is DOM construction and pointer plumbing.
 *
 * **The canvas reuses the study renderer's coordinate contract**, and must keep
 * doing so: a shrink-to-fit `.osmosis-occlusion` wrapper, an SVG pinned to its
 * edges with `viewBox="0 0 1 1"` and `preserveAspectRatio="none"`, and an image
 * at `object-fit: fill`. That trio is why a shape drawn here lands on the same
 * pixels when the card is studied, at any rendered size, with no measurement
 * and no resize listener. Changing either half alone silently misaligns masks.
 *
 * **Zoom therefore sets the wrapper's width, never the SVG's viewBox.** The
 * image fills the wrapper and the overlay is pinned to it, so the three grow as
 * one and `getBoundingClientRect()` reports the truth at any scale —
 * `toNormalized` needs no zoom term at all. Zooming the *image* instead is what
 * broke phase 4: the picture grew, the wrapper did not, and the masks sat off
 * the features they were drawn on. A zoom done as a viewBox change would desync
 * the editor from the study renderer, which always paints `0 0 1 1`.
 */

/** Which drawing tool the pointer is currently holding. */
type Tool = "select" | "rect" | "ellipse" | "poly" | "text" | "pan";

/** What a pointer drag in progress is doing. */
type Drag =
	| { kind: "draw"; from: Point }
	/**
	 * Scrolling the stage under a zoomed-in canvas. Client pixels and scroll
	 * offsets, not normalised units: this moves the viewport, not the document,
	 * so nothing about it belongs in the image's coordinate space.
	 */
	| { kind: "pan"; from: { x: number; y: number }; scroll: { left: number; top: number } }
	/** `start` is the shape list as it stood when the drag began, so the delta
	 *  is always measured from there and a slow drag cannot accumulate drift. */
	| { kind: "move"; from: Point; start: OcclusionShape[] }
	| { kind: "resize"; index: number; handle: HandleId }
	| { kind: "vertex"; index: number; vertex: number }
	| { kind: "annotation"; index: number; from: Point; origin: Point }
	/**
	 * Turning a shape or a label. `start` is the angle it held when the grip was
	 * taken and `from` the pointer's bearing at that moment, so the drag applies
	 * the *difference* — grabbing the grip never snaps the shape to the pointer,
	 * and a turn measured from the outset cannot drift, the same reason a move
	 * keeps its starting shapes.
	 */
	| { kind: "rotate"; index: number; annotation: boolean; start: number; from: number };

/** The editable document — what undo and redo restore. */
interface Snapshot {
	shapes: OcclusionShape[];
	annotations: OcclusionAnnotation[];
}

/** A two-finger gesture in flight, as it stood when the second finger landed. */
interface Gesture {
	/** Distance between the two fingers, so the pinch ratio scales from it. */
	spread: number;
	/** Their midpoint in client pixels, so the pair can also pan. */
	center: { x: number; y: number };
	zoom: number;
	scroll: { left: number; top: number };
	/** The midpoint relative to the stage — what the pinch stays anchored on. */
	focus: { x: number; y: number };
}

/** How close a pointer must come to a handle or vertex to grab it, in image pixels. */
const HANDLE_GRAB_PX = 12;

/** Sentence case, as Obsidian's own UI labels are. */
const MODE_LABELS: Record<OcclusionMode, string> = {
	"hide-all-guess-one": "Hide all, guess one",
	"hide-one-guess-one": "Hide one, guess one",
};

/** The align actions, in toolbar order. */
const ALIGNMENTS: { alignment: Alignment; icon: string; label: string }[] = [
	{ alignment: "left", icon: "align-start-vertical", label: "Align left" },
	{ alignment: "center", icon: "align-center-vertical", label: "Align centre" },
	{ alignment: "right", icon: "align-end-vertical", label: "Align right" },
	{ alignment: "top", icon: "align-start-horizontal", label: "Align top" },
	{ alignment: "middle", icon: "align-center-horizontal", label: "Align middle" },
	{ alignment: "bottom", icon: "align-end-horizontal", label: "Align bottom" },
];

export interface OcclusionEditorOptions {
	/** Resolved URL for the image being occluded. */
	src: string;
	/** The embed target as written — the image's alternative text. */
	image: string;
	/** The set to open on — empty shapes for a new occlusion. */
	set: OcclusionSet;
	/**
	 * Group labels already spoken for elsewhere in the same carrier.
	 *
	 * A fence derives its occlusion card IDs as `<fenceId>-cN` across *all* of
	 * its labelled embeds, so a second diagram numbering from `c1` again would
	 * derive IDs the first one already owns and overwrite its cards.
	 */
	reservedGroups: readonly string[];
	/** Called with the edited set when the user saves. */
	onSave: (set: OcclusionSet) => void;
}

export class OcclusionEditorModal extends Modal {
	private shapes: OcclusionShape[];
	private annotations: OcclusionAnnotation[];
	private mode: OcclusionMode;
	private tool: Tool = "rect";
	/**
	 * The shape a drag on empty canvas draws while the Select tool is held.
	 *
	 * Drawing a shape drops into Select so it can be nudged or regrouped, but
	 * the common next action is drawing *another* mask — so an empty-canvas drag
	 * keeps drawing, in the kind last chosen, instead of doing nothing and
	 * sending the user back to the toolbar between every shape. Only the two
	 * drag-drawn kinds qualify: a polygon is built click by click, so there is
	 * no drag for it to inherit.
	 */
	private lastDrawTool: "rect" | "ellipse" = "rect";
	/**
	 * Selected shapes, by index. A list rather than a single index because
	 * aligning is meaningless below two, and grouping reads far better as
	 * "select these, put them in one group" than as a per-shape dropdown.
	 */
	private selectedShapes: number[] = [];
	/**
	 * The selected annotation, or null. Kept apart from `selectedShapes` and
	 * mutually exclusive with it: the two share no operations beyond delete and
	 * duplicate, and a single mixed list would make every shape operation start
	 * by filtering annotations back out.
	 */
	private selectedAnnotation: number | null = null;
	/** Vertices collected so far by an in-progress polygon, or null. */
	private polyDraft: Point[] | null = null;
	/** The annotation whose text is being typed, or null. */
	private editingAnnotation: number | null = null;
	private drag: Drag | null = null;
	/**
	 * Where the Text tool was pressed, waiting for the release that places the
	 * label. Placing on pointer *up* rather than down is what makes the tool work
	 * at all: created on down, the input is built before the browser's own
	 * mousedown focus handling runs, which then moves focus straight back off it.
	 */
	private pendingAnnotation: Point | null = null;
	/** The last press, for detecting the next one as a double click. */
	private lastClick: Click | null = null;
	/** Every pointer currently down, in client pixels — two of them is a gesture. */
	private pointers = new Map<number, { x: number; y: number }>();
	private gesture: Gesture | null = null;
	/**
	 * The canvas width at which the whole image fits the stage, in pixels, or 0
	 * before the image has loaded. Zoom multiplies it, so zoom 1 is fit-to-view
	 * for a portrait diagram and a landscape one alike, and nothing scrolls until
	 * the user asks for it.
	 */
	private fit = 0;
	private resize: ResizeObserver | null = null;
	private zoom = 1;
	/** Whether masks are drawn solid, previewing what the card will hide. */
	private opaque = false;
	private history: History<Snapshot>;
	/** The two text fields. Outside the history — see `buildTextFields`. */
	private header: string;
	private backExtra: string;

	private image!: HTMLImageElement;
	private svg!: SVGSVGElement;
	private stage!: HTMLElement;
	private canvas!: HTMLElement;
	private annotationLayer!: HTMLElement;
	private toolButtons = new Map<Tool, HTMLButtonElement>();
	private alignButtons: HTMLButtonElement[] = [];
	private groupSelect!: HTMLSelectElement;
	private deleteButton!: HTMLButtonElement;
	private duplicateButton!: HTMLButtonElement;
	private ungroupButton!: HTMLButtonElement;
	private undoButton!: HTMLButtonElement;
	private redoButton!: HTMLButtonElement;
	private translucencyButton!: HTMLButtonElement;
	private hint!: HTMLElement;

	constructor(app: App, private readonly options: OcclusionEditorOptions) {
		super(app);
		// Copied, so Cancel genuinely discards: the caller's set is the one on
		// disk and must not be mutated by editing that is never saved.
		this.shapes = options.set.shapes.map((shape) => cloneShape(shape));
		this.annotations = (options.set.annotations ?? []).map((a) => ({ ...a }));
		this.mode = options.set.mode;
		this.header = options.set.header ?? "";
		this.backExtra = options.set.backExtra ?? "";
		this.history = new History<Snapshot>(this.snapshot());
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("osmosis-occlusion-modal");
		// No heading and no image name: the user just chose both, and between them
		// they cost the whole top band of a modal whose entire point is the canvas.

		this.buildToolbar(contentEl);
		this.buildCanvas(contentEl);
		this.buildTextFields(contentEl);

		this.hint = contentEl.createDiv({ cls: "osmosis-occlusion-hint" });

		const buttons = contentEl.createDiv("modal-button-container");
		const save = buttons.createEl("button", { cls: "mod-cta", text: "Save" });
		save.addEventListener("click", () => {
			// A polygon still being drawn is real work; committing it beats
			// dropping it silently because the user reached for Save first.
			this.finishPolygon();
			this.close();
			this.options.onSave(this.currentSet());
		});
		buttons.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => { this.close(); });

		this.registerHotkeys();
		this.redraw();
	}

	/**
	 * Escape belongs to the label being typed, not to the modal.
	 *
	 * Guarding the scope's Escape handler cannot achieve that — Obsidian's own
	 * close-on-Escape is registered on this same scope and is evaluated first, so
	 * ours never runs. Refusing the close itself is the one place the decision
	 * cannot be pre-empted. The keyboard is the only route that reaches here mid
	 * edit: clicking the close button, the backdrop, or Save all blur the field
	 * first, which commits what was typed and clears `editingAnnotation`.
	 */
	close(): void {
		if (this.editingAnnotation !== null) {
			// Cancel, with the text as stored — a label that was never named is
			// dropped and an edited one reverts, exactly as Escape does anywhere.
			this.commitAnnotationEdit(
				this.editingAnnotation,
				this.annotations[this.editingAnnotation]?.text ?? "",
			);
			return;
		}
		super.close();
	}

	onClose(): void {
		this.resize?.disconnect();
		this.contentEl.empty();
	}

	/** The set as it now stands, with every empty optional omitted. */
	private currentSet(): OcclusionSet {
		const set: OcclusionSet = { mode: this.mode, shapes: this.shapes };
		if (this.annotations.length > 0) set.annotations = this.annotations;
		// Trimmed, then dropped when blank: a field the user tabbed through and
		// left empty must serialize away entirely, so a set that uses neither
		// writes exactly what it always did.
		const header = this.header.trim();
		const backExtra = this.backExtra.trim();
		if (header !== "") set.header = header;
		if (backExtra !== "") set.backExtra = backExtra;
		return set;
	}

	/**
	 * Scoped to the modal so they do not fight the note editor underneath.
	 *
	 * **Every one of them stands down while a label is being typed.** The scope
	 * sees a key before the focused input does, and claiming it stops the input
	 * ever receiving it — so Backspace deleted the very annotation being named
	 * instead of a character, and Escape closed the whole modal. Declining
	 * (returning nothing) hands the key back to the field.
	 *
	 * Escape and Enter stand down when there is nothing of their own to do, too:
	 * Escape abandons a half-drawn polygon, and with no draft in progress it
	 * falls through and Obsidian closes the modal, as every other modal does.
	 */
	private registerHotkeys(): void {
		/** Wrap a shape action so the keyboard belongs to a field being typed in. */
		const unlessTyping = (action: () => void) => () => {
			if (this.isTyping()) return;
			action();
			return false;
		};

		this.scope.register([], "Delete", unlessTyping(() => { this.deleteSelected(); }));
		this.scope.register([], "Backspace", unlessTyping(() => { this.deleteSelected(); }));
		this.scope.register([], "Enter", () => {
			if (this.isTyping() || this.polyDraft === null) return;
			this.finishPolygon();
			return false;
		});
		this.scope.register([], "Escape", () => {
			// Escape while a label is being typed is handled in `close()` instead:
			// the modal's own Escape handler shares this scope and wins, so a guard
			// here never gets the chance to keep the modal open.
			if (this.polyDraft === null) return;
			this.polyDraft = null;
			this.redraw();
			return false;
		});
		this.scope.register(["Mod"], "z", unlessTyping(() => { this.undo(); }));
		this.scope.register(["Mod", "Shift"], "z", unlessTyping(() => { this.redo(); }));
		this.scope.register(["Mod"], "y", unlessTyping(() => { this.redo(); }));
		this.scope.register(["Mod"], "d", unlessTyping(() => { this.duplicateSelected(); }));
	}

	/**
	 * Whether the keyboard currently belongs to a text field rather than the
	 * canvas — an annotation being named, or one of Anki's three fields.
	 *
	 * `editingAnnotation` is checked as well as the focused element because the
	 * annotation input is built a tick before it is focused, and a shape hotkey
	 * arriving in that window would delete the very label being created.
	 */
	private isTyping(): boolean {
		if (this.editingAnnotation !== null) return true;
		const active = this.contentEl.ownerDocument.activeElement;
		return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
	}

	// ── Chrome ────────────────────────────────────────────────────

	private buildToolbar(parent: HTMLElement): void {
		const bar = parent.createDiv("osmosis-occlusion-toolbar");

		const tools: { tool: Tool; icon: string; label: string }[] = [
			{ tool: "select", icon: "mouse-pointer-2", label: "Select" },
			{ tool: "rect", icon: "square", label: "Rectangle" },
			{ tool: "ellipse", icon: "circle", label: "Ellipse" },
			{ tool: "poly", icon: "pentagon", label: "Polygon" },
			{ tool: "text", icon: "type", label: "Text" },
			// The way round a zoomed canvas for anyone without a scroll wheel or a
			// second finger — the overlay takes `touch-action: none`, so a one-finger
			// drag draws rather than scrolling.
			{ tool: "pan", icon: "hand", label: "Pan" },
		];
		const group = bar.createDiv("osmosis-occlusion-tools");
		for (const { tool, icon, label } of tools) {
			this.toolButtons.set(tool, iconButton(group, icon, label, () => { this.chooseTool(tool); }));
		}

		const edit = bar.createDiv("osmosis-occlusion-tools");
		this.duplicateButton = iconButton(edit, "copy", "Duplicate", () => { this.duplicateSelected(); });
		this.deleteButton = iconButton(edit, "trash-2", "Delete shape", () => { this.deleteSelected(); });
		this.undoButton = iconButton(edit, "undo-2", "Undo", () => { this.undo(); });
		this.redoButton = iconButton(edit, "redo-2", "Redo", () => { this.redo(); });

		const align = bar.createDiv("osmosis-occlusion-tools");
		for (const { alignment, icon, label } of ALIGNMENTS) {
			this.alignButtons.push(iconButton(align, icon, label, () => { this.align(alignment); }));
		}

		const view = bar.createDiv("osmosis-occlusion-tools");
		iconButton(view, "zoom-out", "Zoom out", () => { this.setZoom(zoomBy(this.zoom, 1 / ZOOM_STEP)); });
		iconButton(view, "scan", "Zoom to fit", () => { this.setZoom(1); });
		iconButton(view, "zoom-in", "Zoom in", () => { this.setZoom(zoomBy(this.zoom, ZOOM_STEP)); });
		this.translucencyButton = iconButton(view, "eye", "Toggle translucency", () => {
			this.opaque = !this.opaque;
			this.redraw();
		});

		// No "Group" or "Mode" captions: each dropdown's own options say what it
		// is, and the toolbar has better uses for the width. The labels live on
		// as `aria-label`, which is what a screen reader was reading anyway.
		const groupField = bar.createDiv("osmosis-occlusion-field");
		this.groupSelect = groupField.createEl("select", {
			cls: "dropdown",
			attr: { "aria-label": "Group" },
		});
		this.groupSelect.addEventListener("change", () => { this.assignGroup(this.groupSelect.value); });
		this.ungroupButton = iconButton(groupField, "ungroup", "Ungroup", () => { this.ungroupSelected(); });

		const modeField = bar.createDiv("osmosis-occlusion-field");
		const modeSelect = modeField.createEl("select", {
			cls: "dropdown",
			attr: { "aria-label": "Mode" },
		});
		for (const [value, label] of Object.entries(MODE_LABELS)) {
			modeSelect.createEl("option", { value, text: label });
		}
		modeSelect.value = this.mode;
		modeSelect.addEventListener("change", () => {
			// Not part of the undo snapshot: it is a two-value dropdown whose
			// previous value is always visible and one click away.
			this.mode = modeSelect.value as OcclusionMode;
		});
	}

	/**
	 * Header and Back Extra, below the canvas.
	 *
	 * Not in the toolbar: that row is icon-dense and already wraps to several
	 * rows at phone width, and a free-text field there would be a couple of
	 * characters wide. Below the picture is also where they appear when the card
	 * is studied, so the panel reads in the order it renders.
	 *
	 * Deliberately outside the undo history, as `mode` is: the browser's own
	 * text undo is what a focused field should be doing on Ctrl+Z, and
	 * `isTyping()` is what hands it the key.
	 */
	private buildTextFields(parent: HTMLElement): void {
		const fields = parent.createDiv("osmosis-occlusion-fields");
		const field = (label: string, value: string, onInput: (text: string) => void): void => {
			const input = fields.createEl("input", {
				type: "text",
				value,
				attr: { placeholder: label, "aria-label": label },
			});
			input.addEventListener("input", () => { onInput(input.value); });
		};

		field("Header", this.header, (text) => { this.header = text; });
		field("Back extra", this.backExtra, (text) => { this.backExtra = text; });
	}

	private buildCanvas(parent: HTMLElement): void {
		this.stage = parent.createDiv("osmosis-occlusion-stage");
		// Same wrapper and image classes the study renderer uses — the layout
		// contract that makes normalised coordinates land correctly is CSS, so
		// sharing the classes is what keeps the two surfaces in agreement.
		this.canvas = this.stage.createDiv({ cls: ["osmosis-occlusion", "osmosis-occlusion-canvas"] });
		this.image = this.canvas.createEl("img", {
			cls: "osmosis-occlusion-image",
			attr: { src: this.options.src, alt: this.options.image, draggable: "false" },
		});

		// The fit depends on the image's proportions and on the room the stage
		// ends up with, and neither is known at build time: the picture has still
		// to load, and the toolbar may yet wrap to a second row and take a slice
		// of the height with it. Both are watched rather than assumed.
		// Repainted as well as re-measured: the image's proportions are what a
		// rotated mask is drawn against, so until it has loaded a tilted shape is
		// painted as though the picture were square. `load` is always async, so
		// the chrome `redraw` brings in step is built by the time this runs.
		this.image.addEventListener("load", () => {
			this.measure();
			this.redraw();
		});
		this.resize = new ResizeObserver(() => { this.measure(); });
		this.resize.observe(this.stage);

		// Ctrl+wheel zooms about the pointer, as every canvas app does; a plain
		// wheel is left to scroll the stage. Not passive, since zooming has to
		// take the event away from the browser's own page zoom.
		this.stage.addEventListener("wheel", (event: WheelEvent) => {
			if (!event.ctrlKey) return;
			event.preventDefault();
			this.zoomAbout(zoomBy(this.zoom, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), event);
		}, { passive: false });

		this.svg = this.canvas.createSvg("svg", { cls: "osmosis-occlusion-editor-layer" });
		this.svg.setAttribute("viewBox", "0 0 1 1");
		this.svg.setAttribute("preserveAspectRatio", "none");

		// Above the masks, so a label is never buried under one. The layer itself
		// is transparent to the pointer; only its labels are not, so a drag that
		// starts on bare image still reaches the SVG underneath.
		this.annotationLayer = this.canvas.createDiv({
			cls: ["osmosis-occlusion-annotations", "is-editing"],
		});

		this.svg.addEventListener("pointerdown", (event) => { this.onPointerDown(event); });
		this.svg.addEventListener("pointermove", (event) => { this.onPointerMove(event); });
		this.svg.addEventListener("pointerup", (event) => { this.onPointerUp(event); });
		this.svg.addEventListener("pointercancel", (event) => { this.onPointerUp(event); });
		// No `dblclick` listener: double clicks are detected in `onPointerDown`
		// from timing and proximity instead — see `takeDoubleClick`.
		// The image is a native drag source; without this a drag that starts on
		// it becomes a file drag and the mask is never drawn.
		this.svg.addEventListener("dragstart", (event) => { event.preventDefault(); });
	}

	/** Switch tools, finishing whatever the previous one had in progress. */
	private chooseTool(tool: Tool): void {
		this.finishPolygon();
		this.tool = tool;
		// Leaving a drawing tool for Select keeps the selection; entering one
		// drops it, so the handles do not sit under the new shape. Pan draws
		// nothing, so it has no reason to disturb what is selected.
		if (tool === "rect" || tool === "ellipse") this.lastDrawTool = tool;
		if (tool !== "select" && tool !== "pan") this.clearSelection();
		this.redraw();
	}

	// ── Pointer handling ──────────────────────────────────────────

	/** The pointer position in the image's normalised 0–1 space. */
	private pointAt(event: { clientX: number; clientY: number }): Point {
		return toNormalized(event.clientX, event.clientY, this.image.getBoundingClientRect());
	}

	/**
	 * Handle-grab tolerance converted from pixels into normalised units.
	 *
	 * Per-axis, because the 0–1 space is stretched to the image's aspect ratio:
	 * one normalised unit is a different number of pixels on x than on y, so a
	 * single scalar would make handles easy to grab on one axis and nearly
	 * impossible on the other.
	 */
	private grabTolerance(): Point {
		const rect = this.image.getBoundingClientRect();
		return {
			x: rect.width === 0 ? 0 : HANDLE_GRAB_PX / rect.width,
			y: rect.height === 0 ? 0 : HANDLE_GRAB_PX / rect.height,
		};
	}

	/**
	 * The image's width÷height — the one scalar rotation needs.
	 *
	 * Read from the *natural* size rather than the rendered box, because the two
	 * agree by construction (the canvas is `fit × zoom` wide and `fit` preserves
	 * the picture's proportions) and the natural size is stable across a resize.
	 * 1 until the image has loaded, at which point the load handler repaints.
	 */
	private get aspect(): number {
		const { naturalWidth: width, naturalHeight: height } = this.image;
		return width > 0 && height > 0 ? width / height : 1;
	}

	/** How far above a shape's box the rotation grip sits, in normalised y units. */
	private handleOffset(): number {
		const rect = this.image.getBoundingClientRect();
		return rect.height === 0 ? 0 : ROTATE_HANDLE_PX / rect.height;
	}

	/** Whether a point is within grabbing distance of another, per axis. */
	private grabbing(point: Point, at: Point): boolean {
		const tolerance = this.grabTolerance();
		return Math.abs(point.x - at.x) <= tolerance.x && Math.abs(point.y - at.y) <= tolerance.y;
	}

	/**
	 * Note what is deliberately *not* here: `preventDefault()`.
	 *
	 * Cancelling `pointerdown` suppresses the browser's own focus handling along
	 * with the compatibility mouse events, and the annotation input needs both —
	 * an input built while that handling is still pending loses focus the instant
	 * it runs. Text selection is held off by `user-select: none` on the overlay
	 * instead, and a native image drag cannot start because the overlay, not the
	 * picture, is what the pointer lands on.
	 *
	 * Double clicks no longer ride on the default either way: they are detected
	 * here, from timing and proximity, rather than through a native `dblclick`
	 * that the overlay's constant rebuilding made unreliable.
	 */
	private onPointerDown(event: PointerEvent): void {
		this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		// A second finger means the gesture, whatever the first one had started.
		if (this.pointers.size === 2) {
			this.beginGesture();
			return;
		}
		if (this.pointers.size > 2 || event.button !== 0) return;

		const point = this.pointAt(event);
		const double = this.takeDoubleClick(point);

		if (this.tool === "pan") {
			this.svg.setPointerCapture(event.pointerId);
			this.drag = {
				kind: "pan",
				from: { x: event.clientX, y: event.clientY },
				scroll: { left: this.stage.scrollLeft, top: this.stage.scrollTop },
			};
			return;
		}

		// Pressing on a shape means "select it", whatever tool is armed. Reaching
		// for the Select button first is the commonest thing a user does in this
		// editor and the least interesting, and pressing an existing mask is
		// never an attempt to start a new one underneath it. Pressing empty
		// canvas still draws with the armed tool, so the drawing flow is intact.
		//
		// Text is exempt: a label belongs *on* what it names, so a press over a
		// shape is exactly where one is wanted. A polygon mid-draft is exempt too
		// — that press is the next vertex, and the draft may well cross a shape.
		if (this.tool !== "select" && this.tool !== "text" && this.polyDraft === null
			&& hitTest(this.shapes, point, this.aspect) !== -1) {
			this.chooseTool("select");
			// Falls through: the select branch below picks the shape up and starts
			// the move drag, so the press that selected can drag in one gesture.
		}

		if (this.tool === "poly") {
			// The closing gesture: two presses in the same spot finish the draft
			// rather than piling a second vertex onto the first.
			if (double && this.polyDraft !== null) {
				this.finishPolygon();
				return;
			}
			this.addPolyVertex(point);
			return;
		}

		if (this.tool === "text") {
			// Placed on release, not here — see `pendingAnnotation`.
			this.pendingAnnotation = point;
			return;
		}

		if (double && this.insertVertex(point)) return;

		this.svg.setPointerCapture(event.pointerId);

		// The grip of a selected label, which sits over the canvas rather than in
		// the annotation layer — that layer is rebuilt on every pointer move, so
		// nothing durable can live in it.
		if (this.grabAnnotationRotation(point)) return;

		// A grabbed vertex or handle wins over everything, including a shape
		// drawn on top of it — otherwise a selected shape overlapped by a later
		// one could never be reshaped. Vertices are tested first: they sit on the
		// outline and box handles on the bounding box, and where the two coincide
		// the vertex is the more precise thing to have meant.
		const only = this.onlySelectedShape();
		if (only !== null) {
			const shape = this.shapes[only]!;
			const tolerance = this.grabTolerance();
			// Every grip on a rotated shape is drawn inside a group carrying its
			// transform, so the pointer is turned back into the shape's own frame
			// once here and each test then works in the frame it was drawn in.
			const local = unrotatePoint(shape, point, this.aspect);

			// The rotation grip sits clear of the box, above it, so a press there
			// cannot have meant a resize handle or a vertex.
			if (this.grabbing(local, rotationHandlePoint(shapeBox(shape), this.handleOffset()))) {
				this.drag = {
					kind: "rotate",
					index: only,
					annotation: false,
					start: shapeRotation(shape),
					from: angleFrom(shapeCenter(shape), point, this.aspect),
				};
				return;
			}

			if (shape.kind === "poly") {
				const vertex = vertexAt(shape.points, local, tolerance);
				if (vertex !== null) {
					if (event.altKey) {
						this.shapes[only] = withVertexRemoved(shape, vertex);
						this.commit();
					} else {
						this.drag = { kind: "vertex", index: only, vertex };
					}
					return;
				}
			}
			const handle = handleAt(shapeBox(shape), local, tolerance);
			if (handle) {
				this.drag = { kind: "resize", index: only, handle };
				return;
			}
		}

		if (this.tool === "select") {
			const index = hitTest(this.shapes, point, this.aspect);
			if (index === -1) {
				if (!event.shiftKey) this.clearSelection();
				// Empty canvas: keep drawing rather than dead-ending. A click that
				// never becomes a drag is still just a deselect, since a degenerate
				// draw commits nothing.
				this.drag = { kind: "draw", from: point };
			} else if (event.shiftKey) {
				this.toggleShapeSelection(index);
			} else {
				this.selectedAnnotation = null;
				// A plain click inside an existing multi-selection keeps it, so the
				// whole arrangement can be dragged without reselecting it first.
				if (!this.selectedShapes.includes(index)) this.selectedShapes = [index];
				this.drag = { kind: "move", from: point, start: this.shapes.map(cloneShape) };
			}
			this.redraw();
			return;
		}

		this.clearSelection();
		this.drag = { kind: "draw", from: point };
	}

	private onPointerMove(event: PointerEvent): void {
		if (this.pointers.has(event.pointerId)) {
			this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		}
		if (this.gesture) {
			this.updateGesture();
			return;
		}
		if (!this.drag) return;
		event.preventDefault();

		if (this.drag.kind === "pan") {
			this.stage.scrollLeft = this.drag.scroll.left - (event.clientX - this.drag.from.x);
			this.stage.scrollTop = this.drag.scroll.top - (event.clientY - this.drag.from.y);
			return;
		}

		const point = this.pointAt(event);

		switch (this.drag.kind) {
			case "draw":
				// Drawn shapes are previewed rather than committed, so a drag that
				// ends as a click leaves nothing behind.
				this.redraw(boxFromDrag(this.drag.from, point));
				return;
			case "move":
				this.shapes = moveShapes(
					this.drag.start,
					this.selectedShapes,
					point.x - this.drag.from.x,
					point.y - this.drag.from.y,
				);
				this.redraw();
				return;
			case "resize": {
				const shape = this.shapes[this.drag.index]!;
				const box = resizeAnchored(
					shapeBox(shape),
					this.drag.handle,
					unrotatePoint(shape, point, this.aspect),
					shapeRotation(shape),
					this.aspect,
				);
				this.shapes[this.drag.index] = shapeWithBox(shape, box);
				this.redraw();
				return;
			}
			case "vertex": {
				const shape = this.shapes[this.drag.index]!;
				const at = unrotatePoint(shape, point, this.aspect);
				this.shapes[this.drag.index] = withVertexMoved(shape, this.drag.vertex, at);
				this.redraw();
				return;
			}
			case "rotate":
				this.turn(this.drag, point, event.shiftKey);
				return;
			case "annotation": {
				const annotation = this.annotations[this.drag.index];
				if (!annotation) return;
				this.annotations[this.drag.index] = {
					...annotation,
					x: clamp01(this.drag.origin.x + (point.x - this.drag.from.x)),
					y: clamp01(this.drag.origin.y + (point.y - this.drag.from.y)),
				};
				this.redraw();
				return;
			}
		}
	}

	private onPointerUp(event: PointerEvent): void {
		this.pointers.delete(event.pointerId);
		if (this.gesture) {
			// The finger still down does not resume drawing: a drag only ever
			// begins on a press, and this one was spent on the gesture.
			if (this.pointers.size < 2) this.gesture = null;
			return;
		}

		if (this.pendingAnnotation) {
			const point = this.pendingAnnotation;
			this.pendingAnnotation = null;
			this.addAnnotation(point);
			return;
		}
		if (!this.drag) return;
		const drag = this.drag;
		this.drag = null;
		if (this.svg.hasPointerCapture(event.pointerId)) {
			this.svg.releasePointerCapture(event.pointerId);
		}

		// Panning moved the viewport, not the document — nothing to record.
		if (drag.kind === "pan") return;

		if (drag.kind === "draw") {
			const box = boxFromDrag(drag.from, this.pointAt(event));
			if (!isDegenerate(box)) {
				this.shapes.push(shapeFromBox(this.drawKind(), this.freeGroup(), box));
				// Drop straight into Select on the new shape, so it can be nudged
				// or regrouped without a trip back to the toolbar. Drawing another
				// still costs nothing: a drag on empty canvas keeps drawing.
				this.selectedShapes = [this.shapes.length - 1];
				this.tool = "select";
			}
		}

		// `commit` ignores a snapshot equal to the one in force, so a click that
		// selected without moving, or a resize dragged back to where it started,
		// leaves no undo step behind.
		this.commit();
	}

	// ── Rotation ──────────────────────────────────────────────────

	/**
	 * Start turning a selected label, if that is what the press landed on.
	 *
	 * A label's grip is drawn on the canvas rather than in the annotation layer,
	 * because that layer is rebuilt on every pointer move — the same reason a
	 * label drag takes its pointer capture on the SVG.
	 */
	private grabAnnotationRotation(point: Point): boolean {
		const index = this.selectedAnnotation;
		if (index === null) return false;
		const annotation = this.annotations[index];
		if (!annotation) return false;

		const anchor = { x: annotation.x, y: annotation.y };
		if (!this.grabbing(point, this.annotationHandlePoint(annotation))) return false;

		this.drag = {
			kind: "rotate",
			index,
			annotation: true,
			start: annotation.rotation ?? 0,
			from: angleFrom(anchor, point, this.aspect),
		};
		return true;
	}

	/**
	 * Where a label's rotation grip sits, in normalised coordinates.
	 *
	 * A label turns about its anchor, not its middle, so the grip hangs off that
	 * point directly — which is also the only part of a label whose position is
	 * known without measuring the text.
	 */
	private annotationHandlePoint(annotation: OcclusionAnnotation): Point {
		return bearingPoint(
			{ x: annotation.x, y: annotation.y },
			this.handleOffset(),
			annotation.rotation ?? 0,
			this.aspect,
		);
	}

	/**
	 * Apply a rotate drag. The turn is the *change* in the pointer's bearing
	 * since the grip was taken, so grabbing the grip anywhere along its travel
	 * leaves the shape exactly where it was.
	 */
	private turn(drag: Drag & { kind: "rotate" }, point: Point, snap: boolean): void {
		if (drag.annotation) {
			const annotation = this.annotations[drag.index];
			if (!annotation) return;
			const anchor = { x: annotation.x, y: annotation.y };
			const turned = drag.start + angleFrom(anchor, point, this.aspect) - drag.from;
			this.annotations[drag.index] =
				annotationWithRotation(annotation, snap ? snapRotation(turned) : turned);
			this.redraw();
			return;
		}

		const shape = this.shapes[drag.index];
		if (!shape) return;
		const turned = drag.start + angleFrom(shapeCenter(shape), point, this.aspect) - drag.from;
		this.shapes[drag.index] = withRotation(shape, snap ? snapRotation(turned) : turned);
		this.redraw();
	}

	// ── Two-finger gestures ───────────────────────────────────────

	/**
	 * Take over from whatever one finger had started, once a second lands.
	 *
	 * The overlay sets `touch-action: none` so a single finger can draw, which
	 * leaves the browser doing nothing for touch at all — pinch and pan have to
	 * be built here. Anything the first finger began is abandoned rather than
	 * committed: it was the opening of a gesture, not a mask.
	 */
	private beginGesture(): void {
		this.cancelDrag();
		this.pendingAnnotation = null;
		this.polyDraft = null;

		const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
		const center = midpoint(a, b);
		const box = this.stage.getBoundingClientRect();
		this.gesture = {
			spread: distance(a, b),
			center,
			zoom: this.zoom,
			scroll: { left: this.stage.scrollLeft, top: this.stage.scrollTop },
			focus: { x: center.x - box.left, y: center.y - box.top },
		};
		this.redraw();
	}

	/**
	 * Pinch and pan together, both measured from where the gesture began rather
	 * than from the previous move — so a slow drag cannot accumulate drift, the
	 * same reason a shape move keeps its starting shapes.
	 */
	private updateGesture(): void {
		const gesture = this.gesture;
		if (!gesture || this.pointers.size < 2) return;

		const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
		const spread = distance(a, b);
		const center = midpoint(a, b);
		const zoom = gesture.spread === 0 ? gesture.zoom : zoomBy(gesture.zoom, spread / gesture.spread);

		this.setZoom(zoom);
		const scale = zoom / gesture.zoom;
		this.stage.scrollLeft =
			anchoredScroll(gesture.scroll.left, gesture.focus.x, scale) - (center.x - gesture.center.x);
		this.stage.scrollTop =
			anchoredScroll(gesture.scroll.top, gesture.focus.y, scale) - (center.y - gesture.center.y);
	}

	/**
	 * Abandon a drag in progress, putting the document back as the last committed
	 * snapshot left it. The selection is kept, unlike an undo: no shape has come
	 * or gone, so every index still points where it did.
	 */
	private cancelDrag(): void {
		if (!this.drag) return;
		this.drag = null;
		this.adopt(this.history.current);
	}

	/**
	 * Whether this press completes a double click, consuming the record if it
	 * does — so a third press in the same spot starts a fresh pair rather than
	 * firing the gesture again.
	 */
	private takeDoubleClick(point: Point): boolean {
		const now = Date.now();
		const previous = this.lastClick;
		if (isDoubleClick(previous, now, point, this.grabTolerance())) {
			this.lastClick = null;
			return true;
		}
		this.lastClick = { time: now, point };
		return false;
	}

	/**
	 * Add a vertex where a double click met a selected polygon. False when there
	 * is nothing to insert into, so the press falls through to ordinary handling.
	 *
	 * Only reachable under Select: a polygon is drafted under the Polygon tool,
	 * where the same gesture closes the draft instead.
	 */
	private insertVertex(point: Point): boolean {
		const only = this.onlySelectedShape();
		if (only === null) return false;
		const shape = this.shapes[only]!;
		if (shape.kind !== "poly") return false;
		if (!containsPoint(shape, point, this.aspect)) return false;

		// The vertex list is the shape's own unrotated frame, so the click has to
		// be turned back into it before an edge can be found for it.
		this.shapes[only] = withVertexInserted(shape, unrotatePoint(shape, point, this.aspect)).shape;
		this.commit();
		return true;
	}

	// ── Polygons ──────────────────────────────────────────────────

	/**
	 * Add a vertex to the polygon being drawn, or close the path when the click
	 * lands back on the first vertex.
	 */
	private addPolyVertex(point: Point): void {
		const draft = this.polyDraft ?? [];
		const tolerance = this.grabTolerance();
		const near = (at: Point) =>
			Math.abs(point.x - at.x) <= tolerance.x && Math.abs(point.y - at.y) <= tolerance.y;

		const first = draft[0];
		if (first !== undefined && draft.length >= 3 && near(first)) {
			this.finishPolygon();
			return;
		}

		// A double-click to finish delivers two clicks before `dblclick` fires,
		// so without this the closing gesture would leave a duplicated vertex
		// sitting on top of its neighbour.
		const last = draft[draft.length - 1];
		if (last !== undefined && near(last)) return;

		this.polyDraft = [...draft, point];
		this.redraw();
	}

	/** Commit the polygon draft if it encloses an area, otherwise discard it. */
	private finishPolygon(): void {
		const draft = this.polyDraft;
		this.polyDraft = null;
		if (draft === null) return;

		const shape = polyFromPoints(this.freeGroup(), draft);
		if (!shape) {
			this.redraw();
			return;
		}

		this.shapes.push(shape);
		this.selectedShapes = [this.shapes.length - 1];
		this.tool = "select";
		this.commit();
	}

	// ── Annotations ───────────────────────────────────────────────

	/**
	 * Place a new label and open it for typing straight away.
	 *
	 * The annotation is pushed before its text exists, so placing and editing
	 * are one code path rather than two; an empty one is dropped when the edit
	 * commits, which is also what deleting all the text does.
	 */
	private addAnnotation(point: Point): void {
		this.annotations.push({ x: point.x, y: point.y, text: "" });
		this.selectedShapes = [];
		this.selectedAnnotation = this.annotations.length - 1;
		this.editingAnnotation = this.annotations.length - 1;
		this.redraw();
	}

	/** Take the typed text, dropping the label when nothing was typed. */
	private commitAnnotationEdit(index: number, text: string): void {
		if (this.editingAnnotation !== index) return;
		this.editingAnnotation = null;

		const annotation = this.annotations[index];
		if (!annotation) return;

		const trimmed = text.trim();
		if (trimmed === "") {
			this.annotations.splice(index, 1);
			if (this.selectedAnnotation === index) this.selectedAnnotation = null;
		} else {
			this.annotations[index] = { ...annotation, text: trimmed };
		}
		this.commit();
	}

	// ── Mutation ──────────────────────────────────────────────────

	/** The kind a draw drag commits: the held tool, or the last one under Select. */
	private drawKind(): "rect" | "ellipse" {
		return this.tool === "rect" || this.tool === "ellipse" ? this.tool : this.lastDrawTool;
	}

	/** The next group label free across the whole carrier, not just this set. */
	private freeGroup(): string {
		return nextGroup([...usedGroups(this.shapes), ...this.options.reservedGroups]);
	}

	/** The selected shape when exactly one is — the only state that can be reshaped. */
	private onlySelectedShape(): number | null {
		return this.selectedShapes.length === 1 ? this.selectedShapes[0]! : null;
	}

	private clearSelection(): void {
		this.selectedShapes = [];
		this.selectedAnnotation = null;
	}

	private toggleShapeSelection(index: number): void {
		this.selectedAnnotation = null;
		this.selectedShapes = this.selectedShapes.includes(index)
			? this.selectedShapes.filter((i) => i !== index)
			: [...this.selectedShapes, index];
	}

	private deleteSelected(): void {
		if (this.selectedAnnotation !== null) {
			this.annotations.splice(this.selectedAnnotation, 1);
			this.selectedAnnotation = null;
			this.commit();
			return;
		}
		if (this.selectedShapes.length === 0) return;
		// Descending, so an earlier removal cannot shift a later index.
		for (const index of [...this.selectedShapes].sort((a, b) => b - a)) {
			this.shapes.splice(index, 1);
		}
		this.selectedShapes = [];
		this.commit();
	}

	/**
	 * Copy the selection, nudged clear of the original.
	 *
	 * A duplicated shape keeps its group, so it joins the card it was copied
	 * from rather than minting a new one — duplicating is how you cover a second
	 * instance of the same feature, and a copy that started its own card would
	 * turn one card into two behind the user's back.
	 */
	private duplicateSelected(): void {
		if (this.selectedAnnotation !== null) {
			const annotation = this.annotations[this.selectedAnnotation];
			if (!annotation) return;
			this.annotations.push(duplicateAnnotation(annotation));
			this.selectedAnnotation = this.annotations.length - 1;
			this.commit();
			return;
		}
		if (this.selectedShapes.length === 0) return;

		const copies = this.selectedShapes.map((i) => duplicateShape(this.shapes[i]!));
		const first = this.shapes.length;
		this.shapes.push(...copies);
		this.selectedShapes = copies.map((_, i) => first + i);
		this.commit();
	}

	/**
	 * Put every selected shape in a group. Choosing an existing group is how
	 * masks become one card — the same collapse a shared `cN` cloze label makes.
	 */
	private assignGroup(value: string): void {
		if (this.selectedShapes.length === 0) return;
		const group = value === NEW_GROUP ? this.freeGroup() : value;
		for (const index of this.selectedShapes) {
			this.shapes[index] = { ...this.shapes[index]!, group };
		}
		this.commit();
	}

	/**
	 * Give each selected shape a group of its own — the inverse of grouping.
	 *
	 * Allocated one at a time and always above the highest in use, never by
	 * filling gaps: a reused number would inherit the deleted group's schedule
	 * and present a brand-new mask as a card already deep into review.
	 */
	private ungroupSelected(): void {
		if (this.selectedShapes.length === 0) return;
		for (const index of this.selectedShapes) {
			this.shapes[index] = { ...this.shapes[index]!, group: this.freeGroup() };
		}
		this.commit();
	}

	private align(alignment: Alignment): void {
		if (this.selectedShapes.length < 2) return;
		this.shapes = alignShapes(this.shapes, this.selectedShapes, alignment);
		this.commit();
	}

	// ── View ──────────────────────────────────────────────────────

	/**
	 * Work out the width at which the whole image fits the stage, and repaint at
	 * it. Run on load and on every stage resize, because either can change it.
	 */
	private measure(): void {
		const fit = fitWidth(
			{ width: this.stage.clientWidth, height: this.stage.clientHeight },
			{ width: this.image.naturalWidth, height: this.image.naturalHeight },
		);
		if (fit === this.fit) return;
		this.fit = fit;
		// Only the canvas, not a full redraw: this can fire while the modal is
		// still being assembled, before there is any chrome to bring in step.
		this.applySize();
	}

	/**
	 * Put the canvas at its current size. `fit` is the width the whole image
	 * occupies and zoom multiplies it, so zoom 1 is fit-to-view and nothing
	 * scrolls until the user asks it to.
	 */
	private applySize(): void {
		this.canvas.setCssProps({
			"--osmosis-occlusion-zoom": String(this.zoom),
			"--osmosis-occlusion-fit": this.fit === 0 ? "100%" : `${String(this.fit)}px`,
		});
	}

	private setZoom(zoom: number): void {
		this.zoom = zoom;
		this.redraw();
	}

	/**
	 * Zoom while keeping whatever is under `at` where it is. Growing the canvas
	 * on its own scales it from the top-left corner, which slides the thing being
	 * zoomed towards out from under the pointer.
	 */
	private zoomAbout(zoom: number, at: { clientX: number; clientY: number }): void {
		if (zoom === this.zoom) return;
		const scale = zoom / this.zoom;
		const box = this.stage.getBoundingClientRect();
		const left = anchoredScroll(this.stage.scrollLeft, at.clientX - box.left, scale);
		const top = anchoredScroll(this.stage.scrollTop, at.clientY - box.top, scale);

		this.setZoom(zoom);
		// After the resize, so there is something to scroll into.
		this.stage.scrollLeft = left;
		this.stage.scrollTop = top;
	}

	// ── History ───────────────────────────────────────────────────

	private snapshot(): Snapshot {
		return {
			shapes: this.shapes.map(cloneShape),
			annotations: this.annotations.map((a) => ({ ...a })),
		};
	}

	/**
	 * Record the change just made and repaint.
	 *
	 * A snapshot identical to the one in force is not recorded. Every pointer
	 * release runs through here, so without that check a stray click would push
	 * a no-op step and the first Ctrl+Z after it would appear to do nothing.
	 */
	private commit(): void {
		const snapshot = this.snapshot();
		if (JSON.stringify(snapshot) !== JSON.stringify(this.history.current)) {
			this.history.push(snapshot);
		}
		this.redraw();
	}

	private undo(): void {
		this.restore(this.history.undo());
	}

	private redo(): void {
		this.restore(this.history.redo());
	}

	/**
	 * Adopt a snapshot. The selection is dropped rather than remapped: indices
	 * from before the step may point at shapes that no longer exist, and a
	 * selection that silently moved to a different mask is worse than none.
	 */
	private restore(snapshot: Snapshot | null): void {
		if (!snapshot) return;
		this.adopt(snapshot);
		this.clearSelection();
		this.polyDraft = null;
		this.editingAnnotation = null;
		this.redraw();
	}

	/** Take a snapshot's document as the working one, leaving state around it alone. */
	private adopt(snapshot: Snapshot): void {
		this.shapes = snapshot.shapes.map(cloneShape);
		this.annotations = snapshot.annotations.map((a) => ({ ...a }));
	}

	// ── Rendering ─────────────────────────────────────────────────

	/**
	 * Repaint the overlay from scratch. Shapes number in the tens, so rebuilding
	 * is simpler than diffing and fast enough to run on every pointer move.
	 *
	 * `preview` is the box being swept out by an in-progress draw, which is
	 * shown but not yet part of `shapes`.
	 */
	private redraw(preview?: Box): void {
		this.svg.empty();

		this.shapes.forEach((shape, index) => {
			const element = this.svg.createSvg(svgTagFor(shape), {
				cls: this.selectedShapes.includes(index)
					? ["osmosis-occlusion-mask", "is-editing", "is-selected"]
					: ["osmosis-occlusion-mask", "is-editing"],
			});
			for (const [name, value] of Object.entries(shapeAttrs(shape, this.aspect))) {
				element.setAttribute(name, value);
			}
		});

		if (preview) {
			const kind = this.drawKind();
			const element = this.svg.createSvg(kind, {
				cls: ["osmosis-occlusion-mask", "is-editing", "is-preview"],
			});
			const attrs = shapeAttrs(shapeFromBox(kind, "c1", preview), this.aspect);
			for (const [name, value] of Object.entries(attrs)) {
				element.setAttribute(name, value);
			}
		}

		if (this.polyDraft) this.drawPolyDraft(this.polyDraft);

		const only = this.onlySelectedShape();
		if (only !== null) this.drawShapeGrips(this.shapes[only]!);
		this.drawAnnotationGrip();

		this.renderAnnotationLayer();
		this.syncChrome();
	}

	/**
	 * Every grip on the selected shape, inside a group carrying the shape's own
	 * rotation.
	 *
	 * Drawing them in the shape's unrotated frame and letting the transform turn
	 * them is what keeps the picture and the pointer test in agreement: the test
	 * turns the pointer back into that same frame, so a grip is grabbed exactly
	 * where it appears, at any angle, with no second set of arithmetic.
	 */
	private drawShapeGrips(shape: OcclusionShape): void {
		const layer = this.svg.createSvg("g", { cls: ["osmosis-occlusion-grips"] });
		const transform = rotationTransform(shape, this.aspect);
		if (transform !== null) layer.setAttribute("transform", transform);

		const box = shapeBox(shape);
		this.drawRotationGrip(layer, box);
		// Box handles stay on a polygon too, so it can still be scaled as a
		// whole; the vertex handles are additional, not a replacement.
		this.drawHandles(layer, box);
		if (shape.kind === "poly") this.drawVertices(layer, shape.points);
	}

	/** The grip that turns a shape, on a stem above its box. */
	private drawRotationGrip(parent: SVGElement, box: Box): void {
		const at = rotationHandlePoint(box, this.handleOffset());
		const stem = parent.createSvg("line", { cls: ["osmosis-occlusion-rotate-stem"] });
		stem.setAttribute("x1", String(at.x));
		stem.setAttribute("y1", String(box.y));
		stem.setAttribute("x2", String(at.x));
		stem.setAttribute("y2", String(at.y));
		this.drawGrip(parent, at);
	}

	/** The grip that turns the selected label, hanging off its anchor. */
	private drawAnnotationGrip(): void {
		const index = this.selectedAnnotation;
		if (index === null) return;
		const annotation = this.annotations[index];
		// Not while it is being named: the field covers its own anchor, and a grip
		// under the text cursor is only ever in the way.
		if (!annotation || this.editingAnnotation === index) return;
		this.drawGrip(this.svg, this.annotationHandlePoint(annotation));
	}

	/**
	 * One rotation grip. An ellipse sized in per-axis normalised units, so it
	 * comes out a circle on screen whatever the image's proportions — the same
	 * reason the tolerance that grabs it is per-axis.
	 */
	private drawGrip(parent: SVGElement, at: Point): void {
		const tolerance = this.grabTolerance();
		const grip = parent.createSvg("ellipse", { cls: ["osmosis-occlusion-rotate"] });
		grip.setAttribute("cx", String(at.x));
		grip.setAttribute("cy", String(at.y));
		grip.setAttribute("rx", String(tolerance.x / 2));
		grip.setAttribute("ry", String(tolerance.y / 2));
		// The only place the Shift modifier is discoverable — the toolbar has no
		// rotate button, because rotating is a drag on the shape itself.
		grip.createSvg("title").textContent = "Rotate — hold shift to snap to 15°";
	}

	/** The eight resize handles around the selected shape. */
	private drawHandles(parent: SVGElement, box: Box): void {
		const tolerance = this.grabTolerance();
		for (const id of HANDLE_IDS) {
			const at = handlePoint(box, id);
			const handle = parent.createSvg("rect", { cls: ["osmosis-occlusion-handle"] });
			// Sized in normalised units so the handle keeps a constant pixel size
			// whatever the image's aspect ratio — the same reason the tolerance
			// that grabs it is per-axis.
			handle.setAttribute("x", String(at.x - tolerance.x / 2));
			handle.setAttribute("y", String(at.y - tolerance.y / 2));
			handle.setAttribute("width", String(tolerance.x));
			handle.setAttribute("height", String(tolerance.y));
		}
	}

	/**
	 * A dot per polygon vertex. Ellipses rather than circles because the 0–1
	 * space is stretched to the image's aspect ratio, so a circle drawn in it
	 * would come out as an ellipse anyway — and the wrong one.
	 */
	private drawVertices(parent: SVGElement, points: readonly [number, number][]): void {
		const tolerance = this.grabTolerance();
		for (const [x, y] of points) {
			const vertex = parent.createSvg("ellipse", { cls: ["osmosis-occlusion-vertex"] });
			vertex.setAttribute("cx", String(x));
			vertex.setAttribute("cy", String(y));
			vertex.setAttribute("rx", String(tolerance.x / 2));
			vertex.setAttribute("ry", String(tolerance.y / 2));
		}
	}

	/** The polygon being drawn: the path so far, with a dot on every vertex. */
	private drawPolyDraft(draft: readonly Point[]): void {
		if (draft.length >= 2) {
			const line = this.svg.createSvg("polyline", { cls: ["osmosis-occlusion-draft"] });
			line.setAttribute("points", draft.map((p) => `${String(p.x)},${String(p.y)}`).join(" "));
		}
		// A draft is never rotated — it has no shape to belong to yet — so its
		// dots go straight on the canvas rather than into a transformed group.
		this.drawVertices(this.svg, draft.map((p): [number, number] => [p.x, p.y]));
	}

	/**
	 * Rebuild the annotation layer.
	 *
	 * Labels are HTML rather than SVG `<text>` for the same reason the study
	 * renderer draws them that way: the overlay is deliberately stretched by
	 * `preserveAspectRatio="none"`, and glyphs drawn in it would be stretched
	 * with it. Percentages of the wrapper are the same normalised coordinates,
	 * so `positionAnnotation` is shared with the renderer and the two cannot
	 * drift apart.
	 *
	 * Pointer capture for a label drag is taken on the *SVG*, not on the label:
	 * this layer is rebuilt on every pointer move, so a capture held by a label
	 * would die with the element halfway through the drag.
	 */
	private renderAnnotationLayer(): void {
		this.annotationLayer.empty();

		this.annotations.forEach((annotation, index) => {
			if (index === this.editingAnnotation) {
				const input = this.annotationLayer.createEl("input", {
					cls: "osmosis-occlusion-annotation-input",
					value: annotation.text,
					attr: { type: "text", placeholder: "Label" },
				});
					// Deliberately without the label's rotation: the field is chrome for
				// typing in, and a tilted text box is only awkward. The label takes
				// its angle back the moment the edit commits.
				positionAnnotation(input, annotation.x, annotation.y);
				// A blur is only the user leaving the field once the field has been
				// in it. Anything else is a focus steal, and committing on it would
				// delete a label the user had not finished typing — silently, since
				// an empty commit drops the annotation altogether.
				let focused = false;
				input.addEventListener("focus", () => { focused = true; });
				input.addEventListener("keydown", (event: KeyboardEvent) => {
					if (event.key === "Enter") {
						event.preventDefault();
						this.commitAnnotationEdit(index, input.value);
					} else if (event.key === "Escape") {
						event.preventDefault();
						this.commitAnnotationEdit(index, annotation.text);
					}
					event.stopPropagation();
				});
				input.addEventListener("blur", () => {
					if (!focused) return;
					this.commitAnnotationEdit(index, input.value);
				});
				// Deferred a tick, so the browser's own mousedown focus handling has
				// finished before the field claims focus.
				window.setTimeout(() => {
					input.focus();
					input.select();
				}, 0);
				return;
			}

			const label = this.annotationLayer.createDiv({
				cls: index === this.selectedAnnotation
					? ["osmosis-occlusion-annotation", "is-selected"]
					: ["osmosis-occlusion-annotation"],
				text: annotation.text,
			});
			positionAnnotation(label, annotation.x, annotation.y, annotation.rotation);
			label.addEventListener("pointerdown", (event: PointerEvent) => {
				if (event.button !== 0) return;
				// Stopped, so the press does not also reach the overlay underneath
				// and start a draw. Double clicks are shared with the canvas rather
				// than left to the native event, for the same reason: this layer is
				// rebuilt on every pointer move, so a label never survives long
				// enough to receive two clicks of its own reliably.
				event.stopPropagation();
				if (this.takeDoubleClick(this.pointAt(event))) {
					this.editingAnnotation = index;
					this.redraw();
					return;
				}
				this.selectedShapes = [];
				this.selectedAnnotation = index;
				this.drag = {
					kind: "annotation",
					index,
					from: this.pointAt(event),
					origin: { x: annotation.x, y: annotation.y },
				};
				this.svg.setPointerCapture(event.pointerId);
				this.redraw();
			});
		});
	}

	/** Bring the toolbar and hint line back in step with the current state. */
	private syncChrome(): void {
		for (const [tool, button] of this.toolButtons) {
			button.toggleClass("is-active", this.tool === tool);
		}

		const hasSelection = this.selectedShapes.length > 0 || this.selectedAnnotation !== null;
		this.deleteButton.disabled = !hasSelection;
		this.duplicateButton.disabled = !hasSelection;
		this.undoButton.disabled = !this.history.canUndo;
		this.redoButton.disabled = !this.history.canRedo;
		for (const button of this.alignButtons) button.disabled = this.selectedShapes.length < 2;
		this.ungroupButton.disabled = this.selectedShapes.length === 0;
		this.translucencyButton.toggleClass("is-active", this.opaque);

		this.canvas.toggleClass("is-opaque", this.opaque);
		this.svg.toggleClass("is-panning", this.tool === "pan");
		// Sized on the canvas — the wrapper the overlay is pinned to — and not on
		// the stage around it, because the wrapper is the box that has to grow.
		this.applySize();

		const groups = usedGroups(this.shapes).sort(byGroupNumber);
		this.groupSelect.empty();
		for (const group of groups) this.groupSelect.createEl("option", { value: group, text: group });
		this.groupSelect.createEl("option", { value: NEW_GROUP, text: "New group" });
		this.groupSelect.disabled = this.selectedShapes.length === 0;
		const firstSelected = this.selectedShapes[0];
		this.groupSelect.value = firstSelected === undefined
			? (groups[0] ?? NEW_GROUP)
			: this.shapes[firstSelected]!.group;

		this.hint.setText(this.hintText(groups.length));
	}

	private hintText(cards: number): string {
		if (this.polyDraft !== null) {
			return this.polyDraft.length < 3
				? "Click to add polygon points — three or more make a mask."
				: "Click the first point, double-click, or press Enter to close the polygon.";
		}
		if (this.tool === "poly") return "Click to place the polygon's first point.";
		if (this.tool === "text") return "Click the image to place a label.";
		if (this.tool === "pan") return "Drag to move a zoomed image. Pinch or Ctrl+scroll to zoom.";
		if (this.shapes.length === 0) return "Drag on the image to draw a mask.";

		const shapes = `${String(this.shapes.length)} shape${this.shapes.length === 1 ? "" : "s"}`;
		return `${shapes} in ${String(cards)} group${cards === 1 ? "" : "s"} — ${String(cards)} card${cards === 1 ? "" : "s"}. Shapes sharing a group become one card.`;
	}
}

/** Sentinel value for the group dropdown's "New group" entry. */
const NEW_GROUP = " new";

/** Halfway between two pointers, in client pixels. */
function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** How far apart two pointers are, in client pixels. */
function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

function iconButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: () => void,
): HTMLButtonElement {
	const button = parent.createEl("button", {
		cls: "osmosis-occlusion-tool",
		attr: { "aria-label": label },
	});
	setIcon(button, icon);
	button.addEventListener("click", onClick);
	return button;
}

function byGroupNumber(a: string, b: string): number {
	const num = (group: string) => parseInt(/^c(\d+)$/.exec(group)?.[1] ?? "0", 10);
	return num(a) - num(b);
}

function svgTagFor(shape: OcclusionShape): "rect" | "ellipse" | "polygon" {
	return shape.kind === "rect" ? "rect" : shape.kind === "ellipse" ? "ellipse" : "polygon";
}

/**
 * A shape's SVG attributes. Deliberately a separate spelling from
 * `occlusion-masks.ts`: that module decides what study *paints* and carries the
 * mode/side logic with it, while the editor always draws every shape.
 */
function shapeAttrs(shape: OcclusionShape, aspect: number): Record<string, string> {
	const attrs = shapeGeometryAttrs(shape);
	const transform = rotationTransform(shape, aspect);
	if (transform !== null) attrs["transform"] = transform;
	return attrs;
}

function shapeGeometryAttrs(shape: OcclusionShape): Record<string, string> {
	switch (shape.kind) {
		case "rect":
			return { x: String(shape.x), y: String(shape.y), width: String(shape.w), height: String(shape.h) };
		case "ellipse":
			return { cx: String(shape.x), cy: String(shape.y), rx: String(shape.rx), ry: String(shape.ry) };
		case "poly":
			return { points: shape.points.map(([x, y]) => `${String(x)},${String(y)}`).join(" ") };
	}
}
