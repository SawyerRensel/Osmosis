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
 *   it would as a world object.
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
	private readonly point = new Vector3();

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
		camera.updateMatrixWorld();
		const pxPerUnitAt1 = this.pxPerUnitAt1(camera);
		const probes: NearProbe[] = [];
		const markdown = new Map<string, { node: NearSource; text: string }>();
		const point = this.point;
		for (const node of nodes) {
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

	/** The view went into the background: nothing keeps playing there. */
	pauseMedia(): void {
		for (const panel of this.panels.values()) pauseMedia(panel.body);
	}

	destroy(): void {
		for (const panel of this.panels.values()) this.removePanel(panel);
		this.panels.clear();
		this.cache.clear();
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
		const panel: Panel = { object, box, body, veil, component: new Component(), markdown: "", node, rendered: false, fade: 0, target: 1 };
		object.onBeforeRender = (_renderer, _scene, camera) => this.place(panel, camera);
		object.position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
		this.group.add(object);
		this.fill(panel, markdown);
		return panel;
	}

	/** Scale the panel to its depth and veil it by the mist, as the CSS2D renderer positions it. */
	private place(panel: Panel, camera: Camera): void {
		const depth = -this.point.copy(panel.object.position).applyMatrix4(camera.matrixWorldInverse).z;
		const scale = panelScale(depth, this.pxPerUnitAt1(camera as PerspectiveCamera), this.pxPerUnit);
		panel.box.setCssStyles({ transform: `translate(-50%, -50%) scale(${scale})` });
		panel.veil.setCssStyles({ opacity: String(1 - plateVisibility(panel.node.opacity, depth, this.focus, this.density)) });
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
