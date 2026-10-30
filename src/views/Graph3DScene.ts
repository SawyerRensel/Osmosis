/**
 * The 3D graph's engine: a `3d-force-graph` mount plus our tiers, mist, theme
 * and free flight. Everything that touches Three.js lives here, and
 * `Graph3DView` loads this module with a dynamic `import()`, so Three.js is not
 * evaluated at plugin startup, only when a 3D graph view first opens.
 */

import ForceGraph3D, { type ForceGraph3DInstance, type LinkObject, type NodeObject } from "3d-force-graph";
import { FogExp2, Group, Raycaster, Vector2, Vector3, type PerspectiveCamera, type Ray } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import SpriteText from "three-spritetext";
import type { GraphEdgeKind, GraphModel, GraphNode } from "../graph3d/model";
import { chooseLabelled, type LabelBudget } from "../graph3d/lod";
import { edgeColor, edgeDistance, nodeColor, nodeSize, spriteLabel } from "../graph3d/appearance";
import { rotateAboutPivot } from "../graph3d/pivot";
import { dollyDistance, pickNode, wheelLogZoom, wheelNotches, type ScreenNode } from "../graph3d/depth";
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
	/** The object 3d-force-graph draws beside its sphere; labels hang off it. */
	group?: Group;
	label?: SpriteText;
}

interface EngineLink extends LinkObject<EngineNode> {
	kind: GraphEdgeKind;
}

export interface SceneTheme {
	background: string;
	text: string;
}

export interface SceneControls {
	desktopPivot: Graph3DDesktopPivot;
	touchDrag: Graph3DTouchDrag;
}

export interface SceneOptions {
	isMobile: boolean;
	controls: SceneControls;
	onNodeClick: (node: GraphNode) => void;
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

/** 3d-force-graph draws a node's sphere with radius `cbrt(val) * relSize`. */
const NODE_REL_SIZE = 4;
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
const LABEL_BUDGET: Record<"desktop" | "mobile", LabelBudget> = {
	desktop: { enter: 240, exit: 280, max: 150 },
	mobile: { enter: 180, exit: 210, max: 60 },
};
/** Sprites are a canvas texture each; creating too many in one frame stutters. */
const LABELS_PER_PASS = 12;
const LABEL_PASS_MS = 150;
/** Flight speed as a fraction of the camera's distance to its orbit target, per second. */
const FLIGHT_SPEED = 0.9;
const FLIGHT_MIN_SPEED = 40;
const FLIGHT_MS = 1000;
/** Ticks after new data before the layout has spread out enough to aim at. */
const SETTLE_TICKS = 80;

/**
 * Flight speed multiplier, set with the wheel while flying. Like Unreal's
 * camera speed it outlasts the drag, and every 3D graph view shares it until
 * Obsidian restarts.
 */
let flightScale = 1;

/** Flight keys and the camera-space direction each one moves. */
export const FLIGHT_KEYS: Record<string, [right: number, up: number, forward: number]> = {
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
	private readonly budget: LabelBudget;
	private nodes: EngineNode[] = [];
	private readonly labelled = new Set<string>();
	private textColor = "#ffffff";
	private frame = 0;
	private lastFrame = 0;
	private lastLabelPass = 0;
	private paused = false;
	private pendingFlight: string | null = null;
	private pendingFlightWaits = false;
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
	private speedTimer = 0;
	readonly heldKeys = new Set<string>();

	constructor(private readonly container: HTMLElement, options: SceneOptions) {
		this.budget = LABEL_BUDGET[options.isMobile ? "mobile" : "desktop"];
		this.graph = new ForceGraph3D(container, { controlType: "orbit" }) as unknown as ForceGraph3DInstance<EngineNode, EngineLink>;
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
		this.speedEl = container.createDiv({ cls: "osmosis-graph3d-speed" });

		const linkForce = this.graph.d3Force("link") as { distance(fn: (link: EngineLink) => number): unknown } | undefined;
		linkForce?.distance((link) => edgeDistance(link.kind));

		this.graph
			.showNavInfo(false)
			.nodeRelSize(NODE_REL_SIZE)
			.nodeVal((node) => nodeSize(node.graph))
			.nodeColor((node) => nodeColor(node.graph))
			.nodeOpacity(0.95)
			.nodeLabel(() => "")
			.nodeThreeObjectExtend(true)
			.nodeThreeObject((node) => this.groupFor(node))
			.linkColor((link) => edgeColor(link.kind))
			.linkOpacity(0.45)
			// Pressing a node orbits it instead; the layout places nodes itself.
			.enableNodeDrag(false)
			.onNodeClick((node) => {
				if (!this.stoppedCoastOnDown) options.onNodeClick(node.graph);
			})
			.onEngineTick(() => this.ticksSinceData++);

		this.frame = window.requestAnimationFrame(this.tick);
	}

	/**
	 * Show a new model. Nodes already on screen keep their engine objects, and
	 * with them their positions, so a hop doesn't scatter the world.
	 */
	setData(model: GraphModel): void {
		const previous = new Map(this.nodes.map((node) => [node.id, node]));
		this.nodes = model.nodes.map((graph) => {
			const existing = previous.get(graph.id);
			if (existing === undefined) return { id: graph.id, graph };
			previous.delete(graph.id);
			existing.graph = graph;
			if (existing.label !== undefined) existing.label.text = this.labelText(graph);
			return existing;
		});
		for (const departed of previous.values()) this.removeLabel(departed);
		this.ticksSinceData = 0;
		this.graph.graphData({
			nodes: this.nodes,
			links: model.edges.map((edge) => ({ kind: edge.kind, source: edge.source, target: edge.target })),
		});
	}

	setTheme(theme: SceneTheme): void {
		this.textColor = theme.text;
		this.graph.backgroundColor(theme.background);
		this.fog.color.setStyle(theme.background);
		for (const node of this.nodes) if (node.label !== undefined) node.label.color = theme.text;
	}

	setControls(settings: SceneControls): void {
		this.controlSettings = settings;
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
	 */
	flyTo(id: string, afterLayout = false): void {
		this.pendingFlight = id;
		this.pendingFlightWaits = afterLayout;
		this.startPendingFlight();
	}

	private startPendingFlight(): void {
		if (this.pendingFlight === null) return;
		if (this.pendingFlightWaits && this.ticksSinceData < SETTLE_TICKS) return;
		const node = this.nodes.find((n) => n.id === this.pendingFlight);
		if (node === undefined) {
			this.pendingFlight = null;
			return;
		}
		if (node.x === undefined || node.y === undefined || node.z === undefined) return;
		this.pendingFlight = null;
		const target = new Vector3(node.x, node.y, node.z);
		const camera = this.graph.camera();
		const direction = camera.position.clone().sub(target);
		if (direction.lengthSq() === 0) direction.set(0, 0, 1);
		const distance = node.graph.kind === "note" ? 160 : 70;
		const position = target.clone().add(direction.normalize().multiplyScalar(distance));
		this.graph.cameraPosition(position, target, FLIGHT_MS);
	}

	destroy(): void {
		window.cancelAnimationFrame(this.frame);
		this.graph.renderer().domElement.removeEventListener("pointerdown", this.onPointerDown);
		window.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("pointerup", this.onPointerUp);
		window.removeEventListener("pointercancel", this.onPointerUp);
		this.container.removeEventListener("wheel", this.onWheel, { capture: true });
		window.clearTimeout(this.speedTimer);
		for (const node of this.nodes) this.removeLabel(node);
		this.nodes = [];
		const renderer = this.graph.renderer();
		this.graph._destructor();
		renderer.dispose();
		renderer.forceContextLoss();
		this.container.empty();
	}

	private groupFor(node: EngineNode): Group {
		if (node.group !== undefined) return node.group;
		node.group = new Group();
		// Note cores always carry their title; other labels come and go by distance.
		if (node.graph.kind === "note") this.addLabel(node);
		return node.group;
	}

	private addLabel(node: EngineNode): void {
		if (node.group === undefined || node.label !== undefined) return;
		const isCore = node.graph.kind === "note";
		const label = new SpriteText(this.labelText(node.graph), isCore ? 7 : 3.5, this.textColor);
		const radius = Math.cbrt(nodeSize(node.graph)) * NODE_REL_SIZE;
		label.position.y = radius + (isCore ? 6 : 3);
		node.group.add(label);
		node.label = label;
		if (!isCore) this.labelled.add(node.id);
	}

	private labelText(node: GraphNode): string {
		return node.kind === "note" ? node.label : spriteLabel(node.label);
	}

	private removeLabel(node: EngineNode): void {
		const label = node.label;
		if (label === undefined) return;
		label.removeFromParent();
		label.material.map?.dispose();
		label.material.dispose();
		node.label = undefined;
		this.labelled.delete(node.id);
	}

	/** Middle-tier labels follow the camera: the nearest nodes inside the budget get one. */
	private updateLabels(): void {
		const camera = this.graph.camera().position;
		const distances = [];
		for (const node of this.nodes) {
			if (node.graph.kind === "note" || node.x === undefined || node.y === undefined || node.z === undefined) continue;
			distances.push({ id: node.id, distance: Math.hypot(node.x - camera.x, node.y - camera.y, node.z - camera.z) });
		}
		const wanted = chooseLabelled(distances, this.labelled, this.budget);
		let added = 0;
		for (const node of this.nodes) {
			if (node.graph.kind === "note") continue;
			if (!wanted.has(node.id)) this.removeLabel(node);
			else if (node.label === undefined && added < LABELS_PER_PASS) {
				this.addLabel(node);
				added++;
			}
		}
	}

	/** Translate the camera and its orbit target together, so flying and orbiting share one set of controls. */
	private fly(seconds: number): void {
		let right = 0;
		let up = 0;
		let forward = 0;
		for (const key of this.heldKeys) {
			const axis = FLIGHT_KEYS[key];
			if (axis === undefined) continue;
			right += axis[0];
			up += axis[1];
			forward += axis[2];
		}
		if (right === 0 && up === 0 && forward === 0) return;

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
			.normalize()
			.multiplyScalar(speed * seconds);
		camera.position.add(step);
		controls.target.add(step);
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
				this.drag = null;
				return;
			}
		} else if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) {
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
	};

	private readonly onPointerMove = (e: PointerEvent): void => {
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
		if (this.pinch?.ids.includes(e.pointerId) === true) this.endPinch(this.pinch);
		const drag = this.drag;
		if (drag?.pointerId !== e.pointerId) return;
		this.drag = null;
		if (!drag.touch) return;
		const now = performance.now();
		const velocity = launchVelocity(estimateVelocity(this.samples, now), this.carry, now - this.touchDownAt);
		if (velocity.x !== 0 || velocity.y !== 0) this.orbitCoast = { drag, velocity };
	};

	/** The wheel zooms toward what is under the cursor, or sets the flight speed while flying. */
	private readonly onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		e.stopPropagation();
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
			this.lastDepth = node.distanceTo(camera.position);
			return node;
		}
		const depth = this.lastDepth ?? camera.position.distanceTo(this.orbitControls().target);
		return this.rayThrough(x, y).at(depth, new Vector3());
	}

	/** The centre of the node nearest client point (`x`, `y`) on screen, within `slop` px of its edge and the mist. */
	private nodeNear(x: number, y: number, slop: number): Vector3 | null {
		const camera = this.graph.camera() as PerspectiveCamera;
		const rect = this.graph.renderer().domElement.getBoundingClientRect();
		const forward = camera.getWorldDirection(new Vector3());
		// Screen px per world unit at distance 1.
		const scale = rect.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
		// exp(-(density·d)²) is 2% at density·d = 2: anything further is lost in the mist.
		const reach = 2 / this.fog.density;
		const centres: Vector3[] = [];
		const onScreen: ScreenNode[] = [];
		for (const node of this.nodes) {
			if (node.x === undefined || node.y === undefined || node.z === undefined) continue;
			const centre = new Vector3(node.x, node.y, node.z);
			const distance = centre.clone().sub(camera.position).dot(forward);
			if (distance <= 0 || distance > reach) continue;
			const ndc = centre.clone().project(camera);
			centres.push(centre);
			onScreen.push({
				x: rect.left + ((ndc.x + 1) / 2) * rect.width,
				y: rect.top + ((1 - ndc.y) / 2) * rect.height,
				radius: (Math.cbrt(nodeSize(node.graph)) * NODE_REL_SIZE * scale) / distance,
				distance,
			});
		}
		return centres[pickNode(onScreen, x, y, slop)] ?? null;
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
			else this.graph.pauseAnimation();
		}
		if (!shown) {
			this.heldKeys.clear();
			return;
		}
		const seconds = this.lastFrame === 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
		this.lastFrame = now;
		this.startPendingFlight();
		this.fly(seconds);
		this.coast(Math.min(seconds * 1000, MAX_FRAME_MS));
		const controls = this.orbitControls();
		const mist = MIST / Math.max(MIST_MIN_DISTANCE, this.graph.camera().position.distanceTo(controls.target));
		this.fog.density += (mist - this.fog.density) * (1 - Math.exp(-seconds / MIST_EASE));
		if (now - this.lastLabelPass >= LABEL_PASS_MS) {
			this.lastLabelPass = now;
			this.updateLabels();
		}
	};
}
