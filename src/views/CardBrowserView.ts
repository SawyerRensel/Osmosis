import {
	BasesView,
	MarkdownRenderer,
	Notice,
	TFile,
	debounce,
	setIcon,
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
	cycleSortColumns,
	readBrowseOptions,
	readColumnWidths,
	readSortColumns,
	COLUMN_MIN_WIDTH,
	SORTABLE_COLUMNS,
	type SortColumn,
	toRow,
	typeLabel,
	type BrowseOptions,
	type CardRow,
	type NoteGroup,
} from "../browse/cards";
import {
	applyDelete,
	changeDeck,
	countCards,
	countNotes,
	previewDelete,
	resetCards,
	setSuspended,
	type DeletePreview,
	type MutationOutcome,
} from "../browse/mutate";
import type { Card } from "../database/types";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";

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

	/**
	 * The selection the toolbar acts on.
	 *
	 * Card IDs rather than `Card` objects: the store hands out fresh objects on
	 * every re-sync, so holding references would mean acting on stale copies.
	 * `selectedNotePaths` is derived by `applySelection` — a note counts as
	 * selected once every card rendered under it is — and it is what enables
	 * Change deck, which is a note-level operation with no per-card equivalent.
	 */
	private readonly selectedCardIds = new Set<string>();
	private readonly selectedNotePaths = new Set<string>();

	/**
	 * Every rendered card ID in visual order, and the elements showing them.
	 *
	 * The order is what makes Shift+click a *range*: "everything between the
	 * anchor and here" is only meaningful against the sequence on screen, which is
	 * neither the store's order nor Bases'.
	 */
	private renderedOrder: string[] = [];
	private readonly rowEls = new Map<string, HTMLElement>();
	private readonly noteHeaderEls = new Map<string, HTMLElement>();
	private readonly renderedByNote = new Map<string, string[]>();

	/** Where a Shift+click range starts: the last row clicked without Shift. */
	private anchorId: string | null = null;

	/**
	 * Touch selection, which has no modifier keys to work with.
	 *
	 * A long press stands in for Ctrl+click and turns `touchSelecting` on; while
	 * it is on, every tap toggles instead of replacing, so a selection can be
	 * built up one card at a time. Dragging out of that press is the Shift+click
	 * range, which is why the drag holds the selection it started from: each move
	 * is "the baseline, plus the run from the anchor to here", not an accumulation
	 * of everything the finger has ever passed over.
	 */
	private touchSelecting = false;
	private longPress: { id: string; x: number; y: number; timer: number } | null = null;
	private touchDrag: { baseline: Set<string>; lastX: number; lastY: number } | null = null;
	private autoScrollFrame: number | null = null;
	private autoScrollSpeed = 0;

	/** Set by a long press, so the tap ending it does not undo what it selected. */
	private suppressClick = false;

	/**
	 * Three nested pieces, because each is rebuilt on a different beat.
	 *
	 * The bar itself survives a list rebuild, which is what lets the search box
	 * keep focus and caret while it filters as you type. `actionsEl` is rebuilt on
	 * every selection change — cheap, and the button set genuinely changes shape.
	 * `scrollEl` is rebuilt only when the cards shown change, because a rebuild
	 * resets the scroll position and discards every markdown render paid for.
	 */
	private toolbarEl: HTMLElement | null = null;
	private actionsEl: HTMLElement | null = null;
	private scrollEl: HTMLElement | null = null;

	/**
	 * User-dragged table column widths, in pixels, keyed by column.
	 *
	 * Empty until the first drag, and a column with no entry keeps its stylesheet
	 * width — so an untouched table lays out exactly as it did before resizing
	 * existed. Mirrored into the `.base` file on pointer-up.
	 */
	private columnWidths: Record<string, number> = {};

	/**
	 * The live search query, and whether its box holds focus.
	 *
	 * Held here rather than read from the config on every keystroke because
	 * `config.set` writes the `.base` file, which makes Bases re-render the view
	 * — destroying the input mid-word. So typing only ever filters, and the query
	 * is written back when the box loses focus or the user presses Enter.
	 * `null` means "not read from the config yet", which is not the same as an
	 * empty query.
	 */
	private searchQuery: string | null = null;
	private searchFocused = false;

	constructor(controller: QueryController, containerEl: HTMLElement, plugin: OsmosisPlugin) {
		super(controller);
		this.containerEl = containerEl;
		this.plugin = plugin;
		plugin.registerCardBrowser(this);

		// Focusable so the view can own Ctrl+A and Escape. Scoped to the container
		// rather than the document on purpose: Ctrl+A means "select all text"
		// everywhere else in Obsidian, and a plugin should not take that away from
		// the rest of the app. `-1` keeps it out of the Tab order — clicking a row
		// focuses it, which is exactly when these keys should start working.
		containerEl.tabIndex = -1;
		this.registerDomEvent(containerEl, "keydown", (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				if (this.selectedCardIds.size === 0) return;
				event.preventDefault();
				this.clearSelection();
				this.applySelection();
				return;
			}
			if (event.key.toLowerCase() !== "a" || !(event.ctrlKey || event.metaKey)) return;
			event.preventDefault();
			this.selectAll();
		});
	}

	onDataUpdated(): void {
		this.render();
	}

	onunload(): void {
		this.teardownObserver();
		this.cancelLongPress();
		this.endTouchDrag();
		this.plugin.unregisterCardBrowser(this);
	}

	/**
	 * Re-render from the card store. Called after a mutation, and after an undo
	 * from outside this view — `onDataUpdated` only fires when *Bases* data
	 * changes, and a mutation changes cards, which Bases cannot see.
	 */
	refresh(): void {
		this.render();
	}

	/** Rebuild everything: the toolbar, then the list under it. */
	private render(): void {
		const container = this.containerEl;
		// Any gesture in flight was aimed at rows that are about to be discarded.
		this.cancelLongPress();
		this.endTouchDrag();
		container.empty();
		container.addClass("osmosis-browse");

		// Before the scroller, so it stays put while the list scrolls under it.
		this.toolbarEl = container.createDiv({ cls: "osmosis-browse-toolbar" });
		this.renderSearch(this.toolbarEl);
		this.actionsEl = this.toolbarEl.createDiv({ cls: "osmosis-browse-toolbar-actions" });

		this.scrollEl = container.createDiv({ cls: "osmosis-browse-scroll" });
		this.bindTouchSelection(this.scrollEl);
		this.renderList();
	}

	/**
	 * Rebuild the card list alone, leaving the toolbar standing.
	 *
	 * This is the path searching and column-resizing take. Anything that changes
	 * which cards exist goes through `render` instead.
	 */
	private renderList(): void {
		const scroller = this.scrollEl;
		if (!scroller) return;

		this.teardownObserver();
		scroller.empty();

		const options = readBrowseOptions((key) => this.config.get(key));
		this.columnWidths = readColumnWidths((key) => this.config.get(key));

		// The box is the authority on the query while the view is open; the config
		// only seeds it and receives it back. Safe to assign — `readBrowseOptions`
		// returns a fresh object per call.
		this.searchQuery ??= options.search;
		options.search = this.searchQuery;

		const now = Date.now();

		// Drop selections whose cards have gone, so the toolbar can never act on a
		// card a mutation or an outside edit already removed.
		this.renderedOrder = [];
		this.rowEls.clear();
		this.noteHeaderEls.clear();
		this.renderedByNote.clear();
		for (const id of [...this.selectedCardIds]) {
			if (!this.plugin.cardStore.getCard(id)) this.selectedCardIds.delete(id);
		}

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

		// Inside the scroller rather than replacing it, so the element the toolbar
		// sits above is the same one whether or not anything matched.
		if (cardCount === 0) renderEmpty(scroller, emptyMessage(noteCount, options));

		// Derives the note-level selection and paints the rows, then the toolbar.
		this.applySelection();
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
		const cols = new Map<string, HTMLElement>();
		const headers = new Map<string, HTMLElement>();

		const headerRow = table.createEl("thead").createEl("tr");
		const sortColumns = readSortColumns((key) => this.config.get(key));

		for (const { key, label } of [{ key: INDEX_COLUMN, label: "#" }, ...TABLE_COLUMNS]) {
			cols.set(key, colgroup.createEl("col", { cls: `osmosis-browse-col-${key}` }));

			const th = headerRow.createEl("th", { cls: `osmosis-browse-cell-${key}` });
			headers.set(key, th);
			this.renderHeaderLabel(th, key, label, sortColumns);
			this.bindColumnResize(th.createDiv({ cls: "osmosis-browse-resize" }), table, cols, headers, key);
		}

		this.applyColumnWidths(table, cols);

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

		this.bindRow(tr, row.card);
	}

	// ── Table sorting ─────────────────────────────────────────────

	/**
	 * A header cell: its label, and the sort mark if it carries one.
	 *
	 * The mark is an arrow, plus an ordinal once more than one column is in play
	 * — with two levels the arrows alone cannot say which is the tie-breaker,
	 * which is the whole point of a second level.
	 */
	private renderHeaderLabel(
		th: HTMLElement,
		key: string,
		label: string,
		sortColumns: readonly SortColumn[],
	): void {
		const sortable = SORTABLE_COLUMNS.includes(key);
		const level = sortColumns.findIndex((column) => column.key === key);
		const sort = sortColumns[level] ?? null;

		th.createSpan({ cls: "osmosis-browse-th-label", text: label });

		if (!sortable) return;
		th.addClass("osmosis-browse-th-sortable");

		if (sort) {
			const mark = th.createSpan({ cls: "osmosis-browse-th-sort" });
			setIcon(mark, sort.dir === "asc" ? "arrow-up" : "arrow-down");
			if (sortColumns.length > 1) {
				mark.createSpan({ cls: "osmosis-browse-th-level", text: String(level + 1) });
			}
		}

		th.setAttribute("aria-label", sortHint(label, sort));
		th.addEventListener("click", () => {
			const next = cycleSortColumns(sortColumns, key);
			this.config.set("sortColumns", next.length === 0 ? null : next);
			this.renderList();
		});
	}

	// ── Table column widths ───────────────────────────────────────

	/**
	 * Make one column header edge draggable.
	 *
	 * The grip is inside the `th` and stops its own events: a `th` sits in the
	 * table's click surface, and a drag that ended up selecting rows would make
	 * resizing unusable. Pointer events rather than mouse events so a touch drag
	 * works the same, and pointer capture so the drag survives the cursor leaving
	 * the 6px grip — which it does immediately.
	 */
	private bindColumnResize(
		grip: HTMLElement,
		table: HTMLElement,
		cols: Map<string, HTMLElement>,
		headers: Map<string, HTMLElement>,
		key: string,
	): void {
		grip.setAttribute("aria-label", "Drag to resize. Double-click to reset every column");

		// The grip sits inside a header cell that sorts on click, so the end of a
		// drag must not also be a sort.
		grip.addEventListener("click", (event: MouseEvent) => {
			event.stopPropagation();
		});

		grip.addEventListener("dblclick", (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			// All of them, not just this one: with widths frozen, clearing a single
			// column would leave it unspecified inside a table whose total width is
			// still the sum of the others.
			this.columnWidths = {};
			this.config.set("columnWidths", null);
			this.renderList();
		});

		grip.addEventListener("pointerdown", (event: PointerEvent) => {
			// Only the primary button, and never the browser's own text-drag.
			if (event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();

			this.freezeColumnWidths(headers);
			const startX = event.clientX;
			const startWidth = this.columnWidths[key] ?? headers.get(key)?.offsetWidth ?? COLUMN_MIN_WIDTH;

			grip.setPointerCapture(event.pointerId);
			grip.addClass("is-dragging");
			table.addClass("is-resizing");

			const onMove = (move: PointerEvent): void => {
				this.columnWidths[key] = Math.max(
					COLUMN_MIN_WIDTH,
					Math.round(startWidth + move.clientX - startX),
				);
				this.applyColumnWidths(table, cols);
			};
			const onEnd = (): void => {
				grip.removeEventListener("pointermove", onMove);
				grip.removeEventListener("pointerup", onEnd);
				grip.removeEventListener("pointercancel", onEnd);
				grip.removeClass("is-dragging");
				table.removeClass("is-resizing");
				// Persisted once, at the end. Writing the `.base` file on every
				// pointermove would be a file write per frame.
				this.config.set("columnWidths", this.columnWidths);
			};

			grip.addEventListener("pointermove", onMove);
			grip.addEventListener("pointerup", onEnd);
			grip.addEventListener("pointercancel", onEnd);
		});
	}

	/**
	 * Pin every column to the width it currently happens to have.
	 *
	 * Until the first drag, most columns take their width from the stylesheet and
	 * Front and Back split whatever is left. Dragging one of them has to mean
	 * "this column becomes this wide", not "the others reflow around it", so the
	 * first drag turns the whole rendered layout into explicit pixels and the
	 * table's width becomes their sum.
	 */
	private freezeColumnWidths(headers: Map<string, HTMLElement>): void {
		if (Object.keys(this.columnWidths).length > 0) return;
		for (const [key, th] of headers) {
			this.columnWidths[key] = Math.max(COLUMN_MIN_WIDTH, Math.round(th.offsetWidth));
		}
	}

	private applyColumnWidths(table: HTMLElement, cols: Map<string, HTMLElement>): void {
		const keys = Object.keys(this.columnWidths);
		if (keys.length === 0) return;

		let total = 0;
		for (const [key, col] of cols) {
			const width = this.columnWidths[key];
			if (width === undefined) continue;
			col.style.width = `${String(width)}px`;
			total += width;
		}

		// The stylesheet's `width: 100%` and `min-width` would otherwise scale the
		// columns back off the widths just set — under `table-layout: fixed` the
		// table's own width is what the columns are fitted into. `is-sized` drops
		// that min-width; the total itself has to be inline, being a live value.
		table.addClass("is-sized");
		table.style.width = `${String(total)}px`;
	}

	// ── Cards: tiles grouped under their note ─────────────────────

	private renderGroup(
		parent: HTMLElement,
		group: NoteGroup,
		now: number,
		options: BrowseOptions,
	): void {
		const section = parent.createDiv({ cls: "osmosis-browse-group" });

		// Recorded before the header is built: the group checkbox's tri-state is a
		// function of which of these are selected.
		this.renderedByNote.set(group.notePath, group.cards.map((card) => card.id));

		const header = section.createDiv({ cls: "osmosis-browse-group-header" });
		this.bindNoteHeader(header, group.notePath);
		header.createSpan({
			cls: "osmosis-browse-group-title",
			text: noteName(group.notePath),
		});
		header.createSpan({
			cls: "osmosis-browse-group-decks",
			text: group.decks.join(", "),
		});
		header.createSpan({
			cls: "osmosis-browse-group-count",
			text: `${String(group.cards.length)} card${group.cards.length === 1 ? "" : "s"}`,
		});

		const body = section.createDiv({ cls: "osmosis-browse-tiles" });
		body.style.setProperty("--osmosis-tile-height", `${String(options.tileHeight)}px`);

		for (const card of group.cards) {
			try {
				this.renderTile(body, toRow(card, now));
			} catch (error) {
				console.error("Osmosis: card browser could not render card", card.id, error);
			}
		}
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

		this.bindRow(tile, row.card);
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

	// ── Selection ─────────────────────────────────────────────────

	/**
	 * Make a rendered row selectable, and record where it sits.
	 *
	 * Single click selects, double click opens — the file-manager convention,
	 * chosen over the checkbox column this view shipped with because a checkbox
	 * makes the common case (act on a few cards) cost a precise click on a 14px
	 * target in every row. The first click of a double click still selects, which
	 * is harmless: the row you are opening is the row you would have picked.
	 */
	private bindRow(el: HTMLElement, card: Card): void {
		this.renderedOrder.push(card.id);
		this.rowEls.set(card.id, el);
		// What a touch drag reads to find the row under the finger, since the
		// element it lands on is whatever markdown happens to be rendered there.
		el.dataset.osmosisCard = card.id;

		el.addEventListener("click", (event: MouseEvent) => {
			this.handleRowClick(card.id, event);
		});
		el.addEventListener("pointerdown", (event: PointerEvent) => {
			if (event.pointerType !== "touch") return;
			this.startLongPress(card.id, event);
		});
		el.addEventListener("dblclick", (event: MouseEvent) => {
			// Otherwise the second click leaves a word selected under the row.
			event.preventDefault();
			void this.openCard(card);
		});
	}

	/** The same contract on a note header, over every card rendered under it. */
	private bindNoteHeader(el: HTMLElement, notePath: string): void {
		this.noteHeaderEls.set(notePath, el);

		el.addEventListener("click", (event: MouseEvent) => {
			this.handleNoteClick(notePath, event);
		});
		el.addEventListener("dblclick", (event: MouseEvent) => {
			event.preventDefault();
			void this.openNote(notePath);
		});
	}

	/**
	 * Click, Ctrl+click, Shift+click, Ctrl+Shift+click.
	 *
	 * Plain click replaces the selection; Ctrl toggles one row; Shift takes the
	 * run from the anchor to here; Ctrl+Shift adds that run to what is already
	 * selected. Shift deliberately leaves the anchor where it is, so a range can
	 * be stretched and re-stretched from the same start rather than walking away
	 * from it one click at a time.
	 */
	private handleRowClick(id: string, event: MouseEvent): void {
		// The tap that ends a long press already did its selecting.
		if (this.suppressClick) {
			this.suppressClick = false;
			return;
		}

		this.takeFocus();
		// In touch selection mode a plain tap is a Ctrl+click, which is the only
		// way to extend a selection on a device with no modifier keys.
		const additive = event.ctrlKey || event.metaKey || this.touchSelecting;

		if (event.shiftKey) {
			if (!additive) this.selectedCardIds.clear();
			for (const rangeId of this.rangeTo(id)) this.selectedCardIds.add(rangeId);
		} else if (additive) {
			if (this.selectedCardIds.has(id)) this.selectedCardIds.delete(id);
			else this.selectedCardIds.add(id);
			this.anchorId = id;
		} else {
			this.selectedCardIds.clear();
			this.selectedCardIds.add(id);
			this.anchorId = id;
		}

		this.applySelection();
	}

	/**
	 * A note header selects its whole note. Ctrl+click on a fully selected note
	 * clears it again, which is the only way to drop a note from a selection
	 * without clicking its cards one by one.
	 */
	private handleNoteClick(notePath: string, event: MouseEvent): void {
		this.takeFocus();
		const ids = this.renderedByNote.get(notePath) ?? [];
		if (ids.length === 0) return;

		const additive = event.ctrlKey || event.metaKey || event.shiftKey;
		const allSelected = ids.every((id) => this.selectedCardIds.has(id));

		if (!additive) this.selectedCardIds.clear();
		if (additive && allSelected) {
			for (const id of ids) this.selectedCardIds.delete(id);
		} else {
			for (const id of ids) this.selectedCardIds.add(id);
			this.anchorId = ids[0] ?? null;
		}

		this.applySelection();
	}

	// ── Touch selection ───────────────────────────────────────────

	/**
	 * Wire the scroller for long-press selection.
	 *
	 * All of it lives on the scroller rather than the rows because a drag leaves
	 * the row it started on immediately — the pointer has to be followed at the
	 * level that still exists under it.
	 */
	private bindTouchSelection(scroller: HTMLElement): void {
		scroller.addEventListener("pointermove", (event: PointerEvent) => {
			if (event.pointerType !== "touch") return;
			if (this.touchDrag !== null) {
				this.trackTouchDrag(scroller, event.clientX, event.clientY);
				return;
			}
			// Moving before the press lands means the user is scrolling, and a
			// scroll must never turn into a selection.
			const press = this.longPress;
			if (!press) return;
			if (Math.abs(event.clientX - press.x) > TOUCH_SLOP || Math.abs(event.clientY - press.y) > TOUCH_SLOP) {
				this.cancelLongPress();
			}
		});

		const end = (): void => {
			this.cancelLongPress();
			this.endTouchDrag();
		};
		scroller.addEventListener("pointerup", end);
		scroller.addEventListener("pointercancel", end);

		// Non-passive on purpose: once the press has landed, this is the only way
		// to stop the list scrolling under a drag that is selecting rows. The
		// browser has already committed to a scroll by the time a passive listener
		// runs, which is why `touch-action` on the rows cannot do this job.
		scroller.addEventListener(
			"touchmove",
			(event: TouchEvent) => {
				if (this.touchDrag !== null) event.preventDefault();
			},
			{ passive: false },
		);

		// A long press is the platform's own gesture for "show me a menu".
		scroller.addEventListener("contextmenu", (event: MouseEvent) => {
			if (this.touchDrag !== null || this.longPress !== null) event.preventDefault();
		});
	}

	private startLongPress(id: string, event: PointerEvent): void {
		this.cancelLongPress();
		this.suppressClick = false;
		this.longPress = {
			id,
			x: event.clientX,
			y: event.clientY,
			timer: window.setTimeout(() => {
				this.longPress = null;
				this.beginTouchSelection(id);
			}, LONG_PRESS_MS),
		};
	}

	private cancelLongPress(): void {
		if (this.longPress === null) return;
		window.clearTimeout(this.longPress.timer);
		this.longPress = null;
	}

	/** The press landed: toggle this card, and stand ready to drag a range. */
	private beginTouchSelection(id: string): void {
		this.touchSelecting = true;
		this.suppressClick = true;

		if (this.selectedCardIds.has(id)) this.selectedCardIds.delete(id);
		else this.selectedCardIds.add(id);
		this.anchorId = id;

		this.touchDrag = { baseline: new Set(this.selectedCardIds), lastX: 0, lastY: 0 };
		this.applySelection();
	}

	/** Follow the finger: the baseline, plus the run from the anchor to here. */
	private trackTouchDrag(scroller: HTMLElement, x: number, y: number): void {
		const drag = this.touchDrag;
		if (!drag) return;
		drag.lastX = x;
		drag.lastY = y;

		const id = this.rowIdAt(x, y);
		if (id !== null) {
			this.selectedCardIds.clear();
			for (const baseId of drag.baseline) this.selectedCardIds.add(baseId);
			for (const rangeId of this.rangeTo(id)) this.selectedCardIds.add(rangeId);
			this.applySelection();
		}

		this.updateAutoScroll(scroller, y);
	}

	/** The card row under a point, whatever markdown is rendered on top of it. */
	private rowIdAt(x: number, y: number): string | null {
		// The view's own document, not the app's: a base opened in a popout window
		// has its rows in that window, and the global would not find them.
		const target = this.containerEl.ownerDocument.elementFromPoint(x, y);
		const row = target?.closest("[data-osmosis-card]");
		return row instanceof HTMLElement ? row.dataset.osmosisCard ?? null : null;
	}

	/**
	 * Scroll while dragging against the top or bottom edge, faster the closer the
	 * finger gets — without it, a range can only ever be as long as the screen.
	 */
	private updateAutoScroll(scroller: HTMLElement, y: number): void {
		const rect = scroller.getBoundingClientRect();
		const above = rect.top + AUTO_SCROLL_EDGE - y;
		const below = y - (rect.bottom - AUTO_SCROLL_EDGE);

		const depth = above > 0 ? -Math.min(above, AUTO_SCROLL_EDGE) : below > 0 ? Math.min(below, AUTO_SCROLL_EDGE) : 0;
		this.autoScrollSpeed = (depth / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX;

		if (this.autoScrollSpeed === 0) {
			this.stopAutoScroll();
			return;
		}
		if (this.autoScrollFrame !== null) return;

		const step = (): void => {
			const drag = this.touchDrag;
			if (!drag || this.autoScrollSpeed === 0) {
				this.autoScrollFrame = null;
				return;
			}
			scroller.scrollTop += this.autoScrollSpeed;
			// The finger has not moved, but the rows under it have.
			this.trackTouchDrag(scroller, drag.lastX, drag.lastY);
			this.autoScrollFrame = window.requestAnimationFrame(step);
		};
		this.autoScrollFrame = window.requestAnimationFrame(step);
	}

	private stopAutoScroll(): void {
		if (this.autoScrollFrame !== null) window.cancelAnimationFrame(this.autoScrollFrame);
		this.autoScrollFrame = null;
		this.autoScrollSpeed = 0;
	}

	/**
	 * End the drag but stay in touch selection mode, so the taps that follow keep
	 * adding to the selection rather than replacing it.
	 */
	private endTouchDrag(): void {
		if (this.touchDrag === null) return;
		this.touchDrag = null;
		this.stopAutoScroll();
	}

	/** The rendered run between the anchor and `id`, inclusive. */
	private rangeTo(id: string): string[] {
		const to = this.renderedOrder.indexOf(id);
		if (to === -1) return [];

		const from = this.anchorId === null ? -1 : this.renderedOrder.indexOf(this.anchorId);
		// No anchor — the first click of the session was a Shift+click — so there
		// is no run to take and the row itself is the whole of it.
		if (from === -1) return [id];

		return this.renderedOrder.slice(Math.min(from, to), Math.max(from, to) + 1);
	}

	private selectAll(): void {
		for (const id of this.renderedOrder) this.selectedCardIds.add(id);
		this.applySelection();
	}

	/**
	 * Paint the selection onto the rows, derive the note-level selection from it,
	 * and rebuild the toolbar.
	 *
	 * Selection changes go through here rather than through a re-render: a render
	 * resets the scroll position and throws away every markdown render already
	 * paid for, which is far too much to spend on a click.
	 */
	private applySelection(): void {
		for (const [id, el] of this.rowEls) {
			el.toggleClass("is-selected", this.selectedCardIds.has(id));
		}

		// Clearing the selection leaves touch selection mode with it, so a tap goes
		// back to meaning "open this one" rather than silently starting a new
		// multi-selection the user never asked for.
		if (this.selectedCardIds.size === 0) this.touchSelecting = false;

		// A note is selected exactly when all of its rendered cards are. The table
		// layout has no note rows, so it never fills this and Change deck falls
		// back to the single-note rule in `deckTargets`.
		this.selectedNotePaths.clear();
		for (const [notePath, ids] of this.renderedByNote) {
			const selected = ids.filter((id) => this.selectedCardIds.has(id)).length;
			const all = ids.length > 0 && selected === ids.length;
			if (all) this.selectedNotePaths.add(notePath);

			const header = this.noteHeaderEls.get(notePath);
			if (header) {
				header.toggleClass("is-selected", all);
				header.toggleClass("is-partial", selected > 0 && !all);
			}
		}

		this.refreshToolbar();
	}

	/**
	 * Put focus on the container so Ctrl+A and Escape reach this view.
	 *
	 * Clicking a row focuses the nearest focusable ancestor on its own, but only
	 * when nothing inside the row swallows it — rendered card markdown contains
	 * links, which do. `preventScroll` because focusing a container the user is
	 * already looking at should not move it under them.
	 */
	private takeFocus(): void {
		this.containerEl.focus({ preventScroll: true });
	}

	private selectedCards(): Card[] {
		const cards: Card[] = [];
		for (const id of this.selectedCardIds) {
			const card = this.plugin.cardStore.getCard(id);
			if (card) cards.push(card);
		}
		return cards;
	}

	private clearSelection(): void {
		this.selectedCardIds.clear();
		this.selectedNotePaths.clear();
	}

	/**
	 * The notes Change deck can act on.
	 *
	 * Whole notes when note rows are checked. In the table, which has no note rows,
	 * a selection that happens to sit inside one note is the same request and is
	 * honoured — but a selection spanning several notes is not, because "change the
	 * deck" would then mean moving notes the user never named.
	 */
	private deckTargets(): string[] {
		if (this.selectedNotePaths.size > 0) return [...this.selectedNotePaths];
		const paths = new Set(this.selectedCards().map((card) => card.notePath));
		return paths.size === 1 ? [...paths] : [];
	}

	// ── Toolbar ───────────────────────────────────────────────────

	/**
	 * The card search box, which lives in the toolbar rather than in the Bases
	 * config panel.
	 *
	 * It is the control reached most often and it was three clicks deep, behind a
	 * panel that covers the cards it filters. The value still persists into the
	 * `.base` file through the same `search` config key — it is only the way in
	 * that moved, so a base saved with a query still opens with it.
	 */
	private renderSearch(bar: HTMLElement): void {
		this.searchQuery ??= readBrowseOptions((key) => this.config.get(key)).search;

		const wrapper = bar.createDiv({ cls: "osmosis-browse-search" });
		setIcon(wrapper.createSpan({ cls: "osmosis-browse-search-icon" }), "search");

		const input = wrapper.createEl("input", {
			type: "text",
			cls: "osmosis-browse-search-input",
			placeholder: "Search cards",
		});
		input.value = this.searchQuery;
		input.setAttribute("aria-label", "Filter these cards by front, back, deck or ID");

		const clear = wrapper.createEl("button", { cls: "clickable-icon osmosis-browse-search-clear" });
		setIcon(clear, "x");
		clear.setAttribute("aria-label", "Clear search");

		/** Filter, without touching the config: a write there re-renders the view. */
		const filter = (): void => {
			this.searchQuery = input.value.trim();
			wrapper.toggleClass("has-query", input.value !== "");
			this.renderList();
		};

		/** Write the query back, so a saved base reopens with it. */
		const persist = (): void => {
			const stored = readBrowseOptions((key) => this.config.get(key)).search;
			if (stored === this.searchQuery) return;
			this.config.set("search", this.searchQuery === "" ? null : this.searchQuery);
		};

		// Trailing debounce: filtering runs the whole store through the predicates
		// and rebuilds the list, which is far too much to do per keystroke.
		const debouncedFilter = debounce(filter, 200, true);
		input.addEventListener("input", () => {
			wrapper.toggleClass("has-query", input.value !== "");
			debouncedFilter();
		});

		// Keystrokes in a text field belong to the field. Ctrl+A has to select the
		// query rather than every card, and Escape has to clear the query rather
		// than the selection of a user who was only editing text.
		input.addEventListener("keydown", (event: KeyboardEvent) => {
			event.stopPropagation();
			if (event.key === "Enter") {
				filter();
				persist();
				return;
			}
			if (event.key !== "Escape" || input.value === "") return;
			event.preventDefault();
			input.value = "";
			filter();
		});

		input.addEventListener("focus", () => {
			this.searchFocused = true;
		});
		input.addEventListener("blur", () => {
			this.searchFocused = false;
			// The one place the config is written, because the box is gone from
			// under the user's hands by the time the re-render lands.
			persist();
		});

		clear.addEventListener("click", () => {
			input.value = "";
			filter();
			input.focus();
		});

		wrapper.toggleClass("has-query", input.value !== "");

		// Insurance for a re-render triggered from elsewhere while the user is
		// mid-word — Bases owns when this view is rebuilt, and we do not.
		if (this.searchFocused) {
			input.focus();
			input.setSelectionRange(input.value.length, input.value.length);
		}
	}

	/**
	 * Rebuild the action buttons in place.
	 *
	 * Every action is always present and dimmed when it does not apply, rather
	 * than appearing and disappearing with the selection: a toolbar that changes
	 * shape moves the button you were reaching for, and a dimmed button still
	 * teaches what the browser can do. Icons rather than labels, because the whole
	 * set has to fit one line on a phone.
	 */
	private refreshToolbar(): void {
		const actions = this.actionsEl;
		if (!actions) return;
		actions.empty();

		const selected = this.selectedCards();
		const history = this.plugin.mutationHistory;
		const hasSelection = selected.length > 0;

		if (hasSelection) {
			actions.createSpan({
				cls: "osmosis-browse-toolbar-count",
				text: String(selected.length),
				attr: { "aria-label": `${String(selected.length)} card${selected.length === 1 ? "" : "s"} selected` },
			});
		}

		this.renderAction(actions, {
			icon: "list-checks",
			tooltip: this.renderedOrder.length > 0
				? `Select all ${String(this.renderedOrder.length)} cards shown (Ctrl+A)`
				: "Select all (Ctrl+A)",
			disabled: this.renderedOrder.length === 0 || selected.length >= this.renderedOrder.length,
			onClick: () => {
				this.selectAll();
			},
		});

		this.renderAction(actions, {
			icon: "square-dashed",
			tooltip: "Deselect (Esc)",
			disabled: !hasSelection,
			onClick: () => {
				this.clearSelection();
				this.applySelection();
			},
		});

		// One toggle rather than two buttons. Suspend and unsuspend are the two
		// directions of one thing, and a mixed selection has to pick a direction
		// anyway — it suspends, because that is the safe half.
		const allSuspended = hasSelection && selected.every((card) => card.disabled === true);
		this.renderAction(actions, {
			icon: allSuspended ? "eye" : "eye-off",
			tooltip: allSuspended
				? "Unsuspend: return these cards to study with their scheduling intact"
				: "Suspend: take these cards out of study, keeping their scheduling",
			disabled: !hasSelection,
			onClick: () => {
				void this.runMutation(() => setSuspended(this.plugin.cardMutations, selected, !allSuspended));
			},
		});

		this.renderAction(actions, {
			icon: "rotate-ccw",
			tooltip: "Reset: clear FSRS scheduling and return these cards to new. Review history is kept",
			disabled: !hasSelection,
			onClick: () => {
				void this.runMutation(() => resetCards(this.plugin.cardMutations, selected));
			},
		});

		const deckTargets = this.deckTargets();
		this.renderAction(actions, {
			icon: "folder-input",
			tooltip: hasSelection && deckTargets.length === 0
				? "Change deck: a card has no deck of its own — it takes the note's. Select a note, or cards from a single note"
				: "Change deck: set osmosis-deck on the selected notes",
			disabled: deckTargets.length === 0,
			onClick: () => {
				this.promptDeck(deckTargets);
			},
		});

		// Delete sits alone past the gap. It is the only one of these that edits
		// the user's notes, and it must not be a neighbour of the two that don't.
		actions.createDiv({ cls: "osmosis-browse-toolbar-gap" });
		this.renderAction(actions, {
			icon: "trash-2",
			tooltip: "Delete: remove these cards from your notes",
			warning: true,
			disabled: !hasSelection,
			onClick: () => {
				void this.confirmDelete(selected);
			},
		});

		const group = actions.createDiv({ cls: "osmosis-browse-toolbar-history" });
		this.renderAction(group, {
			icon: "undo-2",
			tooltip: history.undoLabel === null ? "Nothing to undo" : `Undo "${history.undoLabel}"`,
			disabled: history.undoLabel === null,
			onClick: () => {
				void this.plugin.undoCardMutation();
			},
		});
		this.renderAction(group, {
			icon: "redo-2",
			tooltip: history.redoLabel === null ? "Nothing to redo" : `Redo "${history.redoLabel}"`,
			disabled: history.redoLabel === null,
			onClick: () => {
				void this.plugin.redoCardMutation();
			},
		});
	}

	/**
	 * One icon button. The tooltip is the only label it has, so it names the
	 * action rather than describing it — `aria-label` is both Obsidian's tooltip
	 * source and what a screen reader reads.
	 */
	private renderAction(
		parent: HTMLElement,
		opts: { icon: string; tooltip: string; warning?: boolean; disabled?: boolean; onClick: () => void },
	): void {
		const button = parent.createEl("button", { cls: "clickable-icon osmosis-browse-action" });
		setIcon(button, opts.icon);
		button.setAttribute("aria-label", opts.tooltip);
		if (opts.warning === true) button.addClass("osmosis-browse-action-warning");
		if (opts.disabled === true) {
			button.disabled = true;
			return;
		}
		button.addEventListener("click", opts.onClick);
	}

	// ── Mutations ─────────────────────────────────────────────────

	/**
	 * Run one mutation, then record it, report it, and re-render.
	 *
	 * The re-render is not optional: `onDataUpdated` fires only when *Bases* data
	 * changes, and a mutation changes cards, which Bases cannot see. The dashboard
	 * refresh is the other half — its deck counts come from the same store.
	 */
	private async runMutation(action: () => Promise<MutationOutcome | null>): Promise<void> {
		try {
			const outcome = await action();
			if (!outcome) {
				new Notice("Osmosis: nothing to change in that selection.");
				return;
			}
			// A mutation can report something worth saying while having changed
			// nothing — every card in the selection setting its own deck, for
			// instance. Offering to undo that would be offering a button that does
			// nothing.
			if (outcome.record.files.length > 0 || outcome.record.cards.length > 0) {
				this.plugin.mutationHistory.push(outcome.record);
			}
			new Notice(`Osmosis: ${outcome.message}`);
			this.clearSelection();
			this.render();
			this.plugin.refreshDashboard();
			// Suspending a line card changes its reading-view chrome, the same way
			// the editor's "Exclude from study" does.
			this.plugin.lineReveal.refreshChrome();
		} catch (error) {
			console.error("Osmosis: card browser mutation failed", error);
			new Notice("Osmosis: that change could not be completed. See the console for details.");
		}
	}

	/** Delete is the one mutation that edits content, so it is described first. */
	private async confirmDelete(selected: readonly Card[]): Promise<void> {
		let preview: DeletePreview;
		try {
			preview = await previewDelete(this.plugin.cardMutations, selected);
		} catch (error) {
			console.error("Osmosis: could not work out what deleting would do", error);
			new Notice("Osmosis: could not read those notes. See the console for details.");
			return;
		}

		if (preview.cardCount === 0) {
			new Notice("Osmosis: nothing to delete in that selection.");
			return;
		}

		new ConfirmModal(
			this.app,
			{
				title: `Delete ${countCards(preview.cardCount)}?`,
				body: describeDelete(preview),
				confirmText: "Delete",
				warning: true,
			},
			() => {
				void this.runMutation(() => applyDelete(this.plugin.cardMutations, preview));
			},
		).open();
	}

	private promptDeck(notePaths: readonly string[]): void {
		if (notePaths.length === 0) return;
		const first = notePaths[0]!;
		const current = notePaths.length === 1
			? this.plugin.cardStore.getCardsByNote(first)[0]?.deck ?? ""
			: "";

		new PromptModal(
			this.app,
			{
				title: notePaths.length === 1
					? `Change deck for ${noteName(first)}`
					: `Change deck for ${countNotes(notePaths.length)}`,
				description: "Written to the note's osmosis-deck frontmatter, so every card in it follows. A fence that sets its own deck: is left where it is. Leave empty to fall back to the note's folder.",
				placeholder: "e.g. geography/rivers",
				initial: current,
				confirmText: "Move",
			},
			(deck) => {
				void this.runMutation(() => changeDeck(this.plugin.cardMutations, notePaths, deck));
			},
		).open();
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
/** The row-number column's key, which has no entry in `TABLE_COLUMNS`. */
const INDEX_COLUMN = "index";

/**
 * Touch selection timings.
 *
 * The press is long enough not to fire on a tap and short enough not to feel
 * broken; the slop is what separates a still finger from the start of a scroll,
 * and has to allow for the drift of a finger that means to hold still.
 */
const LONG_PRESS_MS = 450;
const TOUCH_SLOP = 10;

/** How near an edge a drag starts scrolling, and how fast it goes there. */
const AUTO_SCROLL_EDGE = 64;
const AUTO_SCROLL_MAX = 14;

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

/**
 * What clicking this header will do next, which is not guessable from an arrow.
 *
 * It also has to say that a column sort overrides the view's own Sort option,
 * since that dropdown stays where it is for the layouts with no headers to click.
 */
function sortHint(label: string, sort: SortColumn | null): string {
	if (sort === null) return `Sort by ${label}. Click another column to sort by that next, overriding "Sort cards by"`;
	return sort.dir === "asc"
		? `Sorted by ${label}, ascending. Click to reverse`
		: `Sorted by ${label}, descending. Click to stop sorting by it`;
}

/** A note path as its basename, which is what a row has room to show. */
function noteName(notePath: string): string {
	const base = notePath.split("/").pop() ?? notePath;
	return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/**
 * The delete confirmation's body: what goes, from where, and what survives.
 *
 * It names every affected file, and it names the two consequences a user cannot
 * infer from the row they clicked — that a fence takes its sibling cards with it,
 * and that a block ID they wrote themselves may be linked to from elsewhere.
 */
function describeDelete(preview: DeletePreview): string {
	const names = preview.notePaths.map(noteName).join(", ");
	const parts = [
		`${countCards(preview.cardCount)} will be removed from ${names}.`,
		"A line card loses its block ID and keeps its text; a fence card is removed entirely, because the fence is the card.",
	];

	if (preview.siblingCount > 0) {
		parts.push(`${countCards(preview.siblingCount)} you did not select share a fence with your selection and will go with it.`);
	}
	if (preview.userIdCount > 0) {
		parts.push(`${String(preview.userIdCount)} of the block IDs ${preview.userIdCount === 1 ? "was" : "were"} not created by Osmosis; removing ${preview.userIdCount === 1 ? "it" : "them"} may break existing "[[note#^id]]" links.`);
	}

	parts.push("This edits your notes. It can be undone from the browser toolbar for the rest of this session.");
	return parts.join(" ");
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
			// No "search" entry: the query lives in the view's own toolbar, where it
			// does not sit behind a panel covering the cards it filters. It is still
			// persisted under the `search` config key, so a saved base keeps it.
			{
				// "Card layout", not "Layout": Bases labels its own view-type
				// picker "Layout" directly above this one, and two controls
				// under the same word is a coin toss for the user.
				type: "dropdown",
				key: "layout",
				displayName: "Card layout",
				default: "table",
				options: { table: "Table", cards: "Cards" },
			},
			{
				type: "slider",
				key: "tileHeight",
				displayName: "Card height",
				default: TILE_HEIGHT.default,
				min: TILE_HEIGHT.min,
				max: TILE_HEIGHT.max,
				step: TILE_HEIGHT.step,
				// Meaningless in the table layout, so it does not appear there.
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
