import { Platform, setIcon, type App, type TFile } from "obsidian";
/* eslint-disable-next-line import/no-extraneous-dependencies -- CodeMirror 6 ships inside Obsidian and is resolved from the host at runtime; it is a peer of the editor API, not a bundled dependency. */
import { EditorSelection } from "@codemirror/state";
/* eslint-disable-next-line import/no-extraneous-dependencies -- Same as above: @codemirror/view is provided by Obsidian, never bundled. */
import { EditorView } from "@codemirror/view";
import { EmbeddableMarkdownEditor } from "../editor/EmbeddableMarkdownEditor";
import { editBoxGeometry, fitEditTop, type Box, type EditBounds } from "../graph3d/edit";

/** Delay before a blur saves, so a click on the editor's own buttons lands first (as in the mind map). */
const BLUR_SAVE_MS = 100;

/** The Chromium VirtualKeyboard API: not in the TypeScript lib. */
interface VirtualKeyboardLike {
	overlaysContent: boolean;
	addEventListener(type: string, fn: () => void): void;
	removeEventListener(type: string, fn: () => void): void;
}

export interface EditRequest {
	/** The note the line is in, for link autocomplete. */
	file: TFile | null;
	/** The text to open on: the line's source minus its indentation and block ID (`nodeEditText`). */
	text: string;
	/** Where the selection starts: the label, not the markers. */
	selectionStart: number;
	/** The node's on-screen box, in client pixels. */
	anchor: Box;
	/** The view's own box in client pixels (desktop). A phone uses the visible viewport instead. */
	view: EditBounds;
	/** Called once when the editor closes: the edited text on save, null on cancel. */
	done: (text: string | null) => void;
}

/**
 * The inline editor of the 3D graph: Obsidian's embeddable markdown editor in a
 * box placed over the node being edited, the same editor the mind map uses.
 * It is a screen-space overlay, not part of the scene, so the text is readable
 * at any camera distance. Ctrl/Cmd+Enter, the check button or a blur saves;
 * Escape or the x button cancels.
 *
 * On a phone the box sits on `document.body`, fixed, and tells the WebView to
 * overlay the on-screen keyboard instead of resizing the page (the mind map's
 * recipe), then keeps itself above the keyboard as the visible viewport shrinks.
 */
export class Graph3DEditor {
	private container: HTMLElement | null = null;
	private editor: EmbeddableMarkdownEditor | null = null;
	private request: EditRequest | null = null;
	private top = 0;
	private cleanup: Array<() => void> = [];

	constructor(private readonly app: App, private readonly host: () => HTMLElement) {}

	get isOpen(): boolean {
		return this.request !== null;
	}

	open(request: EditRequest): void {
		this.close(false);
		this.request = request;

		const container = createDiv({ cls: "osmosis-edit-overlay osmosis-graph3d-edit" });
		document.body.appendChild(container);
		this.container = container;
		this.cleanup.push(() => container.remove());

		container.appendChild(this.button("cancel", "x", "Cancel editing", false));
		container.appendChild(this.button("save", "check", "Save changes", true));
		// A press in the editor is not a press on the canvas behind it.
		container.addEventListener("pointerdown", (e) => e.stopPropagation());
		container.addEventListener("click", (e) => e.stopPropagation());

		const geometry = editBoxGeometry(request.anchor, this.bounds());
		this.top = geometry.top;
		container.setCssStyles({ left: `${geometry.left}px`, top: `${geometry.top}px`, width: `${geometry.width}px`, maxHeight: `${geometry.maxHeight}px` });

		try {
			const editor = new EmbeddableMarkdownEditor(this.app, container, {
				value: request.text,
				cls: "osmosis-node-editor",
				file: request.file,
				onEnter: () => false,
				// Deferred so the keymap returns before the editor is destroyed, or the key leaks to the workspace.
				onSubmit: () => queueMicrotask(() => this.close(true)),
				onEscape: () => queueMicrotask(() => this.close(false)),
				onBlur: () => {
					window.setTimeout(() => {
						if (this.editor === editor) this.close(true);
					}, BLUR_SAVE_MS);
				},
				extensions: [EditorView.lineWrapping, EditorView.updateListener.of((update) => update.docChanged && window.requestAnimationFrame(() => this.fit()))],
			});
			this.editor = editor;
			editor.editor.cm.focus();
			editor.editor.cm.dispatch({ selection: EditorSelection.range(request.selectionStart, editor.editor.cm.state.doc.length) });
		} catch (error) {
			console.warn("Osmosis: embedded editor failed in the 3D graph, falling back to a textarea", error);
			this.openTextarea(container, request);
		}

		this.watchViewport();
		this.cleanup.push(this.lockScroll());
		this.fit();
	}

	/** Close the editor. `save` hands the text to `done`; otherwise `done(null)`. No-op when closed. */
	close(save: boolean): void {
		const request = this.request;
		if (request === null) return;
		this.request = null;
		const text = save ? (this.editor?.value ?? this.container?.querySelector("textarea")?.value ?? null) : null;
		this.editor?.destroy();
		this.editor = null;
		for (const undo of this.cleanup.splice(0).reverse()) undo();
		this.container = null;
		request.done(text);
	}

	private button(kind: "cancel" | "save", icon: string, label: string, save: boolean): HTMLElement {
		const button = createEl("button", { cls: `osmosis-edit-btn osmosis-edit-${kind}` });
		button.setAttribute("aria-label", label);
		setIcon(button, icon);
		// A press must not blur the editor, which would save it first.
		button.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.close(save);
		});
		return button;
	}

	private openTextarea(container: HTMLElement, request: EditRequest): void {
		const input = createEl("textarea", { cls: "osmosis-node-input osmosis-fallback-textarea" });
		input.value = request.text;
		input.rows = 1;
		input.setCssStyles({ width: "100%" });
		container.appendChild(input);
		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) this.close(true);
			else if (e.key === "Escape") this.close(false);
			else {
				e.stopPropagation();
				return;
			}
			e.preventDefault();
			e.stopPropagation();
		});
		input.addEventListener("blur", () => {
			window.setTimeout(() => {
				if (this.container === container) this.close(true);
			}, BLUR_SAVE_MS);
		});
		input.focus({ preventScroll: true });
		input.setSelectionRange(request.selectionStart, request.text.length);
	}

	/** The room the box may use: the visible viewport on a phone (the keyboard takes the rest), the view's own box on a desktop. */
	private bounds(): EditBounds {
		const request = this.request;
		if (Platform.isMobile || request === null) {
			return { left: 0, top: 0, right: window.innerWidth, bottom: window.visualViewport?.height ?? window.innerHeight };
		}
		return request.view;
	}

	/** Keep the box inside its bounds as it grows with the text or the keyboard comes up. */
	private fit(): void {
		const container = this.container;
		if (container === null) return;
		this.top = fitEditTop(this.top, container.getBoundingClientRect().height, this.bounds());
		container.style.top = `${this.top}px`;
	}

	/** On a phone: overlay the keyboard instead of resizing the page, and refit when the visible area changes. */
	private watchViewport(): void {
		if (!Platform.isMobile) return;
		const keyboard = "virtualKeyboard" in navigator ? (navigator as unknown as { virtualKeyboard: VirtualKeyboardLike }).virtualKeyboard : null;
		if (keyboard !== null) {
			keyboard.overlaysContent = true;
			const refit = () => this.fit();
			keyboard.addEventListener("geometrychange", refit);
			this.cleanup.push(() => {
				keyboard.removeEventListener("geometrychange", refit);
				keyboard.overlaysContent = false;
			});
		}
		const viewport = window.visualViewport;
		if (viewport) {
			const refit = () => this.fit();
			viewport.addEventListener("resize", refit);
			this.cleanup.push(() => viewport.removeEventListener("resize", refit));
		}
	}

	/** Focusing a field can scroll the page to it; a safety net, as in the mind map. */
	private lockScroll(): () => void {
		const reset = () => {
			for (let el: Element | null = this.host(); el; el = el.parentElement) {
				el.scrollTop = 0;
				el.scrollLeft = 0;
			}
		};
		const host = this.host();
		host.addEventListener("scroll", reset, true);
		reset();
		return () => host.removeEventListener("scroll", reset, true);
	}
}
