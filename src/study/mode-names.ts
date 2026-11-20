import type { StudyMode } from "../database/types";

/**
 * Study-mode names before the T105 rename (Sequential → Flashcard,
 * Contextual → Note, Spatial → Mind map, Relational → Cosmos), mapped to the
 * stored values that replaced them. Review-log files written before the rename
 * still carry the old values and are never rewritten, so every reader of a
 * stored mode has to accept both.
 */
export const LEGACY_STUDY_MODES: Readonly<Record<string, StudyMode>> = {
	sequential: "flashcard",
	contextual: "note",
	spatial: "mindmap",
	relational: "cosmos",
};

/** The pre-rename stored value for each mode, for reading old cached counts. */
export const LEGACY_KEY_FOR_MODE: Readonly<Record<StudyMode, string>> = {
	flashcard: "sequential",
	note: "contextual",
	mindmap: "spatial",
	cosmos: "relational",
};

/** Settings keys renamed in T105: old data.json key → new key. */
const RENAMED_SETTING_KEYS: Readonly<Record<string, string>> = {
	contextualAutoActivate: "noteAutoActivate",
	contextualInlineCloze: "noteInlineCloze",
	sequentialContextLines: "flashcardContextLines",
};

/**
 * Carry pre-rename settings keys over to their new names, in place. The old
 * value is copied only when the new key is absent (a saved new value wins),
 * and the old key is always deleted so the next save drops it.
 */
export function migrateRenamedSettingKeys(data: Record<string, unknown>): void {
	for (const [oldKey, newKey] of Object.entries(RENAMED_SETTING_KEYS)) {
		if (!(oldKey in data)) continue;
		if (!(newKey in data)) data[newKey] = data[oldKey];
		Reflect.deleteProperty(data, oldKey);
	}
}
