import { describe, expect, it } from "vitest";
import {
	COSMOS_ICON,
	COSMOS_STORAGE_KEYS,
	LEGACY_STORAGE_KEYS,
	cosmosTabTitle,
	cosmosViewStateFrom,
	migrateStorageKeys,
	type KeyValueStore,
} from "./cosmos-legacy";

/** A store that behaves like Obsidian's: absent keys load as null, saving null clears. */
function memoryStore(initial: Record<string, unknown>): KeyValueStore & { data: Map<string, unknown> } {
	const data = new Map(Object.entries(initial));
	return {
		data,
		load: (key) => data.get(key) ?? null,
		save: (key, value) => {
			if (value === null) data.delete(key);
			else data.set(key, value);
		},
	};
}

describe("migrateStorageKeys", () => {
	it("moves every pre-rename Cosmos key to its new name and clears the old one", () => {
		const nearTier = { detail: "full", live: 6 };
		const store = memoryStore({
			"osmosis-graph3d-sticks": true,
			"osmosis-graph3d-click-selects-only": false,
			"osmosis-graph3d-near-tier-desktop": nearTier,
			"osmosis-graph3d-near-tier-mobile": { detail: "plain", live: 2 },
			"osmosis-last-map-view": "3d",
		});
		migrateStorageKeys(store, LEGACY_STORAGE_KEYS);
		expect(Object.fromEntries(store.data)).toEqual({
			"osmosis-cosmos-sticks": true,
			"osmosis-cosmos-click-selects-only": false,
			"osmosis-cosmos-near-tier-desktop": nearTier,
			"osmosis-cosmos-near-tier-mobile": { detail: "plain", live: 2 },
			"osmosis-last-map-view": "3d",
		});
	});

	it("keeps a value already under the new key, still clearing the old one", () => {
		const store = memoryStore({ "osmosis-graph3d-sticks": true, "osmosis-cosmos-sticks": false });
		migrateStorageKeys(store, LEGACY_STORAGE_KEYS);
		expect(Object.fromEntries(store.data)).toEqual({ "osmosis-cosmos-sticks": false });
	});

	it("does nothing once migrated", () => {
		const store = memoryStore({ "osmosis-cosmos-sticks": true });
		migrateStorageKeys(store, LEGACY_STORAGE_KEYS);
		expect(Object.fromEntries(store.data)).toEqual({ "osmosis-cosmos-sticks": true });
	});

	it("maps onto the keys the view reads", () => {
		expect(LEGACY_STORAGE_KEYS.map(([, key]) => key).sort()).toEqual([
			COSMOS_STORAGE_KEYS.clickSelectsOnly,
			COSMOS_STORAGE_KEYS.nearTier(true),
			COSMOS_STORAGE_KEYS.nearTier(false),
			COSMOS_STORAGE_KEYS.sticks,
		].sort());
	});
});

describe("cosmosViewStateFrom", () => {
	it("keeps the saved state and pin, and swaps the placeholder's type, icon and title", () => {
		const state = { focus: "Sailing/Knots.md", depth: 2, backlinks: true };
		expect(cosmosViewStateFrom({ state, pinned: true }, "osmosis-cosmos", "Knots")).toEqual({
			type: "osmosis-cosmos",
			state,
			pinned: true,
			icon: COSMOS_ICON,
			title: "Knots",
		});
	});

	it("leaves an unpinned tab unpinned and fills a missing state", () => {
		expect(cosmosViewStateFrom({}, "osmosis-cosmos", "Cosmos")).toEqual({
			type: "osmosis-cosmos",
			state: {},
			icon: COSMOS_ICON,
			title: "Cosmos",
		});
	});
});

describe("cosmosTabTitle", () => {
	it("is the focus note's file name", () => {
		expect(cosmosTabTitle({ focus: "Travel/Lisbon trip.md" })).toBe("Lisbon trip");
		expect(cosmosTabTitle({ focus: "Pantry.md" })).toBe("Pantry");
	});

	it("falls back to Cosmos without a focus note", () => {
		expect(cosmosTabTitle(undefined)).toBe("Cosmos");
		expect(cosmosTabTitle({ focus: null })).toBe("Cosmos");
		expect(cosmosTabTitle({ focus: "" })).toBe("Cosmos");
	});
});
