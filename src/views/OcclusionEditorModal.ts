import { Modal, setIcon, type App } from "obsidian";
import type { OcclusionMode, OcclusionSet, OcclusionShape } from "../database/types";
import {
	boxFromDrag,
	HANDLE_IDS,
	handleAt,
	handlePoint,
	hitTest,
	isDegenerate,
	moveBox,
	nextGroup,
	resizeBox,
	shapeBox,
	shapeFromBox,
	shapeWithBox,
	toNormalized,
	usedGroups,
	type Box,
	type HandleId,
	type Point,
} from "../study/occlusion-geometry";

/**
 * The canvas editor for image occlusion: draw, move, resize, group, and delete
 * masks over an image.
 *
 * Deliberately a thin shell. Every piece of arithmetic — normalising pointer
 * input, hit testing, resize handles, group allocation — lives in
 * `study/occlusion-geometry.ts`, because vitest cannot import `obsidian` and
 * geometry is where this feature's correctness actually is. What is left here
 * is DOM construction and pointer plumbing.
 *
 * **The canvas reuses the study renderer's coordinate contract**, and must keep
 * doing so: a shrink-to-fit `.osmosis-occlusion` wrapper, an SVG pinned to its
 * edges with `viewBox="0 0 1 1"` and `preserveAspectRatio="none"`, and an image
 * at `object-fit: fill`. That trio is why a shape drawn here lands on the same
 * pixels when the card is studied, at any rendered size, with no measurement
 * and no resize listener. Changing either half alone silently misaligns masks.
 */

/** Which drawing tool the pointer is currently holding. */
type Tool = "select" | "rect" | "ellipse";

/** What a pointer drag in progress is doing. */
type Drag =
	| { kind: "draw"; from: Point }
	| { kind: "move"; index: number; start: Box; from: Point }
	| { kind: "resize"; index: number; handle: HandleId };

/** How close a pointer must come to a handle to grab it, in image pixels. */
const HANDLE_GRAB_PX = 12;

const MODE_LABELS: Record<OcclusionMode, string> = {
	"hide-all-guess-one": "Hide All, Guess One",
	"hide-one-guess-one": "Hide One, Guess One",
};

export interface OcclusionEditorOptions {
	/** Resolved URL for the image being occluded. */
	src: string;
	/** The embed target as written, shown in the modal's subtitle. */
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
	private mode: OcclusionMode;
	private tool: Tool = "rect";
	/**
	 * The shape a drag on empty canvas draws while the Select tool is held.
	 *
	 * Drawing a shape drops into Select so it can be nudged or regrouped, but
	 * the common next action is drawing *another* mask — so an empty-canvas drag
	 * keeps drawing, in the kind last chosen, instead of doing nothing and
	 * sending the user back to the toolbar between every shape.
	 */
	private lastDrawTool: Exclude<Tool, "select"> = "rect";
	private selected = -1;
	private drag: Drag | null = null;

	private image!: HTMLImageElement;
	private svg!: SVGSVGElement;
	private toolButtons = new Map<Tool, HTMLButtonElement>();
	private groupSelect!: HTMLSelectElement;
	private deleteButton!: HTMLButtonElement;
	private hint!: HTMLElement;

	constructor(app: App, private readonly options: OcclusionEditorOptions) {
		super(app);
		// Copied, so Cancel genuinely discards: the caller's set is the one on
		// disk and must not be mutated by editing that is never saved.
		this.shapes = options.set.shapes.map((shape) => ({ ...shape }));
		this.mode = options.set.mode;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("osmosis-occlusion-modal");
		contentEl.createEl("h2", { text: "Image occlusion" });
		contentEl.createEl("p", { cls: "osmosis-occlusion-subtitle", text: this.options.image });

		this.buildToolbar(contentEl);
		this.buildCanvas(contentEl);

		this.hint = contentEl.createDiv({ cls: "osmosis-occlusion-hint" });

		const buttons = contentEl.createDiv("modal-button-container");
		const save = buttons.createEl("button", { cls: "mod-cta", text: "Save" });
		save.addEventListener("click", () => {
			this.close();
			this.options.onSave({ mode: this.mode, shapes: this.shapes });
		});
		buttons.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => { this.close(); });

		// Scoped to the modal so it does not fight the note editor underneath.
		this.scope.register([], "Delete", () => { this.deleteSelected(); return false; });
		this.scope.register([], "Backspace", () => { this.deleteSelected(); return false; });

		this.redraw();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ── Chrome ────────────────────────────────────────────────────

	private buildToolbar(parent: HTMLElement): void {
		const bar = parent.createDiv("osmosis-occlusion-toolbar");

		const tools: { tool: Tool; icon: string; label: string }[] = [
			{ tool: "select", icon: "mouse-pointer-2", label: "Select" },
			{ tool: "rect", icon: "square", label: "Rectangle" },
			{ tool: "ellipse", icon: "circle", label: "Ellipse" },
		];
		const group = bar.createDiv("osmosis-occlusion-tools");
		for (const { tool, icon, label } of tools) {
			const button = group.createEl("button", { cls: "osmosis-occlusion-tool", attr: { "aria-label": label } });
			setIcon(button, icon);
			button.addEventListener("click", () => {
				this.tool = tool;
				// Leaving a drawing tool for Select keeps the selection; entering
				// one drops it, so the handles do not sit under the new shape.
				if (tool !== "select") {
					this.lastDrawTool = tool;
					this.selected = -1;
				}
				this.redraw();
			});
			this.toolButtons.set(tool, button);
		}

		this.deleteButton = bar.createEl("button", {
			cls: "osmosis-occlusion-tool",
			attr: { "aria-label": "Delete shape" },
		});
		setIcon(this.deleteButton, "trash-2");
		this.deleteButton.addEventListener("click", () => { this.deleteSelected(); });

		const groupField = bar.createDiv("osmosis-occlusion-field");
		groupField.createEl("label", { text: "Group" });
		this.groupSelect = groupField.createEl("select", { cls: "dropdown" });
		this.groupSelect.addEventListener("change", () => { this.assignGroup(this.groupSelect.value); });

		const modeField = bar.createDiv("osmosis-occlusion-field");
		modeField.createEl("label", { text: "Mode" });
		const modeSelect = modeField.createEl("select", { cls: "dropdown" });
		for (const [value, label] of Object.entries(MODE_LABELS)) {
			modeSelect.createEl("option", { value, text: label });
		}
		modeSelect.value = this.mode;
		modeSelect.addEventListener("change", () => {
			this.mode = modeSelect.value as OcclusionMode;
		});
	}

	private buildCanvas(parent: HTMLElement): void {
		const stage = parent.createDiv("osmosis-occlusion-stage");
		// Same wrapper and image classes the study renderer uses — the layout
		// contract that makes normalised coordinates land correctly is CSS, so
		// sharing the classes is what keeps the two surfaces in agreement.
		const wrapper = stage.createDiv({ cls: ["osmosis-occlusion", "osmosis-occlusion-canvas"] });
		this.image = wrapper.createEl("img", {
			cls: "osmosis-occlusion-image",
			attr: { src: this.options.src, alt: this.options.image, draggable: "false" },
		});

		this.svg = wrapper.createSvg("svg", { cls: "osmosis-occlusion-editor-layer" });
		this.svg.setAttribute("viewBox", "0 0 1 1");
		this.svg.setAttribute("preserveAspectRatio", "none");

		this.svg.addEventListener("pointerdown", (event) => { this.onPointerDown(event); });
		this.svg.addEventListener("pointermove", (event) => { this.onPointerMove(event); });
		this.svg.addEventListener("pointerup", (event) => { this.onPointerUp(event); });
		this.svg.addEventListener("pointercancel", (event) => { this.onPointerUp(event); });
		// The image is a native drag source; without this a drag that starts on
		// it becomes a file drag and the mask is never drawn.
		this.svg.addEventListener("dragstart", (event) => { event.preventDefault(); });
	}

	// ── Pointer handling ──────────────────────────────────────────

	/** The pointer position in the image's normalised 0–1 space. */
	private pointAt(event: PointerEvent): Point {
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

	private onPointerDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		event.preventDefault();
		this.svg.setPointerCapture(event.pointerId);
		const point = this.pointAt(event);

		// A grabbed handle wins over everything, including a shape drawn on top
		// of it — otherwise a selected shape overlapped by a later one could
		// never be resized.
		if (this.selected >= 0) {
			const handle = handleAt(shapeBox(this.shapes[this.selected]!), point, this.grabTolerance());
			if (handle) {
				this.drag = { kind: "resize", index: this.selected, handle };
				return;
			}
		}

		if (this.tool === "select") {
			const index = hitTest(this.shapes, point);
			this.selected = index;
			// Empty canvas: keep drawing rather than dead-ending. A click that
			// never becomes a drag is still just a deselect, since a degenerate
			// draw commits nothing.
			this.drag = index === -1
				? { kind: "draw", from: point }
				: { kind: "move", index, start: shapeBox(this.shapes[index]!), from: point };
			this.redraw();
			return;
		}

		this.drag = { kind: "draw", from: point };
	}

	private onPointerMove(event: PointerEvent): void {
		if (!this.drag) return;
		event.preventDefault();
		const point = this.pointAt(event);

		switch (this.drag.kind) {
			case "draw":
				// Drawn shapes are previewed rather than committed, so a drag that
				// ends as a click leaves nothing behind.
				this.redraw(boxFromDrag(this.drag.from, point));
				return;
			case "move": {
				const shape = this.shapes[this.drag.index]!;
				const box = moveBox(this.drag.start, point.x - this.drag.from.x, point.y - this.drag.from.y);
				this.shapes[this.drag.index] = shapeWithBox(shape, box);
				this.redraw();
				return;
			}
			case "resize": {
				const shape = this.shapes[this.drag.index]!;
				this.shapes[this.drag.index] = shapeWithBox(shape, resizeBox(shapeBox(shape), this.drag.handle, point));
				this.redraw();
				return;
			}
		}
	}

	private onPointerUp(event: PointerEvent): void {
		if (!this.drag) return;
		const drag = this.drag;
		this.drag = null;
		if (this.svg.hasPointerCapture(event.pointerId)) {
			this.svg.releasePointerCapture(event.pointerId);
		}

		if (drag.kind === "draw") {
			const box = boxFromDrag(drag.from, this.pointAt(event));
			if (!isDegenerate(box)) {
				this.shapes.push(shapeFromBox(this.drawKind(), this.freeGroup(), box));
				// Drop straight into Select on the new shape, so it can be nudged
				// or regrouped without a trip back to the toolbar. Drawing another
				// still costs nothing: a drag on empty canvas keeps drawing.
				this.selected = this.shapes.length - 1;
				this.tool = "select";
			}
		}
		this.redraw();
	}

	// ── Mutation ──────────────────────────────────────────────────

	/** The kind a draw drag commits: the held tool, or the last one under Select. */
	private drawKind(): Exclude<Tool, "select"> {
		return this.tool === "select" ? this.lastDrawTool : this.tool;
	}

	/** The next group label free across the whole carrier, not just this set. */
	private freeGroup(): string {
		return nextGroup([...usedGroups(this.shapes), ...this.options.reservedGroups]);
	}

	private deleteSelected(): void {
		if (this.selected < 0) return;
		this.shapes.splice(this.selected, 1);
		this.selected = -1;
		this.redraw();
	}

	/**
	 * Put the selected shape in a group. Choosing an existing group is how two
	 * masks become one card — the same collapse a shared `cN` cloze label makes.
	 */
	private assignGroup(value: string): void {
		if (this.selected < 0) return;
		const shape = this.shapes[this.selected]!;
		this.shapes[this.selected] = { ...shape, group: value === NEW_GROUP ? this.freeGroup() : value };
		this.redraw();
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
				cls: index === this.selected
					? ["osmosis-occlusion-mask", "is-editing", "is-selected"]
					: ["osmosis-occlusion-mask", "is-editing"],
			});
			for (const [name, value] of Object.entries(shapeAttrs(shape))) {
				element.setAttribute(name, value);
			}
		});

		if (preview) {
			const kind = this.drawKind();
			const element = this.svg.createSvg(kind, {
				cls: ["osmosis-occlusion-mask", "is-editing", "is-preview"],
			});
			for (const [name, value] of Object.entries(shapeAttrs(shapeFromBox(kind, "c1", preview)))) {
				element.setAttribute(name, value);
			}
		}

		if (this.selected >= 0) this.drawHandles(shapeBox(this.shapes[this.selected]!));
		this.syncChrome();
	}

	/** The eight resize handles around the selected shape. */
	private drawHandles(box: Box): void {
		const tolerance = this.grabTolerance();
		for (const id of HANDLE_IDS) {
			const at = handlePoint(box, id);
			const handle = this.svg.createSvg("rect", { cls: ["osmosis-occlusion-handle"] });
			// Sized in normalised units so the handle keeps a constant pixel size
			// whatever the image's aspect ratio — the same reason the tolerance
			// that grabs it is per-axis.
			handle.setAttribute("x", String(at.x - tolerance.x / 2));
			handle.setAttribute("y", String(at.y - tolerance.y / 2));
			handle.setAttribute("width", String(tolerance.x));
			handle.setAttribute("height", String(tolerance.y));
		}
	}

	/** Bring the toolbar and hint line back in step with the current state. */
	private syncChrome(): void {
		for (const [tool, button] of this.toolButtons) {
			button.toggleClass("is-active", this.tool === tool);
		}
		this.deleteButton.disabled = this.selected < 0;

		const groups = usedGroups(this.shapes).sort(byGroupNumber);
		this.groupSelect.empty();
		for (const group of groups) this.groupSelect.createEl("option", { value: group, text: group });
		this.groupSelect.createEl("option", { value: NEW_GROUP, text: "New group" });
		this.groupSelect.disabled = this.selected < 0;
		this.groupSelect.value = this.selected < 0 ? (groups[0] ?? NEW_GROUP) : this.shapes[this.selected]!.group;

		const cards = groups.length;
		this.hint.setText(
			this.shapes.length === 0
				? "Drag on the image to draw a mask."
				: `${String(this.shapes.length)} shape${this.shapes.length === 1 ? "" : "s"} in ${String(cards)} group${cards === 1 ? "" : "s"} — ${String(cards)} card${cards === 1 ? "" : "s"}. Shapes sharing a group become one card.`,
		);
	}
}

/** Sentinel value for the group dropdown's "New group" entry. */
const NEW_GROUP = " new";

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
function shapeAttrs(shape: OcclusionShape): Record<string, string> {
	switch (shape.kind) {
		case "rect":
			return { x: String(shape.x), y: String(shape.y), width: String(shape.w), height: String(shape.h) };
		case "ellipse":
			return { cx: String(shape.x), cy: String(shape.y), rx: String(shape.rx), ry: String(shape.ry) };
		case "poly":
			return { points: shape.points.map(([x, y]) => `${String(x)},${String(y)}`).join(" ") };
	}
}
