import { Setting, setIcon, setTooltip, type SliderComponent, type ToggleComponent } from "obsidian";
import {
	MIST_LIMIT,
	OVERLAY_EDGE_KINDS,
	mistFromSlider,
	sliderFromMist,
	type ColorMode,
	type Graph3DOverlays,
	type LabelMode,
	type OverlayEdgeKind,
} from "../graph3d/overlays";

const COLOR_MODES: Record<ColorMode, string> = {
	note: "Note",
	memory: "Memory strength",
	tag: "Tag",
	type: "Node type",
};

const EDGE_NAMES: Record<OverlayEdgeKind, string> = {
	hierarchy: "Hierarchy",
	link: "Links",
	embed: "Embeds",
	property: "Properties",
	tag: "Tags",
	attachment: "Attachments",
	unresolved: "Unresolved links",
};

const LABEL_MODES: Record<LabelMode, string> = {
	all: "Plates and panels",
	plates: "Plates only",
	none: "Hidden",
};

/** The loaded area's depth and backlinks: they live in the view's state, so the menu only shows and sends them. */
export interface GraphReach {
	depth: number;
	backlinks: boolean;
}

/**
 * The 3D graph's Overlays menu, in the spirit of Blender's viewport Overlays
 * and Shading popovers: an icon button in the viewport's top-right corner that
 * opens a panel of settings under it. It also holds the graph's Depth and
 * Backlinks, which were a strip in the viewport. Taps work as clicks, so it
 * needs nothing extra on mobile. Every change goes out whole through
 * `onChange` (or `onReach`); the menu never saves.
 */
export class Graph3DOverlaysMenu {
	private readonly button: HTMLElement;
	private readonly panel: HTMLElement;
	/** The settings as this menu last showed or sent them. */
	current: Graph3DOverlays;
	private depthSlider: SliderComponent | null = null;
	private backlinksToggle: ToggleComponent | null = null;

	constructor(
		root: HTMLElement,
		overlays: Graph3DOverlays,
		private reach: GraphReach,
		private readonly maxDepth: number,
		private readonly onChange: (overlays: Graph3DOverlays) => void,
		private readonly onReach: (reach: GraphReach) => void,
	) {
		this.current = overlays;
		const corner = root.createDiv({ cls: "osmosis-graph3d-overlays-corner" });
		this.button = corner.createEl("button", { cls: "osmosis-graph3d-overlays-button clickable-icon", attr: { "aria-label": "Overlays" } });
		setIcon(this.button, "layers");
		setTooltip(this.button, "Overlays");
		this.button.addEventListener("click", () => this.toggle());
		this.panel = corner.createDiv({ cls: "osmosis-graph3d-overlays is-hidden" });
	}

	get isOpen(): boolean {
		return !this.panel.hasClass("is-hidden");
	}

	/** Whether `target` is part of the menu, so a press there doesn't close it. */
	contains(target: EventTarget | null): boolean {
		return target instanceof Node && (this.panel.contains(target) || this.button.contains(target));
	}

	toggle(open = !this.isOpen): void {
		this.panel.toggleClass("is-hidden", !open);
		this.button.toggleClass("is-active", open);
		// Built on opening, so it always shows the settings as they are now.
		if (open) this.build();
		else {
			this.panel.empty();
			this.depthSlider = null;
			this.backlinksToggle = null;
		}
	}

	/** Show settings changed elsewhere (another 3D graph's menu). */
	show(overlays: Graph3DOverlays): void {
		this.current = overlays;
		if (this.isOpen) this.build();
	}

	/** Show the depth and backlinks the view now has (restored state, or a saved layout). */
	showReach(reach: GraphReach): void {
		this.reach = reach;
		this.depthSlider?.setValue(reach.depth);
		this.backlinksToggle?.setValue(reach.backlinks);
	}

	private change(patch: Partial<Graph3DOverlays>): void {
		this.current = { ...this.current, ...patch };
		this.onChange(this.current);
	}

	private build(): void {
		const panel = this.panel;
		panel.empty();
		const overlays = this.current;

		const depth = new Setting(panel).setName("Depth").setDesc(depthLabel(this.reach.depth));
		depth.addSlider((slider) => {
			this.depthSlider = slider;
			slider
				.setLimits(1, this.maxDepth, 1)
				.setValue(this.reach.depth)
				.onChange((value) => {
					depth.setDesc(depthLabel(value));
					this.reach = { ...this.reach, depth: value };
					this.onReach(this.reach);
				});
		});
		new Setting(panel)
			.setName("Backlinks")
			.setDesc("Count notes that link to a loaded note as hops, not only the notes it links to.")
			.addToggle((toggle) => {
				this.backlinksToggle = toggle;
				toggle.setValue(this.reach.backlinks).onChange((value) => {
					this.reach = { ...this.reach, backlinks: value };
					this.onReach(this.reach);
				});
			});

		new Setting(panel).setName("Color by").addDropdown((dropdown) =>
			dropdown
				.addOptions(COLOR_MODES)
				.setValue(overlays.colorBy)
				.onChange((value) => this.change({ colorBy: value as ColorMode })),
		);

		new Setting(panel).setName("Edges").setHeading();
		for (const kind of OVERLAY_EDGE_KINDS) {
			new Setting(panel).setName(EDGE_NAMES[kind]).addToggle((toggle) =>
				toggle.setValue(overlays.edges[kind]).onChange((value) => this.change({ edges: { ...this.current.edges, [kind]: value } })),
			);
		}

		new Setting(panel).setName("Forces").setHeading();
		new Setting(panel)
			.setName("Hierarchy ⟷ organic")
			.setDesc("Left keeps each note's mind-map shape; right lets links shape the web. Moving it re-settles the loaded notes as you drag.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.05)
					.setValue(overlays.forceBalance)
					// Sent on every step of a drag, so the graph re-settles live (see Graph3DScene.reshape).
					.setInstant(true)
					.onChange((value) => this.change({ forceBalance: value })),
			);

		new Setting(panel).setName("Lookdev").setHeading();
		const mist = new Setting(panel).setName("Mist density").setDesc(mistLabel(overlays.mist));
		mist.addSlider((slider) => {
			const limit = Math.log2(MIST_LIMIT);
			slider
				.setLimits(-limit, limit, 0.25)
				.setValue(sliderFromMist(overlays.mist))
				.onChange((value) => {
					mist.setDesc(mistLabel(mistFromSlider(value)));
					this.change({ mist: mistFromSlider(value) });
				});
		});
		new Setting(panel)
			.setName("Link particles")
			.setDesc("A particle runs along each edge, from source to target.")
			.addToggle((toggle) => toggle.setValue(overlays.particles).onChange((value) => this.change({ particles: value })));
		new Setting(panel).setName("Labels").addDropdown((dropdown) =>
			dropdown
				.addOptions(LABEL_MODES)
				.setValue(overlays.labels)
				.onChange((value) => this.change({ labels: value as LabelMode })),
		);
	}
}

function depthLabel(depth: number): string {
	return depth === 1 ? "1 hop from the focus note" : `${String(depth)} hops from the focus note`;
}

function mistLabel(mist: number): string {
	return `×${mist < 1 ? mist.toFixed(2) : mist.toFixed(1)}`;
}
