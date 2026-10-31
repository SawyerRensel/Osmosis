import { FuzzySuggestModal, type App, type TFile } from "obsidian";

/**
 * Picks one of the trail notes (those marked `osmosis-trail: true`, see
 * `src/graph3d/trail-note.ts`) for the 3D graph's trail path. Resolves with the
 * chosen note, or null when the modal is dismissed.
 */
export class Graph3DTrailPicker extends FuzzySuggestModal<TFile> {
	private chosen: TFile | null = null;
	private settle: ((file: TFile | null) => void) | null = null;

	constructor(app: App, private readonly trails: readonly TFile[]) {
		super(app);
		this.setPlaceholder("Choose a trail note");
	}

	/** Open the picker; settles once the user chooses or dismisses it. */
	pick(): Promise<TFile | null> {
		return new Promise((resolve) => {
			this.settle = resolve;
			this.open();
		});
	}

	getItems(): TFile[] {
		return [...this.trails];
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.chosen = file;
	}

	onClose(): void {
		super.onClose();
		// The modal closes before it reports the choice, so settle after both.
		window.setTimeout(() => {
			this.settle?.(this.chosen);
			this.settle = null;
		}, 0);
	}
}
