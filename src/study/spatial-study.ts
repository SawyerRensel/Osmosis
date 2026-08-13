/**
 * Pure logic for spatial study (Mind Map View).
 *
 * Entering study mode hides only the map nodes whose line card is due or
 * new — the rest of the map stays fully expanded because spatial context
 * is the point. Nodes are matched to line cards exactly via block ID.
 * See notes/02_planning/notes_as_flashcards_plan.md §5 "Spatial (Mind Map
 * View)".
 *
 * Two key shapes coexist:
 * - Block-ID keys (`os-xxxxxx`) — used by the reading view, which always
 *   operates on a single note, so bare block IDs are unambiguous.
 * - Card keys (`${notePath}#^${blockId}`, i.e. the line card's ID) — used
 *   by the mind map, where transcluded nodes from other notes share the
 *   canvas and the same block-ID string can legitimately exist in both
 *   host and source files.
 */

import type { Card, CardOcclusion } from "../database/types";
import { lineCardId } from "../card-gen/line-cards";
import { groupNumber } from "../card-gen/occlusion";

/**
 * Structural view of a laid-out map node — matches `LayoutNode` so the
 * mind map can pass its nodes directly while tests build plain objects.
 */
export interface SpatialNodeLike {
	source: { blockId?: string; isTranscluded: boolean; sourceFile?: string };
	children: SpatialNodeLike[];
}

/**
 * A card that participates in line study: one that lives on a line, and is not
 * disabled. Disabled ("excluded") line cards are fully out — peek and study,
 * both surfaces — so this single guard drops them from every filter below.
 *
 * **The block ID is the signal, not `cardType`.** An occluded line card fans
 * out into one card *per shape group*, each carrying `cardType: "occlusion"`
 * while still sitting on its line. Testing the type instead dropped those from
 * every filter here, so a note whose only cards were occluded images got no
 * study or peek button at all. Nothing else in the codebase mints a `blockId`
 * for a card that is not on a line.
 */
function isLineCard(card: Card): boolean {
	return card.blockId !== undefined && !card.disabled;
}

/**
 * Whether the scheduler would study this card now: due, or new (never
 * reviewed). "Due" always means due-or-new (plan §5).
 */
function isDueOrNew(card: Card, now: number): boolean {
	return card.due === undefined || card.due <= now;
}

/**
 * Block IDs of every line card in the set, regardless of schedule —
 * peek mode hides all tagged lines. Deck-excluded cards are included:
 * opt-out only removes cards from decks/sequential, not in-place study.
 */
export function allLineCardBlockIds(cards: readonly Card[]): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (isLineCard(card)) ids.add(card.blockId!);
	}
	return ids;
}

/**
 * Block IDs of the line cards the scheduler would study now: due, or new
 * (never reviewed). Deck-excluded cards are included: opt-out only
 * removes cards from decks/sequential, not from in-place study.
 */
export function dueOrNewLineCardBlockIds(cards: readonly Card[], now: number): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (isLineCard(card) && isDueOrNew(card, now)) ids.add(card.blockId!);
	}
	return ids;
}

/**
 * The suffix a fence's derived cards carry: `-c1` for a cloze or shape group,
 * `-r` for the reverse of a bidirectional card. Stripping it yields the fence's
 * own ID, which is the key a map node can be matched on.
 */
const DERIVED_SUFFIX_REGEX = /-(?:c\d+|r)$/;

/**
 * Whether a card came from an ```osmosis fence rather than a tagged line.
 *
 * A line card is identified by its `blockId`; a fence card has none, because a
 * fence carries its identity in its own `id:` header instead.
 */
function isFenceCard(card: Card): boolean {
	return card.blockId === undefined && !card.disabled;
}

/**
 * The fence a card belongs to: its ID with any derived-card suffix removed.
 *
 * One fence is one map node but often several cards — three shape groups, two
 * cloze deletions, a bidirectional pair — so the node has to key on the fence,
 * exactly as a line keys on its block rather than on the cards sitting on it.
 * `cardIdsForFenceKey` goes back the other way.
 *
 * A hand-written `id:` ending in `-c1` or `-r` would be read as a derived card
 * of some other fence. Generated IDs never look like that, and the cost of the
 * collision is two nodes revealing together rather than anything being lost.
 */
export function fenceKey(card: Card): string {
	return card.id.replace(DERIVED_SUFFIX_REGEX, "");
}

/**
 * The fence key a map node carries, or null when the node is not an ```osmosis
 * fence or has no identity yet.
 *
 * Read from the node's own text rather than looked up, because that is where a
 * fence's identity lives: `id:` in the header, which "Generate IDs" writes
 * there, or the legacy `<!--osmosis-id:…-->` comment on the opening line. A
 * fence that has neither is not yet a card the store knows about, so a node for
 * it is correctly no target.
 */
export function fenceKeyFromNode(content: string): string | null {
	const lines = content.split("\n");
	const opening = lines[0] ?? "";
	if (!/^\s*(`{3,}|~{3,})osmosis\b/.test(opening)) return null;

	const legacy = /<!--osmosis-id:([a-zA-Z0-9]+)-->/.exec(opening);
	if (legacy) return legacy[1]!;

	// Metadata is the run of consecutive `key: value` lines below the opener.
	for (const raw of lines.slice(1)) {
		const line = raw.trim();
		if (line === "") break;
		const id = /^id\s*:\s*(.+)$/i.exec(line);
		if (id) return id[1]!.trim();
		if (!/^\w[\w-]*\s*:\s*.*$/.test(line)) break;
	}
	return null;
}

/** Fence keys of every fence card in the set, regardless of schedule. */
export function allFenceCardKeys(cards: readonly Card[]): Set<string> {
	const keys = new Set<string>();
	for (const card of cards) {
		if (isFenceCard(card)) keys.add(fenceKey(card));
	}
	return keys;
}

/** Fence keys of the fence cards the scheduler would study now. */
export function dueOrNewFenceCardKeys(cards: readonly Card[], now: number): Set<string> {
	const keys = new Set<string>();
	for (const card of cards) {
		if (isFenceCard(card) && isDueOrNew(card, now)) keys.add(fenceKey(card));
	}
	return keys;
}

/**
 * The cards a fence key stands for. A node reveals its fence as a whole and
 * takes one rating for it, so that rating has to reach every card the fence
 * derived — the same rule an occluded line follows.
 */
export function cardIdsForFenceKey(cards: readonly Card[], key: string): string[] {
	return cards.filter((card) => isFenceCard(card) && fenceKey(card) === key).map((card) => card.id);
}

/**
 * The cards a fence key stands for, in the order a study surface asks them:
 * the fence's own card, then its cloze or shape groups by number, then the
 * reverse of a bidirectional pair.
 *
 * Sorted rather than taken in store order, because the store hands its note
 * index back in insertion order and an incremental re-sync re-adds an edited
 * card at the end — so a fence would start asking `c2` before `c1` purely
 * because `c1` was the group whose wording changed.
 */
export function cardsForFenceKey(cards: readonly Card[], key: string): Card[] {
	return cards
		.filter((card) => isFenceCard(card) && fenceKey(card) === key)
		.sort((a, b) => askRank(a.id, key) - askRank(b.id, key));
}

/**
 * The questions a fence asks in place this session: its cards in ask order,
 * narrowed to the ones the scheduler would ask now.
 *
 * This is to a fence what `occlusionSteps` is to a diagram — the sequence, kept
 * pure so the surface that draws it and the surface that counts it derive it the
 * same way. It lives here rather than widening `OcclusionStep`, because a cloze
 * or bidirectional step has no `diagram` or `group` and making those optional
 * would weaken the type the mask renderer depends on.
 *
 * Filtering by time is what keeps a fence honest about its size: a three-group
 * cloze fence with one group due is one question, not three — the same rule an
 * occluded diagram and a mind map node already follow.
 */
export function dueCardsForFenceKey(cards: readonly Card[], key: string, now: number): Card[] {
	return cardsForFenceKey(cards, key).filter((card) => isDueOrNew(card, now));
}

/** `<id>` first, then `<id>-cN` by group number, then `<id>-r`. */
function askRank(id: string, key: string): number {
	const suffix = id.slice(key.length);
	if (suffix === "") return 0;
	if (suffix === "-r") return Number.MAX_SAFE_INTEGER;
	return groupNumber(suffix.slice(1));
}

/**
 * Line keys of every line card in the set, regardless of schedule.
 * Same filter as `allLineCardBlockIds`, keyed collision-safely for maps
 * that mix cards from several notes (transclusion).
 *
 * **A line key, not a card ID.** They are the same string for an ordinary line
 * card, but an occluded one fans out into a card *per shape group* (`…-c1`,
 * `…-c2`) while still sitting on one line — and a map node *is* a line. Keying
 * on the card ID meant no node key ever matched, so occluded nodes were never
 * hidden by peek or study even though the header buttons counted them. Use
 * `cardIdsForLineKey` to get back to the cards a key stands for.
 */
export function allLineCardIds(cards: readonly Card[]): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (isLineCard(card)) ids.add(lineCardId(card.notePath, card.blockId!));
	}
	return ids;
}

/**
 * Line keys of the line cards the scheduler would study now. Same filter
 * as `dueOrNewLineCardBlockIds`, keyed collision-safely for maps that
 * mix cards from several notes (transclusion).
 */
export function dueOrNewLineCardIds(cards: readonly Card[], now: number): Set<string> {
	const ids = new Set<string>();
	for (const card of cards) {
		if (isLineCard(card) && isDueOrNew(card, now)) ids.add(lineCardId(card.notePath, card.blockId!));
	}
	return ids;
}

/**
 * The cards a line key stands for: one for an ordinary line card, one per shape
 * group for an occluded one.
 *
 * Both in-place surfaces reveal a whole line at once and take a single rating
 * for it, so that rating has to reach every card the line carries. Looking the
 * key up as a card ID instead found nothing for an occluded line and dropped
 * the review silently — the schedule never moved, and the card came back next
 * session as though it had never been answered.
 */
export function cardIdsForLineKey(cards: readonly Card[], key: string): string[] {
	return cards
		.filter((card) => isLineCard(card) && lineCardId(card.notePath, card.blockId!) === key)
		.map((card) => card.id);
}

/**
 * The occluded diagram on the line a key names, or null when it carries none.
 *
 * Every card the line fans out into holds the whole shape set, so the first one
 * answers it. Resolving through the *line key* is the whole point: an occluded
 * line's cards are `…#^block/c1`, `…/c2`, `…/c3`, so looking the key up as a
 * card ID finds nothing and the caller concludes there are no masks — which is
 * how the mind map came to blank an occluded node behind a "?" and then reveal
 * it unmasked.
 */
export function occlusionForLineKey(cards: readonly Card[], key: string): CardOcclusion | null {
	for (const card of cards) {
		if (isLineCard(card) && lineCardId(card.notePath, card.blockId!) === key && card.occlusion) {
			return card.occlusion;
		}
	}
	return null;
}

/**
 * The key of the *node* a card is laid out on: its line key, or — for a fence
 * card — the fence key. This is what `MindMapView.nodeCardKey` derives from the
 * other end, off the node's own text.
 */
function nodeKeyForCard(card: Card): string {
	return card.blockId === undefined ? fenceKey(card) : lineCardId(card.notePath, card.blockId);
}

/**
 * The units of work spatial *study* asks for on one node.
 *
 * Ordinarily a node is one unit: it reveals, it takes one rating, and that
 * rating reaches every card it carries. An **occluded** node is not. Its shape
 * groups are separate cards with separate schedules, and spatial study is a card
 * player — it has a target, a rating, and a completion count — so it steps
 * through them one at a time exactly as sequential does, and the banner counts
 * cards rather than nodes.
 *
 * This is deliberately *not* what the note surfaces do. Reading view and peek
 * paint every group at once with no target, because a reader looking at a
 * diagram in a note is not answering one of the questions it carries. Study is
 * the surface where there is a question.
 *
 * Only the groups the scheduler would ask now are returned, so a node with one
 * due group out of three is one unit of work, not three.
 *
 * A node whose due cards are *not* all occlusion cards stays a single unit — a
 * fence can mix an occluded diagram with a caption cloze, and splitting on the
 * diagram alone would leave the cloze card with no key and drop its review.
 */
export function spatialStudyKeys(cards: readonly Card[], nodeKey: string, now: number): string[] {
	const due = cards.filter(
		(card) => !card.disabled && nodeKeyForCard(card) === nodeKey && isDueOrNew(card, now),
	);
	if (due.length === 0 || due.some((card) => card.occlusion === undefined)) return [nodeKey];
	return due
		.slice()
		.sort((a, b) => groupNumber(a.occlusion!.target) - groupNumber(b.occlusion!.target))
		.map((card) => card.id);
}

/**
 * The cards a spatial target key stands for.
 *
 * Three key shapes reach here: a line key (`…#^block`), a fence key (`bridge`),
 * and — once `spatialStudyKeys` has split an occluded node — a single occlusion
 * card's own ID (`bridge-c1`, `…#^block/c1`). The last is checked first, because
 * both of the other lookups would find nothing for it and silently drop the
 * review, which is exactly how rating an occluded line came to record nothing.
 */
export function cardIdsForSpatialKey(cards: readonly Card[], key: string): string[] {
	const own = cards.find((card) => card.id === key && card.occlusion !== undefined && !card.disabled);
	if (own) return [own.id];
	return key.includes("#^") ? cardIdsForLineKey(cards, key) : cardIdsForFenceKey(cards, key);
}

/**
 * Card keys carried by a node and its laid-out descendants ("Study this
 * branch" scope). Local nodes key against the host note; transcluded
 * nodes key against their origin note, so their ratings and schedules
 * stay with the note that owns the line. Transcluded nodes lacking a
 * resolved `sourceFile` are skipped — a key can't be attributed.
 */
export function collectSubtreeCardKeys(root: SpatialNodeLike, hostPath: string): Set<string> {
	const keys = new Set<string>();
	const visit = (node: SpatialNodeLike): void => {
		const { blockId, isTranscluded, sourceFile } = node.source;
		if (blockId !== undefined) {
			const path = isTranscluded ? sourceFile : hostPath;
			if (path !== undefined) keys.add(lineCardId(path, blockId));
		}
		for (const child of node.children) {
			visit(child);
		}
	};
	visit(root);
	return keys;
}
