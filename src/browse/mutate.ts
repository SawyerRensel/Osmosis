import type { TFile } from "obsidian";
import { removeBlockIdsInRange } from "../card-gen/generate-ids";
import { resolveDeck } from "../card-gen/frontmatter";
import type { Card } from "../database/types";
import type { CardStore } from "../store/CardStore";
import { fenceHasOwnDeck, parseCardIdParts, removeFence } from "../store/FenceWriter";

/**
 * The card browser's four mutations: suspend/unsuspend, reset scheduling, delete,
 * and change deck.
 *
 * **`CardStore` is in-memory only, so every mutation writes through twice** —
 * once to the store, so the browser and the dashboard are correct immediately,
 * and once to the markdown, which is the actual source of truth. The write path
 * differs by card kind: a line card's schedule lives in `osmosis-schedule`
 * frontmatter (via `ScheduleStore`), a fence card's in the fence's own metadata
 * (via `FenceWriter`).
 *
 * The two updates have to *agree*, because `CardSyncService` re-reads the file on
 * a 2s debounce and rebuilds every card in it. Where they disagree, the row
 * visibly flickers back to its old state two seconds later. That constraint is
 * what decides the per-fence question below.
 *
 * ## Fence metadata is per-fence, not per-card
 *
 * A bidi fence generates two cards and a cloze fence one per group, but they
 * share one metadata block. The two halves of that come out differently:
 *
 * - **`exclude:` is per-fence in the file format itself.** Suspending one card of
 *   a fence suspends all of them, and no in-memory bookkeeping can change that —
 *   the re-sync reads `exclude: true` and disables every card the fence makes. So
 *   suspend *includes the siblings deliberately* and reports how many it took,
 *   rather than pretending to a precision the format cannot hold.
 * - **Schedule keys are per-card**, distinguished by the `r-`/`cN-` prefix.
 *   Removal used not to respect that; it does now (see `removeFenceSchedule`), so
 *   reset is genuinely per-card. This matters more than the suspend case: reset
 *   is irreversible, so silently clearing a sibling's scheduling is data loss.
 *
 * Nothing here touches the DOM, shows a `Notice`, or opens a modal — callers get
 * a counted message and decide how to show it. Every dependency is explicit so
 * the whole surface is testable against a fake vault.
 */

// ── Dependencies ──────────────────────────────────────────────

/** The fence-metadata write path (`FenceWriter`). */
export interface FenceCardWriter {
	writeExclude(file: TFile, cardId: string, exclude: boolean): Promise<void>;
	removeSchedule(file: TFile, cardId: string): Promise<void>;
}

/** The `osmosis-schedule` frontmatter write path for line cards (`ScheduleStore`). */
export interface LineCardWriter {
	setDisabled(notePath: string, blockId: string, disabled: boolean): void;
	removeSchedule(notePath: string, blockId: string): void;
	flushPath(notePath: string): Promise<void>;
}

/** Note reads and writes (`Vault` plus `FileManager`). */
export interface NoteFiles {
	read(file: TFile): Promise<string>;
	process(file: TFile, fn: (data: string) => string): Promise<string>;
	processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void>;
}

export interface MutationDeps {
	cardStore: CardStore;
	fenceWriter: FenceCardWriter;
	lineCards: LineCardWriter;
	files: NoteFiles;
	resolveFile(notePath: string): TFile | null;
}

// ── Undo records ──────────────────────────────────────────────

/** One note's full content either side of a mutation. */
export interface FileSnapshot {
	path: string;
	before: string;
	after: string;
}

/** One card's store state either side of a mutation. `null` means it did not exist. */
export interface CardSnapshot {
	id: string;
	before: Card | null;
	after: Card | null;
}

/**
 * Everything needed to replay or reverse one mutation.
 *
 * Full content snapshots rather than inverse operations: the four mutations
 * would otherwise need four different inversions, and delete's — re-inserting a
 * stripped block ID or a whole fence at the right position — is by far the most
 * breakable of them. Snapshots make undo one operation, and notes are small.
 */
export interface MutationRecord {
	/** Names the action in the undo control, e.g. `Suspend 3 cards`. */
	label: string;
	files: FileSnapshot[];
	cards: CardSnapshot[];
}

/** A completed mutation: what to remember, and what to tell the user. */
export interface MutationOutcome {
	record: MutationRecord;
	/** Counted and pluralised, ready to show. */
	message: string;
}

// ── Selection planning (pure) ─────────────────────────────────

/** True for a line card, whose schedule lives in frontmatter rather than a fence. */
export function isLineCard(card: Card): boolean {
	return card.blockId !== undefined;
}

/** The cards one fence generates, split into the selected ones and the rest. */
export interface FenceGroup {
	/** The fence's own ID — `abc123` for cards `abc123`, `abc123-r`, `abc123-c1`. */
	baseId: string;
	/** Any card from the fence, for locating it in the markdown. */
	cardId: string;
	sourceLine: number;
	selected: Card[];
	/** Same fence, not selected. Per-fence metadata drags these along. */
	siblings: Card[];
}

/** A selection reorganised into the shape its write paths need. */
export interface NotePlan {
	notePath: string;
	lineCards: Card[];
	fences: FenceGroup[];
}

/**
 * Group a selection by note, then split each note's cards into line cards and
 * fences — the two write paths — and work out which unselected cards each fence
 * drags along with it.
 *
 * Notes are sorted so a multi-note message and its file list read the same way
 * on every run.
 */
export function planByNote(
	selected: readonly Card[],
	cardsInNote: (notePath: string) => readonly Card[],
): NotePlan[] {
	const byNote = new Map<string, Card[]>();
	for (const card of selected) {
		const list = byNote.get(card.notePath);
		if (list) list.push(card);
		else byNote.set(card.notePath, [card]);
	}

	const plans: NotePlan[] = [];
	for (const [notePath, cards] of byNote) {
		const groups = new Map<string, FenceGroup>();
		for (const card of cards) {
			if (isLineCard(card)) continue;
			const { baseId } = parseCardIdParts(card.id);
			const group = groups.get(baseId);
			if (group) group.selected.push(card);
			else {
				groups.set(baseId, {
					baseId,
					cardId: card.id,
					sourceLine: card.sourceLine,
					selected: [card],
					siblings: [],
				});
			}
		}

		const noteCards = cardsInNote(notePath);
		for (const group of groups.values()) {
			const selectedIds = new Set(group.selected.map((card) => card.id));
			group.siblings = noteCards.filter((card) =>
				!isLineCard(card)
				&& !selectedIds.has(card.id)
				&& parseCardIdParts(card.id).baseId === group.baseId);
		}

		plans.push({
			notePath,
			lineCards: cards.filter(isLineCard),
			fences: [...groups.values()],
		});
	}

	plans.sort((a, b) => a.notePath.localeCompare(b.notePath));
	return plans;
}

// ── Suspend / unsuspend ───────────────────────────────────────

/** Whether a card is currently suspended. */
function isSuspended(card: Card): boolean {
	return card.disabled === true;
}

/**
 * Suspend or unsuspend a selection: out of study, FSRS state preserved, fully
 * reversible.
 *
 * Cards already in the target state are skipped, so "Suspend" over a mixed
 * selection suspends the rest instead of toggling half of it back on. Fence
 * siblings come along because `exclude:` cannot express anything narrower — the
 * returned message says how many, since the alternative is a user watching
 * cards they did not select change state with no explanation.
 */
export async function setSuspended(
	deps: MutationDeps,
	selected: readonly Card[],
	suspend: boolean,
): Promise<MutationOutcome | null> {
	const plans = planByNote(selected, (notePath) => deps.cardStore.getCardsByNote(notePath));

	const files: FileSnapshot[] = [];
	const before = new Map<string, Card>();
	let spillover = 0;

	for (const plan of plans) {
		const file = deps.resolveFile(plan.notePath);
		if (!file) continue;

		const needsChange = (card: Card): boolean => isSuspended(card) !== suspend;
		const lineTargets = plan.lineCards.filter(needsChange);
		const fenceGroups = plan.fences.filter((group) =>
			[...group.selected, ...group.siblings].some(needsChange));
		const fenceTargets = fenceGroups.flatMap((group) =>
			[...group.selected, ...group.siblings].filter(needsChange));

		if (lineTargets.length === 0 && fenceTargets.length === 0) continue;
		spillover += fenceGroups.reduce(
			(total, group) => total + group.siblings.filter(needsChange).length,
			0,
		);

		const contentBefore = await readSettled(deps, file, plan.notePath);
		for (const card of [...lineTargets, ...fenceTargets]) {
			before.set(card.id, { ...card });
		}

		for (const card of lineTargets) {
			deps.cardStore.setDisabled(card.id, suspend);
			deps.lineCards.setDisabled(plan.notePath, card.blockId!, suspend);
		}
		for (const card of fenceTargets) {
			deps.cardStore.setDisabled(card.id, suspend);
		}

		// One write per fence, not per card: `exclude:` is a property of the fence.
		for (const group of fenceGroups) {
			await deps.fenceWriter.writeExclude(file, group.cardId, suspend);
		}
		if (lineTargets.length > 0) await deps.lineCards.flushPath(plan.notePath);

		files.push({ path: plan.notePath, before: contentBefore, after: await deps.files.read(file) });
	}

	if (before.size === 0) return null;

	const verb = suspend ? "Suspended" : "Unsuspended";
	const label = `${suspend ? "Suspend" : "Unsuspend"} ${countCards(before.size)}`;
	let message = `${verb} ${countCards(before.size)}.`;
	if (spillover > 0) {
		message += ` ${countCards(spillover)} shared a fence with your selection and ${spillover === 1 ? "was" : "were"} ${verb.toLowerCase()} too.`;
	}

	return { record: { label, files, cards: snapshotPairs(deps.cardStore, before) }, message };
}

// ── Reset scheduling ──────────────────────────────────────────

/**
 * A card has scheduling to clear when it has a due date. Absence of `due` is
 * what makes a card new everywhere else in the codebase, so it is the test here
 * too — resetting a card that is already new is a no-op worth counting out.
 */
function hasSchedule(card: Card): boolean {
	return card.due !== undefined;
}

/**
 * Return a selection to "new": FSRS state cleared, review-log entries untouched.
 *
 * Irreversible in scheduling terms (the undo record can restore it within the
 * session, but there is no second chance after that), which is why the fence
 * write is prefix-scoped — a reset that also wiped the siblings sharing the
 * fence would be silent, unrecoverable data loss.
 */
export async function resetCards(
	deps: MutationDeps,
	selected: readonly Card[],
): Promise<MutationOutcome | null> {
	const plans = planByNote(selected, (notePath) => deps.cardStore.getCardsByNote(notePath));

	const files: FileSnapshot[] = [];
	const before = new Map<string, Card>();

	for (const plan of plans) {
		const file = deps.resolveFile(plan.notePath);
		if (!file) continue;

		const lineTargets = plan.lineCards.filter(hasSchedule);
		// Only the selected cards — never the siblings. That is the whole point of
		// scoping the fence write to this card's key prefix.
		const fenceTargets = plan.fences.flatMap((group) => group.selected.filter(hasSchedule));
		if (lineTargets.length === 0 && fenceTargets.length === 0) continue;

		const contentBefore = await readSettled(deps, file, plan.notePath);
		for (const card of [...lineTargets, ...fenceTargets]) {
			before.set(card.id, { ...card });
		}

		for (const card of lineTargets) {
			deps.cardStore.clearSchedule(card.id);
			deps.lineCards.removeSchedule(plan.notePath, card.blockId!);
		}
		for (const card of fenceTargets) {
			deps.cardStore.clearSchedule(card.id);
			await deps.fenceWriter.removeSchedule(file, card.id);
		}
		if (lineTargets.length > 0) await deps.lineCards.flushPath(plan.notePath);

		files.push({ path: plan.notePath, before: contentBefore, after: await deps.files.read(file) });
	}

	if (before.size === 0) return null;

	return {
		record: {
			label: `Reset ${countCards(before.size)}`,
			files,
			cards: snapshotPairs(deps.cardStore, before),
		},
		message: `Reset ${countCards(before.size)} to new. Review history was kept.`,
	};
}

// ── Delete ────────────────────────────────────────────────────

/**
 * One edit to make to a note to delete a card.
 *
 * A fence card takes its whole fence, because the fence *is* the card. A line
 * card takes only its block ID: the line is the user's own prose, and the
 * browser's governing principle is that it mutates scheduling, not content.
 */
export type DeleteOp =
	| { kind: "fence"; cardId: string; sourceLine: number }
	| { kind: "line"; sourceLine: number };

/** Everything one note loses in a delete. */
export interface NoteDeletion {
	notePath: string;
	/** Descending by source line — see `applyDeleteOps`. */
	ops: DeleteOp[];
	/** Every card that ceases to exist, selected or dragged in by its fence. */
	cards: Card[];
	/** Of those, the ones the user did not select. */
	siblings: Card[];
}

/**
 * Work out the edits a delete needs, per note.
 *
 * Ops come back **descending by source line**, and applying them in that order
 * is load-bearing: removing a standalone `^os-…` line deletes the line outright,
 * and removing a fence deletes many, so any op applied earlier would shift the
 * line numbers of every op below it.
 */
export function buildDeletions(
	selected: readonly Card[],
	cardsInNote: (notePath: string) => readonly Card[],
): NoteDeletion[] {
	return planByNote(selected, cardsInNote).map((plan) => {
		const ops: DeleteOp[] = [
			...plan.fences.map((group): DeleteOp => ({
				kind: "fence",
				cardId: group.cardId,
				sourceLine: group.sourceLine,
			})),
			...plan.lineCards.map((card): DeleteOp => ({ kind: "line", sourceLine: card.sourceLine })),
		];
		ops.sort((a, b) => b.sourceLine - a.sourceLine);

		const siblings = plan.fences.flatMap((group) => group.siblings);
		return {
			notePath: plan.notePath,
			ops,
			cards: [
				...plan.lineCards,
				...plan.fences.flatMap((group) => [...group.selected, ...group.siblings]),
			],
			siblings,
		};
	});
}

/** Apply a note's delete ops to its markdown. Ops must already be descending. */
export function applyDeleteOps(content: string, ops: readonly DeleteOp[]): string {
	let result = content;
	for (const op of ops) {
		result = op.kind === "fence"
			? removeFence(result, op.cardId).content
			: removeBlockIdsInRange(result, { start: op.sourceLine, end: op.sourceLine }).content;
	}
	return result;
}

/** What a delete is about to do, for the confirmation the caller must show first. */
export interface DeletePreview {
	deletions: NoteDeletion[];
	/** Cards that will cease to exist. */
	cardCount: number;
	/** Of those, ones the user did not select but a fence drags along. */
	siblingCount: number;
	/** Block IDs in range that Osmosis did not author — removing them breaks links. */
	userIdCount: number;
	notePaths: string[];
}

/**
 * Dry-run a delete. Delete is the one mutation that edits the user's content, so
 * it is the one that must be described before it happens rather than after.
 */
export async function previewDelete(
	deps: MutationDeps,
	selected: readonly Card[],
): Promise<DeletePreview> {
	const deletions = buildDeletions(selected, (notePath) => deps.cardStore.getCardsByNote(notePath));

	let userIdCount = 0;
	for (const deletion of deletions) {
		const file = deps.resolveFile(deletion.notePath);
		if (!file) continue;
		const content = await deps.files.read(file);
		for (const op of deletion.ops) {
			if (op.kind !== "line") continue;
			const dryRun = removeBlockIdsInRange(content, { start: op.sourceLine, end: op.sourceLine });
			userIdCount += dryRun.removed.filter((removed) => removed.isUserId).length;
		}
	}

	return {
		deletions,
		cardCount: deletions.reduce((total, deletion) => total + deletion.cards.length, 0),
		siblingCount: deletions.reduce((total, deletion) => total + deletion.siblings.length, 0),
		userIdCount,
		notePaths: deletions.map((deletion) => deletion.notePath),
	};
}

/**
 * Carry out a previewed delete.
 *
 * A line card's schedule entry is deliberately left in `osmosis-schedule`: the
 * existing orphan flow soft-deletes entries whose block ID has gone, which is
 * the same path `removeLineCards` relies on from the editor.
 */
export async function applyDelete(
	deps: MutationDeps,
	preview: DeletePreview,
): Promise<MutationOutcome | null> {
	const files: FileSnapshot[] = [];
	const before = new Map<string, Card>();

	for (const deletion of preview.deletions) {
		const file = deps.resolveFile(deletion.notePath);
		if (!file || deletion.ops.length === 0) continue;

		const contentBefore = await readSettled(deps, file, deletion.notePath);
		for (const card of deletion.cards) {
			before.set(card.id, { ...card });
		}

		await deps.files.process(file, (data) => applyDeleteOps(data, deletion.ops));
		for (const card of deletion.cards) {
			deps.cardStore.removeCard(card.id);
		}

		files.push({ path: deletion.notePath, before: contentBefore, after: await deps.files.read(file) });
	}

	if (before.size === 0) return null;

	return {
		record: {
			label: `Delete ${countCards(before.size)}`,
			files,
			cards: snapshotPairs(deps.cardStore, before),
		},
		message: `Deleted ${countCards(before.size)} from ${countNotes(files.length)}.`,
	};
}

// ── Change deck ───────────────────────────────────────────────

/**
 * Move whole notes to another deck by writing `osmosis-deck` frontmatter. An
 * empty `deck` removes the key, so the notes fall back to their folder.
 *
 * Per-*note*, because a line card has no deck of its own — it inherits from
 * frontmatter or the folder. Fence cards can carry their own `deck:`, and those
 * are **left alone and reported**: rewriting them would edit fence bodies, which
 * is user content, and would silently discard a per-card choice made on purpose.
 */
export async function changeDeck(
	deps: MutationDeps,
	notePaths: readonly string[],
	deck: string,
): Promise<MutationOutcome | null> {
	const files: FileSnapshot[] = [];
	const before = new Map<string, Card>();
	let overrides = 0;

	for (const notePath of [...notePaths].sort((a, b) => a.localeCompare(b))) {
		const file = deps.resolveFile(notePath);
		if (!file) continue;

		const cards = deps.cardStore.getCardsByNote(notePath);
		if (cards.length === 0) continue;

		const contentBefore = await readSettled(deps, file, notePath);
		// Read the override out of the markdown rather than off the card: a fence
		// deck that happens to equal the resolved note deck is invisible after
		// resolution but still wins, and would otherwise go unreported.
		const moving = cards.filter((card) => isLineCard(card) || !fenceHasOwnDeck(contentBefore, card.id));
		overrides += cards.length - moving.length;
		if (moving.length === 0) {
			files.push({ path: notePath, before: contentBefore, after: contentBefore });
			continue;
		}

		await deps.files.processFrontMatter(file, (frontmatter) => {
			if (deck === "") delete frontmatter["osmosis-deck"];
			else frontmatter["osmosis-deck"] = deck;
		});

		const resolved = resolveDeck(deck, "", notePath);
		for (const card of moving) {
			before.set(card.id, { ...card });
			deps.cardStore.addCard({ ...card, deck: resolved });
		}

		files.push({ path: notePath, before: contentBefore, after: await deps.files.read(file) });
	}

	if (before.size === 0) {
		return overrides > 0
			? {
				record: { label: "Change deck", files: [], cards: [] },
				message: `Nothing moved. ${countCards(overrides)} set their own deck in the fence.`,
			}
			: null;
	}

	const destination = deck === "" ? "their folder deck" : `"${deck}"`;
	let message = `Moved ${countCards(before.size)} to ${destination}.`;
	if (overrides > 0) {
		message += ` ${countCards(overrides)} set their own deck in the fence and ${overrides === 1 ? "was" : "were"} left alone.`;
	}

	return {
		record: {
			label: `Change deck for ${countCards(before.size)}`,
			files,
			cards: snapshotPairs(deps.cardStore, before),
		},
		message,
	};
}

// ── Shared helpers ────────────────────────────────────────────

/**
 * Read a note for the `before` half of an undo record, after settling any
 * schedule writes still staged against it.
 *
 * A card rated seconds ago has its frontmatter write sitting in `ScheduleStore`'s
 * 2s debounce. Snapshotting the file first and flushing afterwards would fold
 * that review into this mutation's own change — and undoing the mutation would
 * then silently discard the review. Flushing is free when nothing is staged.
 */
async function readSettled(deps: MutationDeps, file: TFile, notePath: string): Promise<string> {
	await deps.lineCards.flushPath(notePath);
	return deps.files.read(file);
}

/**
 * Pair each pre-mutation clone with the card's current state, so one record can
 * be replayed in either direction. A card the mutation removed reads as `null`.
 */
function snapshotPairs(store: CardStore, before: ReadonlyMap<string, Card>): CardSnapshot[] {
	const pairs: CardSnapshot[] = [];
	for (const [id, prior] of before) {
		const current = store.getCard(id);
		pairs.push({ id, before: prior, after: current ? { ...current } : null });
	}
	return pairs;
}

/** Shared so a confirmation and the message that follows it count alike. */
export function countCards(count: number): string {
	return `${String(count)} card${count === 1 ? "" : "s"}`;
}

export function countNotes(count: number): string {
	return `${String(count)} note${count === 1 ? "" : "s"}`;
}
