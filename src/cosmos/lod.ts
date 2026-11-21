/**
 * The near tier: which nodes get a live Markdown panel over their plate. See
 * `vault/Planner/3D Graph Phase 4 - Near tier.md` and the "Detail tiers" part
 * of the `# Spec` in `vault/Planner/Develop Mind-Map Graph View.md`.
 *
 * Every node is a plate (`plates.ts`); the nearest few also get the line's
 * Markdown rendered as DOM on top. Distance is measured as the panel's screen
 * scale (CSS px drawn per px laid out), not world units, so the tier follows
 * what you can read: it holds whatever the viewport size, and whatever size
 * the plate-aware spacing makes a cluster.
 *
 * Every boundary has hysteresis, so a node hovering at one doesn't flicker:
 * distance, the screen edge, the mist, and the budget itself.
 */

/** Nodes in the near tier at once; the nearest win. */
export const NEAR_BUDGET = { desktop: 24, mobile: 12 } as const;
/** Screen scale at which a panel enters the tier, and the lower one at which it leaves. */
export const NEAR_ENTER_SCALE = 0.6;
export const NEAR_EXIT_SCALE = 0.45;
/** Exit scale over enter scale: kept at every panel size threshold, so the hysteresis band stays the same. */
export const NEAR_EXIT_RATIO = NEAR_EXIT_SCALE / NEAR_ENTER_SCALE;
/** Panel detail slider limit: ×1/`DETAIL_LIMIT` to ×`DETAIL_LIMIT`, so the enter scale runs 0.15 to 2.4. */
export const DETAIL_LIMIT = 4;
/** Budget ranges the Overlays sliders allow; the defaults (`NEAR_BUDGET`) sit inside them. */
export const NEAR_BUDGET_RANGE = { desktop: { min: 4, max: 128 }, mobile: { min: 4, max: 128 } } as const;

/** The two near-tier settings a user can change (Overlays menu), kept per device. */
export interface NearTierSettings {
	/** Panel detail: a multiplier on how far away panels open. The enter scale is `NEAR_ENTER_SCALE / detail`, so more detail means panels from farther away. */
	detail: number;
	/** Live panels at once. */
	budget: number;
}

export function defaultNearTier(mobile: boolean): NearTierSettings {
	return { detail: 1, budget: mobile ? NEAR_BUDGET.mobile : NEAR_BUDGET.desktop };
}

/** Settings read back from storage, anything unusable replaced by the default and the rest clamped to the ranges. */
export function cleanNearTier(value: unknown, mobile: boolean): NearTierSettings {
	const fallback = defaultNearTier(mobile);
	const range = NEAR_BUDGET_RANGE[mobile ? "mobile" : "desktop"];
	const raw = typeof value === "object" && value !== null ? (value as Partial<Record<keyof NearTierSettings, unknown>>) : {};
	const number = (v: unknown, dflt: number, min: number, max: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt);
	return {
		detail: number(raw.detail, fallback.detail, 1 / DETAIL_LIMIT, DETAIL_LIMIT),
		budget: Math.round(number(raw.budget, fallback.budget, range.min, range.max)),
	};
}

/** The screen scale at which a panel enters the tier, for a panel detail multiplier. */
export const enterScaleFromDetail = (detail: number): number => NEAR_ENTER_SCALE / detail;
/** Panel detail slider position (log₂, so ×½ and ×2 sit evenly either side of ×1) to detail, and back. */
export const detailFromSlider = (position: number): number => 2 ** position;
export const sliderFromDetail = (detail: number): number => Math.log2(detail);
/**
 * A node enters only with its panel on screen, and leaves once the panel is
 * this far out. How far out is counted in normalized device coordinates from
 * the viewport's middle to the nearest edge of the panel's box (its centre
 * less its half-extent, `NearProbe.halfX`), so ±1 is the viewport's own edge.
 * A panel with no extent is its centre alone.
 */
export const NEAR_ENTER_SCREEN = 1;
export const NEAR_EXIT_SCREEN = 1.3;
/** How much of the plate must show through the mist and focus dim (`plateVisibility`) to enter, and to stay. */
export const NEAR_ENTER_VISIBILITY = 0.2;
export const NEAR_EXIT_VISIBILITY = 0.1;
/**
 * A node already in the tier competes for the budget as if it were this
 * share nearer, so two nodes at about the same distance don't trade places
 * every frame as the camera drifts.
 */
export const NEAR_KEEP_BONUS = 0.15;

/** A node the near tier could show, as the camera sees it this frame. */
export interface NearProbe {
	id: string;
	/** View depth of the node's centre: distance along the view direction. */
	depth: number;
	/** CSS px drawn per px of panel laid out, at this depth (`panelScale`). */
	scale: number;
	/** The centre in normalized device coordinates, −1 to 1 across the viewport. */
	x: number;
	y: number;
	/**
	 * Half the panel's width and height on screen, in the same units as `x` and
	 * `y` (`panelHalfNdc`), so a tall panel whose centre has left the screen
	 * stays while its body is still in view. Missing means 0: the centre alone.
	 */
	halfX?: number;
	halfY?: number;
	/** `plateVisibility` at this depth: 0 lost in the mist, 1 fully shown. */
	visibility: number;
}

/**
 * Screen scale of a panel at view `depth`: `pxPerUnitAt1` is the viewport's
 * px per world unit at depth 1, and `pxPerUnit` is how many px of panel are
 * laid out per world unit.
 */
export function panelScale(depth: number, pxPerUnitAt1: number, pxPerUnit: number): number {
	return depth <= 0 ? 0 : pxPerUnitAt1 / (depth * pxPerUnit);
}

/**
 * Half a panel's size on screen in normalized device coordinates, which run 2
 * across the viewport: `width` and `height` are the panel's laid-out px, and
 * `scale` is what it is drawn at (`panelScale`). Panels face the screen (or
 * are drawn as if they do), so a panel on a tilted plate is only ever
 * overestimated, which here means kept a little longer.
 */
export function panelHalfNdc(width: number, height: number, scale: number, viewport: { width: number; height: number }): { x: number; y: number } {
	return { x: (width * scale) / viewport.width, y: (height * scale) / viewport.height };
}

/** How far the panel's box is past the viewport's middle, to its nearest edge: 1 when the box just touches the screen edge. */
export function nearScreenDistance(p: NearProbe): number {
	return Math.max(Math.abs(p.x) - (p.halfX ?? 0), Math.abs(p.y) - (p.halfY ?? 0));
}

function canEnter(p: NearProbe, enterScale: number): boolean {
	return p.depth > 0 && p.scale >= enterScale && nearScreenDistance(p) <= NEAR_ENTER_SCREEN && p.visibility >= NEAR_ENTER_VISIBILITY;
}

function canStay(p: NearProbe, enterScale: number): boolean {
	return p.depth > 0 && p.scale >= enterScale * NEAR_EXIT_RATIO && nearScreenDistance(p) <= NEAR_EXIT_SCREEN && p.visibility >= NEAR_EXIT_VISIBILITY;
}

/**
 * The near tier for this frame. Nodes in `current` stay while they pass the
 * looser exit tests; others need the stricter entry tests. If more qualify
 * than `budget`, the nearest win, with current members given
 * `NEAR_KEEP_BONUS`. `enterScale` is the panel size threshold (default
 * `NEAR_ENTER_SCALE`); the exit scale follows it at `NEAR_EXIT_RATIO`.
 */
export function chooseNear(probes: Iterable<NearProbe>, current: ReadonlySet<string>, budget: number, enterScale = NEAR_ENTER_SCALE): Set<string> {
	const ranked: { id: string; rank: number }[] = [];
	for (const probe of probes) {
		const member = current.has(probe.id);
		if (member ? canStay(probe, enterScale) : canEnter(probe, enterScale)) {
			ranked.push({ id: probe.id, rank: member ? probe.depth * (1 - NEAR_KEEP_BONUS) : probe.depth });
		}
	}
	if (ranked.length > budget) {
		ranked.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		ranked.length = Math.max(0, budget);
	}
	return new Set(ranked.map((r) => r.id));
}
