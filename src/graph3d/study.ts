/**
 * Pure logic for relational study, the 3D graph's study mode (`StudyMode`
 * `"relational"`). See `vault/Planner/3D Graph Phase 6 - Relational study
 * mode.md` and the parent spec's "3D study mode".
 *
 * It works like 2D spatial study: a due card's node is hidden in place, and that
 * hidden node *is* the card. Card matching is `src/study/spatial-study.ts`'s,
 * unchanged — its `${notePath}#^${blockId}` line keys already span several
 * notes, which is the whole 3D case — and ratings go through the shared
 * `StudySessionManager`, so the schedules are the ones every other mode uses.
 *
 * What is here is only what the 3D view adds on top: which graph node carries
 * which card, what a hidden or revealed node shows, and which hidden node is
 * nearest.
 */

import type { Card } from "../database/types";
import { lineCardId } from "../card-gen/line-cards";
import { dueOrNewFenceCardKeys, dueOrNewLineCardIds, fenceKeyFromNode, spatialStudyKeys } from "../study/spatial-study";
import type { GraphNode } from "./model";

/** What a hidden line's plate and panel show. */
export const HIDDEN_LABEL = "?";

/**
 * The card key a graph node carries, as `MindMapView.nodeCardKey` derives it:
 * a line's line key, or a fence's own ID read off its text. 3D has no
 * transclusion, so a line always keys against the note it is drawn in.
 */
export function nodeCardKey(node: GraphNode): string | null {
	if (node.kind !== "line" || node.source === undefined || node.path === undefined) return null;
	const { blockId, type, content } = node.source;
	if (blockId !== undefined) return lineCardId(node.path, blockId);
	return type === "codeblock" ? fenceKeyFromNode(content) : null;
}

/**
 * Whether relational study can ask this card yet. Occlusion cards need their
 * masks painted over the image in a near-tier panel, which is a later slice of
 * the phase (see the task note's "Slice plan"); until then they are left
 * showing, as unstudied context, rather than hidden behind a "?" that would
 * ask the reader to recall a whole diagram.
 */
function askable(card: Card): boolean {
	return card.occlusion === undefined;
}

/**
 * The hidden nodes of a study pass: node ID → the keys it still has to ask,
 * one per due card in ask order (`spatialStudyKeys`).
 *
 * A key already rated this session is dropped, so a node that has answered
 * everything leaves the map of targets and shows its own text again, and an
 * Again-rated card that comes due a minute later isn't asked twice in one
 * session, as in 2D study. A key revealed and awaiting its rating stays.
 */
export function studyTargets(nodes: readonly GraphNode[], cards: readonly Card[], now: number, rated: ReadonlySet<string>): Map<string, string[]> {
	const due = new Set([...dueOrNewLineCardIds(cards, now), ...dueOrNewFenceCardKeys(cards, now)]);
	const byId = new Map(cards.map((card) => [card.id, card]));
	const targets = new Map<string, string[]>();
	for (const node of nodes) {
		const nodeKey = nodeCardKey(node);
		if (nodeKey === null || !due.has(nodeKey)) continue;
		// The node has a due card, so every key is a due card's own ID.
		const keys = spatialStudyKeys(cards, nodeKey, now).filter((key) => {
			const card = byId.get(key);
			return !rated.has(key) && card !== undefined && askable(card);
		});
		if (keys.length > 0) targets.set(node.id, keys);
	}
	return targets;
}

/** Where a target node is in its questions: the key on screen, and whether its answer is showing. */
export interface NodeStep {
	asking: string;
	revealed: boolean;
}

/** The first key a target node has not had rated, and whether it has been revealed (`MindMapView.spatialNodeStep`). */
export function nodeStep(keys: readonly string[], revealed: ReadonlySet<string>): NodeStep | null {
	const asking = keys[0];
	return asking === undefined ? null : { asking, revealed: revealed.has(asking) };
}

function isCloze(card: Card): boolean {
	return card.cardType === "explicit_cloze" || card.cardType === "code_cloze";
}

/**
 * A node as a study pass shows it. Its ID, kind, path and parse type stay, so
 * it keeps its place, colour and links; only what it says changes.
 *
 * - **A hidden line** says `?` on its plate and its panel.
 * - **A fence** never blanks, as in 2D: its front is the question. Hidden, its
 *   panel shows the asked card's front; revealed, a cloze's back (the passage
 *   filled in replaces it), any other kind front, a rule, then back.
 * - **A revealed line** is itself again.
 *
 * `card` is the card being asked when the key is a card's own ID; for a key
 * that is a whole node it is the node's one card, or undefined for a line.
 */
export function studyNode(node: GraphNode, step: NodeStep, card: Card | undefined): GraphNode {
	const source = node.source;
	if (source === undefined) return node;
	const fence = source.blockId === undefined && card !== undefined;
	if (!fence) {
		if (step.revealed) return node;
		return { ...node, label: HIDDEN_LABEL, source: { ...source, content: HIDDEN_LABEL, raw: HIDDEN_LABEL } };
	}
	const text = !step.revealed ? card.front : isCloze(card) ? card.back : `${card.front}\n\n---\n\n${card.back}`;
	return { ...node, label: step.revealed ? node.label : HIDDEN_LABEL, source: { ...source, content: text, raw: text } };
}

export interface Positioned {
	id: string;
	x: number;
	y: number;
	z: number;
}

/**
 * The candidate nearest `from` in a straight line, or null when there is none.
 * Free exploration's "Next": the closest hidden card to where you stand.
 * Due-driven study (a later slice) orders along graph paths instead.
 */
export function nearestTarget(from: { x: number; y: number; z: number }, candidates: Iterable<Positioned>): string | null {
	let best: string | null = null;
	let bestDistance = Infinity;
	for (const c of candidates) {
		const d = (c.x - from.x) ** 2 + (c.y - from.y) ** 2 + (c.z - from.z) ** 2;
		if (d < bestDistance) {
			bestDistance = d;
			best = c.id;
		}
	}
	return best;
}
