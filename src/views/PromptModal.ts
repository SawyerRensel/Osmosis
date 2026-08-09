import { Modal, type App } from "obsidian";

/**
 * Minimal single-line text prompt. Calls back only on submit; cancelling or
 * closing does nothing — the same contract as `ConfirmModal`, which this sits
 * beside for the cases where the answer is a value rather than a yes.
 */
export class PromptModal extends Modal {
	constructor(
		app: App,
		private readonly opts: {
			title: string;
			description?: string;
			placeholder?: string;
			initial?: string;
			confirmText: string;
		},
		private readonly onSubmit: (value: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.opts.title });
		if (this.opts.description !== undefined) {
			contentEl.createEl("p", { text: this.opts.description });
		}

		const input = contentEl.createEl("input", {
			type: "text",
			cls: "osmosis-prompt-input",
			value: this.opts.initial ?? "",
		});
		input.placeholder = this.opts.placeholder ?? "";

		const submit = (): void => {
			this.close();
			this.onSubmit(input.value.trim());
		};

		// Enter submits: the field holds the whole answer, so reaching for the
		// button after typing it is pure friction.
		input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			submit();
		});

		const buttons = contentEl.createDiv("modal-button-container");
		const confirmBtn = buttons.createEl("button", { cls: "mod-cta", text: this.opts.confirmText });
		confirmBtn.addEventListener("click", submit);
		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		input.focus();
		input.select();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
