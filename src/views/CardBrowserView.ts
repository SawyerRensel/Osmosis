import {
	BasesView,
	Notice,
	TFile,
	type BasesAllOptions,
	type BasesViewRegistration,
	type QueryController,
} from "obsidian";
import type OsmosisPlugin from "../main";
import {
	buildFlat,
	buildGroups,
	readBrowseOptions,
	toRow,
	type CardRow,
	type Layout,
	type NoteGroup,
} from "../browse/cards";
import type { Card } from "../database/types";

/** View type registered with Bases, and the `type:` written into a `.base` file. */
export const BASES_CARD_BROWSER_VIEW_ID = "osmosis-cards";

/**
 * A Bases view listing the Osmosis cards inside the notes a base returns.
 *
 * **Bases owns which notes appear; Osmosis owns the cards inside them.** That
 * split is forced rather than chosen: a Bases row is a file (`BasesEntry.file`
 * is required, and `QueryController` exposes no way for a plugin to supply
 * rows), while a single note routinely holds many cards and explicit cards live
 * in ```osmosis fences that Bases cannot see at all. So one-row-per-card is
 * unachievable through Bases at any amount of effort.
 *
 * What that buys, and what it costs:
 *
 *   - Bases handles the note-level query, sort, and `.base` persistence — the
 *     native system, not a reimplementation of it.
 *   - A `.base` filter can express "notes that have cards" but never "cards due
 *     today". Every per-card predicate is Osmosis code, in `browse/cards.ts`.
 *
 * Two consequences of the split are worth stating because they read as bugs:
 * the Bases property/column config applies to *notes*, so it does not choose
 * this view's card columns (which are fixed card fields); and Bases' groupBy is
 * not honoured, because the view already groups by note.
 */
export class CardBrowserView extends BasesView {
	type = BASES_CARD_BROWSER_VIEW_ID;

	private readonly plugin: OsmosisPlugin;
	private readonly containerEl: HTMLElement;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: OsmosisPlugin) {
		super(controller);
		this.containerEl = containerEl;
		this.plugin = plugin;
	}

	onDataUpdated(): void {
		this.render();
	}

	private render(): void {
		const container = this.containerEl;
		container.empty();
		container.addClass("osmosis-browse");

		const options = readBrowseOptions((key) => this.config.get(key));
		const now = Date.now();
		const notePaths = this.data.data.map((entry) => entry.file.path);
		const cardsByNote = (notePath: string): Card[] =>
			this.plugin.cardStore.getCardsByNote(notePath);

		if (notePaths.length === 0) {
			renderEmpty(container, "No notes match this base's filters.");
			return;
		}

		if (options.layout === "table") {
			const cards = buildFlat(notePaths, cardsByNote, options, now);
			if (cards.length === 0) {
				renderEmpty(container, emptyCardsMessage(notePaths.length));
				return;
			}
			this.renderTable(container, cards, now);
			return;
		}

		const groups = buildGroups(notePaths, cardsByNote, options, now);
		if (groups.length === 0) {
			renderEmpty(container, emptyCardsMessage(notePaths.length));
			return;
		}
		this.renderGrouped(container, groups, now, options.layout);
	}

	// ── Table: one flat, globally sorted row per card ─────────────

	private renderTable(parent: HTMLElement, cards: readonly Card[], now: number): void {
		const scroller = parent.createDiv({ cls: "osmosis-browse-scroll" });
		const table = scroller.createEl("table", { cls: "osmosis-browse-table" });

		const headerRow = table.createEl("thead").createEl("tr");
		for (const column of TABLE_COLUMNS) {
			headerRow.createEl("th", { text: column.label, cls: `osmosis-browse-cell-${column.key}` });
		}

		const tbody = table.createEl("tbody");
		for (const card of cards) {
			// One malformed card must not blank the rest of the table, nor take
			// out the caller with it.
			try {
				this.renderTableRow(tbody, toRow(card, now));
			} catch (error) {
				console.error("Osmosis: card browser could not render card", card.id, error);
			}
		}
	}

	private renderTableRow(tbody: HTMLElement, row: CardRow): void {
		const tr = tbody.createEl("tr", { cls: "osmosis-browse-row" });
		if (row.suspended) tr.addClass("osmosis-browse-suspended");

		for (const column of TABLE_COLUMNS) {
			tr.createEl("td", {
				text: column.value(row),
				cls: `osmosis-browse-cell-${column.key}`,
			});
		}

		tr.addEventListener("click", () => {
			void this.openCard(row.card);
		});
	}

	// ── List and cards: grouped under their note ──────────────────

	private renderGrouped(
		parent: HTMLElement,
		groups: readonly NoteGroup[],
		now: number,
		layout: Layout,
	): void {
		const scroller = parent.createDiv({ cls: "osmosis-browse-scroll" });

		for (const group of groups) {
			try {
				this.renderGroup(scroller, group, now, layout);
			} catch (error) {
				console.error("Osmosis: card browser could not render note", group.notePath, error);
			}
		}
	}

	private renderGroup(
		parent: HTMLElement,
		group: NoteGroup,
		now: number,
		layout: Layout,
	): void {
		const section = parent.createDiv({ cls: "osmosis-browse-group" });

		const header = section.createDiv({ cls: "osmosis-browse-group-header" });
		const title = header.createSpan({
			cls: "osmosis-browse-group-title",
			text: noteName(group.notePath),
		});
		title.addEventListener("click", () => {
			void this.openNote(group.notePath);
		});
		header.createSpan({
			cls: "osmosis-browse-group-decks",
			text: group.decks.join(", "),
		});
		header.createSpan({
			cls: "osmosis-browse-group-count",
			text: `${String(group.cards.length)} card${group.cards.length === 1 ? "" : "s"}`,
		});

		const body = section.createDiv({
			cls: layout === "cards" ? "osmosis-browse-tiles" : "osmosis-browse-lines",
		});

		for (const card of group.cards) {
			try {
				const row = toRow(card, now);
				if (layout === "cards") this.renderTile(body, row);
				else this.renderLine(body, row);
			} catch (error) {
				console.error("Osmosis: card browser could not render card", card.id, error);
			}
		}
	}

	private renderLine(parent: HTMLElement, row: CardRow): void {
		const line = parent.createDiv({ cls: "osmosis-browse-line" });
		if (row.suspended) line.addClass("osmosis-browse-suspended");

		line.createSpan({ cls: "osmosis-browse-line-front", text: row.front });
		line.createSpan({ cls: "osmosis-browse-badge", text: row.typeLabel });
		line.createSpan({ cls: `osmosis-browse-badge osmosis-browse-state-${row.state}`, text: row.state });
		line.createSpan({ cls: "osmosis-browse-line-due", text: row.due });

		line.addEventListener("click", () => {
			void this.openCard(row.card);
		});
	}

	private renderTile(parent: HTMLElement, row: CardRow): void {
		const tile = parent.createDiv({ cls: "osmosis-browse-tile" });
		if (row.suspended) tile.addClass("osmosis-browse-suspended");

		tile.createDiv({ cls: "osmosis-browse-tile-front", text: row.front });

		const meta = tile.createDiv({ cls: "osmosis-browse-tile-meta" });
		meta.createSpan({ cls: "osmosis-browse-badge", text: row.typeLabel });
		meta.createSpan({ cls: `osmosis-browse-badge osmosis-browse-state-${row.state}`, text: row.state });
		meta.createSpan({ cls: "osmosis-browse-tile-due", text: row.due });

		tile.addEventListener("click", () => {
			void this.openCard(row.card);
		});
	}

	// ── Navigation ────────────────────────────────────────────────

	/** Open a card's note, scrolled to the line the card came from. */
	private async openCard(card: Card): Promise<void> {
		const file = this.app.vault.getFileByPath(card.notePath);
		if (!(file instanceof TFile)) {
			new Notice(`Osmosis: "${card.notePath}" is no longer in the vault.`);
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file, {
			eState: { line: card.sourceLine },
		});
	}

	private async openNote(notePath: string): Promise<void> {
		const file = this.app.vault.getFileByPath(notePath);
		if (!(file instanceof TFile)) {
			new Notice(`Osmosis: "${notePath}" is no longer in the vault.`);
			return;
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}

// ── Columns ───────────────────────────────────────────────────

/**
 * The table's columns, in order.
 *
 * These are card fields, so they are fixed rather than read from
 * `config.getOrder()` — that order lists *note* properties, which this view
 * does not show as columns.
 */
const TABLE_COLUMNS: readonly { key: string; label: string; value: (row: CardRow) => string }[] = [
	{ key: "front", label: "Card", value: (row) => row.front },
	{ key: "type", label: "Type", value: (row) => row.typeLabel },
	{ key: "deck", label: "Deck", value: (row) => row.deck },
	{ key: "state", label: "State", value: (row) => row.state },
	{ key: "due", label: "Due", value: (row) => row.due },
	{ key: "stability", label: "Stability", value: (row) => row.stability },
	{ key: "difficulty", label: "Difficulty", value: (row) => row.difficulty },
	{ key: "reps", label: "Reps", value: (row) => row.reps },
	{ key: "lapses", label: "Lapses", value: (row) => row.lapses },
	{ key: "note", label: "Note", value: (row) => noteName(row.card.notePath) },
	{ key: "id", label: "ID", value: (row) => row.card.id },
];

/** A note path as its basename, which is what a row has room to show. */
function noteName(notePath: string): string {
	const base = notePath.split("/").pop() ?? notePath;
	return base.endsWith(".md") ? base.slice(0, -3) : base;
}

function renderEmpty(parent: HTMLElement, message: string): void {
	parent.createDiv({ cls: "osmosis-browse-empty", text: message });
}

/**
 * Distinguishes "your base matched nothing" from "your base matched notes that
 * hold no cards you asked to see" — a filter combination that returns nothing
 * otherwise looks identical to a broken query.
 */
function emptyCardsMessage(noteCount: number): string {
	return `No cards to show. ${String(noteCount)} note${noteCount === 1 ? "" : "s"} matched this base, but none hold cards matching the current filters.`;
}

// ── Registration ──────────────────────────────────────────────

/**
 * The Bases registration: name and icon for the view picker, a factory, and the
 * six options Bases persists into the `.base` file.
 *
 * Those options are what makes "save your configuration as a `.base` file" true
 * of the *card*-level settings and not just the note-level ones Bases already
 * owns.
 */
export function createCardBrowserRegistration(plugin: OsmosisPlugin): BasesViewRegistration {
	return {
		name: "Osmosis Cards",
		icon: "layers",
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new CardBrowserView(controller, containerEl, plugin),
		options: (): BasesAllOptions[] => [
			{
				type: "dropdown",
				key: "layout",
				displayName: "Layout",
				default: "table",
				options: { table: "Table", list: "List", cards: "Cards" },
			},
			{
				type: "dropdown",
				key: "cardState",
				displayName: "Card state",
				default: "all",
				options: {
					all: "All",
					new: "New",
					learning: "Learning",
					review: "Review",
					relearning: "Relearning",
				},
			},
			{
				type: "dropdown",
				key: "dueWindow",
				displayName: "Due within",
				default: "any",
				options: {
					any: "Any",
					overdue: "Overdue",
					today: "Today",
					"7d": "Next 7 days",
					"30d": "Next 30 days",
				},
			},
			{
				// `occlusion` is absent until image occlusion exists — a filter
				// value that can never match reads as a broken control.
				type: "dropdown",
				key: "cardType",
				displayName: "Card type",
				default: "all",
				options: {
					all: "All",
					explicit: "Basic",
					explicit_bidi: "Bidirectional",
					explicit_cloze: "Cloze",
					code_cloze: "Code cloze",
					line: "Line",
				},
			},
			{
				type: "dropdown",
				key: "sortBy",
				displayName: "Sort cards by",
				default: "due",
				options: {
					due: "Due",
					state: "State",
					stability: "Stability",
					difficulty: "Difficulty",
					reps: "Reps",
					lapses: "Lapses",
					note: "Note",
					deck: "Deck",
				},
			},
			{
				type: "toggle",
				key: "showDisabled",
				displayName: "Show suspended cards",
				default: false,
			},
		],
	};
}
