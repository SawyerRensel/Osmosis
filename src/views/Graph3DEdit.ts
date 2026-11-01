import { Platform, setIcon, type App, type TFile } from "obsidian";
/* eslint-disable-next-line import/no-extraneous-dependencies -- CodeMirror 6 ships inside Obsidian and is resolved from the host at runtime; it is a peer of the editor API, not a bundled dependency. */
import { EditorSelection } from "@codemirror/state";
/* eslint-disable-next-line import/no-extraneous-dependencies -- Same as above: @codemirror/view is provided by Obsidian, never bundled. */
import { EditorView } from "@codemirror/view";
import { EmbeddableMarkdownEditor } from "../editor/EmbeddableMarkdownEditor";
import { visibleBand, type EditorPlace, type VisibleBand } from "../graph3d/edit";
import type { TrackedEditor } from "./Graph3DNear";

/** Delay before a blur saves, so a click on the editor's own buttons lands first (as in the mind map). */
const BLUR_SAVE_MS = 100;
/** The save and cancel buttons: their size, and the gap between them and the box. */
const BUTTON_PX = 28;
const BUTTON_GAP_PX = 4;

/** The Chromium VirtualKeyboard API: not in the TypeScript lib. */
interface VirtualKeyboardLike {
	overlaysContent: boolean;
	boundingRect: DOMRect;
	addEventListener(type: string, fn: () => void): void;
	removeEventListener(type: string, fn: () => void): void;
}

export interface EditRequest {
	/** The element the editor is laid over: the scene's stage, whose px the scene places it in. */
	host: HTMLElement;
	/** The note the line is in, for link autocomplete. */
	file: TFile | null;
	/** The text to open on: the line's source minus its indentation and block ID (`nodeEditText`). */
	text: string;
	/** Where the selection starts: the label, not the markers. */
	selectionStart: number;
	/** Phone: the part of the window the on-screen keyboard leaves visible, each time it changes, and null when the editor closes. */
	onVisibleBand: (band: VisibleBand | null) => void;
	/** Called once when the editor closes: the edited text on save, null on cancel. */
	done: (text: string | null) => void;
}

/**
 * The inline editor of the 3D graph: Obsidian's embeddable markdown editor,
 * the one the mind map uses, in a box laid out like the node's near-tier
 * panel and kept on its plate by the near tier every frame (`place`): it
 * moves, scales and hides with the plate as the camera moves, and a camera
 * move never ends the edit. Ctrl/Cmd+Enter or the check button saves; Escape
 * or the x button cancels; so does focus leaving it for something else (a
 * blur saves). A click on the canvas also saves, from the scene.
 *
 * The save and cancel buttons stay their own size above the box's corners, so
 * they can be hit at any zoom. On a phone the WebView overlays the on-screen
 * keyboard instead of resizing the page (the mind map's recipe), and the part
 * of the window left visible goes out through `onVisibleBand`, so the camera
 * can keep the line centred above the keyboard.
 */
export class Graph3DEditor implements TrackedEditor {
	private anchor: HTMLElement | null = null;
	private box: HTMLElement | null = null;
	private cancelButton: HTMLElement | null = null;
	private saveButton: HTMLElement | null = null;
	private editor: EmbeddableMarkdownEditor | null = null;
	private request: EditRequest | null = null;
	/** The box's laid-out size in px, before its scale. */
	private width = 0;
	private height = 0;
	/** Where it was last placed, to re-place the buttons when the box grows. */
	private placed: EditorPlace | null = null;
	private cleanup: Array<() => void> = [];

	constructor(private readonly app: App) {}

	get isOpen(): boolean {
		return this.request !== null;
	}

	open(request: EditRequest): void {
		this.close(false);
		this.request = request;
		this.placed = null;

		// A zero-size point at the node, as a near-tier panel's anchor is; hidden until first placed.
		const anchor = createDiv({ cls: "osmosis-graph3d-edit" });
		anchor.setCssStyles({ opacity: "0" });
		// First in the stage, so the corner controls after it stay on top.
		request.host.prepend(anchor);
		this.anchor = anchor;
		this.cleanup.push(() => anchor.remove());
		const box = anchor.createDiv({ cls: "osmosis-edit-overlay osmosis-graph3d-edit-box" });
		this.box = box;
		this.cancelButton = anchor.appendChild(this.button("cancel", "x", "Cancel editing", false));
		this.saveButton = anchor.appendChild(this.button("save", "check", "Save changes", true));
		// A press in the editor is not a press on the canvas behind it.
		for (const type of ["pointerdown", "mousedown", "click"]) anchor.addEventListener(type, (e) => e.stopPropagation());
		const sizes = new ResizeObserver((entries) => {
			const size = entries[0]?.borderBoxSize[0];
			if (size === undefined) return;
			this.width = size.inlineSize;
			this.height = size.blockSize;
			this.place(this.placed);
		});
		sizes.observe(box);
		this.cleanup.push(() => sizes.disconnect());

		try {
			const editor = new EmbeddableMarkdownEditor(this.app, box, {
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
				extensions: [EditorView.lineWrapping],
			});
			this.editor = editor;
			editor.editor.cm.focus();
			editor.editor.cm.dispatch({ selection: EditorSelection.range(request.selectionStart, editor.editor.cm.state.doc.length) });
		} catch (error) {
			console.warn("Osmosis: embedded editor failed in the 3D graph, falling back to a textarea", error);
			this.openTextarea(box, request);
		}

		this.watchViewport(request);
		this.cleanup.push(this.lockScroll(request.host.parentElement ?? request.host));
	}

	/** Close the editor. `save` hands the text to `done`; otherwise `done(null)`. No-op when closed. */
	close(save: boolean): void {
		const request = this.request;
		if (request === null) return;
		this.request = null;
		const text = save ? (this.editor?.value ?? this.box?.querySelector("textarea")?.value ?? null) : null;
		this.editor?.destroy();
		this.editor = null;
		for (const undo of this.cleanup.splice(0).reverse()) undo();
		this.anchor = this.box = this.cancelButton = this.saveButton = null;
		this.placed = null;
		request.done(text);
	}

	setPlate(plate: { minWidth: number; minHeight: number; radius: number; fontSize: number }): void {
		this.box?.setCssStyles({
			fontSize: `${plate.fontSize}px`,
			minWidth: `${plate.minWidth}px`,
			minHeight: `${plate.minHeight}px`,
			borderRadius: `${plate.radius}px`,
		});
	}

	place(at: EditorPlace | null): void {
		this.placed = at;
		const { anchor, box, cancelButton, saveButton } = this;
		if (anchor === null || box === null || cancelButton === null || saveButton === null) return;
		if (at === null) {
			// Behind the camera. Not `display: none`: that would take the focus, and a blur saves.
			anchor.setCssStyles({ opacity: "0", pointerEvents: "none" });
			return;
		}
		anchor.setCssStyles({ transform: `translate(${at.x}px, ${at.y}px)`, opacity: String(at.opacity), pointerEvents: "" });
		box.setCssStyles({ transform: `translate(-50%, -50%) scale(${at.scale})` });
		// The buttons keep their size, over the box's top corners (side by side when it is narrower than both).
		const halfWidth = (this.width * at.scale) / 2;
		const top = -(this.height * at.scale) / 2 - BUTTON_PX - BUTTON_GAP_PX;
		cancelButton.setCssStyles({ transform: `translate(${-halfWidth}px, ${top}px)` });
		saveButton.setCssStyles({ transform: `translate(${Math.max(halfWidth - BUTTON_PX, -halfWidth + BUTTON_PX + BUTTON_GAP_PX)}px, ${top}px)` });
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

	private openTextarea(box: HTMLElement, request: EditRequest): void {
		const input = createEl("textarea", { cls: "osmosis-node-input osmosis-fallback-textarea" });
		input.value = request.text;
		input.rows = 1;
		input.setCssStyles({ width: "100%" });
		box.appendChild(input);
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
				if (this.box === box) this.close(true);
			}, BLUR_SAVE_MS);
		});
		input.focus({ preventScroll: true });
		input.setSelectionRange(request.selectionStart, request.text.length);
	}

	/** On a phone: overlay the keyboard instead of resizing the page, and report the visible band whenever it changes. */
	private watchViewport(request: EditRequest): void {
		if (!Platform.isMobile) return;
		const keyboard = "virtualKeyboard" in navigator ? (navigator as unknown as { virtualKeyboard: VirtualKeyboardLike }).virtualKeyboard : null;
		const report = () => {
			const viewport = window.visualViewport;
			const rect = keyboard?.boundingRect;
			request.onVisibleBand(visibleBand(viewport ? { offsetTop: viewport.offsetTop, height: viewport.height } : null, window.innerHeight, rect ? { top: rect.top, height: rect.height } : null));
		};
		if (keyboard !== null) {
			keyboard.overlaysContent = true;
			keyboard.addEventListener("geometrychange", report);
			this.cleanup.push(() => {
				keyboard.removeEventListener("geometrychange", report);
				keyboard.overlaysContent = false;
			});
		}
		const viewport = window.visualViewport;
		if (viewport) {
			viewport.addEventListener("resize", report);
			this.cleanup.push(() => viewport.removeEventListener("resize", report));
		}
		this.cleanup.push(() => request.onVisibleBand(null));
		report();
	}

	/** Focusing a field can scroll the view to it; a safety net, as in the mind map. */
	private lockScroll(host: HTMLElement): () => void {
		const reset = () => {
			for (let el: Element | null = host; el; el = el.parentElement) {
				el.scrollTop = 0;
				el.scrollLeft = 0;
			}
		};
		host.addEventListener("scroll", reset, true);
		reset();
		return () => host.removeEventListener("scroll", reset, true);
	}
}
