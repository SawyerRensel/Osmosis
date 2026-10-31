/**
 * Two on-screen thumb joysticks for walking and flying through the 3D graph on
 * a touch screen, behind a toggle in the viewport's bottom-right corner. What
 * each stick does is `STICK_ROLES`; the maths is `src/graph3d/joysticks.ts`;
 * `Graph3DScene` reads `look` and `move` every frame.
 *
 * Each stick is its own element over the canvas, so a touch that starts on one
 * never reaches the canvas, where orbit, pan, pinch and their momentum listen.
 * Each tracks its own pointer, so one thumb on each works at once.
 */

import { Platform, setIcon, setTooltip } from "obsidian";
import { CENTRED, STICK_ROLES, stickDeflection, type Deflection, type StickRole, type StickSide } from "../graph3d/joysticks";

interface Stick {
	base: HTMLElement;
	knob: HTMLElement;
	/** The pointer holding the stick, if one is. */
	pointerId: number | null;
	deflection: Deflection;
}

export class Graph3DSticks {
	private readonly toggleEl: HTMLElement;
	private readonly sticks: Record<StickSide, Stick>;
	private shown = false;

	/**
	 * `corner` holds the toggle. It shows only where there is a touch screen,
	 * desktops with one included; elsewhere the keys and mouse do this job.
	 * The sticks start shown when `shown` says so (and the toggle is there).
	 */
	constructor(container: HTMLElement, corner: HTMLElement, shown: boolean, private readonly onToggle: (shown: boolean) => void) {
		const touchCapable = Platform.isMobile || navigator.maxTouchPoints > 0;
		this.toggleEl = corner.createDiv({ cls: "osmosis-graph3d-sticks-toggle clickable-icon" });
		this.toggleEl.toggleClass("is-hidden", !touchCapable);
		setIcon(this.toggleEl, "gamepad-2");
		setTooltip(this.toggleEl, "Walk and fly joysticks");
		this.toggleEl.addEventListener("click", () => {
			this.show(!this.shown);
			this.onToggle(this.shown);
		});
		this.sticks = { left: this.createStick(container, "left"), right: this.createStick(container, "right") };
		this.show(shown && touchCapable);
	}

	/** The look stick's deflection now. */
	get look(): Deflection {
		return this.read("look");
	}

	/** The move stick's deflection now. */
	get move(): Deflection {
		return this.read("move");
	}

	private read(role: StickRole): Deflection {
		const side = (Object.keys(STICK_ROLES) as StickSide[]).find((s) => STICK_ROLES[s] === role);
		return side === undefined ? CENTRED : this.sticks[side].deflection;
	}

	private show(shown: boolean): void {
		this.shown = shown;
		this.toggleEl.toggleClass("is-active", shown);
		this.toggleEl.setAttr("aria-pressed", String(shown));
		for (const stick of Object.values(this.sticks)) {
			stick.base.toggleClass("is-hidden", !shown);
			if (!shown) this.release(stick);
		}
	}

	private createStick(container: HTMLElement, side: StickSide): Stick {
		const base = container.createDiv({ cls: `osmosis-graph3d-stick is-${side}` });
		const stick: Stick = { base, knob: base.createDiv({ cls: "osmosis-graph3d-stick-knob" }), pointerId: null, deflection: CENTRED };
		base.addEventListener("pointerdown", (e) => {
			if (stick.pointerId !== null) return;
			e.preventDefault();
			stick.pointerId = e.pointerId;
			base.setPointerCapture(e.pointerId);
			this.steer(stick, e);
		});
		base.addEventListener("pointermove", (e) => {
			if (e.pointerId === stick.pointerId) this.steer(stick, e);
		});
		const end = (e: PointerEvent) => {
			if (e.pointerId === stick.pointerId) this.release(stick);
		};
		base.addEventListener("pointerup", end);
		base.addEventListener("pointercancel", end);
		base.addEventListener("lostpointercapture", end);
		return stick;
	}

	/** Read the thumb's offset from the stick's centre; the knob follows it, up to the rim. */
	private steer(stick: Stick, e: PointerEvent): void {
		const rect = stick.base.getBoundingClientRect();
		const radius = rect.width / 2;
		const dx = e.clientX - (rect.left + radius);
		const dy = e.clientY - (rect.top + rect.height / 2);
		stick.deflection = stickDeflection(dx, dy, radius);
		const reach = Math.min(1, radius / Math.max(1, Math.hypot(dx, dy)));
		stick.knob.setCssStyles({ transform: `translate(${dx * reach}px, ${dy * reach}px)` });
	}

	private release(stick: Stick): void {
		if (stick.pointerId !== null && stick.base.hasPointerCapture(stick.pointerId)) stick.base.releasePointerCapture(stick.pointerId);
		stick.pointerId = null;
		stick.deflection = CENTRED;
		stick.knob.setCssStyles({ transform: "" });
	}
}
