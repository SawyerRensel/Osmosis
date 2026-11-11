/**
 * The find bar (Ctrl+F) shared by the mind map and the 3D graph: a query box
 * with an "i of N" counter, a case toggle, previous/next, and a Replace row
 * that edits only the note the current match is in. The matching is the pure
 * `find-replace.ts`; the view says what its loaded nodes are, how to go to
 * one, how to mark matches and how to write a replace (`FindHost`).
 */
import { Notice, setIcon } from "obsidian";
import { findCounter, findMatches, indexAfterReplace, planReplace, stepMatch, type FindItem, type FindMatch, type ReplacePlan } from "../find-replace";

export interface FindHost {
	/** The view's loaded nodes, in the order Enter steps through them. */
	items(): FindItem[];
	/** Show and select the node a match is in (fly the camera, or scroll the map). */
	go(match: FindMatch): void;
	/** Mark the nodes in `ids` as matches (`current` among them as the current one); an empty set clears the marks. */
	highlight(ids: ReadonlySet<string>, current: string | null): void;
	/** Why Replace can't edit now (reading mode, a study session), or null when it can. */
	replaceBlocked(): string | null;
	/** Write a planned replace as one undoable edit of its note. Resolves true once written. */
	replace(plan: ReplacePlan): Promise<boolean>;
	/** Where keyboard focus goes when the bar closes. */
	focusView(): void;
}

/** A Replace written and waiting for the view to show it: then go on from `from` (a single Replace), or start over (Replace all). */
type AfterReplace = { kind: "one"; from: number; query: string; replacement: string; caseSensitive: boolean } | { kind: "all" };

function noteName(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}

export class FindBar {
	private readonly el: HTMLElement;
	private readonly queryEl: HTMLInputElement;
	private readonly replaceEl: HTMLInputElement;
	private readonly counterEl: HTMLElement;
	private readonly caseEl: HTMLElement;
	private readonly scopeEl: HTMLElement;
	private readonly replaceButtons: HTMLButtonElement[] = [];
	private items: FindItem[] = [];
	private matches: FindMatch[] = [];
	private current = -1;
	private caseSensitive = false;
	private after: AfterReplace | null = null;
	private busy = false;
	private shown = false;
	/** Which input had focus when `detach` took the bar out of the DOM, to give it back on `attach`. */
	private hadFocus: HTMLInputElement | null = null;

	constructor(private readonly parent: HTMLElement, private readonly host: FindHost) {
		this.el = createDiv({ cls: "osmosis-find-bar" });
		this.el.hide();
		const findRow = this.el.createDiv({ cls: "osmosis-find-row" });
		this.queryEl = findRow.createEl("input", { type: "text", cls: "osmosis-find-input", attr: { placeholder: "Find", "aria-label": "Find" } });
		this.counterEl = findRow.createDiv({ cls: "osmosis-find-counter" });
		this.caseEl = this.button(findRow, "case-sensitive", "Match case", () => this.toggleCase());
		this.button(findRow, "arrow-up", "Previous match (Shift+Enter)", () => this.step(true));
		this.button(findRow, "arrow-down", "Next match (Enter)", () => this.step(false));
		this.button(findRow, "x", "Close (Escape)", () => this.close());
		const replaceRow = this.el.createDiv({ cls: "osmosis-find-row" });
		this.replaceEl = replaceRow.createEl("input", { type: "text", cls: "osmosis-find-input", attr: { placeholder: "Replace", "aria-label": "Replace" } });
		this.replaceButtons.push(this.button(replaceRow, "replace", "Replace (Enter in the Replace box)", () => void this.replace(false)));
		this.replaceButtons.push(this.button(replaceRow, "replace-all", "Replace all in this note (Ctrl/Cmd+Enter in the Replace box)", () => void this.replace(true)));
		this.scopeEl = this.el.createDiv({ cls: "osmosis-find-scope" });

		this.queryEl.addEventListener("input", () => this.search());
		this.queryEl.addEventListener("keydown", (e) => this.onKey(e, false));
		this.replaceEl.addEventListener("keydown", (e) => this.onKey(e, true));
		// The view's own pointer, wheel and key handlers must not see the bar's events (a press would pan the map or clear the selection).
		for (const type of ["pointerdown", "pointerup", "mousedown", "click", "dblclick", "contextmenu", "wheel", "touchstart", "touchmove", "touchend", "keydown", "keyup"]) {
			this.el.addEventListener(type, (e) => e.stopPropagation());
		}
		parent.appendChild(this.el);
	}

	get isOpen(): boolean {
		return this.shown;
	}

	/** Whether `target` is in the bar (so a view's own key handling leaves it alone). */
	contains(target: EventTarget | null): boolean {
		return target instanceof Node && this.el.contains(target);
	}

	/** Show the bar with the query selected, and mark the matches. */
	open(): void {
		this.attach();
		this.shown = true;
		this.el.show();
		this.queryEl.focus();
		this.queryEl.select();
		this.refresh();
	}

	/** Hide the bar and take the marks off. The query stays for the next Ctrl+F. */
	close(): void {
		if (!this.isOpen) return;
		this.shown = false;
		this.el.hide();
		this.after = null;
		this.host.highlight(new Set(), null);
		this.host.focusView();
	}

	/** The loaded nodes changed (a reload, a render): find the matches again, and carry on after a Replace. */
	refresh(): void {
		if (!this.isOpen) return;
		this.items = this.host.items();
		this.matches = findMatches(this.items, this.queryEl.value, this.caseSensitive);
		const after = this.after;
		this.after = null;
		if (after?.kind === "all") this.current = -1;
		else if (after?.kind === "one") {
			this.current = indexAfterReplace(after.from, after.query, after.replacement, after.caseSensitive, this.matches.length);
			const match = this.matches[this.current];
			if (match !== undefined) this.host.go(match);
		} else if (this.current >= this.matches.length) this.current = -1;
		this.show();
	}

	/** Before a view empties its container (the mind map's render). */
	detach(): void {
		if (this.el.parentElement === null) return;
		const active = activeDocument.activeElement;
		this.hadFocus = active === this.queryEl ? this.queryEl : active === this.replaceEl ? this.replaceEl : null;
		this.el.remove();
	}

	/** After a view emptied its container: put the bar back, with focus where it was. */
	attach(): void {
		if (this.el.parentElement !== null) return;
		this.parent.appendChild(this.el);
		this.hadFocus?.focus();
		this.hadFocus = null;
	}

	destroy(): void {
		this.el.remove();
	}

	private button(row: HTMLElement, icon: string, label: string, act: () => void): HTMLButtonElement {
		const button = row.createEl("button", { cls: "osmosis-find-btn clickable-icon", attr: { "aria-label": label } });
		setIcon(button, icon);
		button.addEventListener("click", act);
		return button;
	}

	private onKey(e: KeyboardEvent, inReplace: boolean): void {
		if (e.key === "Escape") {
			e.preventDefault();
			this.close();
		} else if (e.key === "Enter" && !e.isComposing) {
			e.preventDefault();
			if (!inReplace) this.step(e.shiftKey);
			else void this.replace(e.ctrlKey || e.metaKey);
		}
	}

	private toggleCase(): void {
		this.caseSensitive = !this.caseSensitive;
		this.caseEl.toggleClass("is-active", this.caseSensitive);
		this.search();
	}

	/** The query or the case changed: match again from the top. The view doesn't move until Enter. */
	private search(): void {
		this.current = -1;
		this.after = null;
		this.refresh();
	}

	private step(backward: boolean): void {
		this.current = stepMatch(this.current, this.matches.length, backward);
		const match = this.matches[this.current];
		if (match !== undefined) this.host.go(match);
		this.show();
	}

	/**
	 * Replace the current match, or every match in its note. With no current
	 * match yet, go to the first one instead: the note a replace edits is the
	 * one the current match is in, so it has to be on screen first.
	 */
	private async replace(all: boolean): Promise<void> {
		if (this.busy) return;
		if (this.current < 0) {
			this.step(false);
			return;
		}
		const blocked = this.host.replaceBlocked();
		if (blocked !== null) {
			this.scopeEl.setText(blocked);
			return;
		}
		const replacement = this.replaceEl.value;
		const plan = planReplace(this.items, this.matches, this.current, replacement, all);
		if (plan === null) {
			this.scopeEl.setText("This match can't be replaced (a note title, tag, embed or card)");
			return;
		}
		this.after = all ? { kind: "all" } : { kind: "one", from: this.current, query: this.queryEl.value, replacement, caseSensitive: this.caseSensitive };
		this.busy = true;
		try {
			if (!await this.host.replace(plan)) this.after = null;
			else if (all) new Notice(`Replaced ${plan.replaced} ${plan.replaced === 1 ? "match" : "matches"} in ${noteName(plan.note)}`);
		} finally {
			this.busy = false;
		}
	}

	/** Paint the counter, the marks and the scope line. */
	private show(): void {
		const query = this.queryEl.value;
		this.counterEl.setText(findCounter(query, this.current, this.matches.length));
		this.el.toggleClass("is-empty", query !== "" && this.matches.length === 0);
		const current = this.matches[this.current];
		this.host.highlight(new Set(this.matches.map((m) => m.id)), current?.id ?? null);
		const blocked = this.host.replaceBlocked();
		for (const button of this.replaceButtons) button.disabled = blocked !== null || current === undefined;
		this.scopeEl.setText(this.scopeText(current, blocked));
	}

	private scopeText(current: FindMatch | undefined, blocked: string | null): string {
		if (this.matches.length === 0) return "";
		if (blocked !== null) return blocked;
		if (current === undefined) return "Replace edits only the note of the current match";
		if (this.items[current.item]?.replaceable !== true) return "This match can't be replaced (a note title, tag, embed or card)";
		const here = this.matches.filter((m) => m.note === current.note).length;
		const elsewhere = this.matches.length - here;
		const scope = `Replace edits ${noteName(current.note)} only (${here} ${here === 1 ? "match" : "matches"})`;
		return elsewhere === 0 ? scope : `${scope}; ${elsewhere} in other notes ${elsewhere === 1 ? "is" : "are"} left alone`;
	}
}
