import {
	App,
	Constructor,
	Scope,
} from "obsidian";
// eslint-disable-next-line import/no-extraneous-dependencies
import { EditorSelection, Extension, Prec } from "@codemirror/state";
// eslint-disable-next-line import/no-extraneous-dependencies
import { EditorView, keymap, placeholder, ViewUpdate, tooltips } from "@codemirror/view";

declare const app: App;

// Internal Obsidian type - not exported in official API
interface ScrollableMarkdownEditor {
	app: App;
	containerEl: HTMLElement;
	editor: { cm: EditorView };
	editorEl: HTMLElement;
	activeCM: EditorView | null;
	owner: { editMode: unknown; editor: unknown };
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
	// @ts-expect-error - Using internal API: embedRegistry.embedByExtension
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
	const widgetEditorView: WidgetEditorView = app.embedRegistry.embedByExtension.md(
		{ app, containerEl: document.createElement("div") },
		null, // file parameter — not needed for prototype resolution
		""
	);

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
			containerEl: HTMLElement = document.createElement("div");
			editor: { cm: EditorView } = null!;
			editorEl: HTMLElement = document.createElement("div");
			activeCM: EditorView | null = null;
			owner: { editMode: unknown; editor: unknown } = { editMode: null, editor: null };
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
		} as unknown as Constructor<ScrollableMarkdownEditor>;
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

	constructor(app: App, container: HTMLElement, options: Partial<MarkdownEditorProps> = {}) {
		super(app, container, {
			app,
			onMarkdownScroll: () => { /* noop */ },
			getMode: () => "source",
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

		// Set up blur handler
		if (this.options.onBlur !== defaultProperties.onBlur) {
			this.editor.cm.contentDOM.addEventListener("blur", () => {
				this.app.keymap.popScope(this.scope);
				if (this._loaded) this.options.onBlur(this);
			});
		}

		// Set up focus handler — push scope and set as active editor
		this.editor.cm.contentDOM.addEventListener("focusin", () => {
			this.app.keymap.pushScope(this.scope);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			(this.app.workspace as any).activeEditor = this.owner;
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

	/** Clean up the editor and remove all event listeners */
	destroy(): void {
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
 * CodeMirror extension that fires a callback when the document or geometry changes,
 * enabling auto-resize of the editor container.
 */
export function autoResizeExtension(onResize: (height: number) => void): Extension {
	return EditorView.updateListener.of((update: ViewUpdate) => {
		if (update.docChanged) {
			// Use requestAnimationFrame to measure after layout settles
			requestAnimationFrame(() => {
				const height = update.view.contentDOM.scrollHeight;
				onResize(height);
			});
		}
	});
}
