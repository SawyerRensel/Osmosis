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
/**
 * A node enters only with its centre on screen (normalized device
 * coordinates within ±1), and leaves once its centre is this far out.
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

function canEnter(p: NearProbe): boolean {
	return p.depth > 0 && p.scale >= NEAR_ENTER_SCALE && Math.max(Math.abs(p.x), Math.abs(p.y)) <= NEAR_ENTER_SCREEN && p.visibility >= NEAR_ENTER_VISIBILITY;
}

function canStay(p: NearProbe): boolean {
	return p.depth > 0 && p.scale >= NEAR_EXIT_SCALE && Math.max(Math.abs(p.x), Math.abs(p.y)) <= NEAR_EXIT_SCREEN && p.visibility >= NEAR_EXIT_VISIBILITY;
}

/**
 * The near tier for this frame. Nodes in `current` stay while they pass the
 * looser exit tests; others need the stricter entry tests. If more qualify
 * than `budget`, the nearest win, with current members given
 * `NEAR_KEEP_BONUS`.
 */
export function chooseNear(probes: Iterable<NearProbe>, current: ReadonlySet<string>, budget: number): Set<string> {
	const ranked: { id: string; rank: number }[] = [];
	for (const probe of probes) {
		const member = current.has(probe.id);
		if (member ? canStay(probe) : canEnter(probe)) {
			ranked.push({ id: probe.id, rank: member ? probe.depth * (1 - NEAR_KEEP_BONUS) : probe.depth });
		}
	}
	if (ranked.length > budget) {
		ranked.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
		ranked.length = Math.max(0, budget);
	}
	return new Set(ranked.map((r) => r.id));
}
