import {
	BasesView,
	MarkdownRenderer,
	Notice,
	TFile,
	type BasesAllOptions,
	type BasesViewConfig,
	type BasesViewRegistration,
	type QueryController,
} from "obsidian";
import type OsmosisPlugin from "../main";
import {
	FILTERABLE_CARD_TYPES,
	TILE_HEIGHT,
	buildFlat,
	buildGroups,
	cardTypeOptionKey,
	readBrowseOptions,
	toRow,
	typeLabel,
	type BrowseOptions,
	type CardRow,
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
 * The consequence that surprises people: the toolbar's Sort, Filter, Properties
 * and Search menus operate on `BasesPropertyId` values and are applied to
 * *entries* before this view is handed `data`. They cannot be extended to
 * cards — `BasesPropertyType` is a closed union with no plugin source, and
 * there is no property-registration API. So every card-level control lives in
 * this view's own options instead, which Bases still persists into the `.base`
 * file. What the toolbar *can* do, this view honours: its note ordering
 * (via the `base` sort value) and its groupBy (rendered as an outer level).
 */
export class CardBrowserView extends BasesView {
	type = BASES_CARD_BROWSER_VIEW_ID;

	private readonly plugin: OsmosisPlugin;
	private readonly containerEl: HTMLElement;

	/**
	 * Deferred markdown renders, keyed by the element they fill.
	 *
	 * Card content is real markdown — images, embeds, cloze highlights — and
	 * rendering a few hundred cards eagerly costs far more than it is worth when
	 * a dozen are on screen. Each element is rendered the first time it comes
	 * into view and then forgotten.
	 */
	private observer: IntersectionObserver | null = null;
	private readonly deferred = new Map<Element, () => void>();

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: OsmosisPlugin) {
		super(controller);
		this.containerEl = containerEl;
		this.plugin = plugin;
	}

	onDataUpdated(): void {
		this.render();
	}

	onunload(): void {
		this.teardownObserver();
	}

	private render(): void {
		const container = this.containerEl;
		this.teardownObserver();
		container.empty();
		container.addClass("osmosis-browse");

		const options = readBrowseOptions((key) => this.config.get(key));
		const now = Date.now();

		const scroller = container.createDiv({ cls: "osmosis-browse-scroll" });
		this.setUpObserver(scroller);

		// Bases' own groupBy becomes an outer level above our note grouping. With
		// no groupBy configured this is a single keyless group, which renders as
		// though it were not there.
		const baseGroups = this.data.groupedData;
		const showGroupHeaders = baseGroups.length > 1 || baseGroups.some((group) => group.hasKey());

		let noteCount = 0;
		let cardCount = 0;

		for (const baseGroup of baseGroups) {
			const notePaths = baseGroup.entries.map((entry) => entry.file.path);
			noteCount += notePaths.length;

			const section = showGroupHeaders
				? scroller.createDiv({ cls: "osmosis-browse-basegroup" })
				: scroller;

			const rendered = this.renderNotes(section, notePaths, options, now, () => {
				if (!showGroupHeaders) return;
				section.createDiv({
					cls: "osmosis-browse-basegroup-header",
					text: baseGroup.hasKey() ? String(baseGroup.key) : "No value",
				});
			});

			cardCount += rendered;
			if (rendered === 0 && showGroupHeaders) section.remove();
		}

		if (cardCount === 0) {
			scroller.remove();
			renderEmpty(container, emptyMessage(noteCount, options));
		}
	}

	/**
	 * Render one Bases group's notes in the configured layout, returning how many
	 * cards it produced. `writeHeader` runs only if there is something to head.
	 */
	private renderNotes(
		parent: HTMLElement,
		notePaths: readonly string[],
		options: BrowseOptions,
		now: number,
		writeHeader: () => void,
	): number {
		const cardsByNote = (notePath: string): Card[] =>
			this.plugin.cardStore.getCardsByNote(notePath);

		if (options.layout === "table") {
			const cards = buildFlat(notePaths, cardsByNote, options, now);
			if (cards.length === 0) return 0;
			writeHeader();
			this.renderTable(parent, cards, now);
			return cards.length;
		}

		const groups = buildGroups(notePaths, cardsByNote, options, now);
		if (groups.length === 0) return 0;
		writeHeader();

		let count = 0;
		for (const group of groups) {
			try {
				this.renderGroup(parent, group, now, options);
				count += group.cards.length;
			} catch (error) {
				console.error("Osmosis: card browser could not render note", group.notePath, error);
			}
		}
		return count;
	}

	// ── Table: one flat, globally sorted row per card ─────────────

	private renderTable(parent: HTMLElement, cards: readonly Card[], now: number): void {
		const table = parent.createEl("table", { cls: "osmosis-browse-table" });

		// Fixed layout with explicit widths, because the Card column has to take
		// the leftover space and ellipsize. Under `auto`, the numeric columns
		// win the negotiation and squeeze the card text to nothing.
		const colgroup = table.createEl("colgroup");
		colgroup.createEl("col", { cls: "osmosis-browse-col-index" });
		for (const column of TABLE_COLUMNS) {
			colgroup.createEl("col", { cls: `osmosis-browse-col-${column.key}` });
		}

		const headerRow = table.createEl("thead").createEl("tr");
		headerRow.createEl("th", { text: "#", cls: "osmosis-browse-cell-index" });
		for (const column of TABLE_COLUMNS) {
			headerRow.createEl("th", { text: column.label, cls: `osmosis-browse-cell-${column.key}` });
		}

		const tbody = table.createEl("tbody");
		cards.forEach((card, index) => {
			// One malformed card must not blank the rest of the table, nor take
			// out the caller with it.
			try {
				this.renderTableRow(tbody, toRow(card, now), index + 1);
			} catch (error) {
				console.error("Osmosis: card browser could not render card", card.id, error);
			}
		});
	}

	private renderTableRow(tbody: HTMLElement, row: CardRow, index: number): void {
		const tr = tbody.createEl("tr", { cls: "osmosis-browse-row" });
		if (row.suspended) tr.addClass("osmosis-browse-suspended");

		tr.createEl("td", { text: String(index), cls: "osmosis-browse-cell-index" });

		for (const column of TABLE_COLUMNS) {
			const td = tr.createEl("td", { cls: `osmosis-browse-cell-${column.key}` });
			if (column.key === "front" || column.key === "back") {
				const isFront = column.key === "front";
				this.deferMarkdown(
					td.createDiv({ cls: "osmosis-browse-md osmosis-browse-md-inline" }),
					isFront ? row.card.front : row.card.back,
					row.card.notePath,
					isFront ? row.front : row.back,
				);
			} else if (column.key === "state") {
				td.createSpan({ cls: `osmosis-browse-state osmosis-browse-state-${row.state}`, text: row.state });
			} else {
				td.setText(column.value(row));
			}
		}

		tr.addEventListener("click", () => {
			void this.openCard(row.card);
		});
	}

	// ── List and cards: grouped under their note ──────────────────

	private renderGroup(
		parent: HTMLElement,
		group: NoteGroup,
		now: number,
		options: BrowseOptions,
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

		const isTiles = options.layout === "cards";
		const body = section.createDiv({
			cls: isTiles ? "osmosis-browse-tiles" : "osmosis-browse-lines",
		});
		if (isTiles) {
			body.style.setProperty("--osmosis-tile-height", `${String(options.tileHeight)}px`);
		}

		group.cards.forEach((card, index) => {
			try {
				const row = toRow(card, now);
				if (isTiles) this.renderTile(body, row);
				else this.renderLine(body, row, index + 1);
			} catch (error) {
				console.error("Osmosis: card browser could not render card", card.id, error);
			}
		});
	}

	private renderLine(parent: HTMLElement, row: CardRow, index: number): void {
		const line = parent.createDiv({ cls: "osmosis-browse-line" });
		if (row.suspended) line.addClass("osmosis-browse-suspended");

		line.createSpan({ cls: "osmosis-browse-line-index", text: String(index) });

		// Front and back share one flexible column so the badges stay aligned
		// down the list however long either half is.
		const content = line.createDiv({ cls: "osmosis-browse-line-content" });
		this.deferMarkdown(
			content.createDiv({ cls: "osmosis-browse-md osmosis-browse-md-inline osmosis-browse-line-front" }),
			row.card.front,
			row.card.notePath,
			row.front,
		);
		if (row.back !== "") {
			content.createSpan({ cls: "osmosis-browse-line-sep", text: "·" });
			this.deferMarkdown(
				content.createDiv({ cls: "osmosis-browse-md osmosis-browse-md-inline osmosis-browse-line-back" }),
				row.card.back,
				row.card.notePath,
				row.back,
			);
		}

		line.createSpan({ cls: "osmosis-browse-badge", text: row.typeLabel });
		line.createSpan({ cls: `osmosis-browse-state osmosis-browse-state-${row.state}`, text: row.state });
		line.createSpan({ cls: "osmosis-browse-line-due", text: row.due });

		line.addEventListener("click", () => {
			void this.openCard(row.card);
		});
	}

	private renderTile(parent: HTMLElement, row: CardRow): void {
		const tile = parent.createDiv({ cls: "osmosis-browse-tile" });
		if (row.suspended) tile.addClass("osmosis-browse-suspended");

		// Front over back with a rule between them — the same shape the card has
		// in study, so a tile is recognisable as the card it is.
		const body = tile.createDiv({ cls: "osmosis-browse-tile-body" });
		this.deferMarkdown(
			body.createDiv({ cls: "osmosis-browse-md osmosis-browse-tile-front" }),
			row.card.front,
			row.card.notePath,
			row.front,
		);
		if (row.back !== "") {
			body.createDiv({ cls: "osmosis-browse-tile-divider" });
			this.deferMarkdown(
				body.createDiv({ cls: "osmosis-browse-md osmosis-browse-tile-back" }),
				row.card.back,
				row.card.notePath,
				row.back,
			);
		}

		const meta = tile.createDiv({ cls: "osmosis-browse-tile-meta" });
		meta.createSpan({ cls: "osmosis-browse-badge", text: row.typeLabel });
		meta.createSpan({ cls: `osmosis-browse-state osmosis-browse-state-${row.state}`, text: row.state });
		meta.createSpan({ cls: "osmosis-browse-tile-due", text: row.due });

		tile.addEventListener("click", () => {
			void this.openCard(row.card);
		});
	}

	// ── Deferred markdown ─────────────────────────────────────────

	private setUpObserver(root: HTMLElement): void {
		this.observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const render = this.deferred.get(entry.target);
					this.deferred.delete(entry.target);
					this.observer?.unobserve(entry.target);
					render?.();
				}
			},
			// A screen of lead-in, so scrolling reaches already-rendered content
			// rather than watching it appear.
			{ root, rootMargin: "200px 0px" },
		);
	}

	private teardownObserver(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.deferred.clear();
	}

	/**
	 * Fill an element with rendered markdown once it scrolls into view.
	 *
	 * `sourcePath` is the card's own note, which is what makes relative image
	 * links, embeds and wikilinks resolve the way they do in the note itself.
	 * The plain-text preview goes in immediately so the row has its final height
	 * and something readable before the render lands.
	 */
	private deferMarkdown(el: HTMLElement, markdown: string, sourcePath: string, preview: string): void {
		el.setText(preview);
		this.deferred.set(el, () => {
			el.empty();
			MarkdownRenderer.render(this.app, markdown, el, sourcePath, this).catch((error: unknown) => {
				// Leave the preview in place rather than an empty cell.
				el.setText(preview);
				console.error("Osmosis: card browser could not render markdown", sourcePath, error);
			});
		});
		this.observer?.observe(el);
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
 * The table's columns, in order, after the index.
 *
 * These are card fields, so they are fixed rather than read from
 * `config.getOrder()` — that order lists *note* properties, which this view
 * does not show as columns.
 */
const TABLE_COLUMNS: readonly { key: string; label: string; value: (row: CardRow) => string }[] = [
	{ key: "front", label: "Front", value: (row) => row.front },
	{ key: "back", label: "Back", value: (row) => row.back },
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
 * otherwise looks identical to a broken query. A search that matched nothing is
 * named outright, since it is the likeliest culprit and the easiest to undo.
 */
function emptyMessage(noteCount: number, options: BrowseOptions): string {
	if (noteCount === 0) return "No notes match this base's filters.";
	if (options.search !== "") {
		return `No cards match "${options.search}". Clear the search in the view options to see the rest.`;
	}
	return `No cards to show. ${String(noteCount)} note${noteCount === 1 ? "" : "s"} matched this base, but none hold cards matching the current filters.`;
}

// ── Registration ──────────────────────────────────────────────

/**
 * The Bases registration: name and icon for the view picker, a factory, and the
 * options Bases persists into the `.base` file.
 *
 * These options are the whole card-level control surface, because the toolbar's
 * menus cannot reach cards (see the class comment). That makes their
 * organisation load-bearing rather than cosmetic: search first because it is
 * the fastest way to find one card, then layout, then the filters, then sort.
 */
export function createCardBrowserRegistration(plugin: OsmosisPlugin): BasesViewRegistration {
	return {
		name: "Osmosis Browser",
		icon: "layers",
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new CardBrowserView(controller, containerEl, plugin),
		options: (config: BasesViewConfig): BasesAllOptions[] => [
			{
				type: "text",
				key: "search",
				displayName: "Search cards",
				placeholder: "Front, back, deck or ID",
			},
			{
				// "Card layout", not "Layout": Bases labels its own view-type
				// picker "Layout" directly above this one, and two controls
				// under the same word is a coin toss for the user.
				type: "dropdown",
				key: "layout",
				displayName: "Card layout",
				default: "table",
				options: { table: "Table", list: "List", cards: "Cards" },
			},
			{
				type: "slider",
				key: "tileHeight",
				displayName: "Card height",
				default: TILE_HEIGHT.default,
				min: TILE_HEIGHT.min,
				max: TILE_HEIGHT.max,
				step: TILE_HEIGHT.step,
				// Meaningless in the other two layouts, so it does not appear there.
				shouldHide: () => config.get("layout") !== "cards",
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
				// One toggle per type rather than a dropdown, so "Basic and code
				// cloze" is expressible. Unchecking everything shows everything
				// rather than nothing — a blank panel reads as a bug.
				type: "group",
				displayName: "Card types",
				items: FILTERABLE_CARD_TYPES.map((cardType) => ({
					type: "toggle" as const,
					key: cardTypeOptionKey(cardType),
					displayName: typeLabel(cardType),
					default: true,
				})),
			},
			{
				type: "dropdown",
				key: "sortBy",
				displayName: "Sort cards by",
				default: "due",
				options: {
					base: "Base order",
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
