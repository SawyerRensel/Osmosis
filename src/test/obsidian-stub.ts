/**
 * Runtime stand-in for the `obsidian` module, aliased in `vitest.config.ts`.
 *
 * The real package ships type definitions only (`"main": ""`), so a module that
 * imports `Modal` or `setIcon` as *values* cannot be loaded under vitest at all.
 * That is why this codebase keeps pure logic outside `src/views/`, and this stub
 * is not a licence to move it back: it covers the DOM assembly that has nowhere
 * else to live.
 *
 * Importing it installs Obsidian's `Element` helpers as a side effect, so a test
 * only has to import the view under test. They are reproduced *faithfully*
 * rather than forgivingly — in particular `createSvg` hands each class token
 * straight to `classList.add()`, which throws on a token containing a space. A
 * permissive stub would hide the exact bug this file exists to catch: that
 * mistake once took out a whole card render.
 */

/** The subset of Obsidian's `DomElementInfo` this codebase's views actually use. */
interface ElementInfo {
	cls?: string | string[];
	text?: string;
	value?: string;
	attr?: Record<string, string>;
}

/**
 * `strict` reproduces `createSvg`'s behaviour: each `cls` entry goes to
 * `classList.add()` whole, so a token containing a space throws exactly as it
 * does in Obsidian. The HTML helpers are the forgiving half of that asymmetry —
 * they split a space-separated string — and reproducing *both* halves is the
 * point: a stub strict everywhere rejects `cls: "a b"` that production uses
 * safely, and one forgiving everywhere hides the SVG bug this file exists for.
 */
function applyInfo(node: Element, info?: ElementInfo | string, strict = false): void {
	const opts: ElementInfo = typeof info === "string" ? { cls: info } : info ?? {};
	const classes = opts.cls === undefined ? [] : [opts.cls].flat();
	for (const token of strict ? classes : classes.flatMap((cls) => cls.split(/\s+/))) {
		if (token !== "") node.classList.add(token);
	}
	if (opts.text !== undefined) node.textContent = opts.text;
	if (opts.value !== undefined) (node as HTMLInputElement).value = opts.value;
	for (const [name, value] of Object.entries(opts.attr ?? {})) {
		node.setAttribute(name, value);
	}
}

function installDomHelpers(): void {
	const el = window.Element.prototype as unknown as Record<string, unknown>;

	el["createEl"] = function (this: Element, tag: string, info?: ElementInfo | string) {
		const node = document.createElement(tag);
		applyInfo(node, info);
		return this.appendChild(node);
	};

	el["createDiv"] = function (this: Element, info?: ElementInfo | string) {
		const node = document.createElement("div");
		applyInfo(node, info);
		return this.appendChild(node);
	};

	el["createSpan"] = function (this: Element, info?: ElementInfo | string) {
		const node = document.createElement("span");
		applyInfo(node, info);
		return this.appendChild(node);
	};

	el["createSvg"] = function (this: Element, tag: string, info?: ElementInfo | string) {
		const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
		applyInfo(node, info, true);
		return this.appendChild(node);
	};

	el["empty"] = function (this: Element) {
		while (this.firstChild) this.removeChild(this.firstChild);
	};

	el["addClass"] = function (this: Element, ...classes: string[]) {
		for (const token of classes) this.classList.add(token);
	};

	el["removeClass"] = function (this: Element, ...classes: string[]) {
		for (const token of classes) this.classList.remove(token);
	};

	el["hasClass"] = function (this: Element, cls: string) {
		return this.classList.contains(cls);
	};

	el["toggleClass"] = function (this: Element, classes: string | string[], value: boolean) {
		for (const token of [classes].flat()) this.classList.toggle(token, value);
	};

	el["setText"] = function (this: Element, text: string) {
		this.textContent = text;
	};

	el["setCssProps"] = function (this: HTMLElement, props: Record<string, string>) {
		for (const [name, value] of Object.entries(props)) this.style.setProperty(name, value);
	};
}

if (typeof window !== "undefined") installDomHelpers();

/**
 * Registered hotkeys, kept so a test can fire one without a real Obsidian scope.
 *
 * Keyed by modifiers *and* key, because a view may legitimately bind both `Mod+z`
 * and `Mod+Shift+z` — collapsing them onto the key alone would silently let one
 * registration overwrite the other and make undo and redo the same command.
 */
export class Scope {
	readonly handlers = new Map<string, (evt?: KeyboardEvent) => unknown>();

	register(modifiers: string[] | null, key: string, handler: (evt?: KeyboardEvent) => unknown): void {
		this.handlers.set(hotkeyId(modifiers ?? [], key), handler);
	}

	/** Fire a registered hotkey. Returns what the handler returned, or undefined. */
	trigger(modifiers: string[], key: string, evt?: KeyboardEvent): unknown {
		return this.handlers.get(hotkeyId(modifiers, key))?.(evt);
	}
}

function hotkeyId(modifiers: readonly string[], key: string): string {
	return `${[...modifiers].sort().join("+")}|${key}`;
}

/**
 * `Modal` reduced to what a view subclass touches: the two elements it builds
 * into, a scope, and open/close driving the lifecycle hooks.
 */
export class Modal {
	readonly containerEl: HTMLElement;
	readonly modalEl: HTMLElement;
	readonly contentEl: HTMLElement;
	readonly scope = new Scope();

	constructor(readonly app: unknown) {
		this.containerEl = document.createElement("div");
		this.modalEl = document.createElement("div");
		this.contentEl = document.createElement("div");
		this.modalEl.appendChild(this.contentEl);
		this.containerEl.appendChild(this.modalEl);
	}

	open(): void {
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}

	close(): void {
		this.containerEl.remove();
		this.onClose();
	}

	onOpen(): void { /* overridden by the subclass */ }
	onClose(): void { /* overridden by the subclass */ }
}

/** Records the icon name rather than injecting Obsidian's SVG sprite. */
export function setIcon(parent: HTMLElement, iconId: string): void {
	parent.setAttribute("data-icon", iconId);
}

/** Lifecycle host. Views hold one to own their child renderers. */
export class Component {
	load(): void { /* no children to start */ }
	unload(): void { /* nothing registered */ }
	register(_cb: () => unknown): void { /* nothing to clean up */ }
}

/**
 * Renders markdown as its literal source. Enough to assert *what text reached
 * the renderer* — which is the question the `{label}` markers exist to answer —
 * without pulling in Obsidian's markdown pipeline.
 */
export const MarkdownRenderer = {
	render: async (
		_app: unknown,
		markdown: string,
		el: HTMLElement,
		_sourcePath: string,
		_component: unknown,
	): Promise<void> => {
		el.appendChild(document.createTextNode(markdown));
		return Promise.resolve();
	},
};

/** Collects the items added to it so a test can read the offered menu. */
export class Menu {
	readonly items: { title?: string; icon?: string; section?: string; click?: () => unknown }[] = [];

	addItem(cb: (item: MenuItemStub) => unknown): this {
		const entry: { title?: string; icon?: string; section?: string; click?: () => unknown } = {};
		cb({
			setTitle(title: string) { entry.title = title; return this; },
			setIcon(icon: string) { entry.icon = icon; return this; },
			setSection(section: string) { entry.section = section; return this; },
			onClick(cb2: () => unknown) { entry.click = cb2; return this; },
		});
		this.items.push(entry);
		return this;
	}

	showAtMouseEvent(_event: MouseEvent): this { return this; }
}

interface MenuItemStub {
	setTitle(title: string): MenuItemStub;
	setIcon(icon: string): MenuItemStub;
	setSection(section: string): MenuItemStub;
	onClick(cb: () => unknown): MenuItemStub;
}
