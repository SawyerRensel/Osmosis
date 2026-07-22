import { Modal, type App } from "obsidian";

/**
 * Minimal yes/no confirmation modal. Resolves the callback only when the user
 * confirms; closing or cancelling does nothing. Used to warn before an action
 * that can't be silently undone (e.g. deleting user-authored block IDs, which
 * can break `[[note#^id]]` links).
 */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly opts: {
			title: string;
			body: string;
			confirmText: string;
			warning?: boolean;
		},
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.opts.title });
		contentEl.createEl("p", { text: this.opts.body });

		const buttons = contentEl.createDiv("modal-button-container");
		const confirmBtn = buttons.createEl("button", {
			cls: this.opts.warning ? "mod-warning" : "mod-cta",
			text: this.opts.confirmText,
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
}
