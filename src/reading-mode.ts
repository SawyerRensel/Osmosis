/** Global default for which mode a Mind Map View opens in. */
export type MindMapDefaultMode = "editing" | "reading" | "reading-mobile";

/**
 * Resolve the initial reading-mode flag for a newly opened map view.
 * Per-leaf persisted state (view getState/setState) overrides this later.
 */
export function resolveDefaultReadingMode(
	mode: MindMapDefaultMode,
	isMobile: boolean,
): boolean {
	return mode === "reading" || (mode === "reading-mobile" && isMobile);
}
