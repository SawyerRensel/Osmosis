/**
 * Stored names from before the 3D graph became Cosmos (T107), and the
 * one-time moves that carry a vault over to the new ones. Obsidian-free so it
 * can be unit-tested; `main.ts` runs both moves.
 */

/** The view type saved workspaces hold for Cosmos tabs opened before the rename. */
export const LEGACY_COSMOS_VIEW_TYPE = "osmosis-graph3d";

/** Cosmos's tab icon. A migrated tab that is not on show is restored as a placeholder with this icon until it is opened. */
export const COSMOS_ICON = "brain-circuit";

/** Cosmos's per-device preferences in Obsidian's vault-scoped localStorage. */
export const COSMOS_STORAGE_KEYS = {
	sticks: "osmosis-cosmos-sticks",
	clickSelectsOnly: "osmosis-cosmos-click-selects-only",
	/** Keyed by platform, so a desktop window emulating mobile keeps its own pair. */
	nearTier: (mobile: boolean): string => `osmosis-cosmos-near-tier-${mobile ? "mobile" : "desktop"}`,
} as const;

/** Each pre-rename localStorage key and the key that replaced it. */
export const LEGACY_STORAGE_KEYS: readonly (readonly [string, string])[] = [
	["osmosis-graph3d-sticks", COSMOS_STORAGE_KEYS.sticks],
	["osmosis-graph3d-click-selects-only", COSMOS_STORAGE_KEYS.clickSelectsOnly],
	["osmosis-graph3d-near-tier-mobile", COSMOS_STORAGE_KEYS.nearTier(true)],
	["osmosis-graph3d-near-tier-desktop", COSMOS_STORAGE_KEYS.nearTier(false)],
];

/** Obsidian's `App.loadLocalStorage` / `saveLocalStorage` pair (null: absent, or clear it). */
export interface KeyValueStore {
	load(key: string): unknown;
	save(key: string, value: unknown): void;
}

/**
 * Move each old key's value to its new key, then clear the old key. A value
 * already under the new key wins, so a preference set after the update is not
 * overwritten by a stale one.
 */
export function migrateStorageKeys(store: KeyValueStore, renames: readonly (readonly [string, string])[]): void {
	for (const [oldKey, newKey] of renames) {
		const old = store.load(oldKey);
		if (old === null || old === undefined) continue;
		if (store.load(newKey) === null) store.save(newKey, old);
		store.save(oldKey, null);
	}
}

/** The parts of a saved `ViewState` the move reads. */
export interface LegacyLeafState {
	state?: Record<string, unknown>;
	pinned?: boolean;
}

/**
 * The view state that turns an old-type leaf into a Cosmos tab with the same
 * state (focus note, depth, backlinks, place). Obsidian keeps a leaf of an
 * unregistered type as a placeholder whose `getViewState()` still holds the
 * saved state, but whose icon and title are the placeholder's ghost and type
 * string, so those are replaced: with an icon and title, Obsidian restores a
 * tab that is not on show as a deferred view, as it does at startup, instead
 * of building the scene for a hidden tab.
 */
export function cosmosViewStateFrom(old: LegacyLeafState, type: string, title: string): {
	type: string;
	state: Record<string, unknown>;
	pinned?: boolean;
	icon: string;
	title: string;
} {
	return {
		type,
		state: old.state ?? {},
		...(old.pinned === true ? { pinned: true } : {}),
		icon: COSMOS_ICON,
		title,
	};
}

/** A deferred tab's title: the focus note's file name, or the view's own fallback. */
export function cosmosTabTitle(state: Record<string, unknown> | undefined): string {
	const focus = state?.focus;
	if (typeof focus !== "string" || focus === "") return "Cosmos";
	const name = focus.slice(focus.lastIndexOf("/") + 1);
	return name.endsWith(".md") ? name.slice(0, -3) : name;
}
