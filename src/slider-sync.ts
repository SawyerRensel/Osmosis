/**
 * The part of Obsidian's `SliderComponent` the style sidebar drives. Typed
 * structurally so this module stays free of runtime `obsidian` imports.
 */
export interface SyncableSlider {
	setValue(value: number): unknown;
	onChange(callback: (value: number) => unknown): unknown;
}

/** Shows a stored value on a slider bound by {@link bindSlider}, without writing it back. */
export type ShowSliderValue = (value: number) => void;

/**
 * Wire a slider so `onUserChange` runs only for the user's own changes, and
 * return a setter that shows a stored value on it without writing it back.
 *
 * The setter goes through `SliderComponent.setValue`, which is what moves the
 * knob *and* the inline number and filled track together. Writing
 * `sliderEl.value` directly moves the knob alone, so the three disagree. But
 * `setValue` also fires the change callback whenever the value differs, which
 * would turn every refresh into a write; the guard swallows that call.
 */
export function bindSlider(
	slider: SyncableSlider,
	onUserChange: (value: number) => unknown,
): ShowSliderValue {
	let syncing = false;
	slider.onChange((value) => {
		if (syncing) return;
		return onUserChange(value);
	});
	return (value) => {
		syncing = true;
		try {
			slider.setValue(value);
		} finally {
			syncing = false;
		}
	};
}
