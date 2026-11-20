import {
	App,
	Constructor,
	MarkdownFileInfo,
	MarkdownView,
	Scope,
	TFile,
	View,
	type Workspace,
} from "obsidian";
/* eslint-disable-next-line import/no-extraneous-dependencies -- CodeMirror 6 ships inside Obsidian and is resolved from the host at runtime; it is a peer of the editor API, not a bundled dependency. */
import { EditorSelection, Extension, Prec } from "@codemirror/state";
/* eslint-disable-next-line import/no-extraneous-dependencies -- Same as above: @codemirror/view is provided by Obsidian, never bundled. */
import { EditorView, keymap, placeholder, ViewUpdate, tooltips } from "@codemirror/view";
import { heldBlurStep, NodeEditorFocus, wrapMethod } from "./active-node-editor";

declare const app: App;

// Internal Obsidian type - not exported in official API
interface ScrollableMarkdownEditor {
	app: App;
	containerEl: HTMLElement;
	editor: { cm: EditorView };
	editorEl: HTMLElement;
	activeCM: EditorView | null;
	owner: { editMode: unknown; editor: unknown; file: TFile | null };
	_loaded: boolean;
	set(value: string): void;
	onUpdate(update: ViewUpdate, changed: boolean): void;
	buildLocalExtensions(): Extension[];
	destroy(): void;
	unload(): void;
}

// Internal Obsidian type - not exported in official API
interface WidgetEditorView {
	editable: boolean;
	editMode: unknown;
	showEditor(): void;
	unload(): void;
}

/**
 * Resolves the internal ScrollableMarkdownEditor prototype from Obsidian
 */
function resolveEditorPrototype(app: App): Constructor<ScrollableMarkdownEditor> {
	// Internal API — see src/obsidian-internals.d.ts for the declaration.
	const widgetEditorView = app.embedRegistry.embedByExtension.md(
		{ app, containerEl: createDiv() },
		null, // file parameter — not needed for prototype resolution
		""
	) as WidgetEditorView;

	widgetEditorView.editable = true;
	widgetEditorView.showEditor();

	const MarkdownEditor = Object.getPrototypeOf(
		Object.getPrototypeOf(widgetEditorView.editMode!)
	) as { constructor: Constructor<ScrollableMarkdownEditor> };

	widgetEditorView.unload();
	return MarkdownEditor.constructor;
}

/**
 * Gets the editor base class, with fallback for test environments
 */
function getEditorBase(): Constructor<ScrollableMarkdownEditor> {
	if (typeof app === "undefined") {
		// Test environment mock
		return class MockScrollableMarkdownEditor {
			app: App;
			containerEl: HTMLElement = createDiv();
			editor: { cm: EditorView } = null!;
			editorEl: HTMLElement = createDiv();
			activeCM: EditorView | null = null;
			owner: { editMode: unknown; editor: unknown; file: TFile | null } = { editMode: null, editor: null, file: null };
			_loaded = false;
			set(_value: string): void { /* noop */ }
			onUpdate(_update: ViewUpdate, _changed: boolean): void { /* noop */ }
			buildLocalExtensions(): Extension[] { return []; }
			destroy(): void { /* noop */ }
			unload(): void { /* noop */ }
			constructor(a: App, container: HTMLElement, _options: unknown) {
				this.app = a;
				this.containerEl = container;
			}
		};
	}
	return resolveEditorPrototype(app);
}

export interface MarkdownEditorProps {
	/** Initial cursor position */
	cursorLocation?: { anchor: number; head: number };
	/** Initial text content */
	value?: string;
	/** CSS class to add to editor element */
	cls?: string;
	/**
	 * The note being edited. Link autocomplete reads it off the editor's owner
	 * to resolve same-note links — without it `[[#` lists no headings.
	 */
	file?: TFile | null;
	/**
	 * The view the editor sits in (a mind map or Cosmos). When set, the
	 * editor stands in as the active `MarkdownView` while it is the active
	 * editor, so plugins that look for one (QuickAdd) find this editor and
	 * `file`; see `installMarkdownViewStandIn`.
	 */
	view?: View | null;
	/** Placeholder text when empty */
	placeholder?: string;
	/** Handler for Enter key (return false to use default behavior) */
	onEnter?: (editor: EmbeddableMarkdownEditor, mod: boolean, shift: boolean) => boolean;
	/** Handler for Escape key */
	onEscape?: (editor: EmbeddableMarkdownEditor) => void;
	/** Handler for Tab key (return false to use default behavior) */
	onTab?: (editor: EmbeddableMarkdownEditor) => boolean;
	/** Handler for Ctrl/Cmd+Enter */
	onSubmit?: (editor: EmbeddableMarkdownEditor) => void;
	/** Handler for blur event */
	onBlur?: (editor: EmbeddableMarkdownEditor) => void;
	/** Handler for paste event */
	onPaste?: (e: ClipboardEvent, editor: EmbeddableMarkdownEditor) => void;
	/** Handler for content changes */
	onChange?: (value: string, update: ViewUpdate) => void;
	/** Additional CodeMirror extensions (e.g., autocomplete) */
	extensions?: Extension[];
}

const defaultProperties: Required<MarkdownEditorProps> = {
	cursorLocation: undefined as unknown as { anchor: number; head: number },
	value: "",
	cls: "",
	file: null,
	view: null,
	placeholder: "",
	onEnter: () => false,
	onEscape: () => { /* noop */ },
	onTab: () => false,
	onSubmit: () => { /* noop */ },
	onBlur: () => { /* noop */ },
	onPaste: () => { /* noop */ },
	onChange: () => { /* noop */ },
	extensions: [],
};

/** How often a blur held by a modal checks whether the modal has closed. */
const HELD_BLUR_POLL_MS = 100;

/** The node editor focused last, which may stand in as the active MarkdownView. */
const nodeEditorFocus = new NodeEditorFocus<EmbeddableMarkdownEditor>();

/**
 * An embeddable markdown editor that provides full Obsidian editing capabilities
 * within any container element. Adapted from TaskNotes' implementation.
 *
 * Uses Obsidian's internal ScrollableMarkdownEditor to get Live Preview,
 * all hotkeys (Ctrl+B/I/K), [[link]] autocomplete, and syntax highlighting.
 */
export class EmbeddableMarkdownEditor extends getEditorBase() {
	options: Required<MarkdownEditorProps>;
	initial_value: string;
	scope: Scope;
	/** The poll of a blur held while a modal is open; null when no blur is held. */
	private heldBlur: number | null = null;
	/** This editor as a MarkdownView, made on first lookup (`markdownViewStandIn`). */
	private standIn: MarkdownView | null = null;

	constructor(app: App, container: HTMLElement, options: Partial<MarkdownEditorProps> = {}) {
		super(app, container, {
			app,
			onMarkdownScroll: () => { /* noop */ },
			getMode: () => "source",
			file: options.file ?? null,
		});

		this.options = { ...defaultProperties, ...options };
		this.initial_value = this.options.value;
		this.scope = new Scope(this.app.scope);

		// Override Mod+Enter: trigger our submit and stop Obsidian propagation.
		// In Obsidian's Scope API, returning false = "handled, stop propagation".
		this.scope.register(["Mod"], "Enter", () => {
			this.options.onSubmit(this);
			return false;
		});

		this.owner.editMode = this;
		this.owner.editor = this.editor;

		// From Obsidian 1.5.8+, must explicitly set value
		this.set(options.value || "");

		// Set up blur handler. A blur to a modal (the command palette, a
		// plugin's prompt) is held until the modal closes: the command it runs
		// acts on this editor, so the edit must still be open.
		if (this.options.onBlur !== defaultProperties.onBlur) {
			this.editor.cm.contentDOM.addEventListener("blur", () => {
				this.app.keymap.popScope(this.scope);
				if (!this._loaded) return;
				if (this.modalOpen()) this.holdBlur();
				else this.options.onBlur(this);
			});
		}

		// Set up focus handler — push scope and set as active editor
		this.editor.cm.contentDOM.addEventListener("focusin", () => {
			this.releaseBlur();
			this.app.keymap.pushScope(this.scope);
			// `owner` is a duck-typed stand-in for MarkdownFileInfo: Obsidian only
			// reads `editMode`/`editor` off the active editor for our use case.
			this.app.workspace.activeEditor = this.owner as unknown as MarkdownFileInfo;
			if (this.options.view) nodeEditorFocus.focus({ editor: this, owner: this.owner, view: this.options.view });
		});

		// Add custom CSS class if provided
		if (options.cls) {
			this.editorEl.classList.add(options.cls);
		}

		// Set initial cursor position
		if (options.cursorLocation) {
			this.editor.cm.dispatch({
				selection: EditorSelection.range(
					options.cursorLocation.anchor,
					options.cursorLocation.head
				),
			});
		}
	}

	/** Get the current text content of the editor */
	get value(): string {
		return this.editor.cm.state.doc.toString();
	}

	/** Set the text content of the editor */
	setValue(value: string): void {
		this.set(value);
	}

	/** Override to handle content changes */
	onUpdate(update: ViewUpdate, changed: boolean): void {
		super.onUpdate(update, changed);
		if (changed) {
			this.options.onChange(this.value, update);
		}
	}

	/** Build CodeMirror extensions for the editor */
	buildLocalExtensions(): Extension[] {
		const extensions = super.buildLocalExtensions();

		// Hide line numbers and gutters
		extensions.push(
			EditorView.theme({
				".cm-lineNumbers": { display: "none !important" },
				".cm-gutters": { display: "none !important" },
			})
		);

		extensions.push(
			tooltips({
				parent: document.body,
			})
		);

		// Add placeholder if specified
		if (this.options.placeholder) {
			extensions.push(placeholder(this.options.placeholder));
		}

		// Add paste handler
		extensions.push(
			EditorView.domEventHandlers({
				paste: (event) => {
					this.options.onPaste(event, this);
				},
			})
		);

		// Add keyboard handlers with highest precedence
		extensions.push(
			Prec.highest(
				keymap.of([
					{
						key: "Enter",
						// When a caller's `onEnter` takes the key (saves), it stops here: the editor is gone by the time the key would bubble, and the view behind it would take it as its own Enter.
						stopPropagation: true,
						run: () => this.options.onEnter(this, false, false),
						shift: () => this.options.onEnter(this, false, true),
					},
					{
						key: "Mod-Enter",
						run: () => {
							this.options.onSubmit(this);
							return true;
						},
					},
					{
						key: "Escape",
						run: () => {
							this.options.onEscape(this);
							return true;
						},
					},
					{
						key: "Tab",
						run: () => {
							return this.options.onTab(this);
						},
					},
				])
			)
		);

		// Add any custom extensions
		if (this.options.extensions && this.options.extensions.length > 0) {
			extensions.push(...this.options.extensions);
		}

		return extensions;
	}

	/**
	 * This editor as a `MarkdownView`, for plugins that read the active editor
	 * through `getActiveViewOfType(MarkdownView)`; null when it has no view.
	 * Not a real view: it passes `instanceof MarkdownView`, and carries the
	 * fields those plugins read. `editor` is this editor's own Obsidian
	 * `Editor`, so an edit made through it goes down the same path as typing
	 * (`onUpdate`, then the caller's save on commit).
	 */
	markdownViewStandIn(): MarkdownView | null {
		const view = this.options.view;
		if (!view) return null;
		if (this.standIn === null) {
			const standIn = Object.create(MarkdownView.prototype) as MarkdownView;
			// Own data properties: they shadow whatever accessors the prototype has for the same names.
			const fields: Record<string, unknown> = {
				app: this.app,
				leaf: view.leaf,
				containerEl: this.containerEl,
				contentEl: this.containerEl,
				editor: this.editor,
				file: this.options.file,
				getMode: () => "source",
			};
			for (const [key, value] of Object.entries(fields)) {
				Object.defineProperty(standIn, key, { value, writable: true, configurable: true, enumerable: true });
			}
			this.standIn = standIn;
		}
		return this.standIn;
	}

	/** Whether a modal (the command palette, a plugin's prompt) is open over this editor's window. */
	private modalOpen(): boolean {
		return this.editor.cm.contentDOM.ownerDocument.querySelector(".modal-container") !== null;
	}

	private holdBlur(): void {
		if (this.heldBlur !== null) return;
		this.heldBlur = window.setInterval(() => {
			const doc = this.editor.cm.contentDOM.ownerDocument;
			const step = heldBlurStep({
				focused: this.editor.cm.hasFocus,
				modalOpen: this.modalOpen(),
				focusOnNothing: doc.activeElement === null || doc.activeElement === doc.body,
			});
			if (step === "wait") return;
			this.releaseBlur();
			if (step === "refocus") this.editor.cm.focus();
			else if (step === "blur" && this._loaded) this.options.onBlur(this);
		}, HELD_BLUR_POLL_MS);
	}

	private releaseBlur(): void {
		if (this.heldBlur === null) return;
		window.clearInterval(this.heldBlur);
		this.heldBlur = null;
	}

	/** Clean up the editor and remove all event listeners */
	destroy(): void {
		this.releaseBlur();
		nodeEditorFocus.destroyed(this);
		this.standIn = null;
		if (this._loaded) {
			this.unload();
		}

		this.app.keymap.popScope(this.scope);
		this.app.workspace.activeEditor = null;

		this.containerEl.empty();
		super.destroy();
	}

	/** Obsidian lifecycle method */
	onunload(): void {
		this.destroy();
	}
}

/**
 * While a node editor (one given a `view`) is the active editor in the active
 * leaf, answer `workspace.getActiveViewOfType(MarkdownView)` with its stand-in
 * (`markdownViewStandIn`) and `workspace.getActiveFile()` with its note.
 * Plugins such as QuickAdd read the selection and insert text through that
 * lookup; without it they find no editor in a mind map or Cosmos leaf.
 * Every other lookup, and every lookup while no node editor is active, goes to
 * Obsidian untouched. Returns the undo, for the plugin's unload.
 */
export function installMarkdownViewStandIn(app: App): () => void {
	const workspace = app.workspace;
	// Obsidian's own lookup, set as the wrapper goes in: the active leaf's view comes from it.
	let lookup: Workspace["getActiveViewOfType"] | null = null;
	// `answerGuarded`: reading `activeEditor` can call back into this wrapper.
	const activeNodeEditor = (): EmbeddableMarkdownEditor | null =>
		nodeEditorFocus.answerGuarded(() => [workspace.activeEditor, lookup?.call(workspace, View) ?? null]);

	const undoView = wrapMethod(workspace, "getActiveViewOfType", (original) => {
		lookup = original;
		return function (this: Workspace, type: Constructor<View>): View | null {
			// Only the exact MarkdownView lookup: a lookup for a superclass (View, ItemView) is answered by the real mind map or graph view.
			if (type === MarkdownView) {
				const standIn = activeNodeEditor()?.markdownViewStandIn();
				if (standIn) return standIn;
			}
			return original.call(this, type);
		} as Workspace["getActiveViewOfType"];
	});
	const undoFile = wrapMethod(workspace, "getActiveFile", (original) => function (this: Workspace): TFile | null {
		return activeNodeEditor()?.options.file ?? original.call(this);
	});
	return () => {
		undoFile();
		undoView();
	};
}

/** Whether an Obsidian suggestion popup ([[ links, # headings) is open: Enter belongs to it, not to the editor. */
export function suggestOpen(): boolean {
	return activeDocument.querySelector(".suggestion-container") !== null;
}

/**
 * CodeMirror extension that fires a callback when the document or geometry changes,
 * enabling auto-resize of the editor container.
 */
export function autoResizeExtension(onResize: (height: number) => void): Extension {
	return EditorView.updateListener.of((update: ViewUpdate) => {
		if (update.docChanged) {
			// Use requestAnimationFrame to measure after layout settles
			window.requestAnimationFrame(() => {
				const height = update.view.contentDOM.scrollHeight;
				onResize(height);
			});
		}
	});
}
