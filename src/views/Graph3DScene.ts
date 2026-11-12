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
	Line,
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
import { Graph3DPerf } from "./Graph3DPerf";
import { Graph3DGizmos } from "./Graph3DGizmos";
import { Graph3DSticks } from "./Graph3DSticks";
import { Graph3DPlates, type PlateShape } from "./Graph3DPlates";
import { Graph3DNear, NEAR_FONT_PX, type NearDiagramRenderer, type NearMarkdownRenderer, type PanelLink, type TrackedEditor } from "./Graph3DNear";
import { isNoteRoot, type GraphEdgeKind, type GraphModel, type GraphNode } from "../graph3d/model";
import { edgeColor, linkDistance, nodeColor, nodeExtent, noteHue, spriteLabel, type Spacing } from "../graph3d/appearance";
import { cssColor, nodeLook, type NodeLook } from "../graph3d/node-style";
import { DEFAULT_OVERLAYS, continentStyleChanged, edgeShown, effectiveFlatten, kindOwnedOff, linkPulls, linkStrengthScale, pullChanged, spacingChanged, spacingOf, type Graph3DOverlays } from "../graph3d/overlays";
import type { NearTierSettings } from "../graph3d/lod";
import { STYLE_PX_PER_EM, panelBoxEm, plateWidthEm, styleWidthFromEm } from "../graph3d/near";
import { LINE_PLATE_HEIGHT } from "../graph3d/plates";
import { rotateAboutPivot } from "../graph3d/pivot";
import { grabPoint, type Sphere, sphereOnRay, stickyTurn } from "../graph3d/globe";
import { SPIN_FRICTION, WHEEL_EASE_EPSILON, WHEEL_EASE_SECONDS, launchSpin, stepCoast, type Coast } from "../graph3d/inertia";
import { dollyDistance, pickNode, wheelNotches, type ScreenNode } from "../graph3d/depth";
import { SwipeFeed, WheelClassifier, wheelAction } from "../graph3d/wheel-input";
import type { Placed } from "../graph3d/positions";
import { chargeStrengths, spaceCharges } from "../graph3d/settle";
import { FlatLayouts, facingPhase, flatCharges, flatDepth, flatIndex, flatLinkScale, flattenStep, notePush, type FlatBranch, type FlatPlace, type NoteBody } from "../graph3d/flatten";
import { FAR_SIDE_GLSL, showsText } from "../graph3d/far-side";
import { Graph3DBoundaries, type BoundarySurface } from "./Graph3DBoundaries";
import { Graph3DHints } from "./Graph3DHints";
import { Graph3DRibbons } from "./Graph3DRibbons";
import { HINT_BASE_PX, HINT_EM_RATIO, chooseHints, exitDistance, hintBox, hintFade, hintSizeFade, hintText, hintedKind, readableAngle, stackHints, type HintProbe, type HintSpan } from "../graph3d/edge-hints";
import { branchEnds, dashOf, hierarchyDepths, type TaperEnds } from "../graph3d/taper";
import { FOCUS_DIM_GLSL, plateVisibility } from "../graph3d/focus";
import { PlanetWorld, hoverPose, type Lane, laneArc, laneBow, planetTrees, surfaceArc, type ContinentStyle, type TangentFrame } from "../graph3d/planets";
import { gestureFor, movedPastSlop, type PointerGesture } from "../pointer-gesture";
import { flightPose, glideEnd, glidePose, shiftGlide, startFlight, startTrip, tripPose, viewingDistance, type Flight, type Glide, type Trip, type Vec3 } from "../graph3d/flight";
import { atPose, blendPose, hoverFlightPose, restingUp, rideBlend, startHover, type CameraState, type HoverFlight } from "../graph3d/hover";
import { farEnd, pickEdge, type DrawnEdge } from "../graph3d/edgepick";
import { enclosingSphere, fitDistance } from "../graph3d/fit";
import { keepScale, type ScaleBase } from "../graph3d/keep-scale";
import { panOnto, plateInset, project, seedBeside, turnToSee, type CameraPose, type Inset } from "../graph3d/framing";
import { linkClickAction, releaseIsClick, type LinkClick } from "../graph3d/links";
import { threadSegments } from "../graph3d/trails";
import { easeLook } from "../graph3d/look-ease";
import { gizmoZoom, type GizmoKind } from "../graph3d/gizmos";
import { flightAxes, stickLook, stickMove, type FlightAxes } from "../graph3d/joysticks";
import { bandOffset, type VisibleBand } from "../graph3d/edit";
import { boxHits, boxRect, heldInto, tapToggles, toggled, type ScreenPoint } from "../graph3d/selection";
import { frameDistance } from "../graph3d/liftoff";
import { arrowCandidates, pickInDirection, type Arrow, type ScreenOffset } from "../graph3d/arrow-nav";
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
	/** In the multi-select (`Graph3DScene.selection`): its plate wears the selection border. */
	selected?: boolean;
	/** A find bar match (`Graph3DScene.found`): its plate and panel wear the find border. */
	found?: boolean;
	/** Planets mode: the plate lies on its planet's surface in this frame (`planets.ts`). */
	frame?: TangentFrame;
	/**
	 * The node's `osmosis-styles` look (`nodeLook` of `graph.style`), read by
	 * the plates and the near tier. Also carries the style's `width` and
	 * `branchLine` for the renderers that will draw them. Renewed by every `setData`.
	 */
	look: NodeLook;
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
function dimWithFocus(material: Material, focus: { value: number }, round = false, farSide = false): void {
	// three.js keys compiled programs by this function's source, which `round` and `farSide` don't change.
	material.customProgramCacheKey = () => `osmosis-focus${round ? "-round" : ""}${farSide ? "-far" : ""}`;
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uFocus = focus;
		// `farSide`: a vertex with an `aCore` (w = 1) on its planet's far side is dimmed (`far-side.ts`); the colour must be RGBA.
		const far = farSide ? `attribute vec4 aCore;\n${FAR_SIDE_GLSL}\n` : "";
		shader.vertexShader = shader.vertexShader
			.replace("void main() {", `varying float vFocusDepth;\n${far}void main() {`)
			.replace("#include <color_vertex>", farSide ? "#include <color_vertex>\nif (aCore.w > 0.5) vColor.a *= farSideKeep(position - aCore.xyz, position);" : "#include <color_vertex>")
			.replace("#include <fog_vertex>", "#include <fog_vertex>\nvFocusDepth = -mvPosition.z;");
		shader.fragmentShader = shader.fragmentShader
			.replace("void main() {", `varying float vFocusDepth;\n${FOCUS_DIM_GLSL}\nvoid main() {${round ? "\nif (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;" : ""}`)
			.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= 1.0 - focusDim(vFocusDepth);");
	};
}

/** A link's rest length from its kind and the plates or panels at its ends (d3 has resolved both ends to nodes by then). */
function plateLinkDistance(link: EngineLink, spacing: Spacing): number {
	const [source, target] = [link.source as EngineNode, link.target as EngineNode];
	return linkDistance(link.kind, source.extent, target.extent, spacing);
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
	/** The selection border's colour. */
	accent: string;
	/** The find match border's colour. */
	found: string;
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
	onNodeClick: (node: GraphNode, selectOnly: boolean) => void;
	/** A ride along an edge (follow a link) reached its plate. The view selects it, but not as a click on the plate; the focus note stays. */
	onNodeArrived: (node: GraphNode) => void;
	/** A click on a link in a near-tier panel that fires (see `linkClickAction`). */
	onLinkClick: (link: PanelLink, action: Exclude<LinkClick, "none" | "node">) => void;
	/** A click on a task checkbox in a near-tier panel (it is the checkbox line's own box); the view toggles it. */
	onCheckboxClick: (node: GraphNode) => void;
	/** A second click or tap on a node, close in time and place to the first. True when the view took it (it opened an editor), so the scene does nothing more with it. */
	onNodeDoubleClick: (node: GraphNode) => boolean;
	/** A click or tap on the canvas while the inline editor is open: the view saves the edit, then the click goes on as usual. */
	onClickWhileEditing: () => void;
	/** A link drag released on another node at client (`x`, `y`): line `from` is dropped onto `to`, a line or a note. */
	onLinkDrop: (from: GraphNode, to: GraphNode, x: number, y: number) => void;
	/** A width drag on a selected line's panel ended at `width`, a `width` style in mind-map px (`styleWidthFromEm`). The view writes it; it resolves (or rejects) once the write has landed. */
	onResizeNode: (node: GraphNode, width: number) => Promise<void>;
	/** While the toolbar's Add link is armed (`setLinkPicking`): a click or tap, on the plate under it (null: empty space). It neither selects nor flies. */
	onLinkPick: (node: GraphNode | null) => void;
	/** A right-click that stayed put on a line or note plate, at client (`x`, `y`). (On touch a held finger multi-selects instead; the node menu is the toolbar's ⋮.) */
	onContextMenu: (node: GraphNode, x: number, y: number) => void;
	/** Renders a near-tier panel's Markdown (`MarkdownRenderer.render`, from the view, which has the app). */
	renderMarkdown: NearMarkdownRenderer;
	/** Draws an occluded diagram in a near-tier panel (relational study's occlusion cards). */
	renderDiagram: NearDiagramRenderer;
	/** Whether the walk and fly joysticks start shown (the Osmosis bar's toggle, `showSticks`). */
	sticks: boolean;
	/** Whether the rotate, pan and zoom gizmos are built (a desktop with no touch screen, `gizmosAvailable`). */
	gizmos: boolean;
	/** Whether a plain plate click only selects the plate, with no flight and no history step. Read at each click, so it is per device and shared by every 3D view. */
	clickSelectsOnly: () => boolean;
	/** The near tier's panel detail and live-panel limit, read every frame: per device and shared by every 3D view. */
	nearTier: () => NearTierSettings;
	/** The selection changed, or new data may have restyled or renamed what is selected (the style sidebar's Node tab follows it). */
	onSelectionChange: () => void;
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
	/**
	 * Pressed on a planet's surface: the grabbed point of the surface (world
	 * space, on a sphere of `radius` about `pivot`, the core) that the drag keeps
	 * under the pointer (`stickyTurn`). Null for any other pivot.
	 */
	grab: { point: Vector3; radius: number } | null;
	/** Yaw and pitch (radians) the drag has turned so far, sampled for the release spin. */
	turned: Vec;
}

/** A touchpad swipe turning or panning the view like a drag (`onWheel`, moved once a frame by `stepSwipe`), or a held gizmo (`beginGizmo`). */
interface Swipe {
	pan: boolean;
	/** A drag from where the cursor was, moved by the swipe's deltas: its pivot, grab and running pointer place. */
	drag: RotateDrag;
	/** The view depth a pan moves at: the aimed point's, as for a pinch. */
	depth: number;
	startAt: number;
	lastAt: number;
}

/** A link drag in progress (edit mode): line `from` pulled toward whatever it is dropped on. */
interface LinkDrag {
	pointerId: number;
	touch: boolean;
	from: EngineNode;
	/** Where the press began, and where the pointer is now (client px). */
	startX: number;
	startY: number;
	x: number;
	y: number;
	/** Moved past the click slop: it is a drag now, not a click. */
	active: boolean;
	/** The node it would drop on now, and the colour that node's plate had before it was highlighted. */
	over: EngineNode | null;
	overColor: Color | null;
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
/**
 * Looking around turns slower than orbiting, or a small drag swings the whole view.
 * Mouse-look was PI and felt too sensitive; 0.6 PI plus the ease (`easeLook`) settles it.
 */
const LOOK_RATE = Math.PI * 0.6;
/** How far from a node's edge, in screen px, a press or a zoom still aims at that node. */
const PICK_SLOP_PX = { mouse: 16, touch: 32 };
/** How far from a panel's width handle a press still grabs it, in px. */
const RESIZE_SLOP_PX = { mouse: 4, touch: 14 };
/** How far outside a task checkbox's drawn box a press still ticks it: the box is a few pixels wide at panel scale. */
const CHECKBOX_SLOP_PX = { mouse: 4, touch: 14 };
/** Two clicks this close in time and place are a double click (a double tap uses the wider distance). */
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_PX = { mouse: 8, touch: 32 };
/** The orbit target stays at least this far ahead, so a zoom that passes through it keeps going. */
const MIN_DEPTH = 10;
/** Seconds for the mist to settle when the zoom re-aims at a nearer or farther depth, so it doesn't pop. */
const MIST_EASE = 0.25;
/** Each wheel notch while flying multiplies the flight speed by this, up to the limit either way. */
const FLIGHT_SCALE_STEP = 1.25;
const FLIGHT_SCALE_LIMIT = 8;
const SPEED_READOUT_MS = 1200;
/** Plate heights in world units: note titles, and every other label (`LINE_PLATE_HEIGHT`, in `plates.ts`). */
const CORE_PLATE_HEIGHT = 10;
/** Widest plate text, in ems, before it is cut with an ellipsis. */
const CORE_PLATE_MAX_EM = 30;
const LINE_PLATE_MAX_EM = 20;
/**
 * The camera's near plane. 3d-force-graph's 0.1 leaves too little depth
 * precision for opaque plates to order by depth at a distance; nothing is
 * looked at closer than this anyway (the orbit target stays `MIN_DEPTH` ahead).
 */
const CAMERA_NEAR = 1;

/** Screen px between a plate's edge and its edge hint. */
const HINT_GAP_PX = 4;
/** An edge hint's text height in world units: a fixed fraction of a line plate's text, so hints scale with the world. */
const HINT_EM_WORLD = HINT_EM_RATIO * Graph3DNear.emWorld(LINE_PLATE_HEIGHT);
/** How far from a plate a flight stops: a note's root (its core or sole H1: arriving there is arriving at the note), and every other node. Arrow keys and edge rides keep the current distance instead (`viewingDistance`). */
const NOTE_STAND_OFF = 160;
const LINE_STAND_OFF = 70;
/** Flight speed as a fraction of the camera's distance to its orbit target, per second. */
const FLIGHT_SPEED = 0.9;
const FLIGHT_MIN_SPEED = 40;
const FLIGHT_MS = 1000;
/** An edit's turn or pan (`glide`): short, since it covers little ground. */
const GLIDE_MS = 400;
/** Px to spare between an edited line's plate and the edge of the view, when the camera turns to show it. */
const EDIT_MARGIN_PX = 48;
/** Ticks after new data before the layout has spread out enough to aim at. */
const SETTLE_TICKS = 80;
/** d3's default many-body strength; see `settle.ts` for which nodes it acts on. */
const CHARGE = -30;
const FADE_MS = 500;
const LINK_OPACITY = 0.45;
/** World units a mind-map px is on a line plate (`STYLE_PX_PER_EM` px an em), for branch styles' thicknesses and dashes. */
const TAPER_PX_WORLD = Graph3DNear.emWorld(LINE_PLATE_HEIGHT) / STYLE_PX_PER_EM;
/** Planets mode: a same-note link (tunnel) is dimmer than an edge, a link between planets (lane) brighter. */
const TUNNEL_OPACITY = 0.2;
const LANE_OPACITY = 0.8;
/** Segments in a surface arc and in a lane. */
const ARC_SEGMENTS = 6;
const LANE_SEGMENTS = 12;
/** Link particles: world units a second, and their size in world units (a line plate is 5 tall). */
const PARTICLE_SPEED = 25;
const PARTICLE_SIZE = 1.6;
const PARTICLE_OPACITY = 0.9;
/** The travelled thread of a due-driven study path: warm, and fully opaque, so it stands out from the edges. */
const THREAD_COLOR = "#ffb347";
/** A press that moves less than this, in px, is a click rather than a drag. */
const CLICK_SLOP_PX = 6;
/** A finger held this long on a plate, without moving past the click slop, adds it to the selection instead of being a tap (the mind map's hold). */
const LONG_PRESS_MS = 400;

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
	/** Each note's 2D layout at plate sizes, for its flat branches (see `graph3d/flatten.ts`). */
	private readonly flatLayouts = new FlatLayouts();
	/** The flat branches of the loaded nodes at the flatten slider's depth, and where each of their lines sits. */
	private flatBranches: FlatBranch[] = [];
	/** Planets mode: each note's planet, laid out once, and its surface plates' places (`planets.ts`). Empty in other layouts. */
	private readonly world = new PlanetWorld();
	/** Nodes on no planet (tags, files, ghosts), which planets push out of themselves. */
	private stars: EngineNode[] = [];
	/** Planets mode: the pulling links between bodies (a planet, or a star), which `PlanetWorld.step` pulls rather than d3 (`buildLanes`). */
	private lanes: Lane[] = [];
	private flatPlaces = new Map<string, FlatPlace>();
	/** Each loaded note's ring phase (`ringDirections`), by core ID: captured from the camera when the note is first loaded or becomes the focus note, and kept until then. */
	private ringPhases = new Map<string, number>();
	/** Notes to recapture a ring phase for at the next `pushData`, with the phase to give it (null: face the camera). */
	private pendingFaces = new Map<string, number | null>();
	/** Each note's core with the many-body strength its flat lines left it, and the charged nodes it pushes (`notePush`). */
	private noteCores = new Map<string, { body: EngineNode; strength: number }>();
	private charged: NoteBody[] = [];
	/** The nodes not departing, by ID, for the flatten force. */
	private live = new Map<string, EngineNode>();
	private readonly plates: Graph3DPlates;
	/** Live Markdown panels over the nearest plates. */
	private readonly near: Graph3DNear;
	private readonly edges: LineSegments<BufferGeometry, LineBasicMaterial>;
	/** Hierarchy edges as tapered ribbons, when the Settings taper them (`Graph3DRibbons`, `taper.ts`); the rest stay `edges`. */
	private readonly ribbons: Graph3DRibbons;
	/** Outline depth of every node a hierarchy edge reaches, for the links it was counted from. */
	private taperDepths: { links: EngineLink[]; depths: Map<string, number>; edges: number } | null = null;
	/** Branch line colours from `osmosis-styles`, parsed once each (null: not one 3D draws, so the edge kind's colour). */
	private readonly branchColors = new Map<string, Color | null>();
	/** Every node's boundary (cloud), one mesh (`Graph3DBoundaries`). */
	private readonly boundaries: Graph3DBoundaries;
	/** The edge-hint labels, a small pool (`Graph3DHints`), and the link and embed edges they are drawn for, filtered again only when the links change. */
	private readonly hints = new Graph3DHints();
	private readonly hintPoint = new Vector3();
	private hintLinks: { links: EngineLink[]; hinted: EngineLink[] } | null = null;
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
	/** The links that pull under the Overlays now (`linkPulls`); `linkStrength` gives every other one none. */
	private pulling = new Set<EngineLink>();
	/** Node positions or opacities changed since the plates and edges were last written. */
	private dirty = false;
	/** Nodes came, went, or changed text or colour: every plate attribute must be rewritten. */
	private layoutDirty = false;
	/** A left-button or one-finger press that may yet be a click. */
	private press: { pointerId: number; x: number; y: number; touch: boolean } | null = null;
	/** The last click on a node, to tell a double click. The node is kept, since the first click flies the camera away from where the second lands. */
	private lastClick: { at: number; x: number; y: number; node: GraphNode } | null = null;
	private hover: { x: number; y: number } | null = null;
	private theme: SceneTheme = { background: "#000000", text: "#ffffff", plate: "#202020", font: "sans-serif", accent: "#7f6df2", found: "#e0ac00" };
	private frame = 0;
	private lastFrame = 0;
	private paused = false;
	private pendingFlight: string | null = null;
	private pendingFlightWaits = false;
	/** A Fit waiting for the layout to spread out after new data (`fitAll(true)`). */
	private pendingFit = false;
	/** The node last flown to: the focused node, whose links (and its neighbours') fire on a click. */
	private focusId: string | null = null;
	/**
	 * The multi-select: the nodes wearing the selection border, which actions
	 * on a selection take. Apart from `focusId`, which stays the primary (the
	 * plate last clicked) that F, history and single-line keys act on.
	 */
	private selection = new Set<string>();
	/** The find bar's matches (`setFound`); the current one is also the selection. */
	private found: ReadonlySet<string> = new Set();
	/** A Shift+drag box select in progress, from (`x0`, `y0`); `el` is its rubber band, drawn once it moves past the click slop. */
	private box: { pointerId: number; x0: number; y0: number; el: HTMLElement | null } | null = null;
	/** The flight under way, aimed at its node wherever the node is now. */
	private flight: { node: EngineNode; flight: Flight; duration: number } | null = null;
	/**
	 * A ride along an edge toward `to` (follow a link), aimed at the edge's two
	 * ends wherever they are now. With `lands`, `to` is a planet's surface plate
	 * and the ride blends into the hover view over it (`blendPose`); `up` is the
	 * camera's up when the ride began.
	 */
	private ride: { from: EngineNode; to: EngineNode; trip: Trip; lands: boolean; up: Vec3 } | null = null;
	/** Planets mode: a flight into the hover view over `node`'s plate, `distance` out on its normal (`hoverOver`). */
	private hoverFlight: { node: EngineNode; distance: number; flight: HoverFlight } | null = null;
	/**
	 * The camera rests over a plate in a pole cap, where world +y can't put the
	 * plate's up at the top of the screen, so `camera.up` is left at the plate's
	 * up (`restingUp`). Otherwise a `camera.up` other than world +y is a hover's
	 * turn that something cut short, and `levelUp` sets it back.
	 */
	private capRest = false;
	/**
	 * After a flight, the camera moves with its node until the node settles, or
	 * the user takes over. A `track` (a re-settle after a structural edit) is
	 * not given up when the user orbits or zooms: their moves add to it.
	 */
	/** `steer`: an arrow key's glide (`glideTo`) is under way to this node, and moves with it. */
	private follow: { node: EngineNode; at: Vec3; track?: boolean; steer?: boolean } | null = null;
	/** A structural edit's re-settle is under way (`reshape`): until it cools, an editor opening doesn't pin its line, and the camera tracks the line instead. */
	private editSettling = false;
	/** An edit's turn (desktop) or pan (phone) under way, to a fixed pose. */
	private glide: Glide | null = null;
	private ticksSinceData = 0;
	private controlSettings: SceneControls;
	private drag: RotateDrag | null = null;
	/** Mouse-look drag px not yet turned into camera rotation; `tick` eases the camera through them. */
	private lookPending = { x: 0, y: 0 };
	private pinch: Pinch | null = null;
	/** Edit mode is on: Alt+drag from a line pulls out a link (mouse or pen; a finger always orbits); a plain mouse drag still orbits. */
	private linkMode = false;
	/** The toolbar's Add link is armed: the next click or tap picks the link's target (`onLinkPick`). Drags, holds and pinches navigate as usual. */
	private linkPicking = false;
	/** A width drag in progress on a panel's handle: where it started, and the panel's width then (px before its scale) and scale. */
	private widthDrag: { pointerId: number; node: GraphNode; startX: number; width: number; scale: number; current: number } | null = null;
	private linkDrag: LinkDrag | null = null;
	/** A right-button press that has not moved past the shared slop (`movedPastSlop`): released, it opens the context menu. (Moving it is OrbitControls' pan.) */
	private menuPress: { pointerId: number; x: number; y: number } | null = null;
	/** A finger down on a plate, waiting out `LONG_PRESS_MS` to add it to the selection. */
	private longPress: { pointerId: number; x: number; y: number; timer: number } | null = null;
	/** Touch selection mode, begun by a held finger (as in the mind map): a tap then toggles a plate in or out of the selection, until a tap on empty space or the selection empties. */
	private touchSelecting = false;
	/** The rubber band from the dragged line to the pointer. */
	private linkLine: Line<BufferGeometry, LineBasicMaterial> | null = null;
	/** The node whose editor is open: a press then orbits rather than linking, and leaves the editor its focus. */
	private editingId: string | null = null;
	/** Phone: the part of the window the on-screen keyboard leaves visible while editing; the picture is shifted to centre on it. */
	private band: VisibleBand | null = null;
	/** Phone: the stage size at which the camera has its default field of view (`graph3d/keep-scale.ts`). */
	private scaleBase: ScaleBase | null = null;
	/** The camera's field of view as the engine made it; a phone narrows it while the stage is shorter. */
	private readonly defaultFov: number;
	private readonly touches = new Map<number, { x: number; y: number }>();
	/** Distance from the camera of the last point aimed at; a press or zoom over empty space reuses it. */
	private lastDepth: number | null = null;
	/**
	 * Momentum (`graph3d/inertia.ts`): pointer positions (or the pinch
	 * midpoint), a drag's turn so far, and ln(zoom), for the release velocity.
	 */
	private samples: Sample[] = [];
	private turnSamples: Sample[] = [];
	private zoomSamples: Sample[] = [];
	/** A released drag spinning on (radians/ms) about its pivot, or about the camera for a touch look. */
	private orbitCoast: { pivot: Vector3; look: boolean; coast: Coast } | null = null;
	private panCoast: { depth: number; coast: Coast } | null = null;
	private zoomCoast: { x: number; y: number; velocity: number } | null = null;
	/** The wheel's zoom still to glide out (ln zoom), aimed at the pointer's last place (`easeWheel`). */
	private wheelZoom: { x: number; y: number; pending: number } | null = null;
	/** Touchpad or mouse wheel, decided once per gesture (`graph3d/wheel-input.ts`). */
	private readonly wheelSource = new WheelClassifier();
	/** The Control key is physically down, so a ctrl-wheel is Ctrl + scroll and not Chromium's synthetic touchpad pinch. */
	private ctrlHeld = false;
	private swipe: Swipe | null = null;
	/** When the swipe's events came, collected for `stepSwipe` (`graph3d/wheel-input.ts`). */
	private readonly swipeFeed = new SwipeFeed();
	/** A rotate or pan gizmo held and moving (`beginGizmo`): a drag about the orbit target, ended by its release, never by `stepSwipe`. */
	private gizmoDrag: Swipe | null = null;
	/** A mouse pan (OrbitControls' right or Ctrl drag) in progress, sampled so its release can coast. */
	private mousePan: number | null = null;
	/** The spin a press interrupted, which a flick that follows adds to. */
	private carry: Vec = { x: 0, y: 0 };
	private touchDownAt = 0;
	/** The press now down stopped a coast, and so is not also a click or tap that flies. */
	private stoppedCoastOnDown = false;
	private readonly speedEl: HTMLElement;
	private readonly perf: Graph3DPerf;
	private readonly sticks: Graph3DSticks;
	private readonly gizmos: Graph3DGizmos | null = null;
	private speedTimer = 0;
	readonly heldKeys = new Set<string>();

	constructor(private readonly container: HTMLElement, private readonly options: SceneOptions) {
		// The near tier's CSS2D and CSS3D renderers have to be handed over at construction:
		// the engine sizes them and draws them after the canvas every frame.
		this.near = new Graph3DNear(options.renderMarkdown, options.renderDiagram, Graph3DNear.emWorld(LINE_PLATE_HEIGHT), options.nearTier);
		this.graph = new ForceGraph3D(container, {
			controlType: "orbit",
			// CSS2DRenderer and CSS3DRenderer are renderers by shape, not by type.
			extraRenderers: [this.near.renderer as never, this.near.renderer3d as never],
		}) as unknown as ForceGraph3DInstance<EngineNode, EngineLink>;
		const camera = this.graph.camera() as PerspectiveCamera;
		camera.near = CAMERA_NEAR;
		camera.updateProjectionMatrix();
		this.defaultFov = camera.fov;
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
		container.addEventListener("mousedown", this.onMouseDown);
		// Capture phase: Shift+drag must be ours before OrbitControls, on the canvas below, pans with it.
		container.addEventListener("pointerdown", this.onPointerDownCapture, { capture: true });
		container.addEventListener("contextmenu", this.onContextMenuEvent);
		window.addEventListener("pointermove", this.onPointerMove);
		window.addEventListener("pointerup", this.onPointerUp);
		window.addEventListener("pointercancel", this.onPointerUp);
		// Capture phase, so it runs before OrbitControls' wheel listener on the canvas and can stop it.
		container.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
		window.addEventListener("keydown", this.onModifierKey, { capture: true });
		window.addEventListener("keyup", this.onModifierKey, { capture: true });
		window.addEventListener("blur", this.onWindowBlur);
		// The bottom-left corner: the flight speed readout (the controls help is the Osmosis bar's last button).
		const corner = container.createDiv({ cls: "osmosis-graph3d-corner" });
		this.speedEl = corner.createDiv({ cls: "osmosis-graph3d-speed" });
		this.sticks = new Graph3DSticks(container, options.sticks);
		if (options.gizmos) {
			this.gizmos = new Graph3DGizmos(container, {
				begin: (kind) => this.beginGizmo(kind),
				move: (kind, dx, dy) => this.moveGizmo(kind, dx, dy),
				end: (kind, released) => this.endGizmo(kind, released),
			});
		}

		// Links are measured between plate edges, not centres, so wide labels
		// don't pile up around their parent. d3 caches each link's distance when
		// the data changes; setTheme re-applies it when plates are re-measured.
		this.linkForce = this.graph.d3Force("link") as LinkForce | undefined;
		this.linkForce?.distance(this.linkDistanceOf);
		this.linkForce?.strength(this.linkStrength);
		// Settled nodes are pinned, and the many-body force skips most of them
		// (see settle.ts), which is what keeps a tick cheap in a large world.
		const charge = this.graph.d3Force("charge") as ManyBodyForce;
		charge.strength((node) => this.charge.get(node.id) ?? 0);
		const settleCharge = Object.assign((alpha: number) => charge(alpha), {
			initialize: (nodes: EngineNode[], ...args: unknown[]) => charge.initialize(nodes.filter((n) => this.charge.has(n.id)), ...args),
		});
		this.graph.d3Force("charge", settleCharge as never);
		// Flat lines leave the many-body force; their notes' cores push other notes for them.
		this.graph.d3Force("notes", ((alpha: number) => notePush(this.noteCores, this.charged, alpha)) as never);
		// Added last, so it runs after the other forces each tick: it lays flat
		// branches out in their slices, rigidly, and hands their pull to their heads.
		const keep = 1 - this.graph.d3VelocityDecay();
		this.graph.d3Force("flatten", ((alpha: number) => flattenStep(this.flatBranches, (id) => this.live.get(id), keep, alpha)) as never);
		// Planets mode, last of all: links between planets and stars pull each planet as one body (`buildLanes`), surface
		// plates hand their pull to their planet's core, planets collide by radius, and the plates are put back on their cores.
		// Nothing to do in other layouts.
		this.graph.d3Force("planets", ((alpha: number) => {
			if (this.world.size > 0) this.world.step((id) => this.live.get(id), this.stars, alpha, performance.now(), this.lanes);
		}) as never);
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
		// Edges dim with the plates, and on a planet's far side as its plates do.
		dimWithFocus(edgeMaterial, this.plates.focus, false, true);
		this.edges = new LineSegments(new BufferGeometry(), edgeMaterial);
		this.edges.frustumCulled = false;
		this.ribbons = new Graph3DRibbons((material) => dimWithFocus(material, this.plates.focus, false, true));
		this.thread = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: THREAD_COLOR, transparent: true, depthWrite: false }));
		this.thread.frustumCulled = false;
		const particleMaterial = new PointsMaterial({ size: PARTICLE_SIZE, vertexColors: true, transparent: true, depthWrite: false });
		dimWithFocus(particleMaterial, this.plates.focus, true);
		this.particles = new Points(new BufferGeometry(), particleMaterial);
		this.particles.frustumCulled = false;
		this.particles.visible = false;
		// Plates are opaque and write depth, so an edge behind a plate is hidden by it.
		this.boundaries = new Graph3DBoundaries(this.plates.focus, Graph3DNear.emWorld(LINE_PLATE_HEIGHT));
		this.graph.scene().add(this.boundaries.mesh, this.edges, this.ribbons.mesh, this.thread, this.particles, this.plates.group, this.near.group, this.hints.group);
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
		const modelIds = new Set(model.nodes.map((node) => node.id));
		for (const id of this.selection) if (!modelIds.has(id)) this.selection.delete(id);
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
			const look = nodeLook(graph.style);
			// A new width (a style, or a code block's longest line) lays the plate out again.
			const rewidth = look.width !== (existing.look?.width ?? null) || plateWidthEm(existing.graph)?.minEm !== plateWidthEm(graph)?.minEm;
			const relabel = rewidth || this.labelText(existing.graph) !== this.labelText(graph) || existing.graph.kind !== graph.kind;
			existing.graph = graph;
			existing.color.setStyle(this.colorOf(graph));
			// A style written in the mind map (or any edit to the note's frontmatter) lands with the reload it triggers.
			existing.look = look;
			if (relabel) {
				existing.shape = this.shapeFor(graph);
				// Flat branches are laid out at plate sizes.
				this.flatLayouts.clear();
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
		if (this.hoverFlight !== null && !ids.has(this.hoverFlight.node.id)) this.hoverFlight = null;
		if (this.follow !== null && (!ids.has(this.follow.node.id) || this.follow.node.departing)) {
			// A save gives the tracked line a new ID: track its successor, which the view has just focused (`Graph3DView.place`).
			const next = this.follow.track === true ? this.nodes.find((n) => n.id === this.focusId && !n.departing) : undefined;
			this.follow = next !== undefined && placed(next) ? { node: next, at: { x: next.x, y: next.y, z: next.z }, track: true } : null;
		}
		if (this.ride !== null && (!ids.has(this.ride.from.id) || !ids.has(this.ride.to.id))) this.ride = null;
		const lingering = this.links.filter((link) => {
			const [source, target] = [link.source as EngineNode, link.target as EngineNode];
			return (source.departing || target.departing) && ids.has(source.id) && ids.has(target.id);
		});
		this.links = [
			...model.edges.map((edge) => ({ kind: edge.kind, source: edge.source, target: edge.target, phase: noteHue(`${edge.source}>${edge.target}`) / 360 })),
			...lingering,
		];
		this.ticksSinceData = 0;
		this.applySelection();
		this.near.refreshColors();
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
			look: nodeLook(graph.style),
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

	/**
	 * Give each note core a ring phase that has none, or that `faceNote` asked
	 * to renew, so its first slice points at the camera: where the camera is
	 * now, which is on the side a flight to the note ends (`startFlight` keeps
	 * the viewing direction). A core the engine hasn't placed yet is measured
	 * from where the camera looks. Phases of notes no longer loaded are dropped.
	 */
	private capturePhases(live: readonly EngineNode[]): void {
		const cores = live.filter((node) => isNoteRoot(node.graph));
		const camera = this.graph.camera().position;
		for (const core of cores) {
			const asked = this.pendingFaces.get(core.id);
			if (asked === undefined && this.ringPhases.has(core.id)) continue;
			const at = core.x === undefined || core.y === undefined || core.z === undefined ? this.orbitControls().target : { x: core.x, y: core.y, z: core.z };
			this.ringPhases.set(core.id, asked ?? facingPhase(camera, at));
		}
		this.pendingFaces.clear();
		const loaded = new Set(cores.map((core) => core.id));
		for (const id of this.ringPhases.keys()) if (!loaded.has(id)) this.ringPhases.delete(id);
	}

	/**
	 * The note with core `id` is becoming the focus note: renew its ring phase
	 * at the next `setData`, from the camera as it is then, or `phase` if given
	 * (see `capturePhases`). Other notes keep theirs.
	 */
	faceNote(id: string, phase: number | null = null): void {
		this.pendingFaces.set(id, phase);
	}

	/**
	 * Hand the engine the current nodes and links, with the many-body force
	 * limited to what is still settling, and the flat branches at the flatten
	 * slider's depth (their rigid lines leave the many-body force, and their
	 * notes' cores push other notes for them: `notePush`).
	 */
	private pushData(): void {
		const live = this.nodes.filter((node) => !node.departing);
		this.live = new Map(live.map((node) => [node.id, node]));
		this.capturePhases(live);
		this.flatBranches = this.flatLayouts.branches(live.map((node) => node.graph), flatDepth(effectiveFlatten(this.overlays)), this.flatSize, (core) => this.ringPhases.get(core.id) ?? 0, this.overlays.nodeSpacing);
		this.flatPlaces = flatIndex(this.flatBranches);
		this.updatePlanets(live);
		// In planets mode only the planets' cores and the free-floating stars feel the many-body force.
		const charged = this.world.size === 0 ? live : live.filter((node) => (this.world.planetOf(node.id) ?? node.id) === node.id);
		this.charge = chargeStrengths(charged.map((node) => ({ ...node.graph, pinned: node.fx !== undefined })), CHARGE);
		// The spacing sliders scale the charge; what notes owe Note spacing beyond that is pushed from the note as a whole, like a flat branch's share.
		const owed = spaceCharges(this.charge, (id) => this.live.get(id)?.graph.path, spacingOf(this.overlays), this.world.size > 0);
		const shares = flatCharges(this.charge, this.flatBranches);
		this.noteCores = new Map();
		for (const node of live) {
			if (isNoteRoot(node.graph) && node.graph.path !== undefined) this.noteCores.set(node.graph.path, { body: node, strength: (shares.get(node.id) ?? 0) + (owed.get(node.graph.path) ?? 0) });
		}
		this.charged = shares.size === 0 && owed.size === 0 ? [] : live.filter((node) => this.charge.has(node.id)).map((node) => ({ body: node, path: node.graph.path }));
		this.degree.clear();
		this.pulling.clear();
		const ghosts = new Set(this.nodes.filter((node) => node.graph.kind === "ghost").map((node) => node.id));
		for (const link of this.links) {
			const [source, target] = [endId(link.source), endId(link.target)];
			if (!linkPulls(link.kind, ghosts.has(source) || ghosts.has(target), this.overlays)) continue;
			this.pulling.add(link);
			for (const id of [source, target]) this.degree.set(id, (this.degree.get(id) ?? 0) + 1);
		}
		this.buildLanes();
		this.dirty = true;
		this.layoutDirty = true;
		this.graph.graphData({ nodes: this.nodes, links: this.links });
	}

	/**
	 * Planets mode: lay out the planets that are new or changed (a changed one
	 * eases to its new shape), give every surface plate its frame, and wake the
	 * space forces only for planets a grown radius now overlaps. Other layouts
	 * drop the planets.
	 */
	private updatePlanets(live: readonly EngineNode[]): void {
		const planets = this.overlays.layout === "planets";
		if (!planets) {
			if (this.world.size > 0) this.world.clear();
		} else {
			const edges = this.links.map((link) => ({ kind: link.kind, source: endId(link.source), target: endId(link.target) }));
			const trees = planetTrees(live.map((node) => node.graph), edges);
			// Space by the full panel, not just the plate, so live panels don't cover each other (as `flatSize` does for slices).
			const sizeOf = (id: string): { width: number; height: number } => {
				const node = this.live.get(id);
				return node === undefined ? { width: 0, height: LINE_PLATE_HEIGHT } : this.flatSize(node.graph);
			};
			const style: ContinentStyle = { direction: this.overlays.continentDirection, balance: this.overlays.continentBalance };
			const grew = this.world.update(trees, sizeOf, style, (core) => this.ringPhases.get(core) ?? 0, performance.now(), true);
			for (const id of this.world.collisions(grew, (id) => this.live.get(id))) {
				const core = this.live.get(id);
				if (core !== undefined) core.fx = core.fy = core.fz = undefined;
			}
			this.world.placeAll((id) => this.live.get(id), performance.now(), true);
		}
		this.stars = [];
		for (const node of live) {
			const place = planets ? this.world.place(node.id) : undefined;
			if (place !== node.frame) this.layoutDirty = true;
			node.frame = place;
			if (planets && this.world.planetOf(node.id) === undefined) this.stars.push(node);
		}
	}

	/**
	 * A node's footprint in a flat branch: its plate, or the near-tier panel it
	 * would get if that is bigger, so panels side by side in one plane don't
	 * cover each other (as `extentFor` spaces 3D links).
	 */
	private readonly flatSize = (graph: GraphNode): { width: number; height: number } => {
		const node = this.live.get(graph.id);
		const plate = node?.shape ?? { width: 0, height: LINE_PLATE_HEIGHT };
		const panel = panelBoxEm(graph);
		const em = Graph3DNear.emWorld(LINE_PLATE_HEIGHT);
		return { width: Math.max(plate.width, (panel?.width ?? 0) * em), height: Math.max(plate.height, (panel?.height ?? 0) * em) };
	};

	/** The simulation has cooled: pin whatever was still free where it stopped. */
	private settle(): void {
		this.editSettling = false;
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
		this.flatLayouts.clear();
		this.linkForce?.distance(this.linkDistanceOf);
		this.buildLanes();
		this.dirty = true;
		this.layoutDirty = true;
	}

	setControls(settings: SceneControls): void {
		this.controlSettings = settings;
	}

	/**
	 * Apply the Overlays menu. A hidden edge kind no longer pulls (`linkPulls`;
	 * the Hierarchy toggle only hides the drawing), and "Links pull" off stops
	 * links pulling. A new force balance re-weights the links, and a new
	 * flatten position re-cuts the flat branches, and a new Note or Node spacing
	 * rescales the link lengths, charge and gaps. Any of these re-settles the
	 * loaded nodes (`reshape`): the one place settled nodes are let go on purpose.
	 */
	setOverlays(overlays: SceneOverlays): void {
		const reweigh = overlays.forceBalance !== this.overlays.forceBalance || pullChanged(this.overlays, overlays);
		const reflatten = effectiveFlatten(overlays) !== effectiveFlatten(this.overlays);
		// A new layout, or a new continent direction or balance in Planets, lays every note out afresh.
		const relayout = overlays.layout !== this.overlays.layout || continentStyleChanged(this.overlays, overlays);
		// The spacing sliders re-settle too; in Planets they (and Continent spacing) lay the planets out afresh (their gaps are layout, not forces).
		const respace = spacingChanged(this.overlays, overlays);
		const before = this.overlays;
		this.overlays = overlays;
		this.world.spacing = spacingOf(overlays);
		this.world.continentSpacing = overlays.continentSpacing;
		if (relayout || (respace && this.world.size > 0)) this.world.clear();
		if (reweigh) this.linkForce?.strength(this.linkStrength);
		if (respace) this.linkForce?.distance(this.linkDistanceOf);
		// pushData (in reshape) re-cuts the branches and re-reads which links pull, and the engine re-reads every link's strength.
		if (reweigh || reflatten || relayout || respace) this.reshape(!this.focusLeaves(before, overlays));
		this.particles.visible = overlays.particles;
		this.plates.setLabelsVisible(overlays.labels !== "none");
		// Planets mode tilts each panel onto its plate (CSS3D): a flat CSS2D panel over a tilted plate would hide it.
		this.near.setEnabled(overlays.labels === "all");
		this.near.setTilted(overlays.layout === "planets");
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

	/**
	 * Planets mode: the pulling links that run between bodies, for
	 * `PlanetWorld.step` to pull as d3 would if each planet were one node
	 * (see `pullLanes`). Rebuilt with the data, the Overlays and the plate sizes.
	 */
	private buildLanes(): void {
		this.lanes = [];
		if (this.world.size === 0) return;
		const spacing = spacingOf(this.overlays);
		for (const link of this.pulling) {
			const [source, target] = [this.live.get(endId(link.source)), this.live.get(endId(link.target))];
			if (source === undefined || target === undefined) continue;
			const [a, b] = [this.world.planetOf(source.id), this.world.planetOf(target.id)];
			if (a === b || (a === undefined && b === undefined)) continue;
			this.lanes.push({
				source: source.id,
				target: target.id,
				rest: linkDistance(link.kind, source.extent, target.extent, spacing),
				scale: linkStrengthScale(link.kind, this.overlays.forceBalance),
			});
		}
	}

	/** A link's rest length at the spacing sliders' position (see `plateLinkDistance`). */
	private readonly linkDistanceOf = (link: EngineLink): number => plateLinkDistance(link, spacingOf(this.overlays));

	/**
	 * d3's default link strength (one over the fewer pulling links at either
	 * end), scaled by the force balance, and none for a link that doesn't pull. An edge inside a rigid piece of a flat
	 * branch doesn't pull, and one from a ramp line to its root eases off as
	 * the line is pulled in (`flatLinkScale`).
	 */
	private readonly linkStrength = (link: EngineLink): number => {
		if (!this.pulling.has(link)) return 0;
		// Inside a planet nothing pulls: its layout is geometric. Between planets, or a planet and a star, `PlanetWorld.step` pulls (`buildLanes`).
		if (this.world.planetOf(endId(link.source)) !== undefined || this.world.planetOf(endId(link.target)) !== undefined) return 0;
		const flat = flatLinkScale(this.flatPlaces, endId(link.source), endId(link.target));
		if (flat === 0) return 0;
		const fewer = Math.min(this.degree.get(endId(link.source)) ?? 1, this.degree.get(endId(link.target)) ?? 1);
		return (flat * linkStrengthScale(link.kind, this.overlays.forceBalance)) / Math.max(1, fewer);
	};

	/** Whether the focused node's plate goes with this change of Overlays (a tag hub, ghost or attachment its toggle takes away). */
	private focusLeaves(before: SceneOverlays, after: SceneOverlays): boolean {
		const focus = this.focusId === null ? undefined : this.nodes.find((node) => node.id === this.focusId);
		return focus !== undefined && kindOwnedOff(focus.graph.kind, after.edges) && !kindOwnedOff(focus.graph.kind, before.edges);
	}

	/**
	 * The Hierarchy ⟷ organic slider, the flatten slider, or a toggle that
	 * changes which links pull moved, or a structural edit changed an outline
	 * (`edit`): let every loaded node go and re-settle under the new link
	 * weights, flat branches or shape, so the change shows at once.
	 *
	 * DELIBERATE EXCEPTIONS to "settled nodes never move" (Sawyer), five in
	 * all: the force slider (2026-11-01), the flatten slider (2026-11-03), the
	 * Note and Node spacing sliders (2026-11-09; in Planets they lay the planets
	 * out afresh, as a Layout change does), the
	 * edge-kind and Links pull toggles (2026-11-07; the Hierarchy edge toggle is
	 * not one, it only hides the drawing), and structural edits (2026-11-08: a
	 * line added, deleted, moved or re-levelled, judged by `outlineChanged`;
	 * rewording a line is not one). It happens only here, in answer to the user
	 * doing one of those. Hops, text edits and data updates still keep settled
	 * nodes where they are.
	 *
	 * For the sliders and toggles the line being edited stays pinned, and the
	 * camera rides along with the focused node until the layout cools and
	 * `settle` pins everything again, unless `followFocus` is off (the focused
	 * plate is leaving: the camera stays where it is). After an edit the edited
	 * line is let go too, so it is laid out clear of its neighbours (and in its
	 * flat slice) rather than left where it was seeded. The camera tracks the
	 * focused node, the edited line, which the user's orbit and zoom don't
	 * break, so it stays in view however far the re-settle carries it; an
	 * editor that opens meanwhile moves the track onto its line (`setEditing`).
	 */
	reshape(followFocus = true, edit = false): void {
		// Planets mode: an edit re-lays out only its planet, which `pushData` (on the new data) already did,
		// easing its plates and waking the space forces only on a collision. The camera tracks the edited line.
		if (edit && this.world.size > 0) {
			const edited = this.nodes.find((node) => node.id === this.focusId && !node.departing);
			if (followFocus && this.flight === null && this.hoverFlight === null && edited !== undefined && placed(edited)) this.follow = { node: edited, at: { x: edited.x, y: edited.y, z: edited.z }, track: true };
			this.pushData();
			return;
		}
		let any = false;
		for (const node of this.nodes) {
			if (node.departing || (!edit && node.id === this.editingId)) continue;
			node.fx = node.fy = node.fz = undefined;
			any = true;
		}
		if (!any) return;
		if (edit) this.editSettling = true;
		const focus = this.nodes.find((node) => node.id === this.focusId && !node.departing);
		if (followFocus && this.flight === null && focus !== undefined && placed(focus)) {
			this.follow = { node: focus, at: { x: focus.x, y: focus.y, z: focus.z }, track: edit };
		}
		// Recomputes the many-body force for nodes that are all free again, and reheats the simulation.
		this.pushData();
	}

	resize(width: number, height: number): void {
		if (width > 0 && height > 0) {
			this.graph.width(width).height(height);
			// Phone: the keyboard shortens the stage (the WebView resizes despite
			// `overlaysContent`); scale the field of view with the height so the
			// map keeps its size on screen. Desktop keeps a fixed field of view.
			if (Platform.isMobile) {
				const kept = keepScale(this.scaleBase, width, height, this.defaultFov);
				this.scaleBase = kept.base;
				const camera = this.graph.camera() as PerspectiveCamera;
				if (camera.fov !== kept.fov) {
					camera.fov = kept.fov;
					camera.updateProjectionMatrix();
				}
			}
		}
		this.applyViewOffset();
	}

	/**
	 * Phone, while editing: `band` is the part of the window the on-screen
	 * keyboard leaves visible (null when the editor closes). The picture shifts
	 * up so its centre, where the line being edited is, sits mid-way down that
	 * part: an off-centre projection (`setViewOffset`), so picking, panels and
	 * the editor, which all project through the camera, stay lined up.
	 */
	setVisibleBand(band: VisibleBand | null): void {
		this.band = band;
		this.applyViewOffset();
	}

	private applyViewOffset(): void {
		const camera = this.graph.camera() as PerspectiveCamera;
		const rect = this.container.getBoundingClientRect();
		const offset = this.band === null ? 0 : bandOffset(rect.top, rect.height, this.band);
		if (offset !== 0 && rect.width > 0 && rect.height > 0) camera.setViewOffset(rect.width, rect.height, 0, offset, rect.width, rect.height);
		else if (camera.view?.enabled === true) camera.clearViewOffset();
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
		this.pendingFit = false;
		this.focusId = id;
		this.ride = null;
		this.startPendingFlight();
	}

	/**
	 * Arrow-key navigation: glide to node `id` and make it the focused node.
	 * The camera keeps its turn and its viewing distance (`viewingDistance`:
	 * how far ahead the focused node was, not the orbit target, which a wheel
	 * zoom re-seats wherever the cursor aimed), so screen up stays up and
	 * plates keep their size from hop to hop. A node still settling is
	 * followed, during the glide and after it, as a flight's is.
	 */
	glideTo(id: string): void {
		const node = this.nodes.find((n) => n.id === id && !n.departing);
		if (node === undefined || !placed(node)) return;
		this.pendingFlight = null;
		this.lookPending = { x: 0, y: 0 };
		const distance = this.viewingDistance();
		this.cancelFlight();
		this.focusId = id;
		if (this.hoverOver(node, distance)) return;
		const pose = this.cameraPose();
		const at = { x: node.x, y: node.y, z: node.z };
		this.glide = { from: { position: pose.position, target: pose.target }, to: glideEnd(pose.position, pose.target, at, distance), start: performance.now() };
		if (!this.settled(node)) this.follow = { node, at: { x: node.x, y: node.y, z: node.z }, steer: true };
	}

	/**
	 * The ribbon's Fit: glide back (or in) along the camera's line of sight until
	 * every loaded plate is in view (`enclosingSphere`, `fitDistance`). The
	 * camera keeps its turn, as `glideTo` does. With `afterLayout` (a map just
	 * opened), it waits for the layout to spread out first, as `flyTo` can;
	 * any move of the view meanwhile drops it.
	 */
	fitAll(afterLayout = false): void {
		this.pendingFit = afterLayout && this.ticksSinceData < SETTLE_TICKS;
		if (this.pendingFit) {
			this.pendingFlight = null;
			return;
		}
		const live = this.nodes.filter((n): n is EngineNode & Vec3 => !n.departing && placed(n));
		const sphere = enclosingSphere(live.map((n) => ({ x: n.x, y: n.y, z: n.z, r: n.extent / 2 })));
		if (sphere === null) return;
		const camera = this.graph.camera() as PerspectiveCamera;
		const pose = this.cameraPose();
		this.pendingFlight = null;
		this.lookPending = { x: 0, y: 0 };
		this.cancelFlight();
		this.glide = { from: { position: pose.position, target: pose.target }, to: glideEnd(pose.position, pose.target, sphere, fitDistance(sphere.r, camera.fov, camera.aspect)), start: performance.now() };
	}

	/**
	 * The ribbon's Zoom in and out: the wheel's own eased zoom, by `factor`
	 * (above 1 zooms in), aimed at the middle of the view.
	 */
	zoomStep(factor: number): void {
		const pending = this.wheelZoom?.pending ?? 0;
		this.cancelFlight();
		const box = this.container.getBoundingClientRect();
		this.wheelZoom = { x: box.left + box.width / 2, y: box.top + box.height / 2, pending: pending + Math.log(factor) };
	}

	/**
	 * The plate an arrow press moves the selection to from the primary
	 * (`selectedNodes()[0]`): of its parent, children, edge neighbours and
	 * siblings, the one closest to `arrow` on screen (`pickInDirection`).
	 * Plates behind the camera, or not drawn (fading out, or not placed yet),
	 * are skipped. Null with no selection, with the primary behind the camera,
	 * or with nothing in that direction.
	 */
	arrowTarget(arrow: Arrow): string | null {
		const primaryId = this.selectedNodes()[0]?.id;
		const primary = primaryId === undefined ? undefined : this.nodes.find((n) => n.id === primaryId);
		if (primary === undefined || !placed(primary)) return null;
		const camera = this.graph.camera() as PerspectiveCamera;
		const forward = camera.getWorldDirection(new Vector3());
		const point = new Vector3();
		const screen = (node: EngineNode & Vec3): { x: number; y: number } | null => {
			point.set(node.x, node.y, node.z).sub(camera.position);
			if (point.dot(forward) <= 0) return null;
			point.add(camera.position).project(camera);
			return { x: ((point.x + 1) / 2) * this.container.clientWidth, y: ((1 - point.y) / 2) * this.container.clientHeight };
		};
		const from = screen(primary);
		if (from === null) return null;
		const edges = this.links.map((link) => ({ kind: link.kind, source: endId(link.source), target: endId(link.target) }));
		const byId = new Map(this.nodes.map((node) => [node.id, node]));
		const offsets: ScreenOffset[] = [];
		for (const id of arrowCandidates(primary.id, edges)) {
			const node = byId.get(id);
			if (node === undefined || node.departing || node.opacity <= 0 || !placed(node)) continue;
			const to = screen(node);
			if (to !== null) offsets.push({ id, x: to.x - from.x, y: to.y - from.y });
		}
		return pickInDirection(offsets, arrow);
	}

	/** The node last flown to, the one edits and undo act on; null when it is gone from the graph. */
	focusedNode(): GraphNode | null {
		return this.focusId === null ? null : (this.nodes.find((node) => node.id === this.focusId)?.graph ?? null);
	}

	/** Make `id` the focused node without flying to it: re-selecting a node whose ID an edit changed. */
	setFocusId(id: string | null): void {
		this.focusId = id;
	}

	/** The selected nodes, the primary (`focusedNode`) first, then in scene order. */
	selectedNodes(): GraphNode[] {
		const nodes = this.nodes.filter((node) => this.selection.has(node.id) && !node.departing);
		const primary = nodes.findIndex((node) => node.id === this.focusId);
		if (primary > 0) nodes.unshift(...nodes.splice(primary, 1));
		return nodes.map((node) => node.graph);
	}

	/** Replace the selection with `ids`. */
	select(ids: Iterable<string>): void {
		this.selection = new Set(ids);
		this.applySelection();
	}

	/** Empty the selection (Escape, a click on empty space). True when something was selected. */
	clearSelection(): boolean {
		this.touchSelecting = false;
		if (this.selection.size === 0) return false;
		this.select([]);
		return true;
	}

	/** An edit gave selected lines new IDs: each `from` that is selected is replaced by its `to`. */
	carrySelection(pairs: ReadonlyMap<string, string>): void {
		let changed = false;
		for (const [from, to] of pairs) {
			if (!this.selection.delete(from)) continue;
			this.selection.add(to);
			changed = true;
		}
		if (changed) this.applySelection();
	}

	/** Mark the find bar's matches on their plates and panels; an empty set clears the marks. */
	setFound(ids: ReadonlySet<string>): void {
		this.found = ids;
		this.applyFound();
		this.dirty = this.layoutDirty = true;
	}

	private applyFound(): void {
		for (const node of this.nodes) node.found = this.found.has(node.id) && !node.departing;
		this.near.setFound(this.found);
	}

	/** Put the selection border on the selected nodes' plates and panels, and take it off the rest. */
	private applySelection(): void {
		for (const node of this.nodes) node.selected = this.selection.has(node.id) && !node.departing;
		this.near.setSelected(this.selection);
		this.applyFound();
		this.dirty = this.layoutDirty = true;
		this.options.onSelectionChange();
	}

	/** A line plate's height in world units, for the 2D/3D toggle's scale (`graph3d/liftoff.ts`). */
	get linePlateHeight(): number {
		return LINE_PLATE_HEIGHT;
	}

	/**
	 * The 2D/3D toggle's lift-off: stand the camera square over `target`,
	 * looking down -z with y up, back far enough to see `height` world units of
	 * the z = 0 plane edge to edge: the view the mind map showed. No flight; the
	 * mist is set for the new distance at once. The camera then rides along
	 * with node `followId` while the lifting layout carries it, until it
	 * settles, as it does after a forces change (`reshape`).
	 */
	standOver(target: Vec3, height: number, followId: string | null): void {
		const camera = this.graph.camera() as PerspectiveCamera;
		const controls = this.orbitControls();
		const distance = frameDistance(height, camera.fov);
		this.pendingFlight = null;
		this.lookPending = { x: 0, y: 0 };
		this.cancelFlight();
		camera.up.set(0, 1, 0);
		camera.position.set(target.x, target.y, target.z + distance);
		controls.target.set(target.x, target.y, target.z);
		controls.update();
		this.lastDepth = distance;
		this.fog.density = (MIST * this.overlays.mist) / Math.max(MIST_MIN_DISTANCE, distance);
		const node = followId === null ? undefined : this.nodes.find((n) => n.id === followId);
		if (node?.x !== undefined && node.y !== undefined && node.z !== undefined && node.fx === undefined) {
			this.follow = { node, at: { x: node.x, y: node.y, z: node.z } };
		}
		this.dirty = true;
	}

	/**
	 * How tall, in screen px, a line plate is drawn at node `id`'s depth (at
	 * the orbit target's when `id` is null or gone), for the 2D/3D toggle to
	 * land the mind map at the same scale. Null while the view has no size.
	 */
	linePlatePixels(id: string | null): number | null {
		const camera = this.graph.camera() as PerspectiveCamera;
		const height = this.container.clientHeight;
		if (height <= 0) return null;
		const node = id === null ? undefined : this.nodes.find((n) => n.id === id && !n.departing);
		const at = node?.x !== undefined && node.y !== undefined && node.z !== undefined ? new Vector3(node.x, node.y, node.z) : this.orbitControls().target;
		return (LINE_PLATE_HEIGHT * height) / (2 * this.viewDepth(at) * Math.tan((camera.fov * Math.PI) / 360));
	}

	/**
	 * Start editing node `id` in place, with `editor` kept over its plate every
	 * frame by the near tier (its panel hidden under it), or stop (null). False
	 * when the node is not in the scene, so there is nothing to edit over.
	 *
	 * The node is pinned where it is, so a layout still settling can't carry it
	 * off while it is edited, and the edit's own reload puts its successor on
	 * the same spot (`Graph3DView.place`). A flight elsewhere stops. While a
	 * structural edit's re-settle is under way, it is left free to find its
	 * place, and the camera tracks it instead (see `reshape`).
	 *
	 * The camera trusts the view (Sawyer, 2026-11-03): it never flies or zooms
	 * for an edit, however small the text. On desktop it stays put unless the
	 * line is off screen, and then only turns where it stands, just far enough
	 * to show it. With `centre` (a phone, where the keyboard takes half the
	 * screen) it pans the line onto the view's centre, which the keyboard offset
	 * puts above the keyboard (`setVisibleBand`), turning first only if the line
	 * is behind it.
	 */
	setEditing(id: string | null, editor: TrackedEditor | null = null, centre = false): boolean {
		const node = id === null ? undefined : this.nodes.find((n) => n.id === id && !n.departing);
		if (id !== null && (node?.x === undefined || node.y === undefined || node.z === undefined)) return false;
		this.pendingFlight = null;
		this.lookPending = { x: 0, y: 0 };
		this.cancelFlight();
		this.editingId = node?.id ?? null;
		this.near.setEditing(node ?? null, editor);
		if (node?.x === undefined || node.y === undefined || node.z === undefined) return true;
		if (this.editSettling && node.fx === undefined) this.follow = { node, at: { x: node.x, y: node.y, z: node.z }, track: true };
		else if (node.fx === undefined) [node.fx, node.fy, node.fz] = [node.x, node.y, node.z];
		this.showEdited(node, { x: node.x, y: node.y, z: node.z }, centre);
		return true;
	}

	/** The camera's turn (desktop) or pan (phone) for an edit at `at`; nothing when it is in view on desktop. */
	private showEdited(node: EngineNode, at: Vec3, centre: boolean): void {
		const pose = this.cameraPose();
		const inset = this.plateInset(node, at, pose);
		// A phone pans onto the line, so only a line behind the camera needs a turn first.
		const target = centre ? (project(pose, at).depth > 0 ? null : turnToSee(pose, at, { x: 0, y: 0 })) : turnToSee(pose, at, inset);
		const turned = target === null ? pose : { ...pose, target };
		const pan = centre ? panOnto(turned, at) : { x: 0, y: 0, z: 0 };
		if (target === null && pan.x === 0 && pan.y === 0 && pan.z === 0) return;
		const add = (a: Vec3) => ({ x: a.x + pan.x, y: a.y + pan.y, z: a.z + pan.z });
		this.glide = { from: { position: pose.position, target: pose.target }, to: { position: add(turned.position), target: add(turned.target) }, start: performance.now() };
	}

	/** The inset that keeps `node`'s plate, at `at`, wholly in view with a margin. */
	private plateInset(node: EngineNode, at: Vec3, pose: CameraPose): Inset {
		const distance = Math.hypot(at.x - pose.position.x, at.y - pose.position.y, at.z - pose.position.z);
		return plateInset({ x: node.shape.width / 2, y: node.shape.height / 2 }, distance, EDIT_MARGIN_PX, { width: this.container.clientWidth, height: this.container.clientHeight }, pose.fov);
	}

	/** The camera as the framing geometry (`graph3d/framing.ts`) sees it. */
	private cameraPose(): CameraPose {
		const camera = this.graph.camera() as PerspectiveCamera;
		const target = this.orbitControls().target;
		return {
			position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
			target: { x: target.x, y: target.y, z: target.z },
			up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
			fov: camera.fov,
			aspect: camera.aspect,
		};
	}

	/**
	 * Move a line that has just arrived (still free) to a link's length from its
	 * parent, beside it in the plane of the screen, where the screen is freest
	 * (`seedBeside`): a new line is seeded 10 units from its parent, inside its
	 * plate, and opening an editor pins it where it is. Seeding a new line is not
	 * moving a settled one, and it puts the line where the user is looking, so
	 * the camera can stay still.
	 */
	seedClear(id: string): void {
		const node = this.nodes.find((n) => n.id === id);
		if (node?.x === undefined || node.y === undefined || node.z === undefined || node.fx !== undefined) return;
		const link = this.links.find((l) => l.kind === "hierarchy" && (typeof l.target === "object" ? l.target.id : l.target) === id);
		const parentId = link === undefined ? undefined : typeof link.source === "object" ? link.source.id : link.source;
		const parent = this.nodes.find((n) => n.id === parentId);
		if (parent?.x === undefined || parent.y === undefined || parent.z === undefined) return;
		const distance = linkDistance("hierarchy", parent.extent, node.extent, spacingOf(this.overlays));
		const others: Vec3[] = [];
		for (const n of this.nodes) {
			if (n === node || n === parent || n.departing || n.x === undefined || n.y === undefined || n.z === undefined) continue;
			others.push({ x: n.x, y: n.y, z: n.z });
		}
		const at = { x: parent.x, y: parent.y, z: parent.z };
		const pose = this.cameraPose();
		const inset = this.plateInset(node, at, pose);
		const seed = seedBeside(pose, at, distance, others, inset);
		[node.x, node.y, node.z] = [seed.x, seed.y, seed.z];
		// Seeding is a jump, not a move to follow.
		if (this.follow?.node === node) this.follow.at = { ...seed };
		this.dirty = true;
	}

	/** Show or hide the walk and fly joysticks (the Osmosis bar's toggle). */
	showSticks(shown: boolean): void {
		this.sticks.show(shown);
	}

	/** Edit mode on or off. Off, a link drag in progress is dropped. */
	setLinkMode(on: boolean): void {
		this.linkMode = on;
		this.near.setResizable(on);
		if (!on) {
			this.endLinkDrag();
			this.clearLongPress();
			this.menuPress = null;
		}
	}

	/** The toolbar's Add link armed or not (see `onLinkPick`). */
	setLinkPicking(on: boolean): void {
		this.linkPicking = on;
	}

	/** Escape: drop a link drag (or a box select) in progress without linking (or selecting). True when there was one. */
	cancelLinkDrag(): boolean {
		const active = this.linkDrag?.active === true || this.box?.el != null;
		this.endLinkDrag();
		this.endBoxSelect();
		return active;
	}

	private startPendingFlight(): void {
		if (this.pendingFit && this.ticksSinceData >= SETTLE_TICKS) this.fitAll();
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
		const distance = isNoteRoot(node.graph) ? NOTE_STAND_OFF : LINE_STAND_OFF;
		if (this.hoverOver(node, distance)) return;
		const position = { x: node.x, y: node.y, z: node.z };
		this.flight = {
			node,
			flight: startFlight(this.graph.camera().position, this.orbitControls().target, position, distance, performance.now()),
			duration: FLIGHT_MS / this.overlays.travelSpeed,
		};
		this.follow = this.glide = this.ride = this.hoverFlight = null;
	}

	/**
	 * One frame of a hover flight (Planets mode), an edit's glide (to a fixed
	 * pose), a ride, or the flight: the camera eases toward where its node is
	 * now. Once there, it keeps moving with the node until the node is pinned
	 * (the layout has cooled), so a node still settling stays centred.
	 */
	private steerFlight(now: number): void {
		const camera = this.graph.camera();
		const controls = this.orbitControls();
		this.levelUp();
		const hover = this.hoverFlight;
		if (hover !== null) {
			const end = hover.node.departing ? null : this.hoverEnd(hover.node, hover.distance);
			if (end === null) {
				this.hoverFlight = null;
				return;
			}
			const pose = hoverFlightPose(hover.flight, end, now);
			this.setCamera(pose);
			if (pose.done) {
				this.hoverFlight = null;
				this.restOver(hover.node, pose);
			}
			return;
		}
		if (this.glide !== null) {
			// An edit's turn while its line is tracked, or an arrow key's glide to a node still settling: the glide moves with the node.
			const move = this.follow?.track === true || this.follow?.steer === true ? this.followMove() : null;
			const glide = move === null ? this.glide : (this.glide = shiftGlide(this.glide, move));
			const pose = glidePose(glide, now, GLIDE_MS);
			camera.position.set(pose.position.x, pose.position.y, pose.position.z);
			controls.target.set(pose.target.x, pose.target.y, pose.target.z);
			controls.update();
			if (pose.done) this.glide = null;
			return;
		}
		const ride = this.ride;
		if (ride !== null) {
			const { from, to } = ride;
			if (from.departing || to.departing || !placed(from) || !placed(to)) {
				this.ride = null;
				return;
			}
			const [a, b] = [{ x: from.x, y: from.y, z: from.z }, { x: to.x, y: to.y, z: to.z }];
			const pose: CameraState & { done: boolean } = { ...tripPose(ride.trip, a, b, now), up: ride.up };
			// Planets mode: a lane between planets bows out, and the ride bows with it (`laneBow`), by how far along it the target is.
			const bow = this.laneBowOf(from, to);
			if (bow !== null) {
				const span = Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) ** 2);
				const t = Math.min(1, Math.max(0, ((pose.target.x - a.x) * (b.x - a.x) + (pose.target.y - a.y) * (b.y - a.y) + (pose.target.z - a.z) * (b.z - a.z)) / span));
				const lift = 4 * t * (1 - t);
				for (const p of [pose.position, pose.target]) [p.x, p.y, p.z] = [p.x + bow.x * lift, p.y + bow.y * lift, p.z + bow.z * lift];
			}
			// Planets mode: over the ride's second half the camera blends into the hover view over the plate the lane reaches, landing in it.
			const end = ride.lands ? this.hoverEnd(to, ride.trip.standOff) : null;
			const landed = end === null ? pose : { ...blendPose(pose, end, rideBlend((now - ride.trip.start) / ride.trip.duration)), done: pose.done };
			if (end === null) {
				camera.position.set(pose.position.x, pose.position.y, pose.position.z);
				controls.target.set(pose.target.x, pose.target.y, pose.target.z);
				controls.update();
			} else this.setCamera(landed);
			if (pose.done) {
				this.ride = null;
				if (end !== null) this.restOver(to, landed);
				this.options.onNodeArrived(to.graph);
			}
			return;
		}
		const flight = this.flight;
		if (flight !== null) {
			const { node } = flight;
			if (node.departing || node.x === undefined || node.y === undefined || node.z === undefined) {
				this.flight = null;
				return;
			}
			const at = { x: node.x, y: node.y, z: node.z };
			const pose = flightPose(flight.flight, at, now, flight.duration);
			camera.position.set(pose.position.x, pose.position.y, pose.position.z);
			controls.target.set(pose.target.x, pose.target.y, pose.target.z);
			controls.update();
			if (pose.done) {
				this.flight = null;
				if (node.fx === undefined) this.follow = { node, at };
			}
			return;
		}
		const move = this.followMove();
		if (move === null) return;
		camera.position.add(move);
		controls.target.add(move);
		controls.update();
		// A track goes on through the user's orbit (see `reshape`): what they pressed moves with it, so they keep orbiting it.
		for (const pivot of new Set([this.drag?.pivot, this.drag?.grab?.point, this.swipe?.drag.pivot, this.swipe?.drag.grab?.point, this.gizmoDrag?.drag.pivot, this.orbitCoast?.pivot])) pivot?.add(move);
	}

	/**
	 * How far the followed node moved since the last frame, or null when there
	 * is no follow. The follow ends once the node is pinned (the layout has
	 * cooled) or is gone.
	 */
	private followMove(): Vector3 | null {
		const follow = this.follow;
		if (follow === null) return null;
		const { node } = follow;
		if (node.departing || !placed(node)) {
			this.follow = null;
			return null;
		}
		const move = new Vector3(node.x - follow.at.x, node.y - follow.at.y, node.z - follow.at.z);
		follow.at = { x: node.x, y: node.y, z: node.z };
		if (this.settled(node)) this.follow = null;
		return move;
	}

	/**
	 * Whether a node has stopped moving: it is pinned, or, on a planet (whose
	 * surface plates are always pinned to their core), its core is pinned and
	 * the planet is not easing into a new layout.
	 */
	private settled(node: EngineNode): boolean {
		const planet = this.world.planetOf(node.id);
		if (planet === undefined || planet === node.id) return node.fx !== undefined;
		return this.live.get(planet)?.fx !== undefined && !this.world.easing;
	}

	/**
	 * Planets mode: fly to hover above a surface plate, `distance` out on its
	 * outward normal, looking straight down at it with its up (world +y
	 * projected onto it) at the top of the screen. Position, look direction and
	 * up are one eased flight over the travel-speed-scaled flight time
	 * (`graph3d/hover.ts`), re-aimed each frame at where the plate is now.
	 * Already there (a lane ride lands in the hover view, and its arrival then
	 * comes here), or already on the way, it changes nothing. False for a plate
	 * on no planet's surface (a core, a star, or another layout): the caller
	 * moves as usual.
	 */
	private hoverOver(node: EngineNode, distance: number): boolean {
		const end = this.hoverEnd(node, distance);
		if (end === null) return false;
		this.flight = this.ride = this.glide = null;
		if (this.hoverFlight?.node === node && this.hoverFlight.distance === distance) return true;
		const camera = this.graph.camera();
		this.hoverFlight = this.follow = null;
		this.capRest = false;
		// What is on screen: the camera's own orientation, whatever its up vector says.
		if (atPose(camera.position, camera.quaternion, end)) this.restOver(node, end);
		else this.hoverFlight = { node, distance, flight: startHover(camera.position, this.orbitControls().target, camera.quaternion, performance.now(), FLIGHT_MS / this.overlays.travelSpeed) };
		return true;
	}

	/** The hover pose over `node`'s plate, `distance` out on its normal, where the plate is now; null for a node on no planet's surface. */
	private hoverEnd(node: EngineNode, distance: number): CameraState | null {
		const place = this.world.place(node.id);
		if (place === undefined || !placed(node)) return null;
		return hoverPose({ x: node.x, y: node.y, z: node.z }, place, distance);
	}

	/** Set the camera to `pose`, up included; OrbitControls' `update()` then aims it at the target with that up. */
	private setCamera(pose: CameraState): void {
		const camera = this.graph.camera();
		camera.position.set(pose.position.x, pose.position.y, pose.position.z);
		camera.up.set(pose.up.x, pose.up.y, pose.up.z);
		const controls = this.orbitControls();
		controls.target.set(pose.target.x, pose.target.y, pose.target.z);
		controls.update();
	}

	/**
	 * Arrived in the hover pose over `node`: from here nothing turns the camera
	 * on its own. Its up goes back to world +y, which shows exactly the same
	 * view, except over a pole cap plate, where it keeps the plate's up
	 * (`restingUp`). A plate still easing into place is followed, as a
	 * flight's node is.
	 */
	private restOver(node: EngineNode, pose: CameraState): void {
		const forward = { x: pose.target.x - pose.position.x, y: pose.target.y - pose.position.y, z: pose.target.z - pose.position.z };
		const up = restingUp(forward, pose.up);
		this.graph.camera().up.set(up.x, up.y, up.z);
		this.capRest = up.x !== 0 || up.y !== 1 || up.z !== 0;
		this.orbitControls().update();
		if (placed(node) && !this.settled(node)) this.follow = { node, at: { x: node.x, y: node.y, z: node.z } };
	}

	/**
	 * Put `camera.up` back to world +y, which the view's orbit and look
	 * controls turn about, when a hover's turn was cut short (the user took
	 * over, or the camera went elsewhere) and left it tilted. A rest over a cap
	 * plate keeps its up while the camera stays there or the user moves it,
	 * and gives it up once another flight, glide or ride starts.
	 */
	private levelUp(): void {
		if (this.hoverFlight !== null || this.ride?.lands === true) return;
		const up = this.graph.camera().up;
		if (up.x === 0 && up.y === 1 && up.z === 0) return;
		if (this.capRest && this.flight === null && this.glide === null && this.ride === null) return;
		this.capRest = false;
		up.set(0, 1, 0);
		this.orbitControls().update();
	}

	/**
	 * The distance an arrow key's glide and an edge ride keep (`viewingDistance`):
	 * where a move under way ends, or else how far ahead the focused node is.
	 */
	private viewingDistance(): number {
		const apart = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
		const origin = { x: 0, y: 0, z: 0 };
		const heading =
			this.glide !== null
				? apart(this.glide.to.position, this.glide.to.target)
				: this.flight !== null
					? apart(this.flight.flight.offset, origin)
					: (this.hoverFlight?.distance ?? this.ride?.trip.standOff ?? null);
		const focus = this.focusId === null ? undefined : this.nodes.find((n) => n.id === this.focusId && !n.departing);
		const pose = this.cameraPose();
		return viewingDistance(pose.position, pose.target, focus !== undefined && placed(focus) ? { x: focus.x, y: focus.y, z: focus.z } : null, heading, MIN_DEPTH);
	}

	/** The user moved the view: a flight or follow under way gives way, and so does any coast. A structural edit's track goes on (see `reshape`). */
	private cancelFlight(): void {
		this.flight = this.glide = this.ride = this.hoverFlight = null;
		this.pendingFit = false;
		if (this.follow?.track !== true) this.follow = null;
		this.stopCoasting();
	}

	/** Whether a released drag, pan or pinch is still coasting (the wheel's glide doesn't count: it is the wheel's own zoom, eased). */
	private coasting(): boolean {
		return this.orbitCoast !== null || this.panCoast !== null || this.zoomCoast !== null;
	}

	/** Stop every coast and the wheel's glide where they are. */
	private stopCoasting(): void {
		this.orbitCoast = this.panCoast = this.zoomCoast = this.wheelZoom = null;
	}

	/**
	 * Follow a link: ride the camera along `edge` to its end away from the
	 * focused node (with neither end focused, the one farther from the camera),
	 * stopping at the current viewing distance (`viewingDistance`). Arriving is reported as
	 * `onNodeArrived`. See `startTrip`.
	 */
	private rideAlong(source: EngineNode, target: EngineNode): void {
		if (!placed(source) || !placed(target)) return;
		const camera = this.graph.camera().position;
		const a = { x: source.x, y: source.y, z: source.z };
		const b = { x: target.x, y: target.y, z: target.z };
		const toEnd = farEnd({ a, b, aId: source.id, bId: target.id }, this.focusId, camera) === "b";
		const [from, to] = toEnd ? [source, target] : [target, source];
		const standOff = this.viewingDistance();
		const trip = startTrip(camera, this.orbitControls().target, toEnd ? a : b, toEnd ? b : a, standOff, performance.now(), this.overlays.travelSpeed);
		this.pendingFlight = null;
		this.pendingFit = false;
		this.flight = this.follow = this.glide = this.hoverFlight = null;
		const up = this.graph.camera().up;
		this.ride = { from, to, trip, lands: this.world.place(to.id) !== undefined, up: { x: up.x, y: up.y, z: up.z } };
	}

	destroy(): void {
		window.cancelAnimationFrame(this.frame);
		this.graph.renderer().domElement.removeEventListener("pointerdown", this.onPointerDown);
		this.container.removeEventListener("mousedown", this.onMouseDown);
		this.container.removeEventListener("pointerdown", this.onPointerDownCapture, { capture: true });
		this.container.removeEventListener("contextmenu", this.onContextMenuEvent);
		this.clearLongPress();
		window.removeEventListener("pointermove", this.onPointerMove);
		window.removeEventListener("pointerup", this.onPointerUp);
		window.removeEventListener("pointercancel", this.onPointerUp);
		this.endLinkDrag();
		this.endBoxSelect();
		this.container.removeEventListener("wheel", this.onWheel, { capture: true });
		window.removeEventListener("keydown", this.onModifierKey, { capture: true });
		window.removeEventListener("keyup", this.onModifierKey, { capture: true });
		window.removeEventListener("blur", this.onWindowBlur);
		window.clearTimeout(this.speedTimer);
		this.perf.destroy();
		this.near.destroy();
		this.nodes = [];
		this.links = [];
		this.plates.dispose();
		this.boundaries.dispose();
		this.hints.dispose();
		this.edges.geometry.dispose();
		this.edges.material.dispose();
		this.ribbons.dispose();
		this.taperDepths = null;
		this.hintLinks = null;
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
		// A line with a custom width, or a code block fitting its lines, has a plate as wide as its panel.
		const width = graph.kind === "line" ? plateWidthEm(graph) : null;
		if (width !== null) return this.plates.shape(this.labelText(graph), LINE_PLATE_HEIGHT, width.textMaxEm, width.minEm);
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
	 * Shift + left button is reserved for box select. OrbitControls pans on it,
	 * so it is taken here, before the canvas, and kept from OrbitControls.
	 */
	private readonly onPointerDownCapture = (e: PointerEvent): void => {
		if (e.target !== this.graph.renderer().domElement || this.gestureOf(e) !== "boxSelect") return;
		e.stopPropagation();
		this.onPointerDown(e);
	};

	/** What the press `e` starts in the current mode (see `gestureFor`). */
	private gestureOf(e: PointerEvent): PointerGesture {
		return gestureFor({
			button: e.button,
			pointerType: e.pointerType,
			shiftKey: e.shiftKey,
			altKey: e.altKey,
			ctrlKey: e.ctrlKey,
			metaKey: e.metaKey,
			editMode: this.linkMode,
		});
	}

	/**
	 * Box select, begun by Shift + left press: the press is still a click
	 * candidate (`this.press`, set by the caller; a Shift+click toggles one
	 * plate). Dragged past the click slop it draws a rubber band, and the
	 * release adds the plates whose centres are inside it to the selection.
	 */
	private beginBoxSelect(e: PointerEvent): void {
		this.endBoxSelect();
		this.box = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, el: null };
	}

	/** Draw the box select's rubber band from its press to (`x`, `y`). */
	private moveBoxSelect(x: number, y: number): void {
		const box = this.box;
		if (box === null) return;
		if (box.el === null) {
			if (Math.hypot(x - box.x0, y - box.y0) <= CLICK_SLOP_PX) return;
			box.el = activeDocument.body.createDiv({ cls: "osmosis-graph3d-box" });
		}
		const rect = boxRect(box.x0, box.y0, x, y);
		box.el.setCssStyles({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.right - rect.left}px`, height: `${rect.bottom - rect.top}px` });
	}

	/** End the box select; released at (`x`, `y`) after a drag, add what it boxed to the selection. */
	private endBoxSelect(x?: number, y?: number): void {
		const box = this.box;
		this.box = null;
		if (box === null || box.el === null) return;
		box.el.remove();
		if (x === undefined || y === undefined) return;
		const hits = boxHits(this.screenCentres(), boxRect(box.x0, box.y0, x, y));
		if (hits.length === 0) return;
		for (const id of hits) this.selection.add(id);
		this.applySelection();
	}

	/** Every drawn plate's centre on screen: in front of the camera, short of the mist, and not faded out. */
	private screenCentres(): ScreenPoint[] {
		const camera = this.graph.camera() as PerspectiveCamera;
		const rect = this.graph.renderer().domElement.getBoundingClientRect();
		const forward = camera.getWorldDirection(new Vector3());
		const reach = 2 / this.fog.density;
		const point = new Vector3();
		const out: ScreenPoint[] = [];
		for (const node of this.nodes) {
			if (node.departing || node.opacity <= 0 || node.x === undefined || node.y === undefined || node.z === undefined) continue;
			point.set(node.x, node.y, node.z).sub(camera.position);
			const distance = point.dot(forward);
			if (distance <= 0 || distance > reach) continue;
			point.add(camera.position).project(camera);
			out.push({ id: node.id, x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height });
		}
		return out;
	}

	/**
	 * A left-button or one-finger drag orbits the view, and two fingers pinch
	 * and pan. Alt + drag from a line (edit mode) pulls out a link, Ctrl or Cmd
	 * + drag pans (OrbitControls), Shift + drag is box select, and the right
	 * button pans (OrbitControls) or, released in place, opens the plate menu.
	 */
	private readonly onPointerDown = (e: PointerEvent): void => {
		const touch = e.pointerType === "touch";
		if (this.beginResize(e, touch)) return;
		const gesture = this.gestureOf(e);
		if (this.touches.size === 0) {
			// A press on a coasting view stops it, and that is all it does:
			// not also a click or tap that flies. What the spin had left
			// carries into a flick that follows.
			this.stoppedCoastOnDown = this.coasting();
			this.carry = this.orbitCoast?.coast.velocity ?? { x: 0, y: 0 };
			this.touchDownAt = performance.now();
		}
		// Stops every coast too.
		this.cancelFlight();
		this.swipe = null;
		this.lookPending = { x: 0, y: 0 };
		if (touch) {
			this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
			// A second finger is a pinch: the drag stops, and stays stopped
			// until every finger has lifted.
			if (this.touches.size === 2) {
				this.endLinkDrag();
				this.clearLongPress();
				this.startPinch();
			}
			if (this.touches.size !== 1) {
				this.drag = this.press = null;
				return;
			}
		} else if (gesture === "panOrMenu") {
			if (this.editingId === null) this.menuPress = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
			this.startMousePan(e);
			return;
		} else if (gesture === "none") {
			return;
		} else if (gesture === "boxSelect" || gesture === "pan") {
			// Still a press that may be a click: Mod-click on a link opens it.
			this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch };
			if (gesture === "boxSelect") this.beginBoxSelect(e);
			else this.startMousePan(e);
			return;
		}
		this.samples = [];
		this.turnSamples = [];
		// A link gesture (Alt + drag in edit mode, mouse or pen) on a line pulls a link out of it. On empty space, or a note, tag or file, it orbits.
		const from = gesture === "link" && !this.stoppedCoastOnDown && this.editingId === null ? this.pickedNode(e.clientX, e.clientY, touch) : null;
		if (from?.graph.kind === "line") {
			this.drag = null;
			this.linkDrag = { pointerId: e.pointerId, touch, from, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, over: null, overColor: null };
			// Still a press that may be a click, until the pointer moves.
			this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch };
			return;
		}
		const look = touch && this.controlSettings.touchDrag === "look";
		const aim = this.aim(e.clientX, e.clientY, touch, !look);
		const ray = this.rayThrough(e.clientX, e.clientY);
		this.drag = {
			pointerId: e.pointerId,
			touch,
			x: e.clientX,
			y: e.clientY,
			pivot: aim.point,
			look,
			grab: aim.globe === null || look ? null : { point: grabPoint(ray.origin, ray.direction, aim.point, aim.globe), radius: aim.globe },
			turned: { x: 0, y: 0 },
		};
		this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch };
		// A finger held still on a plate adds it to the selection (reading and edit mode alike).
		if (touch && !this.stoppedCoastOnDown && this.editingId === null) {
			const held = this.pickedNode(e.clientX, e.clientY, true);
			if (held !== null) this.startLongPress(e.pointerId, e.clientX, e.clientY, held);
		}
	};

	/**
	 * While the inline editor is open, a press anywhere else in the stage (the
	 * canvas, a joystick, a corner control) keeps the focus in the editor, so
	 * orbiting, panning or zooming never blurs it, which would save it. A click
	 * still saves it, from `click`.
	 */
	private readonly onMouseDown = (e: MouseEvent): void => {
		if (this.editingId === null) return;
		if (e.target instanceof Element && e.target.closest(".osmosis-graph3d-edit") !== null) return;
		e.preventDefault();
	};

	private readonly onPointerMove = (e: PointerEvent): void => {
		if (this.widthDrag !== null) {
			this.moveResize(e);
			return;
		}
		if (this.box?.pointerId === e.pointerId) this.moveBoxSelect(e.clientX, e.clientY);
		const press = this.press;
		if (press?.pointerId === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP_PX) this.press = null;
		const menu = this.menuPress;
		if (menu?.pointerId === e.pointerId && movedPastSlop(e.clientX - menu.x, e.clientY - menu.y)) this.menuPress = null;
		const hold = this.longPress;
		if (hold?.pointerId === e.pointerId && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > CLICK_SLOP_PX) this.clearLongPress();
		// The pointer cursor over a node is resolved once a frame, in tick().
		if (e.pointerType === "mouse" && e.buttons === 0 && e.target === this.graph.renderer().domElement) {
			this.hover = { x: e.clientX, y: e.clientY };
		}
		if (this.mousePan === e.pointerId) this.sample(this.samples, e.clientX, e.clientY);
		const finger = this.touches.get(e.pointerId);
		if (finger !== undefined) {
			finger.x = e.clientX;
			finger.y = e.clientY;
		}
		if (this.pinch !== null) {
			if (this.pinch.ids.includes(e.pointerId)) this.movePinch(this.pinch);
			return;
		}
		const link = this.linkDrag;
		if (link?.pointerId === e.pointerId) {
			link.x = e.clientX;
			link.y = e.clientY;
			if (!link.active && Math.hypot(e.clientX - link.startX, e.clientY - link.startY) > CLICK_SLOP_PX) link.active = true;
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
		this.sample(this.samples, e.clientX, e.clientY);
		this.rotate(drag, dx, dy);
	};

	private readonly onPointerUp = (e: PointerEvent): void => {
		this.endResize(e);
		this.touches.delete(e.pointerId);
		if (this.mousePan === e.pointerId) this.endMousePan(e.type === "pointerup");
		if (this.longPress?.pointerId === e.pointerId) this.clearLongPress();
		const menu = this.menuPress;
		if (menu?.pointerId === e.pointerId) {
			// A right-click that never moved: the context menu of the plate under it. (A cancelled pointer opens nothing.)
			this.menuPress = null;
			const node = e.type === "pointerup" && e.button === 2 ? this.pickedNode(menu.x, menu.y, false) : null;
			if (node !== null && hasMenu(node.graph)) this.options.onContextMenu(node.graph, e.clientX, e.clientY);
		}
		if (this.box?.pointerId === e.pointerId) this.endBoxSelect(e.type === "pointerup" ? e.clientX : undefined, e.clientY);
		const press = this.press;
		if (press?.pointerId === e.pointerId) {
			this.press = null;
			// The release's own position counts too: a quick flick can reach it with no move in between.
			if (!this.stoppedCoastOnDown && releaseIsClick(press, e.clientX, e.clientY, e.type === "pointercancel", CLICK_SLOP_PX)) this.click(press.x, press.y, press.touch, e);
		}
		if (this.pinch?.ids.includes(e.pointerId) === true) this.endPinch(this.pinch);
		const link = this.linkDrag;
		if (link?.pointerId === e.pointerId) {
			// A cancelled pointer (the system took the touch) links nothing.
			const target = link.active && e.type !== "pointercancel" ? this.dropTarget(e.clientX, e.clientY, link) : null;
			this.endLinkDrag();
			if (target !== null) this.options.onLinkDrop(link.from.graph, target.graph, e.clientX, e.clientY);
			return;
		}
		const drag = this.drag;
		if (drag?.pointerId !== e.pointerId) return;
		this.drag = null;
		// Mouse-look has its own glide (`easeLookPending`), which a spin would stack on.
		if (drag.look && !drag.touch) return;
		const now = performance.now();
		const coast = launchSpin(estimateVelocity(this.samples, now), estimateVelocity(this.turnSamples, now), this.carry, now - this.touchDownAt);
		if (coast !== null) this.orbitCoast = { pivot: drag.pivot, look: drag.look, coast };
	};

	/**
	 * A plain press on a selected panel's width handle (edit mode) starts a
	 * width drag instead of an orbit or a click. True when it did.
	 */
	private beginResize(e: PointerEvent, touch: boolean): boolean {
		if (!this.linkMode || this.editingId !== null || this.widthDrag !== null || this.touches.size > 0) return false;
		if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
		const hit = this.near.resizeStart(e.clientX, e.clientY, touch ? RESIZE_SLOP_PX.touch : RESIZE_SLOP_PX.mouse);
		if (hit === null) return false;
		this.stoppedCoastOnDown = this.coasting();
		this.cancelFlight();
		this.drag = this.press = null;
		this.widthDrag = { pointerId: e.pointerId, node: hit.node, startX: e.clientX, width: hit.width, scale: hit.scale, current: hit.width };
		e.preventDefault();
		return true;
	}

	/** The pointer moved during a width drag: the panel stays centred on its node, so each side grows by the pointer's travel. */
	private moveResize(e: PointerEvent): void {
		const resize = this.widthDrag;
		if (resize === null || resize.pointerId !== e.pointerId) return;
		const width = this.near.setPreviewWidth(resize.node.id, resize.width + (2 * (e.clientX - resize.startX)) / resize.scale);
		if (width !== null) resize.current = width;
	}

	/** The width drag ended: write the width as a style (a drag that never moved writes nothing), and let the next reload retire the preview. */
	private endResize(e: PointerEvent): void {
		const resize = this.widthDrag;
		if (resize === null || resize.pointerId !== e.pointerId) return;
		this.widthDrag = null;
		const moved = e.type === "pointerup" && Math.abs(resize.current - resize.width) >= 1;
		if (!moved) {
			this.near.setPreviewWidth(resize.node.id, null);
			return;
		}
		const width = styleWidthFromEm(resize.current / NEAR_FONT_PX);
		this.options.onResizeNode(resize.node, width).catch((error: unknown) => {
			console.error("Osmosis: 3D graph could not resize a node", error);
			this.near.setPreviewWidth(resize.node.id, null);
		});
	}

	/** A right or Ctrl drag is OrbitControls' pan: sample it, so its release can coast like a pinch's pan. */
	private startMousePan(e: PointerEvent): void {
		this.mousePan = e.pointerId;
		this.samples = [];
	}

	/** The mouse pan ends; released (not cancelled) while moving, it coasts on at the orbit target's depth, where OrbitControls panned. */
	private endMousePan(released: boolean): void {
		this.mousePan = null;
		if (!released) return;
		const now = performance.now();
		const velocity = launchVelocity(estimateVelocity(this.samples, now), { x: 0, y: 0 }, 0);
		if (velocity.x === 0 && velocity.y === 0) return;
		const depth = this.graph.camera().position.distanceTo(this.orbitControls().target);
		this.panCoast = { depth, coast: { velocity, stopBelow: PAN_MIN_VELOCITY } };
	}

	/** The browser's own context menu stays off the canvas: the right button there is ours (a pan, or the plate menu). */
	private readonly onContextMenuEvent = (e: Event): void => {
		if (e.target === this.graph.renderer().domElement) e.preventDefault();
	};

	/**
	 * A finger went down on `node`: held still for `LONG_PRESS_MS`, it joins
	 * the selection (`heldInto`; one added becomes the primary), touch
	 * selection mode starts, the phone buzzes as the mind map's does, and the
	 * release is no tap (nor a drag: the finger no longer orbits).
	 */
	private startLongPress(pointerId: number, x: number, y: number, node: EngineNode): void {
		this.clearLongPress();
		const timer = window.setTimeout(() => {
			this.longPress = null;
			if (this.editingId !== null || this.pinch !== null || node.departing) return;
			this.press = this.drag = null;
			this.touchSelecting = true;
			if (!this.selection.has(node.id)) {
				this.selection = heldInto(this.selection, node.id);
				this.focusId = node.id;
				this.applySelection();
			}
			navigator.vibrate?.(50);
		}, LONG_PRESS_MS);
		this.longPress = { pointerId, x, y, timer };
	}

	private clearLongPress(): void {
		if (this.longPress !== null) window.clearTimeout(this.longPress.timer);
		this.longPress = null;
	}

	/** The node drawn at client point (`x`, `y`): the front panel's, else the nearest plate. */
	private pickedNode(x: number, y: number, touch: boolean): EngineNode | null {
		const panel = this.near.nodeAt(x, y);
		if (panel !== null) return this.nodes.find((node) => node.id === panel.id) ?? null;
		return this.nodeNear(x, y, PICK_SLOP_PX[touch ? "touch" : "mouse"]);
	}

	/** The node a link drag released at (`x`, `y`) would link to: a line or a note other than the dragged line. */
	private dropTarget(x: number, y: number, link: LinkDrag): EngineNode | null {
		const node = this.pickedNode(x, y, link.touch);
		if (node === null || node === link.from || (node.graph.kind !== "line" && node.graph.kind !== "note")) return null;
		return node;
	}

	/**
	 * Each frame of an active link drag: highlight the node under the pointer
	 * (its plate's outline, or its panel's) and draw the band from the dragged
	 * line to the pointer, at the dragged line's depth, or to the target's centre.
	 */
	private stepLinkDrag(): void {
		const link = this.linkDrag;
		if (link === null || !link.active) return;
		const over = this.dropTarget(link.x, link.y, link);
		if (over !== link.over) {
			if (link.over !== null && link.overColor !== null) link.over.color.copy(link.overColor);
			link.over = over;
			link.overColor = over === null ? null : over.color.clone();
			over?.color.setStyle(this.theme.text);
			this.near.setLinkTarget(over?.id ?? null);
			this.dirty = this.layoutDirty = true;
		}
		const from = new Vector3(link.from.x ?? 0, link.from.y ?? 0, link.from.z ?? 0);
		const end =
			over !== null && over.x !== undefined && over.y !== undefined && over.z !== undefined
				? new Vector3(over.x, over.y, over.z)
				: this.rayThrough(link.x, link.y).at(Math.max(MIN_DEPTH, from.distanceTo(this.graph.camera().position)), new Vector3());
		if (this.linkLine === null) {
			const geometry = new BufferGeometry().setFromPoints([from, end]);
			const material = new LineBasicMaterial({ color: link.from.color, depthTest: false, depthWrite: false, transparent: true, fog: false });
			this.linkLine = new Line(geometry, material);
			this.linkLine.frustumCulled = false;
			this.linkLine.renderOrder = 10;
			this.graph.scene().add(this.linkLine);
		}
		const position = this.linkLine.geometry.getAttribute("position") as BufferAttribute;
		position.setXYZ(0, from.x, from.y, from.z);
		position.setXYZ(1, end.x, end.y, end.z);
		position.needsUpdate = true;
		this.graph.renderer().domElement.setCssProps({ cursor: "crosshair" });
	}

	/** End a link drag without dropping: put the highlight back, remove the band and the cursor. */
	private endLinkDrag(): void {
		const link = this.linkDrag;
		this.linkDrag = null;
		if (link === null) return;
		if (link.over !== null && link.overColor !== null) {
			link.over.color.copy(link.overColor);
			this.dirty = this.layoutDirty = true;
		}
		this.near.setLinkTarget(null);
		if (this.linkLine !== null) {
			this.graph.scene().remove(this.linkLine);
			this.linkLine.geometry.dispose();
			this.linkLine.material.dispose();
			this.linkLine = null;
		}
		this.graph.renderer().domElement.setCssProps({ cursor: "" });
	}

	/** A click or tap: follow the link under it, or fly to its node. See `linkClickAction`. */
	private click(x: number, y: number, touch: boolean, e: PointerEvent): void {
		if (this.editingId !== null) this.options.onClickWhileEditing();
		// Add link armed: this click only picks the target. It is a click by now (`releaseIsClick`), so a drag to reach the target never gets here.
		if (this.linkPicking) {
			this.options.onLinkPick(this.pickedNode(x, y, touch)?.graph ?? null);
			return;
		}
		// A plain tap on a task checkbox ticks it. Held modifiers belong to pan and to links.
		const box = e.shiftKey || e.ctrlKey || e.metaKey ? null : this.near.checkboxAt(x, y, CHECKBOX_SLOP_PX[touch ? "touch" : "mouse"]);
		if (box !== null) {
			this.options.onCheckboxClick(box.node);
			return;
		}
		// Touch selection mode (a held finger began it): a tap on a plate toggles it, as Shift+click does; one on empty space ends the mode and clears, below.
		const tapped = touch && this.touchSelecting ? this.pickedNode(x, y, true) : null;
		if (touch && !tapToggles(this.touchSelecting, this.selection.size, tapped !== null)) this.touchSelecting = false;
		const toggling = touch && this.touchSelecting;
		if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !toggling && this.doubleClicked(x, y, touch)) return;
		const slop = PICK_SLOP_PX[touch ? "touch" : "mouse"];
		// Shift+click toggles the plate in the selection; one added becomes the primary. No flight, no history step.
		if (e.shiftKey || toggling) {
			const hit = tapped ?? this.pickedNode(x, y, touch);
			if (hit === null) return;
			this.selection = toggled(this.selection, hit.id);
			if (this.selection.has(hit.id)) this.focusId = hit.id;
			if (this.selection.size === 0) this.touchSelecting = false;
			this.applySelection();
			return;
		}
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
			touch,
		});
		if (action === "none") return;
		if (action !== "node") {
			this.options.onLinkClick(link!, action);
			return;
		}
		// A plain click on a plate selects it alone, as before multi-select.
		// With "Click selects only" the plate becomes the primary and the camera stays: no flight, no history step.
		const selectsOnly = this.options.clickSelectsOnly();
		if (link !== null) {
			this.select([link.node.id]);
			if (selectsOnly) this.focusId = link.node.id;
			this.options.onNodeClick(link.node, selectsOnly);
			return;
		}
		const node = this.nodeNear(x, y, slop);
		if (node !== null) {
			this.select([node.id]);
			if (selectsOnly) this.focusId = node.id;
			this.options.onNodeClick(node.graph, selectsOnly);
			return;
		}
		// No plate: an edge under the pointer is a link to follow. (A panel over it has the click.)
		if (this.near.nodeAt(x, y) !== null) return;
		// Empty space clears the selection.
		this.clearSelection();
		const edge = this.edgeNear(x, y, slop);
		if (edge !== null) this.rideAlong(edge.source, edge.target);
	}

	/**
	 * Whether this click is the second of a double click on a node that the view
	 * took (see `onNodeDoubleClick`). Otherwise remembers the click for the next.
	 */
	private doubleClicked(x: number, y: number, touch: boolean): boolean {
		const hit = this.near.nodeAt(x, y) ?? this.nodeNear(x, y, PICK_SLOP_PX[touch ? "touch" : "mouse"])?.graph ?? null;
		const now = performance.now();
		const prev = this.lastClick;
		this.lastClick = hit === null ? null : { at: now, x, y, node: hit };
		if (prev === null || now - prev.at > DOUBLE_CLICK_MS || Math.hypot(x - prev.x, y - prev.y) > DOUBLE_CLICK_PX[touch ? "touch" : "mouse"]) return false;
		this.lastClick = null;
		return this.options.onNodeDoubleClick(prev.node);
	}

	/**
	 * The wheel zooms toward what is under the cursor, or sets the flight speed
	 * while flying. The zoom glides: it joins what the last notches left to go,
	 * and `easeWheel` plays it out, decelerating.
	 *
	 * A touchpad's two-finger swipe (told apart per gesture, `WheelClassifier`)
	 * turns the view instead, like a drag from under the cursor; with Shift it
	 * pans, and with Ctrl it zooms at the wheel's rate. A pinch, and any wheel
	 * event during a pointer drag or pinch, zooms as before.
	 */
	private readonly onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		e.stopPropagation();
		const pending = this.wheelZoom?.pending ?? 0;
		const spin = this.orbitCoast?.coast.velocity ?? { x: 0, y: 0 };
		this.cancelFlight();
		if (this.drag?.look === true && !this.drag.touch) {
			flightScale = Math.min(FLIGHT_SCALE_LIMIT, Math.max(1 / FLIGHT_SCALE_LIMIT, flightScale * FLIGHT_SCALE_STEP ** wheelNotches(e)));
			this.showSpeed();
			return;
		}
		const pointerBusy = this.drag !== null || this.pinch !== null || this.mousePan !== null || this.gizmoDrag !== null;
		const pinch = e.ctrlKey && !this.ctrlHeld;
		const source = pinch || pointerBusy ? "wheel" : this.wheelSource.classify({ deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, t: e.timeStamp });
		const action = wheelAction(e, source, this.ctrlHeld);
		if (action.kind === "zoom") {
			this.swipe = null;
			this.wheelZoom = { x: e.clientX, y: e.clientY, pending: pending + action.logZoom };
			return;
		}
		this.swipeBy(action.kind === "pan", action.dx, action.dy, e.clientX, e.clientY, spin);
	};

	/**
	 * Move a touchpad swipe by (`dx`, `dy`) pointer px. The first event of a
	 * swipe starts it the way a press would start a drag at the cursor (`aim`,
	 * so the pivot setting and a planet's surface grab apply). Its movement is
	 * handed to the drag once a frame (`stepSwipe`), so the turn, the grab and
	 * the release coast are the drag's own. `spin` is what a coast it stopped had left.
	 */
	private swipeBy(pan: boolean, dx: number, dy: number, x: number, y: number, spin: Vec): void {
		if (this.swipe === null || this.swipe.pan !== pan) this.swipeFeed.cancel();
		const now = performance.now();
		const state = this.swipeFeed.push(dx, dy, now);
		let swipe = this.swipe;
		if (state === "start" || swipe === null) {
			this.samples = [];
			this.turnSamples = [];
			this.carry = pan ? { x: 0, y: 0 } : spin;
			const aim = this.aim(x, y, false, !pan);
			const ray = this.rayThrough(x, y);
			const grab = pan || aim.globe === null ? null : { point: grabPoint(ray.origin, ray.direction, aim.point, aim.globe), radius: aim.globe };
			const drag: RotateDrag = { pointerId: -1, touch: false, x, y, pivot: aim.point, look: false, grab, turned: { x: 0, y: 0 } };
			swipe = this.swipe = { pan, drag, depth: this.viewDepth(aim.point), startAt: now, lastAt: now };
		} else if (state === "resume") {
			// Taken for lifted, it may have coasted (`onWheel` stopped that), but
			// the fingers were only paused: carry on from here, as a fresh press
			// on the coasting view would, with the same pivot.
			this.samples = [];
			this.turnSamples = [];
			this.carry = pan ? { x: 0, y: 0 } : spin;
			swipe.startAt = now;
			const grab = swipe.drag.grab;
			if (grab !== null) {
				const ray = this.rayThrough(swipe.drag.x, swipe.drag.y);
				grab.point = grabPoint(ray.origin, ray.direction, swipe.drag.pivot, grab.radius);
			}
		}
		swipe.lastAt = now;
	}

	/**
	 * Each frame, move the swipe's drag by what its events moved since the
	 * last frame, as a pointer drag moves once a frame. Once its events have
	 * stopped (`SwipeFeed`), it is let go like a drag: moving fast at its last
	 * event, it coasts. Where the OS sends momentum events after the fingers
	 * lift, they keep the swipe going as its own coast, so it ends slowly and
	 * coasts on only if they stop while it is still fast.
	 */
	private stepSwipe(): void {
		const swipe = this.swipe;
		if (swipe === null) return;
		const { dx, dy, release, over } = this.swipeFeed.frame(performance.now());
		if (dx !== 0 || dy !== 0) {
			swipe.drag.x += dx;
			swipe.drag.y += dy;
			this.sample(this.samples, swipe.drag.x, swipe.drag.y);
			if (swipe.pan) this.pan(dx, dy, swipe.depth);
			else this.rotate(swipe.drag, dx, dy);
		}
		if (release) this.launchSwipe(swipe, swipe.lastAt);
		if (over) this.swipe = null;
	}

	/**
	 * A swipe or gizmo drag let go at time `at`: moving fast then, it coasts
	 * like a released drag (a pan on, a turn on). The gizmo passes the moment
	 * of release, so a drag held still before it coasts nowhere.
	 */
	private launchSwipe(swipe: Swipe, at: number): void {
		if (swipe.pan) {
			const velocity = launchVelocity(estimateVelocity(this.samples, at), { x: 0, y: 0 }, 0);
			if (velocity.x !== 0 || velocity.y !== 0) this.panCoast = { depth: swipe.depth, coast: { velocity, stopBelow: PAN_MIN_VELOCITY } };
			return;
		}
		const coast = launchSpin(estimateVelocity(this.samples, at), estimateVelocity(this.turnSamples, at), this.carry, at - swipe.startAt);
		if (coast !== null) this.orbitCoast = { pivot: swipe.drag.pivot, look: false, coast };
	}

	/**
	 * A navigation gizmo was pressed and has begun to move. Like a press on the
	 * canvas it stops what the camera was doing, but it acts on the view's
	 * centre, not what is under the pointer: Rotate orbits the orbit target (no
	 * surface grab) and Pan slides the view at the target's depth, both as the
	 * drag's own `rotate` and `pan` with the same release coast (`launchSwipe`).
	 * Zoom needs no state: `moveGizmo` feeds the wheel's glide.
	 */
	private beginGizmo(kind: GizmoKind): void {
		const spin = this.orbitCoast?.coast.velocity ?? { x: 0, y: 0 };
		this.cancelFlight();
		this.swipe = null;
		this.lookPending = { x: 0, y: 0 };
		if (kind === "zoom") return;
		const camera = this.graph.camera();
		const target = this.orbitControls().target;
		const now = performance.now();
		this.samples = [];
		this.turnSamples = [];
		this.carry = kind === "pan" ? { x: 0, y: 0 } : spin;
		const drag: RotateDrag = { pointerId: -1, touch: false, x: 0, y: 0, pivot: target.clone(), look: false, grab: null, turned: { x: 0, y: 0 } };
		this.gizmoDrag = { pan: kind === "pan", drag, depth: Math.max(MIN_DEPTH, camera.position.distanceTo(target)), startAt: now, lastAt: now };
	}

	/** The held gizmo's pointer moved (`dx`, `dy`) px: turn, slide or zoom the view by it. */
	private moveGizmo(kind: GizmoKind, dx: number, dy: number): void {
		if (kind === "zoom") {
			// Toward the middle of the view, like the ribbon's zoom, on the wheel's own glide.
			const box = this.container.getBoundingClientRect();
			const pending = this.wheelZoom?.pending ?? 0;
			this.wheelZoom = { x: box.left + box.width / 2, y: box.top + box.height / 2, pending: pending + gizmoZoom(dy, box.height) };
			return;
		}
		const gizmo = this.gizmoDrag;
		if (gizmo === null) return;
		gizmo.lastAt = performance.now();
		gizmo.drag.x += dx;
		gizmo.drag.y += dy;
		this.sample(this.samples, gizmo.drag.x, gizmo.drag.y);
		if (gizmo.pan) this.pan(dx, dy, gizmo.depth);
		else this.rotate(gizmo.drag, dx, dy);
	}

	/** The gizmo was let go. Released (not cancelled) while moving, a rotate or pan coasts on. A zoom's glide plays out by itself. */
	private endGizmo(kind: GizmoKind, released: boolean): void {
		const gizmo = this.gizmoDrag;
		this.gizmoDrag = null;
		if (kind === "zoom" || gizmo === null || !released) return;
		this.launchSwipe(gizmo, performance.now());
	}

	/** Track whether Control is physically down (see `ctrlHeld`). */
	private readonly onModifierKey = (e: KeyboardEvent): void => {
		this.ctrlHeld = e.key === "Control" ? e.type === "keydown" : e.ctrlKey;
	};

	/** A key released in another window never reaches this one. */
	private readonly onWindowBlur = (): void => {
		this.ctrlHeld = false;
	};

	/** Each frame, zoom by an eased share of the wheel's pending zoom, toward what is under the pointer now. */
	private easeWheel(seconds: number): void {
		const wheel = this.wheelZoom;
		if (wheel === null) return;
		const { step, remaining } = easeLook(wheel.pending, seconds, WHEEL_EASE_SECONDS, WHEEL_EASE_EPSILON);
		wheel.pending = remaining;
		if (remaining === 0) this.wheelZoom = null;
		if (step !== 0) this.dolly(this.aimPoint(wheel.x, wheel.y, false), step);
	}

	private showSpeed(): void {
		this.speedEl.setText(`Flight speed ×${flightScale.toFixed(flightScale < 1 ? 2 : 1)}`);
		this.speedEl.addClass("is-visible");
		window.clearTimeout(this.speedTimer);
		this.speedTimer = window.setTimeout(() => this.speedEl.removeClass("is-visible"), SPEED_READOUT_MS);
	}

	/** Turn the view for a drag of (`dx`, `dy`) px. */
	private rotate(drag: RotateDrag, dx: number, dy: number): void {
		// Mouse-look is eased: the drag only adds to the pending turn (see `easeLookPending`).
		if (drag.look && !drag.touch) {
			this.lookPending.x += dx;
			this.lookPending.y += dy;
			return;
		}
		const camera = this.graph.camera();
		const controls = this.orbitControls();
		let yaw: number;
		let pitch: number;
		if (drag.grab !== null && !drag.look) {
			// A grabbed planet turns however far keeps the grabbed point under the pointer.
			const ray = this.rayThrough(drag.x, drag.y);
			const aim = grabPoint(ray.origin, ray.direction, drag.pivot, drag.grab.radius);
			({ yaw, pitch } = stickyTurn(camera.position, controls.target, camera.up, drag.pivot, drag.grab.point, aim));
		} else {
			const rate = (drag.look ? LOOK_RATE : ORBIT_RATE) / Math.max(1, this.container.clientHeight);
			// Mouse-look turns toward the drag; a touch look drags the world, so it
			// turns the other way. Orbiting drags the world either way.
			const sign = drag.look && drag.touch ? 1 : -1;
			yaw = sign * rate * dx;
			pitch = sign * rate * dy;
		}
		rotateAboutPivot(camera.position, controls.target, drag.look ? camera.position.clone() : drag.pivot, yaw, pitch, camera.up);
		controls.update();
		drag.turned.x += yaw;
		drag.turned.y += pitch;
		this.sample(this.turnSamples, drag.turned.x, drag.turned.y);
	}

	/** Each frame, turn the camera by an eased share of the mouse-look drag still pending; it goes on gliding after release. */
	private easeLookPending(seconds: number): void {
		const p = this.lookPending;
		if (p.x === 0 && p.y === 0) return;
		const x = easeLook(p.x, seconds);
		const y = easeLook(p.y, seconds);
		p.x = x.remaining;
		p.y = y.remaining;
		const camera = this.graph.camera();
		const controls = this.orbitControls();
		const rate = LOOK_RATE / Math.max(1, this.container.clientHeight);
		rotateAboutPivot(camera.position, controls.target, camera.position.clone(), -rate * x.step, -rate * y.step, camera.up);
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
		if (pan.x !== 0 || pan.y !== 0) this.panCoast = { depth: pinch.depth, coast: { velocity: pan, stopBelow: PAN_MIN_VELOCITY } };
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

	/** One frame of momentum: each released gesture coasts on and slows to a stop, as in the mind map. */
	private coast(ms: number): void {
		const orbit = this.orbitCoast;
		if (orbit !== null) {
			const { delta, done } = stepCoast(orbit.coast, SPIN_FRICTION, ms);
			const camera = this.graph.camera();
			const controls = this.orbitControls();
			rotateAboutPivot(camera.position, controls.target, orbit.look ? camera.position.clone() : orbit.pivot, delta.x, delta.y, camera.up);
			controls.update();
			if (done) this.orbitCoast = null;
		}
		const pan = this.panCoast;
		if (pan !== null) {
			const { delta, done } = stepCoast(pan.coast, PAN_FRICTION, ms);
			this.pan(delta.x, delta.y, pan.depth);
			if (done) this.panCoast = null;
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
		return this.aim(x, y, touch).point;
	}

	/**
	 * `aimPoint`, and when that is a planet's core because the pointer is on
	 * one of its surface plates, `globe`: the radius at which that plate sits
	 * from the core, the sphere a drag grabs. Null otherwise.
	 *
	 * With `grab` (a drag starting), a pointer over a planet's sphere grabs it
	 * even off its plates: in a gap between them, or on its core or a star in
	 * front of it; the nearest sphere on the ray wins. Wheel and pinch zoom
	 * don't ask, so they head where they always did.
	 */
	private aim(x: number, y: number, touch: boolean, grab = false): { point: Vector3; globe: number | null } {
		const settings = this.controlSettings;
		if (touch ? settings.touchDrag === "center" : settings.desktopPivot === "center") {
			return { point: this.orbitControls().target.clone(), globe: null };
		}
		const camera = this.graph.camera();
		const picked = this.nodeNear(x, y, PICK_SLOP_PX[touch ? "touch" : "mouse"]);
		// Planets mode orbits a surface plate's planet: a drag turns the globe under the camera.
		const planet = picked === null ? undefined : this.live.get(this.world.planetOf(picked.id) ?? picked.id);
		const node = planet !== undefined && placed(planet) ? planet : picked;
		const centre = node === null ? null : new Vector3(node.x, node.y, node.z);
		const surface = centre !== null && node !== picked && picked !== null && placed(picked) ? centre.distanceTo(new Vector3(picked.x, picked.y, picked.z)) : 0;
		const sphere = grab && surface === 0 ? this.sphereUnder(x, y) : null;
		if (sphere !== null) {
			this.lastDepth = sphere.centre.distanceTo(camera.position);
			return { point: sphere.centre, globe: sphere.radius };
		}
		if (centre !== null) {
			this.lastDepth = centre.distanceTo(camera.position);
			return { point: centre, globe: surface > 0 ? surface : null };
		}
		const depth = this.lastDepth ?? camera.position.distanceTo(this.orbitControls().target);
		return { point: this.rayThrough(x, y).at(depth, new Vector3()), globe: null };
	}

	/** Planets mode: the nearest planet whose sphere the ray through client point (`x`, `y`) meets inside the mist, or null. */
	private sphereUnder(x: number, y: number): Sphere | null {
		const spheres: Sphere[] = [];
		for (const id of this.world.cores()) {
			const core = this.live.get(id);
			const radius = this.world.radius(id);
			if (core !== undefined && placed(core) && radius !== undefined && radius > 0) spheres.push({ centre: new Vector3(core.x, core.y, core.z), radius });
		}
		if (spheres.length === 0) return null;
		const ray = this.rayThrough(x, y);
		const hit = sphereOnRay(ray.origin, ray.direction, spheres);
		// Past the mist's reach (as `nodeNear`) a planet can't be seen, so it can't be grabbed.
		return hit === null || hit.distance > 2 / this.fog.density ? null : hit.sphere;
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
			// A planet's plate seen from behind is only drawn dimmed (the far side), so it can't be picked.
			const n = node.frame?.normal;
			if (n !== undefined && n.x * point.x + n.y * point.y + n.z * point.z >= 0) continue;
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

	/**
	 * The drawn edge nearest client point (`x`, `y`) on screen, within `slop` px
	 * and inside the mist: one the Overlays menu shows, not fading out, with both
	 * ends placed. In Planets mode it is hit-tested through the points it is
	 * drawn through (`planetEdge`), so a lane is picked on its bowed arc, not on
	 * the straight line between its plates. See `pickEdge`.
	 */
	private edgeNear(x: number, y: number, slop: number): { source: EngineNode; target: EngineNode } | null {
		const camera = this.graph.camera() as PerspectiveCamera;
		const rect = this.graph.renderer().domElement.getBoundingClientRect();
		const forward = camera.getWorldDirection(new Vector3());
		const point = new Vector3();
		const ends: { source: EngineNode; target: EngineNode }[] = [];
		const edges: DrawnEdge[] = [];
		for (const link of this.links) {
			const [source, target] = [link.source as EngineNode | string, link.target as EngineNode | string];
			if (typeof source === "string" || typeof target === "string") continue;
			if (source.departing || target.departing || !placed(source) || !placed(target)) continue;
			if (!this.edgeDrawn(link.kind, source, target) || Math.min(source.opacity, target.opacity) <= 0) continue;
			ends.push({ source, target });
			const points = this.world.size > 0 ? this.planetEdge(link.kind, source, target).points : [source, target];
			// A tapered edge is as wide to click as it is drawn.
			const taper = this.taperOf(link, target);
			edges.push(taper === null ? { points } : { points, width: { start: taper.parent, end: taper.child } });
		}
		// World units to px at a depth, along the screen's height.
		const pxPerUnit = (rect.height / 2) * camera.projectionMatrix.elements[5];
		const hit = pickEdge(
			edges,
			{
				depth: (p) => point.set(p.x, p.y, p.z).sub(camera.position).dot(forward),
				screen: (p) => {
					point.set(p.x, p.y, p.z).project(camera);
					return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
				},
				pxPerUnit: (depth) => pxPerUnit / Math.max(depth, CAMERA_NEAR),
			},
			x,
			y,
			slop,
			2 / this.fog.density,
		);
		return ends[hit] ?? null;
	}

	/** The ray from the camera through client point (`x`, `y`). */
	private rayThrough(x: number, y: number): Ray {
		const rect = this.graph.renderer().domElement.getBoundingClientRect();
		const ndc = new Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
		const raycaster = new Raycaster();
		// A drag may have moved the camera since the last render (a grabbed planet casts a ray on every move).
		const camera = this.graph.camera();
		camera.updateMatrixWorld();
		raycaster.setFromCamera(ndc, camera);
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
		this.easeLookPending(seconds);
		// A flight, glide or ride has the camera: nothing coasts against it.
		if (this.flight !== null || this.glide !== null || this.ride !== null || this.hoverFlight !== null) this.stopCoasting();
		this.stepSwipe();
		this.coast(Math.min(seconds * 1000, MAX_FRAME_MS));
		this.easeWheel(seconds);
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
		// A re-laid-out planet's plates ease to their new places.
		if (this.world.placeAll((id) => this.live.get(id), performance.now())) this.dirty = true;
		this.near.update(this.nodes, this.graph.camera() as PerspectiveCamera, focus.value, this.fog.density, seconds);
		this.ribbons.setViewportHeight(this.graph.renderer().domElement.height);
		if (this.dirty) {
			this.dirty = false;
			this.plates.write(this.nodes, this.layoutDirty);
			this.layoutDirty = false;
			this.writeEdges();
			this.writeThread();
			this.boundaries.invalidate();
		}
		this.boundaries.update(this.nodes, this.hierarchyEnds(), (node) => this.surfaceOf(node as EngineNode), now);
		this.updateHints(seconds);
		if (this.overlays.particles) this.writeParticles(now);
		this.stepLinkDrag();
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

	/**
	 * Edge hints (`edge-hints.ts`): near a node, each link or embed edge at it
	 * is labelled, just off this end, with the node at its other end; the
	 * nearest `HINT_MAX` ends show, fading in by view depth. One pass over the
	 * link and embed edges a frame, with the cheap depth test first; text, edge
	 * direction and the plate's reach are worked out only for the few chosen.
	 */
	private updateHints(seconds: number): void {
		const hints = this.hints;
		hints.begin();
		if (this.overlays.labels !== "none") this.placeHints();
		hints.end(seconds);
	}

	private placeHints(): void {
		if (this.hintLinks?.links !== this.links) this.hintLinks = { links: this.links, hinted: this.links.filter((link) => hintedKind(link.kind)) };
		const camera = this.graph.camera() as PerspectiveCamera;
		camera.updateMatrixWorld();
		const e = camera.matrixWorld.elements;
		const eye = { x: e[12], y: e[13], z: e[14] };
		const right = { x: e[0], y: e[1], z: e[2] };
		const up = { x: e[4], y: e[5], z: e[6] };
		const back = { x: e[8], y: e[9], z: e[10] };
		const focus = this.plates.focus.value;
		const density = this.fog.density;
		const point = this.hintPoint;
		const canvas = this.graph.renderer().domElement;
		const halfWidth = canvas.clientWidth / 2;
		const halfHeight = canvas.clientHeight / 2;
		// Screen px per world unit at view depth 1.
		const unitPx = halfHeight * camera.projectionMatrix.elements[5];
		const probes: HintProbe[] = [];
		const ends = new Map<string, { link: EngineLink; from: EngineNode & Vec3; to: EngineNode & Vec3; opacity: number; depth: number; x: number; y: number }>();
		for (const link of this.hintLinks.hinted) {
			const [source, target] = [link.source as EngineNode | string, link.target as EngineNode | string];
			if (typeof source === "string" || typeof target === "string") continue;
			if (source.departing || target.departing || !placed(source) || !placed(target)) continue;
			if (!this.edgeDrawn(link.kind, source, target)) continue;
			const opacity = Math.min(source.opacity, target.opacity);
			if (opacity <= 0) continue;
			for (const [from, to] of [[source, target], [target, source]] as const) {
				// Depth along the view, from the camera plane: behind the camera, beyond the far threshold or too small to read is out.
				const depth = -((from.x - eye.x) * back.x + (from.y - eye.y) * back.y + (from.z - eye.z) * back.z);
				if (depth <= 0 || !(hintFade(depth) > 0) || !(hintSizeFade((HINT_EM_WORLD * unitPx) / depth) > 0)) continue;
				// A planet's plate seen from behind is dimmed and shows no text; its edges' hints go with it.
				if (!showsText(from, from.frame?.normal, eye)) continue;
				point.set(from.x, from.y, from.z).project(camera);
				const id = `${link.kind}|${from.id}|${to.id}`;
				probes.push({ id, depth, x: point.x, y: point.y });
				ends.set(id, { link, from, to, opacity, depth, x: point.x * halfWidth, y: point.y * halfHeight });
			}
		}
		const chosen = chooseHints(probes, this.hints.ids());
		const spans: (HintSpan & { text: string; at: Vector3; dx: number; dy: number; scale: number; depth: number; opacity: number })[] = [];
		for (const id of chosen) {
			const end = ends.get(id);
			if (end === undefined) continue;
			const { link, from, to, depth } = end;
			const points = this.world.size > 0 ? this.planetEdge(link.kind, link.source as EngineNode & Vec3, link.target as EngineNode & Vec3).points : [link.source as Vec3, link.target as Vec3];
			const next = from === link.source ? points[1]! : points[points.length - 2]!;
			const dir = { x: next.x - from.x, y: next.y - from.y, z: next.z - from.z };
			const length = Math.hypot(dir.x, dir.y, dir.z);
			if (length < 1e-6) continue;
			dir.x /= length;
			dir.y /= length;
			dir.z /= length;
			// Clear the plate, or the panel over it, then a few px more.
			const box = this.near.liveBoxWorld(from.id) ?? from.shape;
			const reach = exitDistance(dir, { width: Math.max(box.width, from.shape.width) / 2, height: Math.max(box.height, from.shape.height) / 2 }, right, up) + HINT_GAP_PX / (unitPx / depth);
			const at = new Vector3(from.x + dir.x * reach, from.y + dir.y * reach, from.z + dir.z * reach);
			// The edge's direction as drawn on screen (y up): node centre to anchor, perspective included.
			point.copy(at).project(camera);
			let dx = point.x * halfWidth - end.x;
			let dy = point.y * halfHeight - end.y;
			const start = Math.hypot(dx, dy);
			if (start < 0.5) {
				// Seen end on: the camera-plane direction is all there is.
				dx = dir.x * right.x + dir.y * right.y + dir.z * right.z;
				dy = dir.x * up.x + dir.y * up.y + dir.z * up.z;
			}
			const textPx = (HINT_EM_WORLD * unitPx) / depth;
			const scale = textPx / HINT_BASE_PX;
			const text = hintText(from.graph, to.graph);
			const size = hintBox(text);
			const opacity = hintFade(depth) * hintSizeFade(textPx) * plateVisibility(end.opacity, depth, focus, density);
			spans.push({ id, group: from.id, angle: Math.atan2(dy, dx), start, length: size.length * scale, height: size.height * scale, text, at, dx, dy, scale, depth, opacity });
		}
		// Hints leaving one node in nearly the same direction are stacked out along their edges, or dropped.
		const pushes = stackHints(spans);
		for (const span of spans) {
			const push = pushes.get(span.id);
			if (push === undefined) continue;
			const { angle, flipped } = readableAngle(span.dx, span.dy);
			this.hints.place(span.id, span.text, span.at, angle, flipped, push, span.scale, span.depth, span.opacity);
		}
	}

	private writeEdges(): void {
		const geometry = this.edges.geometry;
		let positions = geometry.getAttribute("position") as BufferAttribute | undefined;
		let colors = geometry.getAttribute("color") as BufferAttribute | undefined;
		// Each vertex's planet core (w = 1), for the far-side dim; w = 0 off any planet.
		let cores = geometry.getAttribute("aCore") as BufferAttribute | undefined;
		// A planet's edges are arcs of up to LANE_SEGMENTS segments.
		const perLink = 2 * (this.world.size > 0 ? LANE_SEGMENTS : 1);
		if (positions === undefined || colors === undefined || cores === undefined || positions.count < this.links.length * perLink) {
			const capacity = Math.max(64, this.links.length * perLink * 2);
			geometry.dispose();
			positions = new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage);
			colors = new BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
			cores = new BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
			geometry.setAttribute("position", positions);
			geometry.setAttribute("color", colors);
			geometry.setAttribute("aCore", cores);
		}
		let vertex = 0;
		// A tapered hierarchy edge is straight, or a surface arc on a planet.
		this.ribbons.begin(this.overlays.taper ? this.outline().edges * (this.world.size > 0 ? ARC_SEGMENTS : 1) : 0);
		for (const link of this.links) {
			// Links hold IDs until the engine's next digest swaps in the nodes.
			const source = link.source as EngineNode | string;
			const target = link.target as EngineNode | string;
			if (typeof source === "string" || typeof target === "string") continue;
			if (source.x === undefined || target.x === undefined) continue;
			if (!this.edgeDrawn(link.kind, source, target)) continue;
			let alpha = LINK_OPACITY * Math.min(source.opacity, target.opacity);
			if (alpha <= 0) continue;
			const color = this.linkColor(link.kind, target);
			const taper = this.taperOf(link, target);
			if (taper !== null && placed(source) && placed(target)) {
				const { points, scale } = this.world.size > 0 ? this.planetEdge(link.kind, source, target) : { points: [source, target], scale: 1 };
				this.writeRibbon(points, taper, target, color, Math.min(1, alpha * scale), this.coreOf(source), this.coreOf(target));
				continue;
			}
			if (this.world.size > 0 && placed(source) && placed(target)) {
				const { points, scale } = this.planetEdge(link.kind, source, target);
				alpha = Math.min(1, alpha * scale);
				const [cs, ct] = [this.coreOf(source), this.coreOf(target)];
				for (let i = 1; i < points.length; i++) {
					for (const end of [points[i - 1]!, points[i]!]) {
						positions.setXYZ(vertex, end.x, end.y, end.z);
						const core = nearerCore(end, cs, ct);
						if (core === null) cores.setXYZW(vertex, 0, 0, 0, 0);
						else cores.setXYZW(vertex, core.x, core.y, core.z, 1);
						colors.setXYZW(vertex++, color.r, color.g, color.b, alpha);
					}
				}
				continue;
			}
			for (const end of [source, target]) {
				positions.setXYZ(vertex, end.x ?? 0, end.y ?? 0, end.z ?? 0);
				cores.setXYZW(vertex, 0, 0, 0, 0);
				colors.setXYZW(vertex++, color.r, color.g, color.b, alpha);
			}
		}
		geometry.setDrawRange(0, vertex);
		positions.needsUpdate = true;
		colors.needsUpdate = true;
		cores.needsUpdate = true;
		this.ribbons.end();
	}

	/** One tapered edge through `points` (parent first), its width easing from `ends.parent` to `ends.child` point by point, dashed as the child's branch style says. */
	private writeRibbon(points: readonly Vec3[], ends: TaperEnds, child: EngineNode, color: Color, alpha: number, cs: Vec3 | null, ct: Vec3 | null): void {
		const dash = dashOf(child.look.branchLine?.pattern, TAPER_PX_WORLD);
		const last = points.length - 1;
		let along = 0;
		for (let i = 1; i <= last; i++) {
			const [a, b] = [points[i - 1]!, points[i]!];
			const width = (k: number): number => ends.parent + ((ends.child - ends.parent) * k) / last;
			this.ribbons.segment(a, b, width(i - 1), width(i), along, dash, color, alpha, nearerCore(a, cs, ct), nearerCore(b, cs, ct));
			along += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
		}
	}

	/**
	 * A hierarchy edge's two widths when the Settings taper it (`branchEnds`:
	 * from its parent's outline depth, or the child's branch style), else
	 * null: it is a thin line like every other edge.
	 */
	private taperOf(link: EngineLink, child: EngineNode): TaperEnds | null {
		if (link.kind !== "hierarchy" || !this.overlays.taper) return null;
		const depth = this.outline().depths.get(endId(link.source)) ?? 0;
		return branchEnds(depth, child.look.branchLine, this.overlays.taperStrength, TAPER_PX_WORLD);
	}

	/** The loaded hierarchy: each node's outline depth (`hierarchyDepths`) and how many hierarchy edges there are, counted again only when the links change. */
	private outline(): { depths: Map<string, number>; edges: number } {
		if (this.taperDepths?.links !== this.links) {
			const ends = this.hierarchyEnds();
			this.taperDepths = { links: this.links, depths: hierarchyDepths(ends), edges: ends.length };
		}
		return this.taperDepths;
	}

	/** An edge's colour: a hierarchy edge's child's branch line colour, when it has one 3D can draw; otherwise its kind's. */
	private linkColor(kind: GraphEdgeKind, child: EngineNode): Color {
		const css = kind === "hierarchy" ? child.look.branchLine?.color : undefined;
		if (css === undefined) return this.edgeColor(kind);
		let color = this.branchColors.get(css);
		if (color === undefined) {
			const parsed = cssColor(css);
			this.branchColors.set(css, (color = parsed === null ? null : new Color(parsed)));
		}
		return color ?? this.edgeColor(kind);
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

	/** The outline's parent → child edges among the loaded nodes, for boundaries. */
	private hierarchyEnds(): { source: string; target: string }[] {
		const out: { source: string; target: string }[] = [];
		for (const link of this.links) if (link.kind === "hierarchy") out.push({ source: endId(link.source), target: endId(link.target) });
		return out;
	}

	/** Planets mode: the planet a surface plate lies on, for its boundary patch; null for a core, a star, or another layout. */
	private surfaceOf(node: EngineNode): BoundarySurface | null {
		if (node.frame === undefined) return null;
		const id = this.world.planetOf(node.id);
		const core = this.coreOf(node);
		const radius = id === undefined ? undefined : this.world.radius(id);
		return id === undefined || core === null || radius === undefined ? null : { core: id, centre: core, radius };
	}

	/** The placed core of the planet `node` is on (itself for a core), or null off any planet. */
	private coreOf(node: EngineNode): (EngineNode & Vec3) | null {
		const id = this.world.planetOf(node.id);
		const core = id === undefined ? undefined : this.live.get(id);
		return core !== undefined && placed(core) ? core : null;
	}

	/**
	 * The bow of the lane between two plates on different planets (`laneBow`),
	 * or null when they are not (a straight edge).
	 */
	private laneBowOf(source: EngineNode, target: EngineNode): Vec3 | null {
		const [ps, pt] = [this.world.planetOf(source.id), this.world.planetOf(target.id)];
		if (ps === undefined || pt === undefined || ps === pt) return null;
		const [cs, ct] = [this.live.get(ps), this.live.get(pt)];
		if (cs === undefined || ct === undefined || !placed(cs) || !placed(ct) || !placed(source) || !placed(target)) return null;
		return laneBow(source, target, cs, ct);
	}

	/**
	 * Planets mode: the points an edge is drawn through, and its opacity
	 * scale. Between two surface plates of one planet a hierarchy or embed edge
	 * is a surface arc and a link a dim tunnel (a chord through the interior);
	 * between planets a link is a bright lane bowed out of both. Anything else,
	 * a stalk from the core to a continent among them, is straight.
	 */
	private planetEdge(kind: GraphEdgeKind, source: EngineNode & Vec3, target: EngineNode & Vec3): { points: Vec3[]; scale: number } {
		const straight = { points: [source, target], scale: 1 };
		const [ps, pt] = [this.world.planetOf(source.id), this.world.planetOf(target.id)];
		if (ps === undefined || pt === undefined) return straight;
		const [cs, ct] = [this.live.get(ps), this.live.get(pt)];
		if (cs === undefined || ct === undefined || !placed(cs) || !placed(ct)) return straight;
		if (ps !== pt) return { points: laneArc(source, target, cs, ct, LANE_SEGMENTS), scale: LANE_OPACITY / LINK_OPACITY };
		if (source.id === ps || target.id === ps) return straight;
		if (kind === "hierarchy" || kind === "embed") return { points: surfaceArc(cs, source, target, ARC_SEGMENTS), scale: 1 };
		return { points: [source, target], scale: TUNNEL_OPACITY / LINK_OPACITY };
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

/** Whether the simulation has given a node a position yet. */
function placed(node: EngineNode): node is EngineNode & Vec3 {
	return node.x !== undefined && node.y !== undefined && node.z !== undefined;
}

/** Straight-line distance between two placed nodes; `Infinity` while either has no position. */
function worldDistance(a: EngineNode, b: EngineNode): number {
	if (a.x === undefined || a.y === undefined || a.z === undefined || b.x === undefined || b.y === undefined || b.z === undefined) return Infinity;
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Whether a node's plate has a context menu: lines and note cores, which belong to a note (tags, files and ghosts have none). */
function hasMenu(node: GraphNode): boolean {
	return node.kind === "line" || node.kind === "note";
}

/** Which of an edge's two planet cores a point of it belongs to (the nearer; a lane's middle is between two planets), or null off planets. */
function nearerCore(point: Vec3, cs: Vec3 | null, ct: Vec3 | null): Vec3 | null {
	return cs === null || (ct !== null && distanceSq(point, ct) < distanceSq(point, cs)) ? ct : cs;
}

function distanceSq(a: Vec3, b: Vec3): number {
	return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}
