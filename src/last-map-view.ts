/**
 * Which map view the note header's brain button opens: the one the user last
 * had, 2D or 3D. Remembered per device (vault-scoped localStorage), like the
 * 3D graph's other personal preferences, so a phone that lives in 3D doesn't
 * change what a laptop opens. This module only validates what storage hands
 * back; the plugin reads and writes it.
 */

export type MapViewKind = "2d" | "3d";

/** localStorage key for the last map view used on this device. */
export const LAST_MAP_VIEW_STORAGE_KEY = "osmosis-last-map-view";

/** 3D only when storage says exactly "3d"; anything else (nothing stored, a stale or corrupt value) is the 2D mind map. */
export function cleanLastMapView(raw: unknown): MapViewKind {
	return raw === "3d" ? "3d" : "2d";
}
