/**
 * Compare two strings for close match using character-level similarity.
 * Returns true if ≥70% of characters match positionally (case-insensitive).
 */
export function isCloseMatch(input: string, expected: string): boolean {
	if (input.length === 0 || expected.length === 0) return false;
	const a = input.toLowerCase().trim();
	const b = expected.toLowerCase().trim();
	if (a === b) return true;
	const maxLen = Math.max(a.length, b.length);
	let matches = 0;
	for (let i = 0; i < Math.min(a.length, b.length); i++) {
		if (a[i] === b[i]) matches++;
	}
	return matches / maxLen >= 0.7;
}
