import { Modal, type App } from "obsidian";
import type { GenerateIdsPlan } from "../card-gen/generate-ids";
import type { NodeType } from "../types";

/** Human-readable labels for the elements being tagged. */
const TYPE_LABELS: Partial<Record<NodeType, string>> = {
	heading: "Heading",
	bullet: "Bullet",
	ordered: "Numbered item",
	paragraph: "Paragraph",
	codeblock: "Code block",
	table: "Table",
	blockquote: "Callout / quote",
};

/**
 * Confirmation modal for "Generate flashcards from note".
 * Shows what will be tagged with Osmosis IDs before modifying the note.
 */
export class GenerateFlashcardsModal extends Modal {
	constructor(
		app: App,
		private readonly noteName: string,
		private readonly plan: GenerateIdsPlan,
		private readonly needsOptIn: boolean,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("osmosis-generate-modal");
		contentEl.createEl("h2", { text: "Generate flashcards from note" });

		const count = this.plan.insertions.length;
		contentEl.createEl("p", {
			text: `${String(count)} element${count === 1 ? "" : "s"} in "${this.noteName}" will be tagged with Osmosis IDs (${this.summarize()}).`,
		});

		if (this.needsOptIn) {
			contentEl.createEl("p", {
				cls: "osmosis-generate-optin-note",
				text: "This note is not opted in yet — \"osmosis-cards: true\" will be added to its frontmatter.",
			});
		}

		const list = contentEl.createDiv("osmosis-generate-list");
		for (const insertion of this.plan.insertions) {
			const row = list.createDiv("osmosis-generate-row");
			row.createSpan({
				cls: "osmosis-generate-type",
				text: insertion.kind === "fence-id"
					? "Card fence"
					: TYPE_LABELS[insertion.nodeType] ?? insertion.nodeType,
			});
			row.createSpan({ cls: "osmosis-generate-preview", text: insertion.preview });
		}

		const buttons = contentEl.createDiv("modal-button-container");
		const confirmBtn = buttons.createEl("button", {
			cls: "mod-cta",
			text: `Tag ${String(count)} element${count === 1 ? "" : "s"}`,
		});
		confirmBtn.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** e.g. "3 headings, 5 bullets, 1 code block". */
	private summarize(): string {
		const counts = new Map<string, number>();
		for (const insertion of this.plan.insertions) {
			const label = insertion.kind === "fence-id"
				? "card fence"
				: (TYPE_LABELS[insertion.nodeType] ?? insertion.nodeType).toLowerCase();
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}
		return [...counts.entries()]
			.map(([label, n]) => `${String(n)} ${label}${n === 1 ? "" : "s"}`)
			.join(", ");
	}
}
