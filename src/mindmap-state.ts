/**
 * The mind map's view state: what `MindMapView.getState` saves and `setState`
 * reads back. Shared with the 3D graph's 2D/3D toggle, which hands a leaf
 * back to the mind map with the same fields the map would have saved.
 *
 * `file` is what Back/Forward and a restored workspace reload the map from;
 * without it a map revisited through history comes back blank. `pinned`
 * travels with it so restoring an unpinned map doesn't pin it. Collapsed
 * branches stay unsaved (they churn).
 *
 * Pure: no `obsidian` import, so it is unit-tested directly.
 */

/** The fields `writeMapState` saves, as `readMapState` reads them back. */
export interface MapViewState {
	/** The note to map; null when the state names none. */
	file: string | null;
	/** Whether the map stays on `file`. A caller that names a file means "show this one", so it pins unless told otherwise. */
	pinned: boolean;
	/** Reading or editing mode; null when the state doesn't say. */
	readingMode: boolean | null;
}

/** The map's state fields. `file` and `pinned` only when there is a file. */
export function writeMapState(file: string | null, pinned: boolean, readingMode: boolean): Record<string, unknown> {
	const state: Record<string, unknown> = { readingMode };
	if (file !== null) {
		state.file = file;
		state.pinned = pinned;
	}
	return state;
}

/** Read the map's fields from a view state, whoever wrote it. */
export function readMapState(state: unknown): MapViewState {
	const fields = typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {};
	return {
		file: typeof fields.file === "string" ? fields.file : null,
		pinned: fields.pinned !== false,
		readingMode: typeof fields.readingMode === "boolean" ? fields.readingMode : null,
	};
}
