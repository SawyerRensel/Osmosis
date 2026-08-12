import type { Card, CardOcclusion } from "../database/types";
import { groupNumber, occlusionGroups } from "../card-gen/occlusion";

/**
 * The sequence of questions an occluded carrier asks in the note.
 *
 * Reading view has two jobs on the same diagram, and they are not the same job.
 * *Peek* is a reader looking at a picture: every group is a blank at once, no
 * group is singled out, and nothing is recorded — that is what `all-hidden` and
 * `all-revealed` are for. *Study* is a card player, exactly as sequential and
 * spatial are: it has a target, a rating, and a completion count, so it steps
 * through the groups one at a time and each step moves one card's schedule.
 *
 * This module is the sequence, kept pure so both note surfaces derive it the
 * same way — the fence processor from a fence's diagrams, the line processor
 * from the one diagram sitting on a line.
 */

/** One question an occluded carrier asks: a group on a diagram, and its card. */
export interface OcclusionStep {
	/** Index into the carrier's diagrams — which picture carries this group. */
	diagram: number;
	/** The `cN` shape group being asked. */
	group: string;
	/** The card whose schedule this step moves, or null when the store has none. */
	cardId: string | null;
}

/**
 * The steps a carrier's diagrams offer, in group order.
 *
 * Ordered by group number across *all* of the carrier's diagrams rather than
 * diagram by diagram, because group labels are allocated per carrier — a fence's
 * second diagram starts where its first left off — so group order already is
 * document order, and `c2` never precedes `c10`'s predecessor by source accident.
 * `spatialStudyKeys` orders its split node the same way.
 *
 * `now` is epoch ms to keep only the groups the scheduler would ask, or null to
 * take every group. Study passes a time — a diagram with one due group out of
 * three is one question, not three, matching what the mind map does with a node.
 * A group whose card the store does not know about yet (sync has not caught up,
 * or the fence has no `id:` to derive one from) is dropped when filtering by
 * time: it has no schedule to move, so asking it would be a question whose
 * answer goes nowhere.
 */
export function occlusionSteps(
	diagrams: readonly CardOcclusion[],
	cards: readonly Card[],
	now: number | null,
): OcclusionStep[] {
	const steps: OcclusionStep[] = [];

	diagrams.forEach((diagram, index) => {
		for (const group of occlusionGroups(diagram)) {
			const card = cards.find(
				(candidate) => !candidate.disabled && candidate.occlusion?.target === group,
			);
			if (now !== null && (card === undefined || !isDueOrNew(card, now))) continue;
			steps.push({ diagram: index, group, cardId: card?.id ?? null });
		}
	});

	return steps.sort((a, b) => groupNumber(a.group) - groupNumber(b.group));
}

/** Due, or new (never reviewed) — the same "due" every study surface means. */
function isDueOrNew(card: Card, now: number): boolean {
	return card.due === undefined || card.due <= now;
}
