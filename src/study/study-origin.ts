/**
 * Where the Flashcard study tab goes back to. A session launched from a note
 * or the Decks page takes over that tab (`openStudySession`), and the tab
 * remembers what it showed — the view type and state (file and mode) plus the
 * ephemeral state (scroll) — so the study cap can put it back. Kept out of
 * `src/views/` so it can be unit-tested without Obsidian.
 */

/** What a tab showed before study took it over: enough for `setViewState`. */
export interface StudyOrigin {
	type: string;
	state: Record<string, unknown>;
	eState?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read an origin out of a leaf's view state (with its ephemeral state as
 * `eState`), or out of a study tab's saved state. Only `type`, `state` and
 * `eState` are kept, so pin, group or title fields never ride back in; null
 * when there is no view type to return to.
 */
export function toStudyOrigin(raw: unknown): StudyOrigin | null {
	if (!isRecord(raw) || typeof raw.type !== "string" || raw.type === "") return null;
	const origin: StudyOrigin = { type: raw.type, state: isRecord(raw.state) ? raw.state : {} };
	if (isRecord(raw.eState)) origin.eState = raw.eState;
	return origin;
}

/**
 * Where leaving study should land: the origin, unless it was a note that is
 * gone now (deleted or renamed during the session). Null means the Decks page.
 */
export function studyReturnTarget(
	origin: StudyOrigin | null,
	fileExists: (path: string) => boolean,
): StudyOrigin | null {
	if (!origin) return null;
	const file = origin.state.file;
	if (typeof file === "string" && !fileExists(file)) return null;
	return origin;
}
