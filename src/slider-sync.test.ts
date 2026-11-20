import { describe, expect, it, vi } from "vitest";
import { bindSlider, type SyncableSlider } from "./slider-sync";

/** Mirrors Obsidian's SliderComponent: setValue fires the callback only when the value changes. */
class FakeSlider implements SyncableSlider {
	value = 0;
	private callback: ((value: number) => unknown) | null = null;
	setValue(value: number): this {
		if (this.value !== value) {
			this.value = value;
			this.callback?.(value);
		}
		return this;
	}
	onChange(callback: (value: number) => unknown): this {
		this.callback = callback;
		return this;
	}
	/** The user drags and releases the knob. */
	release(value: number): void {
		this.value = value;
		this.callback?.(value);
	}
}

describe("bindSlider", () => {
	it("passes the user's release through to the handler", () => {
		const slider = new FakeSlider();
		const onUserChange = vi.fn();
		bindSlider(slider, onUserChange);
		slider.release(4);
		expect(onUserChange).toHaveBeenCalledWith(4);
	});

	it("shows a stored value without writing it back", () => {
		const slider = new FakeSlider();
		const onUserChange = vi.fn();
		const show = bindSlider(slider, onUserChange);
		show(6);
		expect(slider.value).toBe(6);
		expect(onUserChange).not.toHaveBeenCalled();
	});

	it("still hears the user after a refresh", () => {
		const slider = new FakeSlider();
		const onUserChange = vi.fn();
		const show = bindSlider(slider, onUserChange);
		show(6);
		slider.release(2);
		expect(onUserChange).toHaveBeenCalledOnce();
		expect(onUserChange).toHaveBeenCalledWith(2);
	});

	it("re-arms the guard when setValue throws", () => {
		const slider = new FakeSlider();
		const onUserChange = vi.fn();
		const show = bindSlider(slider, onUserChange);
		vi.spyOn(slider, "setValue").mockImplementationOnce(() => {
			throw new Error("detached");
		});
		expect(() => show(3)).toThrow("detached");
		slider.release(5);
		expect(onUserChange).toHaveBeenCalledWith(5);
	});
});
