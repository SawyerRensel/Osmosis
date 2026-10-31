/**
 * The 3D graph's near tier: live Obsidian Markdown for the nearest nodes, in
 * CSS2D panels layered over their plates. See
 * `vault/Planner/3D Graph Phase 4 - Near tier.md`.
 *
 * - **Which nodes:** `chooseNear` (`../graph3d/lod.ts`) picks them each frame,
 *   with hysteresis at every boundary and a budget; `nearMarkdown`
 *   (`../graph3d/near.ts`) says what each one shows.
 * - **Sized like the plate:** a panel is laid out at a fixed text size and
 *   scaled each frame by its depth, so its text is the size of the plate text
 *   under it and it grows and shrinks with the world, never covering more than
 *   it would as a world object. Its largest size (`PANEL_MAX_EM`) is capped
 *   and the scene spaces nodes for it (`panelBoxEm`), so panels side by side
 *   leave their edges showing between them.
 * - **Stacked by depth:** a nearer panel covers a farther one, by view depth,
 *   and a plate nearer than a panel is cut out of it with a CSS mask
 *   (`../graph3d/occlusion.ts`), so the plate on the canvas shows through as
 *   if the panel were in the depth buffer too.
 * - **One mist:** a background-coloured veil over each panel mixes it toward
 *   the background exactly as the plate shader mixes the plate
 *   (`plateVisibility`), so the DOM and WebGL fade as one. A separate
 *   cross-fade on the whole panel eases it in and out of the tier over the
 *   plate, so entering or leaving never pops.
 * - **Lifecycle:** each panel renders into its own `Component`, unloaded when
 *   the panel goes. Video and audio pause the moment their node leaves the
 *   tier, and release their media when the panel is removed.
 */

import { Component, Platform } from "obsidian";
import { Group, Vector3, type Camera, type PerspectiveCamera } from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { GraphNode } from "../graph3d/model";
import { NEAR_BUDGET, NEAR_EXIT_SCALE, chooseNear, panelScale, type NearProbe } from "../graph3d/lod";
import { nearMarkdown } from "../graph3d/near";
import { plateVisibility } from "../graph3d/focus";
import { PLATE_HEIGHT_EM, PLATE_RADIUS } from "../graph3d/plates";
import { holeMask, panelHoles, type ScreenPlate } from "../graph3d/occlusion";
import { frontPanelAt, rectContains, type DrawnPanel } from "../graph3d/links";

/** A link under a click, in a near-tier panel. */
export interface PanelLink {
	/** The node whose panel holds the link. */
	node: GraphNode;
	/** The link target as written (`data-href` for internal links), and the note it is resolved from. */
	href: string;
	external: boolean;
	sourcePath: string;
}

/** Renders `markdown` into `el`, as `MarkdownRenderer.render` does, with `component` owning its children. */
export type NearMarkdownRenderer = (markdown: string, el: HTMLElement, sourcePath: string, component: Component) => Promise<void>;

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
}

/** Panel text size, in CSS px, before the per-frame scale. */
const NEAR_FONT_PX = 16;
/** Seconds for a panel to cross-fade in over its plate, or out. */
const NEAR_FADE_S = 0.25;
/** Rendered panels kept to clone on re-entry, like the mind map's HTML cache. */
const NEAR_CACHE_SIZE = 64;
const MEDIA = "video, audio";

interface Panel {
	object: CSS2DObject;
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
	/** The mask last written, to skip unchanged writes. */
	mask: string;
	/** View depth as last drawn. */
	depth: number;
}

export class Graph3DNear {
	/** Handed to 3d-force-graph as an extra renderer: it lays the panels over the canvas every frame. */
	readonly renderer = new CSS2DRenderer();
	/** The panels' scene objects; add it to the scene. */
	readonly group = new Group();
	private readonly panels = new Map<string, Panel>();
	private readonly cache = new Map<string, HTMLElement>();
	private readonly budget = Platform.isMobile ? NEAR_BUDGET.mobile : NEAR_BUDGET.desktop;
	/** Px of panel laid out per world unit: the panel's text matches the plate text under it. */
	private readonly pxPerUnit: number;
	private focus = 0;
	private density = 0;
	/** Off (the Overlays menu's labels on plates only), no panel is chosen and the open ones fade out. */
	private enabled = true;
	private readonly point = new Vector3();
	private readonly platePoint = new Vector3();
	/** This frame's nodes, and their plates on screen: worked out at the first panel drawn, with the render's camera. */
	private sources: readonly NearSource[] = [];
	private screenPlates: ScreenPlate[] | null = null;
	/** The plates of the last frame drawn, for clicks between frames. */
	private drawnPlates: ScreenPlate[] = [];
	private readonly boxes = new Map<Element, Panel>();
	private readonly sizes = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const panel = this.boxes.get(entry.target);
			const size = entry.borderBoxSize[0];
			if (panel === undefined || size === undefined) continue;
			panel.width = size.inlineSize;
			panel.height = size.blockSize;
		}
	});

	/** `lineEmWorld` is how many world units one em of plate text is. */
	constructor(private readonly render: NearMarkdownRenderer, lineEmWorld: number) {
		this.pxPerUnit = NEAR_FONT_PX / lineEmWorld;
		this.renderer.domElement.addClass("osmosis-graph3d-near");
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
		camera.updateMatrixWorld();
		const pxPerUnitAt1 = this.pxPerUnitAt1(camera);
		const probes: NearProbe[] = [];
		const markdown = new Map<string, { node: NearSource; text: string }>();
		const point = this.point;
		for (const node of this.enabled ? nodes : []) {
			if (node.departing || node.x === undefined || node.y === undefined || node.z === undefined) continue;
			point.set(node.x, node.y, node.z).applyMatrix4(camera.matrixWorldInverse);
			const depth = -point.z;
			const scale = panelScale(depth, pxPerUnitAt1, this.pxPerUnit);
			// Most nodes are far: skip them before anything costlier.
			if (scale < NEAR_EXIT_SCALE) continue;
			const text = nearMarkdown(node.graph);
			if (text === null) continue;
			point.applyMatrix4(camera.projectionMatrix);
			probes.push({ id: node.id, depth, scale, x: point.x, y: point.y, visibility: plateVisibility(node.opacity, depth, focus, density) });
			markdown.set(node.id, { node, text });
		}
		const current = new Set<string>();
		for (const [id, panel] of this.panels) if (panel.target === 1) current.add(id);
		const near = chooseNear(probes, current, this.budget);

		for (const id of near) {
			const { node, text } = markdown.get(id)!;
			const panel = this.panels.get(id);
			if (panel === undefined) this.panels.set(id, this.createPanel(node, text));
			else {
				panel.node = node;
				panel.target = 1;
				if (panel.markdown !== text) this.fill(panel, text);
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
			panel.object.element.setCssStyles({ opacity: String(panel.fade) });
		}
	}

	/**
	 * The link at client point (`x`, `y`) in the panel drawn on top there, if
	 * any. Panels never take the pointer, so this hit-tests them as drawn: a
	 * nearer panel covers a farther one, and a nearer plate is cut out of both.
	 */
	linkAt(x: number, y: number): PanelLink | null {
		const origin = this.renderer.domElement.getBoundingClientRect();
		const drawn: DrawnPanel[] = [];
		const byId = new Map<string, Panel>();
		for (const panel of this.panels.values()) {
			if (panel.target !== 1 || !panel.rendered || panel.fade === 0) continue;
			const rect = panel.box.getBoundingClientRect();
			drawn.push({ id: panel.node.id, rect: { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top }, depth: panel.depth });
			byId.set(panel.node.id, panel);
		}
		const front = frontPanelAt(x - origin.left, y - origin.top, drawn, this.drawnPlates);
		const panel = front === null ? undefined : byId.get(front);
		if (panel === undefined) return null;
		for (const anchor of Array.from(panel.body.querySelectorAll("a"))) {
			// A link that wraps has a box per line.
			if (!Array.from(anchor.getClientRects()).some((rect) => rectContains(rect, x, y))) continue;
			const internal = anchor.classList.contains("internal-link");
			const href = (internal ? anchor.getAttribute("data-href") : null) ?? anchor.getAttribute("href");
			// Tags (`#tag`) and other in-page anchors aren't links to follow.
			if (href === null || href === "" || (!internal && !/^[a-z][a-z\d+.-]*:/i.test(href))) return null;
			return { node: panel.node.graph, href, external: !internal, sourcePath: panel.node.graph.path ?? "" };
		}
		return null;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	/** Re-draw each open panel's outline in its node's colour, after the colour mode changes. */
	refreshColors(): void {
		for (const panel of this.panels.values()) panel.box.setCssStyles({ boxShadow: `inset 0 0 0 0.07em ${panel.node.color.getStyle()}` });
	}

	/** The view went into the background: nothing keeps playing there. */
	pauseMedia(): void {
		for (const panel of this.panels.values()) pauseMedia(panel.body);
	}

	destroy(): void {
		for (const panel of this.panels.values()) this.removePanel(panel);
		this.panels.clear();
		this.cache.clear();
		this.sizes.disconnect();
		this.boxes.clear();
		this.sources = [];
		this.screenPlates = null;
		this.drawnPlates = [];
		this.renderer.domElement.remove();
	}

	private pxPerUnitAt1(camera: PerspectiveCamera): number {
		return this.renderer.getSize().height / (2 * Math.tan((camera.fov * Math.PI) / 360));
	}

	private createPanel(node: NearSource, markdown: string): Panel {
		const anchor = createDiv({ cls: "osmosis-graph3d-near-anchor" });
		const box = anchor.createDiv({ cls: "osmosis-graph3d-near-panel" });
		const body = box.createDiv({ cls: "osmosis-graph3d-near-body markdown-rendered" });
		const veil = box.createDiv({ cls: "osmosis-graph3d-near-veil" });
		anchor.setCssStyles({ opacity: "0" });
		const object = new CSS2DObject(anchor);
		const panel: Panel = { object, box, body, veil, component: new Component(), markdown: "", node, rendered: false, fade: 0, target: 1, width: 0, height: 0, mask: "", depth: Infinity };
		this.boxes.set(box, panel);
		this.sizes.observe(box);
		object.onBeforeRender = (_renderer, _scene, camera) => this.place(panel, camera);
		object.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
		this.group.add(object);
		this.fill(panel, markdown);
		return panel;
	}

	/** Scale the panel to its depth, cut out the plates in front of it and veil it by the mist, as the CSS2D renderer positions it. */
	private place(panel: Panel, camera: Camera): void {
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
		panel.box.setCssStyles({ transform: `translate(-50%, -50%) scale(${scale})` });
		point.applyMatrix4(camera.projectionMatrix);
		const size = this.renderer.getSize();
		const plates = (this.screenPlates ??= this.drawnPlates = this.platesOnScreen(camera as PerspectiveCamera, pxPerUnitAt1));
		const holes = panelHoles(
			{ id: panel.node.id, x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height, width: panel.width, height: panel.height, scale, depth },
			plates,
		);
		const mask = holeMask(holes);
		const key = mask === null ? "" : `${mask.image}|${mask.size}|${mask.position}`;
		if (key !== panel.mask) {
			panel.mask = key;
			panel.box.setCssStyles({ maskImage: mask?.image ?? "", maskSize: mask?.size ?? "", maskPosition: mask?.position ?? "", maskComposite: mask?.composite ?? "" });
		}
		panel.veil.setCssStyles({ opacity: String(1 - plateVisibility(panel.node.opacity, depth, this.focus, this.density)) });
	}

	/**
	 * Every plate drawn this frame, where it is on screen. A plate is drawn,
	 * and covers what is behind it, whenever it is placed and not faded right
	 * out, however far the mist or the focus dim has mixed it toward the
	 * background. Plates are pulled toward the camera (`PLATE_PULL`) but scaled
	 * to keep their size on screen, so this is where they land.
	 */
	private platesOnScreen(camera: PerspectiveCamera, pxPerUnitAt1: number): ScreenPlate[] {
		const plates: ScreenPlate[] = [];
		const { width, height } = this.renderer.getSize();
		const point = this.platePoint;
		for (const node of this.sources) {
			if (node.opacity <= 0 || node.x === undefined || node.y === undefined || node.z === undefined) continue;
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
			plates.push({ id: node.id, x, y, halfWidth, halfHeight, radius: 2 * halfHeight * PLATE_RADIUS, depth });
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
		// Never smaller than the plate under it, with the same corners and outline. The
		// outline is an inset shadow, not a border, so the veil covers it as the mist does the plate's.
		const { shape, color } = panel.node;
		const plateHeight = shape.height * this.pxPerUnit;
		panel.box.setCssStyles({
			fontSize: `${NEAR_FONT_PX}px`,
			minWidth: `${shape.width * this.pxPerUnit}px`,
			minHeight: `${plateHeight}px`,
			borderRadius: `${plateHeight * PLATE_RADIUS}px`,
			boxShadow: `inset 0 0 0 0.07em ${color.getStyle()}`,
		});
		const sourcePath = panel.node.graph.path ?? "";
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
			(error: unknown) => console.error("Osmosis: 3D graph could not render a near panel", error),
		);
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
		this.boxes.delete(panel.box);
		// CSS2DObject removes its element from the page when it leaves the scene.
		this.group.remove(panel.object);
	}
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
