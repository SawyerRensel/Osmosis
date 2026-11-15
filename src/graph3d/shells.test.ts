import { describe, expect, it } from "vitest";
import { grabRadius, SHELL_FADE_FAR, SHELL_FADE_NEAR, shellFade } from "./shells";

describe("shellFade", () => {
	it("shows a shell fully from afar and hides it close to or inside it", () => {
		expect(shellFade(SHELL_FADE_FAR * 50, 50)).toBe(1);
		expect(shellFade(1000, 50)).toBe(1);
		expect(shellFade(SHELL_FADE_NEAR * 50, 50)).toBe(0);
		expect(shellFade(50, 50)).toBe(0);
		expect(shellFade(10, 50)).toBe(0);
		expect(shellFade(10, 0)).toBe(0);
	});

	it("fades smoothly and only one way as the camera nears", () => {
		let last = 1;
		for (let d = SHELL_FADE_FAR * 50; d >= SHELL_FADE_NEAR * 50; d -= 0.5) {
			const f = shellFade(d, 50);
			expect(f).toBeLessThanOrEqual(last + 1e-12);
			last = f;
		}
		expect(shellFade(((SHELL_FADE_NEAR + SHELL_FADE_FAR) / 2) * 50, 50)).toBeCloseTo(0.5, 9);
	});

	it("fades the outer of two shells first", () => {
		expect(shellFade(70, 60)).toBeLessThan(shellFade(70, 30));
	});
});

describe("grabRadius", () => {
	it("grabs the surface from outside it, as with one layer", () => {
		expect(grabRadius(200, 100, [40, 70])).toBe(100);
		expect(grabRadius(200, 100, [])).toBe(100);
	});

	it("grabs the outermost shell the camera is still outside of", () => {
		expect(grabRadius(90, 100, [40, 70])).toBe(70);
		expect(grabRadius(60, 100, [40, 70])).toBe(40);
	});

	it("keeps the surface inside the innermost shell", () => {
		expect(grabRadius(20, 100, [40, 70])).toBe(100);
		expect(grabRadius(20, 100, [])).toBe(100);
	});
});
