/**
 * Cosmos's near tier: live Obsidian Markdown for the nearest nodes, in
 * CSS2D panels layered over their plates. See
 * `vault/Planner/3D Graph Phase 4 - Near tier.md`.
 *
 * - **Which nodes:** `chooseNear` (`../cosmos/lod.ts`) picks them each frame,
 *   with hysteresis at every boundary and a budget; `nearMarkdown`
 *   (`../cosmos/near.ts`) says what each one shows.
 * - **Sized like the plate:** a panel is laid out at a fixed text size and
 *   scaled each frame by its depth, so its text is the size of the plate text
 *   under it and it grows and shrinks with the world, never covering more than
 *   it would as a world object. Its largest size (`PANEL_MAX_EM`) is capped
 *   and the scene spaces nodes for it (`panelBoxEm`), so panels side by side
 *   leave their edges showing between them.
 * - **Stacked by depth:** a nearer panel covers a farther one, by view depth,
 *   and a plate nearer than a panel is cut out of it with a CSS mask
 *   (`../cosmos/occlusion.ts`), so the plate on the canvas shows through as
 *   if the panel were in the depth buffer too. So is every edge segment
 *   nearer than the panel, as a thin stroke (`../cosmos/edge-cuts.ts`).
 * - **One mist:** a background-coloured veil over each panel mixes it toward
 *   the background exactly as the plate shader mixes the plate
 *   (`plateVisibility`), so the DOM and WebGL fade as one. A separate
 *   cross-fade on the whole panel eases it in and out of the tier over the
 *   plate, so entering or leaving never pops.
 * - **Tilted (Planets mode):** a panel is a CSS3D object lying on its plate's
 *   tangent frame instead (`../cosmos/tilt.ts`), hidden whenever the plate is
 *   seen from behind; panels stack in the CSS3D renderer's own 3D context, and
 *   a plate cuts a hole only when it is on the eye's side of the panel's plane.
 * - **Composited, re-rastered in buckets:** a screen-facing panel is its own
 *   compositor layer (the lens), laid out at a raster scale at or above the
 *   scale it is drawn at and shrunk to it by the lens's transform
 *   (`../cosmos/raster.ts`). Moving the camera then moves and scales layers
 *   without repainting their text; the veil fades on its own layer, and a
 *   mask is a mask layer of its own. Only leaving the raster band repaints.
 * - **Shapes (T130):** a panel in any shape but a solid rectangle draws its
 *   outline (and, for a shape, its fill) as an SVG path under its text, the
 *   mind map's geometry (`shapePath`), and a shape clips the panel to the path,
 *   so the veil and text follow it too. An SVG stroke follows any path and
 *   takes the mind map's `stroke-dasharray`, which neither a CSS border nor
 *   the inset shadow can; it is drawn twice as wide and clipped to its inner
 *   half, as the inset shadow sits inside the box. A shape's box is fitted
 *   round its measured text (`fitShape`): the mind map's box round the same
 *   content, padded so the text sits in the shape's inner box, and grown so
 *   its outline holds the plate under it (T130 fix 1).
 * - **Lifecycle:** each panel renders into its own `Component`, unloaded when
 *   the panel goes. Video and audio pause the moment their node leaves the
 *   tier, and release their media when the panel is removed.
 */

import { Component } from "obsidian";
import type { CardOcclusion } from "../database/types";
import type { OcclusionSide } from "../study/occlusion-masks";
import { repaintOcclusion } from "./OcclusionRenderer";
import { Group, Vector3, type Camera, type PerspectiveCamera } from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import type { GraphNode } from "../cosmos/model";
import { NEAR_ENTER_SCREEN, NEAR_EXIT_RATIO, chooseNear, enterScaleFromDetail, panelHalfNdc, panelScale, type NearProbe, type NearTierSettings } from "../cosmos/lod";
import { editorAnchor, type EditorPlace } from "../cosmos/edit";
import { MIN_STYLE_WIDTH_PX, PANEL_MAX_EM, PANEL_PAD_EM, nearMarkdown, panelBoxEm, panelWidthRule, styleWidthEm } from "../cosmos/near";
import { DASH_EM, fitShapedPanel, isBareShape, isRectShape, shapePath, shapeWrapEm } from "../cosmos/plate-shapes";
import { plateVisibility } from "../cosmos/focus";
import { PLATE_HEIGHT_EM, PLATE_RADIUS, PLATE_STROKE_EM } from "../cosmos/plates";
import { DEFAULT_FONT, textScale, type NodeLook } from "../cosmos/node-style";
import { holeMask, panelHoles, type PanelHole, type ScreenPlate } from "../cosmos/occlusion";
import { frontPanelAt, rectContains, type DrawnPanel, type ScreenRect } from "../cosmos/links";
import type { TangentFrame } from "../cosmos/planets";
import { showsText } from "../cosmos/far-side";
import { panelMatrix, panelPoint, tiltedHole, type TiltedPanel, type WorldPlate } from "../cosmos/tilt";
import { uprightFrame, type ViewBasis } from "../cosmos/upright";
import { MASK_STEP_PX, rasterScale, snapHoles, snapStrokes } from "../cosmos/raster";
import { EdgeSegments, MIN_STROKE_PX, facingStrokes, screenBox, tiltedStrokes, toView, type PanelStroke } from "../cosmos/edge-cuts";

/** A link under a click, in a near-tier panel. */
export interface PanelLink {
	/** The node whose panel holds the link. */
	node: GraphNode;
	/** The link target as written (`data-href` for internal links), and the note it is resolved from. */
	href: string;
	external: boolean;
	sourcePath: string;
	/** The link's text as shown, for an "Open link" menu item's label. */
	text: string;
}

/**
 * The inline editor, which the near tier keeps over the plate being edited:
 * laid out like a panel (`setPlate`) and moved and scaled with it every frame
 * (`place`). See `CosmosEdit.ts`.
 */
export interface TrackedEditor {
	/** The panel box the editor lays out in, in px before its scale: the plate's size, corners and text size, as a panel has them. */
	setPlate(plate: { minWidth: number; maxWidth?: number; minHeight: number; radius: number; fontSize: number }): void;
	/** Where it is this frame, in the stage's px; null while the node is behind the camera. */
	place(at: EditorPlace | null): void;
}

/** Renders `markdown` into `el`, as `MarkdownRenderer.render` does, with `component` owning its children. */
export type NearMarkdownRenderer = (markdown: string, el: HTMLElement, sourcePath: string, component: Component) => Promise<void>;

/** Draws an occluded diagram into `el`, as `renderOcclusion` does (from the view, which has the app). `sourcePath` is the note the embed is written in. */
export type NearDiagramRenderer = (el: HTMLElement, occlusion: CardOcclusion, side: OcclusionSide, sourcePath: string) => void;

/** What the near tier reads from a scene node. */
export interface NearSource {
	id: string;
	graph: GraphNode;
	x?: number;
	y?: number;
	z?: number;
	opacity: number;
	departing: boolean;
	color: { getStyle(): string };
	shape: { width: number; height: number };
	/** Planets mode: the plate lies on its planet in this frame, and its panel is tilted onto it. */
	frame?: TangentFrame;
	/** The node's style (`node-style.ts`): the panel takes its fill, outline, corners and text colour, as the plate does. */
	look?: NodeLook;
}

/** A plate's corner radius, as a share of its height: its style's shape, or the default. */
const cornerOf = (node: NearSource): number => node.look?.corner ?? PLATE_RADIUS;

/** A plate drawn this frame, with the node it is. */
interface DrawnPlate extends ScreenPlate {
	node: NearSource;
}

/** Panel text size, in CSS px, before the per-frame scale. */
export const NEAR_FONT_PX = 16;

/** A node's panel text size, in CSS px before the per-frame scale: `NEAR_FONT_PX` times its style's `textScale`. */
const fontPx = (node: NearSource): number => NEAR_FONT_PX * (node.look?.font.scale ?? textScale(node.graph.style));
/** Seconds for a panel to cross-fade in over its plate, or out. */
const NEAR_FADE_S = 0.25;
/** Rendered panels kept to clone on re-entry, like the mind map's HTML cache. */
const NEAR_CACHE_SIZE = 64;
const MEDIA = "video, audio";

interface Panel {
	/** A CSS2D panel faces the screen; a CSS3D one (Planets mode) lies on its plate's frame. */
	object: CSS2DObject | CSS3DObject;
	tilted: boolean;
	/** The composited layer: the box laid out at `raster` times its size, carrying the mask and the shrink to the drawn scale. */
	lens: HTMLElement;
	/** The plate's fill, the lens's first child, painted in the lens's own space. */
	fill: HTMLElement;
	box: HTMLElement;
	body: HTMLElement;
	veil: HTMLElement;
	component: Component;
	markdown: string;
	node: NearSource;
	rendered: boolean;
	/** Cross-fade into the tier, 0–1, heading for `target`. */
	fade: number;
	target: 0 | 1;
	/** The box's laid-out size in px, before its scale (`ResizeObserver`). */
	width: number;
	height: number;
	/** The body's (the rendered text's) laid-out size in px, which a shaped panel's box is fitted round (`fitShape`). */
	textWidth: number;
	textHeight: number;
	/** The mask last written, to skip unchanged writes. */
	mask: string;
	/** Px the box is drawn per px laid out inside the lens (`rasterScale`); 0 before the first placement. A tilted panel's is 1. */
	raster: number;
	/** The plate's corner radius, in px before any scale. */
	radius: number;
	/** The shape's outline (`shapePath`), for any panel but a solid rectangle; null for one. */
	outline: SVGPathElement | null;
	/** The path last written to `outline`, to skip unchanged writes. */
	outlinePath: string;
	/** The cross-fade opacity, lens transform and veil opacity last written, to skip unchanged writes. */
	shownFade: number;
	lensTransform: string;
	veilOpacity: string;
	/** An occlusion card's diagram as last painted (group and side), or "" for an ordinary panel. */
	diagram: string;
	/** View depth as last drawn. */
	depth: number;
	/** A tilted panel's plates in front of it, as last cut out, for clicks. */
	occluders: ScreenPlate[];
	/** The width-drag handle, shown on a selected panel in edit mode. */
	handle: HTMLElement;
	/** The width, in px before its scale, a width drag in progress has the panel at; null otherwise. */
	preview: number | null;
}

/** Per-frame panel placement costs, summed while the perf readout is shown (`CosmosPerf`). */
export interface NearStats {
	/** Time in `place` / `placeTilted`, ms. */
	placeMs: number;
	/** Lens transforms written (one a placed panel at most; the CSS2D/CSS3D renderer writes the anchor's too). */
	transforms: number;
	/** Panels re-rastered at a new scale bucket (`rasterScale`). */
	rasters: number;
	/** Mask writes that were not skipped as unchanged. */
	masks: number;
	/** Gradient layers in those masks (≈ 1 + 6 a rounded hole + 1 an edge stroke): each is a gradient image the browser repaints. */
	maskLayers: number;
}

export class CosmosNear {
	/** Set by the perf readout while it is shown; null (nothing recorded) otherwise. */
	stats: NearStats | null = null;
	/**
	 * Perf readout A/B (Shift+click the readout): no plate or edge holes are
	 * cut, so the frame's cost with and without masks can be read off. Off by
	 * default; the panels then cover nearer plates.
	 */
	masksOff = false;
	/** Handed to 3d-force-graph as an extra renderer: it lays the panels over the canvas every frame. */
	readonly renderer = new CSS2DRenderer();
	/** The same for Planets mode's tilted panels, which lie on their plates in 3D. */
	readonly renderer3d = new CSS3DRenderer();
	/** The panels' scene objects; add it to the scene. */
	readonly group = new Group();
	private readonly panels = new Map<string, Panel>();
	private readonly cache = new Map<string, HTMLElement>();
	/** Every edge segment drawn, refilled by the scene's `writeEdges`: the nearer ones are cut out of the panels they cross. */
	readonly edges = new EdgeSegments();
	/** `edges` in this frame's view space (`toView`), worked out at the first panel drawn; `edgeViewFresh` is false until then. */
	private edgeView: Float32Array | null = null;
	private edgeViewFresh = false;
	/** Px of panel laid out per world unit: the panel's text matches the plate text under it. */
	private readonly pxPerUnit: number;
	private focus = 0;
	private density = 0;
	/** Edit mode: a selected line's panel shows its width handle. */
	private resizable = false;
	/** Off (the Overlays menu's labels on plates only), no panel is chosen and the open ones fade out. */
	private enabled = true;
	/** Planets mode: panels are CSS3D, lying on their plate's frame, and hidden from behind. */
	private tilted = false;
	/** The camera's position and its screen-facing frame this frame (the frame a panel without a plate frame faces along). */
	private readonly eye = new Vector3();
	private cameraFrame: TangentFrame = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } };
	/** The camera as `uprightFrame` reads it, set with `cameraFrame` each update. */
	private view: ViewBasis = { eye: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, back: { x: 0, y: 0, z: 1 } };
	/** The node being edited over, whose panel stays hidden. */
	private editing: string | null = null;
	/** The multi-select: these nodes' panels wear the selection border. */
	private selected: ReadonlySet<string> = new Set();
	private found: ReadonlySet<string> = new Set();
	/** The inline editor over it, and the node it follows. */
	private edit: { editor: TrackedEditor; node: NearSource } | null = null;
	private readonly point = new Vector3();
	private readonly platePoint = new Vector3();
	/** This frame's nodes, and their plates on screen: worked out at the first panel drawn, with the render's camera. */
	private sources: readonly NearSource[] = [];
	private screenPlates: DrawnPlate[] | null = null;
	/** The plates of the last frame drawn, for clicks between frames. */
	private drawnPlates: DrawnPlate[] = [];
	private readonly boxes = new Map<Element, Panel>();
	private readonly sizes = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const panel = this.boxes.get(entry.target);
			const size = entry.borderBoxSize[0];
			if (panel === undefined || size === undefined) continue;
			if (entry.target === panel.body) {
				panel.textWidth = size.inlineSize;
				panel.textHeight = size.blockSize;
				// The box follows; its own entry then writes the outline.
				this.fitShape(panel);
				continue;
			}
			panel.width = size.inlineSize;
			panel.height = size.blockSize;
			// In the same frame, before paint: the lens is never a frame behind its box.
			this.sizeLens(panel);
		}
	});

	/**
	 * `lineEmWorld` is how many world units one em of plate text is. `settings`
	 * gives the user's panel detail and live-panel limit, read every frame so a
	 * change in the Overlays menu applies at once.
	 */
	constructor(
		private readonly render: NearMarkdownRenderer,
		private readonly renderDiagram: NearDiagramRenderer,
		lineEmWorld: number,
		private readonly settings: () => NearTierSettings,
	) {
		this.pxPerUnit = NEAR_FONT_PX / lineEmWorld;
		this.renderer.domElement.addClasses(["osmosis-cosmos-near", "osmosis-cosmos-near-flat"]);
		this.renderer3d.domElement.addClass("osmosis-cosmos-near");
	}

	/** World units of plate text per em for a plate `height` units tall. */
	static emWorld(height: number): number {
		return height / PLATE_HEIGHT_EM;
	}

	/**
	 * Choose this frame's near tier and step the panels' cross-fades. The
	 * panels' scale and veil are set as the CSS2D renderer draws them (see
	 * `place`), with the camera as it is then.
	 */
	update(nodes: readonly NearSource[], camera: PerspectiveCamera, focus: number, density: number, seconds: number): void {
		this.focus = focus;
		this.density = density;
		this.sources = nodes;
		this.screenPlates = null;
		this.edgeViewFresh = false;
		camera.updateMatrixWorld();
		const eye = this.eye.setFromMatrixPosition(camera.matrixWorld);
		const e = camera.matrixWorld.elements;
		this.cameraFrame = { right: { x: e[0], y: e[1], z: e[2] }, up: { x: e[4], y: e[5], z: e[6] }, normal: { x: e[8], y: e[9], z: e[10] } };
		this.view = { eye: { x: eye.x, y: eye.y, z: eye.z }, right: this.cameraFrame.right, up: this.cameraFrame.up, back: this.cameraFrame.normal };
		const pxPerUnitAt1 = this.pxPerUnitAt1(camera);
		const { detail, budget } = this.settings();
		const enterScale = enterScaleFromDetail(detail);
		const exitScale = enterScale * NEAR_EXIT_RATIO;
		const probes: NearProbe[] = [];
		const markdown = new Map<string, { node: NearSource; text: string }>();
		const point = this.point;
		const viewport = this.renderer.getSize();
		for (const node of this.enabled ? nodes : []) {
			if (node.departing || node.x === undefined || node.y === undefined || node.z === undefined) continue;
			// A planet's plate seen from behind is drawn dimmed but shows no text, so it has no panel either.
			if (this.tilted && !showsText({ x: node.x, y: node.y, z: node.z }, node.frame?.normal, eye)) continue;
			point.set(node.x, node.y, node.z).applyMatrix4(camera.matrixWorldInverse);
			const depth = -point.z;
			const scale = panelScale(depth, pxPerUnitAt1, this.pxPerUnit);
			// Most nodes are far: skip them before anything costlier.
			if (scale < exitScale) continue;
			const text = nearMarkdown(node.graph);
			if (text === null) continue;
			point.applyMatrix4(camera.projectionMatrix);
			const probe: NearProbe = { id: node.id, depth, scale, x: point.x, y: point.y, visibility: plateVisibility(node.opacity, depth, focus, density) };
			// A centre on screen needs no extent. Off it, the panel's box decides: a tall panel
			// (a long code block) stays while any of it shows (`NearProbe.halfX`).
			if (Math.max(Math.abs(point.x), Math.abs(point.y)) > NEAR_ENTER_SCREEN) {
				const box = this.panelPx(node, this.panels.get(node.id));
				if (box !== null) {
					const half = panelHalfNdc(box.width, box.height, scale, viewport);
					probe.halfX = half.x;
					probe.halfY = half.y;
				}
			}
			probes.push(probe);
			markdown.set(node.id, { node, text });
		}
		const current = new Set<string>();
		for (const [id, panel] of this.panels) if (panel.target === 1) current.add(id);
		const near = chooseNear(probes, current, budget, enterScale);

		for (const id of near) {
			const { node, text } = markdown.get(id)!;
			const panel = this.panels.get(id);
			if (panel === undefined) this.panels.set(id, this.createPanel(node, text));
			else {
				panel.node = node;
				panel.target = 1;
				if (panel.markdown !== text) this.fill(panel, text);
				else this.repaintDiagram(panel);
			}
		}
		const step = seconds / NEAR_FADE_S;
		for (const [id, panel] of this.panels) {
			if (!near.has(id) && panel.target === 1) {
				panel.target = 0;
				pauseMedia(panel.body);
			}
			// A panel fades in only once it has something to show.
			if (panel.target === 1 && panel.rendered) panel.fade = Math.min(1, panel.fade + step);
			else if (panel.target === 0) panel.fade = Math.max(0, panel.fade - step);
			if (panel.target === 0 && (panel.fade === 0 || !panel.rendered)) {
				this.removePanel(panel);
				this.panels.delete(id);
				continue;
			}
			const node = panel.node;
			panel.object.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
			if (panel.tilted) this.tilt(panel);
			if (panel.fade !== panel.shownFade) {
				panel.shownFade = panel.fade;
				panel.object.element.setCssStyles({ opacity: String(panel.fade) });
			}
		}
		this.placeEditor(camera, pxPerUnitAt1);
	}

	/** The panels up now, fading ones included, by what they hold (for the perf readout). */
	panelKinds(): { panels: number; code: number; image: number; plain: number } {
		const kinds = { panels: this.panels.size, code: 0, image: 0, plain: 0 };
		for (const panel of this.panels.values()) {
			if (panel.body.querySelector("pre") !== null) kinds.code++;
			else if (panel.body.querySelector("img, video, .internal-embed") !== null) kinds.image++;
			else kinds.plain++;
		}
		return kinds;
	}

	/** The size, in world units, of the panel a node has up right now (measured), or null: an edge hint clears it rather than the plate underneath. */
	liveBoxWorld(id: string): { width: number; height: number } | null {
		const panel = this.panels.get(id);
		if (panel === undefined || panel.width <= 0 || panel.height <= 0 || panel.target === 0) return null;
		return { width: panel.width / this.pxPerUnit, height: panel.height / this.pxPerUnit };
	}

	/** A node's panel size in laid-out px: as measured once its panel exists, else estimated from its Markdown (`panelBoxEm`). */
	private panelPx(node: NearSource, panel: Panel | undefined): { width: number; height: number } | null {
		if (panel !== undefined && panel.width > 0 && panel.height > 0) return { width: panel.width, height: panel.height };
		const em = panelBoxEm(node.graph);
		const px = fontPx(node);
		return em === null ? null : { width: em.width * px, height: em.height * px };
	}

	/**
	 * Move the inline editor onto its plate for this frame, as a panel would sit
	 * there: centred on the node, scaled by its depth, and fading into the mist
	 * with the plate. The focus dim is left out, so the line being typed stays
	 * readable wherever the orbit target is. Behind the camera it hides (by
	 * opacity, not `display`, which would take the keyboard focus and save it).
	 */
	private placeEditor(camera: PerspectiveCamera, pxPerUnitAt1: number): void {
		const edit = this.edit;
		if (edit === null) return;
		const { node } = edit;
		if (node.x === undefined || node.y === undefined || node.z === undefined) {
			edit.editor.place(null);
			return;
		}
		const point = this.point.set(node.x, node.y, node.z).applyMatrix4(camera.matrixWorldInverse);
		const depth = -point.z;
		point.applyMatrix4(camera.projectionMatrix);
		const size = this.renderer.getSize();
		const at = editorAnchor({ x: point.x, y: point.y }, depth, camera.near, size, pxPerUnitAt1, this.pxPerUnit);
		edit.editor.place(at === null ? null : { ...at, opacity: plateVisibility(node.opacity, depth, depth, this.density) });
	}

	/**
	 * The panel drawn on top at client point (`x`, `y`), if any. Panels never
	 * take the pointer, so this hit-tests them as drawn: a nearer panel covers a
	 * farther one, and a nearer plate is cut out of both.
	 */
	private panelAt(x: number, y: number): Panel | undefined {
		const origin = this.renderer.domElement.getBoundingClientRect();
		const drawn: DrawnPanel[] = [];
		const byId = new Map<string, Panel>();
		for (const panel of this.panels.values()) {
			if (panel.target !== 1 || !panel.rendered || panel.fade === 0) continue;
			const rect = panel.box.getBoundingClientRect();
			drawn.push({ id: panel.node.id, rect: { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top }, depth: panel.depth });
			byId.set(panel.node.id, panel);
		}
		const [px, py] = [x - origin.left, y - origin.top];
		// A tilted panel's occluders are the plates it cut out (`placeTilted`), not every plate nearer than its centre.
		const front = frontPanelAt(px, py, drawn, this.tilted ? [] : this.drawnPlates);
		const panel = front === null ? undefined : byId.get(front);
		if (panel?.occluders.some((plate) => Math.abs(plate.x - px) <= plate.halfWidth && Math.abs(plate.y - py) <= plate.halfHeight) === true) return undefined;
		return panel;
	}

	/** The node whose panel is drawn on top at client point (`x`, `y`), if any. */
	nodeAt(x: number, y: number): GraphNode | null {
		return this.panelAt(x, y)?.node.graph ?? null;
	}

	/**
	 * Edit `node`'s text in `editor`, kept over its plate from now on, with the
	 * node's own panel hidden under it. Null stops: every panel shows again.
	 */
	setEditing(node: NearSource | null, editor: TrackedEditor | null): void {
		this.editing = node?.id ?? null;
		this.edit = node === null || editor === null ? null : { editor, node };
		for (const [panelId, panel] of this.panels) panel.lens.classList.toggle("is-editing", panelId === this.editing);
		if (node === null || editor === null) return;
		const plateHeight = node.shape.height * this.pxPerUnit;
		// A node with a set width wraps its text at it (a code block at its fit), as its panel does.
		const rule = panelWidthRule(node.graph);
		const px = fontPx(node);
		editor.setPlate({ minWidth: node.shape.width * this.pxPerUnit, ...(rule.kind === "default" ? {} : { maxWidth: Math.max(rule.em * px, node.shape.width * this.pxPerUnit) }), minHeight: plateHeight, radius: plateHeight * cornerOf(node), fontSize: px });
	}

	/** Give the panels of the nodes in `ids` the selection border, and take it from the rest. */
	setSelected(ids: ReadonlySet<string>): void {
		this.selected = ids;
		for (const [panelId, panel] of this.panels) {
			panel.box.classList.toggle("is-selected", ids.has(panelId));
			this.markResizable(panel);
		}
	}

	/** Give the panels of the find bar's matches in `ids` the find border, and take it from the rest. */
	setFound(ids: ReadonlySet<string>): void {
		this.found = ids;
		for (const [panelId, panel] of this.panels) panel.box.classList.toggle("is-found", ids.has(panelId));
	}

	/** Edit mode on or off: on, a selected line's panel shows its width handle. */
	setResizable(on: boolean): void {
		this.resizable = on;
		for (const panel of this.panels.values()) this.markResizable(panel);
	}

	private markResizable(panel: Panel): void {
		const { graph, id } = panel.node;
		panel.box.classList.toggle("is-resizable", this.resizable && this.selected.has(id) && graph.kind === "line" && graph.source !== undefined);
	}

	/**
	 * A press at client (`x`, `y`) on a selected panel's width handle (`slop`
	 * px of reach around it), when that panel is the one drawn on top there:
	 * the node, the panel's width in px before its scale, and how many screen px
	 * one of those is. Null when it is not on a handle.
	 */
	resizeStart(x: number, y: number, slop: number): { node: GraphNode; width: number; scale: number } | null {
		for (const panel of this.panels.values()) {
			if (panel.target !== 1 || !panel.rendered || panel.fade < 0.5 || panel.width <= 0 || !panel.box.classList.contains("is-resizable")) continue;
			const rect = panel.handle.getBoundingClientRect();
			if (x < rect.left - slop || x > rect.right + slop || y < rect.top - slop || y > rect.bottom + slop) continue;
			if (this.panelAt((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2) !== panel) continue;
			const scale = panel.box.getBoundingClientRect().width / panel.width;
			if (scale > 0) return { node: panel.node.graph, width: panel.width, scale };
		}
		return null;
	}

	/** Draw node `id`'s panel `width` px wide (before its scale), as a width drag goes; null ends the preview. Returns the width, kept above the narrowest. */
	setPreviewWidth(id: string, width: number | null): number | null {
		const panel = this.panels.get(id);
		if (panel === undefined) return width;
		const scale = textScale(panel.node.graph.style);
		panel.preview = width === null ? null : Math.max(width, styleWidthEm(MIN_STYLE_WIDTH_PX, scale) * NEAR_FONT_PX * scale);
		this.paint(panel);
		return panel.preview;
	}

	/** Mark node `id`'s panel as the drop target of a link drag (null clears it). */
	setLinkTarget(id: string | null): void {
		for (const [panelId, panel] of this.panels) panel.box.classList.toggle("is-link-target", panelId === id);
	}

	/** The link at client point (`x`, `y`) in the panel drawn on top there, if any. */
	linkAt(x: number, y: number): PanelLink | null {
		const panel = this.panelAt(x, y);
		if (panel === undefined) return null;
		for (const anchor of Array.from(panel.body.querySelectorAll("a"))) {
			// A link that wraps has a box per line.
			if (!Array.from(anchor.getClientRects()).some((rect) => rectContains(rect, x, y))) continue;
			const internal = anchor.classList.contains("internal-link");
			const href = (internal ? anchor.getAttribute("data-href") : null) ?? anchor.getAttribute("href");
			// Tags (`#tag`) and other in-page anchors aren't links to follow.
			if (href === null || href === "" || (!internal && !/^[a-z][a-z\d+.-]*:/i.test(href))) return null;
			return { node: panel.node.graph, href, external: !internal, sourcePath: panel.node.graph.path ?? "", text: anchor.textContent ?? "" };
		}
		return null;
	}

	/**
	 * The node whose task checkbox is at client point (`x`, `y`), in the panel
	 * drawn on top there. `slop` widens the box on every side, for a fingertip.
	 * Only a checkbox line's own box counts. A panel is inert, so the click is
	 * the scene's to turn into a toggle.
	 */
	checkboxAt(x: number, y: number, slop: number): { node: GraphNode } | null {
		const panel = this.panelAt(x, y);
		if (panel?.node.graph.source?.metadata?.checkbox !== true) return null;
		for (const box of Array.from(panel.body.querySelectorAll("input.task-list-item-checkbox"))) {
			const rect = box.getBoundingClientRect();
			if (rectContains({ left: rect.left - slop, top: rect.top - slop, right: rect.right + slop, bottom: rect.bottom + slop }, x, y)) return { node: panel.node.graph };
		}
		return null;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	/**
	 * Tilt panels onto their plates (Planets mode) or face them to the screen.
	 * A panel is one or the other for its life, so the open ones go at once
	 * and come back of the new kind, from the cache, as the tier picks them.
	 */
	setTilted(tilted: boolean): void {
		if (tilted === this.tilted) return;
		this.tilted = tilted;
		for (const panel of this.panels.values()) this.removePanel(panel);
		this.panels.clear();
	}

	/** Re-paint each open panel from its node's colour and style, after the colour mode or a style changes. */
	refreshColors(): void {
		// A reload carries a width drag's result: the preview has done its job.
		for (const panel of this.panels.values()) {
			panel.preview = null;
			this.paint(panel);
		}
	}

	/**
	 * The panel's plate look: the plate's corners, and its outline as an inset
	 * shadow (not a border, so the veil covers it as the mist does the plate's),
	 * in the node's colour or its style's border colour; a style's fill and text
	 * colour, or the stylesheet's theme colours (an empty value clears it).
	 */
	private paint(panel: Panel): void {
		const { look, color } = panel.node;
		// In ems of the unscaled text, as the plate's: the mind map's border is in px, whatever the text size.
		const stroke = ((look?.stroke ?? 1) * PLATE_STROKE_EM) / (look?.font.scale ?? 1);
		const topicShape = look?.shape ?? "rounded-rect";
		const dash = look?.dash ?? "solid";
		const bare = isBareShape(topicShape);
		// A shape (not a rectangle, underline or none) is drawn and clipped by its path, and its box is fitted round its text (`fitShape`).
		const shaped = !isRectShape(topicShape) && !bare;
		// A custom width is the panel's exact width; a code block fitting its lines caps it there; every other node keeps the stylesheet's 20em.
		const rule = panelWidthRule(panel.node.graph);
		const width: Record<string, string> =
			panel.preview !== null
				? { width: `${panel.preview}px`, minWidth: `${panel.preview}px`, maxWidth: `${panel.preview}px` }
				: {
					width: rule.kind === "custom" ? `${rule.em}em` : "",
					minWidth: `${panel.node.shape.width * this.pxPerUnit}px`,
					maxWidth: rule.kind === "default" && rule.em === PANEL_MAX_EM.width ? "" : `${rule.em}em`,
				};
		panel.radius = bare ? 0 : panel.node.shape.height * this.pxPerUnit * cornerOf(panel.node);
		const font = look?.font ?? DEFAULT_FONT;
		panel.box.setCssStyles({
			// Every em of the panel (its padding, widths and outline) is one of the node's text, so a bigger text is a bigger panel, as its plate is.
			fontSize: `${fontPx(panel.node)}px`,
			// A shape's width, height and padding are `fitShape`'s.
			...(shaped ? { minWidth: "", maxWidth: "none" } : { ...width, height: "", padding: "" }),
			minHeight: "",
			borderRadius: `${panel.radius}px`,
			boxShadow: stroke === 0 ? "none" : `inset 0 0 0 ${stroke}em ${look?.border ?? color.getStyle()}`,
			clipPath: "",
		});
		// A shape's text wraps where the mind map's does in the shape, narrower than the cap by the shape's insets
		// (`shapeWrapEm`); a custom width is the text's own, as the mind map stores it.
		const capEm = panel.preview !== null ? panel.preview / fontPx(panel.node) : rule.em;
		const textWidth: Record<string, string> = !shaped
			? { width: "", maxWidth: "" }
			: rule.kind === "custom" && panel.preview === null
				? { width: `${rule.em - 2 * PANEL_PAD_EM.x}em`, maxWidth: "" }
				: { width: "max-content", maxWidth: `${shapeWrapEm(topicShape, capEm, PANEL_PAD_EM.x)}em` };
		// The fill is under the box, in the lens's own space (see `createPanel`). A shape's is its path's;
		// underline and none have none of their own (the background), unless a none node's style fills it.
		const styleFill = look?.fill ?? null;
		const fill = bare ? (topicShape === "none" && styleFill !== null ? styleFill : "var(--background-primary)") : styleFill ?? "";
		panel.fill.setCssStyles({ backgroundColor: fill });
		panel.lens.classList.toggle("is-shaped", shaped);
		this.fitShape(panel);
		this.outline(panel, !isRectShape(topicShape) || dash !== "solid", {
			"--osmosis-near-fill": shaped ? styleFill ?? "var(--background-secondary)" : "none",
			"--osmosis-near-stroke": stroke === 0 ? "none" : look?.border ?? color.getStyle(),
			"--osmosis-near-stroke-width": `${2 * stroke}em`,
			"--osmosis-near-dash": dash === "solid" ? "none" : DASH_EM[dash].map((em) => `${em / (look?.font.scale ?? 1)}em`).join(" "),
		});
		this.sizeLens(panel);
		// On the rendered Markdown itself, as the mind map sets it. A family that isn't installed falls back to the theme's.
		panel.body.setCssStyles({
			...textWidth,
			color: look?.text ?? "",
			fontFamily: font.family === null ? "" : `"${font.family}", var(--font-text)`,
			fontWeight: font.weight === null ? "" : String(font.weight),
			fontStyle: font.italic ? "italic" : "",
			textAlign: font.align ?? "",
		});
	}

	/**
	 * Fit a shaped panel's box round its text as last measured: the mind map's
	 * box round its content, holding the plate under it (`fitShapedPanel`), its
	 * text padded into the shape's inner box. The text's width never depends on
	 * the box's (`paint` gives it its own), so this settles in one pass.
	 */
	private fitShape(panel: Panel): void {
		if (!panel.lens.classList.contains("is-shaped") || panel.textWidth <= 0) return;
		const px = fontPx(panel.node);
		const fit = fitShapedPanel(
			panel.node.look?.shape ?? "rounded-rect",
			{ width: panel.textWidth + 2 * PANEL_PAD_EM.x * px, height: panel.textHeight + 2 * PANEL_PAD_EM.y * px },
			{ width: panel.node.shape.width * this.pxPerUnit, height: panel.node.shape.height * this.pxPerUnit },
		);
		panel.box.setCssStyles({ width: `${fit.width}px`, height: `${fit.height}px`, padding: fit.padding.map((value) => `${value}px`).join(" ") });
	}

	/** Give the panel its SVG outline (`drawn`), styled by `props`, or take it away; `sizeLens` writes its path. */
	private outline(panel: Panel, drawn: boolean, props: Record<string, string>): void {
		panel.box.classList.toggle("is-outlined", drawn);
		panel.outlinePath = "";
		if (!drawn) {
			panel.outline?.ownerSVGElement?.remove();
			panel.outline = null;
			return;
		}
		panel.outline ??= panel.box.createSvg("svg", { cls: "osmosis-cosmos-near-shape" }).createSvg("path");
		panel.outline.setCssProps(props);
	}

	/** The view went into the background: nothing keeps playing there. */
	pauseMedia(): void {
		for (const panel of this.panels.values()) pauseMedia(panel.body);
	}

	destroy(): void {
		for (const panel of this.panels.values()) this.removePanel(panel);
		this.panels.clear();
		this.cache.clear();
		this.edit = null;
		this.sizes.disconnect();
		this.boxes.clear();
		this.sources = [];
		this.screenPlates = null;
		this.drawnPlates = [];
		this.edges.clear();
		this.edgeView = null;
		this.renderer.domElement.remove();
		this.renderer3d.domElement.remove();
	}

	private pxPerUnitAt1(camera: PerspectiveCamera): number {
		return this.renderer.getSize().height / (2 * Math.tan((camera.fov * Math.PI) / 360));
	}

	private createPanel(node: NearSource, markdown: string): Panel {
		const anchor = createDiv({ cls: "osmosis-cosmos-near-anchor" });
		// The fill is painted in the lens's own space before the box's content, so the box
		// (scaled by its raster scale, not composited) is drawn into the lens's layer at that
		// scale, and the lens's own transform is all the compositor scales. The mask is the
		// lens's and the fill a child, so a mask write leaves the layer's content alone.
		const lens = anchor.createDiv({ cls: "osmosis-cosmos-near-lens" });
		const fill = lens.createDiv({ cls: "osmosis-cosmos-near-fill" });
		const box = lens.createDiv({ cls: "osmosis-cosmos-near-panel" });
		box.classList.toggle("is-selected", this.selected.has(node.id));
		box.classList.toggle("is-found", this.found.has(node.id));
		const body = box.createDiv({ cls: "osmosis-cosmos-near-body markdown-rendered" });
		const veil = box.createDiv({ cls: "osmosis-cosmos-near-veil" });
		anchor.setCssStyles({ opacity: "0" });
		const object = this.tilted ? new CSS3DObject(anchor) : new CSS2DObject(anchor);
		if (this.tilted) {
			// Placed by its own matrix (`tilt`), and inert like the CSS2D panels (CSS3DObject turns pointer events on).
			object.matrixAutoUpdate = false;
			anchor.setCssStyles({ pointerEvents: "none" });
		}
		const handle = box.createDiv({ cls: "osmosis-cosmos-near-handle" });
		const panel: Panel = { object, tilted: this.tilted, lens, fill, box, body, veil, component: new Component(), markdown: "", node, rendered: false, fade: 0, target: 1, width: 0, height: 0, textWidth: 0, textHeight: 0, mask: "", raster: this.tilted ? 1 : 0, radius: 0, outline: null, outlinePath: "", shownFade: 0, lensTransform: "", veilOpacity: "", diagram: "", depth: Infinity, occluders: [], handle, preview: null };
		this.boxes.set(box, panel);
		this.boxes.set(body, panel);
		lens.classList.toggle("is-editing", node.id === this.editing);
		this.markResizable(panel);
		this.sizes.observe(box);
		this.sizes.observe(body);
		object.onBeforeRender = (_renderer, _scene, camera) => this.place(panel, camera);
		object.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
		this.group.add(object);
		this.fill(panel, markdown);
		return panel;
	}

	/**
	 * Lay a tilted panel on its plate this frame: centred on the node, along
	 * the plate's frame spun upright (the camera's, for a plate that has none: a planet's
	 * core, a star), world-sized, and hidden while the plate is seen from behind.
	 */
	private tilt(panel: Panel): void {
		const { node, object } = panel;
		object.matrix.fromArray(panelMatrix(object.position, this.plateFrame(node), this.pxPerUnit));
		object.matrixWorldNeedsUpdate = true;
		object.visible = showsText(object.position, node.frame?.normal, this.eye);
	}

	/** Scale the panel to its depth, cut out the plates in front of it and veil it by the mist, as the CSS2D renderer positions it. */
	private place(panel: Panel, camera: Camera): void {
		const stats = this.stats;
		if (stats === null) {
			this.placeOne(panel, camera);
			return;
		}
		const start = performance.now();
		this.placeOne(panel, camera);
		stats.placeMs += performance.now() - start;
	}

	private placeOne(panel: Panel, camera: Camera): void {
		if (panel.tilted) {
			this.placeTilted(panel, camera as PerspectiveCamera);
			return;
		}
		const point = this.point.copy(panel.object.position).applyMatrix4(camera.matrixWorldInverse);
		const depth = -point.z;
		const pxPerUnitAt1 = this.pxPerUnitAt1(camera as PerspectiveCamera);
		const scale = panelScale(depth, pxPerUnitAt1, this.pxPerUnit);
		// Stack by view depth, as the plates' depth buffer does. Left to itself the CSS2D
		// renderer stacks by straight-line distance to the camera, which puts a panel near
		// the screen's edge behind a farther one in the middle. It sorts by `renderOrder`
		// first (higher on top) after this runs, and WebGL ignores it on a CSS2DObject.
		panel.object.renderOrder = -depth;
		panel.depth = depth;
		// Re-raster only when the drawn scale leaves the band; otherwise the compositor shrinks the lens.
		const raster = rasterScale(panel.raster, scale);
		if (raster !== panel.raster) {
			panel.raster = raster;
			panel.box.setCssStyles({ transform: `scale(${raster})` });
			this.sizeLens(panel);
			if (this.stats !== null) this.stats.rasters++;
		}
		const shrink = panel.raster > 0 ? scale / panel.raster : scale;
		this.setLensTransform(panel, `translate(-50%, -50%) scale(${shrink})`);
		point.applyMatrix4(camera.projectionMatrix);
		const size = this.renderer.getSize();
		const plates = (this.screenPlates ??= this.drawnPlates = this.platesOnScreen(camera as PerspectiveCamera, pxPerUnitAt1));
		// Holes in the lens's px: the box's, times its raster scale.
		const screen = { id: panel.node.id, x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height, width: panel.width * panel.raster, height: panel.height * panel.raster, scale: shrink, depth };
		const holes = panelHoles(screen, plates);
		const strokes = facingStrokes(this.edges, this.viewEdges(camera), screen, { near: (camera as PerspectiveCamera).near, pxPerUnitAt1, viewportWidth: size.width, viewportHeight: size.height });
		this.cutHoles(panel, holes, shrink, strokes);
		this.setVeil(panel, 1 - plateVisibility(panel.node.opacity, depth, this.focus, this.density));
	}

	/** The lens is the box's size times its raster scale, and the fill has the box's corners: the fill and the mask's 100% are the box as drawn. */
	private sizeLens(panel: Panel): void {
		const raster = panel.raster;
		panel.lens.setCssStyles({
			width: panel.width > 0 ? `${panel.width * raster}px` : "",
			height: panel.height > 0 ? `${panel.height * raster}px` : "",
		});
		panel.fill.setCssStyles({ borderRadius: `${panel.radius * raster}px` });
		const outline = panel.outline;
		if (outline === null || panel.width <= 0 || panel.height <= 0) return;
		const topicShape = panel.node.look?.shape ?? "rounded-rect";
		const path = shapePath(topicShape, panel.width, panel.height, panel.radius);
		if (path === panel.outlinePath) return;
		panel.outlinePath = path;
		outline.setAttribute("d", path);
		// A shape clips its panel (text, veil and all) to its outline; a rectangle's corners already do.
		if (panel.lens.classList.contains("is-shaped")) panel.box.setCssStyles({ clipPath: `path("${path}")` });
	}

	private setLensTransform(panel: Panel, transform: string): void {
		if (transform === panel.lensTransform) return;
		panel.lensTransform = transform;
		panel.lens.setCssStyles({ transform });
		if (this.stats !== null) this.stats.transforms++;
	}

	private setVeil(panel: Panel, opacity: number): void {
		const value = String(opacity);
		if (value === panel.veilOpacity) return;
		panel.veilOpacity = value;
		panel.veil.setCssStyles({ opacity: value });
	}

	/**
	 * A tilted panel's frame, as the CSS3D renderer draws it (the panel's
	 * matrix is already set, by `tilt`): cut out the plates in front of it
	 * (`tiltedHole`) and veil it by the mist at its centre's depth. Panels
	 * stack among themselves in the CSS3D renderer's own 3D context.
	 */
	private placeTilted(panel: Panel, camera: PerspectiveCamera): void {
		const { node } = panel;
		const centre = panel.object.position;
		const depth = -this.point.copy(centre).applyMatrix4(camera.matrixWorldInverse).z;
		panel.depth = depth;
		this.setLensTransform(panel, "translate(-50%, -50%)");
		const pxPerUnitAt1 = this.pxPerUnitAt1(camera);
		const plates = (this.screenPlates ??= this.drawnPlates = this.platesOnScreen(camera, pxPerUnitAt1));
		const tilted: TiltedPanel = { centre, frame: this.plateFrame(node), width: panel.width, height: panel.height, pxPerUnit: this.pxPerUnit };
		const bounds = this.screenBounds(tilted, camera);
		const holes: PanelHole[] = [];
		panel.occluders = [];
		for (const plate of plates) {
			if (plate.id === node.id) continue;
			if (bounds !== null && (plate.x + plate.halfWidth < bounds.left || plate.x - plate.halfWidth > bounds.right || plate.y + plate.halfHeight < bounds.top || plate.y - plate.halfHeight > bounds.bottom)) continue;
			const hole = tiltedHole(tilted, this.eye, this.worldPlate(plate.node));
			if (hole === null) continue;
			holes.push(hole);
			panel.occluders.push(plate);
		}
		// The narrowest stroke, in the panel's px at its centre's depth.
		const minWidth = (MIN_STROKE_PX * this.pxPerUnit * depth) / pxPerUnitAt1;
		const size = this.renderer3d.getSize();
		const cull = bounds === null ? null : { view: this.viewEdges(camera), box: screenBox(bounds, { near: camera.near, pxPerUnitAt1, viewportWidth: size.width, viewportHeight: size.height }) };
		this.cutHoles(panel, holes, 1, depth > 0 ? tiltedStrokes(this.edges, tilted, node.id, this.eye, minWidth, cull) : []);
		this.setVeil(panel, 1 - plateVisibility(node.opacity, depth, this.focus, this.density));
	}

	/** Where a tilted panel lies on screen, in the stage's px: the box round its corners, or null when one is behind the camera. */
	private screenBounds(panel: TiltedPanel, camera: PerspectiveCamera): ScreenRect | null {
		const { width, height } = this.renderer3d.getSize();
		const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
		for (const [u, v] of [[0, 0], [panel.width, 0], [0, panel.height], [panel.width, panel.height]] as const) {
			const corner = panelPoint(panel, u, v);
			const point = this.platePoint.set(corner.x, corner.y, corner.z).applyMatrix4(camera.matrixWorldInverse);
			if (-point.z <= camera.near) return null;
			point.applyMatrix4(camera.projectionMatrix);
			const x = ((point.x + 1) / 2) * width;
			const y = ((1 - point.y) / 2) * height;
			bounds.left = Math.min(bounds.left, x);
			bounds.right = Math.max(bounds.right, x);
			bounds.top = Math.min(bounds.top, y);
			bounds.bottom = Math.max(bounds.bottom, y);
		}
		return bounds;
	}

	/**
	 * A plate's frame as drawn this frame: on a planet, its frame spun upright
	 * for the camera (as the plate shader spins it, `uprightFrame`); the
	 * camera's own frame for a plate that faces the camera.
	 */
	private plateFrame(node: NearSource): TangentFrame {
		return node.frame === undefined ? this.cameraFrame : uprightFrame(node.frame, { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 }, this.view);
	}

	/** A plate's centre and corners in the world: along its frame on a planet, facing the camera otherwise. */
	private worldPlate(node: NearSource): WorldPlate {
		const { right, up } = this.plateFrame(node);
		const halfWidth = node.shape.width / 2;
		const halfHeight = node.shape.height / 2;
		const centre = { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 };
		const corners = [-1, 1].flatMap((a) => [-1, 1].map((b) => ({
			x: centre.x + right.x * a * halfWidth + up.x * b * halfHeight,
			y: centre.y + right.y * a * halfWidth + up.y * b * halfHeight,
			z: centre.z + right.z * a * halfWidth + up.z * b * halfHeight,
		})));
		return { centre, corners, radius: cornerOf(node) };
	}

	/** This frame's edge segments in view space, worked out once for every panel. */
	private viewEdges(camera: Camera): Float32Array {
		if (!this.edgeViewFresh || this.edgeView === null) {
			this.edgeView = toView(this.edges, camera.matrixWorldInverse.elements, (camera as PerspectiveCamera).near, this.edgeView);
			this.edgeViewFresh = true;
		}
		return this.edgeView;
	}

	/** Mask `holes` and `strokes` (lens px, drawn at `scale`) out of the panel, writing only when one moved by about a step on screen. */
	private cutHoles(panel: Panel, holes: readonly PanelHole[], scale: number, strokes: readonly PanelStroke[]): void {
		const step = MASK_STEP_PX / scale;
		const off = this.masksOff;
		const mask = off ? null : holeMask(snapHoles(holes, step), snapStrokes(strokes, step));
		const key = mask === null ? "" : `${mask.image}|${mask.size}|${mask.position}`;
		if (key === panel.mask) return;
		panel.mask = key;
		if (this.stats !== null) {
			this.stats.masks++;
			if (mask !== null) this.stats.maskLayers += 1 + 6 * holes.length + strokes.length;
		}
		panel.lens.setCssStyles({ maskImage: mask?.image ?? "", maskSize: mask?.size ?? "", maskPosition: mask?.position ?? "", maskComposite: mask?.composite ?? "" });
	}

	/**
	 * Every plate drawn this frame, where it is on screen. A plate is drawn,
	 * and covers what is behind it, whenever it is placed and not faded right
	 * out, however far the mist or the focus dim has mixed it toward the
	 * background. Plates are drawn at their real depth, so this is where they land.
	 */
	private platesOnScreen(camera: PerspectiveCamera, pxPerUnitAt1: number): DrawnPlate[] {
		const plates: DrawnPlate[] = [];
		const { width, height } = this.renderer.getSize();
		const point = this.platePoint;
		for (const node of this.sources) {
			if (node.opacity <= 0 || node.x === undefined || node.y === undefined || node.z === undefined) continue;
			// A planet's plate seen from behind is drawn too (dimmed, the far side), so it covers a farther panel like any plate.
			point.set(node.x, node.y, node.z).applyMatrix4(camera.matrixWorldInverse);
			const depth = -point.z;
			if (depth <= camera.near) continue;
			const pxPerUnit = pxPerUnitAt1 / depth;
			const halfWidth = (node.shape.width / 2) * pxPerUnit;
			const halfHeight = (node.shape.height / 2) * pxPerUnit;
			point.applyMatrix4(camera.projectionMatrix);
			const x = ((point.x + 1) / 2) * width;
			const y = ((1 - point.y) / 2) * height;
			if (x + halfWidth < 0 || x - halfWidth > width || y + halfHeight < 0 || y - halfHeight > height) continue;
			plates.push({ id: node.id, node, x, y, halfWidth, halfHeight, radius: 2 * halfHeight * cornerOf(node), depth });
		}
		return plates;
	}

	/** Render `markdown` into the panel, from the cache when it can be. */
	private fill(panel: Panel, markdown: string): void {
		this.cacheBody(panel);
		panel.component.unload();
		panel.component = new Component();
		panel.component.load();
		panel.markdown = markdown;
		panel.body.empty();
		// Never smaller than the plate under it, with the same corners, outline and colours.
		const { shape } = panel.node;
		panel.box.setCssStyles({
			fontSize: `${fontPx(panel.node)}px`,
			minWidth: `${shape.width * this.pxPerUnit}px`,
			minHeight: `${shape.height * this.pxPerUnit}px`,
		});
		this.paint(panel);
		const sourcePath = panel.node.graph.path ?? "";
		const masks = panel.node.graph.masks;
		panel.diagram = "";
		if (masks !== undefined) {
			// An occlusion card under study: the diagram with its masks, drawn straight away. It
			// stays out of the cache (an image is never cached), and a rating repaints it in place.
			panel.diagram = diagramKey(masks.occlusion, masks.side);
			this.renderDiagram(panel.body, masks.occlusion, masks.side, sourcePath);
			panel.rendered = true;
			return;
		}
		const key = `${sourcePath}\n${markdown}`;
		const cached = this.cache.get(key);
		if (cached !== undefined) {
			// Most recently used last.
			this.cache.delete(key);
			this.cache.set(key, cached);
			for (const child of Array.from(cached.childNodes)) panel.body.appendChild(child.cloneNode(true));
			panel.rendered = true;
			return;
		}
		panel.rendered = false;
		const component = panel.component;
		this.render(markdown, panel.body, sourcePath, component).then(
			() => {
				// Gone, or refilled, while it rendered.
				if (component !== panel.component || panel.markdown !== markdown) return;
				panel.rendered = true;
			},
			(error: unknown) => console.error("Osmosis: Cosmos could not render a near panel", error),
		);
	}

	/** Another group asked, or the answer revealed: repaint the masks over the same image, which is never rebuilt, so it does not flash. */
	private repaintDiagram(panel: Panel): void {
		const masks = panel.node.graph.masks;
		if (masks === undefined) return;
		const key = diagramKey(masks.occlusion, masks.side);
		if (key === panel.diagram) return;
		panel.diagram = key;
		repaintOcclusion(panel.body, masks.occlusion, masks.side);
	}

	/**
	 * Keep a copy of a panel's rendered body, to clone if its node comes back.
	 * Media and embeds stay out: a clone carries neither their loading nor
	 * their players, and a detached video would still fetch.
	 */
	private cacheBody(panel: Panel): void {
		if (!panel.rendered || panel.markdown === "" || panel.body.querySelector("img, video, audio, iframe, .internal-embed") !== null) return;
		const key = `${panel.node.graph.path ?? ""}\n${panel.markdown}`;
		const copy = createDiv();
		for (const child of Array.from(panel.body.childNodes)) copy.appendChild(child.cloneNode(true));
		this.cache.delete(key);
		this.cache.set(key, copy);
		if (this.cache.size > NEAR_CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
	}

	private removePanel(panel: Panel): void {
		this.cacheBody(panel);
		releaseMedia(panel.body);
		panel.component.unload();
		this.sizes.unobserve(panel.box);
		this.sizes.unobserve(panel.body);
		this.boxes.delete(panel.box);
		this.boxes.delete(panel.body);
		// CSS2DObject removes its element from the page when it leaves the scene.
		this.group.remove(panel.object);
	}
}

/** What a painted diagram depends on: the group asked and the side shown. */
function diagramKey(occlusion: CardOcclusion, side: OcclusionSide): string {
	return `${occlusion.image}|${occlusion.target}|${side}`;
}

function pauseMedia(root: HTMLElement): void {
	for (const media of Array.from(root.querySelectorAll<HTMLMediaElement>(MEDIA))) media.pause();
}

/** Stop and unload every video and audio element, so a removed panel holds no decoder or buffered media. */
function releaseMedia(root: HTMLElement): void {
	for (const media of Array.from(root.querySelectorAll<HTMLMediaElement>(MEDIA))) {
		media.pause();
		media.removeAttribute("src");
		for (const source of Array.from(media.querySelectorAll("source"))) source.remove();
		media.load();
	}
}
