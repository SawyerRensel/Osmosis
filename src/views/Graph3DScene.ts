/**
 * The 3D graph's engine: a `3d-force-graph` mount plus our tiers, mist, theme
 * and free flight. Everything that touches Three.js lives here, and
 * `Graph3DView` loads this module with a dynamic `import()`, so Three.js is not
 * evaluated at plugin startup, only when a 3D graph view first opens.
 */

import { Platform } from "obsidian";
import ForceGraph3D, { type ForceGraph3DInstance, type LinkObject, type NodeObject } from "3d-force-graph";
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	DynamicDrawUsage,
	FogExp2,
	LineBasicMaterial,
	LineSegments,
	Points,
	PointsMaterial,
	Raycaster,
	Vector2,
	Vector3,
	type Material,
	type PerspectiveCamera,
	type Ray,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Graph3DPerf } from "./Graph3DPerf";
import { Graph3DSticks } from "./Graph3DSticks";
import { Graph3DPlates, type PlateShape } from "./Graph3DPlates";
import { Graph3DNear, type NearMarkdownRenderer, type PanelLink } from "./Graph3DNear";
import type { GraphEdgeKind, GraphModel, GraphNode } from "../graph3d/model";
import { edgeColor, linkDistance, nodeColor, nodeExtent, noteHue, spriteLabel } from "../graph3d/appearance";
import { DEFAULT_OVERLAYS, edgeShown, linkStrengthScale, type Graph3DOverlays } from "../graph3d/overlays";
import { panelBoxEm } from "../graph3d/near";
import { rotateAboutPivot } from "../graph3d/pivot";
import { dollyDistance, pickNode, wheelLogZoom, wheelNotches, type ScreenNode } from "../graph3d/depth";
import type { Placed } from "../graph3d/positions";
import { chargeStrengths } from "../graph3d/settle";
import { FOCUS_DIM_GLSL } from "../graph3d/focus";
import { flightPose, startFlight, type Flight, type Vec3 } from "../graph3d/flight";
import { linkClickAction, type LinkClick } from "../graph3d/links";
import { threadSegments } from "../graph3d/trails";
import { flightAxes, stickLook, stickMove, type FlightAxes } from "../graph3d/joysticks";
import {
	MAX_FRAME_MS,
	PAN_FRICTION,
	PAN_MIN_VELOCITY,
	ZOOM_FRICTION,
	ZOOM_MIN_VELOCITY,
	estimateVelocity,
	integrateDecay,
	launchVelocity,
	pruneSamples,
	type Sample,
	type Vec,
} from "../mindmap-inertia";
import type { Graph3DDesktopPivot, Graph3DTouchDrag } from "../settings";

interface EngineNode extends NodeObject {
	id: string;
	graph: GraphNode;
	/** Plate outline colour. */
	color: Color;
	/** 0–1: fading in on arrival, out on departure. */
	opacity: number;
	fade?: { from: number; to: number; start: number };
	/** Left the loaded area: fading out, then dropped from the graph data. */
	departing: boolean;
	/** The node's label plate, which is how the node is drawn. */
	shape: PlateShape;
	/** How far the node reaches for spacing: its plate or its near-tier panel, whichever is bigger (`nodeExtent`). */
	extent: number;
}

interface EngineLink extends LinkObject<EngineNode> {
	kind: GraphEdgeKind;
	/** 0–1: where along the edge its particle starts, so particles don't march in step. */
	phase: number;
}

/** d3's link force, as much of it as the scene sets. */
interface LinkForce {
	distance(distance: (link: EngineLink) => number): unknown;
	strength(strength: (link: EngineLink) => number): unknown;
}

/** A link end's node ID, before or after the engine swaps the node object in. */
function endId(end: EngineLink["source"]): string {
	return typeof end === "object" && end !== null ? end.id : String(end);
}

/**
 * Patch a line or point material to dim with the focus as the plates do. They
 * blend over the background, so fading their alpha is the same mix toward it;
 * each fragment uses its own depth. `round` cuts square points into discs.
 */
function dimWithFocus(material: Material, focus: { value: number }, round = false): void {
	// three.js keys compiled programs by this function's source, which `round` doesn't change.
	material.customProgramCacheKey = () => (round ? "osmosis-focus-round" : "osmosis-focus");
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uFocus = focus;
		shader.vertexShader = shader.vertexShader
			.replace("void main() {", "varying float vFocusDepth;\nvoid main() {")
			.replace("#include <fog_vertex>", "#include <fog_vertex>\nvFocusDepth = -mvPosition.z;");
		shader.fragmentShader = shader.fragmentShader
			.replace("void main() {", `varying float vFocusDepth;\n${FOCUS_DIM_GLSL}\nvoid main() {${round ? "\nif (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;" : ""}`)
			.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= 1.0 - focusDim(vFocusDepth);");
	};
}

/** A link's rest length from its kind and the plates or panels at its ends (d3 has resolved both ends to nodes by then). */
function plateLinkDistance(link: EngineLink): number {
	const [source, target] = [link.source as EngineNode, link.target as EngineNode];
	return linkDistance(link.kind, source.extent, target.extent);
}

/** A node's spacing extent, from its plate and the panel the near tier would lay out for it (at line-plate text size, as `Graph3DNear` does). */
function extentFor(node: EngineNode): number {
	return nodeExtent(node.shape, panelBoxEm(node.graph), Graph3DNear.emWorld(LINE_PLATE_HEIGHT));
}

/** d3's many-body force, as much of it as the scene wraps. */
interface ManyBodyForce {
	(alpha: number): void;
	initialize(nodes: EngineNode[], ...args: unknown[]): void;
	strength(strength: (node: EngineNode) => number): unknown;
}

export interface SceneTheme {
	background: string;
	text: string;
	/** Label plate fill. */
	plate: string;
	/** Label font family. */
	font: string;
}

export interface SceneControls {
	desktopPivot: Graph3DDesktopPivot;
	touchDrag: Graph3DTouchDrag;
}

/** The Overlays menu's options the engine applies; the colour mode reaches it as `setColoring`. */
export type SceneOverlays = Omit<Graph3DOverlays, "colorBy">;

export interface SceneOptions {
	controls: SceneControls;
	overlays: SceneOverlays;
	onNodeClick: (node: GraphNode) => void;
	/** A click on a link in a near-tier panel that fires (see `linkClickAction`). */
	onLinkClick: (link: PanelLink, action: Exclude<LinkClick, "none" | "hop">) => void;
	/** Renders a near-tier panel's Markdown (`MarkdownRenderer.render`, from the view, which has the app). */
	renderMarkdown: NearMarkdownRenderer;
	/** Whether the walk and fly joysticks start shown, and where a toggle goes to be remembered. */
	sticks: boolean;
	onSticksToggle: (shown: boolean) => void;
}

/** A rotating drag in progress: one mouse button or one finger. */
interface RotateDrag {
	pointerId: number;
	touch: boolean;
	x: number;
	y: number;
	/** What the drag orbits, chosen when it began. */
	pivot: Vector3;
	/** Turn the camera in place instead of orbiting. Once set, it holds until the drag ends. */
	look: boolean;
}

/** Two fingers zooming and panning together. */
interface Pinch {
	ids: [number, number];
	/** The midpoint between the fingers, in client px. */
	x: number;
	y: number;
	spread: number;
	/** ln(zoom) so far, for the zoom velocity. */
	zoomed: number;
	/** How far ahead the zoom is aimed; a pan moves the world at this depth with the fingers. */
	depth: number;
}

/**
 * Mist density is this over the camera's distance to its orbit target, so the
 * mist thins as you zoom out and a whole graph can be framed without fading
 * to black. Below the minimum distance it holds steady (≈ 0.0017).
 */
const MIST = 0.25;
const MIST_MIN_DISTANCE = 150;
/** Drag rotation in radians per pixel is this over the canvas height (OrbitControls' own rate). */
const ORBIT_RATE = 2 * Math.PI;
/** Looking around turns slower than orbiting, or a small drag swings the whole view. */
const LOOK_RATE = Math.PI;
/** How far from a node's edge, in screen px, a press or a zoom still aims at that node. */
const PICK_SLOP_PX = { mouse: 16, touch: 32 };
/** The orbit target stays at least this far ahead, so a zoom that passes through it keeps going. */
const MIN_DEPTH = 10;
/** Seconds for the mist to settle when the zoom re-aims at a nearer or farther depth, so it doesn't pop. */
const MIST_EASE = 0.25;
/** Each wheel notch while flying multiplies the flight speed by this, up to the limit either way. */
const FLIGHT_SCALE_STEP = 1.25;
const FLIGHT_SCALE_LIMIT = 8;
const SPEED_READOUT_MS = 1200;
/** Plate heights in world units: note titles, and every other label. */
const CORE_PLATE_HEIGHT = 10;
const LINE_PLATE_HEIGHT = 5;
/** Widest plate text, in ems, before it is cut with an ellipsis. */
const CORE_PLATE_MAX_EM = 30;
const LINE_PLATE_MAX_EM = 20;
/**
 * The camera's near plane. 3d-force-graph's 0.1 leaves too little depth
 * precision for opaque plates to order by depth at a distance; nothing is
 * looked at closer than this anyway (the orbit target stays `MIN_DEPTH` ahead).
 */
const CAMERA_NEAR = 1;
/** Flight speed as a fraction of the camera's distance to its orbit target, per second. */
const FLIGHT_SPEED = 0.9;
const FLIGHT_MIN_SPEED = 40;
const FLIGHT_MS = 1000;
/** Ticks after new data before the layout has spread out enough to aim at. */
const SETTLE_TICKS = 80;
/** d3's default many-body strength; see `settle.ts` for which nodes it acts on. */
const CHARGE = -30;
const FADE_MS = 500;
const LINK_OPACITY = 0.45;
/** Link particles: world units a second, and their size in world units (a line plate is 5 tall). */
const PARTICLE_SPEED = 25;
const PARTICLE_SIZE = 1.6;
const PARTICLE_OPACITY = 0.9;
/** The travelled thread of a due-driven study path: warm, and fully opaque, so it stands out from the edges. */
const THREAD_COLOR = "#ffb347";
/** Bloom: strength, radius, and the luminance a pixel needs before it glows. */
const BLOOM = { strength: 0.8, radius: 0.5, threshold: 0.6 };
/** A press that moves less than this, in px, is a click rather than a drag. */
const CLICK_SLOP_PX = 6;

/**
 * Flight speed multiplier, set with the wheel while flying. Like Unreal's
 * camera speed it outlasts the drag, and every 3D graph view shares it until
 * Obsidian restarts.
 */
let flightScale = 1;

/** Flight keys and the camera-space direction each one moves. */
export const FLIGHT_KEYS: Record<string, FlightAxes> = {
	w: [0, 0, 1],
	s: [0, 0, -1],
	a: [-1, 0, 0],
	d: [1, 0, 0],
	q: [0, -1, 0],
	e: [0, 1, 0],
};

export class Graph3DScene {
	private readonly graph: ForceGraph3DInstance<EngineNode, EngineLink>;
	private readonly fog: FogExp2;
	private nodes: EngineNode[] = [];
	private links: EngineLink[] = [];
	private readonly linkForce: LinkForce | undefined;
	/** Many-body strength per node; nodes not in it are left out of the force. */
	private charge = new Map<string, number>();
	private readonly plates: Graph3DPlates;
	/** Live Markdown panels over the nearest plates. */
	private readonly near: Graph3DNear;
	private readonly edges: LineSegments<BufferGeometry, LineBasicMaterial>;
	/** The study path's thread, and the nodes it runs through (null: a stop not loaded now). */
	private readonly thread: LineSegments<BufferGeometry, LineBasicMaterial>;
	private threadIds: readonly (string | null)[] = [];
	private readonly edgeColors = new Map<GraphEdgeKind, Color>();
	/** One particle per drawn edge, when the overlay is on. */
	private readonly particles: Points<BufferGeometry, PointsMaterial>;
	private overlays: SceneOverlays = DEFAULT_OVERLAYS;
	/** Node colour in the active colour mode (the Overlays menu's "Colour by"). */
	private colorOf: (node: GraphNode) => string = nodeColor;
	/** Links per node, for d3's default link strength, which the force balance scales. */
	private degree = new Map<string, number>();
	/** Bloom's post-processing passes, while bloom is on. */
	private bloomPasses: (UnrealBloomPass | OutputPass)[] = [];
	/** Node positions or opacities changed since the plates and edges were last written. */
	private dirty = false;
	/** Nodes came, went, or changed text or colour: every plate attribute must be rewritten. */
	private layoutDirty = false;
	/** A left-button or one-finger press that may yet be a click. */
	private press: { pointerId: number; x: number; y: number; touch: boolean } | null = null;
	private hover: { x: number; y: number } | null = null;
	private theme: SceneTheme = { background: "#000000", text: "#ffffff", plate: "#202020", font: "sans-serif" };
	private frame = 0;
	private lastFrame = 0;
	private paused = false;
	private pendingFlight: string | null = null;
	private pendingFlightWaits = false;
	/** The node last flown to: the focused node, whose links (and its neighbours') fire on a click. */
	private focusId: string | null = null;
	/** The flight under way, aimed at its node wherever the node is now. */
	private flight: { node: EngineNode; flight: Flight } | null = null;
	/** After a flight, the camera moves with its node until the node settles, or the user takes over. */
	private follow: { node: EngineNode; at: Vec3 } | null = null;
	private ticksSinceData = 0;
	private controlSettings: SceneControls;
	private drag: RotateDrag | null = null;
	private pinch: Pinch | null = null;
	private readonly touches = new Map<number, { x: number; y: number }>();
	/** Distance from the camera of the last point aimed at; a press or zoom over empty space reuses it. */
	private lastDepth: number | null = null;
	/** Touch momentum: finger positions (or the pinch midpoint) and ln(zoom), for the release velocity. */
	private samples: Sample[] = [];
	private zoomSamples: Sample[] = [];
	private orbitCoast: { drag: RotateDrag; velocity: Vec } | null = null;
	private panCoast: { depth: number; velocity: Vec } | null = null;
	private zoomCoast: { x: number; y: number; velocity: number } | null = null;
	/** The orbit coast a touch interrupted, which a flick that follows adds to. */
	private carry: Vec = { x: 0, y: 0 };
	private touchDownAt = 0;
	/** The touch now down stopped a coast, and so is not also a tap that hops. */
	private stoppedCoastOnDown = false;
	private readonly speedEl: HTMLElement;
	private readonly perf: Graph3DPerf;
	private readonly sticks: Graph3DSticks;
	private speedTimer = 0;
	readonly heldKeys = new Set<string>();

	constructor(private readonly container: HTMLElement, private readonly options: SceneOptions) {
		// The near tier's CSS2D renderer has to be handed over at construction:
		// the engine sizes it and draws it after the canvas every frame.
		this.near = new Graph3DNear(options.renderMarkdown, Graph3DNear.emWorld(LINE_PLATE_HEIGHT));
		this.graph = new ForceGraph3D(container, {
			controlType: "orbit",
			// CSS2DRenderer is a renderer by shape, not by type.
			extraRenderers: [this.near.renderer as never],
		}) as unknown as ForceGraph3DInstance<EngineNode, EngineLink>;
		const camera = this.graph.camera() as PerspectiveCamera;
		camera.near = CAMERA_NEAR;
		camera.updateProjectionMatrix();
		this.fog = new FogExp2(0x000000, MIST / MIST_MIN_DISTANCE);
		this.graph.scene().fog = this.fog;

		// Rotation, wheel zoom and every touch gesture are ours (see
		// onPointerDown): OrbitControls can only orbit and zoom toward its own
		// target. It keeps middle-drag zoom and right-drag pan.
		const controls = this.orbitControls();
		controls.enableRotate = false;
		// With no touch modes, OrbitControls ignores fingers entirely. With
		// rotation merely disabled, lifting one finger of a pinch leaves it
		// mid-pinch with one pointer, and it throws on every move.
		controls.touches.ONE = null;
		controls.touches.TWO = null;
		this.controlSettings = options.controls;
		const canvas = this.graph.renderer().domElement;
		canvas.addEventListener("pointerdown", this.onPointerDown);
		window.addEventListener("pointermove", this.onPointerMove);
		window.addEventListener("pointerup", this.onPointerUp);
		window.addEventListener("pointercancel", this.onPointerUp);
		// Capture phase, so it runs before OrbitControls' wheel listener on the canvas and can stop it.
		container.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
		// The bottom-right corner: the joystick toggle, and the flight speed beside it.
		const corner = container.createDiv({ cls: "osmosis-graph3d-corner" });
		this.speedEl = corner.createDiv({ cls: "osmosis-graph3d-speed" });
		this.sticks = new Graph3DSticks(container, corner, options.sticks, options.onSticksToggle);

		// Links are measured between plate edges, not centres, so wide labels
		// don't pile up around their parent. d3 caches each link's distance when
		// the data changes; setTheme re-applies it when plates are re-measured.
		this.linkForce = this.graph.d3Force("link") as LinkForce | undefined;
		this.linkForce?.distance(plateLinkDistance);
		this.linkForce?.strength(this.linkStrength);
		// Settled nodes are pinned, and the many-body force skips most of them
		// (see settle.ts), which is what keeps a tick cheap in a large world.
		const charge = this.graph.d3Force("charge") as ManyBodyForce;
		charge.strength((node) => this.charge.get(node.id) ?? 0);
		const settleCharge = Object.assign((alpha: number) => charge(alpha), {
			initialize: (nodes: EngineNode[], ...args: unknown[]) => charge.initialize(nodes.filter((n) => this.charge.has(n.id)), ...args),
		});
		this.graph.d3Force("charge", settleCharge as never);
		// Centring shifts every free node each tick to keep the mean at the
		// origin, so arrivals would drift against a pinned world.
		this.graph.d3Force("center", null);

		// The engine only simulates. Plates and edges are drawn here, instanced
		// and merged: drawn one object each, 6,826 nodes took 13,652 draw calls.
		// Clicks are picked here too (see nodeNear).
		this.graph
			.showNavInfo(false)
			.nodeVisibility(false)
			.linkVisibility(false)
			.enablePointerInteraction(false)
			.onEngineTick(() => {
				this.ticksSinceData++;
				this.dirty = true;
			})
			.onEngineStop(() => this.settle());

		this.plates = new Graph3DPlates(this.theme);
		const edgeMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
		// Edges dim with the plates.
		dimWithFocus(edgeMaterial, this.plates.focus);
		this.edges = new LineSegments(new BufferGeometry(), edgeMaterial);
		this.edges.frustumCulled = false;
		this.thread = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: THREAD_COLOR, transparent: true, depthWrite: false }));
		this.thread.frustumCulled = false;
		const particleMaterial = new PointsMaterial({ size: PARTICLE_SIZE, vertexColors: true, transparent: true, depthWrite: false });
		dimWithFocus(particleMaterial, this.plates.focus, true);
		this.particles = new Points(new BufferGeometry(), particleMaterial);
		this.particles.frustumCulled = false;
		this.particles.visible = false;
		// Plates are opaque and write depth, so an edge behind a plate is hidden by it.
		this.graph.scene().add(this.edges, this.thread, this.particles, this.plates.group, this.near.group);
		this.perf = new Graph3DPerf(container, this.graph.renderer(), this.plates);
		this.setOverlays(options.overlays);

		this.frame = window.requestAnimationFrame(this.tick);
	}

	/**
	 * Show a new model. Nodes already on screen keep their engine objects, and
	 * with them their positions. New ones start where `placement` puts them
	 * (see `placeNodes`), and fade in.
	 * Nodes that left fade out, with their edges, before they're dropped.
	 */
	setData(model: GraphModel, placement: ReadonlyMap<string, Placed>): void {
		const now = performance.now();
		let plated = 0;
		const previous = new Map(this.nodes.map((node) => [node.id, node]));
		this.nodes = model.nodes.map((graph) => {
			const existing = previous.get(graph.id);
			if (existing === undefined) {
				const node = this.createNode(graph, placement.get(graph.id));
				this.fadeTo(node, 1, now);
				plated++;
				return node;
			}
			previous.delete(graph.id);
			const relabel = this.labelText(existing.graph) !== this.labelText(graph) || existing.graph.kind !== graph.kind;
			existing.graph = graph;
			existing.color.setStyle(this.colorOf(graph));
			if (relabel) {
				existing.shape = this.shapeFor(graph);
				plated++;
			}
			existing.extent = extentFor(existing);
			if (existing.departing) {
				existing.departing = false;
				this.fadeTo(existing, 1, now);
			}
			return existing;
		});
		for (const left of previous.values()) {
			if (left.opacity <= 0) continue;
			left.departing = true;
			this.fadeTo(left, 0, now);
			this.nodes.push(left);
		}

		const ids = new Set(this.nodes.map((node) => node.id));
		if (this.flight !== null && !ids.has(this.flight.node.id)) this.flight = null;
		if (this.follow !== null && !ids.has(this.follow.node.id)) this.follow = null;
		const lingering = this.links.filter((link) => {
			const [source, target] = [link.source as EngineNode, link.target as EngineNode];
			return (source.departing || target.departing) && ids.has(source.id) && ids.has(target.id);
		});
		this.links = [
			...model.edges.map((edge) => ({ kind: edge.kind, source: edge.source, target: edge.target, phase: noteHue(`${edge.source}>${edge.target}`) / 360 })),
			...lingering,
		];
		this.ticksSinceData = 0;
		this.pushData();
		this.perf.plated(plated, performance.now() - now);
	}

	/** Where every node in the scene is now, for placing the next model around it. */
	positions(): Map<string, Placed> {
		const positions = new Map<string, Placed>();
		for (const node of this.nodes) {
			if (node.x === undefined || node.y === undefined || node.z === undefined) continue;
			positions.set(node.id, { x: node.x, y: node.y, z: node.z, pinned: node.fx !== undefined });
		}
		return positions;
	}

	/**
	 * Draw a thread through these nodes, in order: a segment between each
	 * consecutive pair that are both in the scene. A `null` is a stop that is
	 * not loaded, and breaks the thread there. It follows the nodes as they move.
	 */
	setThread(ids: readonly (string | null)[]): void {
		this.threadIds = ids;
		this.dirty = true;
	}

	/** Where the camera is now, for picking what is nearest it. */
	viewpoint(): Vec3 {
		const { x, y, z } = this.graph.camera().position;
		return { x, y, z };
	}

	private createNode(graph: GraphNode, place: Placed | undefined): EngineNode {
		const node: EngineNode = {
			id: graph.id,
			graph,
			color: new Color(this.colorOf(graph)),
			opacity: 0,
			departing: false,
			shape: this.shapeFor(graph),
			extent: 0,
		};
		node.extent = extentFor(node);
		if (place !== undefined) {
			node.x = place.x;
			node.y = place.y;
			node.z = place.z;
			if (place.pinned) [node.fx, node.fy, node.fz] = [place.x, place.y, place.z];
		}
		return node;
	}

	private fadeTo(node: EngineNode, to: number, now: number): void {
		node.fade = { from: node.opacity, to, start: now };
		this.dirty = true;
	}

	/** Hand the engine the current nodes and links, with the many-body force limited to what is still settling. */
	private pushData(): void {
		this.charge = chargeStrengths(
			this.nodes.filter((node) => !node.departing).map((node) => ({ ...node.graph, pinned: node.fx !== undefined })),
			CHARGE,
		);
		this.degree.clear();
		for (const link of this.links) {
			for (const id of [endId(link.source), endId(link.target)]) this.degree.set(id, (this.degree.get(id) ?? 0) + 1);
		}
		this.dirty = true;
		this.layoutDirty = true;
		this.graph.graphData({ nodes: this.nodes, links: this.links });
	}

	/** The simulation has cooled: pin whatever was still free where it stopped. */
	private settle(): void {
		for (const node of this.nodes) {
			if (node.departing || node.x === undefined || node.y === undefined || node.z === undefined) continue;
			if (node.fx === undefined) [node.fx, node.fy, node.fz] = [node.x, node.y, node.z];
		}
	}

	setTheme(theme: SceneTheme): void {
		this.theme = theme;
		this.graph.backgroundColor(theme.background);
		this.fog.color.setStyle(theme.background);
		// A new font means a new glyph atlas, so every plate is laid out again.
		this.plates.setColors(theme);
		for (const node of this.nodes) {
			node.shape = this.shapeFor(node.graph);
			node.extent = extentFor(node);
		}
		this.linkForce?.distance(plateLinkDistance);
		this.dirty = true;
		this.layoutDirty = true;
	}

	setControls(settings: SceneControls): void {
		this.controlSettings = settings;
	}

	/**
	 * Apply the Overlays menu. Nothing here moves a node: hidden edges still
	 * pull (visibility is drawing only), and a new force balance re-weights
	 * the links, which shapes only what is still settling, since settled
	 * nodes are pinned.
	 */
	setOverlays(overlays: SceneOverlays): void {
		const reweigh = overlays.forceBalance !== this.overlays.forceBalance;
		this.overlays = overlays;
		if (reweigh) this.linkForce?.strength(this.linkStrength);
		this.setBloom(overlays.bloom);
		this.particles.visible = overlays.particles;
		this.plates.setLabelsVisible(overlays.labels !== "none");
		this.near.setEnabled(overlays.labels === "all");
		this.dirty = true;
	}

	/** Colour every node with `colorOf` from now on: the Overlays menu's colour mode, with what it reads (tags, memory strength). */
	setColoring(colorOf: (node: GraphNode) => string): void {
		this.colorOf = colorOf;
		for (const node of this.nodes) node.color.setStyle(colorOf(node.graph));
		this.near.refreshColors();
		this.dirty = true;
		this.layoutDirty = true;
	}

	/** d3's default link strength (one over the fewer links at either end), scaled by the force balance. */
	private readonly linkStrength = (link: EngineLink): number => {
		const fewer = Math.min(this.degree.get(endId(link.source)) ?? 1, this.degree.get(endId(link.target)) ?? 1);
		return linkStrengthScale(link.kind, this.overlays.forceBalance) / Math.max(1, fewer);
	};

	/**
	 * Bloom is a post-processing pass, added only while it is on: its render
	 * targets cost memory and every frame a full-screen blur. The output pass
	 * after it converts to the screen's colour space, which rendering to the
	 * canvas directly did by itself.
	 */
	private setBloom(on: boolean): void {
		if (on === this.bloomPasses.length > 0) return;
		const composer = this.graph.postProcessingComposer();
		if (on) {
			// The composer sizes each pass as it is added.
			this.bloomPasses = [new UnrealBloomPass(new Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold), new OutputPass()];
			for (const pass of this.bloomPasses) composer.addPass(pass);
			return;
		}
		for (const pass of this.bloomPasses) {
			composer.removePass(pass);
			pass.dispose();
		}
		this.bloomPasses = [];
	}

	resize(width: number, height: number): void {
		if (width > 0 && height > 0) this.graph.width(width).height(height);
	}

	/**
	 * Fly the camera to a node, keeping the current viewing direction. A node
	 * that has only just arrived has no position until the simulation's next
	 * tick, so the flight waits for it. With `afterLayout`, it also waits for
	 * the layout to spread out after new data, or the camera aims at where the
	 * node was mid-explosion and the node drifts out of view.
	 *
	 * The flight then tracks the node, since a hop to another note re-heats the
	 * layout and moves any node not yet settled, the clicked one included (see
	 * `steerFlight`).
	 */
	flyTo(id: string, afterLayout = false): void {
		this.pendingFlight = id;
		this.pendingFlightWaits = afterLayout;
		this.focusId = id;
		this.startPendingFlight();
	}

	private startPendingFlight(): void {
		if (this.pendingFlight === null) return;
		const node = this.nodes.find((n) => n.id === this.pendingFlight);
		if (node === undefined) {
			this.pendingFlight = null;
			return;
		}
		// A pinned node is already where it will stay.
		if (this.pendingFlightWaits && node.fx === undefined && this.ticksSinceData < SETTLE_TICKS) return;
		if (node.x === undefined || node.y === undefined || node.z === undefined) return;
		this.pendingFlight = null;
		const distance = node.graph.kind === "note" ? 160 : 70;
		const position = { x: node.x, y: node.y, z: node.z };
		this.flight = { node, flight: startFlight(this.graph.camera().position, this.orbitControls().target, position, distance, performance.now()) };
		this.follow = null;
	}

	/**
	 * One frame of the flight: the camera eases toward where its node is now.
	 * Once there, it keeps moving with the node until the node is pinned
	 * (the layout has cooled), so a node still settling stays centred.
	 */
	private steerFlight(now: number): void {
		const camera = this.graph.camera();
		const controls = this.orbitControls();
		const flight = this.flight;
		if (flight !== null) {
			const { node } = flight;
			if (node.departing || node.x === undefined || node.y === undefined || node.z === undefined) {
				this.flight = null;
				return;
			}
			const at = { x: node.x, y: node.y, z: node.z };
			const pose = flightPose(flight.flight, at, now, FLIGHT_MS);
			camera.position.set(pose.position.x, pose.position.y, pose.position.z);
			controls.target.set(pose.target.x, pose.target.y, pose.target.z);
			controls.update();
			if (pose.done) {
				this.flight = null;
				if (node.fx === undefined) this.follow = { node, at };
			}
			return;
		}
		const follow = this.follow;
		if (follow === null) return;
		const { node } = follow;
		if (node.departing || node.x === undefined || node.y === undefined || node.z === undefined) {
			this.follow = null;
			return;
		}
		const move = new Vector3(node.x - follow.at.x, node.y - follow.at.y, node.z - follow.at.z);
		camera.position.add(move);
		controls.target.add(move);
		controls.update();
		follow.at = { x: node.x, y: node.y, z: node.z };
		if (node.fx !== undefined) this.follow = null;
	}

	/** The user moved the view: a flight or follow under way gives way. */
	private cancelFlight(): void {
		this.flight = this.follow = null;
	}

	destroy(): void {
		window.cancelAnimationFrame(this.frame);
		this.graph.renderer().domElement.removeEventListener("pointerdown", this.onPointerDown);
		window.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("pointerup", this.onPointerUp);
		window.removeEventListener("pointercancel", this.onPointerUp);
		this.container.removeEventListener("wheel", this.onWheel, { capture: true });
		window.clearTimeout(this.speedTimer);
		this.perf.destroy();
		this.setBloom(false);
		this.near.destroy();
		this.nodes = [];
		this.links = [];
		this.plates.dispose();
		this.edges.geometry.dispose();
		this.edges.material.dispose();
		this.thread.geometry.dispose();
		this.thread.material.dispose();
		this.particles.geometry.dispose();
		this.particles.material.dispose();
		const renderer = this.graph.renderer();
		this.graph._destructor();
		renderer.dispose();
		renderer.forceContextLoss();
		this.container.empty();
	}

	/** Lay a node's label out on its plate: note titles large, every other node's first words small. */
	private shapeFor(graph: GraphNode): PlateShape {
		const isCore = graph.kind === "note";
		return this.plates.shape(this.labelText(graph), isCore ? CORE_PLATE_HEIGHT : LINE_PLATE_HEIGHT, isCore ? CORE_PLATE_MAX_EM : LINE_PLATE_MAX_EM);
	}

	private labelText(node: GraphNode): string {
		return node.kind === "note" ? node.label : spriteLabel(node.label);
	}

	/**
	 * Translate the camera and its orbit target together, so flying and
	 * orbiting share one set of controls. The flight keys and the move stick
	 * steer it; the stick's push sets the throttle (see `flightAxes`).
	 */
	private fly(seconds: number): void {
		const keys: FlightAxes = [0, 0, 0];
		for (const key of this.heldKeys) {
			const axis = FLIGHT_KEYS[key];
			if (axis === undefined) continue;
			for (let i = 0; i < 3; i++) keys[i]! += axis[i]!;
		}
		const [right, up, forward] = flightAxes(keys, stickMove(this.sticks.move));
		if (right === 0 && up === 0 && forward === 0) return;
		this.cancelFlight();

		const camera = this.graph.camera() as PerspectiveCamera;
		const controls = this.orbitControls();
		const look = new Vector3();
		camera.getWorldDirection(look);
		const side = new Vector3().crossVectors(look, camera.up).normalize();
		const lift = new Vector3().crossVectors(side, look).normalize();
		const speed = Math.max(FLIGHT_MIN_SPEED, camera.position.distanceTo(controls.target) * FLIGHT_SPEED) * flightScale;
		const step = new Vector3()
			.addScaledVector(side, right)
			.addScaledVector(lift, up)
			.addScaledVector(look, forward)
			.multiplyScalar(speed * seconds);
		camera.position.add(step);
		controls.target.add(step);
	}

	/** Turn the camera in place with the look stick, as mouse-look does. */
	private lookAround(seconds: number): void {
		const { yaw, pitch } = stickLook(this.sticks.look, seconds);
		if (yaw === 0 && pitch === 0) return;
		this.cancelFlight();
		const camera = this.graph.camera();
		const controls = this.orbitControls();
		rotateAboutPivot(camera.position, controls.target, camera.position.clone(), yaw, pitch, camera.up);
		controls.update();
	}

	private orbitControls(): OrbitControls {
		return this.graph.controls() as OrbitControls;
	}

	/**
	 * A left-button or one-finger drag rotates the view, and two fingers pinch
	 * and pan. Shift, Ctrl or Cmd with the left button is left to
	 * OrbitControls, which pans.
	 */
	private readonly onPointerDown = (e: PointerEvent): void => {
		const touch = e.pointerType === "touch";
		this.cancelFlight();
		if (this.touches.size === 0) {
			// A finger on a coasting view stops it, and that is all it does:
			// not also a tap that hops. What the orbit coast had left carries
			// into a flick that follows.
			this.stoppedCoastOnDown = this.orbitCoast !== null || this.panCoast !== null || this.zoomCoast !== null;
			this.carry = this.orbitCoast?.velocity ?? { x: 0, y: 0 };
			this.touchDownAt = performance.now();
		}
		this.orbitCoast = this.panCoast = this.zoomCoast = null;
		if (touch) {
			this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
			// A second finger is a pinch: the drag stops, and stays stopped
			// until every finger has lifted.
			if (this.touches.size === 2) this.startPinch();
			if (this.touches.size !== 1) {
				this.drag = this.press = null;
				return;
			}
		} else if (e.button !== 0) {
			return;
		} else if (e.shiftKey || e.ctrlKey || e.metaKey) {
			// Still a press that may be a click: Mod-click on a link opens it.
			this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch };
			return;
		}
		this.samples = [];
		this.drag = {
			pointerId: e.pointerId,
			touch,
			x: e.clientX,
			y: e.clientY,
			pivot: this.aimPoint(e.clientX, e.clientY, touch),
			look: touch && this.controlSettings.touchDrag === "look",
		};
		this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch };
	};

	private readonly onPointerMove = (e: PointerEvent): void => {
		const press = this.press;
		if (press?.pointerId === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP_PX) this.press = null;
		// The pointer cursor over a node is resolved once a frame, in tick().
		if (e.pointerType === "mouse" && e.buttons === 0 && e.target === this.graph.renderer().domElement) {
			this.hover = { x: e.clientX, y: e.clientY };
		}
		const finger = this.touches.get(e.pointerId);
		if (finger !== undefined) {
			finger.x = e.clientX;
			finger.y = e.clientY;
		}
		if (this.pinch !== null) {
			if (this.pinch.ids.includes(e.pointerId)) this.movePinch(this.pinch);
			return;
		}
		const drag = this.drag;
		if (drag === null || e.pointerId !== drag.pointerId) return;
		const dx = e.clientX - drag.x;
		const dy = e.clientY - drag.y;
		drag.x = e.clientX;
		drag.y = e.clientY;
		// A flight key pressed during a mouse drag turns it into mouse-look
		// for the rest of the drag; the next press orbits again.
		if (!drag.touch && this.heldKeys.size > 0) drag.look = true;
		if (drag.touch) this.sample(this.samples, e.clientX, e.clientY);
		this.rotate(drag, dx, dy);
	};

	private readonly onPointerUp = (e: PointerEvent): void => {
		this.touches.delete(e.pointerId);
		const press = this.press;
		if (press?.pointerId === e.pointerId) {
			this.press = null;
			if (!this.stoppedCoastOnDown) this.click(press.x, press.y, press.touch, e);
		}
		if (this.pinch?.ids.includes(e.pointerId) === true) this.endPinch(this.pinch);
		const drag = this.drag;
		if (drag?.pointerId !== e.pointerId) return;
		this.drag = null;
		if (!drag.touch) return;
		const now = performance.now();
		const velocity = launchVelocity(estimateVelocity(this.samples, now), this.carry, now - this.touchDownAt);
		if (velocity.x !== 0 || velocity.y !== 0) this.orbitCoast = { drag, velocity };
	};

	/** A click or tap: follow the link under it, or hop to its node. See `linkClickAction`. */
	private click(x: number, y: number, touch: boolean, e: PointerEvent): void {
		const link = this.near.linkAt(x, y);
		const focus = this.focusId === null ? undefined : this.nodes.find((node) => node.id === this.focusId);
		const linkNode = link === null ? undefined : this.nodes.find((node) => node.id === link.node.id);
		const action = linkClickAction({
			click: true,
			link,
			isFocus: link !== null && link.node.id === this.focusId,
			focusDistance: focus !== undefined && linkNode !== undefined ? worldDistance(focus, linkNode) : Infinity,
			mod: Platform.isMacOS ? e.metaKey : e.ctrlKey,
			alt: e.altKey,
			panKey: e.shiftKey || e.ctrlKey || e.metaKey,
		});
		if (action === "none") return;
		if (action !== "hop") {
			this.options.onLinkClick(link!, action);
			return;
		}
		if (link !== null) {
			this.options.onNodeClick(link.node);
			return;
		}
		const node = this.nodeNear(x, y, PICK_SLOP_PX[touch ? "touch" : "mouse"]);
		if (node !== null) this.options.onNodeClick(node.graph);
	}

	/** The wheel zooms toward what is under the cursor, or sets the flight speed while flying. */
	private readonly onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		this.cancelFlight();
		if (this.drag?.look === true && !this.drag.touch) {
			flightScale = Math.min(FLIGHT_SCALE_LIMIT, Math.max(1 / FLIGHT_SCALE_LIMIT, flightScale * FLIGHT_SCALE_STEP ** wheelNotches(e)));
			this.showSpeed();
			return;
		}
		this.dolly(this.aimPoint(e.clientX, e.clientY, false), wheelLogZoom(e));
	};

	private showSpeed(): void {
		this.speedEl.setText(`Flight speed ×${flightScale.toFixed(flightScale < 1 ? 2 : 1)}`);
		this.speedEl.addClass("is-visible");
		window.clearTimeout(this.speedTimer);
		this.speedTimer = window.setTimeout(() => this.speedEl.removeClass("is-visible"), SPEED_READOUT_MS);
	}

	/** Turn the view for a drag of (`dx`, `dy`) px. */
	private rotate(drag: RotateDrag, dx: number, dy: number): void {
		const camera = this.graph.camera();
		const controls = this.orbitControls();
		const pivot = drag.look ? camera.position.clone() : drag.pivot;
		const rate = (drag.look ? LOOK_RATE : ORBIT_RATE) / Math.max(1, this.container.clientHeight);
		// Mouse-look turns toward the drag; a touch look drags the world, so it
		// turns the other way. Orbiting drags the world either way.
		const sign = drag.look && drag.touch ? 1 : -1;
		rotateAboutPivot(camera.position, controls.target, pivot, sign * rate * dx, sign * rate * dy, camera.up);
		controls.update();
	}

	private startPinch(): void {
		const [a, b] = [...this.touches.keys()] as [number, number];
		const [x, y, spread] = this.pinchShape(a, b);
		this.pinch = { ids: [a, b], x, y, spread, zoomed: 0, depth: this.viewDepth(this.aimPoint(x, y, true)) };
		this.samples = [];
		this.zoomSamples = [];
	}

	/** Zoom toward the point between the fingers by how far they spread, and pan with their midpoint. */
	private movePinch(pinch: Pinch): void {
		const [x, y, spread] = this.pinchShape(...pinch.ids);
		const logZoom = Math.log(spread / pinch.spread);
		const point = this.aimPoint(x, y, true);
		this.dolly(point, logZoom);
		pinch.depth = this.viewDepth(point);
		this.pan(x - pinch.x, y - pinch.y, pinch.depth);
		pinch.x = x;
		pinch.y = y;
		pinch.spread = spread;
		pinch.zoomed += logZoom;
		this.sample(this.samples, x, y);
		this.sample(this.zoomSamples, pinch.zoomed, 0);
	}

	/** The pinch ends when either of its fingers lifts; its pan and zoom coast on. */
	private endPinch(pinch: Pinch): void {
		this.pinch = null;
		const now = performance.now();
		const pan = launchVelocity(estimateVelocity(this.samples, now), { x: 0, y: 0 }, 0);
		if (pan.x !== 0 || pan.y !== 0) this.panCoast = { depth: pinch.depth, velocity: pan };
		const zoom = estimateVelocity(this.zoomSamples, now).x;
		if (Math.abs(zoom) >= ZOOM_MIN_VELOCITY) this.zoomCoast = { x: pinch.x, y: pinch.y, velocity: zoom };
	}

	/** Midpoint and spread of two fingers, in client px. */
	private pinchShape(a: number, b: number): [x: number, y: number, spread: number] {
		const p = this.touches.get(a) ?? { x: 0, y: 0 };
		const q = this.touches.get(b) ?? p;
		// Two fingers on one pixel would make a zoom of ln(0).
		return [(p.x + q.x) / 2, (p.y + q.y) / 2, Math.max(1, Math.hypot(p.x - q.x, p.y - q.y))];
	}

	private sample(samples: Sample[], x: number, y: number): void {
		const t = performance.now();
		samples.splice(0, samples.length, ...pruneSamples(samples, t), { x, y, t });
	}

	/** One frame of touch momentum: each gesture coasts on and slows to a stop, as in the mind map. */
	private coast(ms: number): void {
		const orbit = this.orbitCoast;
		if (orbit !== null) {
			const x = integrateDecay(orbit.velocity.x, PAN_FRICTION, ms);
			const y = integrateDecay(orbit.velocity.y, PAN_FRICTION, ms);
			orbit.velocity = { x: x.velocity, y: y.velocity };
			this.rotate(orbit.drag, x.delta, y.delta);
			if (Math.hypot(x.velocity, y.velocity) < PAN_MIN_VELOCITY) this.orbitCoast = null;
		}
		const pan = this.panCoast;
		if (pan !== null) {
			const x = integrateDecay(pan.velocity.x, PAN_FRICTION, ms);
			const y = integrateDecay(pan.velocity.y, PAN_FRICTION, ms);
			pan.velocity = { x: x.velocity, y: y.velocity };
			this.pan(x.delta, y.delta, pan.depth);
			if (Math.hypot(x.velocity, y.velocity) < PAN_MIN_VELOCITY) this.panCoast = null;
		}
		const zoom = this.zoomCoast;
		if (zoom !== null) {
			const step = integrateDecay(zoom.velocity, ZOOM_FRICTION, ms);
			zoom.velocity = step.velocity;
			this.dolly(this.aimPoint(zoom.x, zoom.y, true), step.delta);
			if (Math.abs(step.velocity) < ZOOM_MIN_VELOCITY) this.zoomCoast = null;
		}
	}

	/**
	 * Move the camera toward `point` (away, for a negative `logZoom`), by a
	 * step sized from the point's own depth, so a zoom toward a nearer or
	 * farther node starts fresh. The orbit target is re-seated straight ahead
	 * at the point's depth, so the mist and flight speed follow what you zoomed
	 * toward. It stays `MIN_DEPTH` ahead, so a zoom carries on through a node.
	 */
	private dolly(point: Vector3, logZoom: number): void {
		const camera = this.graph.camera();
		const controls = this.orbitControls();
		const toPoint = point.clone().sub(camera.position);
		const depth = toPoint.length();
		const step = dollyDistance(depth, logZoom);
		camera.position.addScaledVector(toPoint.normalize(), step);
		this.lastDepth = Math.max(MIN_DEPTH, depth - step);
		const forward = camera.getWorldDirection(new Vector3());
		controls.target.copy(camera.position).addScaledVector(forward, this.viewDepth(point));
		controls.update();
	}

	/** Slide the camera and its orbit target so the world `depth` ahead follows a drag of (`dx`, `dy`) px. */
	private pan(dx: number, dy: number, depth: number): void {
		const camera = this.graph.camera() as PerspectiveCamera;
		const controls = this.orbitControls();
		camera.updateMatrixWorld();
		const perPixel = (2 * depth * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, this.container.clientHeight);
		const move = new Vector3()
			.setFromMatrixColumn(camera.matrixWorld, 0)
			.multiplyScalar(-dx * perPixel)
			.add(new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(dy * perPixel));
		camera.position.add(move);
		controls.target.add(move);
		controls.update();
	}

	/** How far ahead of the camera `point` is, along the view direction, but at least `MIN_DEPTH`. */
	private viewDepth(point: Vector3): number {
		const camera = this.graph.camera();
		const forward = camera.getWorldDirection(new Vector3());
		return Math.max(MIN_DEPTH, point.clone().sub(camera.position).dot(forward));
	}

	/**
	 * What a drag starting at client point (`x`, `y`) orbits, or a zoom there
	 * heads for. With the view-centre setting, that is the orbit target.
	 * Otherwise it is the centre of a node near the pointer; failing that, the
	 * point under the pointer at the depth last aimed at, the way Blender's
	 * Auto Depth falls back when nothing is under the cursor.
	 */
	private aimPoint(x: number, y: number, touch: boolean): Vector3 {
		const settings = this.controlSettings;
		if (touch ? settings.touchDrag === "center" : settings.desktopPivot === "center") {
			return this.orbitControls().target.clone();
		}
		const camera = this.graph.camera();
		const node = this.nodeNear(x, y, PICK_SLOP_PX[touch ? "touch" : "mouse"]);
		if (node !== null) {
			const centre = new Vector3(node.x, node.y, node.z);
			this.lastDepth = centre.distanceTo(camera.position);
			return centre;
		}
		const depth = this.lastDepth ?? camera.position.distanceTo(this.orbitControls().target);
		return this.rayThrough(x, y).at(depth, new Vector3());
	}

	/**
	 * The node nearest client point (`x`, `y`) on screen, within `slop` px of
	 * its plate and inside the mist. Nodes on their way out don't count. This
	 * is also how a click finds its node: the engine's own picking is off,
	 * since it can't see into the instanced plates.
	 */
	private nodeNear(x: number, y: number, slop: number): EngineNode | null {
		const camera = this.graph.camera() as PerspectiveCamera;
		const rect = this.graph.renderer().domElement.getBoundingClientRect();
		const forward = camera.getWorldDirection(new Vector3());
		// Screen px per world unit at distance 1.
		const scale = rect.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
		// exp(-(density·d)²) is 2% at density·d = 2: anything further is lost in the mist.
		const reach = 2 / this.fog.density;
		const candidates: EngineNode[] = [];
		const onScreen: ScreenNode[] = [];
		const point = new Vector3();
		for (const node of this.nodes) {
			if (node.departing || node.x === undefined || node.y === undefined || node.z === undefined) continue;
			point.set(node.x, node.y, node.z).sub(camera.position);
			const distance = point.dot(forward);
			if (distance <= 0 || distance > reach) continue;
			point.add(camera.position).project(camera);
			candidates.push(node);
			onScreen.push({
				x: rect.left + ((point.x + 1) / 2) * rect.width,
				y: rect.top + ((1 - point.y) / 2) * rect.height,
				halfWidth: (node.shape.width * scale) / distance / 2,
				halfHeight: (node.shape.height * scale) / distance / 2,
				distance,
			});
		}
		return candidates[pickNode(onScreen, x, y, slop)] ?? null;
	}

	/** The ray from the camera through client point (`x`, `y`). */
	private rayThrough(x: number, y: number): Ray {
		const rect = this.graph.renderer().domElement.getBoundingClientRect();
		const ndc = new Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
		const raycaster = new Raycaster();
		raycaster.setFromCamera(ndc, this.graph.camera());
		return raycaster.ray;
	}

	private readonly tick = (now: number): void => {
		this.frame = window.requestAnimationFrame(this.tick);
		// A background tab would otherwise keep rendering at full frame rate.
		const shown = this.container.isShown();
		if (shown === this.paused) {
			this.paused = !shown;
			if (shown) this.graph.resumeAnimation();
			else {
				this.graph.pauseAnimation();
				this.near.pauseMedia();
			}
		}
		if (!shown) {
			this.heldKeys.clear();
			return;
		}
		const tickStart = performance.now();
		const seconds = this.lastFrame === 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
		this.lastFrame = now;
		this.startPendingFlight();
		this.steerFlight(now);
		this.fly(seconds);
		this.lookAround(seconds);
		this.coast(Math.min(seconds * 1000, MAX_FRAME_MS));
		const controls = this.orbitControls();
		const targetDistance = this.graph.camera().position.distanceTo(controls.target);
		const ease = 1 - Math.exp(-seconds / MIST_EASE);
		const mist = (MIST * this.overlays.mist) / Math.max(MIST_MIN_DISTANCE, targetDistance);
		this.fog.density += (mist - this.fog.density) * ease;
		// Focus dimming follows the orbit target's view depth, eased like the mist.
		const focus = this.plates.focus;
		const focusDepth = this.viewDepth(controls.target);
		focus.value = focus.value === 0 ? focusDepth : focus.value + (focusDepth - focus.value) * ease;
		this.stepFades(now);
		this.near.update(this.nodes, this.graph.camera() as PerspectiveCamera, focus.value, this.fog.density, seconds);
		if (this.dirty) {
			this.dirty = false;
			this.plates.write(this.nodes, this.layoutDirty);
			this.layoutDirty = false;
			this.writeEdges();
			this.writeThread();
		}
		if (this.overlays.particles) this.writeParticles(now);
		if (this.hover !== null) {
			const node = this.drag === null ? this.nodeNear(this.hover.x, this.hover.y, PICK_SLOP_PX.mouse) : null;
			this.graph.renderer().domElement.style.cursor = node === null ? "" : "pointer";
			this.hover = null;
		}
		this.perf.frame(now, performance.now() - tickStart);
	};

	/** Advance every fade; once the nodes that left have faded out, drop them from the graph. */
	private stepFades(now: number): void {
		let gone = false;
		for (const node of this.nodes) {
			const fade = node.fade;
			if (fade === undefined) continue;
			const t = Math.min(1, (now - fade.start) / FADE_MS);
			node.opacity = fade.from + (fade.to - fade.from) * t;
			this.dirty = true;
			if (t < 1) continue;
			node.fade = undefined;
			if (node.departing) gone = true;
		}
		if (!gone) return;
		const left = new Set<string>();
		for (const node of this.nodes) {
			if (node.departing && node.fade === undefined) left.add(node.id);
		}
		this.nodes = this.nodes.filter((node) => !left.has(node.id));
		this.links = this.links.filter((link) => !left.has((link.source as EngineNode).id) && !left.has((link.target as EngineNode).id));
		this.pushData();
	}

	private writeEdges(): void {
		const geometry = this.edges.geometry;
		let positions = geometry.getAttribute("position") as BufferAttribute | undefined;
		let colors = geometry.getAttribute("color") as BufferAttribute | undefined;
		if (positions === undefined || colors === undefined || positions.count < this.links.length * 2) {
			const capacity = Math.max(64, this.links.length * 4);
			geometry.dispose();
			positions = new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
			colors = new BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
			geometry.setAttribute("position", positions);
			geometry.setAttribute("color", colors);
		}
		let vertex = 0;
		for (const link of this.links) {
			// Links hold IDs until the engine's next digest swaps in the nodes.
			const source = link.source as EngineNode | string;
			const target = link.target as EngineNode | string;
			if (typeof source === "string" || typeof target === "string") continue;
			if (source.x === undefined || target.x === undefined) continue;
			if (!this.edgeDrawn(link.kind, source, target)) continue;
			const alpha = LINK_OPACITY * Math.min(source.opacity, target.opacity);
			if (alpha <= 0) continue;
			const color = this.edgeColor(link.kind);
			for (const end of [source, target]) {
				positions.setXYZ(vertex, end.x ?? 0, end.y ?? 0, end.z ?? 0);
				colors.setXYZW(vertex++, color.r, color.g, color.b, alpha);
			}
		}
		geometry.setDrawRange(0, vertex);
		positions.needsUpdate = true;
		colors.needsUpdate = true;
	}

	private writeThread(): void {
		const geometry = this.thread.geometry;
		let positions = geometry.getAttribute("position") as BufferAttribute | undefined;
		if (this.threadIds.length === 0 && (positions === undefined || geometry.drawRange.count === 0)) return;
		const byId = new Map(this.nodes.map((node) => [node.id, node]));
		const segments = threadSegments<Vec3>(this.threadIds, (id) => {
			const node = byId.get(id);
			if (node === undefined || node.departing || node.x === undefined || node.y === undefined || node.z === undefined) return null;
			return { x: node.x, y: node.y, z: node.z };
		});
		if (positions === undefined || positions.count < segments.length * 2) {
			geometry.dispose();
			positions = new BufferAttribute(new Float32Array(Math.max(32, segments.length * 4) * 3), 3).setUsage(DynamicDrawUsage);
			geometry.setAttribute("position", positions);
		}
		let vertex = 0;
		for (const end of segments.flat()) positions.setXYZ(vertex++, end.x, end.y, end.z);
		geometry.setDrawRange(0, vertex);
		positions.needsUpdate = true;
	}

	/** Whether the Overlays menu shows an edge of `kind` between these nodes. */
	private edgeDrawn(kind: GraphEdgeKind, source: EngineNode, target: EngineNode): boolean {
		return edgeShown(kind, source.graph.kind === "ghost" || target.graph.kind === "ghost", this.overlays.edges);
	}

	private edgeColor(kind: GraphEdgeKind): Color {
		let color = this.edgeColors.get(kind);
		if (color === undefined) this.edgeColors.set(kind, (color = new Color(edgeColor(kind))));
		return color;
	}

	/**
	 * One frame of link particles: a particle on every drawn edge, running from
	 * source to target at one speed in world units, so the direction of each
	 * link shows. Rewritten every frame while the overlay is on.
	 */
	private writeParticles(now: number): void {
		const geometry = this.particles.geometry;
		let positions = geometry.getAttribute("position") as BufferAttribute | undefined;
		let colors = geometry.getAttribute("color") as BufferAttribute | undefined;
		if (positions === undefined || colors === undefined || positions.count < this.links.length) {
			const capacity = Math.max(64, this.links.length * 2);
			geometry.dispose();
			positions = new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
			colors = new BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
			geometry.setAttribute("position", positions);
			geometry.setAttribute("color", colors);
		}
		const travelled = (now / 1000) * PARTICLE_SPEED;
		let count = 0;
		for (const link of this.links) {
			const source = link.source as EngineNode | string;
			const target = link.target as EngineNode | string;
			if (typeof source === "string" || typeof target === "string") continue;
			if (source.x === undefined || source.y === undefined || source.z === undefined) continue;
			if (target.x === undefined || target.y === undefined || target.z === undefined) continue;
			if (!this.edgeDrawn(link.kind, source, target)) continue;
			const alpha = PARTICLE_OPACITY * Math.min(source.opacity, target.opacity);
			if (alpha <= 0) continue;
			const length = Math.max(1, Math.hypot(target.x - source.x, target.y - source.y, target.z - source.z));
			const t = (travelled / length + link.phase) % 1;
			positions.setXYZ(count, source.x + (target.x - source.x) * t, source.y + (target.y - source.y) * t, source.z + (target.z - source.z) * t);
			const color = this.edgeColor(link.kind);
			colors.setXYZW(count++, color.r, color.g, color.b, alpha);
		}
		geometry.setDrawRange(0, count);
		positions.needsUpdate = true;
		colors.needsUpdate = true;
	}
}

/** Straight-line distance between two placed nodes; `Infinity` while either has no position. */
function worldDistance(a: EngineNode, b: EngineNode): number {
	if (a.x === undefined || a.y === undefined || a.z === undefined || b.x === undefined || b.y === undefined || b.z === undefined) return Infinity;
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
