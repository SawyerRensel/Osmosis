/**
 * Pure logic for relational study's paths (see `vault/Planner/3D Graph Phase 6
 * - Relational study mode.md`, slice 2): the order the due-driven path visits
 * its cards in, and the thread drawn through them.
 *
 * A **stop** is one hidden node: a line card's line, or a fence. Like a node in
 * free exploration it asks all of its due cards in turn, so it is one stop and
 * its `keys` are what `Graph3DStudy` rates one by one.
 */

import { lineCardId } from "../card-gen/line-cards";
import type { Card } from "../database/types";
import { dueOrNewFenceCardKeys, dueOrNewLineCardIds, mindmapStudyKeys } from "../study/mindmap-study";
import type { GraphNode } from "./model";
import { nodeCardKey } from "./study";
import type { TrailStop } from "./trail-note";

export interface RouteStop {
	/** The node's card key (`nodeCardKey`): stable when a rating rewrites a fence. */
	key: string;
	/** The note the card lives in: where the camera has to land. */
	path: string;
	/** The due cards the node asks, in ask order (`mindmapStudyKeys`). */
	keys: string[];
	/** When the stop's earliest card came due; `now` for a new card, which is overdue by nothing. */
	due: number;
	/** The earliest source line of the stop's cards, for note order. */
	line: number;
}

/**
 * Every stop in `cards`: the line and fence nodes with a due or new card that
 * relational study can ask (occlusion cards included). Cards of several notes may be mixed.
 */
export function routeStops(cards: readonly Card[], now: number): RouteStop[] {
	const byNote = new Map<string, Card[]>();
	for (const card of cards) {
		const list = byNote.get(card.notePath);
		if (list === undefined) byNote.set(card.notePath, [card]);
		else list.push(card);
	}
	const stops: RouteStop[] = [];
	for (const [path, noteCards] of byNote) {
		const byId = new Map(noteCards.map((card) => [card.id, card]));
		const nodeKeys = new Set([...dueOrNewLineCardIds(noteCards, now), ...dueOrNewFenceCardKeys(noteCards, now)]);
		for (const key of nodeKeys) {
			const keys = mindmapStudyKeys(noteCards, key, now).filter((id) => byId.has(id));
			if (keys.length === 0) continue;
			const asked = keys.map((id) => byId.get(id)!);
			stops.push({
				key,
				path,
				keys,
				due: Math.min(...asked.map((card) => card.due ?? now)),
				line: Math.min(...asked.map((card) => card.sourceLine)),
			});
		}
	}
	return stops;
}

/** Whether `rated` holds every card of `stop`: the stop is finished. */
export function stopDone(stop: RouteStop, rated: ReadonlySet<string>): boolean {
	return stop.keys.every((key) => rated.has(key));
}

/** How many cards of `stops` are still to ask. */
export function cardsToGo(stops: readonly RouteStop[], rated: ReadonlySet<string>): number {
	return stops.reduce((sum, stop) => sum + stop.keys.filter((key) => !rated.has(key)).length, 0);
}

/**
 * The stop to fly to next: the one fewest note-hops from where you stand
 * (`hops`: note path → hop distance; a note missing from it is unreachable and
 * comes last), then the most overdue, then note order (path, then line). Stops
 * already done, and `skip` (the card you are on), are passed over.
 */
export function nextStop(stops: readonly RouteStop[], rated: ReadonlySet<string>, hops: ReadonlyMap<string, number>, skip?: string | null): RouteStop | null {
	let best: RouteStop | null = null;
	for (const stop of stops) {
		if (stop.key === skip || stopDone(stop, rated)) continue;
		if (best === null || compareStops(stop, best, hops) < 0) best = stop;
	}
	return best;
}

function compareStops(a: RouteStop, b: RouteStop, hops: ReadonlyMap<string, number>): number {
	const distanceA = hops.get(a.path) ?? Infinity;
	const distanceB = hops.get(b.path) ?? Infinity;
	if (distanceA !== distanceB) return distanceA < distanceB ? -1 : 1;
	if (a.due !== b.due) return a.due - b.due;
	if (a.path !== b.path) return a.path < b.path ? -1 : 1;
	return a.line - b.line;
}

/**
 * The thread's stops as node IDs in `nodes`, in the order they were visited.
 * A stop that is not loaded (a card in a note out of the loaded area, or a
 * node that left) is `null`, so the thread breaks there instead of bridging
 * two stops that were never adjacent. A stop is a card key, or a node ID for
 * the note you started from.
 */
export function threadNodeIds(nodes: readonly GraphNode[], stops: readonly string[]): (string | null)[] {
	const byKey = new Map<string, string>();
	for (const node of nodes) byKey.set(nodeCardKey(node) ?? node.id, node.id);
	return stops.map((stop) => byKey.get(stop) ?? null);
}

/**
 * The segments of the thread: each consecutive pair of stops that both have a
 * position. A stop visited twice in a row adds nothing.
 */
export function threadSegments<T>(ids: readonly (string | null)[], at: (id: string) => T | null): [T, T][] {
	const segments: [T, T][] = [];
	for (let i = 1; i < ids.length; i++) {
		const [from, to] = [ids[i - 1], ids[i]];
		if (from === null || to === null || from === undefined || to === undefined || from === to) continue;
		const [a, b] = [at(from), at(to)];
		if (a !== null && b !== null) segments.push([a, b]);
	}
	return segments;
}

/** One stop of an authored trail, resolved to a note. */
export interface TrailStep {
	/** The note the stop's link resolves to. */
	path: string;
	/** The link's subpath (`^block`, a heading, or `""`): where `linkTargetNode` lands in the note. */
	subpath: string;
	/** The due or new card at the stop, rated when you reach it; null when none is due, and the stop is visited and shown. */
	stop: RouteStop | null;
}

/**
 * An authored trail's stops as steps to walk, in the author's order. A stop whose
 * link resolves to no note is left out and returned in `unresolved`. Only a
 * block-ID stop can hold a card (a line card): a heading or a plain note is
 * shown, not rated, and so is a block whose card is not due. Fences have no
 * block ID to link to, so a trail cannot ask them.
 *
 * `resolve` is the link resolver (`getFirstLinkpathDest`); `from` is the trail
 * note, which `[[#Heading]]` names; `cardsOf` is the card store.
 */
export function trailSteps(
	stops: readonly TrailStop[],
	from: string,
	resolve: (target: string, from: string) => string | null,
	cardsOf: (path: string) => readonly Card[],
	now: number,
): { steps: TrailStep[]; unresolved: TrailStop[] } {
	const steps: TrailStep[] = [];
	const unresolved: TrailStop[] = [];
	for (const stop of stops) {
		const path = stop.target === "" ? from : resolve(stop.target, from);
		if (path === null) {
			unresolved.push(stop);
			continue;
		}
		const key = stop.subpath.startsWith("^") ? lineCardId(path, stop.subpath.slice(1)) : null;
		const due = key === null ? undefined : routeStops(cardsOf(path), now).find((candidate) => candidate.key === key);
		steps.push({ path, subpath: stop.subpath, stop: due ?? null });
	}
	return { steps, unresolved };
}
