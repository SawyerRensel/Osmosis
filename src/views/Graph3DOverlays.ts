import { Setting, setIcon, setTooltip, type SliderComponent, type ToggleComponent } from "obsidian";
import {
	MIST_LIMIT,
	OVERLAY_EDGE_KINDS,
	TRAVEL_LIMIT,
	mistFromSlider,
	sliderFromMist,
	sliderFromTravel,
	travelFromSlider,
	type ColorMode,
	type Graph3DOverlays,
	type LabelMode,
	type OverlayEdgeKind,
} from "../graph3d/overlays";
import { flatDepth, flatWeight } from "../graph3d/flatten";

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
 * needs nothing extra on mobile. It is sticky: only its own button closes it
 * (and Escape, from the view), never a press on the canvas. Every change goes out whole through
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
				.setLimits(0, this.maxDepth, 1)
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
		new Setting(panel)
			.setName("Links pull")
			.setDesc("Off, links between plates still draw but pull nothing, so notes settle by their own shape. Toggling it re-settles the loaded notes.")
			.addToggle((toggle) => toggle.setValue(overlays.linksPull).onChange((value) => this.change({ linksPull: value })));
		const flatten = new Setting(panel).setName("Flatten branches").setDesc(flattenLabel(overlays.flatten));
		flatten.addSlider((slider) =>
			slider
				// Continuous: lines at the boundary depth are pulled part-way into their slice.
				.setLimits(0, 1, 0.01)
				.setValue(overlays.flatten)
				// Sent on every step of a drag, so the graph re-settles live (see Graph3DScene.reshape).
				.setInstant(true)
				.onChange((value) => {
					flatten.setDesc(flattenLabel(value));
					this.change({ flatten: value });
				}),
		);

		new Setting(panel).setName("Camera").setHeading();
		const travel = new Setting(panel).setName("Travel speed").setDesc(travelLabel(overlays.travelSpeed));
		travel.addSlider((slider) => {
			const limit = Math.log2(TRAVEL_LIMIT);
			slider
				.setLimits(-limit, limit, 0.25)
				.setValue(sliderFromTravel(overlays.travelSpeed))
				.onChange((value) => {
					travel.setDesc(travelLabel(travelFromSlider(value)));
					this.change({ travelSpeed: travelFromSlider(value) });
				});
		});

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
	if (depth === 0) return "Only the focus note and the notes it embeds";
	return depth === 1 ? "1 hop from the focus note" : `${String(depth)} hops from the focus note`;
}

function travelLabel(speed: number): string {
	return `×${speed < 1 ? speed.toFixed(2) : speed.toFixed(1)}. How fast the camera flies when you follow a link, hop to a plate, or go to a search result.`;
}

function flattenLabel(flatten: number): string {
	const flat = flatDepth(flatten);
	const ramp = Math.floor(flat) + 1;
	const weight = flatWeight(ramp, flat);
	const lead = !Number.isFinite(flat)
		? "Off: every branch spreads in 3D."
		: flat <= 1
			? "Everything under each note's title lies flat."
			: weight >= 1
				? `Lines deeper than outline depth ${String(ramp - 1)} lie flat.`
				: `Lines deeper than outline depth ${String(ramp)} lie flat; lines at depth ${String(ramp)} are pulled ${String(Math.round(weight * 100))}% into their slice.`;
	return `${lead} A flat branch is drawn as the mind map draws it, in a slice through its note's core. Moving it re-settles the loaded notes as you drag.`;
}

function mistLabel(mist: number): string {
	return `×${mist < 1 ? mist.toFixed(2) : mist.toFixed(1)}`;
}
