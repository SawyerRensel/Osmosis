import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	MarkdownView,
	MarkdownRenderer,
	Component,
	Platform,
	Scope,
	Notice,
	Menu,
	parseLinktext,
	parseYaml,
	resolveSubpath,
	setIcon,
	type ViewStateResult,
	type Modifier,
} from "obsidian";
import { arrowKeyStep, hierarchyStep, type HierarchyStep } from "../hierarchy-nav";
import { ParseCache } from "../cache";
import { MindMapPerf } from "./MindMapPerf";
import { OsmosisParser } from "../parser";
import { normalizeBlockSpacing } from "../markdown-spacing";
import { OsmosisNode, OsmosisTree } from "../types";
import * as edit from "../mindmap-edit";
import { groupDisplayMarkdown } from "../line-groups";
import { clipboardItem, copyStyleOf, fillClipboard, nodeClipboard, pasteInto, pasteMigrates, spendCut, stylePasteOverrides, type ClipboardItem } from "../node-clipboard";
import { codeFitLimitPx } from "../code-fit";
import { planStyleKeys } from "../mindmap-style-key";
import { selectAfterDelete } from "../select-after-delete";
import { enterSavesEdit } from "../edit-keys";
import { EditPipeline, type RestoredFile } from "../edit-pipeline";
import { lineAt } from "../heading-links";
import { planHeadingRename, rewriteOwnLinks, rewriteVaultLinks, type HeadingRename } from "../heading-link-update";
import { replaceableLine, rewriteLines, type FindItem, type LineRewrite, type ReplacePlan } from "../find-replace";
import { OSMOSIS_FENCE_REGEX } from "../card-gen/generate-ids";
import { ancestorsOf, findNodeById, nodeAtStart } from "../graph3d/edit";
import { planSelectionLink, type PickedLine, type PlanNote } from "../graph3d/selection-edit";
import { LinkPicker, linkMenuItems } from "../link-pick";
import { FindBar, type FindHost } from "./FindBar";
import * as moves from "../edit-moves";
import type { MoveContext } from "../edit-moves";
import { canConvertBranch, convertBranchToNote } from "../convert-branch";
import { nodePathAt } from "../mindmap-links";
import { readMapState, writeMapState } from "../mindmap-state";
import { landingChain, landingZoom, readLanding, type Landing, type LiftOff, type MapBox } from "../graph3d/liftoff";
import {
	computeLayout,
	LayoutNode,
	LayoutResult,
	DEFAULT_LAYOUT_CONFIG,
} from "../layout";
import type OsmosisPlugin from "../main";
import type { BranchLineStyle, BranchLinePattern, BranchLineTaper, MapSettings } from "../settings";
import { DEFAULT_MAP_SETTINGS } from "../settings";
import { TransclusionResolver } from "../transclusion";
import { getTheme, isDefaultTheme } from "../themes";
import { resolveNodeStyle, lookupNodeStyle, lookupClassStyle, lookupVariantStyle, parseOsmosisStyleFrontmatter, isCorruptStyleFrontmatter, styleMappingFor, readStyleMapping, buildStableIdSelector, buildBlockIdSelector, buildPreferredSelector, mergeNodeStyle, buildMapSettingsFromFrontmatter, buildTreePathMap, lookupNodeStyleByPath } from "../styles";
import type { ThemeDefinition, OsmosisStyleFrontmatter, NodeStyle, TopicShape, LayoutSide } from "../styles";
import { mergeStyleOverride } from "../style-write";
import type { NodeStyleContext, NodeStyleHost } from "./style-host";
import { createShapeElement, getShapeInsets } from "../shapes";
import { BOUNDARY_PADDING, boundaryShapes, resolveBoundary, roundedHullPath } from "../boundary";
import { viewBoxTransform, clientToUser } from "../mindmap-viewport";
import { drawWithinBudget, fitViewBox, rectInView } from "../mindmap-cull";
import { planReuse, translateAttr, type DrawnGroup, type WantedNode } from "../mindmap-reuse";
import {
	KEEP_VISIBLE_PX,
	MAX_FRAME_MS,
	PAN_FRICTION,
	PAN_MIN_VELOCITY,
	SPRING_EPSILON_PX,
	ZOOM_FRICTION,
	ZOOM_MIN_VELOCITY,
	applyRubberBand,
	clampRange,
	estimateVelocity,
	integrateDecay,
	launchVelocity,
	pruneSamples,
	springStep,
	springTarget,
	type Range,
	type Sample,
} from "../mindmap-inertia";
import { exceedsDragThreshold, nodeDragPans } from "../mindmap-gesture";
import { movedPastSlop } from "../pointer-gesture";
import { ToolRibbon, syncNavbar, type ButtonDef, type NavbarHost, type ToolbarState } from "./ToolRibbon";
import {
	EmbeddableMarkdownEditor,
	suggestOpen,
	autoResizeExtension,
} from "../editor/EmbeddableMarkdownEditor";
/* eslint-disable-next-line import/no-extraneous-dependencies -- CodeMirror 6 ships inside Obsidian and is resolved from the host at runtime, never bundled. */
import { EditorSelection } from "@codemirror/state";
/* eslint-disable-next-line import/no-extraneous-dependencies -- Same as above: @codemirror/view is provided by Obsidian, never bundled. */
import { EditorView } from "@codemirror/view";
import { CLOZE_BLANK, splitFenceHeader } from "../card-gen/explicit";
import { colourAnswer, colourBlank, parseHighlightToken } from "../card-gen/cloze-colour";
import { fenceDiagrams } from "../card-gen/occlusion";
import { lineCardId } from "../card-gen/line-cards";
import {
	allFenceCardKeys,
	allLineCardIds,
	cardIdsForSpatialKey,
	collectSubtreeCardKeys,
	dueOrNewFenceCardKeys,
	dueOrNewLineCardIds,
	fenceKeyFromNode,
	occlusionForLineKey,
	spatialStudyKeys,
} from "../study/spatial-study";
import type { Card, CardOcclusion } from "../database/types";
import { peekIcon } from "./LineRevealProcessor";
import { addPaneMenuItems, arrangeViewHeader } from "./ViewHeader";
import { readingToggle } from "../view-header";
import { overlayMasks, removeMaskOverlays, renderOcclusion } from "./OcclusionRenderer";
import { resolveDefaultReadingMode } from "../reading-mode";
import type { FSRSRating } from "../database/FSRSScheduler";
import type { StudySessionManager } from "../study/StudySessionManager";

export const VIEW_TYPE_MINDMAP = "osmosis-mindmap";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** A rendered code block's padding across, both sides together, in px (Obsidian's `pre`: 16 px a side). */
const CODE_BLOCK_PAD_PX = 32;

// Viewport constants
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_SENSITIVITY = 0.002;
const SCROLL_SENSITIVITY = 1;
const LAYOUT_PADDING = 50;

// Inline editing constants
const EDIT_OVERLAY_MARGIN = 8; // px kept between the edit overlay and the viewport edge
const EDIT_BUTTONS_MIN_WIDTH = 72; // px the overlay needs to hold both icon buttons side by side

// Animation constants
const COLLAPSE_ANIMATION_MS = 80;

// Touch constants
const LONG_PRESS_MS = 400; // ms before touch-on-node becomes drag
const DOUBLE_TAP_MS = 300; // max ms between taps for double-tap
const DOUBLE_TAP_DISTANCE = 20; // max px drift between two taps
const PINCH_TAIL_MS = 300; // max ms a pinch's last finger may linger and still fling
const PINCH_PAN_SLOP = 16; // px the pinch centre may wander before it also pans

// Viewport culling constants
const CULL_MARGIN = 200; // extra pixels around viewport to pre-render
// Time one cull pass may spend starting draws of nodes that entered the view;
// the rest wait for the next frame (see `updateVisibleNodes`).
const CULL_DRAW_BUDGET_MS = 8;

/** A viewport saved by `getEphemeralState`, as history hands it back. */
interface SavedViewport {
	x: number;
	y: number;
	w: number;
	h: number;
	zoom: number;
}

function isViewport(value: unknown): value is SavedViewport {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return ["x", "y", "w", "h", "zoom"].every((k) => typeof v[k] === "number");
}

/**
 * A fence node rendered as a card.
 *
 * `front`/`back` are markdown. An occlusion fence adds `occlusions`: masks are
 * an SVG overlay pinned to an image rather than markdown, so its diagrams are
 * carried separately and its prose holds only what surrounded them.
 */
interface OsmosisCardContent {
	front: string;
	back: string;
	occlusions?: CardOcclusion[];
	/**
	 * A cloze fence, whose two halves are the same passage blanked and filled in
	 * — so revealing it replaces the question rather than adding an answer under
	 * it. See `applyFenceHidden`.
	 */
	isCloze?: boolean;
}

export class MindMapView extends ItemView implements NodeStyleHost, NavbarHost {
	private cache = new ParseCache();
	private transclusionResolver: TransclusionResolver;
	private currentFile: TFile | null = null;
	private currentTree: OsmosisTree | null = null;
	private renderComponent: Component | null = null;
	plugin: OsmosisPlugin;

	// Per-map settings (resolved from defaults + per-note overrides)
	private mapSettings: MapSettings = { ...DEFAULT_MAP_SETTINGS };
	private activeTheme: ThemeDefinition | undefined;
	/** Effective theme = activeTheme + map-level baseStyle. Recomputed each render pass. */
	private effectiveTheme: ThemeDefinition | undefined;
	private osmosisStyleFrontmatter: OsmosisStyleFrontmatter | undefined;

	// Viewport state
	private viewBox = { x: 0, y: 0, w: 800, h: 600 };
	private zoom = 1;
	private isPanning = false;
	private panStart = { x: 0, y: 0 };
	/**
	 * A mouse right-button press, with the node under it. It pans the map when
	 * dragged; released without moving past the shared slop, it opens the node
	 * (or background) context menu on release.
	 */
	private contextPress: { nodeId: string | null } | null = null;
	/** When the context menu last opened on release; the browser's own `contextmenu` event that follows at once (Windows) is not a second request. */
	private contextOpenedAt = -Infinity;
	private svg: SVGSVGElement | null = null;
	/**
	 * WKWebView strands composited `<foreignObject>` content when the SVG's
	 * `viewBox` changes, so iOS pans the map with a CSS transform on the SVG
	 * instead — see `src/mindmap-viewport.ts` for the mechanism and the maths.
	 * Chromium (desktop Electron, Android's WebView) re-transforms those layers
	 * correctly and stays on the `viewBox` path.
	 */
	private readonly panByTransform = Platform.isIosApp;
	/**
	 * The element whose box *is* the viewport, on the transform path: the SVG
	 * no longer clips at its own bounds, so this wrapper does the clipping,
	 * stays put while the SVG moves, and is what screen coordinates are
	 * measured against. Null on the `viewBox` path, where the SVG is all three.
	 */
	private viewportHost: HTMLDivElement | null = null;

	// Collapse state
	private collapsedIds = new Set<string>();
	/** Transclusion nodes deferred for lazy loading (not yet parsed/expanded). */
	private lazyTransclusionIds = new Set<string>();
	private currentLayout: LayoutResult | null = null;

	// Undo/redo. Map edits write to disk directly (vault.modify /
	// processFrontMatter), bypassing CodeMirror, so there is no editor history to
	// forward to. Every write goes through `edits`, which records it in the
	// plugin's shared per-file history (`src/edit-history.ts`), covering both
	// text/structure and style writes. The map holds its own note's history while
	// it shows that note (`historyKey`); switching notes or closing the map lets
	// go of it, which clears it unless another view still holds it.
	private readonly edits: EditPipeline;
	private historyKey: string | null = null;
	private releaseHistory: (() => void) | null = null;
	/** The 3D graph's state (depth, backlinks, follow) from the last toggle into this map, handed back on the next toggle to 3D. */
	private graph3dState: Record<string, unknown> | null = null;

	// Deferred re-sync. A schedule flush writes only frontmatter, so the map
	// draws identically afterwards — but the frontmatter block grew, which
	// shifts every body offset the tree's ranges index. Re-syncing on the spot
	// meant a rating cost a full re-parse of the host note, a re-read and deep
	// clone of every embedded note, and a teardown-and-rebuild of the whole SVG
	// — the visible "blink", and on a large map with many transcluded notes
	// enough repeated work to take Obsidian down mid-session. So the paths are
	// noted here instead and reconciled at the two moments the offsets are
	// actually about to be read: before a structural edit, and at session end.
	private staleParsePaths = new Set<string>();
	private treeStale = false;

	// Notes already reported as having unreadable `osmosis-styles`. Keyed by
	// path so the notice fires once per note rather than on every re-parse.
	private readonly reportedCorruptStylePaths = new Set<string>();

	// Serializes render passes. `render()` unloads the previous render Component
	// and empties the container partway through; two overlapping passes tear
	// down each other's DOM while the other is still awaiting measurement.
	private renderChain: Promise<void> = Promise.resolve();
	/**
	 * Bumped whenever a full pass replaces the layout. A cull pass draws into a
	 * staging group and commits only if this has not moved, since an edit's
	 * pass keeps the same node group (see {@link redrawInPlace}).
	 */
	private drawGeneration = 0;
	/**
	 * What each node group drawn from the HTML cache was drawn from, so an
	 * edit's pass can keep the ones that would draw the same (T80). Groups not
	 * in here (fresh Markdown renders, checkboxes) are always redrawn.
	 */
	private drawRecords = new WeakMap<Element, { sig: string; x: number; y: number; cls: string; htmlKey: string; html: HTMLElement }>();
	// Set by `onClose`. A pass already queued on the chain when the view goes
	// away must not paint into a container that has been torn down.
	private closed = false;

	// Live-edit sessions (a color-picker drag) and edit groups (a move across
	// an embed boundary) live on `edits.recorder`, which collapses each into one
	// undo step. Both also gate reload-on-modify while open: self-writes neither
	// tear down an open picker mid-drag nor reload between a group's writes,
	// which a single `suppressNextReload` can't cover.

	// Selection state
	private selectedNodeId: string | null = null;
	private selectedNodeIds = new Set<string>();
	private nodeMap = new Map<string, LayoutNode>();
	private selectionChangeListeners = new Set<() => void>();
	private fileLoadListeners = new Set<() => void>();

	// Rubber-band selection state
	private isRubberBanding = false;
	private rubberBandStart = { x: 0, y: 0 };
	private rubberBandRect: SVGRectElement | null = null;

	// Editing state
	private editingNodeId: string | null = null;
	private editContainer: HTMLDivElement | null = null;
	private editEditor: EmbeddableMarkdownEditor | null = null;
	private editCleanup: (() => void) | null = null;
	/**
	 * The node being edited, measured at zoom 1: its rendered text metrics and
	 * the width it wraps at. Read once when editing starts, then re-scaled by
	 * `positionEditOverlay` on every pan and zoom.
	 */
	private editMetrics: {
		fontSize: number;
		lineHeight: number;
		maxNodeWidth: number;
	} | null = null;

	// Sync state: when true, skip the next vault.modify reload to prevent flicker
	suppressNextReload = false;

	// Clipboard state (copy/cut/paste, copy/paste style) is shared with the 3D graph: see node-clipboard.ts.

	// Drag-and-drop state
	private dragNodeId: string | null = null;
	private dragStartScreen = { x: 0, y: 0 };
	private isDragging = false;
	private dragGhost: SVGGElement | null = null;
	private dropIndicator: SVGLineElement | null = null;
	/** Destination-note label shown beside the indicator on a cross-note drop. */
	private dropIndicatorLabel: SVGTextElement | null = null;
	private dropTarget: { parentId: string; index: number } | null = null;
	/**
	 * Containing-file lookup captured for the duration of a drag. Resolved once
	 * at drag start rather than per mousemove — it walks the whole tree, and the
	 * tree cannot change while a drag is in flight.
	 */
	private dragFileOf: edit.FileOf | null = null;

	// Pending selection: after a save-edit re-render, re-select the node at this position
	private pendingSelectionRangeStart: number | null = null;

	// Cursor sync state
	private parser = new OsmosisParser();
	/** The toolbar's Add link: armed on the selected nodes, the next tap on a node links them to it. */
	private readonly linkPicker = new LinkPicker();
	private cursorSyncNodeId: string | null = null;
	private cursorSyncTimer: number | null = null;
	private suppressCursorSync = false;

	// Node size measurement cache (keyed by display content string)
	private nodeSizeCache = new Map<
		string,
		{ width: number; height: number }
	>();
	// Rendered HTML cache: avoids repeated MarkdownRenderer.render() calls for
	// nodes whose content hasn't changed (keyed by display content string)
	private nodeHtmlCache = new Map<string, HTMLElement>();

	// Viewport culling state
	private renderedNodeIds = new Set<string>();
	// Branch lines are culled on their own geometry, keyed by child node id
	private renderedBranchIds = new Set<string>();
	private cullRafId: number | null = null;
	// A cull pass is mid-flight; a further request arrived while it was.
	// See `runCullUpdate` — passes must not overlap.
	private cullRunning = false;
	private cullQueued = false;
	private branchLinesGroup: SVGGElement | null = null;
	private nodesGroup: SVGGElement | null = null;

	// Touch/pointer state
	private activePointers = new Map<number, { x: number; y: number }>();
	private longPressTimer: number | null = null;
	private longPressTriggered = false;
	private lastTapTime = 0;
	private lastTapPosition = { x: 0, y: 0 };
	private lastTapNodeId: string | null = null;
	private pinchStartDistance: number | null = null;
	private pinchStartZoom = 1;
	private pinchCenter = { x: 0, y: 0 };
	/** Where the pinch centre started, for the two-finger pan slop. */
	private pinchStartCenter = { x: 0, y: 0 };
	/** True once the pinch centre has wandered far enough to also pan. */
	private pinchPanActive = false;
	private lastPointerType = "mouse";

	// Touch inertia (`src/mindmap-inertia.ts` holds the maths).
	//
	// Touch only: trackpads already emit OS-level momentum wheel events, so a
	// coast of our own would compound with theirs. Everything below stays inert
	// for mouse input, bounds included — desktop keeps its unbounded pan.
	/** Recent finger positions, screen px, for the flick velocity estimate. */
	private panSamples: Sample[] = [];
	/** Recent zoom levels as ln(zoom), for the pinch velocity estimate. */
	private zoomSamples: Sample[] = [];
	/**
	 * The undamped viewBox origin during a touch drag. The viewBox itself holds
	 * the rubber-banded position; past a bound the two diverge, and springing
	 * back means walking the drawn one home to this one's clamp.
	 */
	private panRaw: { x: number; y: number } | null = null;
	/** Coast velocity: finger px/ms for pan, ln(zoom)/ms for zoom. */
	private panVelocity = { x: 0, y: 0 };
	private zoomVelocity = 0;
	/**
	 * The coast this touch interrupted, and when it interrupted it. A flick in
	 * the same direction inherits what is left of it, so throwing the map
	 * repeatedly builds speed instead of restarting at each flick's own.
	 */
	private carryVelocity = { x: 0, y: 0 };
	private touchDownTime = 0;
	/**
	 * This touch landed on a moving map. Its job was to stop it, so it does not
	 * also count as a tap — stopping a coast must not clear the selection.
	 */
	private stoppedInertiaOnDown = false;
	/**
	 * A background pan that has not yet cleared its slop. Until it does the map
	 * holds still, so the finger settling before a second one joins it for a
	 * pinch cannot slide the map first.
	 */
	private panPending = false;
	/**
	 * This gesture cleared its slop and moved the map. It is therefore a pan and
	 * not also a tap, which matters in peek/study where a tap is a reveal.
	 */
	private panCommitted = false;
	/** Screen point the coasting zoom scales about — the last pinch centre. */
	private zoomAnchor = { x: 0, y: 0 };
	private inertiaRafId: number | null = null;
	private inertiaLastFrame = 0;
	/**
	 * Where and when the second-to-last finger of a pinch lifted, while the map
	 * waits to see whether the last one is dragging or leaving.
	 */
	private pinchTail: { x: number; y: number; t: number } | null = null;
	/** Zoom velocity captured when the pinch broke, spent if the tail ends. */
	private pinchTailZoomVelocity = 0;
	private touchSelectionMode = false;
	private resizeObserver: ResizeObserver | null = null;
	private toolRibbon: ToolRibbon | null = null;
	/** Ctrl+F's find bar over the map: the note and its transclusions. */
	private findBar: FindBar | null = null;
	/** The perf readout in the top-left corner (hidden by default). */
	private perf: MindMapPerf | null = null;
	/** The find bar's matches, marked on their nodes (`markFound`). */
	private foundIds: ReadonlySet<string> = new Set();

	// Pin/lock state: when pinned, active-leaf-change doesn't switch the map
	private isPinned = false;

	// Spatial peek/study state (plan §5 "Spatial (Mind Map View)").
	// - "peek": every line-card node hidden, reveal in any order, nothing recorded.
	// - "study": due-or-new line-card nodes hidden, reveal + rate via FSRS.
	// Session state is keyed by card key (`${notePath}#^${blockId}`, the
	// line card's ID), not layout node ID — node IDs are content-position
	// hashes that churn when a schedule flush or edit shifts the source,
	// while block IDs travel with their lines. The path half disambiguates
	// transcluded nodes, whose block IDs belong to other notes and may
	// collide with the host's.
	private spatialMode: "off" | "peek" | "study" = "off";
	private spatialStudyActionEl: HTMLElement | null = null;
	/** Card keys hidden this session (all line cards on the map for peek, due-or-new for study). */
	private spatialTargets = new Set<string>();
	/**
	 * The targets each node carries, keyed by the node's own card key, in the
	 * order study asks them.
	 *
	 * One key per due card. Nearly always that is one key — a node is one unit of
	 * work — but anything that fanned out is several: an occluded diagram's shape
	 * groups, a cloze's groups, the two directions of a bidirectional pair. Each
	 * is a card with its own schedule, so the node steps through them one at a
	 * time and appears here under several keys. That is why `spatialTargets` is
	 * not simply the node keys on the map, and why the banner's count is honest
	 * about how much is left. Peek never splits: it reveals in any order and
	 * records nothing, so stepping would invent an interaction it does not have.
	 */
	private spatialNodeTargets = new Map<string, string[]>();
	/**
	 * The diagram each split target asks about, so a repaint can single its group
	 * out. Only occlusion group keys appear here; an unsplit node has no target.
	 */
	private spatialGroupOcclusions = new Map<string, CardOcclusion>();
	/**
	 * The card each split target asks, for every fence that is not a diagram — so
	 * a stepping node can put the question being rated on screen instead of the
	 * passage all its cards came from.
	 *
	 * An occluded node is absent by design: its steps differ in which masks are
	 * filled, not in their markdown, and it is repainted through
	 * `spatialGroupOcclusions` rather than rebuilt.
	 */
	private spatialStepCards = new Map<string, Card>();
	/** Targets already revealed (rated or awaiting a rating). */
	private spatialRevealed = new Set<string>();
	/** Targets rated so far (study progress). */
	private spatialRated = new Set<string>();
	/** Revealed-but-unrated card whose rating bubble is showing (study only). */
	private spatialPendingRating: string | null = null;
	/**
	 * Layout node the pending rating bubble anchors to. A note transcluded
	 * twice puts two nodes on one card key — the bubble follows the node
	 * the user actually clicked. Re-picked if a reload dropped the node.
	 */
	private spatialPendingNodeId: string | null = null;
	/**
	 * When the pending card was revealed, for the review log's elapsed time.
	 * A node sits on the map alongside everything else, so there is no separate
	 * "question shown" moment — the reveal is the only defensible anchor.
	 */
	private spatialPendingRatingAt = 0;
	/** Floating progress pill ("4/9 due reviewed" + Stop, study only). */
	private spatialBanner: HTMLElement | null = null;
	private spatialSessionManager: StudySessionManager | null = null;

	// Reading mode: the map can be explored and studied but not mutated.
	// Enforced by guards on the mutation methods (assertEditable/startDrag),
	// so every entry surface — keyboard, ribbon, menus, gestures — is covered.
	private isReadingMode = false;
	private readingActionEl: HTMLElement | null = null;

	// Resize state: drag-to-resize node width
	private resizingNodeId: string | null = null;
	private resizeStartX = 0;
	private resizeStartWidth = 0;
	private resizeCurrentWidth = 0;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
		this.icon = "brain-circuit";
		this.plugin = (
			this.app as unknown as {
				plugins: { plugins: Record<string, OsmosisPlugin> };
			}
		).plugins.plugins["osmosis"] as OsmosisPlugin;
		this.transclusionResolver = new TransclusionResolver(
			this.app,
			this.cache,
		);
		this.edits = new EditPipeline(
			this.app,
			this.plugin.editHistory,
			() => this.historyKey,
			(path) => {
				this.suppressNextReload = true;
				this.cache.invalidate(path);
			},
		);

		// Register a scope so Obsidian routes key events to this view when focused,
		// preventing global hotkeys (like F2 = "rename file") from intercepting them.
		this.scope = new Scope(this.app.scope);
		// Keys typed in the find bar are its own (and the text box's), not the map's.
		const inFind = (e: KeyboardEvent): boolean => this.findBar?.contains(e.target) === true;
		this.scope.register([], "F2", (e: KeyboardEvent) => {
			if (!this.editingNodeId && this.selectedNodeId && !inFind(e)) {
				void this.startEditing(this.selectedNodeId);
				e.preventDefault();
				return false;
			}
			return undefined;
		});

		// Register Ctrl/Cmd combos that Obsidian would otherwise intercept
		for (const key of ["d", "c", "x", "v", "z", "y", "Enter"]) {
			this.scope.register(["Mod"], key, (e: KeyboardEvent) => {
				if (inFind(e)) return undefined;
				this.handleKeyDown(e);
				return false;
			});
		}
		for (const key of ["[", "]", "z"]) {
			this.scope.register(["Mod", "Shift"], key, (e: KeyboardEvent) => {
				if (inFind(e)) return undefined;
				this.handleKeyDown(e);
				return false;
			});
		}
		// Shift+Enter adds a sibling above. Claim it here so a user hotkey on the same keys can't take it first.
		this.scope.register(["Shift"], "Enter", (e: KeyboardEvent) => {
			if (this.editingNodeId || inFind(e) || !this.selectedNodeId) return undefined;
			if (!e.defaultPrevented) this.handleKeyDown(e);
			return false;
		});
		// Ctrl/Cmd+F opens the find bar (the node editor keeps its own).
		this.scope.register(["Mod"], "f", () => {
			if (this.editingNodeId || !this.findBar) return undefined;
			this.findBar.open();
			return false;
		});
		this.scope.register(["Mod", "Shift"], "c", (e: KeyboardEvent) => {
			if (inFind(e)) return undefined;
			this.copyNodeStyle();
			e.preventDefault();
			return false;
		});
		// Ctrl/Cmd+E toggles reading mode, matching the markdown view
		this.scope.register(["Mod"], "e", (e: KeyboardEvent) => {
			this.toggleReadingMode();
			e.preventDefault();
			return false;
		});
		this.scope.register(["Mod", "Shift"], "v", (e: KeyboardEvent) => {
			if (inFind(e)) return undefined;
			void this.pasteNodeStyle();
			e.preventDefault();
			return false;
		});
		for (const key of ["[", "]"]) {
			this.scope.register(["Mod"], key, (e: KeyboardEvent) => {
				if (inFind(e)) return undefined;
				this.handleKeyDown(e);
				return false;
			});
		}
		// Ctrl/Cmd+Arrow walks the outline (+Shift extends the selection). Claim it
		// here too; while editing, the keys stay with the editor's word jumps.
		for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
			for (const modifiers of [["Mod"], ["Mod", "Shift"]] as Modifier[][]) {
				this.scope.register(modifiers, key, (e: KeyboardEvent) => {
					if (this.editingNodeId || inFind(e) || !this.selectedNodeId) return undefined;
					if (!e.defaultPrevented) this.handleKeyDown(e);
					return false;
				});
			}
		}
		// Alt+Arrow moves nodes. Claim it here, or a user hotkey on the same
		// keys (e.g. "Move line up") takes it first and nothing moves.
		for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
			this.scope.register(["Alt"], key, (e: KeyboardEvent) => {
				if (this.editingNodeId || inFind(e)) return undefined;
				this.handleKeyDown(e);
				return false;
			});
		}
	}

	/** Open the find bar from the ⋯ menu, as Ctrl+F does. Deferred a tick so the closing menu doesn't take the focus back (a phone's can). */
	private openFind(focus: "query" | "replace"): void {
		window.setTimeout(() => {
			if (!this.editingNodeId) this.findBar?.open(focus);
		}, 0);
	}

	/** The ⋯ menu: Find, Replace, Style, Pin and Peek (`PANE_MENU`), ahead of Obsidian's own entries. */
	onPaneMenu(menu: Menu, source: string): void {
		addPaneMenuItems(menu, "2d", {
			find: { onClick: () => this.openFind("query") },
			replace: { onClick: () => this.openFind("replace") },
			style: { onClick: () => void this.plugin.activatePropertiesSidebar() },
			pin: { onClick: () => this.togglePin(), checked: this.isPinned },
			peek: { onClick: () => this.toggleSpatialPeek(), checked: this.spatialMode === "peek", icon: peekIcon() },
		});
		super.onPaneMenu(menu, source);
	}

	getViewType(): string {
		return VIEW_TYPE_MINDMAP;
	}

	getDisplayText(): string {
		const base = this.currentFile ? this.currentFile.basename : "Mind Map";
		return this.isPinned ? `${base} (pinned)` : base;
	}

	getState(): Record<string, unknown> {
		// `file` and `pinned` are what history and a restored workspace reload
		// the map from (see `mindmap-state.ts`).
		return Object.assign(super.getState(), writeMapState(this.currentFile?.path ?? null, this.isPinned, this.isReadingMode));
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		const saved = readMapState(state);
		// The 3D graph's own state (depth, backlinks, follow), handed over by its 2D/3D toggle and handed back by ours. Not kept in getState.
		if (typeof state?.graph3d === "object" && state.graph3d !== null) this.graph3dState = state.graph3d as Record<string, unknown>;
		if (saved.readingMode !== null) {
			this.setReadingMode(saved.readingMode);
		}
		if (saved.file !== null) {
			const file = this.app.vault.getFileByPath(saved.file);
			if (file instanceof TFile) {
				// Callers that name a file mean "show this one" — pin unless the
				// state says otherwise, so the map stays on it.
				this.isPinned = saved.pinned;
				const switching = file !== this.currentFile;
				// Record the map we're leaving, so Back returns to it. A link jump
				// within the same note is recorded too: Back undoes the jump.
				if (switching || state.linkJump === true) result.history = true;
				await this.loadFile(file);
				// The old viewport means nothing on another note's map; history
				// and link targets re-place it through setEphemeralState.
				if (switching) this.fitToView();
				// The 3D graph's 2D/3D toggle names the line it had focused, and its zoom. Not kept in getState.
				const landing = readLanding(state.landing);
				if (landing !== null) await this.land(landing);
				(this.leaf as unknown as { updateHeader(): void }).updateHeader();
			}
		}
		await super.setState(state, result);
	}

	/**
	 * The 2D/3D toggle (the header's pill, and its command): show this note as a 3D graph in this leaf,
	 * lifting off from the map as it is drawn now (see `graph3d/liftoff.ts`).
	 * A peek or study session ends first, flushing its ratings. The note's undo
	 * history is held across the swap. Its embedded notes' are not: nothing
	 * holds them now, and an entry is dropped only when the last holder of one
	 * of its files lets go, so holding them for the swap could only drop them.
	 */
	async switchTo3D(): Promise<void> {
		const file = this.currentFile;
		const tree = this.currentTree;
		const layout = this.currentLayout;
		if (!file || !tree || !layout) return;
		if (this.spatialMode !== "off") this.exitSpatialMode();
		const fileOf = edit.buildContainingFileMap(tree.root, file.path);
		const dx = this.getOffsetX();
		const dy = this.getOffsetY();
		const boxOf = (node: LayoutNode): MapBox => ({
			path: fileOf.get(node.source.id) ?? file.path,
			start: node.source.range.start,
			root: node.source.type === "root",
			x: node.rect.x + dx,
			y: node.rect.y + dy,
			width: node.rect.width,
			height: node.rect.height,
		});
		const selected = this.selectedNodeId ? this.nodeMap.get(this.selectedNodeId) : undefined;
		const focus = selected ? boxOf(selected) : null;
		const liftOff: LiftOff = {
			boxes: layout.nodes.map(boxOf),
			viewport: { ...this.viewBox },
			focus: focus && { path: focus.path, start: focus.start, root: focus.root },
		};
		const state = { ...this.graph3dState, focus: file.path, liftOff, map: writeMapState(file.path, this.isPinned, this.isReadingMode) };
		await this.plugin.swapLeafView(this.leaf, "3d", state, [file.path]);
	}

	/**
	 * Land a hand-over from the 3D graph's toggle: select the line it had
	 * focused (expanding what hides it) and centre on it, at the zoom that
	 * draws a line as tall as its plate was on screen. With no line, the zoom
	 * still carries and the map centres on its root.
	 */
	private async land({ focus, platePx }: Landing): Promise<void> {
		if (!this.currentTree || !this.currentFile) return;
		const chain = landingChain(this.currentTree.root, this.currentFile.path, focus);
		let expanded = false;
		for (const ancestor of chain.slice(0, -1)) {
			expanded = this.collapsedIds.delete(ancestor.id) || expanded;
		}
		if (expanded) await this.render();

		const rect = this.contentEl.getBoundingClientRect();
		const zoomed = platePx !== null && this.currentLayout !== null && rect.width > 0 && rect.height > 0;
		if (zoomed && this.currentLayout) {
			const lines = this.currentLayout.nodes.filter((n) => n.source.type !== "root").map((n) => n.rect);
			this.zoom = landingZoom(platePx, lines, MIN_ZOOM, MAX_ZOOM);
			this.viewBox.w = rect.width / this.zoom;
			this.viewBox.h = rect.height / this.zoom;
		}
		const target = chain[chain.length - 1];
		const layoutNode = target ? this.nodeMap.get(target.id) : undefined;
		if (target && layoutNode) {
			this.selectNode(target.id);
			this.centerOnNode(layoutNode);
		} else if (zoomed) {
			this.centerOnRoot();
		}
	}

	getEphemeralState(): Record<string, unknown> {
		const state = super.getEphemeralState();
		state.viewport = { ...this.viewBox, zoom: this.zoom };
		return state;
	}

	setEphemeralState(state: unknown): void {
		super.setEphemeralState(state);
		if (!state || typeof state !== "object") return;
		const { subpath, viewport } = state as { subpath?: unknown; viewport?: unknown };
		if (typeof subpath === "string" && subpath) {
			void this.revealSubpath(subpath);
		} else if (isViewport(viewport)) {
			this.stopInertia();
			const { zoom, ...viewBox } = viewport;
			this.viewBox = viewBox;
			this.zoom = zoom;
			this.updateViewBox();
		}
	}

	/**
	 * Center on and select the node a `#heading` or `#^block` subpath names in
	 * the open note, expanding any collapsed ancestors so it is drawn.
	 */
	private async revealSubpath(subpath: string): Promise<void> {
		if (!this.currentFile || !this.currentTree) return;
		const cache = this.app.metadataCache.getFileCache(this.currentFile);
		const target = cache ? resolveSubpath(cache, subpath) : null;
		const path = target ? nodePathAt(this.currentTree.root, target.start.offset) : [];
		const node = path[path.length - 1];
		if (!node) {
			new Notice(`Couldn't find "${subpath}" in ${this.currentFile.basename}`);
			return;
		}

		let expanded = false;
		for (const ancestor of path.slice(0, -1)) {
			expanded = this.collapsedIds.delete(ancestor.id) || expanded;
		}
		if (expanded) await this.render();

		const layoutNode = this.nodeMap.get(node.id);
		if (!layoutNode) return;
		this.selectNode(node.id);
		this.centerOnNode(layoutNode);
	}

	private togglePin(): void {
		this.isPinned = !this.isPinned;
		if (!this.isPinned) {
			// Sync to the currently active file
			const activeLeaf = this.app.workspace.getMostRecentLeaf();
			if (activeLeaf?.view instanceof MarkdownView && activeLeaf.view.file) {
				void this.loadFile(activeLeaf.view.file);
			}
		}
		// updateHeader() refreshes the tab title; not in public typings
		(this.leaf as unknown as { updateHeader(): void }).updateHeader();
	}

	// ── Reading Mode ────────────────────────────────────────

	/** Toggle between reading (explore/study only) and editing mode. */
	toggleReadingMode(): void {
		this.setReadingMode(!this.isReadingMode);
	}

	setReadingMode(reading: boolean): void {
		if (this.isReadingMode === reading) return;
		if (reading) {
			// Finish in-flight mutations before locking the surface
			if (this.editingNodeId) this.stopEditing(true);
			this.resizingNodeId = null;
			this.cleanupAllInteractions();
		}
		this.isReadingMode = reading;
		if (reading) this.cancelLinkPick();
		this.contentEl.toggleClass("osmosis-reading-mode", reading);
		this.updateReadingAction();
		this.updateToolbarState();
		syncNavbar(this.app);
		// Replace is off in reading mode.
		this.findBar?.refresh();
		this.app.workspace.requestSaveLayout();
	}

	/** For `syncNavbar`: edit mode (reading mode being off) is the only mode that hides the navigation bar. */
	navbarEditMode(): boolean {
		return !this.isReadingMode;
	}

	/** Header action shows the mode you'd switch to (markdown-view convention). */
	private updateReadingAction(): void {
		if (!this.readingActionEl) return;
		const { icon, label } = readingToggle(this.isReadingMode);
		setIcon(this.readingActionEl, icon);
		this.readingActionEl.setAttribute("aria-label", label);
	}

	/**
	 * Gate for every map mutation. In reading mode, tells the user why
	 * nothing happened and returns false.
	 */
	private assertEditable(): boolean {
		if (!this.isReadingMode) return true;
		new Notice("Reading mode: map editing is off");
		return false;
	}

	/**
	 * The gate every *structural* mutation goes through: the reading-mode check
	 * above, plus settling any re-sync deferred by {@link markTreeStale}.
	 *
	 * These edits splice the file by the byte ranges held on the tree, so they
	 * are exactly the callers that cannot run against offsets a schedule flush
	 * has moved. Doing it here rather than inside the write helpers is
	 * deliberate: by the time a helper is called the new content has already been
	 * computed from the stale ranges, and re-syncing then would be too late.
	 */
	private async assertEditableFresh(): Promise<boolean> {
		if (!this.assertEditable()) return false;
		this.perf?.editStarted();
		await this.ensureTreeFresh();
		return true;
	}

	/**
	 * {@link assertEditableFresh} for a caller that already holds the node it is
	 * about to edit — a context-menu item, a toolbar button, a keyboard action.
	 * Returns the node's place in the layout the guard leaves behind, or null
	 * when the edit must not go ahead.
	 *
	 * Re-resolving is the point. Settling a deferred re-sync re-parses the file
	 * and re-runs the layout, so a `LayoutNode` captured beforehand is an orphan
	 * of the previous pass carrying exactly the offsets the frontmatter write
	 * moved — splicing by them is the corruption this whole change exists to
	 * avoid. Node IDs derive from content, which a schedule flush does not
	 * touch, so the same node comes back under the same key; a node that does
	 * not come back is gone from the map and the edit is dropped.
	 */
	private async assertEditableNode(node: LayoutNode): Promise<LayoutNode | null> {
		if (!await this.assertEditableFresh()) return null;
		const id = node.source.id;
		return this.currentLayout?.nodes.find((n) => n.source.id === id) ?? null;
	}

	// ── Spatial Study Mode ──────────────────────────────────

	/**
	 * A fence node's body — the lines between its opening and closing backticks —
	 * or null when the content is not an ```osmosis fence.
	 */
	private static fenceBodyLines(content: string): string[] | null {
		const lines = content.split("\n");
		const openIdx = lines.findIndex((l) => /^\s*`{3,}osmosis\s*$/.test(l));
		if (openIdx < 0) return null;
		let closeIdx = -1;
		for (let i = lines.length - 1; i > openIdx; i--) {
			if (/^\s*`{3,}\s*$/.test(lines[i]!)) { closeIdx = i; break; }
		}
		return closeIdx <= openIdx ? null : lines.slice(openIdx + 1, closeIdx);
	}

	/**
	 * Where a fence's card text starts, past its header.
	 *
	 * `splitFenceHeader` is the generator's own reader, and using anything else
	 * here was a bug: the naive "consecutive `key: value` lines" skip these
	 * parsers used to do stops dead at the first *indented* line, which is what a
	 * nested schedule block is made of. A scheduled cloze or bidirectional fence
	 * — `c1:` and `r:` open one — therefore rendered its own `due:` and
	 * `stability:` fields on the node as though they were the card. Only flat
	 * schedules and unscheduled fences ever came out right, which is why it
	 * survived: a basic fence writes its schedule flat.
	 */
	private static fenceContentLines(content: string): string[] | null {
		const body = MindMapView.fenceBodyLines(content);
		if (!body) return null;
		return body.slice(splitFenceHeader(body).contentStart);
	}

	/**
	 * If `content` is an ```osmosis fence with a *** separator,
	 * return { front, back } split. Otherwise return null.
	 */
	private parseOsmosisFence(content: string): { front: string; back: string } | null {
		const contentLines = MindMapView.fenceContentLines(content);
		if (!contentLines) return null;
		// Find *** separator (with optional whitespace)
		const sepIdx = contentLines.findIndex((l) => l.trim() === "***");
		if (sepIdx < 0) return null;
		return {
			front: contentLines.slice(0, sepIdx).join("\n").trim(),
			back: contentLines.slice(sepIdx + 1).join("\n").trim(),
		};
	}

	/** Match ==term== or **term** cloze deletions. A colour emoji opening a `==` one is part of its body (`cloze-colour.ts`). */
	private static readonly CLOZE_REGEX = /==([^=]+)==|\*\*([^*]+)\*\*/g;

	/**
	 * If `content` is an ```osmosis fence with cloze deletions (no *** separator),
	 * return { front, back } with all clozes blanked in front.
	 */
	private parseOsmosisCloze(content: string): OsmosisCardContent | null {
		const contentLines = MindMapView.fenceContentLines(content);
		if (!contentLines) return null;
		const text = contentLines.join("\n").trim();
		if (!text) return null;

		const clozeMatches = [...text.matchAll(MindMapView.CLOZE_REGEX)];
		if (clozeMatches.length === 0) return null;

		const front = text.replace(MindMapView.CLOZE_REGEX, (full) =>
			colourBlank(CLOZE_BLANK, full.startsWith("==") ? parseHighlightToken(full).colour : null));
		// The `cN:` prefix groups a deletion; it is not part of the answer. The
		// generator strips it and keeps the `==`/`**` delimiters, so the two sides
		// of a card read alike, and the map has to do the same — handing the text
		// back whole printed "c1:Danube" on the node every time the fence showed
		// its own words, which is before a session and after its last rating.
		// The front never showed it, being blanked over, which is why it took a
		// node stepping through its groups to make it visible.
		const back = text.replace(MindMapView.CLOZE_REGEX, (full) => {
			if (full.startsWith("==")) return colourAnswer(full);
			return `**${full.slice(2, -2).replace(/^c\d+:/, "")}**`;
		});
		return { front, back, isCloze: true };
	}

	/** Strip osmosis-cloze inline marker (and its comment prefix) from a line. */
	private static readonly STRIP_CLOZE_COMMENT = /\s*(?:#|\/\/|\/\*|<!--|--|%)\s*osmosis-cloze\s*(?:\*\/|-->)?\s*$/;

	/**
	 * If `content` is an ```osmosis fence with code cloze markers,
	 * return { front, back } with all cloze regions blanked in front.
	 */
	private parseOsmosisCodeCloze(content: string): OsmosisCardContent | null {
		const contentLines = MindMapView.fenceContentLines(content);
		if (!contentLines) return null;
		if (!contentLines.some((l) => l.includes("osmosis-cloze"))) return null;

		const frontLines: string[] = [];
		const backLines: string[] = [];
		let inMultiCloze = false;
		let multiFirstSeen = false;

		for (const line of contentLines) {
			if (line.includes("osmosis-cloze-start")) {
				inMultiCloze = true;
				multiFirstSeen = false;
				continue;
			}
			if (line.includes("osmosis-cloze-end")) {
				inMultiCloze = false;
				continue;
			}
			if (inMultiCloze) {
				if (!multiFirstSeen) {
					const indent = line.match(/^(\s*)/)?.[1] ?? "";
					frontLines.push(`${indent}${CLOZE_BLANK}`);
					multiFirstSeen = true;
				}
				backLines.push(line);
			} else if (line.includes("osmosis-cloze")) {
				const indent = line.match(/^(\s*)/)?.[1] ?? "";
				frontLines.push(`${indent}${CLOZE_BLANK}`);
				backLines.push(line.replace(MindMapView.STRIP_CLOZE_COMMENT, ""));
			} else {
				frontLines.push(line);
				backLines.push(line);
			}
		}

		return { front: frontLines.join("\n"), back: backLines.join("\n"), isCloze: true };
	}

	/**
	 * Check if a node is an osmosis fence (occlusion, Q&A, cloze, or code cloze).
	 * Returns parsed front/back or null.
	 */
	private getOsmosisCardContent(node: OsmosisNode): OsmosisCardContent | null {
		if (node.type !== "codeblock") return null;
		return this.parseOsmosisOcclusion(node.content)
			?? this.parseOsmosisFence(node.content)
			?? this.parseOsmosisCodeCloze(node.content)
			?? this.parseOsmosisCloze(node.content);
	}

	/**
	 * If `content` is an ```osmosis fence carrying shape sets, return its prose
	 * and the diagrams to paint. Otherwise null.
	 *
	 * Occlusion was the one fence type the map could not read, so it fell
	 * through to the plain code-block path and a node showed the raw `occlude:`
	 * geometry as text. Front and back are the same prose here — what differs
	 * between the sides of an occlusion card is the masks, not the markdown.
	 */
	private parseOsmosisOcclusion(content: string): OsmosisCardContent | null {
		const body = MindMapView.fenceBodyLines(content);
		if (!body) return null;
		const { contentStart, hasOcclusion } = splitFenceHeader(body);
		if (!hasOcclusion) return null;

		const { diagrams, prose } = fenceDiagrams(body, contentStart);
		if (diagrams.length === 0) return null;
		return { front: prose, back: prose, occlusions: diagrams };
	}

	/**
	 * Render osmosis fence as a card (front + divider + back) into the given container.
	 * Used in both measurement and drawing phases for consistent sizing.
	 *
	 * An occlusion fence renders once rather than twice: its two sides differ
	 * only in whether the masks are filled, so it gets the prose, the diagrams
	 * with every group *revealed*, and no back half at all. Study covers them by
	 * repainting the masks in place — see `applySpatialHidden`. Drawing a second
	 * copy of every picture for the back would double a node's height and make
	 * the map re-request each image.
	 */
	private async renderOsmosisCardInto(
		container: Element,
		card: OsmosisCardContent,
		sourcePath: string,
		ns?: string,
	): Promise<void> {
		const createElement = (tag: keyof HTMLElementTagNameMap, cls: string): HTMLElement => {
			if (ns) {
				const el = document.createElementNS(ns, tag) as HTMLElement;
				el.setAttribute("xmlns", ns);
				el.className = cls;
				return el;
			}
			const el = createEl(tag);
			el.className = cls;
			return el;
		};

		const { front, back } = card;

		if (card.occlusions) {
			const el = createElement("div", "osmosis-contextual-front");
			container.appendChild(el);
			if (front !== "" && this.renderComponent) {
				await MarkdownRenderer.render(this.app, front, el, sourcePath, this.renderComponent);
			}
			for (const occlusion of card.occlusions) {
				renderOcclusion(this.app, el, occlusion, "all-revealed", sourcePath);
			}
			return;
		}

		const frontEl = createElement("div", "osmosis-contextual-front");
		// What each half currently shows, so a study step can swap in the card
		// being asked and swap the source text back without re-rendering markdown
		// that has not changed — see `updateNodeProse`.
		frontEl.dataset["osmosisProse"] = front;
		container.appendChild(frontEl);

		if (this.renderComponent) {
			await MarkdownRenderer.render(
				this.app,
				front,
				frontEl,
				sourcePath,
				this.renderComponent,
			);
		}

		const divider = createElement("div", "osmosis-study-divider");
		container.appendChild(divider);

		const backEl = createElement("div", "osmosis-contextual-revealed");
		backEl.dataset["osmosisProse"] = back;
		container.appendChild(backEl);

		if (this.renderComponent) {
			await MarkdownRenderer.render(
				this.app,
				back,
				backEl,
				sourcePath,
				this.renderComponent,
			);
		}
	}

	private toggleSpatialStudy(): void {
		if (this.spatialMode === "study") {
			this.exitSpatialMode();
		} else {
			this.enterSpatialStudy();
		}
	}

	private toggleSpatialPeek(): void {
		if (this.spatialMode === "peek") {
			this.exitSpatialMode();
		} else {
			this.enterSpatialPeek();
		}
	}

	/**
	 * Card key for a laid-out node: its line card's ID, or — for a node that is
	 * an ```osmosis fence — the fence's own ID. Local nodes key against the host
	 * note, transcluded nodes against their origin note, so ratings and
	 * schedules always land in the note that owns the line.
	 *
	 * The two key shapes cannot collide: a line key always contains `#^`, and a
	 * fence ID never does.
	 */
	private nodeCardKey(node: LayoutNode): string | null {
		const blockId = node.source.blockId;
		if (blockId === undefined) {
			return node.source.type === "codeblock"
				? fenceKeyFromNode(node.source.content)
				: null;
		}
		const path = node.source.isTranscluded
			? node.source.sourceFile
			: this.currentFile?.path;
		if (path === undefined) return null;
		return lineCardId(path, blockId);
	}

	/** The cards a spatial target key stands for, whichever kind of key it is. */
	private cardsForKey(key: string): string[] {
		return cardIdsForSpatialKey(this.mapCards(), key);
	}

	/**
	 * Add line-card items to a node's context menu (plan §8). Routes through
	 * the plugin's editor helpers using the node's owning file and line span,
	 * so it works for transcluded nodes (which resolve to their source note).
	 * Add when the node has no card; remove/exclude/include when it does.
	 */
	private addNodeCardMenuItems(menu: Menu, node: LayoutNode): void {
		if (node.source.type === "root" || node.source.type === "transclusion") return;
		const key = this.nodeCardKey(node);
		const card = key !== null ? this.plugin.cardStore.getCard(key) : null;

		menu.addSeparator();
		if (!card) {
			menu.addItem((item) =>
				item.setTitle("Add line card").setIcon("layers")
					.onClick(() => void this.runNodeCardAction(node, "add")),
			);
			return;
		}
		menu.addItem((item) =>
			item.setTitle("Remove line card").setIcon("layers")
				.onClick(() => void this.runNodeCardAction(node, "remove")),
		);
		if (card.disabled) {
			menu.addItem((item) =>
				item.setTitle("Include in study").setIcon("eye")
					.onClick(() => void this.runNodeCardAction(node, "enable")),
			);
		} else {
			menu.addItem((item) =>
				item.setTitle("Exclude from study").setIcon("eye-off")
					.onClick(() => void this.runNodeCardAction(node, "disable")),
			);
		}
	}

	/** Resolve the node's owning file + line span, then dispatch to the plugin. */
	private async runNodeCardAction(
		node: LayoutNode,
		action: "add" | "remove" | "disable" | "enable",
	): Promise<void> {
		// The line span below is derived from byte offsets, so the tree has to
		// agree with the file — see `ensureTreeFresh`. Not gated on reading mode:
		// card membership is a study concern, editable from either view.
		await this.ensureTreeFresh();
		const fresh = this.currentLayout?.nodes.find((n) => n.source.id === node.source.id);
		if (!fresh) return;
		const src = fresh.source;
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);
		const toLine = (offset: number): number =>
			content.slice(0, Math.max(0, Math.min(offset, content.length))).split("\n").length - 1;
		const range = {
			start: toLine(src.range.start),
			end: toLine(Math.max(src.range.start, src.range.end - 1)),
		};
		switch (action) {
			case "add":
				await this.plugin.addLineCards(file, range);
				break;
			case "remove":
				await this.plugin.removeLineCards(file, range);
				break;
			case "disable":
				await this.plugin.setLineCardsDisabled(file, range, true);
				break;
			case "enable":
				await this.plugin.setLineCardsDisabled(file, range, false);
				break;
		}
	}

	/**
	 * All cards belonging to the notes laid out on this map: the host note
	 * plus every transcluded source. Cards from all of them are studiable
	 * in place — `syncAll` keeps the store populated vault-wide, so this
	 * is a pure lookup.
	 */
	private mapCards(): Card[] {
		const notePath = this.currentFile?.path;
		if (notePath === undefined) return [];
		const paths = new Set<string>([notePath]);
		for (const node of this.nodeMap.values()) {
			if (node.source.isTranscluded && node.source.sourceFile !== undefined) {
				paths.add(node.source.sourceFile);
			}
		}
		const cards: Card[] = [];
		for (const path of paths) {
			cards.push(...this.plugin.cardStore.getCardsByNote(path));
		}
		return cards;
	}

	/** Restrict card keys to nodes actually laid out on the map. */
	private cardKeysOnMap(cardIds: ReadonlySet<string>, scopeKeys?: ReadonlySet<string> | null): Set<string> {
		const targets = new Set<string>();
		for (const node of this.nodeMap.values()) {
			const key = this.nodeCardKey(node);
			if (key === null || !cardIds.has(key)) continue;
			if (scopeKeys && !scopeKeys.has(key)) continue;
			targets.add(key);
		}
		return targets;
	}

	/**
	 * Hold a study or peek entry until the startup vault scan has filled the
	 * card store, then retry it.
	 *
	 * The store is filled by a scan of every markdown file in the vault, and a
	 * map the workspace restored is on screen long before that finishes. Both
	 * entry points ask the store whether there is anything to study, so on a
	 * cold start they asked an empty one and reported nothing due on a map full
	 * of due cards — the symptom this bug was filed for, whose workaround was to
	 * edit any note and kick an incremental sync. Everything else on the map
	 * merely *displays* what the store holds and corrects itself as it fills;
	 * only these two make a decision that cannot be taken back.
	 *
	 * @returns true when the caller must return — the entry has been deferred.
	 */
	private deferUntilCardsLoaded(start: () => void): boolean {
		if (this.plugin.isCardStoreReady) return false;
		new Notice("Osmosis is still scanning the vault — this will start in a moment.");
		const startedOn = this.currentFile;
		void this.plugin.cardStoreReady.then(() => {
			// The reader may have closed the view or moved to another map while
			// the scan ran; starting a session under them would be worse than
			// doing nothing.
			if (this.closed || this.currentFile !== startedOn) return;
			start();
		});
		return true;
	}

	/**
	 * Start a study session over the due-or-new line cards on the map,
	 * optionally scoped to one branch ("Study this branch"). The map stays
	 * fully expanded — only the target nodes are hidden.
	 */
	private enterSpatialStudy(scope?: LayoutNode): void {
		if (this.deferUntilCardsLoaded(() => { this.enterSpatialStudy(scope); })) return;
		if (this.spatialMode !== "off") this.exitSpatialMode();

		const notePath = this.currentFile?.path;
		const cards = this.mapCards();
		// One timestamp for the whole session, so the split below cannot disagree
		// with the due filter about a card sitting on the boundary.
		const now = Date.now();
		// Fence cards join line cards as study targets: a fence is a card that
		// happens to be laid out as a node, and leaving it out meant the map
		// showed its answer throughout a session that was meant to test it.
		const dueOrNew = new Set([
			...dueOrNewLineCardIds(cards, now),
			...dueOrNewFenceCardKeys(cards, now),
		]);
		const scopeKeys = scope && notePath !== undefined
			? collectSubtreeCardKeys(scope, notePath)
			: null;
		const nodeKeys = this.cardKeysOnMap(dueOrNew, scopeKeys);

		if (nodeKeys.size === 0) {
			new Notice(scope ? "No cards are due in this branch." : "No cards are due on this map.");
			return;
		}

		this.spatialMode = "study";
		this.setSpatialTargets(nodeKeys, cards, now);
		this.spatialRevealed.clear();
		this.spatialRated.clear();
		this.spatialPendingRating = null;
		this.spatialPendingNodeId = null;
		this.spatialStudyActionEl?.addClass("is-active");
		this.applySpatialState();
		new Notice("Study mode: tap a hidden node to reveal and rate it");
	}

	/**
	 * Casual recall check: hide every line-card node on the map, reveal in
	 * any order, record nothing (mirrors reading view's peek mode).
	 */
	private enterSpatialPeek(): void {
		if (this.deferUntilCardsLoaded(() => { this.enterSpatialPeek(); })) return;
		if (this.spatialMode !== "off") this.exitSpatialMode();

		const cards = this.mapCards();
		const targets = this.cardKeysOnMap(
			new Set([...allLineCardIds(cards), ...allFenceCardKeys(cards)]),
		);

		if (targets.size === 0) {
			new Notice("No cards on this map.");
			return;
		}

		this.spatialMode = "peek";
		// Peek never splits an occluded node into its groups: it reveals in any
		// order and records nothing, so there is no question being asked and
		// nothing for a target group to mean.
		this.spatialTargets = targets;
		this.spatialNodeTargets = new Map([...targets].map((key) => [key, [key]]));
		this.spatialGroupOcclusions.clear();
		this.spatialStepCards.clear();
		this.spatialRevealed.clear();
		this.spatialRated.clear();
		this.spatialPendingRating = null;
		this.spatialPendingNodeId = null;
		this.applySpatialState();
	}

	/**
	 * Expand the node keys a study session covers into the units it actually
	 * asks — one per due card — and remember what each one is about: the diagram
	 * for a shape group, the card itself for every other kind.
	 */
	private setSpatialTargets(nodeKeys: ReadonlySet<string>, cards: readonly Card[], now: number): void {
		this.spatialTargets = new Set<string>();
		this.spatialNodeTargets = new Map<string, string[]>();
		this.spatialGroupOcclusions = new Map<string, CardOcclusion>();
		this.spatialStepCards = new Map<string, Card>();

		for (const nodeKey of nodeKeys) {
			const keys = spatialStudyKeys(cards, nodeKey, now);
			this.spatialNodeTargets.set(nodeKey, keys);
			for (const key of keys) this.spatialTargets.add(key);
		}
		for (const card of cards) {
			if (!this.spatialTargets.has(card.id)) continue;
			if (card.occlusion) this.spatialGroupOcclusions.set(card.id, card.occlusion);
			else this.spatialStepCards.set(card.id, card);
		}
	}

	/** End peek/study (toggle off, Stop, completion, file switch). The map stays open. */
	private exitSpatialMode(): void {
		const wasStudy = this.spatialMode === "study";
		this.spatialMode = "off";
		this.spatialStudyActionEl?.removeClass("is-active");

		if (this.svg) {
			for (const group of Array.from(this.svg.querySelectorAll(".osmosis-spatial-hidden"))) {
				group.classList.remove("osmosis-spatial-hidden");
				group.querySelector(".osmosis-spatial-placeholder")?.remove();
			}
			for (const group of Array.from(this.svg.querySelectorAll(".osmosis-spatial-revealed"))) {
				group.classList.remove("osmosis-spatial-revealed");
			}
			this.svg.querySelector(".osmosis-spatial-rating-fo")?.remove();
			// Neither a fence node nor an occluded line ever carried the hidden
			// class — masks and a hidden back half are how they hide — so both
			// need putting back explicitly. A null step also puts a stepping
			// fence's own text back, in place of the last question it was asked.
			for (const nodeId of this.nodeMap.keys()) {
				const group = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
				if (group) this.applyFenceHidden(group, nodeId, false, null, null);
			}
			removeMaskOverlays(this.svg);
		}
		this.spatialBanner?.remove();
		this.spatialBanner = null;
		this.spatialTargets.clear();
		this.spatialNodeTargets.clear();
		this.spatialGroupOcclusions.clear();
		this.spatialStepCards.clear();
		this.spatialRevealed.clear();
		this.spatialRated.clear();
		this.spatialPendingRating = null;
		this.spatialPendingNodeId = null;

		// Study session end: push debounced schedule writes and buffered
		// review-log entries out now (plan §3). Peek records nothing, so there
		// is nothing to flush.
		if (wasStudy) {
			// The flush is the last thing that will move the file's offsets, so
			// it is also where the re-syncs deferred all session get settled —
			// after it lands, not before, or the writes it is about to make would
			// leave the tree stale again. One re-parse for the whole session.
			void this.plugin.scheduleStore.flush().then(
				() => this.ensureTreeFresh(),
				(error: unknown) => {
					console.error("Osmosis: schedule flush at study-session end failed", error);
				},
			);
			void this.plugin.reviewLog.flush();
		}
	}

	/**
	 * (Re-)apply peek/study state to the rendered DOM. Idempotent — called
	 * on entry and after every render pass (viewport culling, full
	 * re-render), so hidden placeholders and a mid-rating bubble survive
	 * re-renders.
	 */
	private applySpatialState(): void {
		if (this.spatialMode === "off") return;
		// Study rewrites node groups in place; none drawn so far may be kept.
		this.drawRecords = new WeakMap();
		// Built once per pass, not once per node. `mapCards()` walks every node
		// to collect source paths and then allocates a fresh array per source
		// file plus one for the result — and this pass runs per animation frame
		// during a pan, over ~150 nodes. Rebuilding it per node measured ~12,000
		// rebuilds in 12 s of study on a 150-node map: cheap in CPU (5.6 % of
		// wall clock) but a firehose of short-lived allocation for no gain.
		const cards = this.mapCards();
		for (const [nodeId, node] of this.nodeMap) {
			const nodeKey = this.nodeCardKey(node);
			const keys = nodeKey === null ? undefined : this.spatialNodeTargets.get(nodeKey);
			if (!keys || keys.length === 0) continue;

			const { asking, answered } = this.spatialNodeStep(keys);
			// Only a split node singles a group out; an ordinary one covers or
			// uncovers itself whole.
			const occlusion = asking === null ? null : this.spatialGroupOcclusions.get(asking) ?? null;
			// The card on screen while it is being asked. Null once the node has
			// answered them all, and the node goes back to its own text.
			const step = asking === null ? null : this.spatialStepCards.get(asking) ?? null;

			// Looked up once and passed down, matching `applyFenceHidden`'s shape.
			// `applySpatialHidden` used to repeat this same whole-SVG attribute
			// scan for the node it had just been handed, so every target node cost
			// two walks of the tree — per animation frame, for the whole of a pan.
			const group = this.svg?.querySelector(`[data-node-id="${nodeId}"]`);
			if (group) this.applySpatialHidden(group, nodeId, !answered, occlusion, step, cards);

			// Toggled, not just added: rating one group resets the node to ask the
			// next, and a node that kept the revealed class would stay lit up while
			// its next question was on screen.
			group?.classList.toggle("osmosis-spatial-revealed", answered);

			if (this.spatialMode === "study" && asking !== null && asking === this.spatialPendingRating) {
				// Duplicate embeds share a card key — the bubble anchors to
				// the clicked node, or the first survivor after a reload
				if (this.spatialPendingNodeId === null || !this.nodeMap.has(this.spatialPendingNodeId)) {
					this.spatialPendingNodeId = nodeId;
				}
				if (nodeId === this.spatialPendingNodeId) {
					this.ensureRatingBubble(nodeId, node);
				}
			}
		}
		if (this.spatialMode === "study") this.ensureSpatialBanner();
	}

	/**
	 * Which of a node's targets is on screen, and whether its answer is up.
	 *
	 * A node with one target is the old two-state affair: hidden until revealed,
	 * revealed thereafter. A split occluded node walks its groups in order —
	 * ask, reveal, rate, then on to the next — and is only finished, `asking`
	 * null, once its last group has been rated. Peek never rates, so its single
	 * target simply stops at "revealed", which is all peek has ever meant.
	 */
	private spatialNodeStep(keys: readonly string[]): { asking: string | null; answered: boolean } {
		for (const key of keys) {
			if (!this.spatialRevealed.has(key)) return { asking: key, answered: false };
			if (!this.spatialRated.has(key)) return { asking: key, answered: true };
		}
		return { asking: null, answered: true };
	}

	/**
	 * Paint one target node. `occlusion` is the diagram being asked when the node
	 * is stepping through its shape groups, and `step` the card being asked when
	 * it is stepping through anything else; both are null when the node hides or
	 * reveals as a whole.
	 */
	private applySpatialHidden(
		group: Element,
		nodeId: string,
		hidden: boolean,
		occlusion: CardOcclusion | null,
		step: Card | null,
		cards: readonly Card[],
	): void {
		// A fence node is never blanked. Its front is the question — prose, a
		// cloze with its blanks, a masked diagram — and hiding the whole node
		// would take the question away with the answer, leaving a "?" that asks
		// nothing. Reading view has always worked this way; the map now matches.
		if (this.applyFenceHidden(group, nodeId, hidden, occlusion, step)) return;

		// An occluded line hides its masked regions rather than its whole self:
		// blanking the node behind a "?" would ask the reader to recall the
		// diagram, when the card asks about the labels on it. In study one group
		// is asked at a time; peek covers the lot, having no question to put.
		const masks = occlusion ?? (hidden ? this.nodeOcclusion(nodeId, cards) : null);
		if (masks) {
			const img = group.querySelector("img");
			if (img instanceof HTMLImageElement) {
				group.classList.remove("osmosis-spatial-hidden");
				group.querySelector(".osmosis-spatial-placeholder")?.remove();
				overlayMasks(img, masks, occlusion ? (hidden ? "front" : "back") : "all-hidden");
				return;
			}
			// No image rendered (missing file, or the node is still rendering) —
			// fall through and hide it the ordinary way, so it is never a card the
			// user can see the answer to.
		}
		removeMaskOverlays(group);

		if (hidden) {
			group.classList.add("osmosis-spatial-hidden");
			// Add "?" placeholder text
			const existing = group.querySelector(".osmosis-spatial-placeholder");
			if (!existing) {
				const node = this.nodeMap.get(nodeId);
				if (node) {
					const placeholder = document.createElementNS(SVG_NS, "text");
					placeholder.classList.add("osmosis-spatial-placeholder");
					placeholder.setAttribute("x", String(node.rect.x + node.rect.width / 2 + this.getOffsetX()));
					placeholder.setAttribute("y", String(node.rect.y + node.rect.height / 2 + this.getOffsetY()));
					placeholder.textContent = "?";
					group.appendChild(placeholder);
				}
			}
		} else {
			group.classList.remove("osmosis-spatial-hidden");
			const placeholder = group.querySelector(".osmosis-spatial-placeholder");
			placeholder?.remove();
		}
	}

	/**
	 * Hide or reveal a fence node's *answer*, leaving its question on screen.
	 * Returns false when the node is not a fence, so the caller falls back to
	 * blanking it.
	 *
	 * The kinds of fence hide differently. An occluded one is rendered once and
	 * its masks repainted — covered while the node is hidden, outlined once
	 * revealed — so the picture never reloads and the node never changes size.
	 * Every other kind has a real back half in the DOM, which is simply hidden;
	 * a cloze fence additionally drops its *front* on reveal, since the answer is
	 * the same passage filled in.
	 *
	 * The node keeps the height it was laid out at either way. Re-measuring on
	 * every reveal would reflow the whole map under the reader's cursor, and a
	 * node that grows when tapped is worse than one with a little space in it.
	 *
	 * `target` is the diagram being asked while a node steps through its shape
	 * groups, and null when the node hides or reveals as a whole. `step` is the
	 * same thing for every other kind of fence — the card being asked — and swaps
	 * the node's two halves for that card's own front and back.
	 */
	private applyFenceHidden(
		group: Element,
		nodeId: string,
		hidden: boolean,
		target: CardOcclusion | null,
		step: Card | null,
	): boolean {
		const node = this.nodeMap.get(nodeId);
		const card = node ? this.getOsmosisCardContent(node.source) : null;
		if (!card) return false;

		group.classList.remove("osmosis-spatial-hidden");
		group.querySelector(".osmosis-spatial-placeholder")?.remove();

		if (card.occlusions) {
			// Matched on the embed target the renderer wrote to `alt`, so a fence
			// holding several diagrams repaints each with its own shape set.
			const byImage = new Map(card.occlusions.map((o) => [o.image, o]));
			for (const img of Array.from(group.querySelectorAll("img"))) {
				const occlusion = byImage.get(img.getAttribute("alt") ?? "");
				if (!occlusion) continue;
				if (target === null) {
					overlayMasks(img, occlusion, hidden ? "all-hidden" : "all-revealed");
				} else if (occlusion.image === target.image) {
					overlayMasks(img, target, hidden ? "front" : "back");
				} else {
					// A second diagram in the same fence belongs to a different card,
					// so it is shown unmasked — covering it would pose a question this
					// card never answers. Sequential has always read this way.
					overlayMasks(img, occlusion, "none");
				}
			}
			return true;
		}

		// A fence that fanned out asks a different question per step, so while one
		// is on screen the node shows *that card's* front and back — the same
		// generator-rendered strings sequential and the note put up — rather than
		// the passage every card came from. Otherwise a three-group cloze node
		// would put the identical all-blanked passage three times and take three
		// ratings on it, and a bidirectional node would never ask its reverse.
		//
		// A null step puts the fence's own text back: the node has answered
		// everything it was asked, or the session is over.
		this.updateNodeProse(group.querySelector(".osmosis-contextual-front"), step?.front ?? card.front);
		this.updateNodeProse(group.querySelector(".osmosis-contextual-revealed"), step?.back ?? card.back);

		// A cloze card's two halves are one passage, blanked and filled in, so its
		// answer *replaces* the question — the reader's eye stays on one body of
		// text, and a node does not carry the same lines twice. A basic or
		// bidirectional fence keeps both halves, because there its front is a
		// question the answer does not contain. Note view has read this way since
		// phase 3; the map used to stack every kind, which made a cloze node as
		// tall as its passage twice over.
		//
		// Gated on being *in* a session, exactly as Note view gates on `hiding`:
		// `exitSpatialMode` restores every node through this method with
		// `hidden: false` after clearing the mode, and a collapse that outlived the
		// session would leave the fence showing its answer and nothing else.
		const collapse = card.isCloze === true && !hidden && this.spatialMode !== "off";
		const setHidden = (selector: string, hide: boolean): void => {
			for (const el of Array.from(group.querySelectorAll(selector))) {
				el.classList.toggle("osmosis-hidden", hide);
			}
		};
		setHidden(".osmosis-contextual-front", collapse);
		setHidden(".osmosis-contextual-revealed", hidden);
		setHidden(".osmosis-study-divider", hidden || collapse);
		return true;
	}

	/**
	 * Put `markdown` on screen in one half of a fence node, skipping the work when
	 * it is already what the element shows.
	 *
	 * The guard is what keeps this affordable: `applySpatialState` re-applies to
	 * every target node on every render pass, and without it each pass would blank
	 * a node the reader is looking at and paint it again a frame later. The
	 * attribute is seeded by `renderOsmosisCardInto`, so a node that never steps
	 * away from its source text is never re-rendered at all.
	 *
	 * The node keeps the size it was laid out at, as everything else here does —
	 * see `applyFenceHidden`. A step's front is at most as long as the fence's
	 * full text, which the node was already measured to hold, so the swap fits;
	 * a long answer revealed under a long question can still clip, and clipping is
	 * the price of not reflowing the map under the reader's cursor mid-session.
	 */
	private updateNodeProse(el: Element | null, markdown: string): void {
		if (!(el instanceof HTMLElement)) return;
		if (el.dataset["osmosisProse"] === markdown) return;
		el.dataset["osmosisProse"] = markdown;
		el.empty();
		if (this.renderComponent) {
			void MarkdownRenderer.render(
				this.app,
				markdown,
				el,
				this.currentFile?.path ?? "",
				this.renderComponent,
			);
		}
	}

	/**
	 * The occluded diagram on a node's line, or null when it carries no masks.
	 *
	 * Resolved through the *line key*, never `getCard` — an occluded line's cards
	 * are `…/c1`, `…/c2`, so the key is nobody's card ID. **The block ID is the
	 * signal, never `cardType`**: an occluded line card is typed `"occlusion"`
	 * while still living on its line.
	 */
	private nodeOcclusion(nodeId: string, cards: readonly Card[]): CardOcclusion | null {
		const node = this.nodeMap.get(nodeId);
		const key = node ? this.nodeCardKey(node) : null;
		return key === null ? null : occlusionForLineKey(cards, key);
	}

	/**
	 * Tap on a node during peek/study. Returns true when the tap was
	 * consumed. Only hidden targets react. Peek: reveal in any order,
	 * nothing recorded. Study: reveal opens the rating bubble, which must
	 * be answered before the next reveal.
	 */
	private handleSpatialClick(nodeId: string): boolean {
		if (this.spatialMode === "off") return false;
		const node = this.nodeMap.get(nodeId);
		const nodeKey = node ? this.nodeCardKey(node) : null;
		const keys = nodeKey === null ? undefined : this.spatialNodeTargets.get(nodeKey);
		if (!node || !keys) return false;
		// The next group the node has to ask — undefined once it has asked them all.
		const key = keys.find((k) => !this.spatialRevealed.has(k));
		if (key === undefined) return false;

		// Study: one rating at a time — the open bubble must be answered first
		if (this.spatialMode === "study" && this.spatialPendingRating !== null) return true;

		this.spatialRevealed.add(key);
		if (this.spatialMode === "study") {
			this.spatialPendingRating = key;
			this.spatialPendingNodeId = nodeId;
			this.spatialPendingRatingAt = Date.now();
			// Keys 1–4 rate via the container's keydown handler
			this.contentEl.focus();
		}
		// Re-apply instead of touching only the clicked node: a note
		// transcluded twice shares one card key across two nodes, and both
		// must reveal together (once the answer is visible anywhere, keeping
		// the twin hidden would be a fake test). Also creates the bubble.
		this.applySpatialState();
		return true;
	}

	/** Rating bubble (Again/Hard/Good/Easy) anchored below the node. */
	private ensureRatingBubble(nodeId: string, node: LayoutNode): void {
		if (!this.svg) return;
		const group = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
		if (!group || group.querySelector(".osmosis-spatial-rating-fo")) return;

		// Wide enough for the four buttons even under narrow nodes
		const width = Math.max(node.rect.width, 240);
		const fo = document.createElementNS(SVG_NS, "foreignObject");
		fo.classList.add("osmosis-spatial-rating-fo");
		fo.setAttribute("x", String(node.rect.x + this.getOffsetX() + (node.rect.width - width) / 2));
		fo.setAttribute("y", String(node.rect.y + node.rect.height + this.getOffsetY() + 6));
		fo.setAttribute("width", String(width));
		fo.setAttribute("height", "40");

		const bubble = document.createElementNS(XHTML_NS, "div") as HTMLDivElement;
		bubble.setAttribute("xmlns", XHTML_NS);
		bubble.className = "osmosis-spatial-rating osmosis-contextual-rating";

		const ratings: Array<{ label: string; rating: FSRSRating; cls: string }> = [
			{ label: "Again", rating: 1, cls: "osmosis-rate-again" },
			{ label: "Hard", rating: 2, cls: "osmosis-rate-hard" },
			{ label: "Good", rating: 3, cls: "osmosis-rate-good" },
			{ label: "Easy", rating: 4, cls: "osmosis-rate-easy" },
		];
		for (const { label, rating, cls } of ratings) {
			const btn = document.createElementNS(XHTML_NS, "button") as HTMLButtonElement;
			btn.setAttribute("xmlns", XHTML_NS);
			btn.textContent = label;
			btn.className = cls;
			btn.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.rateSpatialCard(rating);
			});
			bubble.appendChild(btn);
		}
		fo.appendChild(bubble);
		group.appendChild(fo);

		// SVG paints in document order — re-append the group so the bubble
		// (and its node) draw above later-drawn siblings that overlap it
		group.parentNode?.appendChild(group);
	}

	/** Rate the pending card: record via FSRS, advance progress, maybe finish. */
	private async rateSpatialCard(rating: FSRSRating): Promise<void> {
		const cardId = this.spatialPendingRating;
		if (this.spatialMode !== "study" || cardId === null) return;
		const elapsedMs = Date.now() - this.spatialPendingRatingAt;
		this.spatialPendingRating = null;
		this.spatialPendingNodeId = null;
		this.spatialRated.add(cardId);
		this.svg?.querySelector(".osmosis-spatial-rating-fo")?.remove();

		// The key is either a *node* — a line or a fence, which can carry several
		// cards a single rating must reach, one per cloze — or one shape group of
		// an occluded node, which is a card of its own. Each card's own notePath
		// routes its schedule write, to the source note for transcluded lines
		// (plan §11).
		const cardIds = this.cardsForKey(cardId);
		if (cardIds.length > 0) {
			this.spatialSessionManager ??= this.plugin.createSessionManager("spatial");
			for (const id of cardIds) {
				await this.spatialSessionManager.recordReview(id, rating, { elapsedMs });
			}
			this.plugin.refreshDashboard();
		}

		if (this.spatialRated.size >= this.spatialTargets.size) {
			const total = this.spatialTargets.size;
			this.exitSpatialMode(); // flushes schedule writes; map stays open
			new Notice(`Spatial study complete — ${String(total)} ${total === 1 ? "card" : "cards"} reviewed.`);
		} else {
			// Re-apply rather than only redrawing the banner: an occluded node that
			// has more groups left must reset to ask the next one, which is the
			// whole point of stepping through them.
			this.applySpatialState();
		}
	}

	/** Floating "x/N due reviewed" pill + Stop. Recreated after re-renders. */
	private ensureSpatialBanner(): void {
		if (this.spatialMode !== "study") return;
		let banner = this.spatialBanner;
		if (!banner || !banner.isConnected) {
			banner = this.contentEl.createDiv({ cls: "osmosis-reveal-banner osmosis-spatial-banner" });
			// Keep pill interactions away from the map's pan/select handlers
			banner.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
			banner.addEventListener("click", (e) => { e.stopPropagation(); });
			this.spatialBanner = banner;
		}
		banner.empty();
		banner.createSpan({
			cls: "osmosis-reveal-progress",
			text: `${String(this.spatialRated.size)}/${String(this.spatialTargets.size)} due reviewed`,
		});
		const stopBtn = banner.createEl("button", { text: "Stop", cls: "osmosis-reveal-btn" });
		stopBtn.addEventListener("click", () => {
			this.exitSpatialMode();
		});
	}


	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("osmosis-mindmap-container");
		container.setAttribute("tabindex", "0");

		// All interaction handlers on the container (HTMLElement)
		this.registerDomEvent(container, "keydown", (e: KeyboardEvent) => {
			this.handleKeyDown(e);
		});
		this.registerDomEvent(container, "pointerdown", this.handlePointerDown);
		this.registerDomEvent(container, "pointermove", this.handlePointerMove);
		this.registerDomEvent(container, "pointerup", this.handlePointerUp);
		this.registerDomEvent(
			container,
			"pointercancel",
			this.handlePointerCancel,
		);
		this.registerDomEvent(
			container,
			"pointerleave",
			this.handlePointerLeave,
		);
		this.registerDomEvent(container, "wheel", this.handleWheel, {
			passive: false,
		});
		this.registerDomEvent(container, "click", this.handleClick);
		this.registerDomEvent(container, "dblclick", this.handleDblClick);
		this.registerDomEvent(container, "contextmenu", this.handleContextMenu);

		// Block touch events from reaching Obsidian's gesture handlers (drawer swipes,
		// command palette pull-down). Pointer events and touch events are separate
		// streams — stopPropagation on pointer events does not affect touch events.
		this.registerDomEvent(
			container,
			"touchstart",
			this.handleTouchCapture,
			{ passive: false },
		);
		this.registerDomEvent(container, "touchmove", this.handleTouchCapture, {
			passive: false,
		});
		this.registerDomEvent(
			container,
			"touchend",
			this.handleTouchCapture as EventListener,
		);

		// Respond to container resize (e.g. mobile keyboard opening) by updating viewBox
		this.resizeObserver = new ResizeObserver(() =>
			this.handleContainerResize(),
		);
		this.resizeObserver.observe(container);

		// Create the tool ribbon (action bar)
		this.toolRibbon = new ToolRibbon(container, {
			fitToView: () => this.fitToView(),
			zoomIn: () => this.zoomStep(1.25),
			zoomOut: () => this.zoomStep(1 / 1.25),
			centerOnRoot: () => this.centerOnRoot(),
			foldAll: () => this.foldAll(),
			unfoldAll: () => this.unfoldAll(),
			addSibling: () => {
				const node = this.selectedNodeId
					? this.nodeMap.get(this.selectedNodeId)
					: null;
				if (node) void this.addSiblingNode(node);
			},
			addChild: () => {
				const node = this.selectedNodeId
					? this.nodeMap.get(this.selectedNodeId)
					: null;
				if (node) void this.addChildNode(node);
			},
			insertParent: () => {
				const node = this.selectedNodeId
					? this.nodeMap.get(this.selectedNodeId)
					: null;
				if (node) void this.insertParentNode(node);
			},
			moveUp: () => this.runMoveAction("siblingPrev"),
			moveDown: () => this.runMoveAction("siblingNext"),
			outdent: () => this.runMoveAction("depthShallower"),
			indent: () => this.runMoveAction("depthDeeper"),
			deleteNode: () => {
				if (this.selectedNodeIds.size > 1) {
					void this.deleteSelectedNodes();
				} else if (this.selectedNodeId) {
					const node = this.nodeMap.get(this.selectedNodeId);
					if (node) void this.deleteNode(node);
				}
			},
			addLink: () => this.toggleLinkPick(),
			copy: () => void this.copySelectedNodes(false),
			cut: () => void this.copySelectedNodes(true),
			paste: () => void this.pasteNodes(),
			copyStyle: () => this.copyNodeStyle(),
			pasteStyle: () => void this.pasteNodeStyle(),
			undo: () => this.forwardUndoRedo(false),
			redo: () => this.forwardUndoRedo(true),
			refresh: () => {
				if (this.currentFile) {
					this.nodeSizeCache.clear();
					this.nodeHtmlCache.clear();
					void this.loadFile(this.currentFile);
				}
			},
			openNodeMenu: (btn) => {
				const rect = btn.getBoundingClientRect();
				this.showNodeMenu(this.selectedNodeId, (menu) =>
					menu.showAtPosition({ x: rect.left, y: rect.top }),
				);
			},
		});
		// Phones: Obsidian's navigation bar is hidden in edit mode, where the bar takes its slot.
		syncNavbar(this.app);
		this.findBar = new FindBar(container, this.findHost());
		this.perf = new MindMapPerf(container, this.cache, () => ({
			total: this.currentLayout?.nodes.length ?? 0,
			drawn: this.renderedNodeIds.size,
			dom: this.nodesGroup?.querySelectorAll(".osmosis-node-group").length ?? 0,
		}));

		// The header's buttons are shared with the 3D graph (`view-header.ts`); `arrangeViewHeader` puts them in order below; Style, Pin and Peek are in the ⋯ menu (`onPaneMenu`).
		// Reading/editing mode toggle (icon shows the mode you'd switch to)
		this.readingActionEl = this.addAction("book-open", "Current view: editing\nClick to read", () => {
			this.toggleReadingMode();
		});

		// Note view action — switch back to markdown editor
		const noteViewActionEl = this.addAction("file-text", "Note view", () => {
			if (this.currentFile) {
				void this.leaf.setViewState({
					type: "markdown",
					state: { file: this.currentFile.path },
					active: true,
				});
			}
		});

		// Spatial study mode toggle
		this.spatialStudyActionEl = this.addAction("graduation-cap", "Study mode", () => {
			this.toggleSpatialStudy();
		});

		arrangeViewHeader(this, "2d", {
			"note-view": noteViewActionEl,
			reading: this.readingActionEl,
			study: this.spatialStudyActionEl,
		}, () => void this.switchTo3D());

		// Apply the global default mode; persisted per-leaf state (setState)
		// arrives afterwards and overrides it.
		this.setReadingMode(
			resolveDefaultReadingMode(
				this.plugin.settings.mindMapDefaultMode,
				Platform.isMobile,
			),
		);

		await this.loadActiveFile();

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (this.isPinned) return;
				if (leaf?.view instanceof MarkdownView) {
					void this.loadFile(leaf.view.file);
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile)) return;
				if (file === this.currentFile) {
					if (this.edits.recorder.live) {
						// A live-edit session (color-picker drag) drives rendering
						// directly via applyMapSettings/render; ignore our own writes
						// so a stray reload can't tear down the open picker mid-drag.
						// suppressNextReload is a single boolean and can't cover the
						// burst of writes a drag produces, so gate on the session.
						this.suppressNextReload = false;
						return;
					}
					if (this.edits.recorder.grouping) {
						// Same reasoning as a live edit: a grouped gesture can
						// write this file more than once (content splice, then
						// the frontmatter that carries card identity across),
						// and one boolean can't cover both.
						this.suppressNextReload = false;
						return;
					}
					if (this.suppressNextReload) {
						this.suppressNextReload = false;
						return;
					}
					// Our own schedule flush only touches frontmatter, which the
					// map doesn't render — so neither reload nor re-sync now.
					// The frontmatter it grows does shift every body offset, and
					// the tree's ranges are what structural edits splice with, so
					// the debt is recorded and paid by `ensureTreeFresh` before
					// the next edit reads those offsets.
					if (this.plugin.scheduleStore.isWriting(file.path)) {
						this.markTreeStale(file.path);
						return;
					}
					void this.loadFile(file);
					return;
				}

				// A note this map transcludes changed underneath it. Nothing
				// re-parses it otherwise, so its nodes keep the offsets they had
				// before the write — and the next edit that splices by those
				// offsets writes into the wrong bytes. A debounced schedule flush
				// is the common case: it renders identically and still moves every
				// line in the file.
				if (this.edits.recorder.live || this.edits.recorder.grouping || this.editingNodeId) return;
				if (this.suppressNextReload) {
					this.suppressNextReload = false;
					return;
				}
				if (!this.transcludedPaths().has(file.path)) return;
				// Same deferral as the host note, and the case that matters most:
				// a session's transcluded cards are spread over many notes, each
				// with its own debounce timer, so rating them used to fire an
				// uncoalesced full rebuild per note rather than one per burst.
				if (this.plugin.scheduleStore.isWriting(file.path)) {
					this.markTreeStale(file.path);
					return;
				}
				this.cache.invalidate(file.path);
				void this.resyncFromParent();
			}),
		);

		// Auto-unpin if pinned file is deleted
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.isPinned && file instanceof TFile && file === this.currentFile) {
					this.isPinned = false;
					this.currentFile = null;
					this.currentTree = null;
					this.contentEl.empty();
					(this.leaf as unknown as { updateHeader(): void }).updateHeader();
				}
			}),
		);

		// Update reference if pinned file is renamed
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.isPinned && file instanceof TFile && oldPath === this.currentFile?.path) {
					this.currentFile = file;
					(this.leaf as unknown as { updateHeader(): void }).updateHeader();
				}
			}),
		);

		// Cursor sync: editor → map
		this.registerInterval(
			window.setInterval(() => this.syncEditorCursorToMap(), 150),
		);
	}

	async onClose(): Promise<void> {
		this.closed = true;
		syncNavbar(this.app, this);
		this.releaseHistory?.();
		this.releaseHistory = null;
		this.historyKey = null;
		this.toolRibbon?.destroy();
		this.toolRibbon = null;
		this.findBar?.destroy();
		this.findBar = null;
		this.perf?.destroy();
		this.perf = null;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.renderComponent?.unload();
		this.renderComponent = null;
		this.svg = null;
		this.viewportHost = null;
		this.branchLinesGroup = null;
		this.nodesGroup = null;
		this.renderedNodeIds.clear();
		this.renderedBranchIds.clear();
		this.cancelLongPress();
		this.activePointers.clear();
		this.pinchStartDistance = null;
		this.pinchTail = null;
		this.longPressTriggered = false;
		this.stopInertia();
		if (this.cullRafId !== null) {
			cancelAnimationFrame(this.cullRafId);
			this.cullRafId = null;
		}
		// A pass already awaiting its draws checks `nodesGroup` before
		// committing, so it lands as a no-op; clearing the queue stops it
		// looping for another.
		this.cullQueued = false;

		this.spatialMode = "off";
		this.spatialTargets.clear();
		this.spatialRevealed.clear();
		this.spatialRated.clear();
		this.spatialPendingRating = null;
		this.spatialPendingNodeId = null;
		this.spatialBanner = null;
		this.spatialSessionManager = null;
		this.treeStale = false;
		this.staleParsePaths.clear();
		this.contentEl.empty();
		this.currentFile = null;
		this.currentTree = null;
		this.currentLayout = null;
		this.nodeMap.clear();
		this.selectedNodeIds.clear();
		this.cursorSyncNodeId = null;
		this.rubberBandRect?.remove();
		this.rubberBandRect = null;
		if (this.cursorSyncTimer) {
			window.clearTimeout(this.cursorSyncTimer);
			this.cursorSyncTimer = null;
		}
		this.cleanupDrag();
	}

	private async loadActiveFile(): Promise<void> {
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		if (activeLeaf?.view instanceof MarkdownView && activeLeaf.view.file) {
			await this.loadFile(activeLeaf.view.file);
		}
	}

	private async loadFile(file: TFile | null): Promise<void> {
		if (!file || file.extension !== "md") return;
		// Don't reload/re-render while inline editing is active — focus changes
		// (e.g. input on document.body) can trigger active-leaf-change which
		// would destroy the SVG mid-edit.
		if (this.editingNodeId) return;

		// A peek/study session is bound to one note — end it (and flush any
		// ratings) before the map switches to another file.
		if (this.spatialMode !== "off" && this.currentFile && file.path !== this.currentFile.path) {
			this.exitSpatialMode();
		}
		// Add link is armed on this note's nodes.
		if (this.currentFile && file.path !== this.currentFile.path) this.cancelLinkPick();

		// Clear caches and let go of the old note's undo history when switching
		// to a different file. The history is dropped unless another view holds it.
		if (file !== this.currentFile) {
			this.nodeSizeCache.clear();
			this.nodeHtmlCache.clear();
			this.releaseHistory?.();
			this.historyKey = file.path;
			this.releaseHistory = this.plugin.editHistory.hold(file.path);
		}
		this.currentFile = file;
		// A full load re-reads every file the map is built from, which is the
		// debt `markTreeStale` records — so it is paid off here by definition.
		this.treeStale = false;
		this.staleParsePaths.clear();
		const content = await this.app.vault.read(file);
		this.reloadFrontmatterFromContent(content);
		this.loadMapSettings();
		this.currentTree = this.cache.get(file.path, content);

		// Lazy loading (opt-in via the "Expand transclusions" setting):
		// auto-collapse transclusion nodes so they're deferred until first
		// expand. Default is eager — embedded branches load expanded.
		this.lazyTransclusionIds.clear();
		if (!this.plugin.settings.expandTransclusions) {
			this.collectTransclusionIds(
				this.currentTree.root,
				this.lazyTransclusionIds,
			);
			for (const id of this.lazyTransclusionIds) {
				this.collapsedIds.add(id);
			}
		}

		// Resolve and expand transclusion links (skip lazy/collapsed ones)
		await this.transclusionResolver.expandTree(
			this.currentTree,
			this.lazyTransclusionIds,
		);

		await this.render();

		// Notify listeners (e.g. properties sidebar) that the file is loaded
		for (const fn of this.fileLoadListeners) {
			fn();
		}
	}

	/** Returns the current file's path, used by the properties sidebar. */
	getCurrentFilePath(): string | null {
		return this.currentFile?.path ?? null;
	}

	/** Apply per-map settings from the properties sidebar and re-render. */
	applyMapSettings(settings: MapSettings): void {
		// Clear size cache when theme, shape, or base style changes (affects measurement).
		// Always clear when baseStyle is present since sub-objects are shared references.
		if (settings.theme !== this.mapSettings.theme ||
			settings.topicShape !== this.mapSettings.topicShape ||
			settings.maxNodeWidth !== this.mapSettings.maxNodeWidth ||
			settings.baseStyle) {
			this.nodeSizeCache.clear();
		}
		this.mapSettings = { ...settings };
		void this.render();
	}

	/** Re-measure every node and re-render, for changes outside MapSettings
	 *  (e.g. the global max node width setting). */
	remeasureAndRender(): void {
		this.nodeSizeCache.clear();
		void this.render();
	}

	/** Get info about the current node selection, used by the Format tab. */
	getSelectedNodeInfo(): { nodeIds: string[]; primaryId: string | null } {
		return {
			nodeIds: [...this.selectedNodeIds],
			primaryId: this.selectedNodeId,
		};
	}

	/** Register a callback for selection changes. */
	onSelectionChange(fn: () => void): void {
		this.selectionChangeListeners.add(fn);
	}

	/** Unregister a selection change callback. */
	offSelectionChange(fn: () => void): void {
		this.selectionChangeListeners.delete(fn);
	}

	/** Register a callback for when a file finishes loading. */
	onFileLoad(fn: () => void): void {
		this.fileLoadListeners.add(fn);
	}

	/** Unregister a file load callback. */
	offFileLoad(fn: () => void): void {
		this.fileLoadListeners.delete(fn);
	}

	/** Look up a LayoutNode by its source node ID. */
	getLayoutNodeById(id: string): LayoutNode | null {
		return this.nodeMap.get(id) ?? null;
	}

	/** A node's style inputs for the style sidebar's Node tab (`NodeStyleHost`): the map's styles, the node's Local style and its heading depth. */
	getNodeStyleContext(id: string): NodeStyleContext | null {
		const node = this.nodeMap.get(id);
		if (!node) return null;
		const fm = this.osmosisStyleFrontmatter;
		return { fm, local: lookupNodeStyle(fm, node), depth: node.source.type === "heading" ? node.source.depth : undefined };
	}

	/** Get the currently active theme definition. */
	getActiveTheme(): ThemeDefinition | undefined {
		return this.activeTheme;
	}

	/**
	 * Get the effective theme with map-level baseStyle merged into the base.
	 * This layers map overrides into the T-level so per-depth overrides still win.
	 */
	private getEffectiveTheme(): ThemeDefinition | undefined {
		const bs = this.mapSettings.baseStyle;
		if (!this.activeTheme && !bs) return undefined;
		if (!bs) return this.activeTheme;

		const effective: ThemeDefinition = {
			...(this.activeTheme ?? { name: "Default", base: {}, depths: {} }),
			base: { ...(this.activeTheme?.base ?? {}) },
		};
		mergeNodeStyle(effective.base, bs);
		return effective;
	}

	/** Get the current per-map settings. */
	getMapSettings(): MapSettings {
		return { ...this.mapSettings };
	}

	/** Get all layout nodes, keyed by source node ID. */
	getNodeMap(): ReadonlyMap<string, LayoutNode> {
		return this.nodeMap;
	}

	/** Get the parsed osmosis: frontmatter for the current file. */
	getOsmosisStyleFrontmatter(): OsmosisStyleFrontmatter | undefined {
		return this.osmosisStyleFrontmatter;
	}

	/** Update the in-memory frontmatter cache (e.g. after sidebar writes). */
	setOsmosisStyleFrontmatter(fm: OsmosisStyleFrontmatter | undefined): void {
		this.osmosisStyleFrontmatter = fm;
	}

	/** Get global style classes from plugin settings. */
	getGlobalClasses(): Record<string, NodeStyle> {
		return this.plugin?.settings?.globalClasses ?? {};
	}

	/** Get the current file (for frontmatter writes). */
	getCurrentFile(): TFile | null {
		return this.currentFile;
	}

	/**
	 * Set the active variant in frontmatter.
	 * Pass undefined or empty string to clear the active variant.
	 */
	async setActiveVariant(variantName: string | undefined): Promise<void> {
		if (!this.currentFile) return;

		this.suppressNextReload = true;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = styleMappingFor(fm);

				if (variantName) {
					osmosis["activeVariant"] = variantName;
				} else {
					delete osmosis["activeVariant"];
				}

				if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
			},
		);

		// Update cached frontmatter
		if (variantName) {
			if (!this.osmosisStyleFrontmatter) {
				this.osmosisStyleFrontmatter = { activeVariant: variantName };
			} else {
				this.osmosisStyleFrontmatter.activeVariant = variantName;
			}
		} else if (this.osmosisStyleFrontmatter) {
			delete this.osmosisStyleFrontmatter.activeVariant;
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Save a node's style into a variant definition.
	 * Creates the variant if it doesn't exist.
	 */
	async saveVariantNodeStyle(
		variantName: string,
		nodeKey: string,
		style: NodeStyle,
	): Promise<void> {
		if (!this.currentFile || !variantName || !nodeKey) return;

		this.suppressNextReload = true;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = styleMappingFor(fm);
				const variants = (osmosis["variants"] as Record<string, Record<string, NodeStyle>>) ?? {};
				osmosis["variants"] = variants;
				const variant = variants[variantName] ?? {};
				variants[variantName] = variant;

				const cleaned = { ...style };
				delete cleaned.class;
				variant[nodeKey] = cleaned;
			},
		);

		// Update cache
		if (!this.osmosisStyleFrontmatter) {
			this.osmosisStyleFrontmatter = { variants: { [variantName]: { [nodeKey]: style } } };
		} else {
			if (!this.osmosisStyleFrontmatter.variants) {
				this.osmosisStyleFrontmatter.variants = {};
			}
			if (!this.osmosisStyleFrontmatter.variants[variantName]) {
				this.osmosisStyleFrontmatter.variants[variantName] = {};
			}
			this.osmosisStyleFrontmatter.variants[variantName][nodeKey] = style;
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Create an empty variant definition and activate it.
	 */
	async createVariant(variantName: string): Promise<void> {
		if (!this.currentFile || !variantName) return;

		this.suppressNextReload = true;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = styleMappingFor(fm);
				const variants = (osmosis["variants"] as Record<string, Record<string, NodeStyle>>) ?? {};
				osmosis["variants"] = variants;
				variants[variantName] = {};
				osmosis["activeVariant"] = variantName;
			},
		);

		if (!this.osmosisStyleFrontmatter) {
			this.osmosisStyleFrontmatter = { variants: { [variantName]: {} }, activeVariant: variantName };
		} else {
			if (!this.osmosisStyleFrontmatter.variants) {
				this.osmosisStyleFrontmatter.variants = {};
			}
			this.osmosisStyleFrontmatter.variants[variantName] = {};
			this.osmosisStyleFrontmatter.activeVariant = variantName;
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Rename a variant. Updates activeVariant if it was the renamed one.
	 */
	async renameVariant(oldName: string, newName: string): Promise<void> {
		if (!this.currentFile || !oldName || !newName || oldName === newName) return;

		this.suppressNextReload = true;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = readStyleMapping(fm);
				if (!osmosis) return;
				const variants = osmosis["variants"] as Record<string, Record<string, NodeStyle>> | undefined;
				if (!variants || !variants[oldName]) return;

				variants[newName] = variants[oldName];
				delete variants[oldName];

				if (osmosis["activeVariant"] === oldName) {
					osmosis["activeVariant"] = newName;
				}
			},
		);

		if (this.osmosisStyleFrontmatter?.variants?.[oldName]) {
			this.osmosisStyleFrontmatter.variants[newName] = this.osmosisStyleFrontmatter.variants[oldName];
			delete this.osmosisStyleFrontmatter.variants[oldName];
			if (this.osmosisStyleFrontmatter.activeVariant === oldName) {
				this.osmosisStyleFrontmatter.activeVariant = newName;
			}
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Delete a variant. Clears activeVariant if it was the deleted one.
	 */
	async deleteVariant(variantName: string): Promise<void> {
		if (!this.currentFile || !variantName) return;

		this.suppressNextReload = true;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = readStyleMapping(fm);
				if (!osmosis) return;
				const variants = osmosis["variants"] as Record<string, Record<string, NodeStyle>> | undefined;
				if (!variants) return;

				delete variants[variantName];
				if (Object.keys(variants).length === 0) delete osmosis["variants"];

				if (osmosis["activeVariant"] === variantName) {
					delete osmosis["activeVariant"];
				}

				if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
			},
		);

		if (this.osmosisStyleFrontmatter) {
			if (this.osmosisStyleFrontmatter.variants) {
				delete this.osmosisStyleFrontmatter.variants[variantName];
				if (Object.keys(this.osmosisStyleFrontmatter.variants).length === 0) {
					delete this.osmosisStyleFrontmatter.variants;
				}
			}
			if (this.osmosisStyleFrontmatter.activeVariant === variantName) {
				delete this.osmosisStyleFrontmatter.activeVariant;
			}
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Apply per-node style overrides to frontmatter in a single batch write.
	 * Each entry maps a node ID to its complete Local-level NodeStyle.
	 * Existing overrides for unlisted nodes are preserved.
	 */
	async applyNodeStyleOverrides(overrides: Map<string, NodeStyle>): Promise<void> {
		if (!this.currentFile || overrides.size === 0) return;

		this.suppressNextReload = true;

		// Key each style by the line's block ID, stamping one first if it has
		// none, so the style survives edits to the line's text. The stamp and the
		// style write are one undo step: open a group unless a live edit (colour
		// drag) or an outer group already collects the writes.
		const ownGroup = !this.edits.recorder.live && !this.edits.recorder.grouping;
		if (ownGroup) this.beginEditGroup();
		try {
			const selectors = await this.stampStyleBlockIds(overrides);
			await this.writeNodeStyleOverrides(overrides, selectors);
		} finally {
			if (ownGroup) this.endEditGroup();
		}
		await this.render();
	}

	/**
	 * Stamp a block ID onto every node about to be styled that has none, and
	 * return the selector each node's style is stored under (see
	 * `planStyleKeys`). A write that only clears style keys stamps nothing.
	 */
	private async stampStyleBlockIds(overrides: Map<string, NodeStyle>): Promise<Map<string, string>> {
		const file = this.currentFile;
		if (!file) return new Map();
		const nodes: OsmosisNode[] = [];
		for (const [nodeId, style] of overrides) {
			const source = this.nodeMap.get(nodeId)?.source;
			if (source && Object.values(style).some((value) => value !== undefined)) nodes.push(source);
		}
		const content = await this.app.vault.read(file);
		const plan = planStyleKeys(content, this.cache.get(file.path, content).root, nodes);
		if (plan.content !== content) await this.writeFileTracked(file, plan.content);
		return plan.selectors;
	}

	/** The write half of {@link applyNodeStyleOverrides}: merge `overrides` into `osmosis-styles` under `selectors`, then refresh the cached styles. */
	private async writeNodeStyleOverrides(
		overrides: Map<string, NodeStyle>,
		selectors: Map<string, string>,
	): Promise<void> {
		if (!this.currentFile) return;

		// Capture the written styles so we can update immediately without
		// waiting for Obsidian's async metadata cache to refresh.
		let writtenStyles: Record<string, NodeStyle> | undefined;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = styleMappingFor(fm);
				const styles = (osmosis["styles"] as Record<string, NodeStyle>) ?? {};
				osmosis["styles"] = styles;

				for (const [nodeId, style] of overrides) {
					const layoutNode = this.nodeMap.get(nodeId);
					if (!layoutNode) continue;

					const selector = selectors.get(nodeId) ?? buildPreferredSelector(layoutNode.source);
					let existing = styles[selector] ?? {};

					// If the node gained a block ID after an override was written
					// under its stable-ID selector, migrate that entry to the
					// block-ID key so the override lives under a single selector.
					const legacySelector = buildStableIdSelector(layoutNode.source);
					if (selector !== legacySelector && styles[legacySelector]) {
						existing = { ...styles[legacySelector], ...existing };
						delete styles[legacySelector];
					}

					// Merge new properties into existing override (`undefined` deletes a key).
					const merged = mergeStyleOverride(existing, style);

					if (Object.keys(merged).length === 0) {
						delete styles[selector];
					} else {
						styles[selector] = merged;
					}
				}

				// Clean up empty
				if (Object.keys(styles).length === 0) {
					delete osmosis["styles"];
				} else {
					writtenStyles = { ...styles };
				}
				if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
			},
		);

		// Update frontmatter cache immediately from what we just wrote,
		// since Obsidian's metadataCache update is async and may lag.
		if (writtenStyles) {
			if (!this.osmosisStyleFrontmatter) {
				this.osmosisStyleFrontmatter = { styles: writtenStyles };
			} else {
				this.osmosisStyleFrontmatter.styles = writtenStyles;
			}
		} else {
			this.loadOsmosisStyleFrontmatter();
		}

		// Only clear size cache when size-affecting properties changed
		const sizeAffecting = [...overrides.values()].some(
			(s) => "shape" in s || "text" in s || "width" in s || "class" in s,
		);
		if (sizeAffecting) {
			this.nodeSizeCache.clear();
		}
	}

	/**
	 * Remove specific style properties (or all properties) from selected nodes.
	 * Pass `keys` to clear specific groups, or omit to clear all local overrides.
	 */
	async resetNodeStyles(
		nodeIds: string[],
		keys?: (keyof NodeStyle)[],
	): Promise<void> {
		if (!this.currentFile || nodeIds.length === 0) return;

		this.suppressNextReload = true;

		let writtenStyles: Record<string, NodeStyle> | undefined;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = styleMappingFor(fm);
				const styles = (osmosis["styles"] as Record<string, NodeStyle>) ?? {};
				osmosis["styles"] = styles;

				for (const nodeId of nodeIds) {
					const layoutNode = this.nodeMap.get(nodeId);
					if (!layoutNode) continue;
					// A node's override may live under its block-ID selector,
					// its stable-ID selector, or both (legacy) — clear all.
					const selectors = [
						buildBlockIdSelector(layoutNode.source),
						buildStableIdSelector(layoutNode.source),
					];
					for (const selector of selectors) {
						if (selector === undefined || !styles[selector]) continue;

						if (!keys) {
							// Clear all: remove the entire entry
							delete styles[selector];
						} else {
							// Clear specific keys
							for (const key of keys) {
								delete styles[selector][key];
							}
							// Remove entry if empty
							if (Object.keys(styles[selector]).length === 0) {
								delete styles[selector];
							}
						}
					}
				}

				if (Object.keys(styles).length === 0) {
					delete osmosis["styles"];
				} else {
					writtenStyles = { ...styles };
				}
				if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
			},
		);

		if (writtenStyles) {
			if (!this.osmosisStyleFrontmatter) {
				this.osmosisStyleFrontmatter = { styles: writtenStyles };
			} else {
				this.osmosisStyleFrontmatter.styles = writtenStyles;
			}
		} else if (this.osmosisStyleFrontmatter) {
			delete this.osmosisStyleFrontmatter.styles;
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Create or update a class definition in `osmosis-styles.classes` frontmatter.
	 * Pass the full NodeStyle for the class — it replaces the existing definition.
	 */
	async saveClassDefinition(className: string, style: NodeStyle): Promise<void> {
		if (!this.currentFile || !className) return;

		this.suppressNextReload = true;

		let writtenClasses: Record<string, NodeStyle> | undefined;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = styleMappingFor(fm);
				const classes = (osmosis["classes"] as Record<string, NodeStyle>) ?? {};
				osmosis["classes"] = classes;

				// Strip the `class` meta-key — it's not a visual property
				const cleaned = { ...style };
				delete cleaned.class;
				classes[className] = cleaned;

				writtenClasses = { ...classes };
			},
		);

		if (writtenClasses) {
			if (!this.osmosisStyleFrontmatter) {
				this.osmosisStyleFrontmatter = { classes: writtenClasses };
			} else {
				this.osmosisStyleFrontmatter.classes = writtenClasses;
			}
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Delete a class definition and clear `class` assignments from any nodes using it.
	 */
	async deleteClassDefinition(className: string): Promise<void> {
		if (!this.currentFile || !className) return;

		this.suppressNextReload = true;

		let writtenClasses: Record<string, NodeStyle> | undefined;
		let writtenStyles: Record<string, NodeStyle> | undefined;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = styleMappingFor(fm);

				// Remove the class definition
				const classes = (osmosis["classes"] as Record<string, NodeStyle>) ?? {};
				delete classes[className];
				if (Object.keys(classes).length === 0) {
					delete osmosis["classes"];
				} else {
					osmosis["classes"] = classes;
					writtenClasses = { ...classes };
				}

				// Clear `class` assignment from any nodes using this class
				const styles = (osmosis["styles"] as Record<string, NodeStyle>) ?? {};
				for (const [selector, nodeStyle] of Object.entries(styles)) {
					if (nodeStyle.class === className) {
						delete nodeStyle.class;
						if (Object.keys(nodeStyle).length === 0) {
							delete styles[selector];
						}
					}
				}
				if (Object.keys(styles).length === 0) {
					delete osmosis["styles"];
				} else {
					writtenStyles = { ...styles };
				}

				if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
			},
		);

		// Update cache
		if (this.osmosisStyleFrontmatter) {
			if (writtenClasses) {
				this.osmosisStyleFrontmatter.classes = writtenClasses;
			} else {
				delete this.osmosisStyleFrontmatter.classes;
			}
			if (writtenStyles) {
				this.osmosisStyleFrontmatter.styles = writtenStyles;
			} else {
				delete this.osmosisStyleFrontmatter.styles;
			}
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Rename a class definition and update all node references.
	 */
	async renameClassDefinition(oldName: string, newName: string): Promise<void> {
		if (!this.currentFile || !oldName || !newName || oldName === newName) return;

		this.suppressNextReload = true;

		let writtenClasses: Record<string, NodeStyle> | undefined;
		let writtenStyles: Record<string, NodeStyle> | undefined;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = styleMappingFor(fm);

				// Rename the class definition
				const classes = (osmosis["classes"] as Record<string, NodeStyle>) ?? {};
				if (classes[oldName]) {
					classes[newName] = classes[oldName];
					delete classes[oldName];
					osmosis["classes"] = classes;
					writtenClasses = { ...classes };
				}

				// Update node references
				const styles = (osmosis["styles"] as Record<string, NodeStyle>) ?? {};
				for (const nodeStyle of Object.values(styles)) {
					if (nodeStyle.class === oldName) {
						nodeStyle.class = newName;
					}
				}
				if (Object.keys(styles).length > 0) {
					writtenStyles = { ...styles };
				}
			},
		);

		if (this.osmosisStyleFrontmatter) {
			if (writtenClasses) this.osmosisStyleFrontmatter.classes = writtenClasses;
			if (writtenStyles) this.osmosisStyleFrontmatter.styles = writtenStyles;
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Save a global class definition (stored in plugin settings, available across all notes).
	 */
	async saveGlobalClassDefinition(className: string, style: NodeStyle): Promise<void> {
		if (!this.plugin || !className) return;
		const cleaned = { ...style };
		delete cleaned.class;
		this.plugin.settings.globalClasses[className] = cleaned;
		await this.plugin.saveSettings();
		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Delete a global class definition and clear assignments from nodes in this note.
	 */
	async deleteGlobalClassDefinition(className: string): Promise<void> {
		if (!this.plugin || !className) return;
		delete this.plugin.settings.globalClasses[className];
		await this.plugin.saveSettings();

		// Also clear assignments in the current note's frontmatter
		if (this.currentFile) {
			this.suppressNextReload = true;
			await this.processFrontMatterTracked(
				this.currentFile,
				(fm: Record<string, unknown>) => {
					const osmosis = readStyleMapping(fm);
					if (!osmosis) return;
					const styles = osmosis["styles"] as Record<string, NodeStyle> | undefined;
					if (!styles) return;
					for (const [selector, nodeStyle] of Object.entries(styles)) {
						if (nodeStyle.class === className) {
							delete nodeStyle.class;
							if (Object.keys(nodeStyle).length === 0) {
								delete styles[selector];
							}
						}
					}
					if (Object.keys(styles).length === 0) delete osmosis["styles"];
					if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
				},
			);
			// Update cache directly — metadataCache may lag behind processFrontMatter
			if (this.osmosisStyleFrontmatter?.styles) {
				for (const [selector, nodeStyle] of Object.entries(this.osmosisStyleFrontmatter.styles)) {
					if (nodeStyle.class === className) {
						delete nodeStyle.class;
						if (Object.keys(nodeStyle).length === 0) {
							delete this.osmosisStyleFrontmatter.styles[selector];
						}
					}
				}
				if (Object.keys(this.osmosisStyleFrontmatter.styles).length === 0) {
					delete this.osmosisStyleFrontmatter.styles;
				}
			}
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Rename a global class definition and update node references in the current note.
	 */
	async renameGlobalClassDefinition(oldName: string, newName: string): Promise<void> {
		if (!this.plugin || !oldName || !newName || oldName === newName) return;
		const def = this.plugin.settings.globalClasses[oldName];
		if (!def) return;
		this.plugin.settings.globalClasses[newName] = def;
		delete this.plugin.settings.globalClasses[oldName];
		await this.plugin.saveSettings();

		// Update node references in the current note
		if (this.currentFile) {
			this.suppressNextReload = true;
			await this.processFrontMatterTracked(
				this.currentFile,
				(fm: Record<string, unknown>) => {
					const osmosis = readStyleMapping(fm);
					if (!osmosis) return;
					const styles = osmosis["styles"] as Record<string, NodeStyle> | undefined;
					if (!styles) return;
					for (const nodeStyle of Object.values(styles)) {
						if (nodeStyle.class === oldName) {
							nodeStyle.class = newName;
						}
					}
				},
			);
			// Update cache directly — metadataCache may lag behind processFrontMatter
			if (this.osmosisStyleFrontmatter?.styles) {
				for (const nodeStyle of Object.values(this.osmosisStyleFrontmatter.styles)) {
					if (nodeStyle.class === oldName) {
						nodeStyle.class = newName;
					}
				}
			}
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Move a class between local and global scope.
	 * Copies the definition to the target scope and removes it from the source.
	 * Node assignments (class references) are preserved since the name stays the same.
	 */
	async moveClassToScope(
		className: string,
		fromScope: "local" | "global",
		toScope: "local" | "global",
	): Promise<void> {
		if (fromScope === toScope || !className) return;

		if (fromScope === "local") {
			// Local → Global: get definition from frontmatter, save to settings, remove from frontmatter
			const fm = this.getOsmosisStyleFrontmatter();
			const def = fm?.classes?.[className];
			if (!def) return;
			await this.saveGlobalClassDefinition(className, { ...def });
			await this.removeLocalClassDefinition(className);
		} else {
			// Global → Local: get definition from settings, save to frontmatter, remove from settings
			const globalClasses = this.getGlobalClasses();
			const def = globalClasses[className];
			if (!def) return;
			await this.saveClassDefinition(className, { ...def });
			if (this.plugin) {
				delete this.plugin.settings.globalClasses[className];
				await this.plugin.saveSettings();
			}
		}

		this.nodeSizeCache.clear();
		await this.render();
	}

	/**
	 * Remove a local class definition without clearing node assignments.
	 * Used by moveClassToScope to remove the source definition.
	 */
	private async removeLocalClassDefinition(className: string): Promise<void> {
		if (!this.currentFile || !className) return;

		this.suppressNextReload = true;

		let writtenClasses: Record<string, NodeStyle> | undefined;

		await this.processFrontMatterTracked(
			this.currentFile,
			(fm: Record<string, unknown>) => {
				const osmosis = readStyleMapping(fm);
				if (!osmosis) return;
				const classes = osmosis["classes"] as Record<string, NodeStyle> | undefined;
				if (!classes) return;
				delete classes[className];
				if (Object.keys(classes).length === 0) {
					delete osmosis["classes"];
				} else {
					writtenClasses = { ...classes };
				}
				if (Object.keys(osmosis).length === 0) delete fm["osmosis-styles"];
			},
		);

		if (this.osmosisStyleFrontmatter) {
			if (writtenClasses) {
				this.osmosisStyleFrontmatter.classes = writtenClasses;
			} else {
				delete this.osmosisStyleFrontmatter.classes;
			}
		}
	}

	/** Copy style from the primary selected node.
	 *  Preserves the class name so paste can assign the class directly. */
	private copyNodeStyle(): void {
		if (!this.selectedNodeId) return;
		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;
		const localStyle = lookupNodeStyle(this.osmosisStyleFrontmatter, node);
		if (!localStyle || Object.keys(localStyle).length === 0) {
			new Notice("No style overrides to copy");
			return;
		}
		copyStyleOf(localStyle);
		new Notice("Style copied");
	}

	/** Paste copied style overrides onto all selected nodes.
	 *  Replaces target overrides entirely: keys absent from the clipboard
	 *  are set to `undefined` so `applyNodeStyleOverrides` deletes them. */
	private async pasteNodeStyle(): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		if (nodeClipboard.style === null) {
			new Notice("No style to paste");
			return;
		}
		if (this.selectedNodeIds.size === 0) return;

		const overrides = stylePasteOverrides(this.selectedNodeIds);
		if (overrides === null) return;
		await this.applyNodeStyleOverrides(overrides);
		new Notice(`Style pasted to ${this.selectedNodeIds.size} node(s)`);
	}

	private notifySelectionChange(): void {
		for (const fn of this.selectionChangeListeners) {
			fn();
		}
	}

	/** Load per-note map settings from frontmatter, merging with defaults. */
	private loadMapSettings(): void {
		const overrides = buildMapSettingsFromFrontmatter(this.osmosisStyleFrontmatter);
		this.mapSettings = { ...DEFAULT_MAP_SETTINGS, ...overrides };
	}

	/** Parse `osmosis-styles:` frontmatter from the current file's metadata cache. */
	loadOsmosisStyleFrontmatter(): void {
		if (!this.currentFile) {
			this.osmosisStyleFrontmatter = undefined;
			return;
		}
		const cache = this.app.metadataCache.getFileCache(this.currentFile);
		this.osmosisStyleFrontmatter = parseOsmosisStyleFrontmatter(
			cache?.frontmatter,
		);
	}

	/** Re-parse osmosis frontmatter directly from raw markdown content.
	 *  Used after undo/redo where the metadata cache hasn't updated yet. */
	private reloadFrontmatterFromContent(content: string): void {
		const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!match?.[1]) {
			this.osmosisStyleFrontmatter = undefined;
			return;
		}
		try {
			const parsed: unknown = parseYaml(match[1]);
			const fm = parsed as Record<string, unknown> | undefined;
			this.reportCorruptStyles(fm);
			this.osmosisStyleFrontmatter = parseOsmosisStyleFrontmatter(fm);
		} catch {
			this.osmosisStyleFrontmatter = undefined;
		}
	}

	/**
	 * Say so, once per file, when `osmosis-styles` holds something unreadable.
	 *
	 * Losing every style on a map is not a small thing, and until now it
	 * happened in total silence — the map simply came back unstyled and the user
	 * was left to guess whether they had imagined styling it. The value is left
	 * on disk: it is the only remaining evidence of what went wrong, and the
	 * next style write replaces it anyway (see `styleMappingFor`).
	 */
	private reportCorruptStyles(fm: Record<string, unknown> | undefined): void {
		const path = this.currentFile?.path;
		if (path === undefined || !isCorruptStyleFrontmatter(fm)) return;
		if (this.reportedCorruptStylePaths.has(path)) return;
		this.reportedCorruptStylePaths.add(path);
		console.warn(
			`Osmosis: "osmosis-styles" in ${path} is not a mapping and was ignored;`,
			"per-note styling for this map is unavailable until it is restyled.",
			fm?.["osmosis-styles"],
		);
		new Notice(
			"Osmosis: this note's saved mind map styles are corrupt and were ignored. " +
			"Restyling the map will replace them.",
			10000,
		);
	}

	// ─── Viewport ────────────────────────────────────────────

	private updateViewBox(): void {
		if (!this.svg) return;
		if (this.viewportHost) {
			// iOS: the same viewport, expressed as a CSS transform so that
			// composited node content travels with the map instead of stranding.
			this.svg.style.transform = viewBoxTransform(
				this.viewBox,
				this.viewportHost.getBoundingClientRect(),
			);
		} else {
			const { x, y, w, h } = this.viewBox;
			this.svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
		}
		// The edit overlay lives outside the SVG, so the viewBox does not carry
		// it along — re-place it or it freezes where the node used to be.
		if (this.editingNodeId) this.positionEditOverlay();
		this.scheduleCullUpdate();
	}

	/** Notify the toolbar of current selection/editing state. */
	private updateToolbarState(): void {
		this.toolRibbon?.updateState(this.toolbarState());
	}

	private toolbarState(): ToolbarState {
		return {
			hasSelection: this.selectedNodeId !== null,
			isEditing: this.editingNodeId !== null,
			hasFile: this.currentFile !== null,
			isReadingMode: this.isReadingMode,
		};
	}

	/** Run a toolbar button for its command (see `checkCallback` semantics). */
	runToolbarCommand(def: ButtonDef, checking: boolean): boolean {
		return this.toolRibbon?.trigger(def, this.toolbarState(), checking) ?? false;
	}

	/** Fit the entire mind map into the visible viewport with padding. */
	private fitToView(): void {
		if (!this.currentLayout) return;
		this.stopInertia();
		const bounds = this.currentLayout.bounds;
		const contentWidth = bounds.width + LAYOUT_PADDING * 2;
		const contentHeight = bounds.height + LAYOUT_PADDING * 2;

		const containerRect = this.contentEl.getBoundingClientRect();
		const fit = fitViewBox(
			contentWidth, contentHeight,
			containerRect.width, containerRect.height,
			MIN_ZOOM, MAX_ZOOM,
		);
		this.zoom = fit.zoom;
		Object.assign(this.viewBox, fit.viewBox);
		this.updateViewBox();
	}

	/** Step zoom by a multiplier, centered on the viewport center. */
	private zoomStep(factor: number): void {
		this.stopInertia();
		const newZoom = Math.max(
			MIN_ZOOM,
			Math.min(MAX_ZOOM, this.zoom * factor),
		);
		const scale = this.zoom / newZoom;
		const cx = this.viewBox.x + this.viewBox.w / 2;
		const cy = this.viewBox.y + this.viewBox.h / 2;
		this.viewBox.w *= scale;
		this.viewBox.h *= scale;
		this.viewBox.x = cx - this.viewBox.w / 2;
		this.viewBox.y = cy - this.viewBox.h / 2;
		this.zoom = newZoom;
		this.updateViewBox();
	}

	/** Center the viewport on the root node. */
	private centerOnRoot(): void {
		if (!this.currentLayout) return;
		const root = this.currentLayout.root;
		// Root node is virtual; center on its first child if possible
		const target = root.children.length > 0 ? root.children[0] : null;
		if (!target) return;
		this.centerOnNode(target);
	}

	/** Center the viewport on a node, keeping the zoom. */
	private centerOnNode(target: LayoutNode): void {
		this.stopInertia();
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const nx = target.rect.x + offsetX + target.rect.width / 2;
		const ny = target.rect.y + offsetY + target.rect.height / 2;
		this.viewBox.x = nx - this.viewBox.w / 2;
		this.viewBox.y = ny - this.viewBox.h / 2;
		this.updateViewBox();
	}

	/** Check if a node (in SVG coords with offset applied) intersects the viewport grown by `margin` */
	private isNodeInViewport(
		node: LayoutNode,
		offsetX: number,
		offsetY: number,
		margin = CULL_MARGIN,
	): boolean {
		const { x, y, width, height } = node.rect;
		return rectInView(x + offsetX, y + offsetY, width, height, this.viewBox, margin);
	}

	/** Check if a branch line (between parent and child) intersects the expanded viewport */
	private isBranchInViewport(
		parent: LayoutNode,
		child: LayoutNode,
		offsetX: number,
		offsetY: number,
	): boolean {
		// Compute bounding box of the two connection points, accounting for side
		const isSecondary = child.side === "secondary";
		const isTopDown = this.mapSettings.direction === "top-down";

		let cx: number, cy: number, px: number, py: number;
		if (isSecondary && isTopDown) {
			cx = child.rect.x + child.rect.width / 2 + offsetX;
			cy = child.rect.y + child.rect.height + offsetY;
			px = parent.rect.x + parent.rect.width / 2 + offsetX;
			py = parent.rect.y + offsetY;
		} else if (isSecondary) {
			cx = child.rect.x + child.rect.width + offsetX;
			cy = child.rect.y + child.rect.height / 2 + offsetY;
			px = parent.rect.x + offsetX;
			py = parent.rect.y + parent.rect.height / 2 + offsetY;
		} else if (isTopDown) {
			cx = child.rect.x + child.rect.width / 2 + offsetX;
			cy = child.rect.y + offsetY;
			px = parent.rect.x + parent.rect.width / 2 + offsetX;
			py = parent.rect.y + parent.rect.height + offsetY;
		} else {
			cx = child.rect.x + offsetX;
			cy = child.rect.y + child.rect.height / 2 + offsetY;
			px = parent.rect.x + parent.rect.width + offsetX;
			py = parent.rect.y + parent.rect.height / 2 + offsetY;
		}

		const minX = Math.min(px, cx);
		const minY = Math.min(py, cy);
		const maxX = Math.max(px, cx);
		const maxY = Math.max(py, cy);

		const vx = this.viewBox.x - CULL_MARGIN;
		const vy = this.viewBox.y - CULL_MARGIN;
		const vw = this.viewBox.w + CULL_MARGIN * 2;
		const vh = this.viewBox.h + CULL_MARGIN * 2;

		return maxX > vx && minX < vx + vw && maxY > vy && minY < vy + vh;
	}

	/** Schedule a viewport cull update on the next animation frame */
	private scheduleCullUpdate(): void {
		if (this.cullRafId !== null) return;
		this.cullRafId = window.requestAnimationFrame(() => {
			this.cullRafId = null;
			void this.runCullUpdate();
		});
	}

	/**
	 * Run cull passes one at a time, coalescing everything that asks for one
	 * while a pass is in flight into a single follow-up.
	 *
	 * **Passes must not overlap.** {@link updateVisibleNodes} decides what to
	 * draw from `renderedNodeIds` but only assigns it *after* awaiting the
	 * draws, and `drawNode` awaits `MarkdownRenderer`. A second pass entering
	 * that window reads the pre-pass set, concludes that everything the first
	 * pass is currently drawing is still missing, and draws it again — two
	 * `<g data-node-id="…">` for one node. The removal loop below takes every
	 * match now, but a duplicate that is still on screen is not removed by
	 * anything, so the next pass to bring it back in duplicates it again.
	 *
	 * The window is not rare: `updateViewBox` schedules a pass, and a pan, a
	 * pinch and every frame of inertia call it. On mobile a pass over
	 * image-bearing nodes comfortably outlasts a frame, so a fling used to
	 * duplicate a slice of the map per frame — unbounded SVG growth that took
	 * Obsidian down on Android partway through a study session.
	 *
	 * The `do`/`while` is what keeps a fling smooth: requests that arrive
	 * during a pass collapse into one more pass against the latest viewBox,
	 * rather than one queued pass each.
	 */
	private async runCullUpdate(): Promise<void> {
		if (this.cullRunning) {
			this.cullQueued = true;
			return;
		}
		this.cullRunning = true;
		try {
			do {
				this.cullQueued = false;
				const start = this.perf?.start() ?? 0;
				await this.updateVisibleNodes();
				this.perf?.cull(start);
			} while (this.cullQueued);
		} finally {
			this.cullRunning = false;
		}
	}

	/** Add/remove DOM nodes based on current viewport */
	private async updateVisibleNodes(): Promise<void> {
		if (
			!this.svg ||
			!this.currentLayout ||
			!this.nodesGroup ||
			!this.branchLinesGroup
		)
			return;

		// Held across the await below so the pass can tell whether the SVG it
		// has been drawing into is still the live one — see the commit check
		// at the end.
		const nodesGroup = this.nodesGroup;
		const generation = this.drawGeneration;
		const { nodes } = this.currentLayout;
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const lineStyle = this.mapSettings.branchLineStyle;

		const nowVisible = new Set<string>();
		const nowVisibleBranches = new Set<string>();
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			if (
				this.isNodeInViewport(node, offsetX, offsetY) ||
				node.source.id === this.editingNodeId
			) {
				nowVisible.add(node.source.id);
			}
			// A branch is culled on its own geometry, never on its child's. A
			// branch crosses the viewport whenever it spans it — zooming in on a
			// parent puts its children outside the viewport long before the
			// branches reaching them leave it, and panning past a parent does the
			// same from the other end.
			if (
				node.parent &&
				node.parent.source.type !== "root" &&
				this.isBranchInViewport(node.parent, node, offsetX, offsetY)
			) {
				nowVisibleBranches.add(node.source.id);
			}
		}

		// Remove nodes that left the viewport (but never cull the node being
		// edited). Every match, not the first: one node id can have acquired
		// more than one group from overlapping passes (see `runCullUpdate`), and
		// leaving the extras behind is what let them accumulate.
		// One walk of the group for all of them: a selector query per leaving
		// id rescanned every drawn node each time.
		const leaving = new Set<string>();
		for (const id of this.renderedNodeIds) {
			if (!nowVisible.has(id) && id !== this.editingNodeId) leaving.add(id);
		}
		if (leaving.size > 0) {
			nodesGroup.querySelectorAll(".osmosis-node-group").forEach((el) => {
				const id = el.getAttribute("data-node-id");
				if (id !== null && leaving.has(id)) el.remove();
			});
		}

		// Remove branch lines that left the viewport. A tapered *and* patterned
		// branch is two paths under the one child id, so take every match.
		const leavingBranches = new Set<string>();
		for (const id of this.renderedBranchIds) {
			if (!nowVisibleBranches.has(id)) leavingBranches.add(id);
		}
		if (leavingBranches.size > 0) {
			this.branchLinesGroup.querySelectorAll(".osmosis-branch-line").forEach((line) => {
				const id = line.getAttribute("data-child-id");
				if (id !== null && leavingBranches.has(id)) line.remove();
			});
		}

		// Add nodes and branches that entered the viewport. Node draws are
		// time-boxed: a fast pan over a large map brings in dozens of nodes a
		// frame, each a `MarkdownRenderer` call the first time, so the ones
		// already on screen (and the selected/edited ones) go first and
		// whatever is left after the budget waits for the next frame's pass.
		const urgent: LayoutNode[] = [];
		const ahead: LayoutNode[] = [];
		for (const node of nodes) {
			if (node.source.type === "root") continue;
			const id = node.source.id;
			if (nowVisible.has(id) && !this.renderedNodeIds.has(id)) {
				if (
					id === this.editingNodeId ||
					this.selectedNodeIds.has(id) ||
					this.isNodeInViewport(node, offsetX, offsetY, 0)
				) {
					urgent.push(node);
				} else {
					ahead.push(node);
				}
			}
			if (
				node.parent &&
				nowVisibleBranches.has(id) &&
				!this.renderedBranchIds.has(id)
			) {
				this.drawBranchLine(
					this.branchLinesGroup,
					node.parent,
					node,
					offsetX,
					offsetY,
					lineStyle,
				);
			}
		}
		const renderPromises: Promise<void>[] = [];
		// Drawn off-document and committed together below, so a pass that a
		// full pass overtook adds nothing to the group that pass kept.
		const staging = document.createElementNS(SVG_NS, "g");
		const deferred = drawWithinBudget(
			urgent, ahead, CULL_DRAW_BUDGET_MS, () => performance.now(),
			(node) => { renderPromises.push(this.drawNode(staging, node, offsetX, offsetY)); },
		);
		await Promise.all(renderPromises);

		// A full render pass can land while the draws above are awaiting: it
		// empties the container and builds a fresh SVG, and its own
		// `renderedNodeIds` describes that DOM exactly. Committing this pass's
		// set over it would leave the bookkeeping describing a DOM that no
		// longer exists — every node it lists as absent gets drawn a second
		// time. The nodes drawn above went into the old, now-detached group and
		// go away with it.
		if (this.nodesGroup !== nodesGroup || this.drawGeneration !== generation) return;
		nodesGroup.append(...Array.from(staging.childNodes));

		// Re-apply spatial study state to newly rendered nodes
		this.applySpatialState();

		// Deferred nodes are not drawn, so they stay out of the set and the
		// next frame's pass picks them up.
		for (const node of deferred) nowVisible.delete(node.source.id);
		this.renderedNodeIds = nowVisible;
		this.renderedBranchIds = nowVisibleBranches;
		if (deferred.length > 0) this.scheduleCullUpdate();
	}

	private screenToSvg(
		clientX: number,
		clientY: number,
	): { x: number; y: number } {
		if (!this.svg) return { x: 0, y: 0 };
		if (this.viewportHost) {
			// getScreenCTM() reports the SVG's *own* user space, which on this
			// path no longer includes the pan/zoom — that lives in a CSS
			// transform above it. Invert the transform instead; the maths is
			// unit-tested against the viewBox mapping it replaces.
			return clientToUser(
				this.viewBox,
				this.viewportHost.getBoundingClientRect(),
				clientX,
				clientY,
			);
		}
		const ctm = this.svg.getScreenCTM();
		if (!ctm) return { x: 0, y: 0 };
		const inv = ctm.inverse();
		return {
			x: inv.a * clientX + inv.c * clientY + inv.e,
			y: inv.b * clientX + inv.d * clientY + inv.f,
		};
	}

	// ─── Pointer event handlers (unified mouse + touch) ─────

	private handlePointerDown = (e: PointerEvent): void => {
		this.lastPointerType = e.pointerType;
		// A finger on the map stops a coast dead, like any scroll view. What the
		// coast still had left is kept for the length of this touch: a flick that
		// follows inherits it, a tap or a slow drag lets it expire.
		if (this.activePointers.size === 0) {
			this.stoppedInertiaOnDown = this.inertiaRafId !== null;
			this.carryVelocity = { ...this.panVelocity };
			this.touchDownTime = performance.now();
			this.panCommitted = false;
		}
		this.stopInertia();
		this.panSamples = [];
		this.zoomSamples = [];
		this.panRaw = null;
		this.pinchTail = null;
		this.pinchTailZoomVelocity = 0;
		this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		// Two+ pointers = pinch gesture — cancel any single-finger state
		if (this.activePointers.size >= 2) {
			this.cancelLongPress();
			this.dragNodeId = null;
			this.isPanning = false;
			this.initPinch();
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		this.contextPress = null;
		// Right button (mouse or pen): pan, and open the context menu on release if it never moved. While a node is being edited the browser's own menu stays.
		if (e.button === 2 && e.pointerType !== "touch" && !this.editingNodeId) {
			this.contextPress = { nodeId: this.getClickedNodeId(e) };
			this.isPanning = true;
			this.panPending = true;
			this.panStart = { x: e.clientX, y: e.clientY };
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		if (e.button !== 0 && e.button !== 1) return;

		const nodeId = this.getClickedNodeId(e);

		// Touch: double-tap detection
		if (e.pointerType === "touch") {
			const now = Date.now();
			const dx = e.clientX - this.lastTapPosition.x;
			const dy = e.clientY - this.lastTapPosition.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (
				now - this.lastTapTime < DOUBLE_TAP_MS &&
				dist < DOUBLE_TAP_DISTANCE &&
				nodeId &&
				nodeId === this.lastTapNodeId
			) {
				this.cancelLongPress();
				void this.startEditing(nodeId);
				e.preventDefault();
				e.stopPropagation();
				return;
			}
		}

		// Resize handle: start drag-to-resize (handles are hidden by CSS in
		// reading mode, but guard anyway)
		if (e.button === 0 && !this.editingNodeId && !this.isReadingMode) {
			const target = e.target as Element;
			if (target.closest(".osmosis-resize-handle")) {
				const handleNodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id") ?? null;
				const handleNode = handleNodeId ? this.nodeMap.get(handleNodeId) : null;
				// A finger cannot hover, so until the node is selected the
				// handle is invisible — an 8px target no one can see, sitting
				// on the edge of every node, catching drags meant as pans.
				// Selecting the node reveals it and arms it. A mouse reveals it
				// by hovering, which is deliberate enough on its own.
				const armed =
					e.pointerType !== "touch" ||
					(handleNodeId !== null && this.selectedNodeIds.has(handleNodeId));
				if (handleNodeId && handleNode && armed) {
					this.resizingNodeId = handleNodeId;
					this.resizeStartX = e.clientX;
					this.resizeStartWidth = handleNode.rect.width;
					e.preventDefault();
					e.stopPropagation();
					return;
				}
			}
		}

		// Left-click / touch on a node: prepare for potential drag
		if (e.button === 0 && nodeId && !this.editingNodeId) {
			const target = e.target as Element;
			if (target.closest(".osmosis-collapse-toggle")) {
				// A mouse folds on click and cannot pan off a node anyway.
				if (e.pointerType !== "touch") return;

				// A finger is coarse and the toggle is 14px wide, so a press
				// that lands on one is as likely to be a pan starting badly as
				// a fold. Start the pan here and let the fold happen on release,
				// if the map never moved — see `handleTouchTap`.
				this.isPanning = true;
				this.panPending = true;
				this.panStart = { x: e.clientX, y: e.clientY };
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			this.dragNodeId = nodeId;
			this.dragStartScreen = { x: e.clientX, y: e.clientY };

			// Touch: start long-press timer for selection mode + potential drag
			if (e.pointerType === "touch") {
				this.longPressTriggered = false;
				this.longPressTimer = window.setTimeout(() => {
					this.longPressTriggered = true;
					// Enter touch selection mode and select this node
					this.touchSelectionMode = true;
					// A hold on a node that is already selected grabs the whole
					// selection, ready to drag it. Toggling here would drop that
					// node back out, and the drag would then move it alone,
					// leaving the rest of the selection behind. Membership is
					// toggled by a plain tap instead.
					if (this.dragNodeId && !this.selectedNodeIds.has(this.dragNodeId)) {
						this.toggleNodeInSelection(this.dragNodeId);
					}
					if (navigator.vibrate) navigator.vibrate(50);
				}, LONG_PRESS_MS);
				e.preventDefault();
				e.stopPropagation();
			}
			// Mouse: don't preventDefault — it would suppress click/dblclick events
			return;
		}

		// Shift+left-click on background: rubber-band (mouse only)
		if (
			e.button === 0 &&
			!nodeId &&
			e.shiftKey &&
			e.pointerType !== "touch"
		) {
			const svgPt = this.screenToSvg(e.clientX, e.clientY);
			this.isRubberBanding = true;
			this.rubberBandStart = svgPt;
			e.preventDefault();
			e.stopPropagation();
			return;
		}

		// Middle-click or left-click/touch on background: pan
		if (e.button === 1 || (e.button === 0 && !nodeId)) {
			this.isPanning = true;
			// A finger has to travel before it pans; a mouse button is
			// unambiguous and keeps its 1:1 grab from the first pixel.
			this.panPending = e.pointerType === "touch";
			this.panStart = { x: e.clientX, y: e.clientY };
			e.preventDefault();
			e.stopPropagation();
		}
	};

	private handlePointerMove = (e: PointerEvent): void => {
		if (this.activePointers.has(e.pointerId)) {
			this.activePointers.set(e.pointerId, {
				x: e.clientX,
				y: e.clientY,
			});
		}

		// Pinch zoom (2+ pointers)
		if (this.activePointers.size >= 2 && this.pinchStartDistance !== null) {
			e.preventDefault();
			e.stopPropagation();
			this.updatePinch();
			return;
		}

		// Tail of a pinch: one finger left on the glass. Promote to a pan only
		// once it has travelled far enough to be a drag rather than the wobble
		// of a finger on its way up — that wobble used to jerk the map sideways
		// at the end of every pinch.
		if (this.pinchTail) {
			const dx = e.clientX - this.pinchTail.x;
			const dy = e.clientY - this.pinchTail.y;
			if (!exceedsDragThreshold(dx, dy, e.pointerType)) {
				e.stopPropagation();
				return;
			}
			this.pinchTail = null;
			this.pinchTailZoomVelocity = 0;
			this.isPanning = true;
			this.panPending = false;
			this.panCommitted = true;
			this.panStart = { x: e.clientX, y: e.clientY };
		}

		// Resize drag: update node width live
		if (this.resizingNodeId && this.svg) {
			e.preventDefault();
			e.stopPropagation();
			this.updateResize(e.clientX);
			return;
		}

		// Rubber-band selection
		if (this.isRubberBanding && this.svg) {
			e.stopPropagation();
			this.updateRubberBand(e);
			return;
		}

		// Check for drag threshold
		if (this.dragNodeId && !this.isDragging) {
			const dx = e.clientX - this.dragStartScreen.x;
			const dy = e.clientY - this.dragStartScreen.y;

			if (exceedsDragThreshold(dx, dy, e.pointerType)) {
				// Movement ends the long press, whether or not it had fired
				if (e.pointerType === "touch") this.cancelLongPress();

				if (
					nodeDragPans({
						pointerType: e.pointerType,
						longPressTriggered: this.longPressTriggered,
						isReadingMode: this.isReadingMode,
						spatialMode: this.spatialMode,
					})
				) {
					this.dragNodeId = null;
					this.isPanning = true;
					this.panPending = false;
					this.panCommitted = true;
					this.panStart = { x: e.clientX, y: e.clientY };
				} else {
					this.startDrag(this.dragNodeId);
				}

				if (e.pointerType === "touch") e.stopPropagation();
			}
		}

		// Update drag position
		if (this.isDragging && this.svg) {
			e.stopPropagation();
			this.updateDrag(e);
			return;
		}

		if (!this.isPanning || !this.svg) return;

		// Hold still until the finger has clearly committed to a drag, then take
		// the slop off the start point so the map doesn't jump the moment it does.
		if (this.panPending) {
			const px = e.clientX - this.panStart.x;
			const py = e.clientY - this.panStart.y;
			const moved = this.contextPress !== null ? movedPastSlop(px, py) : exceedsDragThreshold(px, py, e.pointerType);
			if (!moved) {
				e.stopPropagation();
				return;
			}
			this.panPending = false;
			this.panCommitted = true;
			this.panStart = { x: e.clientX, y: e.clientY };
			e.stopPropagation();
			return;
		}

		e.stopPropagation();
		// Past the slop, so the map is about to move under the pointer.
		this.panCommitted = true;
		const svgCurrent = this.screenToSvg(e.clientX, e.clientY);
		const svgStart = this.screenToSvg(this.panStart.x, this.panStart.y);
		const dx = svgCurrent.x - svgStart.x;
		const dy = svgCurrent.y - svgStart.y;
		this.panStart = { x: e.clientX, y: e.clientY };

		if (e.pointerType === "touch") {
			// Track the undamped position and draw the rubber-banded one, so a
			// drag past the edge of the map resists instead of running off.
			const raw = (this.panRaw ??= { x: this.viewBox.x, y: this.viewBox.y });
			raw.x -= dx;
			raw.y -= dy;
			const bounds = this.panBounds();
			this.viewBox.x = bounds
				? applyRubberBand(raw.x, bounds.x, this.viewBox.w)
				: raw.x;
			this.viewBox.y = bounds
				? applyRubberBand(raw.y, bounds.y, this.viewBox.h)
				: raw.y;
			this.recordPanSample(e.clientX, e.clientY);
		} else {
			this.viewBox.x -= dx;
			this.viewBox.y -= dy;
		}

		this.updateViewBox();
	};

	private handlePointerUp = (e: PointerEvent): void => {
		this.activePointers.delete(e.pointerId);
		this.cancelLongPress();

		// Was pinching. Fingers never leave together — a "simultaneous" lift is
		// two pointerups milliseconds apart — so the gesture does not become a
		// pan the instant the first one goes. It enters a tail: the map holds
		// still until the remaining finger moves far enough to mean it, and the
		// zoom velocity is snapshotted now, while the samples are still fresh,
		// in case the second finger is on its way up.
		if (this.pinchStartDistance !== null) {
			this.pinchStartDistance = null;
			if (this.activePointers.size === 1) {
				const remaining = this.activePointers.values().next().value as {
					x: number;
					y: number;
				};
				this.pinchTail = {
					x: remaining.x,
					y: remaining.y,
					t: performance.now(),
				};
				this.pinchTailZoomVelocity = estimateVelocity(
					this.zoomSamples,
					performance.now(),
				).x;
				// The pinch moved the viewBox out from under the drag's raw
				// position; a pan promoted out of the tail starts afresh.
				this.panRaw = null;
				this.panSamples = [];
			} else if (this.activePointers.size === 0) {
				this.startZoomInertia(
					estimateVelocity(this.zoomSamples, performance.now()).x,
				);
			}
			return;
		}

		// Last finger of a pinch, lifted without a deliberate drag in between:
		// the whole gesture was a pinch, so coast the zoom rather than treating
		// this as a tap on the background.
		if (this.pinchTail && this.activePointers.size === 0) {
			const held = performance.now() - this.pinchTail.t;
			this.pinchTail = null;
			this.startZoomInertia(
				held <= PINCH_TAIL_MS ? this.pinchTailZoomVelocity : 0,
			);
			this.pinchTailZoomVelocity = 0;
			return;
		}

		if (this.resizingNodeId) {
			void this.finishResize();
			return;
		}

		if (this.isRubberBanding) {
			this.finishRubberBand();
			return;
		}

		if (this.isDragging) {
			void this.executeDrop();
			return;
		}

		// A right-click that never moved: its menu opens now, on release. (A cancelled or left pointer opens nothing.)
		const contextPress = this.contextPress;
		this.contextPress = null;
		if (contextPress !== null && e.type === "pointerup" && e.button === 2 && !this.panCommitted) {
			this.contextOpenedAt = performance.now();
			this.showNodeMenu(contextPress.nodeId, (menu) => menu.showAtMouseEvent(e));
			return;
		}

		// If we had a drag candidate but didn't reach threshold, treat as tap
		const wasDragCandidate = this.dragNodeId !== null;
		const dragCandidateId = this.dragNodeId;
		this.dragNodeId = null;
		const wasPanning = this.isPanning;
		this.isPanning = false;
		this.panPending = false;
		// `panCommitted` deliberately survives this handler: the browser's click
		// arrives after pointerup, and `handleClick` needs to know the gesture
		// panned. The next pointerdown clears it.

		// Fling the pan onward, or spring back if the drag ended past a bound.
		if (e.pointerType === "touch" && wasPanning) {
			this.startPanInertia();
		}
		this.panRaw = null;
		this.carryVelocity = { x: 0, y: 0 };

		// Don't interfere with active editing (e.g. double-tap just started editing)
		if (e.pointerType === "touch" && this.editingNodeId) return;

		// This touch came down on a moving map to stop it. That is the whole of
		// what it did — it is not also a tap, so it neither clears the selection
		// nor arms a double-tap, exactly like catching a scrolling list.
		if (e.pointerType === "touch" && this.stoppedInertiaOnDown) {
			this.stoppedInertiaOnDown = false;
			return;
		}

		// A gesture that moved the map is a pan and nothing else. It ends
		// wherever the finger happens to be resting, so reading that as a tap
		// selects, folds, opens or reveals by accident — and a pan that ends on
		// the background would throw away a selection built up before it.
		if (this.panCommitted) return;

		// Touch: synthesize tap
		if (e.pointerType === "touch") {
			if (
				wasDragCandidate &&
				!this.longPressTriggered &&
				dragCandidateId
			) {
				this.handleTouchTap(e, dragCandidateId);
			} else if (!wasDragCandidate) {
				const nodeId = this.getClickedNodeId(e);
				this.handleTouchTap(e, nodeId);
			}
			// Long-press triggered but no drag → already handled in timer (selection mode)
		}
	};

	private handlePointerCancel = (e: PointerEvent): void => {
		this.activePointers.delete(e.pointerId);
		this.cancelLongPress();
		if (this.activePointers.size === 0) {
			this.cleanupAllInteractions();
		}
	};

	private handlePointerLeave = (e: PointerEvent): void => {
		// For mouse: treat like pointerup (finish interactions)
		if (e.pointerType === "mouse") {
			this.activePointers.delete(e.pointerId);
			this.handlePointerUp(e);
		}
		// Touch: pointercancel handles cleanup instead
	};

	// ─── Touch gesture helpers ──────────────────────────────

	/**
	 * A deliberate tap: `handlePointerUp` has already ruled out everything that
	 * merely ended with a finger resting on the map, a pan above all.
	 */
	private handleTouchTap(e: PointerEvent, nodeId: string | null): void {
		// Add link armed: this tap picks the target (a fold toggle still folds,
		// so a target inside a folded branch can be reached). Pans, holds and
		// pinches never get here, so they navigate and leave the mode armed.
		if (this.linkPicker.armed && !(e.target as Element).closest(".osmosis-collapse-toggle")) {
			this.lastTapTime = 0;
			this.pickLinkTarget(nodeId, e.clientX, e.clientY);
			return;
		}
		// A tap on a link follows it, exactly as a click does on desktop.
		//
		// This lives on pointerup rather than in `handleClick` because a touch
		// pointerdown on a node calls `preventDefault()`, which can suppress the
		// click entirely — so the click handler is a reliable place to *cancel*
		// the browser's own navigation but not to perform ours.
		//
		// Study mode is the exception: there a tap on a node is a reveal, and
		// following the link would take the reader off the map mid-session.
		if (this.spatialMode === "off") {
			const link = (e.target as Element).closest("a");
			if (link) {
				this.openNodeLink(link, e);
				return;
			}
		}

		if (!nodeId) {
			this.selectNode(null);
			this.touchSelectionMode = false;
			this.lastTapTime = Date.now();
			this.lastTapPosition = { x: e.clientX, y: e.clientY };
			this.lastTapNodeId = null;
			return;
		}

		// Check collapse toggle
		const target = e.target as Element;
		const toggle = target.closest(".osmosis-collapse-toggle");
		if (toggle) {
			const toggleNodeId = toggle.getAttribute("data-node-id");
			if (toggleNodeId) {
				this.toggleCollapse(toggleNodeId);
			}
			this.lastTapTime = 0; // Reset so next tap isn't treated as double-tap
			return;
		}

		// Spatial study mode: reveal hidden nodes on tap
		if (this.handleSpatialClick(nodeId)) return;

		// In touch selection mode, taps toggle selection (like shift+click)
		if (this.touchSelectionMode) {
			this.toggleNodeInSelection(nodeId);
			this.contentEl.focus();
			// Record for double-tap but don't allow double-tap in selection mode
			this.lastTapTime = 0;
			this.lastTapPosition = { x: e.clientX, y: e.clientY };
			this.lastTapNodeId = null;
			return;
		}

		// Normal tap: select the node
		this.selectNode(nodeId);
		this.syncMapSelectionToEditor(nodeId);
		this.contentEl.focus();

		// Record for double-tap detection
		this.lastTapTime = Date.now();
		this.lastTapPosition = { x: e.clientX, y: e.clientY };
		this.lastTapNodeId = nodeId;
	}

	private initPinch(): void {
		const pointers = Array.from(this.activePointers.values());
		const p1 = pointers[0];
		const p2 = pointers[1];
		if (!p1 || !p2) return;

		this.pinchStartDistance = Math.sqrt(
			(p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2,
		);
		this.pinchStartZoom = this.zoom;
		this.pinchCenter = {
			x: (p1.x + p2.x) / 2,
			y: (p1.y + p2.y) / 2,
		};
		this.pinchStartCenter = { ...this.pinchCenter };
		this.pinchPanActive = false;
	}

	private updatePinch(): void {
		const pointers = Array.from(this.activePointers.values());
		const p1 = pointers[0];
		const p2 = pointers[1];
		if (!p1 || !p2 || this.pinchStartDistance === null) return;

		const currentDistance = Math.sqrt(
			(p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2,
		);

		const ratio = currentDistance / this.pinchStartDistance;
		const newZoom = Math.max(
			MIN_ZOOM,
			Math.min(MAX_ZOOM, this.pinchStartZoom * ratio),
		);

		// Zoom around the pinch center (same math as handleWheel)
		const newCenter = {
			x: (p1.x + p2.x) / 2,
			y: (p1.y + p2.y) / 2,
		};
		const svgPoint = this.screenToSvg(newCenter.x, newCenter.y);
		const scale = this.zoom / newZoom;
		this.viewBox.x = svgPoint.x - (svgPoint.x - this.viewBox.x) * scale;
		this.viewBox.y = svgPoint.y - (svgPoint.y - this.viewBox.y) * scale;
		this.viewBox.w *= scale;
		this.viewBox.h *= scale;
		this.zoom = newZoom;

		// Pan if the pinch centre moved — but only once it has moved enough to
		// mean it. Two fingers closing on a target never travel symmetrically, so
		// an unslopped centroid drags the map sideways through every zoom. The
		// slop is spent once: after it, the pan tracks the centroid frame by
		// frame, so a deliberate two-finger drag still feels 1:1.
		if (!this.pinchPanActive) {
			const dx = newCenter.x - this.pinchStartCenter.x;
			const dy = newCenter.y - this.pinchStartCenter.y;
			this.pinchPanActive = Math.sqrt(dx * dx + dy * dy) >= PINCH_PAN_SLOP;
		}
		if (this.pinchPanActive) {
			const svgOldCenter = this.screenToSvg(
				this.pinchCenter.x,
				this.pinchCenter.y,
			);
			const svgNewCenter = this.screenToSvg(newCenter.x, newCenter.y);
			this.viewBox.x -= svgNewCenter.x - svgOldCenter.x;
			this.viewBox.y -= svgNewCenter.y - svgOldCenter.y;
		}

		this.pinchCenter = newCenter;
		this.recordZoomSample();
		this.updateViewBox();
	}

	// ─── Touch inertia ─────
	//
	// Pan and pinch both coast after the fingers lift, and the pan is held
	// inside the map by a rubber band. The maths lives in
	// `src/mindmap-inertia.ts`; this section is the plumbing.

	/** The viewBox origins a touch pan is held within, in user units. */
	private panBounds(): { x: Range; y: Range } | null {
		if (!this.currentLayout) return null;
		const { width, height } = this.currentLayout.bounds;
		// The sliver that must stay on screen is a screen-space constant, so it
		// converts through the current zoom — the bound feels the same however
		// far in or out the map is.
		const keep = KEEP_VISIBLE_PX / this.zoom;
		return {
			x: clampRange(width + LAYOUT_PADDING * 2, this.viewBox.w, keep),
			y: clampRange(height + LAYOUT_PADDING * 2, this.viewBox.h, keep),
		};
	}

	private recordPanSample(x: number, y: number): void {
		const t = performance.now();
		this.panSamples = pruneSamples(this.panSamples, t);
		this.panSamples.push({ x, y, t });
	}

	private recordZoomSample(): void {
		const t = performance.now();
		this.zoomSamples = pruneSamples(this.zoomSamples, t);
		// ln(zoom), so a decaying velocity is a constant *ratio* per ms: a flick
		// out from 4× has to coast as far as the same flick in from 0.25×.
		this.zoomSamples.push({ x: Math.log(this.zoom), y: 0, t });
	}

	/** Coast a flicked pan — or spring back, if the drag ended past a bound. */
	private startPanInertia(): void {
		const now = performance.now();
		this.panVelocity = launchVelocity(
			estimateVelocity(this.panSamples, now),
			this.carryVelocity,
			now - this.touchDownTime,
		);
		this.panSamples = [];
		this.startInertia();
	}

	/** Coast a flicked pinch, about the centre the fingers left. */
	private startZoomInertia(velocity: number): void {
		this.zoomVelocity = velocity;
		this.zoomAnchor = { ...this.pinchCenter };
		this.zoomSamples = [];
		this.startInertia();
	}

	private startInertia(): void {
		if (this.inertiaRafId !== null) return;
		this.inertiaLastFrame = performance.now();
		this.inertiaRafId = window.requestAnimationFrame(this.stepInertia);
	}

	private stopInertia(): void {
		if (this.inertiaRafId !== null) {
			window.cancelAnimationFrame(this.inertiaRafId);
			this.inertiaRafId = null;
		}
		this.panVelocity = { x: 0, y: 0 };
		this.zoomVelocity = 0;
	}

	private stepInertia = (): void => {
		this.inertiaRafId = null;
		if (!this.svg) return;

		const now = performance.now();
		// A backgrounded view hands back a multi-second frame; capping it keeps
		// the map from teleporting when it resumes.
		const dt = Math.min(now - this.inertiaLastFrame, MAX_FRAME_MS);
		this.inertiaLastFrame = now;

		// Zoom first: it resizes the viewBox, and the pan bounds depend on that.
		const zooming = this.stepZoomInertia(dt);
		const panning = this.stepPanInertia(dt);

		this.updateViewBox();
		if (zooming || panning) {
			this.inertiaRafId = window.requestAnimationFrame(this.stepInertia);
		}
	};

	private stepZoomInertia(dt: number): boolean {
		if (Math.abs(this.zoomVelocity) < ZOOM_MIN_VELOCITY) {
			this.zoomVelocity = 0;
			return false;
		}

		const step = integrateDecay(this.zoomVelocity, ZOOM_FRICTION, dt);
		this.zoomVelocity = step.velocity;
		const newZoom = Math.max(
			MIN_ZOOM,
			Math.min(MAX_ZOOM, this.zoom * Math.exp(step.delta)),
		);
		if (newZoom === this.zoom) {
			// Pinned against a zoom limit — nothing left to coast into.
			this.zoomVelocity = 0;
			return false;
		}

		// Same anchored-scale maths as updatePinch, about the centre the fingers
		// left behind rather than a live one.
		const svgPoint = this.screenToSvg(this.zoomAnchor.x, this.zoomAnchor.y);
		const scale = this.zoom / newZoom;
		this.viewBox.x = svgPoint.x - (svgPoint.x - this.viewBox.x) * scale;
		this.viewBox.y = svgPoint.y - (svgPoint.y - this.viewBox.y) * scale;
		this.viewBox.w *= scale;
		this.viewBox.h *= scale;
		this.zoom = newZoom;
		return true;
	}

	private stepPanInertia(dt: number): boolean {
		const bounds = this.panBounds();
		const x = this.stepPanAxis(this.viewBox.x, this.panVelocity.x, bounds?.x, dt);
		const y = this.stepPanAxis(this.viewBox.y, this.panVelocity.y, bounds?.y, dt);
		this.viewBox.x = x.value;
		this.viewBox.y = y.value;
		this.panVelocity = { x: x.velocity, y: y.velocity };
		return x.moving || y.moving;
	}

	private stepPanAxis(
		value: number,
		velocity: number,
		range: Range | undefined,
		dt: number,
	): { value: number; velocity: number; moving: boolean } {
		const target = range ? springTarget(value, range) : value;
		if (target !== value) {
			// Out of bounds: the spring owns this axis, whatever the flick wanted.
			const next = springStep(value, target, dt);
			if (Math.abs(target - next) * this.zoom < SPRING_EPSILON_PX) {
				return { value: target, velocity: 0, moving: false };
			}
			return { value: next, velocity: 0, moving: true };
		}

		if (Math.abs(velocity) < PAN_MIN_VELOCITY) {
			return { value, velocity: 0, moving: false };
		}
		const step = integrateDecay(velocity, PAN_FRICTION, dt);
		// Velocity is finger px/ms; the viewBox travels the opposite way, in
		// user units.
		return {
			value: value - step.delta / this.zoom,
			velocity: step.velocity,
			moving: true,
		};
	}

	/**
	 * Block touch events from propagating to Obsidian's gesture handlers.
	 * This prevents drawer swipes and command palette pull-down on mobile.
	 */
	private handleTouchCapture = (e: TouchEvent): void => {
		e.stopPropagation();
	};

	/**
	 * Handle container resize (e.g. mobile keyboard opening/closing).
	 * Adjusts viewBox dimensions to match new container size while keeping
	 * the center point stable.
	 */
	private handleContainerResize(): void {
		if (!this.svg) return;
		// Skip resize while editing — virtual keyboard opening/closing would
		// shift the viewBox and cause the map to jump away from the edit node.
		if (this.editingNodeId) return;

		const rect = this.contentEl.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;

		// Compute new viewBox dimensions at current zoom level
		const newW = rect.width / this.zoom;
		const newH = rect.height / this.zoom;

		// Keep the center point stable
		const cx = this.viewBox.x + this.viewBox.w / 2;
		const cy = this.viewBox.y + this.viewBox.h / 2;
		this.viewBox.x = cx - newW / 2;
		this.viewBox.y = cy - newH / 2;
		this.viewBox.w = newW;
		this.viewBox.h = newH;

		this.updateViewBox();
	}

	private cancelLongPress(): void {
		if (this.longPressTimer !== null) {
			window.clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}
	}

	private cleanupAllInteractions(): void {
		this.cancelLongPress();
		this.stopInertia();
		this.panRaw = null;
		this.pinchTail = null;
		this.pinchTailZoomVelocity = 0;
		this.isPanning = false;
		this.panPending = false;
		this.panCommitted = false;
		this.contextPress = null;
		this.carryVelocity = { x: 0, y: 0 };
		this.isRubberBanding = false;
		this.dragNodeId = null;
		this.pinchStartDistance = null;
		this.longPressTriggered = false;
		this.touchSelectionMode = false;
		if (this.isDragging) {
			this.cleanupDrag();
		}
		if (this.rubberBandRect) {
			this.rubberBandRect.remove();
			this.rubberBandRect = null;
		}
	}

	private handleWheel = (e: WheelEvent): void => {
		e.preventDefault();
		this.stopInertia();

		if (e.ctrlKey || e.metaKey) {
			// Ctrl+Scroll: zoom in/out
			const svgPoint = this.screenToSvg(e.clientX, e.clientY);
			const delta = e.deltaY * ZOOM_SENSITIVITY;
			const newZoom = Math.max(
				MIN_ZOOM,
				Math.min(MAX_ZOOM, this.zoom * (1 - delta)),
			);

			const scale = this.zoom / newZoom;
			this.viewBox.x = svgPoint.x - (svgPoint.x - this.viewBox.x) * scale;
			this.viewBox.y = svgPoint.y - (svgPoint.y - this.viewBox.y) * scale;
			this.viewBox.w *= scale;
			this.viewBox.h *= scale;
			this.zoom = newZoom;
		} else {
			// Scroll/trackpad: pan in both axes (supports diagonal gestures)
			// Shift+scroll with a mouse wheel: treat deltaY as horizontal
			const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
			const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
			this.viewBox.x += (dx * SCROLL_SENSITIVITY) / this.zoom;
			this.viewBox.y += (dy * SCROLL_SENSITIVITY) / this.zoom;
		}

		this.updateViewBox();
	};

	private getClickedNodeId(e: { target: EventTarget | null }): string | null {
		const target = e.target as Element;
		const group = target.closest(".osmosis-node-group");
		return group?.getAttribute("data-node-id") ?? null;
	}

	/** The note a node's text lives in — the embedded note for a transcluded node. */
	private nodeFile(node: OsmosisNode): TFile | null {
		return node.sourceFile
			? this.app.vault.getFileByPath(node.sourceFile)
			: this.currentFile;
	}

	/**
	 * Follow a link inside a node.
	 *
	 * Shared by both input paths. Cancelling the anchor's default action is only
	 * half the job — without this the link would simply do nothing, which is
	 * what the touch path did after the navigation fix.
	 *
	 * A link to a note stays in the mind map: a plain click opens the target's
	 * map in this tab, Mod-click in a new tab, and either centers on the linked
	 * heading or block. Mod+Alt-click opens the note in Note View in a new tab;
	 * non-Markdown and unresolved targets go to Obsidian as before.
	 */
	private openNodeLink(anchor: Element, e: MouseEvent): void {
		const href = anchor.getAttribute("href");
		if (!href) return;
		if (!anchor.classList.contains("internal-link")) {
			window.open(href);
			return;
		}
		const linktext = anchor.getAttribute("data-href") ?? href;
		const nodeId = anchor.closest(".osmosis-node-group")?.getAttribute("data-node-id");
		const layoutNode = nodeId ? this.nodeMap.get(nodeId) : undefined;
		const source = layoutNode ? this.nodeFile(layoutNode.source) : this.currentFile;
		const sourcePath = source?.path ?? "";

		const mod = Platform.isMacOS ? e.metaKey : e.ctrlKey;
		if (mod && e.altKey) {
			void this.app.workspace.openLinkText(linktext, sourcePath, "tab");
			return;
		}

		const { path, subpath } = parseLinktext(linktext);
		const file = path
			? this.app.metadataCache.getFirstLinkpathDest(path, sourcePath)
			: source;
		if (!file || file.extension !== "md") {
			void this.app.workspace.openLinkText(linktext, sourcePath, mod ? "tab" : false);
			return;
		}

		const leaf = mod ? this.app.workspace.getLeaf("tab") : this.leaf;
		// Following a link pins the map to its target, or it would snap back to
		// the paired note on the next click there. A jump within the open note
		// leaves the pin as it was.
		const pinned = leaf !== this.leaf || file !== this.currentFile || this.isPinned;
		void leaf.setViewState(
			{
				type: VIEW_TYPE_MINDMAP,
				state: { file: file.path, pinned, linkJump: true },
				active: true,
			},
			{ subpath },
		);
	}

	private handleClick = (e: MouseEvent): void => {
		if (this.lastPointerType === "touch") {
			// A touch tap is handled in `handleTouchTap` on pointerup, but the
			// browser still dispatches this click afterwards — and with it the
			// default navigation of any <a> under the finger. The mouse branch
			// below has always cancelled that; this path never did, so on a
			// phone the anchor's default action survived and the WebView could
			// navigate away from the app document, taking the plugin with it.
			//
			// It bites hardest on a node whose entire content is a bare link
			// (`- [Django](Django.md)`), where the anchor fills the node and a
			// tap can hardly miss it — and in study mode, where tapping the node
			// *is* the interaction.
			if ((e.target as Element).closest("a")) {
				e.preventDefault();
				e.stopPropagation();
			}
			return;
		}
		// `isPanning` is already false by the time a click is dispatched, since
		// pointerup clears it first; `panCommitted` survives until the next
		// press, and is what actually catches a drag that panned. Otherwise a
		// mouse drag beginning and ending inside one node would select, fold or
		// reveal it, and one on the background would clear the selection.
		if (this.isPanning || this.isDragging || this.panCommitted) return;

		// Check if clicking a collapse toggle
		const target = e.target as Element;
		const toggle = target.closest(".osmosis-collapse-toggle");
		if (toggle) {
			const nodeId = toggle.getAttribute("data-node-id");
			if (nodeId) {
				this.toggleCollapse(nodeId);
			}
			return;
		}

		// Add link armed: the click picks the target, even on a link in the node.
		if (this.linkPicker.armed) {
			e.preventDefault();
			e.stopPropagation();
			this.pickLinkTarget(this.getClickedNodeId(e), e.clientX, e.clientY);
			return;
		}

		// Check if clicking a link inside a node
		const anchor = target.closest("a");
		if (anchor) {
			e.preventDefault();
			e.stopPropagation();
			this.openNodeLink(anchor, e);
			return;
		}

		// Check if clicking a node
		const nodeId = this.getClickedNodeId(e);
		if (nodeId) {
			// Spatial study mode: reveal hidden nodes on click
			if (this.handleSpatialClick(nodeId)) return;

			if (e.shiftKey) {
				this.toggleNodeInSelection(nodeId);
			} else {
				this.selectNode(nodeId);
				this.syncMapSelectionToEditor(nodeId);
			}
			this.contentEl.focus();
		} else {
			if (!e.shiftKey) {
				this.selectNode(null);
			}
		}
	};

	private handleDblClick = (e: MouseEvent): void => {
		if (this.lastPointerType === "touch") return;
		if ((e.target as Element).closest("a")) return;
		const nodeId = this.getClickedNodeId(e);
		if (nodeId) {
			void this.startEditing(nodeId);
		}
	};

	private handleContextMenu = (e: MouseEvent): void => {
		if (this.editingNodeId) return;

		e.preventDefault();

		// A right-click opens its menu on release (`handlePointerUp`), so the
		// press it began, or the release that already did, is not asked twice.
		// This path is for a menu key, or macOS Ctrl+click, which have no
		// right-button press of their own.
		if (this.contextPress !== null) return;
		if (performance.now() - this.contextOpenedAt < 250) return;

		// A long press on a phone arrives here as a context-menu event, and the
		// menu it opened swallowed the press on its way to becoming a node
		// drag — the hold is the only way to move a node with a finger. Touch
		// reaches the same menu through the ribbon's "More actions" button.
		if (this.lastPointerType === "touch") return;

		this.showNodeMenu(this.getClickedNodeId(e), (menu) =>
			menu.showAtMouseEvent(e),
		);
	};

	/**
	 * Build the node menu (or the background menu, when `nodeId` is null) and
	 * hand it to `show`, which anchors it: at the pointer for a right-click, at
	 * the button for the ribbon.
	 */
	private showNodeMenu(
		nodeId: string | null,
		show: (menu: Menu) => void,
	): void {
		// If acting on a node that isn't selected, select it first
		if (nodeId && nodeId !== this.selectedNodeId) {
			this.selectNode(nodeId);
		}

		const menu = new Menu();

		if (nodeId) {
			const node = this.nodeMap.get(nodeId);
			// Reading mode keeps navigation, fold, copy, and study items —
			// structural, clipboard-mutating, style, and delete items go.
			if (!this.isReadingMode) {
				// ── Structure ──
				menu.addItem((item) =>
					item.setTitle("Add child").setIcon("arrow-right-from-line")
						.onClick(() => { if (node) void this.addChildNode(node); }),
				);
				menu.addItem((item) =>
					item.setTitle("Add sibling").setIcon("arrow-down-from-line")
						.onClick(() => { if (node) void this.addSiblingNode(node); }),
				);
				menu.addItem((item) =>
					item.setTitle("Insert parent").setIcon("arrow-right-to-line")
						.onClick(() => { if (node) void this.insertParentNode(node); }),
				);
				if (node && node.source.type !== "root" && canConvertBranch(node.source)) {
					menu.addItem((item) =>
						item.setTitle("Convert branch to note").setIcon("file-output")
							.onClick(() => void this.convertBranch(node)),
					);
				}
				menu.addSeparator();
			}

			// ── Clipboard ──
			if (!this.isReadingMode) {
				menu.addItem((item) =>
					item.setTitle("Cut").setIcon("scissors")
						.onClick(() => void this.copySelectedNodes(true)),
				);
			}
			menu.addItem((item) =>
				item.setTitle("Copy").setIcon("copy")
					.onClick(() => void this.copySelectedNodes(false)),
			);
			if (!this.isReadingMode) {
				menu.addItem((item) =>
					item.setTitle("Paste").setIcon("clipboard-paste")
						.onClick(() => void this.pasteNodes()),
				);
			}
			menu.addSeparator();

			// ── Style ──
			if (!this.isReadingMode) {
				menu.addItem((item) =>
					item.setTitle("Copy style").setIcon("pipette")
						.onClick(() => this.copyNodeStyle()),
				);
				menu.addItem((item) =>
					item.setTitle("Paste style").setIcon("paint-bucket")
						.onClick(() => void this.pasteNodeStyle()),
				);
				menu.addSeparator();
			}

			// ── Fold ──
			menu.addItem((item) =>
				item.setTitle("Collapse all").setIcon("chevrons-down-up")
					.onClick(() => this.foldAll()),
			);
			menu.addItem((item) =>
				item.setTitle("Expand all").setIcon("chevrons-up-down")
					.onClick(() => this.unfoldAll()),
			);
			menu.addSeparator();

			// ── Study ──
			menu.addItem((item) =>
				item.setTitle("Study this branch").setIcon("graduation-cap")
					.onClick(() => { if (node) this.enterSpatialStudy(node); }),
			);

			// ── Line card (add / remove / exclude) ──
			if (node) this.addNodeCardMenuItems(menu, node);
			// ── Delete ──
			if (!this.isReadingMode) {
				menu.addSeparator();
				menu.addItem((item) =>
					item.setTitle("Delete").setIcon("trash-2")
						.setWarning(true)
						.onClick(() => {
							if (this.selectedNodeIds.size > 1) {
								void this.deleteSelectedNodes();
							} else if (node) {
								void this.deleteNode(node);
							}
						}),
				);
			}
		} else {
			// ── Canvas (no node) context menu ──
			menu.addItem((item) =>
				item.setTitle("Fit to view").setIcon("maximize")
					.onClick(() => this.fitToView()),
			);
			menu.addItem((item) =>
				item.setTitle("Center on root").setIcon("home")
					.onClick(() => this.centerOnRoot()),
			);
			menu.addSeparator();

			if (!this.isReadingMode) {
				menu.addItem((item) =>
					item.setTitle("Paste").setIcon("clipboard-paste")
						.onClick(() => void this.pasteNodes()),
				);
				menu.addSeparator();
			}

			menu.addItem((item) =>
				item.setTitle("Collapse all").setIcon("chevrons-down-up")
					.onClick(() => this.foldAll()),
			);
			menu.addItem((item) =>
				item.setTitle("Expand all").setIcon("chevrons-up-down")
					.onClick(() => this.unfoldAll()),
			);
			menu.addSeparator();

			menu.addItem((item) =>
				item.setTitle("Refresh mind map").setIcon("refresh-cw")
					.onClick(() => {
						if (this.currentFile) {
							this.nodeSizeCache.clear();
							this.nodeHtmlCache.clear();
							void this.loadFile(this.currentFile);
						}
					}),
			);
			menu.addItem((item) =>
				item.setTitle("Map properties").setIcon("paintbrush")
					.onClick(() => void this.plugin.activatePropertiesSidebar()),
			);
		}

		show(menu);
	}

	// ─── Collapse ────────────────────────────────────────────

	private toggleCollapse(nodeId: string): void {
		if (this.collapsedIds.has(nodeId)) {
			this.collapsedIds.delete(nodeId);

			// Lazy loading: if this is a deferred transclusion, expand it now
			if (this.lazyTransclusionIds.has(nodeId)) {
				this.lazyTransclusionIds.delete(nodeId);
				void this.expandLazyTransclusion(nodeId);
				return;
			}
		} else {
			this.collapsedIds.add(nodeId);
		}
		void this.renderAnimated();
	}

	/**
	 * Expand a single lazy transclusion node on demand.
	 * Finds the node in the tree, parses and splices its content, then re-renders.
	 */
	private async expandLazyTransclusion(nodeId: string): Promise<void> {
		if (!this.currentTree || !this.currentFile) return;

		const { parent, node } =
			this.findNodeWithParent(this.currentTree.root, nodeId) ?? {};
		if (!parent || !node || node.type !== "transclusion") return;

		await this.transclusionResolver.expandSingleNode(
			parent,
			node,
			node.sourceFile ? this.currentFile.path : this.currentFile.path,
		);

		await this.renderAnimated();
	}

	/** Walk the tree to find a node and its parent by ID. */
	private findNodeWithParent(
		current: OsmosisNode,
		targetId: string,
	): { parent: OsmosisNode; node: OsmosisNode } | null {
		for (const child of current.children) {
			if (child.id === targetId) return { parent: current, node: child };
			const found = this.findNodeWithParent(child, targetId);
			if (found) return found;
		}
		return null;
	}

	/** Collect IDs of all transclusion nodes in the tree. */
	private collectTransclusionIds(node: OsmosisNode, ids: Set<string>): void {
		if (node.type === "transclusion") {
			ids.add(node.id);
		}
		for (const child of node.children) {
			this.collectTransclusionIds(child, ids);
		}
	}

	private async renderAnimated(): Promise<void> {
		if (!this.svg) {
			await this.render();
			return;
		}

		// Capture old positions for animation
		const oldPositions = new Map<string, { x: number; y: number }>();
		if (this.currentLayout) {
			for (const node of this.currentLayout.nodes) {
				if (node.source.type === "root") continue;
				oldPositions.set(node.source.id, {
					x: node.rect.x,
					y: node.rect.y,
				});
			}
		}

		// Re-render with new collapse state
		await this.render();

		if (!this.svg || !this.currentLayout) return;

		// Add animation class to SVG for CSS-driven transition
		if (this.svg) {
			this.svg.addClass("osmosis-animating");
			window.setTimeout(() => {
				this.svg?.removeClass("osmosis-animating");
			}, COLLAPSE_ANIMATION_MS);
		}
	}

	// ─── Selection ───────────────────────────────────────────

	/**
	 * Set a single node as selected, clearing any multi-selection.
	 */
	private selectNode(nodeId: string | null): void {
		this.clearSelectionVisuals();
		this.selectedNodeIds.clear();
		this.selectedNodeId = nodeId;

		if (nodeId) {
			this.selectedNodeIds.add(nodeId);
		}

		// Clear cursor-sync highlight so it doesn't conflict with selection
		this.setCursorSyncHighlight(null);

		this.applySelectionVisuals();
	}

	/**
	 * Toggle a node in the multi-selection (Shift+click).
	 */
	private toggleNodeInSelection(nodeId: string): void {
		this.clearSelectionVisuals();
		if (this.selectedNodeIds.has(nodeId)) {
			this.selectedNodeIds.delete(nodeId);
			if (this.selectedNodeId === nodeId) {
				// Move primary selection to another selected node or null
				const next = this.selectedNodeIds.values().next();
				this.selectedNodeId = next.done ? null : next.value;
			}
		} else {
			this.selectedNodeIds.add(nodeId);
			this.selectedNodeId = nodeId;
		}
		this.applySelectionVisuals();
	}

	/**
	 * Select multiple nodes at once (e.g., from rubber-band).
	 */
	private selectNodes(nodeIds: Set<string>): void {
		this.clearSelectionVisuals();
		this.selectedNodeIds = new Set(nodeIds);
		const first = nodeIds.values().next();
		this.selectedNodeId = first.done ? null : first.value;
		this.applySelectionVisuals();
	}

	private clearSelectionVisuals(): void {
		if (!this.svg) return;
		for (const id of this.selectedNodeIds) {
			const el = this.svg.querySelector(`[data-node-id="${id}"]`);
			el?.classList.remove("osmosis-node-selected");
		}
	}

	private applySelectionVisuals(): void {
		if (!this.svg) return;
		for (const id of this.selectedNodeIds) {
			const el = this.svg.querySelector(`[data-node-id="${id}"]`);
			el?.classList.add("osmosis-node-selected");
		}
		this.updateToolbarState();
		this.notifySelectionChange();
	}

	// ─── Rubber-Band Selection ───────────────────────────────

	private updateRubberBand(e: MouseEvent): void {
		if (!this.svg) return;
		const svgPt = this.screenToSvg(e.clientX, e.clientY);

		// Create rect on first move
		if (!this.rubberBandRect) {
			const rect = document.createElementNS(SVG_NS, "rect");
			rect.setAttribute("class", "osmosis-rubber-band");
			this.svg.appendChild(rect);
			this.rubberBandRect = rect;
		}

		const x = Math.min(this.rubberBandStart.x, svgPt.x);
		const y = Math.min(this.rubberBandStart.y, svgPt.y);
		const w = Math.abs(svgPt.x - this.rubberBandStart.x);
		const h = Math.abs(svgPt.y - this.rubberBandStart.y);

		this.rubberBandRect.setAttribute("x", String(x));
		this.rubberBandRect.setAttribute("y", String(y));
		this.rubberBandRect.setAttribute("width", String(w));
		this.rubberBandRect.setAttribute("height", String(h));
	}

	private finishRubberBand(): void {
		this.isRubberBanding = false;

		if (!this.rubberBandRect || !this.svg) {
			this.rubberBandRect?.remove();
			this.rubberBandRect = null;
			return;
		}

		const rx = parseFloat(this.rubberBandRect.getAttribute("x") ?? "0");
		const ry = parseFloat(this.rubberBandRect.getAttribute("y") ?? "0");
		const rw = parseFloat(this.rubberBandRect.getAttribute("width") ?? "0");
		const rh = parseFloat(
			this.rubberBandRect.getAttribute("height") ?? "0",
		);

		this.rubberBandRect.remove();
		this.rubberBandRect = null;

		if (rw < 3 && rh < 3) return; // Too small, ignore

		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const selected = new Set<string>();

		for (const [id, node] of this.nodeMap) {
			const nx = node.rect.x + offsetX;
			const ny = node.rect.y + offsetY;
			const nw = node.rect.width;
			const nh = node.rect.height;

			// Check if node overlaps with rubber-band rect
			if (nx + nw > rx && nx < rx + rw && ny + nh > ry && ny < ry + rh) {
				selected.add(id);
			}
		}

		if (selected.size > 0) {
			this.selectNodes(selected);
		}
	}

	// ─── Bulk Operations ────────────────────────────────────

	/**
	 * Delete all selected nodes from the markdown.
	 * Processes nodes from end-of-document to start to preserve offsets.
	 */
	private async deleteSelectedNodes(): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		if (!this.currentFile || this.selectedNodeIds.size === 0) return;

		// Collect the selected nodes, then their ranges (descending, to process
		// from end so earlier offsets stay valid).
		const selectedSrcs: OsmosisNode[] = [];
		let tree: OsmosisNode | null = null;
		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;
			selectedSrcs.push(node.source);
			if (tree === null) tree = this.treeRootOf(node);
		}
		if (selectedSrcs.length === 0 || tree === null) return;
		// What to select afterwards: the previous sibling of the first deleted
		// node in document order, else its parent.
		const afterId = selectAfterDelete(tree, selectedSrcs.map((src) => src.id));

		// A mixed host+embedded selection is allowed (design decision O4): each
		// file gets its own splice, and the whole thing is one undo step. Ranges
		// only make sense against their own file's bytes, so group before
		// splicing rather than refusing the selection.
		const fileOf = this.containingFileOf();
		if (!fileOf) return;
		const byPath = new Map<string, OsmosisNode[]>();
		for (const src of selectedSrcs) {
			const path = fileOf(src);
			const group = byPath.get(path);
			if (group) group.push(src);
			else byPath.set(path, [src]);
		}

		this.selectedNodeIds.clear();
		this.selectedNodeId = null;

		this.beginEditGroup();
		try {
			for (const [path, nodes] of byPath) {
				const file = this.fileAtPath(path);
				if (!file) continue;

				// Descending order so each splice leaves the earlier offsets valid.
				const ranges = nodes
					.map((src) => ({
						start: src.range.start,
						end: this.subtreeEnd(src),
					}))
					.sort((a, b) => b.start - a.start);

				let content = await this.app.vault.read(file);
				for (const range of ranges) {
					let deleteStart = range.start;
					let deleteEnd = range.end;

					if (deleteStart > 0 && content[deleteStart - 1] === "\n") {
						deleteStart--;
					} else if (
						deleteEnd < content.length &&
						content[deleteEnd] === "\n"
					) {
						deleteEnd++;
					}

					content = content.slice(0, deleteStart) + content.slice(deleteEnd);
				}
				await this.writeFileTracked(file, content);
			}
		} finally {
			this.endEditGroup();
			await this.resyncFromParent();
		}
		// Select the previous sibling or the parent, else the first node (the
		// root can't be selected) — without panning to it: deleting must leave
		// the viewport where the user had it.
		this.selectNodeAfterDelete(afterId);
	}

	/** The parse-tree root above `node`: what `selectAfterDelete` walks. */
	private treeRootOf(node: LayoutNode): OsmosisNode {
		let top = node;
		while (top.parent) top = top.parent;
		return top.source;
	}

	/**
	 * Select `afterId`, the node `selectAfterDelete` chose, once the
	 * delete has re-rendered; if it is null (a top-level node with nothing
	 * before it) or gone, the first node. Never pans.
	 */
	private selectNodeAfterDelete(afterId: string | null): void {
		const id = afterId !== null && this.nodeMap.has(afterId)
			? afterId
			: this.currentLayout?.nodes.find((n) => n.source.type !== "root")?.source.id;
		if (id) this.selectNode(id);
	}

	/**
	 * Move selected node(s) up or down among siblings.
	 * direction: -1 = up, 1 = down.
	 */
	private async moveNodeUpDown(direction: number): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		if (!this.currentFile || !this.selectedNodeId) return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const parentSrc = node.parent.source;
		const siblings = parentSrc.children;

		// Collect selected sibling indices, sorted by position
		const selectedIndices = this.getSelectedSiblingIndices(siblings);
		if (selectedIndices.length === 0) return;

		// Find the swap target (the sibling adjacent to the selected block)
		const swapIdx =
			direction < 0
				? selectedIndices[0]! + direction
				: selectedIndices[selectedIndices.length - 1]! + direction;
		if (swapIdx < 0 || swapIdx >= siblings.length) return;

		const swapSrc = siblings[swapIdx];
		if (!swapSrc) return;

		// Collect all selected subtree texts in order
		const selectedSrcs = selectedIndices.map((i) => siblings[i]!);
		// The selection is spliced out of one file; a selection that itself spans
		// the seam has no single origin. (The *neighbor* may now live elsewhere.)
		if (!this.ensureSameFileEdit(selectedSrcs)) return;

		const fileOf = this.containingFileOf();
		if (!fileOf) return;
		const originPath = fileOf(selectedSrcs[0]!);
		const swapPath = fileOf(swapSrc);
		const movedContents = selectedSrcs.map((s) => s.content);

		if (swapPath !== originPath) {
			// At a seam the swap degrades to a move-past: the selection relocates
			// into the neighbor's note and the neighbor stays put. A true swap
			// would drag the neighbor across the boundary as well — two moves in
			// opposite directions from one keypress, one of them pulling a line
			// out of a note the user never selected.
			//
			// The destination is the neighbor's own file, so the offsets are its
			// own coordinates (`range.start` / `subtreeEnd`) — never the
			// host-folded `nodeHostStart` / `subtreeHostEnd`, which would answer
			// in the file that *contains* the embed instead.
			const site: edit.InsertSite = {
				path: swapPath,
				offset:
					direction < 0 ? swapSrc.range.start : this.subtreeEnd(swapSrc),
				neighbor: swapSrc,
			};
			const moved = await this.moveAcrossFiles(
				selectedSrcs,
				site,
				originPath,
				() => ({ type: swapSrc.type, depth: swapSrc.depth }),
			);
			if (moved) this.reselectMultiAfterMove(movedContents);
			return;
		}

		const file = this.fileAtPath(originPath);
		if (!file) return;
		const content = await this.app.vault.read(file);
		const updated = edit.moveSiblings(content, selectedSrcs, swapSrc).text;

		await this.writeFileAtPath(originPath, updated);

		// Re-select all moved nodes
		this.reselectMultiAfterMove(movedContents);
	}

	/** Pre-order position of every node in the current tree (its rendered order). */
	private treeOrderIndex(): Map<string, number> {
		const order = new Map<string, number>();
		if (!this.currentTree) return order;
		let next = 0;
		const walk = (n: OsmosisNode): void => {
			order.set(n.id, next++);
			for (const child of n.children) walk(child);
		};
		walk(this.currentTree.root);
		return order;
	}

	/**
	 * Get sorted indices of selected nodes among a sibling list.
	 */
	private getSelectedSiblingIndices(siblings: OsmosisNode[]): number[] {
		const indices: number[] = [];
		for (let i = 0; i < siblings.length; i++) {
			const sib = siblings[i];
			if (sib && this.selectedNodeIds.has(sib.id)) {
				indices.push(i);
			}
		}
		return indices.sort((a, b) => a - b);
	}

	/**
	 * After a move operation, re-select moved nodes by content match.
	 */
	private reselectMultiAfterMove(contents: string[]): void {
		const contentSet = new Set(contents);
		const matchedIds: string[] = [];
		for (const [id, layoutNode] of this.nodeMap) {
			if (contentSet.has(layoutNode.source.content)) {
				matchedIds.push(id);
				contentSet.delete(layoutNode.source.content);
			}
		}
		if (matchedIds.length > 0) {
			this.clearSelectionVisuals();
			this.selectedNodeIds = new Set(matchedIds);
			this.selectedNodeId = matchedIds[matchedIds.length - 1] ?? null;
			this.applySelectionVisuals();
			this.scrollToSelectedNode();
		}
	}

	/**
	 * Indent node(s): reparent under previous sibling (Alt+Right).
	 * Supports multi-select: all selected siblings become children of the previous sibling.
	 */
	private async indentNode(): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		if (!this.currentFile || !this.selectedNodeId) return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const parentSrc = node.parent.source;
		const siblings = parentSrc.children;
		const selectedIndices = this.getSelectedSiblingIndices(siblings);
		if (selectedIndices.length === 0) return;

		const firstIdx = selectedIndices[0]!;
		if (firstIdx <= 0) return;

		const prevSibling = siblings[firstIdx - 1];
		if (!prevSibling) return;

		const firstSrc = siblings[firstIdx]!;
		const selectedSrcs = selectedIndices.map((i) => siblings[i]!);
		if (!this.ensureSameFileEdit(selectedSrcs)) return;

		const fileOf = this.containingFileOf();
		if (!fileOf) return;
		const originPath = fileOf(firstSrc);
		const movedContents = selectedSrcs.map((s) => s.content);
		const indentContext = (nodeSrc: OsmosisNode): {
			type: OsmosisNode["type"];
			depth: number;
		} => ({
			type: this.inferIndentType(prevSibling, nodeSrc),
			depth: this.inferIndentDepth(prevSibling, nodeSrc),
		});

		if (fileOf(prevSibling) !== originPath) {
			// Indenting under a sibling that lives in another note — the last
			// expanded child of an embed — moves the block into that note,
			// appended after the sibling's subtree. No neighbor is needed: the
			// site is "child of prevSibling", and inferIndentDepth already reads
			// the destination's coordinates off prevSibling itself (its own
			// source depth + 1), not off the host.
			const site: edit.InsertSite = {
				path: fileOf(prevSibling),
				offset: this.subtreeEnd(prevSibling),
			};
			const moved = await this.moveAcrossFiles(
				selectedSrcs,
				site,
				originPath,
				indentContext,
			);
			if (moved) this.reselectMultiAfterMove(movedContents);
			return;
		}

		const file = this.fileAtPath(originPath);
		if (!file) return;
		const content = await this.app.vault.read(file);

		const updated = edit.indentSiblings(content, selectedSrcs, prevSibling).text;

		await this.writeFileAtPath(originPath, updated);
		this.reselectMultiAfterMove(movedContents);
	}

	/**
	 * Outdent node(s): promote to parent's level (Alt+Left).
	 * Supports multi-select: all selected siblings promote together.
	 */
	private async outdentNode(): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		if (!this.currentFile || !this.selectedNodeId) return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const parentNode = node.parent;

		// Special case: outdenting a direct child of root promotes in-place
		// list item → paragraph → heading
		if (parentNode.source.type === "root") {
			const siblings = parentNode.source.children;
			const selectedIndices = this.getSelectedSiblingIndices(siblings);
			if (selectedIndices.length === 0) return;

			const firstSrc = siblings[selectedIndices[0]!]!;
			const file = this.getNodeFile(firstSrc);
			if (!file) return;

			const content = await this.app.vault.read(file);
			const promoted = edit.outdentSiblings(
				content,
				parentNode.source,
				selectedIndices.map((i) => siblings[i]!),
			);
			if (!promoted) return; // headings and other types can't promote further at root
			const updated = promoted.text;

			const movedContents = selectedIndices.map((i) => siblings[i]!.content);
			await this.writeNodeFile(firstSrc, updated);
			this.reselectMultiAfterMove(movedContents);
			return;
		}

		const grandparent = parentNode.parent;
		if (!grandparent) return;

		const siblings = parentNode.source.children;
		const selectedIndices = this.getSelectedSiblingIndices(siblings);
		if (selectedIndices.length === 0) return;

		const firstSrc = siblings[selectedIndices[0]!]!;
		const parentSrc = parentNode.source;
		const selectedSrcs = selectedIndices.map((i) => siblings[i]!);
		if (!this.ensureSameFileEdit(selectedSrcs)) return;

		const fileOf = this.containingFileOf();
		if (!fileOf) return;
		const originPath = fileOf(firstSrc);
		const movedContents = selectedSrcs.map((s) => s.content);
		const context = (nodeSrc: OsmosisNode): {
			type: OsmosisNode["type"];
			depth: number;
		} => this.outdentContext(nodeSrc, parentSrc);

		if (fileOf(parentSrc) !== originPath) {
			// A top-level expanded child's tree parent is the local node that held
			// the `![[…]]`, so outdenting is a true move out of the source note and
			// into the host, just past that parent's subtree. The offset is in the
			// parent's *own* file — `subtreeEnd`, which already folds any embed the
			// parent contains back to that file's `![[…]]` line.
			const site: edit.InsertSite = {
				path: fileOf(parentSrc),
				offset: this.subtreeEnd(parentSrc),
			};
			const moved = await this.moveAcrossFiles(
				selectedSrcs,
				site,
				originPath,
				context,
			);
			if (moved) this.reselectMultiAfterMove(movedContents);
			return;
		}

		const file = this.fileAtPath(originPath);
		if (!file) return;

		const content = await this.app.vault.read(file);
		const updated = edit.outdentSiblings(content, parentSrc, selectedSrcs)!.text;

		await this.writeFileAtPath(originPath, updated);
		this.reselectMultiAfterMove(movedContents);
	}

	/**
	 * Type and depth a node takes on when outdented to become its parent's
	 * sibling. Shared by the same-file splice and the cross-file move so a node
	 * promoted *out* of an embed lands at the level it would have landed at had
	 * both lines lived in one file.
	 */
	private outdentContext(
		nodeSrc: OsmosisNode,
		parentSrc: OsmosisNode,
	): { type: OsmosisNode["type"]; depth: number } {
		return edit.outdentContext(nodeSrc, parentSrc);
	}

	/**
	 * Copy (or cut) selected node subtrees to the internal clipboard.
	 */
	private async copySelectedNodes(isCut: boolean): Promise<void> {
		// Only a cut is a mutation, so only a cut is gated on reading mode — but
		// both slice the file by the tree's ranges, so both need those ranges to
		// match the bytes on disk. A plain copy against stale offsets picks up
		// text shifted by however much the frontmatter grew.
		if (isCut) {
			if (!await this.assertEditableFresh()) return;
		} else {
			await this.ensureTreeFresh();
		}
		if (!this.currentFile || !this.selectedNodeId) return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		const fileOf = this.containingFileOf();
		if (!fileOf) return;

		// Copying is read-only, so a mixed host+embedded selection just means
		// reading more than one file. Order by the map's own document order —
		// within a file that is document order, and across the seam it is the
		// order the lines are rendered in.
		const order = this.treeOrderIndex();
		const selected = [...this.selectedNodeIds]
			.map((id) => this.nodeMap.get(id))
			.filter((n): n is LayoutNode => n !== undefined)
			.sort(
				(a, b) =>
					(order.get(a.source.id) ?? 0) - (order.get(b.source.id) ?? 0),
			);

		const contents = new Map<string, string>();
		const items: ClipboardItem[] = [];
		for (const sel of selected) {
			const path = fileOf(sel.source);
			let content = contents.get(path);
			if (content === undefined) {
				const file = this.fileAtPath(path);
				if (!file) continue;
				content = await this.app.vault.read(file);
				contents.set(path, content);
			}
			const start = sel.source.range.start;
			const end = this.subtreeEnd(sel.source);
			// Record each item's own shape while the live nodes are still in
			// hand — a cut deletes them before the paste needs them.
			items.push(clipboardItem(sel.source, content.slice(start, end)));
		}

		// Identity travels with the clipboard. A mixed host+embedded selection has
		// no single origin to migrate from, so it pastes as plain text.
		const paths = new Set(selected.map((sel) => fileOf(sel.source)));
		fillClipboard(items, isCut, paths.size === 1 ? [...paths][0]! : null);

		// Also put plain text on system clipboard for external paste
		await navigator.clipboard.writeText(nodeClipboard.text ?? "");

		// If cut, delete the selected nodes
		if (isCut) {
			if (this.selectedNodeIds.size > 1) {
				await this.deleteSelectedNodes();
			} else {
				await this.deleteNode(node);
			}

			// Capture the schedule *after* the delete: reading it flushes pending
			// ratings, which rewrites the frontmatter and would have shifted the
			// offsets the splice above depends on.
			if (nodeClipboard.sourcePath) {
				nodeClipboard.schedules = await moves.readMovedScheduleEntries(
					this.moveContext(),
					nodeClipboard.sourcePath,
					nodeClipboard.blockIds,
				);
			}
		}
	}

	/**
	 * Paste clipboard content as a direct child of the selected node.
	 */
	private async pasteNodes(): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		if (!this.currentFile || !this.selectedNodeId || !nodeClipboard.items.length)
			return;

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		const src = node.source;
		// Routed by containing file, not `getNodeFile`: on an unexpanded embed the
		// latter names the embed's target while `src.range` still indexes the host.
		const fileOf = this.containingFileOf();
		if (!fileOf) return;
		const destPath = fileOf(src);
		const destFile = this.fileAtPath(destPath);
		if (!destFile) return;

		const content = await this.app.vault.read(destFile);
		// The target's child slot, each item's re-levelling and the copy-vs-cut
		// identity rule live in `pasteInto` (shared with the 3D graph).
		const updated = pasteInto(content, src);

		const originPath = nodeClipboard.sourcePath;
		if (originPath !== null && pasteMigrates(destPath)) {
			// Cut across the seam: the write and the schedule migration are one
			// gesture, so they undo as one step (see `moveAcrossFiles`).
			this.beginEditGroup();
			try {
				await this.writeFileTracked(destFile, updated);
				await moves.migrateBlockIdentity(
					this.moveContext(),
					originPath,
					destPath,
					nodeClipboard.blockIds,
					nodeClipboard.schedules,
				);
			} finally {
				this.endEditGroup();
				await this.resyncFromParent();
			}
		} else {
			await this.writeFileAtPath(destPath, updated);
		}

		// A cut's identity lands exactly once (see `spendCut`).
		spendCut();
	}

	/**
	 * Insert a new parent node above the selected node(s).
	 * The selected node(s) (and their subtrees) become children of the new node.
	 * Supports multi-select: all selected siblings get parented under the new node.
	 */
	private async insertParentNode(node: LayoutNode): Promise<void> {
		const target = await this.assertEditableNode(node);
		if (!target) return;
		if (!this.currentFile) return;

		const src = target.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const content = await this.app.vault.read(file);

		// Collect selected siblings sorted by position
		let blockStart: number;
		let blockEnd: number;

		// `target.parent`, not `node.parent`: the sibling ranges spliced below
		// come off it, and the pre-guard node's parent belongs to the layout the
		// freshness check may have just replaced.
		if (this.selectedNodeIds.size > 1 && target.parent) {
			// The shared rule (the 3D graph's Ctrl+Enter uses it too).
			const wrapped = edit.selectedSiblings(target.parent.source.children, this.selectedNodeIds);
			if (wrapped.length === 0) return;
			if (!this.ensureSameFileEdit(wrapped)) return;
			({ start: blockStart, end: blockEnd } = edit.subtreeSpan(wrapped));
		} else {
			blockStart = src.range.start;
			blockEnd = this.subtreeEnd(src);
		}
		// A new parent line at the same type/depth as the node, over the block
		// indented one level.
		const updated = edit.insertParent(content, src, {
			start: blockStart,
			end: blockEnd,
		}).text;

		const selectedId = this.selectedNodeId;
		await this.writeNodeFile(src, updated);

		// Start editing the new (empty) parent node
		this.startEditingNewNode(selectedId, false);
	}

	/**
	 * Duplicate the selected node(s) (and their subtrees) as siblings below.
	 */
	private async duplicateNode(node: LayoutNode): Promise<void> {
		const target = await this.assertEditableNode(node);
		if (!target) return;
		if (!this.currentFile) return;
		const src = target.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const content = await this.app.vault.read(file);

		// Collect all selected nodes sorted by document position
		const selected = [...this.selectedNodeIds]
			.map((id) => this.nodeMap.get(id))
			.filter((n): n is LayoutNode => n !== undefined)
			.sort((a, b) => a.source.range.start - b.source.range.start);

		if (selected.length === 0) return;
		if (!this.ensureSameFileEdit(selected.map((n) => n.source))) return;

		// Find the block range covering all selected subtrees
		const blockStart = selected[0]!.source.range.start;
		const blockEnd = this.subtreeEnd(selected[selected.length - 1]!.source);
		const blockText = content.slice(blockStart, blockEnd);

		const updated =
			content.slice(0, blockEnd) +
			"\n" +
			blockText +
			content.slice(blockEnd);
		await this.writeNodeFile(src, updated);
	}

	/**
	 * Toggle collapse on all selected nodes.
	 */
	private toggleCollapseSelected(): void {
		let anyExpanded = false;
		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (
				node &&
				(node.children.length > 0 || node.collapsed) &&
				!this.collapsedIds.has(id)
			) {
				anyExpanded = true;
				break;
			}
		}

		for (const id of this.selectedNodeIds) {
			const node = this.nodeMap.get(id);
			if (!node || (node.children.length === 0 && !node.collapsed))
				continue;
			if (anyExpanded) {
				this.collapsedIds.add(id);
			} else {
				this.collapsedIds.delete(id);
			}
		}

		void this.renderAnimated();
	}

	/**
	 * Get all descendant node IDs of a layout node (recursive, layout tree only).
	 */
	private getDescendantIds(node: LayoutNode): string[] {
		const ids: string[] = [];
		for (const child of node.children) {
			ids.push(child.source.id);
			ids.push(...this.getDescendantIds(child));
		}
		return ids;
	}

	/**
	 * Get all descendant node IDs from the source tree (includes collapsed children).
	 */
	private getSourceDescendantIds(node: OsmosisNode): string[] {
		const ids: string[] = [];
		for (const child of node.children) {
			ids.push(child.id);
			ids.push(...this.getSourceDescendantIds(child));
		}
		return ids;
	}

	/**
	 * Get the maximum visible depth under a node (not counting collapsed subtrees).
	 */
	private getMaxVisibleDepth(node: LayoutNode, currentDepth: number): number {
		if (
			this.collapsedIds.has(node.source.id) ||
			node.children.length === 0
		) {
			return currentDepth;
		}
		let max = currentDepth;
		for (const child of node.children) {
			max = Math.max(
				max,
				this.getMaxVisibleDepth(child, currentDepth + 1),
			);
		}
		return max;
	}

	/**
	 * Collect nodes at a specific visible depth under a root node.
	 */
	private getNodesAtVisibleDepth(
		node: LayoutNode,
		targetDepth: number,
		currentDepth: number,
	): LayoutNode[] {
		if (this.collapsedIds.has(node.source.id)) return [];
		if (currentDepth === targetDepth) return [node];
		const result: LayoutNode[] = [];
		for (const child of node.children) {
			result.push(
				...this.getNodesAtVisibleDepth(
					child,
					targetDepth,
					currentDepth + 1,
				),
			);
		}
		return result;
	}

	/**
	 * Fold one level: collapse the deepest visible children of each selected node.
	 */
	private foldOneLevel(): void {
		const targetIds =
			this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: this.selectedNodeId
					? [this.selectedNodeId]
					: [];
		let changed = false;

		for (const id of targetIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;

			const maxDepth = this.getMaxVisibleDepth(node, 0);
			if (maxDepth <= 0) continue; // Nothing to fold

			// Find nodes at the deepest visible level that have children
			const deepestParents = this.getNodesAtVisibleDepth(
				node,
				maxDepth - 1,
				0,
			).filter(
				(n) =>
					n.children.length > 0 &&
					!this.collapsedIds.has(n.source.id),
			);

			for (const parent of deepestParents) {
				this.collapsedIds.add(parent.source.id);
				changed = true;
			}
		}

		if (changed) void this.renderAnimated();
	}

	/**
	 * Unfold one level: expand the shallowest collapsed children of each selected node.
	 */
	private unfoldOneLevel(): void {
		const targetIds =
			this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: this.selectedNodeId
					? [this.selectedNodeId]
					: [];
		let changed = false;

		for (const id of targetIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;

			// If the node itself is collapsed, expand it
			if (this.collapsedIds.has(id)) {
				this.collapsedIds.delete(id);
				changed = true;
				continue;
			}

			// Find shallowest collapsed descendants
			const shallowest = this.findShallowestCollapsed(node, 0);
			if (shallowest.depth === Infinity) continue;

			for (const n of shallowest.nodes) {
				this.collapsedIds.delete(n.source.id);
				changed = true;
			}
		}

		if (changed) void this.renderAnimated();
	}

	/**
	 * Find collapsed nodes at the shallowest depth under a given node.
	 */
	private findShallowestCollapsed(
		node: LayoutNode,
		depth: number,
	): { depth: number; nodes: LayoutNode[] } {
		let minDepth = Infinity;
		let result: LayoutNode[] = [];

		for (const child of node.children) {
			if (this.collapsedIds.has(child.source.id)) {
				if (depth + 1 < minDepth) {
					minDepth = depth + 1;
					result = [child];
				} else if (depth + 1 === minDepth) {
					result.push(child);
				}
			} else {
				const sub = this.findShallowestCollapsed(child, depth + 1);
				if (sub.depth < minDepth) {
					minDepth = sub.depth;
					result = sub.nodes;
				} else if (sub.depth === minDepth) {
					result.push(...sub.nodes);
				}
			}
		}

		return { depth: minDepth, nodes: result };
	}

	/**
	 * Fold all: collapse all descendants of selected nodes.
	 */
	private foldAll(): void {
		const targetIds =
			this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: this.selectedNodeId
					? [this.selectedNodeId]
					: this.currentLayout
						? [this.currentLayout.root.source.id]
						: [];
		let changed = false;

		for (const id of targetIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;

			const descendants = this.getDescendantIds(node);
			for (const descId of descendants) {
				const descNode = this.nodeMap.get(descId);
				if (
					descNode &&
					descNode.children.length > 0 &&
					!this.collapsedIds.has(descId)
				) {
					this.collapsedIds.add(descId);
					changed = true;
				}
			}
			// Also collapse the node itself if it has children
			if (node.children.length > 0 && !this.collapsedIds.has(id)) {
				this.collapsedIds.add(id);
				changed = true;
			}
		}

		if (changed) void this.renderAnimated();
	}

	/**
	 * Unfold all: expand all descendants of selected nodes.
	 * Uses source tree to find collapsed children (layout tree omits them).
	 */
	private unfoldAll(): void {
		const targetIds =
			this.selectedNodeIds.size > 0
				? [...this.selectedNodeIds]
				: this.selectedNodeId
					? [this.selectedNodeId]
					: this.currentLayout
						? [this.currentLayout.root.source.id]
						: [];
		let changed = false;

		for (const id of targetIds) {
			const node = this.nodeMap.get(id);
			if (!node) continue;

			// Uncollapse this node
			if (this.collapsedIds.has(id)) {
				this.collapsedIds.delete(id);
				changed = true;
			}
			// Uncollapse all descendants via source tree
			const descendants = this.getSourceDescendantIds(node.source);
			for (const descId of descendants) {
				if (this.collapsedIds.has(descId)) {
					this.collapsedIds.delete(descId);
					changed = true;
				}
			}
		}

		if (changed) void this.renderAnimated();
	}

	// ─── Cursor Sync ────────────────────────────────────────

	/**
	 * Poll the active editor's cursor position and highlight the corresponding map node.
	 * Uses a polling interval because Obsidian doesn't expose a reliable cursor-change event.
	 */
	private syncEditorCursorToMap(): void {
		if (!this.isCursorSyncEnabled() || this.suppressCursorSync) return;
		if (!this.currentTree) return;

		const editor = this.getActiveEditor();
		if (!editor) return;

		const cursor = editor.getCursor();
		const offset = editor.posToOffset(cursor);
		const node = this.parser.findNodeAtPosition(this.currentTree, offset);
		if (!node || node.type === "root") {
			this.setCursorSyncHighlight(null);
			return;
		}

		if (node.id !== this.cursorSyncNodeId) {
			this.setCursorSyncHighlight(node.id);
		}
	}

	/**
	 * Move the editor cursor to the start of a node's range.
	 */
	private syncMapSelectionToEditor(nodeId: string): void {
		if (!this.isCursorSyncEnabled()) return;

		const layoutNode = this.nodeMap.get(nodeId);
		if (!layoutNode) return;

		const editor = this.getActiveEditor();
		if (!editor) return;

		const pos = editor.offsetToPos(layoutNode.source.range.start);
		this.suppressCursorSync = true;
		editor.setCursor(pos);
		this.suppressCursorSync = false;
	}

	/**
	 * Apply or remove the cursor-sync highlight CSS class.
	 */
	private setCursorSyncHighlight(nodeId: string | null): void {
		if (!this.svg) return;

		// Remove old highlight
		if (this.cursorSyncNodeId) {
			const old = this.svg.querySelector(
				`[data-node-id="${this.cursorSyncNodeId}"]`,
			);
			old?.classList.remove("osmosis-node-cursor-synced");
		}

		this.cursorSyncNodeId = nodeId;

		// Apply new highlight
		if (nodeId) {
			const el = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
			el?.classList.add("osmosis-node-cursor-synced");
		}
	}

	private isCursorSyncEnabled(): boolean {
		return this.plugin?.settings?.cursorSync ?? true;
	}

	/**
	 * Get the editor from a MarkdownView showing our current file.
	 */
	private getActiveEditor(): MarkdownView["editor"] | null {
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (
				view instanceof MarkdownView &&
				view.file === this.currentFile
			) {
				return view.editor;
			}
		}
		return null;
	}

	// ─── Drag-to-Resize ─────────────────────────────────────

	private updateResize(clientX: number): void {
		if (!this.resizingNodeId || !this.svg) return;
		const dx = (clientX - this.resizeStartX) / this.zoom;
		const MIN_NODE_WIDTH = 60;
		const newWidth = Math.max(MIN_NODE_WIDTH, this.resizeStartWidth + dx);
		this.resizeCurrentWidth = newWidth;

		// Live-update: only update the foreignObject width for text reflow.
		// The shape element is NOT updated during drag — the full re-render
		// on pointer-up redraws it correctly for all shape types.
		const group = this.svg.querySelector(
			`[data-node-id="${this.resizingNodeId}"]`,
		);
		if (!group) return;

		const node = this.nodeMap.get(this.resizingNodeId);
		if (!node) return;

		// Update foreignObject width (accounting for shape insets)
		const fo = group.querySelector("foreignObject");
		if (fo) {
			const localStyle = lookupNodeStyle(this.osmosisStyleFrontmatter, node);
			const shape = localStyle?.shape ?? this.mapSettings.topicShape ?? "rounded-rect";
			const insets = getShapeInsets(shape);
			const foW = newWidth * (1 - insets.left - insets.right);
			fo.setAttribute("width", String(foW));
		}
	}

	/** Convert a node's outer width to content width (removes padding + shape insets). */
	private nodeWidthToContentWidth(node: LayoutNode, nodeWidth: number): number {
		const localStyle = lookupNodeStyle(this.osmosisStyleFrontmatter, node);
		const shape = localStyle?.shape ?? this.mapSettings.topicShape ?? "rounded-rect";
		const insets = getShapeInsets(shape);
		const totalInsetX = Math.min(insets.left, 0.45) + Math.min(insets.right, 0.45);
		const scaleX = totalInsetX > 0 ? 1 / (1 - totalInsetX) : 1;
		const cfg = DEFAULT_LAYOUT_CONFIG;
		return Math.round(nodeWidth / scaleX - cfg.nodePaddingX * 2);
	}

	private async finishResize(): Promise<void> {
		if (this.isReadingMode) {
			this.resizingNodeId = null;
			return;
		}
		if (!this.resizingNodeId) return;
		const nodeId = this.resizingNodeId;
		this.resizingNodeId = null;

		const node = this.nodeMap.get(nodeId);
		if (!node) return;

		// Use the tracked current width (works for all shape types)
		const widthDelta = this.resizeCurrentWidth - this.resizeStartWidth;

		// Apply to all selected nodes (or just the dragged node if not selected)
		const overrides = new Map<string, NodeStyle>();
		const targetIds = this.selectedNodeIds.has(nodeId)
			? this.selectedNodeIds
			: new Set([nodeId]);

		const MIN_NODE_WIDTH = 60;
		for (const id of targetIds) {
			const n = this.nodeMap.get(id);
			if (!n) continue;
			const newNodeWidth = Math.max(MIN_NODE_WIDTH, n.rect.width + widthDelta);
			overrides.set(id, { width: this.nodeWidthToContentWidth(n, newNodeWidth) });
		}

		await this.applyNodeStyleOverrides(overrides);
	}

	// ─── Drag-and-Drop ──────────────────────────────────────

	private startDrag(nodeId: string): void {
		if (this.isReadingMode) return;
		if (!this.svg) return;
		const node = this.nodeMap.get(nodeId);
		if (!node) return;

		this.isDragging = true;
		// Preserve multi-selection if dragging a node that's already selected
		if (!this.selectedNodeIds.has(nodeId)) {
			this.selectNode(nodeId);
		}
		this.contentEl.addClass("osmosis-dragging");

		// Create ghost node (semi-transparent clone)
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const ghost = document.createElementNS(SVG_NS, "g");
		ghost.setAttribute("class", "osmosis-drag-ghost");

		const rect = document.createElementNS(SVG_NS, "rect");
		rect.setAttribute("width", String(node.rect.width));
		rect.setAttribute("height", String(node.rect.height));
		rect.setAttribute("rx", "4");
		rect.setAttribute(
			"class",
			"osmosis-node osmosis-node-" + node.source.type,
		);
		ghost.appendChild(rect);

		const fo = document.createElementNS(SVG_NS, "foreignObject");
		fo.setAttribute("width", String(node.rect.width));
		fo.setAttribute("height", String(node.rect.height));
		const wrapper = document.createElementNS(
			XHTML_NS,
			"div",
		) as HTMLDivElement;
		wrapper.setAttribute("xmlns", XHTML_NS);
		wrapper.className = "osmosis-node-content";
		wrapper.textContent = node.source.content;
		fo.appendChild(wrapper);
		ghost.appendChild(fo);

		// Position at the node's current location
		const nx = node.rect.x + offsetX;
		const ny = node.rect.y + offsetY;
		ghost.setAttribute("transform", `translate(${nx}, ${ny})`);
		this.svg.appendChild(ghost);
		this.dragGhost = ghost;

		// Create drop indicator line
		const indicator = document.createElementNS(SVG_NS, "line");
		indicator.setAttribute("class", "osmosis-drop-indicator");
		indicator.setAttribute("display", "none");
		this.svg.appendChild(indicator);
		this.dropIndicator = indicator;

		// …and the label naming the destination note when the drop would write to
		// a different one. Decisions #1/#2 rule out a modal, so naming the file
		// mid-drag is the only warning before a line leaves the note it lives in.
		const label = document.createElementNS(SVG_NS, "text");
		label.setAttribute("class", "osmosis-drop-indicator-label");
		label.setAttribute("display", "none");
		this.svg.appendChild(label);
		this.dropIndicatorLabel = label;

		this.dragFileOf = this.containingFileOf();
	}

	private updateDrag(e: MouseEvent): void {
		if (!this.svg || !this.dragGhost || !this.dragNodeId) return;

		const svgPt = this.screenToSvg(e.clientX, e.clientY);

		// Move ghost to follow cursor (centered on cursor)
		const node = this.nodeMap.get(this.dragNodeId);
		if (!node) return;
		const gx = svgPt.x - node.rect.width / 2;
		const gy = svgPt.y - node.rect.height / 2;
		this.dragGhost.setAttribute("transform", `translate(${gx}, ${gy})`);

		// Find drop target
		this.updateDropTarget(svgPt);
	}

	private updateDropTarget(svgPt: { x: number; y: number }): void {
		if (!this.dragNodeId || !this.currentLayout) return;

		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		const dragNode = this.nodeMap.get(this.dragNodeId);
		if (!dragNode) return;

		let bestDist = Infinity;
		let bestTarget: { parentId: string; index: number } | null = null;
		let indicatorY = 0;
		let indicatorX1 = 0;
		let indicatorX2 = 0;

		// Check each visible node for potential drop positions
		for (const [, layoutNode] of this.nodeMap) {
			if (!layoutNode.parent) continue;

			// Can't drop onto self or descendants
			if (this.isDescendant(dragNode, layoutNode)) continue;

			const nodeX = layoutNode.rect.x + offsetX;
			const nodeY = layoutNode.rect.y + offsetY;
			const nodeCY = nodeY + layoutNode.rect.height / 2;

			// Use weighted 2D distance so nodes at cursor's X-level are preferred
			// over nodes at different depths that happen to be close in Y
			const nodeCX = nodeX + layoutNode.rect.width / 2;
			const dx = svgPt.x - nodeCX;

			// Check gap above this node (insert before)
			const gapAbove = nodeY;
			const dyAbove = svgPt.y - gapAbove;
			const distAbove = Math.sqrt(dyAbove * dyAbove + dx * dx * 0.25);
			if (distAbove < bestDist && Math.abs(dx) < 300) {
				const parentNode = layoutNode.parent;
				const siblingIdx = parentNode.children.indexOf(layoutNode);
				// Don't allow dropping right back where it came from
				if (
					!this.isSamePosition(
						dragNode,
						parentNode.source.id,
						siblingIdx,
					)
				) {
					bestDist = distAbove;
					bestTarget = {
						parentId: parentNode.source.id,
						index: siblingIdx,
					};
					indicatorY = gapAbove;
					indicatorX1 = nodeX;
					indicatorX2 = nodeX + layoutNode.rect.width;
				}
			}

			// Check gap below this node (insert after)
			const gapBelow = nodeY + layoutNode.rect.height;
			const dyBelow = svgPt.y - gapBelow;
			const distBelow = Math.sqrt(dyBelow * dyBelow + dx * dx * 0.25);
			if (distBelow < bestDist && Math.abs(dx) < 300) {
				const parentNode = layoutNode.parent;
				const siblingIdx = parentNode.children.indexOf(layoutNode) + 1;
				if (
					!this.isSamePosition(
						dragNode,
						parentNode.source.id,
						siblingIdx,
					)
				) {
					bestDist = distBelow;
					bestTarget = {
						parentId: parentNode.source.id,
						index: siblingIdx,
					};
					indicatorY = gapBelow;
					indicatorX1 = nodeX;
					indicatorX2 = nodeX + layoutNode.rect.width;
				}
			}

			// Check reparent: if cursor is to the right of a node, drop as its child
			const rightEdge = nodeX + layoutNode.rect.width + 30;
			if (
				svgPt.x > rightEdge &&
				Math.abs(svgPt.y - nodeCY) < layoutNode.rect.height
			) {
				const dist = Math.abs(svgPt.y - nodeCY);
				if (dist < bestDist) {
					// Don't reparent to self
					if (
						layoutNode.source.id !== this.dragNodeId &&
						!this.isDescendant(dragNode, layoutNode)
					) {
						bestDist = dist;
						bestTarget = {
							parentId: layoutNode.source.id,
							index: layoutNode.children.length,
						};
						indicatorY = nodeCY;
						indicatorX1 = rightEdge;
						indicatorX2 = rightEdge + 40;
					}
				}
			}
		}

		this.dropTarget = bestTarget;

		// Update visual indicator
		if (this.dropIndicator) {
			if (bestTarget) {
				this.dropIndicator.setAttribute("x1", String(indicatorX1));
				this.dropIndicator.setAttribute("y1", String(indicatorY));
				this.dropIndicator.setAttribute("x2", String(indicatorX2));
				this.dropIndicator.setAttribute("y2", String(indicatorY));
				this.dropIndicator.removeAttribute("display");
			} else {
				this.dropIndicator.setAttribute("display", "none");
			}
		}
		this.updateCrossNoteCue(
			bestTarget,
			dragNode.source,
			indicatorX2,
			indicatorY,
		);
	}

	/**
	 * Mark the drop indicator when the resolved destination is a *different* note
	 * than the dragged node lives in, and name that note beside it.
	 *
	 * A cross-boundary move edits a file the user is not looking at, and moving
	 * content *out* of a source note removes it from every place that note is
	 * embedded. Neither gets a confirmation, by design — so the label is the one
	 * chance to see where the bytes are about to land before committing.
	 */
	private updateCrossNoteCue(
		target: { parentId: string; index: number } | null,
		dragSrc: OsmosisNode,
		x: number,
		y: number,
	): void {
		const label = this.dropIndicatorLabel;
		let destPath: string | null = null;

		if (target && this.dragFileOf && this.currentTree) {
			const targetParent = this.findNodeById(
				this.currentTree.root,
				target.parentId,
			);
			if (targetParent) {
				const site = edit.resolveInsertSite(
					targetParent,
					target.index,
					this.dragFileOf,
				);
				if (site.path !== this.dragFileOf(dragSrc)) destPath = site.path;
			}
		}

		this.dropIndicator?.toggleClass(
			"osmosis-drop-indicator--cross-note",
			destPath !== null,
		);
		if (!label) return;
		if (!destPath) {
			label.setAttribute("display", "none");
			return;
		}
		const destFile = this.app.vault.getFileByPath(destPath);
		const name =
			destFile instanceof TFile
				? destFile.basename
				: (destPath.split("/").pop() ?? destPath).replace(/\.md$/, "");
		label.textContent = `→ ${name}`;
		label.setAttribute("x", String(x + 8));
		label.setAttribute("y", String(y - 4));
		label.removeAttribute("display");
	}

	private isDescendant(ancestor: LayoutNode, node: LayoutNode): boolean {
		if (node.source.id === ancestor.source.id) return true;
		for (const child of ancestor.children) {
			if (this.isDescendant(child, node)) return true;
		}
		return false;
	}

	private isSamePosition(
		dragNode: LayoutNode,
		parentId: string,
		index: number,
	): boolean {
		if (!dragNode.parent) return false;
		const currentParentId = dragNode.parent.source.id;
		const currentIndex = dragNode.parent.children.indexOf(dragNode);
		return (
			currentParentId === parentId &&
			(index === currentIndex || index === currentIndex + 1)
		);
	}

	private async executeDrop(): Promise<void> {
		const dragNodeId = this.dragNodeId;
		const dropTarget = this.dropTarget;
		// Snapshot selected IDs before cleanup clears drag state
		const selectedIds = new Set(this.selectedNodeIds);

		this.cleanupDrag();

		// A drag can span the seconds a schedule flush needs, so settle before
		// reading any range: everything below is resolved from IDs afterwards.
		await this.ensureTreeFresh();

		if (!dragNodeId || !dropTarget) return;
		await this.moveNodesTo(dragNodeId, selectedIds, dropTarget);
	}

	/**
	 * Move node `dragNodeId`, with the nodes of `selectedIds` that are its
	 * siblings, to child `index` of `parentId`: a drag and drop's write, and the
	 * Add link menu's moves. The tree must already be fresh.
	 */
	private async moveNodesTo(
		dragNodeId: string,
		selectedIds: ReadonlySet<string>,
		dropTarget: { parentId: string; index: number },
	): Promise<void> {
		if (!this.currentFile || !this.currentTree) return;

		const dragNode = this.nodeMap.get(dragNodeId);
		if (!dragNode?.parent) return;

		// Find the target parent and insertion point
		const targetParent = this.findNodeById(
			this.currentTree.root,
			dropTarget.parentId,
		);
		if (!targetParent) return;

		// Collect all selected siblings (multi-select support, like Alt+Arrow)
		const parentSrc = dragNode.parent.source;
		const siblings = parentSrc.children;
		const selectedIndices: number[] = [];
		for (let i = 0; i < siblings.length; i++) {
			const sib = siblings[i];
			if (sib && selectedIds.has(sib.id)) {
				selectedIndices.push(i);
			}
		}
		selectedIndices.sort((a, b) => a - b);

		// Fall back to just the dragged node if none of the selection is among siblings
		if (selectedIndices.length === 0) {
			const dragIdx = siblings.indexOf(dragNode.source);
			if (dragIdx >= 0) selectedIndices.push(dragIdx);
			else return;
		}

		const selectedSrcs = selectedIndices.map((i) => siblings[i]!);

		// The whole selection is sliced out of one file's bytes. A multi-select
		// that itself spans the seam has no single origin to splice, so it stays
		// refused even though a single-origin move across the seam now works.
		if (!this.ensureSameFileEdit(selectedSrcs)) return;

		const fileOf = this.containingFileOf();
		if (!fileOf) return;

		// Where the drop actually writes — which may be a different note than the
		// one the dragged node lives in.
		const site = edit.resolveInsertSite(targetParent, dropTarget.index, fileOf);
		const originPath = fileOf(selectedSrcs[0]!);
		const movedContents = selectedSrcs.map((s) => s.content);
		const dropContext = (nodeSrc: OsmosisNode): {
			type: OsmosisNode["type"];
			depth: number;
		} => edit.dropContext(targetParent, dropTarget.index, nodeSrc);

		if (site.path !== originPath) {
			const moved = await this.moveAcrossFiles(
				selectedSrcs,
				site,
				originPath,
				dropContext,
			);
			if (moved) this.reselectMultiAfterMove(movedContents);
			return;
		}

		// Same-file move: one splice, so the removal shifts the insert offset and
		// the two orders below keep that arithmetic straight.
		const file = this.fileAtPath(originPath);
		if (!file) return;
		const content = await this.app.vault.read(file);
		const updated = edit.moveWithinFile(
			content,
			selectedSrcs,
			site.offset,
			dropContext,
		).text;

		await this.writeFileAtPath(originPath, updated);
		this.reselectMultiAfterMove(movedContents);
	}

	private cleanupDrag(): void {
		this.isDragging = false;
		this.dragNodeId = null;
		this.dropTarget = null;
		this.dragFileOf = null;
		this.contentEl.removeClass("osmosis-dragging");

		if (this.dragGhost) {
			this.dragGhost.remove();
			this.dragGhost = null;
		}
		if (this.dropIndicator) {
			this.dropIndicator.remove();
			this.dropIndicator = null;
		}
		if (this.dropIndicatorLabel) {
			this.dropIndicatorLabel.remove();
			this.dropIndicatorLabel = null;
		}
	}

	private findNodeById(node: OsmosisNode, id: string): OsmosisNode | null {
		if (node.id === id) return node;
		for (const child of node.children) {
			const found = this.findNodeById(child, id);
			if (found) return found;
		}
		return null;
	}

	private inferChildType(parent: OsmosisNode): OsmosisNode["type"] {
		return edit.inferChildType(parent);
	}

	private inferChildDepth(parent: OsmosisNode): number {
		return edit.inferChildDepth(parent);
	}

	/**
	 * Determine the new type when indenting a node under a new parent.
	 * Headings indenting under headings stay as headings (deeper level).
	 * Non-headings indenting under headings become bullets.
	 */
	private inferIndentType(
		newParent: OsmosisNode,
		movingNode: OsmosisNode,
	): OsmosisNode["type"] {
		return edit.inferIndentType(newParent, movingNode);
	}

	/**
	 * Determine the new depth when indenting a node under a new parent.
	 * Headings get parent depth + 1. Lists get standard child depth.
	 */
	private inferIndentDepth(
		newParent: OsmosisNode,
		movingNode: OsmosisNode,
	): number {
		return edit.inferIndentDepth(newParent, movingNode);
	}

	/**
	 * Re-indent a subtree's text to match a new type/depth. Delegates to the
	 * tested pure transform in `mindmap-edit` (preserves the first line's
	 * block ID, which `content` has stripped).
	 */
	private reindentSubtree(
		text: string,
		originalNode: OsmosisNode,
		newType: OsmosisNode["type"],
		newDepth: number,
	): string {
		return edit.reindentSubtree(text, originalNode, newType, newDepth);
	}

	// ─── Keyboard ────────────────────────────────────────────

	/**
	 * Map a physical arrow key to a logical action based on map direction
	 * and whether the selected node is on the secondary side.
	 */
	private resolveArrowAction(
		key: string,
	): "depthDeeper" | "depthShallower" | "siblingPrev" | "siblingNext" | null {
		const isTopDown = this.mapSettings.direction === "top-down";
		let isSecondary = false;
		if (this.selectedNodeId) {
			const node = this.nodeMap.get(this.selectedNodeId);
			if (node) {
				isSecondary = node.side === "secondary";
			}
		}

		if (isTopDown) {
			switch (key) {
				case "ArrowDown":
					return isSecondary ? "depthShallower" : "depthDeeper";
				case "ArrowUp":
					return isSecondary ? "depthDeeper" : "depthShallower";
				case "ArrowLeft":
					return "siblingPrev";
				case "ArrowRight":
					return "siblingNext";
			}
		} else {
			switch (key) {
				case "ArrowRight":
					return isSecondary ? "depthShallower" : "depthDeeper";
				case "ArrowLeft":
					return isSecondary ? "depthDeeper" : "depthShallower";
				case "ArrowUp":
					return "siblingPrev";
				case "ArrowDown":
					return "siblingNext";
			}
		}
		return null;
	}

	/**
	 * A toolbar move: by tree depth or sibling order, whatever the screen side
	 * or layout direction. Alt+Arrow keys resolve their direction to one of
	 * these with `resolveArrowAction` in `handleKeyDown`.
	 */
	private runMoveAction(action: "depthDeeper" | "depthShallower" | "siblingPrev" | "siblingNext"): void {
		switch (action) {
			case "depthDeeper":
				void this.indentNode();
				break;
			case "depthShallower":
				void this.outdentNode();
				break;
			case "siblingPrev":
				void this.moveNodeUpDown(-1);
				break;
			case "siblingNext":
				void this.moveNodeUpDown(1);
				break;
		}
	}

	private handleKeyDown(e: KeyboardEvent): void {
		// Don't handle keys during editing
		if (this.editingNodeId) {
			if (e.key === "Escape") {
				this.stopEditing(false);
				e.preventDefault();
			}
			return;
		}

		// Escape disarms Add link
		if (e.key === "Escape" && this.cancelLinkPick()) {
			e.preventDefault();
			return;
		}

		// Escape closes the find bar
		if (e.key === "Escape" && this.findBar?.isOpen) {
			this.findBar.close();
			e.preventDefault();
			return;
		}

		// Spatial study: 1–4 rate the card awaiting a rating
		if (
			this.spatialMode === "study" &&
			this.spatialPendingRating !== null &&
			!e.ctrlKey && !e.metaKey && !e.altKey &&
			(e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4")
		) {
			e.preventDefault();
			void this.rateSpatialCard(Number(e.key) as FSRSRating);
			return;
		}

		// Ctrl/Cmd+arrow follows the outline whatever the layout or side; +Shift extends the selection
		const step = (e.ctrlKey || e.metaKey) && !e.altKey ? arrowKeyStep(e.key) : null;
		if (step) {
			e.preventDefault();
			this.navigateHierarchy(step, e.shiftKey);
			return;
		}

		// Direction-aware arrow key handling
		const arrowAction = this.resolveArrowAction(e.key);
		if (arrowAction) {
			e.preventDefault();
			if (e.altKey) {
				switch (arrowAction) {
					case "depthDeeper":
						void this.indentNode();
						break;
					case "depthShallower":
						void this.outdentNode();
						break;
					case "siblingPrev":
						void this.moveNodeUpDown(-1);
						break;
					case "siblingNext":
						void this.moveNodeUpDown(1);
						break;
				}
			} else if (e.shiftKey) {
				switch (arrowAction) {
					case "depthDeeper":
						this.extendSelectionToChildren();
						break;
					case "depthShallower":
						this.extendSelectionToParent();
						break;
					case "siblingPrev":
						this.extendSelectionSibling(-1);
						break;
					case "siblingNext":
						this.extendSelectionSibling(1);
						break;
				}
			} else {
				switch (arrowAction) {
					case "depthDeeper":
						this.navigateToFirstChild();
						break;
					case "depthShallower":
						this.navigateToParent();
						break;
					case "siblingPrev":
						this.navigateSibling(-1);
						break;
					case "siblingNext":
						this.navigateSibling(1);
						break;
				}
			}
			return;
		}

		switch (e.key) {
			case "Tab":
				e.preventDefault();
				if (this.selectedNodeId) {
					const tabNode = this.nodeMap.get(this.selectedNodeId);
					if (tabNode) {
						void this.addChildNode(tabNode);
					}
				}
				break;
			case "Enter":
				if (this.selectedNodeId) {
					if (e.ctrlKey || e.metaKey) {
						// Ctrl+Enter = insert parent topic
						const parentEnterNode = this.nodeMap.get(
							this.selectedNodeId,
						);
						if (parentEnterNode) {
							void this.insertParentNode(parentEnterNode);
						}
					} else {
						// Enter = add sibling after selected node, Shift+Enter = before it
						const enterNode = this.nodeMap.get(this.selectedNodeId);
						if (enterNode) {
							void this.addSiblingNode(enterNode, e.shiftKey);
						}
					}
					e.preventDefault();
				}
				break;
			case "F2":
				if (this.selectedNodeId) {
					void this.startEditing(this.selectedNodeId);
					e.preventDefault();
				}
				break;
			case "Delete":
			case "Backspace":
				if (this.selectedNodeIds.size > 1) {
					void this.deleteSelectedNodes();
				} else if (this.selectedNodeId) {
					const delNode = this.nodeMap.get(this.selectedNodeId);
					if (delNode) {
						void this.deleteNode(delNode);
					}
				}
				e.preventDefault();
				break;
			case " ":
				// Space = toggle collapse on selected node(s)
				if (this.selectedNodeIds.size > 1) {
					this.toggleCollapseSelected();
					e.preventDefault();
				} else if (this.selectedNodeId) {
					const node = this.nodeMap.get(this.selectedNodeId);
					if (node && (node.children.length > 0 || node.collapsed)) {
						this.toggleCollapse(this.selectedNodeId);
						e.preventDefault();
					}
				}
				break;
			case "c":
				// Ctrl/Cmd+C = copy node(s)
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					void this.copySelectedNodes(false);
				}
				break;
			case "x":
				// Ctrl/Cmd+X = cut node(s)
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					void this.copySelectedNodes(true);
				}
				break;
			case "v":
				// Ctrl/Cmd+V = paste node(s)
				if (
					(e.ctrlKey || e.metaKey) &&
					this.selectedNodeId &&
					nodeClipboard.text
				) {
					e.preventDefault();
					void this.pasteNodes();
				}
				break;
			case "d":
				// Ctrl/Cmd+D = duplicate node
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					const dupNode = this.nodeMap.get(this.selectedNodeId);
					if (dupNode) {
						void this.duplicateNode(dupNode);
					}
				}
				break;
			case "a":
				// Ctrl/Cmd+A = select all
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					this.selectNodes(new Set(this.nodeMap.keys()));
				}
				break;
			case "[":
			case "{": // Shift+[ produces "{" as e.key
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					if (e.shiftKey) {
						this.foldAll(); // Ctrl+Shift+[ = fold all children
					} else {
						this.foldOneLevel(); // Ctrl+[ = fold deepest visible level
					}
				}
				break;
			case "]":
			case "}": // Shift+] produces "}" as e.key
				if ((e.ctrlKey || e.metaKey) && this.selectedNodeId) {
					e.preventDefault();
					if (e.shiftKey) {
						this.unfoldAll(); // Ctrl+Shift+] = unfold all children
					} else {
						this.unfoldOneLevel(); // Ctrl+] = unfold shallowest collapsed level
					}
				}
				break;
			case "z":
			case "Z": // Shift+z produces "Z" as e.key
				// Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					this.forwardUndoRedo(e.shiftKey);
				}
				break;
			case "y":
				// Ctrl/Cmd+Y = redo (Windows convention)
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					this.forwardUndoRedo(true);
				}
				break;
		}
	}

	private navigateSibling(direction: number): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const siblings = node.parent.children;
		const idx = siblings.indexOf(node);
		const newIdx = idx + direction;
		const target = siblings[newIdx];
		if (newIdx >= 0 && newIdx < siblings.length && target) {
			this.selectNode(target.source.id);
			this.syncMapSelectionToEditor(target.source.id);
			this.scrollToSelectedNode();
		} else {
			// Jump to cousin at same depth
			const cousin = this.findCousin(node, direction);
			if (cousin) {
				this.selectNode(cousin.source.id);
				this.syncMapSelectionToEditor(cousin.source.id);
				this.scrollToSelectedNode();
			}
		}
	}

	/**
	 * Find the adjacent cousin node at the same depth level.
	 * When at end of siblings, traverses up to parent's sibling, then down to its child.
	 */
	private findCousin(node: LayoutNode, direction: number): LayoutNode | null {
		const parent = node.parent;
		if (!parent?.parent) return null;

		const parentSiblings = parent.parent.children;
		const parentIdx = parentSiblings.indexOf(parent);
		const nextParentIdx = parentIdx + direction;
		const nextParent = parentSiblings[nextParentIdx];

		if (
			nextParentIdx < 0 ||
			nextParentIdx >= parentSiblings.length ||
			!nextParent
		) {
			// Recursively look for cousins further up
			const parentCousin = this.findCousin(parent, direction);
			if (parentCousin && parentCousin.children.length > 0) {
				return direction > 0
					? parentCousin.children[0]!
					: parentCousin.children[parentCousin.children.length - 1]!;
			}
			return null;
		}

		if (nextParent.children.length === 0) return null;
		return direction > 0
			? nextParent.children[0]!
			: nextParent.children[nextParent.children.length - 1]!;
	}

	private navigateToParent(): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (node?.parent && node.parent.source.type !== "root") {
			this.selectNode(node.parent.source.id);
			this.syncMapSelectionToEditor(node.parent.source.id);
			this.scrollToSelectedNode();
		}
	}

	private navigateToFirstChild(): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		// If collapsed, expand first
		if (
			this.collapsedIds.has(this.selectedNodeId) &&
			node.source.children.length > 0
		) {
			this.toggleCollapse(this.selectedNodeId);
			return;
		}

		const firstChild = node.children[0];
		if (firstChild) {
			this.selectNode(firstChild.source.id);
			this.syncMapSelectionToEditor(firstChild.source.id);
			this.scrollToSelectedNode();
		}
	}

	/**
	 * Extend selection to the next/previous sibling (Shift+Up/Down).
	 */
	/**
	 * Move the selection cursor to targetId, adding or removing from selection.
	 * If target is already selected (backtracking), deselects the current node.
	 */
	private extendSelectionTo(targetId: string): void {
		this.clearSelectionVisuals();
		this.setCursorSyncHighlight(null);
		this.syncMapSelectionToEditor(targetId);
		if (
			this.selectedNodeIds.has(targetId) &&
			this.selectedNodeId !== targetId
		) {
			// Backtracking: deselect current cursor node, move cursor to target
			if (this.selectedNodeId) {
				this.selectedNodeIds.delete(this.selectedNodeId);
			}
		} else {
			// Extending: add target to selection
			this.selectedNodeIds.add(targetId);
		}
		this.selectedNodeId = targetId;
		this.applySelectionVisuals();
		this.scrollToSelectedNode();
	}

	private extendSelectionSibling(direction: number): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node?.parent) return;

		const siblings = node.parent.children;
		const idx = siblings.indexOf(node);
		const newIdx = idx + direction;
		const target = siblings[newIdx];
		if (newIdx >= 0 && newIdx < siblings.length && target) {
			this.extendSelectionTo(target.source.id);
		} else {
			// Jump to cousin at same depth
			const cousin = this.findCousin(node, direction);
			if (cousin) {
				this.extendSelectionTo(cousin.source.id);
			}
		}
	}

	/**
	 * Extend selection to the parent node (Shift+Left).
	 */
	private extendSelectionToParent(): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (node?.parent && node.parent.source.type !== "root") {
			this.extendSelectionTo(node.parent.source.id);
		}
	}

	/**
	 * Extend selection to the first child (Shift+Right).
	 */
	private extendSelectionToChildren(): void {
		if (!this.selectedNodeId) {
			this.selectFirstNode();
			return;
		}

		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		// If collapsed, expand first
		if (
			this.collapsedIds.has(this.selectedNodeId) &&
			node.source.children.length > 0
		) {
			this.toggleCollapse(this.selectedNodeId);
			return;
		}

		const firstChild = node.children[0];
		if (firstChild) {
			this.extendSelectionTo(firstChild.source.id);
		}
	}

	/**
	 * Ctrl/Cmd+arrow: move (or with `extend`, grow the selection) to the
	 * previous/next sibling, parent or first child, stopping at the ends of the
	 * siblings. A collapsed node's first child expands it first, as plain
	 * arrows do. Never steps onto the file's root.
	 */
	private navigateHierarchy(step: HierarchyStep, extend: boolean): void {
		const id = this.selectedNodeId;
		if (!id) {
			this.selectFirstNode();
			return;
		}
		const node = this.nodeMap.get(id);
		if (!node) return;
		if (step === "firstChild" && this.collapsedIds.has(id) && node.source.children.length > 0) {
			this.toggleCollapse(id);
			return;
		}
		const tree = {
			parent: (nodeId: string) => this.nodeMap.get(nodeId)?.parent?.source.id ?? null,
			children: (nodeId: string) => this.nodeMap.get(nodeId)?.children.map((child) => child.source.id) ?? [],
		};
		const target = hierarchyStep(tree, id, step);
		if (target === null || this.nodeMap.get(target)?.source.type === "root") return;
		if (extend) {
			this.extendSelectionTo(target);
		} else {
			this.selectNode(target);
			this.syncMapSelectionToEditor(target);
			this.scrollToSelectedNode();
		}
	}

	private selectFirstNode(): void {
		if (!this.currentLayout) return;
		// Select the first non-root node
		for (const node of this.currentLayout.nodes) {
			if (node.source.type !== "root") {
				this.selectNode(node.source.id);
				this.syncMapSelectionToEditor(node.source.id);
				this.scrollToSelectedNode();
				return;
			}
		}
	}

	private scrollToSelectedNode(): void {
		if (!this.selectedNodeId || !this.svg) return;
		const node = this.nodeMap.get(this.selectedNodeId);
		if (!node) return;

		const { x, y, width, height } = node.rect;
		const cx = x + width / 2 + this.getOffsetX();
		const cy = y + height / 2 + this.getOffsetY();

		// Check if node is visible in current viewBox
		const margin = 50;
		if (
			cx < this.viewBox.x + margin ||
			cx > this.viewBox.x + this.viewBox.w - margin ||
			cy < this.viewBox.y + margin ||
			cy > this.viewBox.y + this.viewBox.h - margin
		) {
			// Pan to center the node
			this.viewBox.x = cx - this.viewBox.w / 2;
			this.viewBox.y = cy - this.viewBox.h / 2;
			this.updateViewBox();
		}
	}

	// ─── Inline Editing ──────────────────────────────────────

	private async startEditing(nodeId: string): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		// Looked up after the guard, not before: settling a deferred re-sync
		// rebuilds `nodeMap`, and the node captured beforehand would be an
		// orphan from the previous layout.
		const node = this.nodeMap.get(nodeId);
		if (!node || !this.svg) return;

		// Validate DOM elements before committing to edit mode.
		// Without this, editingNodeId could be set with no editor created,
		// leaving the node in a broken state (ribbon hidden, no overlay).
		const group = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
		if (!group) return;

		const shapeEl = group.querySelector(".osmosis-node");
		if (!shapeEl) return;

		if (this.editingNodeId) {
			this.stopEditing(true);
		}

		this.editingNodeId = nodeId;
		this.selectNode(nodeId);

		// Measure the node before hiding it: the overlay is sized from the
		// node's own rendered text, so it inherits the depth-based typography
		// and any per-node style override rather than Obsidian's editor font.
		this.editMetrics = {
			...this.nodeTextMetrics(group),
			maxNodeWidth: this.nodeWrapWidth(node),
		};

		// Hide the in-SVG content while the overlay is active
		const fo = group.querySelector("foreignObject");
		if (fo) fo.classList.add("osmosis-fo-hidden");

		// On mobile, tell the Chromium WebView to overlay the keyboard instead
		// of resizing the viewport (the root cause of the map disappearing).
		// VirtualKeyboard API is not in TS standard lib, so we need unsafe access.
		const vk: {
			overlaysContent: boolean;
			addEventListener: (type: string, fn: () => void) => void;
			removeEventListener: (type: string, fn: () => void) => void;
		} | null =
			"virtualKeyboard" in navigator
				? (navigator as unknown as { virtualKeyboard: { overlaysContent: boolean; addEventListener: (type: string, fn: () => void) => void; removeEventListener: (type: string, fn: () => void) => void } }).virtualKeyboard
				: null;
		if (vk) vk.overlaysContent = true;

		const isMobile = Platform.isMobile;

		// Create container div for the embedded editor
		const container = createDiv();
		container.className = "osmosis-edit-overlay";

		if (isMobile) {
			// Lock the map to position:fixed so it escapes Obsidian's layout
			// resize when the virtual keyboard opens, keeping its pre-keyboard
			// pixel dimensions and staying unaffected by parent shrinking. On
			// the transform path this has to be the host, not the SVG: the SVG
			// is mid-transform, so its client rect is the *panned* box rather
			// than the viewport, and pinning it would also lift its clipping.
			const pinned = this.viewportHost ?? this.svg;
			if (pinned) {
				const rect = pinned.getBoundingClientRect();
				const s = pinned.style;
				s.position = "fixed";
				s.left = `${rect.left}px`;
				s.top = `${rect.top}px`;
				s.width = `${rect.width}px`;
				s.height = `${rect.height}px`;
				s.zIndex = "9998";
			}

			// Mobile: use fixed positioning on document.body to escape
			// Obsidian's layout resize when the keyboard opens.
			document.body.appendChild(container);
		} else {
			// Desktop: absolute positioning inside container
			this.contentEl.appendChild(container);
		}

		this.editContainer = container;
		this.positionEditOverlay();

		// Add save/cancel buttons floating above the editor
		const cancelBtn = createEl("button");
		cancelBtn.className = "osmosis-edit-btn osmosis-edit-cancel";
		cancelBtn.setAttribute("aria-label", "Cancel editing");
		setIcon(cancelBtn, "x");
		cancelBtn.addEventListener("pointerdown", (e) => {
			e.preventDefault(); // Prevent blur
			e.stopPropagation();
			this.stopEditing(false);
		});
		const saveBtn = createEl("button");
		saveBtn.className = "osmosis-edit-btn osmosis-edit-save";
		saveBtn.setAttribute("aria-label", "Save changes");
		setIcon(saveBtn, "check");
		saveBtn.addEventListener("pointerdown", (e) => {
			e.preventDefault(); // Prevent blur
			e.stopPropagation();
			this.stopEditing(true);
		});
		container.appendChild(cancelBtn);
		container.appendChild(saveBtn);

		// Prevent clicks on the editor container from reaching the SVG/mind map
		container.addEventListener("pointerdown", (e) => e.stopPropagation());
		container.addEventListener("click", (e) => e.stopPropagation());
		// A double click in the editor selects a word, as in note edit mode. It stays here so the map's
		// `handleDblClick` doesn't start another edit.
		container.addEventListener("dblclick", (e) => e.stopPropagation());

		// Edit the node's source line — bullet/heading/checkbox markers and all
		// — so every markdown element is reachable from the map. Its leading
		// indentation and trailing block ID stay hidden; both are restored on
		// save (see `nodeEditText` / `restoreEditedLine`).
		const editValue = edit.nodeEditText(node.source);
		const selStart = edit.editSelectionStart(editValue, node.source.content);

		// Try to instantiate the embedded Obsidian editor; fall back to textarea
		try {
			const editor = new EmbeddableMarkdownEditor(this.app, container, {
				value: editValue,
				cls: "osmosis-node-editor",
				file: this.nodeFile(node.source),
				// Plugins that look for the active MarkdownView (QuickAdd) find this editor.
				view: this,
				// Enter saves; Shift+Enter falls through to CodeMirror for a new line. An open suggestion popup keeps the key.
				onEnter: (_editor, mod, shift) => {
					if (!enterSavesEdit(mod, shift) || suggestOpen()) return false;
					queueMicrotask(() => this.stopEditing(true));
					return true;
				},
				onSubmit: () => {
					// Ctrl+Enter saves
					// Defer so CM keymap handler returns true (suppressing the event)
					// before the editor is destroyed; otherwise the keystroke leaks
					// to the workspace and reaches the left-side markdown editor.
					queueMicrotask(() => this.stopEditing(true));
				},
				onEscape: () => {
					// Escape cancels
					queueMicrotask(() => this.stopEditing(false));
				},
				onBlur: () => {
					// Small delay to allow click events to process first
					window.setTimeout(() => {
						if (this.editingNodeId === nodeId) {
							this.stopEditing(true);
						}
					}, 100);
				},
				extensions: [
					autoResizeExtension(() => this.resizeEditContainer()),
					// The overlay stops widening at the node's wrap width, so
					// long lines have to wrap here exactly as they do in the node.
					EditorView.lineWrapping,
				],
			});

			this.editEditor = editor;

			// Focus the CM6 editor and select the node's text, leaving the
			// structural prefix in place so typing over it doesn't strip the
			// bullet / heading marker the line is made of.
			editor.editor.cm.focus();
			const doc = editor.editor.cm.state.doc;
			editor.editor.cm.dispatch({
				selection: EditorSelection.range(selStart, doc.length),
			});
		} catch (err) {
			console.warn(
				"Osmosis: EmbeddableMarkdownEditor failed, falling back to textarea",
				err,
			);
			container.remove();
			this.editContainer = null;
			this.createFallbackTextarea(editValue, selStart, nodeId, isMobile);
		}

		// On mobile, reposition editor above keyboard if it would be hidden
		const cleanups: Array<() => void> = [];
		if (isMobile) {
			const repositionAboveKeyboard = () =>
				this.clampOverlayAboveKeyboard();
			if (vk) {
				vk.addEventListener("geometrychange", repositionAboveKeyboard);
				cleanups.push(() =>
					vk.removeEventListener(
						"geometrychange",
						repositionAboveKeyboard,
					),
				);
			}
			if (window.visualViewport) {
				window.visualViewport.addEventListener(
					"resize",
					repositionAboveKeyboard,
				);
				cleanups.push(() =>
					window.visualViewport?.removeEventListener(
						"resize",
						repositionAboveKeyboard,
					),
				);
			}
		}

		// Scroll lock as a safety net
		const lockScroll = () => {
			let el: Element | null = this.contentEl;
			while (el) {
				el.scrollTop = 0;
				el.scrollLeft = 0;
				el = el.parentElement;
			}
		};
		this.contentEl.addEventListener("scroll", lockScroll, true);
		cleanups.push(() =>
			this.contentEl.removeEventListener("scroll", lockScroll, true),
		);

		this.editCleanup = () => {
			for (const fn of cleanups) fn();
			if (vk) vk.overlaysContent = false;
		};

		lockScroll();
	}

	/**
	 * Font size and line height of a node's rendered content, in map units.
	 * Read off the live element so depth-based typography and per-node style
	 * overrides come along for free.
	 */
	private nodeTextMetrics(group: Element): {
		fontSize: number;
		lineHeight: number;
	} {
		const wrapper = group.querySelector(".osmosis-node-content");
		const fallback = { fontSize: 13, lineHeight: 13 * 1.3 };
		if (!(wrapper instanceof HTMLElement)) return fallback;

		const computed = window.getComputedStyle(wrapper);
		const fontSize = parseFloat(computed.fontSize);
		if (!Number.isFinite(fontSize)) return fallback;
		// `line-height: normal` parses as NaN — fall back to the CSS ratio.
		const lineHeight = parseFloat(computed.lineHeight);
		return {
			fontSize,
			lineHeight: Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.3,
		};
	}

	/** The width a node's text wraps at, in map units. */
	private nodeWrapWidth(node: LayoutNode): number {
		// A node with an explicit width wraps at that width; everything else
		// grows until it hits the map's max node width.
		const customWidth =
			lookupNodeStyle(this.osmosisStyleFrontmatter, node)?.width ??
			this.mapSettings.baseStyle?.width;
		if (customWidth !== undefined) return node.rect.width;
		return (
			this.mapSettings.maxNodeWidth ??
			this.plugin.settings.defaultMaxNodeWidth
		);
	}

	/**
	 * Place the edit overlay over its node and size its text for the current
	 * zoom. Called when editing starts and again from `updateViewBox`, so the
	 * overlay tracks the node through pans and zooms rather than staying
	 * pinned where the node was when editing began.
	 */
	private positionEditOverlay(): void {
		const container = this.editContainer;
		const metrics = this.editMetrics;
		if (!container || !metrics || !this.editingNodeId || !this.svg) return;

		const group = this.svg.querySelector(
			`[data-node-id="${this.editingNodeId}"]`,
		);
		const shapeEl = group?.querySelector(".osmosis-node");
		if (!shapeEl) return;
		const nodeRect = shapeEl.getBoundingClientRect();

		// Mobile positions against the visual viewport (the overlay is fixed on
		// document.body); desktop against the view's own content box.
		const isMobile = Platform.isMobile;
		const hostRect = this.contentEl.getBoundingClientRect();
		const host = isMobile
			? {
					left: 0,
					top: 0,
					right: window.innerWidth,
					bottom: window.visualViewport?.height ?? window.innerHeight,
				}
			: hostRect;

		const cfg = DEFAULT_LAYOUT_CONFIG;
		const geom = edit.editOverlayGeometry({
			nodeRect: {
				left: nodeRect.left,
				top: nodeRect.top,
				width: nodeRect.width,
				height: nodeRect.height,
			},
			viewport: {
				left: host.left,
				top: host.top,
				right: host.right - EDIT_OVERLAY_MARGIN,
				bottom: host.bottom - EDIT_OVERLAY_MARGIN,
			},
			zoom: this.zoom,
			fontSize: metrics.fontSize,
			lineHeight: metrics.lineHeight,
			paddingX: cfg.nodePaddingX,
			paddingY: cfg.nodePaddingY,
			maxNodeWidth: metrics.maxNodeWidth,
		});

		const originX = isMobile ? 0 : hostRect.left;
		const originY = isMobile ? 0 : hostRect.top;
		container.setCssStyles({
			position: isMobile ? "fixed" : "absolute",
			left: `${geom.left - originX}px`,
			top: `${geom.top - originY}px`,
			minWidth: `${geom.minWidth}px`,
			minHeight: `${geom.minHeight}px`,
			maxWidth: `${geom.maxWidth}px`,
			maxHeight: `${geom.maxHeight}px`,
			zIndex: isMobile ? "10000" : "1000",
		});
		// Typography is applied as custom properties so the CSS can force it
		// onto CodeMirror's own elements (see styles.css).
		container.style.setProperty(
			"--osmosis-edit-font-size",
			`${geom.fontSize}px`,
		);
		container.style.setProperty(
			"--osmosis-edit-line-height",
			`${geom.lineHeight}px`,
		);
		container.style.setProperty(
			"--osmosis-edit-padding",
			`${geom.paddingY}px ${geom.paddingX}px`,
		);

		// The last auto-resize froze an explicit width for the *previous* zoom;
		// drop it and let the editor re-derive one at the new text size.
		container.style.removeProperty("width");
		container.classList.toggle(
			"osmosis-edit-narrow",
			geom.minWidth < EDIT_BUTTONS_MIN_WIDTH,
		);
		this.resizeEditContainer();
		if (isMobile) this.clampOverlayAboveKeyboard();
	}

	/** Keep the overlay above the mobile virtual keyboard. */
	private clampOverlayAboveKeyboard(): void {
		if (!this.editContainer) return;
		const availableH = window.visualViewport?.height ?? window.innerHeight;
		const elRect = this.editContainer.getBoundingClientRect();
		if (elRect.bottom > availableH - EDIT_OVERLAY_MARGIN) {
			this.editContainer.style.top = `${availableH - elRect.height - EDIT_OVERLAY_MARGIN}px`;
		}
	}

	/** Auto-resize the edit container to fit the editor's content.
	 *  Called via the autoResizeExtension on doc changes. We use
	 *  requestMeasure to avoid layout thrash — just request CM6 to
	 *  re-measure, and the container's height:fit-content handles the rest. */
	private resizeEditContainer(): void {
		if (!this.editContainer || !this.editEditor) return;
		const cm = this.editEditor.editor?.cm;
		if (!cm) return;

		// Measure the longest line's pixel width using CM's character metrics
		const doc = cm.state.doc;
		const charWidth = cm.defaultCharacterWidth;
		let maxChars = 0;
		for (let i = 1; i <= doc.lines; i++) {
			maxChars = Math.max(maxChars, doc.line(i).length);
		}
		// Content width = longest line + the node's padding at the current zoom
		// (+ 4px buffer + 2px border each side)
		const contentWidth =
			maxChars * charWidth +
			DEFAULT_LAYOUT_CONFIG.nodePaddingX * 2 * this.zoom +
			8;

		const minWidth = parseFloat(this.editContainer.style.minWidth) || 0;
		const maxWidth =
			parseFloat(this.editContainer.style.maxWidth) || Infinity;
		const newWidth = Math.min(Math.max(contentWidth, minWidth), maxWidth);
		this.editContainer.style.width = `${newWidth}px`;

		// Toggle stacked button layout when container is narrow
		this.editContainer.classList.toggle(
			"osmosis-edit-narrow",
			newWidth < EDIT_BUTTONS_MIN_WIDTH,
		);

		cm.requestMeasure();
	}

	/** Fallback: create a plain textarea if the embedded editor fails */
	private createFallbackTextarea(
		editValue: string,
		selStart: number,
		nodeId: string,
		isMobile: boolean,
	): void {
		const container = createDiv();
		container.className = "osmosis-edit-overlay";

		const input = createEl("textarea");
		input.className = "osmosis-node-input osmosis-fallback-textarea";
		input.value = editValue;
		input.rows = 1;
		input.setCssStyles({ width: "100%", height: "100%" });
		container.appendChild(input);

		if (isMobile) document.body.appendChild(container);
		else this.contentEl.appendChild(container);

		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey || enterSavesEdit(false, e.shiftKey))) {
				this.stopEditing(true);
				e.preventDefault();
				e.stopPropagation();
			} else if (e.key === "Escape") {
				this.stopEditing(false);
				e.preventDefault();
				e.stopPropagation();
			}
			// Prevent keyboard nav while editing
			e.stopPropagation();
		});

		input.addEventListener("blur", () => {
			window.setTimeout(() => {
				if (this.editingNodeId === nodeId) {
					this.stopEditing(true);
				}
			}, 100);
		});

		this.editContainer = container;
		this.positionEditOverlay();

		input.focus({ preventScroll: true });
		input.setSelectionRange(selStart, editValue.length);
	}

	private stopEditing(save: boolean): void {
		if (!this.editingNodeId || !this.svg) return;

		const nodeId = this.editingNodeId;
		// Get the edited line from the embedded editor or fallback textarea.
		// This is the node's whole source line — markers included, block ID
		// excluded (see `nodeEditText`) — not just its label text.
		let newLine = "";
		if (this.editEditor) {
			newLine = this.editEditor.value;
		} else if (this.editContainer) {
			const textarea = this.editContainer.querySelector("textarea");
			newLine = textarea?.value ?? "";
		}
		this.editingNodeId = null;

		// Clean up event listeners, virtualKeyboard state, scroll locks
		if (this.editCleanup) {
			this.editCleanup();
			this.editCleanup = null;
		}

		// Destroy embedded editor if present
		if (this.editEditor) {
			this.editEditor.destroy();
			this.editEditor = null;
		}

		// Remove the container (works for both body and contentEl)
		if (this.editContainer) {
			this.editContainer.remove();
			this.editContainer = null;
		}
		this.editMetrics = null;

		// Restore the map from fixed positioning used during mobile editing
		const pinned = this.viewportHost ?? this.svg;
		if (pinned) {
			const s = pinned.style;
			s.position = "";
			s.left = "";
			s.top = "";
			s.width = "";
			s.height = "";
			s.zIndex = "";
		}

		// Restore visibility of the in-SVG content
		const group = this.svg.querySelector(`[data-node-id="${nodeId}"]`);
		if (group) {
			const fo = group.querySelector("foreignObject");
			if (fo) fo.classList.remove("osmosis-fo-hidden");
		}

		const node = this.nodeMap.get(nodeId);
		if (!node) return;

		if (save && newLine !== edit.nodeEditText(node.source)) {
			// Store range.start so render() can re-select the node after
			// the SVG is rebuilt (node IDs change when content changes).
			this.pendingSelectionRangeStart = node.source.range.start;
			// Write change back to markdown (triggers re-render)
			void this.renameNode(node, newLine);
		}

		// Clear cursor-sync highlight to avoid stale dashed outline
		this.setCursorSyncHighlight(null);

		this.contentEl.focus({ preventScroll: true });
		this.updateToolbarState();
	}

	// ─── Map → Markdown Sync ────────────────────────────────

	/**
	 * Ensure exactly one blank line before and after headings, top-level
	 * code fences, tables, and standalone paragraphs. Delegates to the shared
	 * `normalizeBlockSpacing` so the map and the line-card generator apply the
	 * same "one line = one block" convention.
	 */
	private normalizeHeadingSpacing(content: string): string {
		return normalizeBlockSpacing(content).content;
	}

	/**
	 * Serialize a node type/depth/content back to a markdown line. Delegates to
	 * the tested pure transform in `mindmap-edit`; pass `blockId` to preserve a
	 * trailing `^id` (the parser strips it out of `content`).
	 */
	private serializeLine(
		type: OsmosisNode["type"],
		depth: number,
		content: string,
		blockId?: string,
	): string {
		return edit.serializeLine(type, depth, content, blockId);
	}

	/**
	 * Find the end of a node's entire subtree. Delegates to the tested pure
	 * transform in `mindmap-edit` (includes any trailing `^id` line).
	 */
	private subtreeEnd(node: OsmosisNode): number {
		return edit.subtreeEnd(node);
	}

	/**
	 * Start / end of a node in the file being spliced, folding an embed
	 * expansion to its `![[…]]` line's host span. Used for drop insert offsets,
	 * which may reference transcluded content whose own `range` indexes a
	 * different (source) file. Delegates to `mindmap-edit`.
	 */
	private nodeHostStart(node: OsmosisNode): number {
		return edit.nodeHostStart(node);
	}
	private subtreeHostEnd(node: OsmosisNode): number {
		return edit.subtreeHostEnd(node);
	}

	/**
	 * Undo or redo the last map edit to this map's note, from the shared history.
	 *
	 * Map edits write to disk via vault.modify / processFrontMatter, bypassing
	 * CodeMirror, so there is no editor undo stack to forward to — this restores
	 * the recorded before/after content instead. It sees edits any Osmosis view
	 * made to this note (see `src/edit-history.ts`), but not edits made in a
	 * separate Markdown editor, and no-ops when there is nothing to undo.
	 */
	private forwardUndoRedo(isRedo: boolean): void {
		if (!this.assertEditable()) return;
		if (this.historyKey === null) return;
		this.perf?.editStarted();
		void this.applySnapshot(this.edits.step(this.historyKey, isRedo));
	}

	/** Undo the last map edit. Public entry point for the properties sidebar,
	 *  which forwards Ctrl+Z/Y while it (not the map) holds keyboard focus. */
	undo(): void {
		this.forwardUndoRedo(false);
	}

	/** Redo the last undone map edit (see {@link undo}). */
	redo(): void {
		this.forwardUndoRedo(true);
	}

	/**
	 * Begin a live-edit session — a burst of rapid writes from one interaction
	 * (a color-picker drag) that should read as a single undoable change. Suspends
	 * reload-on-modify (see the vault "modify" handler) and coalesces snapshots
	 * until {@link endLiveEdit}.
	 */
	beginLiveEdit(): void {
		this.edits.recorder.beginLive();
	}

	/** End a live-edit session, recording one undo step for the whole burst. */
	endLiveEdit(): void {
		this.edits.recorder.endLive();
	}

	/**
	 * Open an edit group: every write until {@link endEditGroup} accumulates
	 * into one undo step instead of pushing its own. Files may be written more
	 * than once inside a group; the group keeps the first `before` and the last
	 * `after` for each path, so the net change is what gets undone.
	 */
	private beginEditGroup(): void {
		this.edits.recorder.beginGroup();
	}

	/** Close an edit group, pushing its accumulated writes as one undo step. */
	private endEditGroup(): void {
		this.edits.recorder.endGroup();
	}

	/**
	 * Frontmatter write that also records an undo snapshot. Every map style write
	 * goes through this instead of `app.fileManager.processFrontMatter` directly,
	 * so color/shape/variant changes are undoable alongside text edits. The
	 * properties sidebar's map-level writes (theme/layout/background/reset/…) also
	 * route here so they share one undo stack and snapshot path.
	 */
	async processFrontMatterTracked(
		file: TFile,
		fn: (fm: Record<string, unknown>) => void,
	): Promise<void> {
		const after = await this.edits.processFrontMatter(file, fn);

		// processFrontMatter inserts or grows the frontmatter block, shifting
		// every body offset. Rebuild currentTree from the new content so a
		// subsequent range-based structural edit (rename, move, drag, …) does
		// not splice using stale (pre-write) offsets — which otherwise corrupts
		// the file. Callers re-render afterward, repopulating nodeMap from this
		// refreshed tree. (Reloads are suppressed, so nothing else re-parses.)
		if (!this.currentFile) return;
		this.cache.invalidate(file.path);
		const currentPath = this.currentFile.path;
		if (file.path === currentPath) {
			this.currentTree = this.cache.get(currentPath, after);
		} else {
			const parentContent = await this.app.vault.read(this.currentFile);
			this.cache.invalidate(currentPath);
			this.currentTree = this.cache.get(currentPath, parentContent);
		}
		// Re-expand transclusions so embedded content (a no-op when the file has
		// none) survives the tree rebuild instead of collapsing.
		await this.transclusionResolver.expandTree(
			this.currentTree,
			this.lazyTransclusionIds,
		);
	}

	/**
	 * Re-render after an undo/redo (`EditPipeline.step`) has restored its files.
	 * Re-renders from the restored content — reloading frontmatter and clearing
	 * the size cache so both text and style changes are reflected. Handles the
	 * current file and transcluded source files, mirroring the write paths.
	 */
	private async applySnapshot(step: Promise<RestoredFile[] | null>): Promise<void> {
		const restored = await step;
		if (restored === null) return;
		let restoredCurrent: string | null = null;
		for (const file of restored) {
			if (file.path === this.currentFile?.path) restoredCurrent = file.content;
		}

		if (!this.currentFile) return;

		if (restoredCurrent !== null) {
			this.currentTree = this.cache.get(this.currentFile.path, restoredCurrent);
			this.reloadFrontmatterFromContent(restoredCurrent);
			// Recompute derived map settings (theme/layout/background/branch line/…)
			// from the restored frontmatter, mirroring the load flow — otherwise a
			// map-level style undo/redo restores the file but not the live layout.
			this.loadMapSettings();
			this.nodeSizeCache.clear();
		} else {
			// Only transcluded sources changed; re-read the parent so the
			// re-expansion below picks them up.
			const parentContent = await this.app.vault.read(this.currentFile);
			this.cache.invalidate(this.currentFile.path);
			this.currentTree = this.cache.get(this.currentFile.path, parentContent);
		}

		// Re-expand transclusions so an undo/redo that carried an embed keeps it
		// rendered, not collapsed to a bare `![[…]]` placeholder.
		await this.transclusionResolver.expandTree(
			this.currentTree,
			this.lazyTransclusionIds,
		);
		await this.render(true);
	}

	/**
	 * Write markdown content back to the file, suppressing the reload cycle.
	 */
	private async writeMarkdown(newContent: string): Promise<void> {
		if (!this.currentFile) return;
		newContent = this.normalizeHeadingSpacing(newContent);
		await this.edits.write(this.currentFile, newContent);

		// Re-parse and re-render from the new content
		this.currentTree = this.cache.get(this.currentFile.path, newContent);
		// Re-expand transclusions so an embed the edit carried along (e.g. moving
		// a local heading that contains an `![[embed]]`) renders expanded again
		// instead of collapsing to a bare `![[…]]` placeholder. Mirrors
		// writeTranscludedMarkdown / processFrontMatterTracked; a no-op when the
		// file has no embeds.
		await this.transclusionResolver.expandTree(
			this.currentTree,
			this.lazyTransclusionIds,
		);
		await this.render(true);
	}

	/**
	 * Write markdown content to a transcluded source file, then re-render
	 * the current file (re-expanding transclusions to pick up the change).
	 */
	private async writeTranscludedMarkdown(
		sourceFilePath: string,
		newContent: string,
	): Promise<void> {
		if (!this.currentFile) return;
		const sourceFile = this.app.vault.getFileByPath(sourceFilePath);
		if (!(sourceFile instanceof TFile)) return;

		newContent = this.normalizeHeadingSpacing(newContent);
		await this.edits.write(sourceFile, newContent);

		await this.resyncFromParent(true);
	}

	/**
	 * Note that a file the map is built from changed underneath it in a way that
	 * does not affect what is drawn — today, only a debounced schedule flush,
	 * which rewrites frontmatter and nothing else.
	 *
	 * The map is left exactly as it is. What is owed is a re-parse: the tree's
	 * ranges index byte offsets in the file, and a frontmatter block that grew by
	 * a line has moved every one of them. {@link ensureTreeFresh} settles the
	 * debt before anything reads those offsets.
	 */
	private markTreeStale(path: string): void {
		this.staleParsePaths.add(path);
		this.treeStale = true;
	}

	/**
	 * Pay off any deferred re-sync, so the caller can trust `currentTree`'s
	 * offsets against the bytes on disk.
	 *
	 * Every map mutation awaits this first (see {@link assertEditableFresh}), as
	 * does the end of a study session. Cheap and a no-op in the common case —
	 * nothing is owed unless a schedule flush landed since the last re-sync.
	 */
	private async ensureTreeFresh(): Promise<void> {
		if (!this.treeStale) return;
		// Cleared before the await, not after: a flush that lands *during* the
		// re-sync must re-arm the flag rather than be swallowed by it.
		this.treeStale = false;
		const paths = [...this.staleParsePaths];
		this.staleParsePaths.clear();
		for (const path of paths) this.cache.invalidate(path);
		await this.resyncFromParent();
	}

	/**
	 * Rebuild the map from the current (parent) file on disk and re-render.
	 *
	 * The tail every write to a *different* file than the map's own shares: the
	 * parent's bytes are unchanged, but the content it embeds is not, so the tree
	 * has to be re-read and re-expanded for the change to appear.
	 */
	private async resyncFromParent(keepDrawn = false): Promise<void> {
		if (!this.currentFile) return;
		const parentContent = await this.app.vault.read(this.currentFile);
		this.cache.invalidate(this.currentFile.path);
		this.currentTree = this.cache.get(this.currentFile.path, parentContent);
		await this.transclusionResolver.expandTree(
			this.currentTree,
			this.lazyTransclusionIds,
		);
		await this.render(keepDrawn);
	}

	/**
	 * Write one file as part of a multi-file gesture: normalize, record the undo
	 * entry, and stop. Unlike {@link writeMarkdown} / {@link writeTranscludedMarkdown}
	 * it does **not** rebuild or render — a grouped gesture writes several files
	 * and re-syncs once at the end (see {@link moveAcrossFiles}), so rendering per
	 * write would flash the half-applied state through the map.
	 *
	 * Normalization mirrors `writeNodeFile` → `writeMarkdown`: renumber ordered
	 * lists, then normalize heading spacing, so a cross-file move produces the
	 * same spacing and numbering a same-file move would.
	 */
	private async writeFileTracked(file: TFile, content: string): Promise<void> {
		const normalized = this.normalizeHeadingSpacing(
			this.renumberOrderedLists(content),
		);
		await this.edits.write(file, normalized);
	}

	/**
	 * What the shared cross-note move (`src/edit-moves.ts`) needs from this map:
	 * its pipeline, its write normalisation, the frontmatter write that also
	 * re-parses the tree, and the re-sync that runs once the group has closed.
	 */
	private moveContext(): MoveContext {
		return {
			app: this.app,
			edits: this.edits,
			write: (file, content) => this.writeFileTracked(file, content),
			processFrontMatter: (file, fn) => this.processFrontMatterTracked(file, fn),
			plugin: this.plugin,
			settle: () => this.resyncFromParent(),
		};
	}

	/**
	 * Move a contiguous run of siblings out of one note and into another, then
	 * re-sync the map. See `moveAcrossFiles` in `src/edit-moves.ts` for the
	 * write order and the identity migration, which are safety properties.
	 *
	 * @returns true when the move landed; false after a bail (with a notice shown).
	 */
	private async moveAcrossFiles(
		originNodes: OsmosisNode[],
		site: edit.InsertSite,
		originPath: string,
		fallbackContext: (src: OsmosisNode) => {
			type: OsmosisNode["type"];
			depth: number;
		},
	): Promise<boolean> {
		const moved = await moves.moveAcrossFiles(
			this.moveContext(),
			originNodes,
			site,
			originPath,
			fallbackContext,
		);
		return moved !== null;
	}

	/**
	 * Every note the current tree draws bytes from, besides the map's own — the
	 * files whose changes invalidate the offsets this map's nodes carry.
	 */
	private transcludedPaths(): Set<string> {
		const paths = new Set<string>();
		if (!this.currentTree) return paths;
		const visit = (node: OsmosisNode): void => {
			if (node.sourceFile !== undefined) paths.add(node.sourceFile);
			for (const child of node.children) visit(child);
		};
		visit(this.currentTree.root);
		return paths;
	}

	/**
	 * A {@link edit.FileOf} over the currently rendered tree: which file each
	 * node's `range` indexes. Null when there is nothing loaded.
	 */
	private containingFileOf(): edit.FileOf | null {
		if (!this.currentTree || !this.currentFile) return null;
		const hostPath = this.currentFile.path;
		const map = edit.buildContainingFileMap(this.currentTree.root, hostPath);
		return (n) => map.get(n.id) ?? hostPath;
	}

	/**
	 * Resolve a containing-file path to the `TFile` whose bytes an edit reads and
	 * writes.
	 *
	 * Prefer this over {@link getNodeFile} wherever a node's `range` is about to
	 * be sliced or spliced. `getNodeFile` keys off `sourceFile`, which on an
	 * *unexpanded* embed — lazy-loaded or cyclic — names the embed's target while
	 * the node's own range still indexes the file holding the `![[…]]` line.
	 * Routing such a node by `sourceFile` splices host offsets into the target.
	 */
	private fileAtPath(path: string): TFile | null {
		const file = this.app.vault.getFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	/** Write a whole file identified by path, then rebuild and re-render. */
	private async writeFileAtPath(path: string, updated: string): Promise<void> {
		const renumbered = this.renumberOrderedLists(updated);
		if (path === this.currentFile?.path) {
			await this.writeMarkdown(renumbered);
		} else {
			await this.writeTranscludedMarkdown(path, renumbered);
		}
	}

	/**
	 * Rename a node: replace its line in markdown with the edited line.
	 * For transcluded nodes, writes to the source file (not the parent note).
	 *
	 * `newLine` is the source line as the user edited it, structural markers and
	 * all, so changing `- item` to `## item` (or dropping the marker entirely)
	 * is just a rename — no re-serialization from type/depth, which is what used
	 * to pin a node to the kind it was parsed as. The write path re-normalizes
	 * heading spacing and ordered-list numbering, so a line that changes kind
	 * still lands as well-formed markdown.
	 */
	private async renameNode(
		node: LayoutNode,
		newLine: string,
	): Promise<void> {
		if (!this.currentFile) return;
		// The guard ran when the editor opened; the commit starts here.
		this.perf?.editStarted();
		// `startEditing` settled the tree before opening the editor, but a
		// debounced schedule flush can land in the seconds the editor is open and
		// move every offset in the file under it. Settle again and re-resolve the
		// node: IDs are derived from content, which a frontmatter-only write
		// leaves alone, so the same node comes back with corrected ranges.
		let target = node;
		if (this.treeStale) {
			await this.ensureTreeFresh();
			const fresh = this.nodeMap.get(node.source.id);
			if (!fresh) return;
			target = fresh;
		}
		const src = target.source;
		const file = this.getNodeFile(src);
		if (!file) return;

		const content = await this.app.vault.read(file);
		// `renameInFile` restores what the edit box withheld (the node's
		// indentation and its trailing block ID: line-card identity / style
		// anchor). A list item renamed to a heading (or back) takes its children
		// with it, and moves to where its new kind keeps its parent; any other
		// rename is just the one line.
		const ancestors: OsmosisNode[] = [];
		for (let p = target.parent; p; p = p.parent) ancestors.push(p.source);
		const result = edit.renameInFile(content, src, ancestors, newLine);
		const retyped = result.retyped;
		let renamed = result.text;
		// A renamed heading takes its links along (when Obsidian's link
		// auto-update is on): this note's own in the same write, other notes'
		// after it.
		const headingRename = planHeadingRename(this.app, file, lineAt(content, src.range.start), newLine, renamed);
		const ownLinks = headingRename === null ? null : rewriteOwnLinks(this.app, headingRename, renamed);
		if (ownLinks !== null) renamed = ownLinks.text;
		if (!retyped) {
			await this.writeNodeFile(src, renamed);
			if (headingRename !== null) await rewriteVaultLinks(this.app, this.edits, headingRename, ownLinks?.count ?? 0);
			return;
		}
		// The node may have moved, so its old offset no longer finds it; match
		// it by its new kind and unchanged text instead.
		this.pendingSelectionRangeStart = null;
		await this.writeNodeFile(src, renamed);
		const type = src.type === "heading" ? undefined : "heading";
		for (const [id, layoutNode] of this.nodeMap) {
			const s = layoutNode.source;
			if (s.content === src.content && (type ? s.type === type : s.type !== "heading")) {
				this.selectNode(id);
				break;
			}
		}
	}

	/** The find bar's side of the map (`FindHost`): the note's nodes and its transclusions', collapsed ones included. */
	private findHost(): FindHost {
		return {
			items: () => this.findItems(),
			go: (match) => void this.goToFound(match.id),
			highlight: (ids) => this.markFound(ids),
			replaceBlocked: () => (this.isReadingMode ? "Reading mode: map editing is off" : null),
			replace: (plan) => this.replaceFound(plan),
			focusView: () => this.contentEl.focus(),
		};
	}

	/** Every node of the map in document order, a transcluded one filed under its own note. Card fences are data, not text, and are left out. */
	private findItems(): FindItem[] {
		const tree = this.currentTree;
		const file = this.currentFile;
		// A spatial study session hides answers in place, so find has nothing to show while one runs.
		if (!tree || !file || this.spatialMode === "study") return [];
		const items: FindItem[] = [];
		const walk = (node: OsmosisNode): void => {
			for (const child of node.children) {
				const fence = OSMOSIS_FENCE_REGEX.test(child.content.split("\n", 1)[0]?.trim() ?? "");
				if (!fence) items.push({ id: child.id, note: child.isTranscluded && child.sourceFile ? child.sourceFile : file.path, text: child.content, replaceable: replaceableLine(child) });
				walk(child);
			}
		};
		walk(tree.root);
		return items;
	}

	/** Go to a find match: open any collapsed branch it is in, select it and centre it, keeping the zoom. */
	private async goToFound(id: string): Promise<void> {
		if (!this.currentTree) return;
		let expanded = false;
		for (const ancestor of ancestorsOf(this.currentTree.root, id)) {
			expanded = this.collapsedIds.delete(ancestor.id) || expanded;
		}
		if (expanded) await this.render();
		const layoutNode = this.nodeMap.get(id);
		if (!layoutNode) return;
		this.selectNode(id);
		this.centerOnNode(layoutNode);
	}

	/** Mark the find bar's matches on the drawn nodes (and, through `foundIds`, on those drawn later). */
	private markFound(ids: ReadonlySet<string>): void {
		if (this.svg) {
			for (const id of this.foundIds) this.svg.querySelector(`[data-node-id="${id}"]`)?.classList.remove("osmosis-node-find-match");
			for (const id of ids) this.svg.querySelector(`[data-node-id="${id}"]`)?.classList.add("osmosis-node-find-match");
		}
		this.foundIds = ids;
	}

	/**
	 * Write a find bar Replace into its note (the map's own, or a transcluded
	 * one): every line it changes, as renames would (`rewriteLines`), in one
	 * write and one undo step. If a line's bytes changed since the parse,
	 * nothing is written. Renamed headings take their links along, as
	 * `renameNode`'s do.
	 */
	private async replaceFound(plan: ReplacePlan): Promise<boolean> {
		if (!await this.assertEditableFresh() || !this.currentTree) return false;
		const file = this.app.vault.getFileByPath(plan.note);
		if (!(file instanceof TFile)) return false;
		const content = await this.app.vault.read(file);
		const rewrites: LineRewrite[] = [];
		for (const [id, text] of plan.texts) {
			const line = findNodeById(this.currentTree.root, id);
			if (line) rewrites.push({ line, text });
		}
		const done = rewrites.length === plan.texts.size ? rewriteLines(content, rewrites) : null;
		const first = rewrites[0]?.line;
		if (!done || !first) {
			new Notice("Osmosis: that note changed; search again");
			return false;
		}
		let out = done.text;
		if (out === content) return false;
		const renames: { rename: HeadingRename; own: number }[] = [];
		for (const line of done.lines) {
			const rename = planHeadingRename(this.app, file, line.before, line.after, out);
			if (rename === null) continue;
			const own = rewriteOwnLinks(this.app, rename, out);
			out = own.text;
			renames.push({ rename, own: own.count });
		}
		await this.writeNodeFile(first, out);
		for (const { rename, own } of renames) await rewriteVaultLinks(this.app, this.edits, rename, own);
		return true;
	}

	/** The toolbar's Add link: arm on the selection (the next tap on a node is the target), or disarm. */
	private toggleLinkPick(): void {
		if (!this.linkPicker.armed && !this.assertEditable()) return;
		if (this.linkPicker.toggle([...this.selectedNodeIds])) new Notice("Tap the node to link to");
		this.toolRibbon?.setActive("add-link", this.linkPicker.armed);
	}

	/** Escape, reading mode, another note: disarm Add link. True when it was armed. */
	private cancelLinkPick(): boolean {
		const was = this.linkPicker.cancel();
		if (was) this.toolRibbon?.setActive("add-link", false);
		return was;
	}

	/**
	 * A tap or click while Add link is armed, on `nodeId` (null: empty space)
	 * at client point (x, y): the link menu there, or cancel
	 * (`LinkPicker.tap`). The mode ends at the pick, so dismissing the menu
	 * writes nothing and leaves it disarmed.
	 */
	private pickLinkTarget(nodeId: string | null, x: number, y: number): void {
		const pick = this.linkPicker.tap({ target: nodeId, linkable: true });
		this.toolRibbon?.setActive("add-link", this.linkPicker.armed);
		if (pick.kind === "link") this.showLinkMenu(pick.sources, pick.target, x, y);
	}

	/**
	 * The menu the 3D graph shows, for the armed nodes and the tapped target: Add
	 * link (`linkNodes`), Move under, Move after, or for the map's root Move to
	 * end of note (`moveNodesTo`, the drag and drop's write). The moves are
	 * offered only for siblings (a drag moves only those) and never into a
	 * source's own subtree; Add link only when some source can take the link.
	 */
	private showLinkMenu(sourceIds: readonly string[], targetId: string, x: number, y: number): void {
		const target = this.nodeMap.get(targetId);
		const sources = sourceIds.flatMap((id) => {
			const node = this.nodeMap.get(id);
			return node === undefined ? [] : [node];
		});
		if (target === undefined || sources.length === 0) {
			new Notice("Osmosis: that line has changed; try again");
			return;
		}
		const root = target.source.type === "root";
		const hostPath = this.currentFile?.path;
		// As `linkNodes` judges it: the root and embed lines take no link, and the root links to its own note, which a line there can't hold.
		const canLink = target.source.type !== "transclusion" && sources.some((node) => {
			const type = node.source.type;
			return type !== "root" && type !== "transclusion" && (!root || this.getNodeFile(node.source)?.path !== hostPath);
		});
		const parent = sources[0]!.parent;
		const canMove = parent !== null && parent !== undefined
			&& sources.every((node) => node.parent === parent && !this.isDescendant(node, target));
		const items = linkMenuItems({ canLink, canMove, line: !root, root });
		if (items.length === 0) {
			new Notice("Osmosis: can't link or move those nodes there");
			return;
		}
		const menu = new Menu();
		for (const { choice, title, icon } of items) {
			menu.addItem((item) => item.setTitle(title).setIcon(icon).onClick(() => {
				if (choice === "link") void this.linkNodes(sourceIds, targetId);
				else void this.moveNodesBy(sourceIds, targetId, choice);
			}));
		}
		// After the release's own click has gone by, so it cannot close the menu.
		window.setTimeout(() => menu.showAtPosition({ x, y }), 0);
	}

	/** The link menu's moves: `sourceIds` (siblings) under or after `targetId`, or to the end of the map's note. */
	private async moveNodesBy(sourceIds: readonly string[], targetId: string, place: "under" | "after" | "end"): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		const root = this.currentTree?.root;
		const target = this.nodeMap.get(targetId);
		const first = sourceIds[0];
		const parent = target?.parent;
		const drop = root === undefined || target === undefined || first === undefined ? null
			: place === "under" ? { parentId: targetId, index: target.source.children.length }
			: place === "end" ? { parentId: root.id, index: root.children.length }
			: parent ? { parentId: parent.source.id, index: parent.source.children.indexOf(target.source) + 1 }
			: null;
		if (drop === null || first === undefined) {
			new Notice("Osmosis: that line has changed; try again");
			return;
		}
		await this.moveNodesTo(first, new Set(sourceIds), drop);
	}

	/**
	 * Add a link to node `targetId` at the end of each source node's line, the
	 * same edit as the 3D graph's "Add link" (`planSelectionLink`): the target
	 * linked by its heading text or a block ID (stamped if it has none), the map's
	 * root linked as its note. Each end is found again in a fresh parse of its
	 * own file (a transcluded node's is its source file), and every file is
	 * written in one undo step, the target's first.
	 */
	private async linkNodes(sourceIds: readonly string[], targetId: string): Promise<void> {
		if (!await this.assertEditableFresh()) return;
		const changed = (): void => void new Notice("Osmosis: that line has changed; try again");
		const target = this.nodeMap.get(targetId)?.source;
		const sources = sourceIds.flatMap((id) => {
			const src = this.nodeMap.get(id)?.source;
			return src === undefined ? [] : [src];
		});
		if (target === undefined || sources.length === 0) return changed();
		// An embed line belongs to the note around it, not the one `getNodeFile` names; it can't take a link or an ID anyway.
		if (target.type === "transclusion") {
			new Notice("Osmosis: can't link to that line (it can't take a block ID)");
			return;
		}
		const toFile = this.getNodeFile(target);
		if (toFile === null) return changed();
		try {
			const notes = new Map<string, PlanNote>();
			const note = async (file: TFile): Promise<PlanNote> => {
				const known = notes.get(file.path);
				if (known !== undefined) return known;
				const content = await this.app.vault.read(file);
				const read = { content, root: this.parser.parse(content, file.path).root };
				notes.set(file.path, read);
				return read;
			};
			// The fresh node that is `src`, in `file`'s fresh parse; null when it is gone.
			const fresh = async (src: OsmosisNode, file: TFile): Promise<OsmosisNode | null> => {
				const found = nodeAtStart((await note(file)).root, src.range.start);
				return found !== null && found.type === src.type && found.content === src.content ? found : null;
			};
			const toNode = target.type === "root" ? null : await fresh(target, toFile);
			if (target.type !== "root" && toNode === null) return changed();
			if (target.type === "root") await note(toFile);
			const picked: PickedLine[] = [];
			for (const src of sources) {
				const file = src.type === "root" || src.type === "transclusion" ? null : this.getNodeFile(src);
				const line = file === null ? null : await fresh(src, file);
				if (file !== null && line !== null) picked.push({ path: file.path, line });
			}
			const plan = planSelectionLink(notes, picked, { path: toFile.path, node: toNode }, (fromPath, subpath, alias) => this.app.fileManager.generateMarkdownLink(toFile, fromPath, subpath, alias));
			if (plan === null) {
				new Notice("Osmosis: can't link to that line (it can't take a block ID)");
				return;
			}
			if (plan.lines.length === 0) {
				new Notice("Osmosis: can't add a link to that line");
				return;
			}
			// Keep the (first) linked line selected after the re-render, as an edit of its text does.
			const first = plan.lines[0]!;
			if (first.path === this.currentFile?.path) this.pendingSelectionRangeStart = first.start;
			// The target's note first, so a failure leaves a harmless ID rather than a link to nothing.
			const writes = [...plan.texts].sort(([a], [b]) => Number(b === toFile.path) - Number(a === toFile.path));
			this.beginEditGroup();
			try {
				for (const [path, text] of writes) {
					const file = this.app.vault.getFileByPath(path);
					if (file !== null) await this.writeFileTracked(file, text);
				}
			} finally {
				this.endEditGroup();
			}
			await this.resyncFromParent();
		} catch (error) {
			console.error("Osmosis: mind map could not add that link", error);
			new Notice("Osmosis: could not add that link");
		}
	}

	/**
	 * Get the file a node belongs to: source file for transcluded nodes, current file otherwise.
	 */
	private getNodeFile(src: OsmosisNode): TFile | null {
		if (src.isTranscluded && src.sourceFile) {
			const file = this.app.vault.getFileByPath(src.sourceFile);
			return file instanceof TFile ? file : null;
		}
		return this.currentFile;
	}

	/**
	 * Guard for structural edits that splice one file: every node involved must
	 * share an edit target. A block span or insert offset from one file applied
	 * to another's bytes corrupts the destination (most visibly the `![[embed]]`
	 * line), so a move/reorder/indent/copy/delete that crosses a file boundary
	 * (local ↔ embedded, or between two embeds) is refused with a notice.
	 * Returns true when the edit is safe to proceed.
	 */
	private ensureSameFileEdit(nodes: OsmosisNode[]): boolean {
		const first = nodes[0];
		if (!first) return true;
		if (nodes.every((n) => edit.sameEditTarget(first, n))) return true;
		new Notice("Osmosis: can't move a node across an embed boundary");
		return false;
	}

	/**
	 * Renumber ordered list items so consecutive siblings at the same depth
	 * are numbered sequentially (1, 2, 3, ...). Delegates to the tested pure
	 * transform in `mindmap-edit`.
	 */
	private renumberOrderedLists(text: string): string {
		return edit.renumberOrderedLists(text);
	}

	/**
	 * Write updated content to the correct file for a node.
	 */
	private async writeNodeFile(
		src: OsmosisNode,
		updated: string,
	): Promise<void> {
		const renumbered = this.renumberOrderedLists(updated);
		if (src.isTranscluded && src.sourceFile) {
			await this.writeTranscludedMarkdown(src.sourceFile, renumbered);
		} else {
			await this.writeMarkdown(renumbered);
		}
	}

	/**
	 * Toggle the checked state of a checkbox node in the source file.
	 */
	private async toggleCheckboxNode(node: OsmosisNode): Promise<void> {
		// Settle first, then re-resolve: the splice below is by byte offset, and
		// the caller's node predates any re-sync this triggers.
		await this.ensureTreeFresh();
		const src = this.currentLayout?.nodes.find((n) => n.source.id === node.id)?.source;
		if (!src) return;
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);
		const lineText = content.slice(src.range.start, src.range.end);
		const isChecked = src.metadata?.checked as boolean;
		const toggled = edit.toggleCheckboxLine(lineText, isChecked);
		const updated =
			content.slice(0, src.range.start) +
			toggled +
			content.slice(src.range.end);
		await this.writeNodeFile(src, updated);
	}

	/**
	 * Add a child node under the given parent.
	 * Inserts a new line at the parent's child boundary — for a heading, before
	 * its first sub-heading, since anything past that reads as the sub-heading's
	 * content rather than the selected node's.
	 * For transcluded parents, writes to the source file.
	 */
	private async addChildNode(parentNode: LayoutNode): Promise<void> {
		const target = await this.assertEditableNode(parentNode);
		if (!target) return;
		if (!this.currentFile) return;
		const src = target.source;
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);

		const updated = edit.insertChild(content, src).text;

		const selectedId = this.selectedNodeId;
		await this.writeNodeFile(src, updated);

		// Find and start editing the newly added node (last child of parent)
		this.startEditingNewNode(selectedId, true);
	}

	/**
	 * Add a sibling node after the given node (or before it with `before`).
	 * Inserts a new line after the node's subtree at the same level.
	 * For transcluded nodes, writes to the source file.
	 */
	private async addSiblingNode(node: LayoutNode, before = false): Promise<void> {
		const target = await this.assertEditableNode(node);
		if (!target) return;
		if (!this.currentFile) return;
		const src = target.source;
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);

		const updated = (before ? edit.insertSiblingBefore : edit.insertSibling)(content, src).text;

		const selectedId = this.selectedNodeId;
		await this.writeNodeFile(src, updated);

		// Find and start editing the new sibling (the node right after the original, or right before it)
		this.startEditingNewNode(selectedId, false);
	}

	/**
	 * Delete a node and all its children from the markdown.
	 * For transcluded nodes, deletes from the source file.
	 */
	private async deleteNode(node: LayoutNode): Promise<void> {
		const target = await this.assertEditableNode(node);
		if (!target) return;
		if (!this.currentFile) return;
		const src = target.source;
		const file = this.getNodeFile(src);
		if (!file) return;
		const content = await this.app.vault.read(file);

		const updated = edit.deleteSubtree(content, src);

		// The previous sibling, else the parent, is selected after deletion.
		const afterId = selectAfterDelete(this.treeRootOf(node), [src.id]);
		await this.writeNodeFile(src, updated);

		// Without panning to it: deleting a node must leave the viewport where
		// the user had it.
		this.selectNodeAfterDelete(afterId);
	}

	/**
	 * Move a node and its subtree into a new note, leaving an `![[embed]]` in
	 * its place (see `src/convert-branch.ts`). One undo step reverts the map's
	 * note, the moved styles and history, and the rewritten links; the new note
	 * itself stays (undo can't delete a file).
	 */
	private async convertBranch(node: LayoutNode): Promise<void> {
		const target = await this.assertEditableNode(node);
		if (!target || !this.currentFile) return;
		if (target.source.type === "root" || !canConvertBranch(target.source)) return;
		const { branchNoteFolder: folder, branchNoteTemplate: template } = this.plugin.settings;
		await convertBranchToNote(this.moveContext(), { folder, template }, this.currentFile, target.source.id);
	}

	/**
	 * After adding a child or sibling, find the new node and start editing it.
	 */
	private startEditingNewNode(
		previousSelectedId: string | null,
		isChild: boolean,
	): void {
		if (!previousSelectedId) return;

		// The tree has been re-parsed, so we need to find the original node by position match
		// The new node will have empty content (or just a checkbox/placeholder)
		for (const [id, layoutNode] of this.nodeMap) {
			const c = layoutNode.source.content;
			const stripped = c.replace(/[\u200B\u00A0]/g, "");
			const isEmpty = stripped.trim() === ""
				|| /^\[[ xX]\]\s*$/.test(stripped);
			if (isEmpty) {
				this.selectNode(id);
				this.scrollToSelectedNode();
				void this.startEditing(id);
				return;
			}
		}
	}

	// ─── Rendering ───────────────────────────────────────────

	private getOffsetX(): number {
		if (!this.currentLayout) return LAYOUT_PADDING;
		return -this.currentLayout.bounds.x1 + LAYOUT_PADDING;
	}

	private getOffsetY(): number {
		if (!this.currentLayout) return LAYOUT_PADDING;
		return -this.currentLayout.bounds.y1 + LAYOUT_PADDING;
	}

	/**
	 * Repaint the map, one pass at a time.
	 *
	 * Passes are queued rather than run concurrently. {@link renderPass} unloads
	 * the previous render `Component` and empties the container partway through,
	 * after an `await` on node measurement — so two passes overlapping means the
	 * second tears down the DOM and the Markdown-render component the first is
	 * still filling, leaving detached nodes and a half-built SVG. Callers await
	 * the same promise they always did and still see a finished `nodeMap`.
	 *
	 * The chain absorbs a rejection so one failed pass cannot wedge every later
	 * one; the pass's own promise still rejects for its caller.
	 */
	private render(keepDrawn = false): Promise<void> {
		const next = this.renderChain.then(() => this.renderPass(keepDrawn));
		this.renderChain = next.catch(() => undefined);
		return next;
	}

	/**
	 * @param keepDrawn the pass follows a map edit: keep the node groups that
	 *   would draw the same and move them into place (see {@link redrawInPlace}).
	 */
	private async renderPass(keepDrawn = false): Promise<void> {
		if (this.closed) return;
		const container = this.contentEl;
		const perfStart = this.perf?.start() ?? 0;

		// Clean up previous render component
		this.renderComponent?.unload();
		this.renderComponent = new Component();
		this.renderComponent.load();

		if (!this.currentTree) {
			this.toolRibbon?.detach();
			this.findBar?.detach();
			container.empty();
			container.addClass("osmosis-mindmap-container");
			container.createEl("p", {
				text: "Open a Markdown file to view its mind map.",
			});
			return;
		}

		// Resolve active theme BEFORE measurement so font/style changes
		// are reflected in node sizing (not stale from the previous render).
		const themeName = this.mapSettings.theme;
		if (themeName && !isDefaultTheme(themeName)) {
			this.activeTheme = getTheme(themeName, this.plugin?.settings?.customThemes);
		} else {
			this.activeTheme = undefined;
		}
		this.effectiveTheme = this.getEffectiveTheme();

		// Build per-node shape overrides from frontmatter
		const nodeShapes = this.buildNodeShapeMap();

		// Measure actual content sizes in a detached div to avoid clearing the
		// visible SVG. This prevents the flash/blip during re-renders.
		const nodeSizes = await this.measureNodeSizes(
			container,
			this.currentTree,
			nodeShapes,
		);
		const measured = this.perf?.start() ?? 0;

		const layout = computeLayout(
			this.currentTree,
			{
				direction: this.mapSettings.direction,
				horizontalSpacing: this.mapSettings.horizontalSpacing,
				verticalSpacing: this.mapSettings.verticalSpacing,
				topicShape: this.mapSettings.topicShape ?? "rounded-rect",
				balance: this.mapSettings.balance ?? "one-side",
				layoutSide: this.mapSettings.layoutSide ?? "right",
			},
			this.collapsedIds,
			nodeSizes,
			nodeShapes,
			this.buildNodeSidesMap(),
		);
		const laidOut = this.perf?.start() ?? 0;
		// The SVG draws layout space shifted by -bounds (see getOffsetX/Y), so an
		// edit that moves the map's top-left bound — deleting the widest node on
		// a left-side map, say — would slide the whole drawing under a fixed
		// viewBox. Move the viewBox by the same amount so content stays put.
		const prevOffset = this.currentLayout
			? { x: this.getOffsetX(), y: this.getOffsetY() }
			: null;
		this.currentLayout = layout;
		this.drawGeneration++;
		if (prevOffset && this.svg) {
			this.viewBox.x += this.getOffsetX() - prevOffset.x;
			this.viewBox.y += this.getOffsetY() - prevOffset.y;
		}

		// Build node map for keyboard nav
		this.nodeMap.clear();
		for (const node of layout.nodes) {
			if (node.source.type !== "root") {
				this.nodeMap.set(node.source.id, node);
			}
		}

		// Now that measurement and layout are done, swap out the old SVG.
		// Defer container.empty() until just before appending the new SVG
		// to avoid a visible flash.
		const isFirstRender = !this.svg;
		const inPlace = keepDrawn && this.canRedrawInPlace(container);
		this.toolRibbon?.detach();
		this.findBar?.detach();
		if (inPlace) {
			// Everything but the map itself goes, as `empty()` would take it.
			const live = this.viewportHost ?? this.svg;
			for (const child of Array.from(container.childNodes)) {
				if (child !== live) child.remove();
			}
		} else {
			container.empty();
		}
		container.addClass("osmosis-mindmap-container");

		const kept = inPlace
			? await this.redrawInPlace(container, layout)
			: (await this.renderSvg(container, layout), 0);

		// Auto-frame all content on initial open so the user sees the whole map
		if (isFirstRender) {
			this.fitToView();
		}

		// Re-apply spatial study state after re-render (render wipes the DOM,
		// including a mid-rating bubble and the progress pill)
		this.applySpatialState();

		// After a save-edit re-render, re-select the node at the stored position
		if (this.pendingSelectionRangeStart !== null) {
			const rangeStart = this.pendingSelectionRangeStart;
			this.pendingSelectionRangeStart = null;
			for (const [id, layoutNode] of this.nodeMap) {
				if (layoutNode.source.range.start === rangeStart) {
					this.selectNode(id);
					break;
				}
			}
		}

		// Re-attach toolbar (container.empty() removes it)
		this.toolRibbon?.attach();
		this.updateToolbarState();
		// The find bar too, and find again in what was just drawn.
		this.findBar?.attach();
		this.findBar?.refresh();
		this.perf?.attach();
		this.perf?.rendered(perfStart, measured - perfStart, laidOut - measured, kept, this.renderedNodeIds.size);
	}

	/**
	 * Measure actual rendered content sizes for all nodes.
	 * Creates a hidden offscreen container, renders each node's markdown,
	 * and measures the resulting dimensions.
	 *
	 * Two-pass approach: first measure natural (unconstrained) width,
	 * then if it exceeds maxNodeWidth, constrain width and re-measure height.
	 */
	private async measureNodeSizes(
		container: HTMLElement,
		tree: OsmosisTree,
		nodeShapes?: Map<string, TopicShape>,
	): Promise<Map<string, { width: number; height: number }>> {
		const sizes = new Map<string, { width: number; height: number }>();
		const cfg = DEFAULT_LAYOUT_CONFIG;
		const effectiveMaxNodeWidth =
			this.mapSettings.maxNodeWidth ?? this.plugin.settings.defaultMaxNodeWidth;
		// Reduce max content width for shapes with insets so text wraps before
		// the shape boundary clips it.
		const globalShape = this.mapSettings.topicShape ?? "rounded-rect";
		const globalShapeInsets = getShapeInsets(globalShape);
		const globalTotalInsetX = Math.min(globalShapeInsets.left, 0.45) + Math.min(globalShapeInsets.right, 0.45);
		const globalShapeScale = 1 - globalTotalInsetX;
		const defaultContentMaxWidth = effectiveMaxNodeWidth * globalShapeScale - cfg.nodePaddingX * 2;

		const sourcePath = this.currentFile?.path ?? "";
		const allNodes = this.collectAllNodes(tree.root);

		// Build a map of nodeId → tree-path so we can resolve tree-path style
		// selectors during measurement (before the layout tree exists).
		const treePathMap = buildTreePathMap(tree.root);

		// Collect nodes that need measurement (not in cache).
		// Cache key includes heading depth and per-node style hash since typography varies.
		const activeVariantDef = this.osmosisStyleFrontmatter?.activeVariant
			? this.osmosisStyleFrontmatter.variants?.[this.osmosisStyleFrontmatter.activeVariant]
			: undefined;
		const globalWidth = this.mapSettings.baseStyle?.width;
		const toMeasure: { node: OsmosisNode; displayContent: string; cacheKey: string; customWidth?: number }[] = [];
		for (const node of allNodes) {
			if (node.type === "root") continue;
			const displayContent = this.getNodeDisplayContent(node);
			// Include per-node text style, shape, and custom width in cache key so changes invalidate
			const localStyle = lookupNodeStyleByPath(
				this.osmosisStyleFrontmatter, node.id, treePathMap.get(node.id), node.blockId,
			);
			const textStyleKey = localStyle?.text
				? JSON.stringify(localStyle.text)
				: "";
			const shapeKey = nodeShapes?.get(node.id) ?? "";
			const nodeWidth = localStyle?.width ?? globalWidth;
			const widthKey = nodeWidth ? `w${String(nodeWidth)}` : "";
			const isOsmosisCard = this.getOsmosisCardContent(node) !== null;
			const osmosisPrefix = isOsmosisCard ? "osm:" : "";
			const cacheKey = node.type === "heading"
				? `h${String(node.depth)}:${displayContent}:${textStyleKey}:${shapeKey}:${widthKey}`
				: `${osmosisPrefix}${displayContent}:${textStyleKey}:${shapeKey}:${widthKey}`;
			const cached = this.nodeSizeCache.get(cacheKey);
			if (cached) {
				sizes.set(node.id, cached);
			} else {
				toMeasure.push({ node, displayContent, cacheKey, customWidth: nodeWidth });
			}
		}

		// Only create the measurer if there are uncached nodes
		if (toMeasure.length > 0) {
			const measurer = createDiv();
			measurer.style.cssText = `
				position: absolute; left: -9999px; top: -9999px;
				visibility: hidden; pointer-events: none;
			`;
			container.appendChild(measurer);

			// Render every cell first, then read them all: interleaving each
			// render with its own size read forced one layout per node, which
			// on a note with thousands of nodes is most of the opening time.
			// Sizes do not change: a cell's own box does not depend on its
			// siblings. The reads come in two rounds, natural widths and then
			// the wrapped heights of the cells narrowed in between.
			const cells: HTMLDivElement[] = [];
			for (const { node, displayContent } of toMeasure) {
				// Render into a wide cell so nothing wraps, then use Range to
				// measure actual content width (ignores block-level expansion).
				const cell = createDiv();
				cell.className = "osmosis-node-content osmosis-measure-cell markdown-rendered";
				if (node.type === "heading") {
					cell.setAttribute("data-depth", String(node.depth));
				}
				// Apply theme + per-node text styles for accurate measurement
				const nodeDepth = node.type === "heading" ? node.depth : 0;
				const nodeLocalStyle = lookupNodeStyleByPath(
					this.osmosisStyleFrontmatter, node.id, treePathMap.get(node.id), node.blockId,
				);
				const nodeClassStyle = lookupClassStyle(this.osmosisStyleFrontmatter, nodeLocalStyle?.class, this.getGlobalClasses());
				const nodeVariantStyle = activeVariantDef?.[`_n:${node.id}`] ?? activeVariantDef?.[node.content] ?? activeVariantDef?.["*"];
				const style = (this.effectiveTheme || nodeLocalStyle || nodeClassStyle || nodeVariantStyle)
					? resolveNodeStyle(this.effectiveTheme, nodeDepth, nodeLocalStyle, nodeClassStyle, nodeVariantStyle)
					: undefined;
				const textStyles: string[] = ["width: 9999px"];
				if (style?.text?.size) textStyles.push(`font-size: ${String(style.text.size)}px`);
				if (style?.text?.weight) textStyles.push(`font-weight: ${String(style.text.weight)}`);
				if (style?.text?.font) textStyles.push(`font-family: '${style.text.font}', sans-serif`);
				cell.setAttribute("style", textStyles.join("; "));
				measurer.appendChild(cell);

				// Render osmosis fences as cards (front+back) instead of code blocks
				const osmosisCard = this.getOsmosisCardContent(node);
				if (osmosisCard) {
					await this.renderOsmosisCardInto(cell, osmosisCard, sourcePath);
				} else if (this.renderComponent) {
					await MarkdownRenderer.render(
						this.app,
						displayContent,
						cell,
						sourcePath,
						this.renderComponent,
					);
				}

				// Replace video platform links with embedded iframes. Sized, not
				// loaded — this cell exists to be measured and discarded.
				this.replaceVideoEmbeds(cell, undefined, false);

				// Inject checkbox for task-list items (affects size measurement)
				if (node.metadata?.checkbox) {
					const cb = createEl("input");
					cb.type = "checkbox";
					cb.className = "task-list-item-checkbox";
					if (node.metadata.checked) {
						cb.checked = true;
					}
					const p = cell.querySelector("p");
					if (p) {
						p.insertBefore(cb, p.firstChild);
					} else if (cell.firstChild) {
						cell.insertBefore(cb, cell.firstChild);
					}
				}
				cells.push(cell);
			}

			// Use Range to get tight bounding box of actual rendered content
			const contentRects = cells.map((cell) => {
				const range = document.createRange();
				range.selectNodeContents(cell);
				return range.getBoundingClientRect();
			});

			// Widths, and the cells that must be narrowed and read again.
			const results: { width: number; height: number | null }[] = [];
			toMeasure.forEach(({ node, displayContent, customWidth }, i) => {
				const cell = cells[i]!;
				const contentRect = contentRects[i]!;
				const naturalWidth = contentRect.width;
				const osmosisCard = this.getOsmosisCardContent(node);

				// Compute per-node content max width based on effective shape
				const nodeShape = nodeShapes?.get(node.id) ?? globalShape;
				let contentMaxWidth = defaultContentMaxWidth;
				if (nodeShape !== globalShape) {
					const insets = getShapeInsets(nodeShape);
					const insetX = Math.min(insets.left, 0.45) + Math.min(insets.right, 0.45);
					contentMaxWidth = effectiveMaxNodeWidth * (1 - insetX) - cfg.nodePaddingX * 2;
				}
				// A code block with no custom width fits its longest line (up to
				// CODE_FIT_MAX_COLUMNS) instead of the map's max node width.
				if (customWidth === undefined && node.type === "codeblock" && !osmosisCard) {
					contentMaxWidth = codeFitLimitPx(naturalWidth, displayContent, CODE_BLOCK_PAD_PX);
				}

				if (customWidth !== undefined) {
					// Custom width set via drag-to-resize: use it directly
					cell.setCssStyles({ width: `${String(customWidth)}px` });
					results.push({ width: customWidth, height: null });
				} else {
					const finalWidth = Math.min(
						Math.max(Math.ceil(naturalWidth), 40),
						contentMaxWidth,
					);

					if (naturalWidth > contentMaxWidth) {
						// Constrain width and re-measure wrapped height
						cell.setCssStyles({
							width: `${String(contentMaxWidth)}px`,
						});
						results.push({ width: finalWidth, height: null });
					} else {
						results.push({
							width: finalWidth,
							height: Math.max(Math.ceil(contentRect.height), 20),
						});
					}
				}
			});

			toMeasure.forEach(({ node, cacheKey }, i) => {
				const { width, height } = results[i]!;
				const size = {
					width,
					height: height ?? Math.max(Math.ceil(cells[i]!.getBoundingClientRect().height), 20),
				};
				sizes.set(node.id, size);
				this.nodeSizeCache.set(cacheKey, size);
			});

			measurer.remove();
		}

		return sizes;
	}

	/** Collect all OsmosisNodes from the tree into a flat array. */
	/** Build a map of node ID → per-node shape override from frontmatter. */
	private buildNodeShapeMap(): Map<string, TopicShape> {
		const shapes = new Map<string, TopicShape>();
		const fmStyles = this.osmosisStyleFrontmatter?.styles;
		if (!fmStyles || !this.currentTree) return shapes;

		// Build tree-path map so we can resolve tree-path selectors
		const treePathMap = buildTreePathMap(this.currentTree.root);

		const allNodes = this.collectAllNodes(this.currentTree.root);
		for (const node of allNodes) {
			if (node.type === "root") continue;
			const style = lookupNodeStyleByPath(
				this.osmosisStyleFrontmatter, node.id, treePathMap.get(node.id), node.blockId,
			);
			if (!style) continue;
			if (style.shape) {
				shapes.set(node.id, style.shape);
			} else if (style.class) {
				const classStyle = lookupClassStyle(this.osmosisStyleFrontmatter, style.class, this.getGlobalClasses());
				if (classStyle?.shape) {
					shapes.set(node.id, classStyle.shape);
				}
			}
		}
		return shapes;
	}

	private buildNodeSidesMap(): Map<string, LayoutSide> {
		const sides = new Map<string, LayoutSide>();
		const fmStyles = this.osmosisStyleFrontmatter?.styles;
		if (!fmStyles || !this.currentTree) return sides;

		// Build tree-path map so we can resolve tree-path selectors
		const treePathMap = buildTreePathMap(this.currentTree.root);

		const allNodes = this.collectAllNodes(this.currentTree.root);
		for (const node of allNodes) {
			if (node.type === "root") continue;
			const style = lookupNodeStyleByPath(
				this.osmosisStyleFrontmatter, node.id, treePathMap.get(node.id), node.blockId,
			);
			if (style?.side) {
				sides.set(node.id, style.side);
			}
		}
		return sides;
	}

	private collectAllNodes(node: OsmosisNode): OsmosisNode[] {
		const result: OsmosisNode[] = [node];
		for (const child of node.children) {
			result.push(...this.collectAllNodes(child));
		}
		return result;
	}

	/** Get the display content for a node, adding list prefix if needed. */
	private getNodeDisplayContent(node: OsmosisNode): string {
		if (
			node.type === "ordered" &&
			typeof node.metadata?.listNumber === "number"
		) {
			// Escape the dot so MarkdownRenderer renders as plain text, not <ol>
			return `${node.metadata.listNumber}\\. ${node.content}`;
		}
		if (node.type === "bullet") {
			if (node.metadata?.checkbox) {
				// Strip the [ ]/[x] prefix — checkbox input injected post-render
				return node.content.replace(/^\[[ xX]\]\s*/, "");
			}
			return `\u2022 ${node.content}`;
		}
		// A line group (T75) shows all its lines: a cover image above its title.
		return groupDisplayMarkdown(node);
	}

	/** YouTube / video URL patterns → embed URL extractors */
	private static readonly VIDEO_EMBED_PATTERNS: {
		pattern: RegExp;
		toEmbed: (match: RegExpExecArray) => string;
	}[] = [
		{
			// https://www.youtube.com/watch?v=VIDEO_ID or &v=VIDEO_ID
			pattern: /https?:\/\/(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]+)/,
			toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
		},
		{
			// https://youtu.be/VIDEO_ID
			pattern: /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/,
			toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
		},
		{
			// https://www.youtube.com/embed/VIDEO_ID (already embed format)
			pattern: /https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
			toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
		},
		{
			// https://vimeo.com/VIDEO_ID
			pattern: /https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/,
			toEmbed: (m) => `https://player.vimeo.com/video/${m[1]}`,
		},
	];

	/**
	 * Post-render: replace links to video platforms with embedded iframes.
	 * Works in both the measurement div and the actual SVG foreignObject.
	 */
	/**
	 * Swap video-platform links for players.
	 *
	 * `loadPlayer` is false for the offscreen measurement pass, which needs the
	 * player's *box* and nothing else. The element stays an `<iframe>` because
	 * the rule that sizes it is `iframe.osmosis-video-embed` — a placeholder of
	 * any other tag would measure wrong — but without a `src` it costs no
	 * network, no player and no compositing for a node that is about to be
	 * measured and thrown away.
	 */
	private replaceVideoEmbeds(container: HTMLElement, ns?: string, loadPlayer = true): void {
		const links = container.querySelectorAll("a");
		for (const link of Array.from(links)) {
			const href = link.getAttribute("href") ?? "";
			for (const { pattern, toEmbed } of MindMapView.VIDEO_EMBED_PATTERNS) {
				const match = pattern.exec(href);
				if (match) {
					const iframe = ns
						? (document.createElementNS(ns, "iframe") as HTMLIFrameElement)
						: createEl("iframe");
					if (ns) iframe.setAttribute("xmlns", ns);
					if (loadPlayer) iframe.setAttribute("src", toEmbed(match));
					iframe.setAttribute("frameborder", "0");
					iframe.setAttribute("allowfullscreen", "true");
					iframe.setAttribute(
						"allow",
						"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
					);
					iframe.className = "osmosis-video-embed";
					link.replaceWith(iframe);
					break;
				}
			}
		}
	}

	private async renderSvg(
		container: HTMLElement,
		layout: LayoutResult,
	): Promise<void> {
		const { bounds, nodes } = layout;
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();

		// Content dimensions in SVG coordinates
		const contentWidth = bounds.width + LAYOUT_PADDING * 2;
		const contentHeight = bounds.height + LAYOUT_PADDING * 2;

		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "100%");
		svg.addClass("osmosis-mindmap-svg");
		if (this.panByTransform) svg.addClass("osmosis-mindmap-svg-transformed");

		// Initialize viewBox on first render to the fit `renderPass` applies
		// right after (`fitToView`), so the nodes drawn below are the ones the
		// first frame shows. Drawing the container's top-left at zoom 1 instead
		// rendered a viewport the fit then culled straight away.
		if (!this.svg) {
			const containerRect = container.getBoundingClientRect();
			const fit = fitViewBox(
				contentWidth, contentHeight,
				containerRect.width, containerRect.height,
				MIN_ZOOM, MAX_ZOOM,
			);
			this.viewBox = fit.viewBox;
			this.zoom = fit.zoom;
		}

		// On the transform path the SVG carries no viewBox at all: without one,
		// one user unit is one CSS pixel and the origin is the element's
		// top-left, which is exactly the coordinate system the transform below
		// is written against. The transform itself is applied once the host is
		// in the document and has a box to measure.
		if (!this.panByTransform) {
			svg.setAttribute(
				"viewBox",
				`${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`,
			);
		}

		this.svg = svg;
		// The previous host went out with container.empty() and the new one is
		// not built until the nodes have rendered, below. Node rendering is
		// awaited, so a pointer or resize event can land in between: leave the
		// viewport unset for that window rather than measuring a detached box,
		// which degrades to a no-op pan instead of a jump.
		this.viewportHost = null;

		// Boundaries (clouds) go behind everything: they wrap whole subtrees.
		this.drawBoundaries(svg, layout, offsetX, offsetY);

		// Create groups for layering: branch lines behind nodes
		const branchLinesGroup = document.createElementNS(SVG_NS, "g");
		branchLinesGroup.setAttribute("class", "osmosis-branch-lines-group");
		svg.appendChild(branchLinesGroup);
		this.branchLinesGroup = branchLinesGroup;

		const nodesGroup = document.createElementNS(SVG_NS, "g");
		nodesGroup.setAttribute("class", "osmosis-nodes-group");
		svg.appendChild(nodesGroup);
		this.nodesGroup = nodesGroup;

		const lineStyle = this.mapSettings.branchLineStyle;

		// activeTheme and effectiveTheme are resolved in render() before
		// measurement so fonts/styles are up-to-date for both sizing and drawing.

		// Apply background: map override > theme > none
		container.style.backgroundColor = this.mapSettings.background ?? this.activeTheme?.background ?? "";

		// Only render nodes visible in the current viewport
		this.renderedNodeIds.clear();
		this.renderedBranchIds.clear();
		const renderPromises: Promise<void>[] = [];

		for (const node of nodes) {
			if (node.source.type === "root") continue;

			if (this.isNodeInViewport(node, offsetX, offsetY)) {
				this.renderedNodeIds.add(node.source.id);
				renderPromises.push(
					this.drawNode(nodesGroup, node, offsetX, offsetY),
				);
			}

			// A branch is tested on its own geometry, so a branch that spans the
			// viewport is drawn even when neither node it joins is inside it.
			//
			// Top-level nodes hang off the virtual root, which is never drawn
			// (see the `continue` above, and OsmosisTree.root). A branch line to
			// it therefore had nothing to reach and was drawn as a fixed-length
			// stub — a line poking out of the side of the map's first node, and
			// out of every top-level node in a note with no single heading above
			// them.
			if (
				node.parent &&
				node.parent.source.type !== "root" &&
				this.isBranchInViewport(node.parent, node, offsetX, offsetY)
			) {
				this.renderedBranchIds.add(node.source.id);
				this.drawBranchLine(
					branchLinesGroup,
					node.parent,
					node,
					offsetX,
					offsetY,
					lineStyle,
				);
			}
		}

		await Promise.all(renderPromises);
		if (this.panByTransform) {
			const host = container.createDiv({ cls: "osmosis-mindmap-host" });
			host.appendChild(svg);
			this.viewportHost = host;
			// The host is in the document now, so it has a box to measure —
			// place the map. This is the transform path's equivalent of the
			// viewBox attribute set above, not a viewport change, so it stays
			// clear of updateViewBox()'s culling and overlay side effects.
			svg.style.transform = viewBoxTransform(
				this.viewBox,
				host.getBoundingClientRect(),
			);
		} else {
			container.appendChild(svg);
		}
	}

	/**
	 * Whether an edit's pass may update the live SVG instead of replacing it.
	 * Only from the plain editing state: no study session (it rewrites groups),
	 * no fold animation running (a moved group would animate its translation),
	 * no node editor open and no drag under way.
	 */
	private canRedrawInPlace(container: HTMLElement): boolean {
		const live = this.viewportHost ?? this.svg;
		return !!this.svg && !!this.nodesGroup && live?.parentNode === container
			&& this.nodesGroup.parentNode === this.svg
			&& this.spatialMode === "off" && !this.svg.hasClass("osmosis-animating")
			&& this.editingNodeId === null && this.dragGhost === null;
	}

	/**
	 * {@link renderSvg} for a pass that follows an edit (T80): the same drawing,
	 * reached by keeping the live SVG. Boundaries and branch lines are cheap and
	 * redrawn. Each visible node whose group would draw the same
	 * ({@link drawSignature}, and nothing has touched the group since) keeps it,
	 * translated to its new place, so the browser does not lay its Markdown out
	 * again; the rest are drawn as a full pass draws them.
	 *
	 * @returns how many node groups were kept.
	 */
	private async redrawInPlace(container: HTMLElement, layout: LayoutResult): Promise<number> {
		const svg = this.svg!;
		const nodesGroup = this.nodesGroup!;
		const offsetX = this.getOffsetX();
		const offsetY = this.getOffsetY();
		if (!this.panByTransform) {
			svg.setAttribute(
				"viewBox",
				`${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`,
			);
		}

		// Everything in the SVG but the node groups goes, as a new SVG would
		// not have it: boundaries, branch lines, a stray rubber band.
		for (const child of Array.from(svg.childNodes)) {
			if (child !== nodesGroup) child.remove();
		}
		this.drawBoundaries(svg, layout, offsetX, offsetY);
		const boundaries = svg.lastElementChild;
		if (boundaries && boundaries !== nodesGroup) svg.insertBefore(boundaries, nodesGroup);
		const branchLinesGroup = document.createElementNS(SVG_NS, "g");
		branchLinesGroup.setAttribute("class", "osmosis-branch-lines-group");
		svg.insertBefore(branchLinesGroup, nodesGroup);
		this.branchLinesGroup = branchLinesGroup;
		const lineStyle = this.mapSettings.branchLineStyle;
		container.style.backgroundColor = this.mapSettings.background ?? this.activeTheme?.background ?? "";

		// The same visibility rules as renderSvg.
		this.renderedNodeIds.clear();
		this.renderedBranchIds.clear();
		const wanted: WantedNode<LayoutNode>[] = [];
		for (const node of layout.nodes) {
			if (node.source.type === "root") continue;
			if (this.isNodeInViewport(node, offsetX, offsetY)) {
				this.renderedNodeIds.add(node.source.id);
				wanted.push({
					id: node.source.id,
					node,
					// A node that can't be kept still needs a signature that matches nothing.
					sig: this.drawSignature(node) ?? "\u0000",
					x: node.rect.x + offsetX,
					y: node.rect.y + offsetY,
				});
			}
			if (
				node.parent &&
				node.parent.source.type !== "root" &&
				this.isBranchInViewport(node.parent, node, offsetX, offsetY)
			) {
				this.renderedBranchIds.add(node.source.id);
				this.drawBranchLine(branchLinesGroup, node.parent, node, offsetX, offsetY, lineStyle);
			}
		}

		const drawn: DrawnGroup<Element>[] = [];
		for (const el of Array.from(nodesGroup.children)) {
			const rec = this.drawRecords.get(el);
			const untouched = !!rec
				&& el.getAttribute("class") === rec.cls
				&& !el.querySelector(":scope > foreignObject")?.hasAttribute("class")
				&& this.nodeHtmlCache.get(rec.htmlKey) === rec.html;
			drawn.push({
				id: el.getAttribute("data-node-id") ?? "",
				el,
				sig: untouched ? rec.sig : null,
				x: rec?.x ?? 0,
				y: rec?.y ?? 0,
			});
		}
		const plan = planReuse(drawn, wanted);
		for (const el of plan.remove) el.remove();
		for (const { el, dx, dy } of plan.keep) {
			const transform = translateAttr(dx, dy);
			if (transform === null) el.removeAttribute("transform");
			else el.setAttribute("transform", transform);
		}

		// New and changed nodes are drawn off-document and go in together.
		const staging = document.createElementNS(SVG_NS, "g");
		await Promise.all(plan.draw.map((node) => this.drawNode(staging, node, offsetX, offsetY)));
		nodesGroup.append(...Array.from(staging.childNodes));

		if (this.panByTransform && this.viewportHost) {
			svg.style.transform = viewBoxTransform(
				this.viewBox,
				this.viewportHost.getBoundingClientRect(),
			);
		}
		return plan.keep.length;
	}

	/**
	 * Draw every boundary (cloud) style in the map: a soft hull around the
	 * node and its laid-out descendants, so folding or editing re-shapes it on
	 * the next pass. Not viewport-culled: there are few, and one spans many
	 * nodes. Outer boundaries are drawn first, so an inner one lies on top.
	 */
	private drawBoundaries(svg: SVGElement, layout: LayoutResult, offsetX: number, offsetY: number): void {
		const fm = this.osmosisStyleFrontmatter;
		// Only a node's own style, class or variant sets one; never the theme.
		if (!fm?.styles && !fm?.variants) return;
		const looks = new Map<LayoutNode, NonNullable<ReturnType<typeof resolveBoundary>>>();
		for (const node of layout.nodes) {
			if (node.source.type === "root") continue;
			const localStyle = lookupNodeStyle(fm, node);
			const classStyle = lookupClassStyle(fm, localStyle?.class, this.getGlobalClasses());
			const variantStyle = lookupVariantStyle(fm, node);
			if (!localStyle?.boundary && !classStyle?.boundary && !variantStyle?.boundary) continue;
			const depth = node.source.type === "heading" ? node.source.depth : undefined;
			const look = resolveBoundary(resolveNodeStyle(this.effectiveTheme, depth, localStyle, classStyle, variantStyle));
			if (look) looks.set(node, look);
		}
		if (looks.size === 0) return;
		const group = document.createElementNS(SVG_NS, "g");
		group.setAttribute("class", "osmosis-boundaries-group");
		for (const { node, hull } of boundaryShapes([layout.root], (n) => looks.has(n), BOUNDARY_PADDING)) {
			const look = looks.get(node)!;
			const path = document.createElementNS(SVG_NS, "path");
			path.setAttribute("class", "osmosis-boundary");
			// Not data-node-id: lookups by that attribute expect a node group.
			path.setAttribute("data-boundary-id", node.source.id);
			path.setAttribute("d", roundedHullPath(hull.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })), BOUNDARY_PADDING));
			const accent = "var(--interactive-accent)";
			const styles = [
				`fill: ${look.fill ?? accent}`,
				`fill-opacity: ${String(look.fillOpacity)}`,
				`stroke: ${look.strokeWidth > 0 ? (look.stroke ?? accent) : "none"}`,
				`stroke-opacity: ${String(look.strokeOpacity)}`,
				`stroke-width: ${String(look.strokeWidth)}`,
				"pointer-events: none",
			];
			if (look.dash === "dashed") styles.push(`stroke-dasharray: ${String(look.strokeWidth * 4)} ${String(look.strokeWidth * 3)}`);
			else if (look.dash === "dotted") styles.push(`stroke-dasharray: 0 ${String(look.strokeWidth * 2.5)}`, "stroke-linecap: round");
			path.setAttribute("style", styles.join("; "));
			group.appendChild(path);
		}
		svg.appendChild(group);
	}

	/** The class attribute of a node's group, as {@link drawNode} sets it. */
	private nodeGroupClass(node: LayoutNode): string {
		const classes = [
			`osmosis-node-group`,
			`osmosis-node-group-${node.source.type}`,
		];
		if (this.selectedNodeIds.has(node.source.id)) {
			classes.push("osmosis-node-selected");
		}
		if (this.foundIds.has(node.source.id)) {
			classes.push("osmosis-node-find-match");
		}
		if (
			node.source.type === "transclusion" &&
			node.source.metadata?.cyclic
		) {
			classes.push("osmosis-node-cyclic");
		} else if (
			node.source.type === "transclusion" &&
			node.source.sourceFile
		) {
			classes.push("osmosis-node-resolved");
		} else if (
			node.source.type === "transclusion" &&
			!node.source.sourceFile
		) {
			classes.push("osmosis-node-unresolved");
		}
		if (
			node.source.isTranscluded &&
			this.plugin?.settings?.showTransclusionStyle
		) {
			classes.push("osmosis-node-transcluded");
		}
		return classes.join(" ");
	}

	/**
	 * Everything a node's drawing depends on apart from its position, or null
	 * when its group must always be redrawn: a checkbox (its click handler and
	 * checked state are bound at draw time). Two equal signatures draw the same
	 * group, offset by the move between them.
	 */
	private drawSignature(node: LayoutNode): string | null {
		const src = node.source;
		if (src.metadata?.checkbox) return null;
		const fm = this.osmosisStyleFrontmatter;
		const depth = src.type === "heading" ? src.depth : undefined;
		const localStyle = lookupNodeStyle(fm, node);
		const classStyle = lookupClassStyle(fm, localStyle?.class, this.getGlobalClasses());
		const variantStyle = lookupVariantStyle(fm, node);
		const resolved = (this.effectiveTheme || localStyle || classStyle || variantStyle)
			? resolveNodeStyle(this.effectiveTheme, depth, localStyle, classStyle, variantStyle)
			: null;
		const lazy = this.lazyTransclusionIds.has(src.id) && !!src.metadata?.resolved;
		return JSON.stringify([
			this.nodeGroupClass(node), src.id, src.type, depth ?? null, src.sourceFile ?? null,
			src.content, this.getNodeDisplayContent(src), !!src.metadata?.cyclic, resolved,
			this.mapSettings.topicShape ?? null, this.activeTheme?.topicShape ?? null,
			node.rect.width, node.rect.height, src.children.length > 0 || lazy,
			this.collapsedIds.has(src.id), node.side ?? null, this.mapSettings.direction ?? null,
		]);
	}

	private async drawNode(
		svg: SVGElement,
		node: LayoutNode,
		offsetX: number,
		offsetY: number,
	): Promise<void> {
		const x = node.rect.x + offsetX;
		const y = node.rect.y + offsetY;
		const { width, height } = node.rect;

		const group = document.createElementNS(SVG_NS, "g");
		// Set when the content is a clone of the HTML cache: only such a group
		// can be kept by a later edit's pass (see `drawRecords`).
		let fromCache: { key: string; html: HTMLElement } | null = null;
		group.setAttribute("class", this.nodeGroupClass(node));
		group.setAttribute("data-node-id", node.source.id);
		if (node.source.sourceFile) {
			group.setAttribute("data-source-file", node.source.sourceFile);
		}

		// Resolve style via LCVRT cascade: Local > Class > Variant > Reference > Theme
		const nodeDepth = node.source.type === "heading" ? node.source.depth : undefined;
		const localStyle = lookupNodeStyle(this.osmosisStyleFrontmatter, node);
		const classStyle = lookupClassStyle(this.osmosisStyleFrontmatter, localStyle?.class, this.getGlobalClasses());
		const variantStyle = lookupVariantStyle(this.osmosisStyleFrontmatter, node);
		const resolvedStyle = (this.effectiveTheme || localStyle || classStyle || variantStyle)
			? resolveNodeStyle(this.effectiveTheme, nodeDepth, localStyle, classStyle, variantStyle)
			: undefined;

		// Background shape (determined by resolved style, map setting, then theme, then default)
		const shape = resolvedStyle?.shape ?? this.mapSettings.topicShape ?? this.activeTheme?.topicShape ?? "rounded-rect";
		group.setAttribute("data-shape", shape);
		const shapeEl = createShapeElement(shape, x, y, width, height);
		shapeEl.setAttribute(
			"class",
			`osmosis-node osmosis-node-${node.source.type} osmosis-node-shape`,
		);

		// For non-rectangular shapes (path, ellipse, circle), clicks in the
		// bounding-box corners miss the shape element. Add an invisible hit-area
		// rect so getClickedNodeId() always finds the parent node group.
		const needsHitArea =
			shape !== "rect" && shape !== "rounded-rect" && shape !== "pill";
		if (needsHitArea) {
			const hitRect = document.createElementNS(SVG_NS, "rect");
			hitRect.setAttribute("x", String(x));
			hitRect.setAttribute("y", String(y));
			hitRect.setAttribute("width", String(width));
			hitRect.setAttribute("height", String(height));
			hitRect.setAttribute("fill", "transparent");
			hitRect.setAttribute("stroke", "none");
			hitRect.setAttribute("class", "osmosis-hit-area");
			group.appendChild(hitRect);
		}

		group.appendChild(shapeEl);

		// Compute the inscribed content rectangle within the shape.
		// The foreignObject is inset so text/media stay inside the shape boundary.
		const insets = getShapeInsets(shape);
		const foX = x + insets.left * width;
		const foY = y + insets.top * height;
		const foW = width * (1 - insets.left - insets.right);
		const foH = height * (1 - insets.top - insets.bottom);

		// foreignObject with rendered markdown
		const fo = document.createElementNS(SVG_NS, "foreignObject");
		fo.setAttribute("x", String(foX));
		fo.setAttribute("y", String(foY));
		fo.setAttribute("width", String(foW));
		fo.setAttribute("height", String(foH));

		const wrapper = document.createElementNS(
			XHTML_NS,
			"div",
		) as HTMLDivElement;
		wrapper.setAttribute("xmlns", XHTML_NS);
		wrapper.className = "osmosis-node-content markdown-rendered";
		if (node.source.type === "heading") {
			wrapper.setAttribute("data-depth", String(node.source.depth));
		}
		fo.appendChild(wrapper);
		group.appendChild(fo);

		// Apply theme styles via inline style (overrides CSS class rules)
		if (resolvedStyle) {
			const style = resolvedStyle;
			// Use inline style on shape element — SVG attributes are overridden by CSS class rules
			const shapeStyles: string[] = [];
			if (style.fill) shapeStyles.push(`fill: ${style.fill}`);
			// The border goes on as custom properties, not as `stroke` and
			// friends: styles.css reads them back through `var()`, so selection
			// and cursor-sync stay able to repaint a themed border by
			// specificity. Declared inline, `stroke` would outrank every
			// selector and only `!important` could beat it.
			if (style.border?.color) shapeStyles.push(`--osmosis-node-stroke: ${style.border.color}`);
			if (style.border?.width) shapeStyles.push(`--osmosis-node-stroke-width: ${String(style.border.width)}`);
			if (style.border?.style === "dashed") shapeStyles.push("--osmosis-node-dash: 4 2");
			else if (style.border?.style === "dotted") shapeStyles.push("--osmosis-node-dash: 1 2");
			else if (style.border?.style === "none") shapeStyles.push("--osmosis-node-stroke: none");
			else if (style.border?.style === "solid") shapeStyles.push("--osmosis-node-dash: none");
			if (shapeStyles.length > 0) shapeEl.setAttribute("style", shapeStyles.join("; "));
			const textStyles: string[] = [];
			if (style.text?.color) textStyles.push(`color: ${style.text.color}`);
			if (style.text?.size) textStyles.push(`font-size: ${String(style.text.size)}px`);
			if (style.text?.weight) textStyles.push(`font-weight: ${String(style.text.weight)}`);
			if (style.text?.font) textStyles.push(`font-family: '${style.text.font}', sans-serif`);
			if (style.text?.alignment) textStyles.push(`text-align: ${style.text.alignment}`);
			if (style.text?.style === "italic") textStyles.push("font-style: italic");
			if (textStyles.length > 0) wrapper.setAttribute("style", textStyles.join("; "));
		}

		// Render markdown content into the wrapper
		const sourcePath = this.currentFile?.path ?? "";
		if (
			node.source.type === "transclusion" &&
			node.source.metadata?.cyclic
		) {
			// Cycle indicator: show warning instead of raw link
			const cycleLabel = document.createElementNS(
				XHTML_NS,
				"span",
			);
			cycleLabel.setAttribute("xmlns", XHTML_NS);
			cycleLabel.className = "osmosis-cycle-indicator";
			cycleLabel.textContent = `\u21BB ${node.source.content}`;
			wrapper.appendChild(cycleLabel);
		} else {
			const displayContent = this.getNodeDisplayContent(node.source);
			// Check if this is an osmosis fence that should render as a card
			const osmosisCard = this.getOsmosisCardContent(node.source);
			// Checkbox nodes have state (checked/unchecked) baked into cached HTML,
			// so skip the cache to always render fresh with the current checked state.
			const isCheckboxNode = !!node.source.metadata?.checkbox;
			// Osmosis cards use a different cache key so they don't collide
			const cacheKey = osmosisCard ? `osmosis-card:${displayContent}` : displayContent;
			const cachedHtml = isCheckboxNode
				? null
				: this.nodeHtmlCache.get(cacheKey);
			if (cachedHtml) {
				fromCache = { key: cacheKey, html: cachedHtml };
				// Clone cached rendered content instead of re-rendering markdown
				for (const child of Array.from(cachedHtml.childNodes)) {
					wrapper.appendChild(child.cloneNode(true));
				}
			} else if (osmosisCard) {
				// Render osmosis fence as card (front + divider + back)
				await this.renderOsmosisCardInto(wrapper, osmosisCard, sourcePath, XHTML_NS);

				// This branch used to be the one that never wrote the cache — the
				// `set` sat in the branch below only — so every draw of every
				// fence node re-ran `MarkdownRenderer.render`, twice over for a
				// two-sided card, each time a cull pass brought it back on screen.
				//
				// An occluded fence stays out on purpose. `renderOcclusion` hangs
				// a one-shot `load` listener on its `<img>` to memoise the
				// picture's natural size, and a clone carries neither the listener
				// nor the width/height attributes it exists to supply — so a
				// cached draw would reproduce exactly the no-intrinsic-size
				// collapse those attributes were added to prevent.
				if (!isCheckboxNode && !osmosisCard.occlusions) {
					this.cacheNodeHtml(cacheKey, wrapper);
				}
			} else if (this.renderComponent) {
				await MarkdownRenderer.render(
					this.app,
					displayContent,
					wrapper,
					sourcePath,
					this.renderComponent,
				);

				// Replace video platform links with embedded iframes
				this.replaceVideoEmbeds(wrapper, XHTML_NS);

				// Add language label to code block nodes
				if (node.source.type === "codeblock") {
					const langMatch = /^(`{3,}|~{3,})(\S+)/.exec(
						node.source.content,
					);
					const lang = langMatch?.[2];
					if (lang && !lang.startsWith("ad-")) {
						const label = document.createElementNS(
							XHTML_NS,
							"span",
						);
						label.setAttribute("xmlns", XHTML_NS);
						label.className = "osmosis-code-lang-label";
						label.textContent = lang;
						wrapper.appendChild(label);
					}
				}

				// Inject checkbox for task-list items
				if (node.source.metadata?.checkbox) {
					const cb = document.createElementNS(XHTML_NS, "input") as HTMLInputElement;
					cb.setAttribute("xmlns", XHTML_NS);
					cb.type = "checkbox";
					cb.className = "task-list-item-checkbox";
					cb.dataset.task = (node.source.metadata.checked as boolean) ? "x" : "";
					if (node.source.metadata.checked) {
						cb.checked = true;
					}
					// Prepend checkbox before existing content
					const firstChild = wrapper.firstChild;
					if (firstChild) {
						// Insert inside the first <p> if present, otherwise before first child
						const p = wrapper.querySelector("p");
						if (p) {
							p.insertBefore(cb, p.firstChild);
						} else {
							wrapper.insertBefore(cb, firstChild);
						}
					} else {
						wrapper.appendChild(cb);
					}
				}

				// Cache the rendered wrapper content for future cloning
				// (skip checkbox nodes — their checked state makes caching incorrect)
				if (!isCheckboxNode) this.cacheNodeHtml(cacheKey, wrapper);
			}
		}

		// Wire up checkbox toggle — must run after render (both cached and fresh paths)
		if (node.source.metadata?.checkbox) {
			const cb = wrapper.querySelector<HTMLInputElement>(
				"input.task-list-item-checkbox",
			);
			if (cb) {
				cb.addEventListener("click", (e) => {
					e.stopPropagation();
					void this.toggleCheckboxNode(node.source);
				});
			}
		}

		// Collapse toggle for nodes with children, or lazy transclusions with content to load
		const isLazyTransclusion =
			this.lazyTransclusionIds.has(node.source.id) &&
			node.source.metadata?.resolved;
		if (node.source.children.length > 0 || isLazyTransclusion) {
			this.drawCollapseToggle(group, node, x, y, width, height);
		}

		// Resize handle: small circle on the right edge of the node
		if (node.source.type !== "root") {
			const handleR = 4;
			const resizeHandle = document.createElementNS(SVG_NS, "circle");
			resizeHandle.setAttribute("cx", String(x + width));
			resizeHandle.setAttribute("cy", String(y + height / 2));
			resizeHandle.setAttribute("r", String(handleR));
			resizeHandle.setAttribute("class", "osmosis-resize-handle");
			group.appendChild(resizeHandle);
		}

		if (fromCache) {
			const sig = this.drawSignature(node);
			if (sig !== null) {
				this.drawRecords.set(group, {
					sig, x, y, cls: group.getAttribute("class") ?? "", htmlKey: fromCache.key, html: fromCache.html,
				});
			}
		}
		svg.appendChild(group);
	}

	/**
	 * Keep a copy of a node's rendered markdown, to clone on its next draw.
	 *
	 * A cull pass redraws whatever comes back into view, so an uncached node
	 * re-runs `MarkdownRenderer.render` every time it reappears — and the render
	 * lands in `renderComponent`, which only unloads on a full render pass.
	 */
	private cacheNodeHtml(cacheKey: string, wrapper: Element): void {
		const cacheEntry = document.createElementNS(XHTML_NS, "div") as HTMLDivElement;
		for (const child of Array.from(wrapper.childNodes)) {
			cacheEntry.appendChild(child.cloneNode(true));
		}
		this.nodeHtmlCache.set(cacheKey, cacheEntry);
	}

	private drawCollapseToggle(
		group: SVGGElement,
		node: LayoutNode,
		x: number,
		y: number,
		width: number,
		height: number,
	): void {
		const isCollapsed = this.collapsedIds.has(node.source.id);
		const toggleSize = 14;
		const isSecondary = node.side === "secondary";
		const isTopDown = this.mapSettings.direction === "top-down";

		let toggleX: number;
		let toggleY: number;
		if (isSecondary && isTopDown) {
			// Above: toggle at top edge
			toggleX = x + width / 2 - toggleSize / 2;
			toggleY = y - toggleSize - 4;
		} else if (isSecondary) {
			// Left side: toggle at left edge
			toggleX = x - toggleSize - 4;
			toggleY = y + height / 2 - toggleSize / 2;
		} else {
			// Default: toggle at right edge
			toggleX = x + width + 4;
			toggleY = y + height / 2 - toggleSize / 2;
		}

		const toggleGroup = document.createElementNS(SVG_NS, "g");
		toggleGroup.setAttribute("class", "osmosis-collapse-toggle");
		toggleGroup.setAttribute("data-node-id", node.source.id);

		// Circle background
		const circle = document.createElementNS(SVG_NS, "circle");
		circle.setAttribute("cx", String(toggleX + toggleSize / 2));
		circle.setAttribute("cy", String(toggleY + toggleSize / 2));
		circle.setAttribute("r", String(toggleSize / 2));
		circle.setAttribute("class", "osmosis-collapse-circle");
		// Apply theme toggle styles via inline style (overrides CSS class rules)
		if (this.activeTheme?.collapseToggle) {
			const ct = this.activeTheme.collapseToggle;
			const circleStyles: string[] = [];
			if (ct.fill) circleStyles.push(`fill: ${ct.fill}`);
			if (ct.stroke) circleStyles.push(`stroke: ${ct.stroke}`);
			if (circleStyles.length > 0) circle.setAttribute("style", circleStyles.join("; "));
		}
		toggleGroup.appendChild(circle);

		// +/- icon
		const icon = document.createElementNS(SVG_NS, "text");
		icon.setAttribute("x", String(toggleX + toggleSize / 2));
		icon.setAttribute("y", String(toggleY + toggleSize / 2));
		icon.setAttribute("text-anchor", "middle");
		icon.setAttribute("dominant-baseline", "central");
		icon.setAttribute("class", "osmosis-collapse-icon");
		if (this.activeTheme?.collapseToggle?.icon) {
			icon.setAttribute("style", `fill: ${this.activeTheme.collapseToggle.icon}`);
		}
		icon.textContent = isCollapsed ? "+" : "\u2212";
		toggleGroup.appendChild(icon);

		group.appendChild(toggleGroup);
	}

	private drawBranchLine(
		svg: SVGElement,
		parent: LayoutNode,
		child: LayoutNode,
		offsetX: number,
		offsetY: number,
		lineStyle: BranchLineStyle,
	): void {
		const isSecondary = child.side === "secondary";
		const isTopDown = this.mapSettings.direction === "top-down";

		let cx: number;
		let cy: number;
		let px: number;
		let py: number;

		if (isSecondary && isTopDown) {
			// Secondary in top-down: child is above parent
			// Child attachment: bottom-center
			cx = child.rect.x + child.rect.width / 2 + offsetX;
			cy = child.rect.y + child.rect.height + offsetY;
			px = parent.rect.x + parent.rect.width / 2 + offsetX;
			py = parent.rect.y + offsetY;
		} else if (isSecondary) {
			// Secondary in horizontal: child is to the left of parent
			// Child attachment: center-right
			cx = child.rect.x + child.rect.width + offsetX;
			cy = child.rect.y + child.rect.height / 2 + offsetY;
			px = parent.rect.x + offsetX;
			py = parent.rect.y + parent.rect.height / 2 + offsetY;
		} else if (isTopDown) {
			// Primary in top-down: child is below parent
			// Child attachment: top-center
			cx = child.rect.x + child.rect.width / 2 + offsetX;
			cy = child.rect.y + offsetY;
			px = parent.rect.x + parent.rect.width / 2 + offsetX;
			py = parent.rect.y + parent.rect.height + offsetY;
		} else {
			// Primary side (default): center-left of child
			cx = child.rect.x + offsetX;
			cy = child.rect.y + child.rect.height / 2 + offsetY;
			px = parent.rect.x + parent.rect.width + offsetX;
			py = parent.rect.y + parent.rect.height / 2 + offsetY;
		}

		// Apply branch line styles: per-node overrides > class > map-level > theme > default
		const childLocalStyle = lookupNodeStyle(this.osmosisStyleFrontmatter, child);
		const childClassStyle = lookupClassStyle(this.osmosisStyleFrontmatter, childLocalStyle?.class, this.getGlobalClasses());
		const branchLineOverride = childLocalStyle?.branchLine ?? childClassStyle?.branchLine;
		const themeBranchLine = this.activeTheme?.branchLine;
		// Map-level branch line overrides layer between theme and per-node
		const mapBranchLine = (this.mapSettings.branchLineColor || this.mapSettings.branchLineThickness || themeBranchLine)
			? {
				...themeBranchLine,
				...(this.mapSettings.branchLineColor ? { color: this.mapSettings.branchLineColor } : {}),
				...(this.mapSettings.branchLineThickness ? { thickness: this.mapSettings.branchLineThickness } : {}),
			}
			: undefined;
		const effectiveLineStyle = branchLineOverride?.style ?? mapBranchLine?.style ?? lineStyle;

		const bl = { ...mapBranchLine, ...branchLineOverride };
		const effectivePattern: BranchLinePattern =
			bl.pattern ?? this.mapSettings.branchLinePattern ?? "solid";
		const effectiveTaper: BranchLineTaper =
			bl.taper ?? this.mapSettings.branchLineTaper ?? "none";
		const effectiveThickness = bl.thickness ?? 1.5;

		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("class", "osmosis-branch-line");
		path.setAttribute("data-child-id", child.source.id);

		if (effectiveTaper !== "none") {
			// Taper: draw a filled polygon outline instead of a stroked line
			const centerLine = this.computeLinePath(px, py, cx, cy, effectiveLineStyle, isTopDown);
			const taperD = this.buildTaperOutline(
				px, py, cx, cy, effectiveLineStyle, isTopDown,
				effectiveThickness, effectiveTaper,
			);
			path.setAttribute("d", taperD);
			const fillColor = bl.color ?? "";
			const lineStyles: string[] = ["stroke: none"];
			if (fillColor) {
				lineStyles.push(`fill: ${fillColor}`);
			} else {
				lineStyles.push("fill: var(--background-modifier-border)");
			}
			// Apply dash pattern to tapered paths via a clip-path trick:
			// For tapered + dashed, we overlay the outline with a dashed center-line.
			if (effectivePattern !== "solid") {
				// Draw the taper fill as a solid shape, then overlay a dashed stroke
				// for visual effect. The taper shape itself stays solid-filled.
				path.setAttribute("style", lineStyles.join("; "));
				svg.appendChild(path);
				// Add a dashed center-line overlay on top for the pattern effect
				const overlay = document.createElementNS(SVG_NS, "path");
				overlay.setAttribute("d", centerLine);
				overlay.setAttribute("class", "osmosis-branch-line");
				overlay.setAttribute("data-child-id", child.source.id);
				const overlayStyles: string[] = ["fill: none"];
				overlayStyles.push(`stroke: ${fillColor || "var(--background-modifier-border)"}`);
				overlayStyles.push(`stroke-width: ${String(effectiveThickness)}`);
				this.applyPatternAttrs(overlay, effectivePattern);
				overlay.setAttribute("style", overlayStyles.join("; "));
				svg.appendChild(overlay);
				return;
			}
			path.setAttribute("style", lineStyles.join("; "));
		} else {
			// Standard stroked path
			path.setAttribute("d", this.computeLinePath(px, py, cx, cy, effectiveLineStyle, isTopDown));
			const lineStyles: string[] = ["fill: none"];
			if (bl.color) lineStyles.push(`stroke: ${bl.color}`);
			if (bl.thickness) lineStyles.push(`stroke-width: ${String(bl.thickness)}`);
			this.applyPatternAttrs(path, effectivePattern);
			path.setAttribute("style", lineStyles.join("; "));
		}
		svg.appendChild(path);
	}

	private computeLinePath(
		px: number,
		py: number,
		cx: number,
		cy: number,
		style: BranchLineStyle,
		vertical = false,
	): string {
		if (vertical) {
			const midY = (py + cy) / 2;

			switch (style) {
				case "straight":
					return `M ${px} ${py} L ${cx} ${cy}`;

				case "angular":
					return `M ${px} ${py} L ${px} ${midY} L ${cx} ${midY} L ${cx} ${cy}`;

				case "rounded-elbow": {
					const radius = Math.min(
						12,
						Math.abs(cx - px) / 2,
						Math.abs(cy - py) / 4,
					);
					if (Math.abs(cx - px) < 1) {
						return `M ${px} ${py} L ${cx} ${cy}`;
					}
					const dir = cx > px ? 1 : -1;
					return (
						`M ${px} ${py} ` +
						`L ${px} ${midY - radius} ` +
						`Q ${px} ${midY}, ${px + radius * dir} ${midY} ` +
						`L ${cx - radius * dir} ${midY} ` +
						`Q ${cx} ${midY}, ${cx} ${midY + radius} ` +
						`L ${cx} ${cy}`
					);
				}

				case "curved":
				default:
					return `M ${px} ${py} C ${px} ${midY}, ${cx} ${midY}, ${cx} ${cy}`;
			}
		}

		const midX = (px + cx) / 2;

		switch (style) {
			case "straight":
				return `M ${px} ${py} L ${cx} ${cy}`;

			case "angular":
				return `M ${px} ${py} L ${midX} ${py} L ${midX} ${cy} L ${cx} ${cy}`;

			case "rounded-elbow": {
				const radius = Math.min(
					12,
					Math.abs(cy - py) / 2,
					Math.abs(cx - px) / 4,
				);
				if (Math.abs(cy - py) < 1) {
					return `M ${px} ${py} L ${cx} ${cy}`;
				}
				const dir = cy > py ? 1 : -1;
				return (
					`M ${px} ${py} ` +
					`L ${midX - radius} ${py} ` +
					`Q ${midX} ${py}, ${midX} ${py + radius * dir} ` +
					`L ${midX} ${cy - radius * dir} ` +
					`Q ${midX} ${cy}, ${midX + radius} ${cy} ` +
					`L ${cx} ${cy}`
				);
			}

			case "curved":
			default:
				return `M ${px} ${py} C ${midX} ${py}, ${midX} ${cy}, ${cx} ${cy}`;
		}
	}

	/** Apply stroke-dasharray attributes for dashed/dotted patterns. */
	private applyPatternAttrs(el: SVGElement, pattern: BranchLinePattern): void {
		if (pattern === "dashed") {
			el.setAttribute("stroke-dasharray", "8 4");
		} else if (pattern === "dotted") {
			el.setAttribute("stroke-dasharray", "2 4");
			el.setAttribute("stroke-linecap", "round");
		}
	}

	/**
	 * Sample points along the center-line path for a given style.
	 * Returns an array of {x, y} points from parent to child.
	 */
	private sampleLinePath(
		px: number, py: number, cx: number, cy: number,
		style: BranchLineStyle, vertical: boolean, numSamples: number,
	): { x: number; y: number }[] {
		const points: { x: number; y: number }[] = [];

		if (style === "straight") {
			for (let i = 0; i <= numSamples; i++) {
				const t = i / numSamples;
				points.push({ x: px + (cx - px) * t, y: py + (cy - py) * t });
			}
			return points;
		}

		if (style === "curved") {
			// Cubic bezier: same control points as computeLinePath
			const c1x = vertical ? px : (px + cx) / 2;
			const c1y = vertical ? (py + cy) / 2 : py;
			const c2x = vertical ? cx : (px + cx) / 2;
			const c2y = vertical ? (py + cy) / 2 : cy;
			for (let i = 0; i <= numSamples; i++) {
				const t = i / numSamples;
				const mt = 1 - t;
				points.push({
					x: mt * mt * mt * px + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * cx,
					y: mt * mt * mt * py + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * cy,
				});
			}
			return points;
		}

		// For angular and rounded-elbow, generate the path string and
		// approximate by sampling piecewise-linear segments.
		if (style === "angular") {
			if (vertical) {
				const midY = (py + cy) / 2;
				const segs = [
					{ x: px, y: py }, { x: px, y: midY },
					{ x: cx, y: midY }, { x: cx, y: cy },
				];
				return this.samplePiecewiseLinear(segs, numSamples);
			}
			const midX = (px + cx) / 2;
			const segs = [
				{ x: px, y: py }, { x: midX, y: py },
				{ x: midX, y: cy }, { x: cx, y: cy },
			];
			return this.samplePiecewiseLinear(segs, numSamples);
		}

		// rounded-elbow: approximate with angular (close enough for taper outline)
		if (vertical) {
			const midY = (py + cy) / 2;
			const segs = [
				{ x: px, y: py }, { x: px, y: midY },
				{ x: cx, y: midY }, { x: cx, y: cy },
			];
			return this.samplePiecewiseLinear(segs, numSamples);
		}
		const midX = (px + cx) / 2;
		const segs = [
			{ x: px, y: py }, { x: midX, y: py },
			{ x: midX, y: cy }, { x: cx, y: cy },
		];
		return this.samplePiecewiseLinear(segs, numSamples);
	}

	/** Resample a polyline of segments into numSamples evenly spaced points. */
	private samplePiecewiseLinear(
		vertices: { x: number; y: number }[], numSamples: number,
	): { x: number; y: number }[] {
		if (vertices.length < 2) return [{ x: 0, y: 0 }];
		// Compute cumulative arc lengths
		const lengths: number[] = [0];
		for (let i = 1; i < vertices.length; i++) {
			const dx = vertices[i]!.x - vertices[i - 1]!.x;
			const dy = vertices[i]!.y - vertices[i - 1]!.y;
			lengths.push(lengths[i - 1]! + Math.sqrt(dx * dx + dy * dy));
		}
		const totalLen = lengths[lengths.length - 1]!;
		if (totalLen < 0.01) return vertices.slice(0, numSamples + 1);

		const points: { x: number; y: number }[] = [];
		for (let i = 0; i <= numSamples; i++) {
			const targetLen = (i / numSamples) * totalLen;
			// Find segment
			let seg = 0;
			for (let j = 1; j < lengths.length; j++) {
				if (lengths[j]! >= targetLen) { seg = j - 1; break; }
			}
			const vA = vertices[seg]!;
			const vB = vertices[seg + 1]!;
			const segLen = lengths[seg + 1]! - lengths[seg]!;
			const t = segLen > 0 ? (targetLen - lengths[seg]!) / segLen : 0;
			points.push({
				x: vA.x + (vB.x - vA.x) * t,
				y: vA.y + (vB.y - vA.y) * t,
			});
		}
		return points;
	}

	/**
	 * Build a filled SVG path that traces the outline of a tapered branch line.
	 * "fade" = thick at parent, thin at child.
	 * "grow" = thin at parent, thick at child.
	 */
	private buildTaperOutline(
		px: number, py: number, cx: number, cy: number,
		style: BranchLineStyle, vertical: boolean,
		thickness: number, taper: BranchLineTaper,
	): string {
		const numSamples = 24;
		const points = this.sampleLinePath(px, py, cx, cy, style, vertical, numSamples);
		if (points.length < 2) return "";

		const minWidth = 0.3; // minimum stroke at the thin end
		const maxWidth = thickness;

		const left: { x: number; y: number }[] = [];
		const right: { x: number; y: number }[] = [];

		for (let i = 0; i < points.length; i++) {
			const pt = points[i]!;
			const t = i / (points.length - 1);

			// Width at this point along the path
			let w: number;
			if (taper === "fade") {
				w = maxWidth * (1 - t) + minWidth * t;
			} else {
				w = minWidth * (1 - t) + maxWidth * t;
			}
			const halfW = w / 2;

			// Compute tangent direction
			let tx: number;
			let ty: number;
			if (i === 0) {
				tx = points[1]!.x - pt.x;
				ty = points[1]!.y - pt.y;
			} else if (i === points.length - 1) {
				tx = pt.x - points[i - 1]!.x;
				ty = pt.y - points[i - 1]!.y;
			} else {
				tx = points[i + 1]!.x - points[i - 1]!.x;
				ty = points[i + 1]!.y - points[i - 1]!.y;
			}

			// Normalize tangent
			const tLen = Math.sqrt(tx * tx + ty * ty);
			if (tLen > 0) { tx /= tLen; ty /= tLen; }

			// Normal (perpendicular)
			const nx = -ty;
			const ny = tx;

			left.push({ x: pt.x + nx * halfW, y: pt.y + ny * halfW });
			right.push({ x: pt.x - nx * halfW, y: pt.y - ny * halfW });
		}

		// Build closed path: left side forward, then right side backward
		let d = `M ${left[0]!.x} ${left[0]!.y}`;
		for (let i = 1; i < left.length; i++) {
			d += ` L ${left[i]!.x} ${left[i]!.y}`;
		}
		for (let i = right.length - 1; i >= 0; i--) {
			d += ` L ${right[i]!.x} ${right[i]!.y}`;
		}
		d += " Z";
		return d;
	}
}
