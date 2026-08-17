/**
 * Panels in the order the reader arranged them.
 *
 * `saved` is the ID list the dashboard's drag handles write, and it is treated
 * as a preference rather than a specification: IDs no longer in `panels` are
 * dropped, and panels the saved order never saw are appended in their default
 * order — a graph added in a later release lands at the bottom rather than
 * shuffling an arrangement someone already made.
 */
export function orderPanels<T extends { id: string }>(
	panels: readonly T[],
	saved: readonly string[],
): T[] {
	const remaining = new Map(panels.map((panel) => [panel.id, panel]));
	const ordered: T[] = [];

	for (const id of saved) {
		const panel = remaining.get(id);
		// Missing means either unknown or already placed, so a duplicated ID in
		// the saved list is ignored rather than rendering its panel twice.
		if (panel === undefined) continue;
		remaining.delete(id);
		ordered.push(panel);
	}

	// Map iteration is insertion-ordered, so what is left is still in default order.
	return [...ordered, ...remaining.values()];
}
