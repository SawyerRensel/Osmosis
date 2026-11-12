import { describe, expect, it } from "vitest";
import { cleanLastMapView } from "./last-map-view";

describe("cleanLastMapView", () => {
	it("keeps 3d and 2d", () => {
		expect(cleanLastMapView("3d")).toBe("3d");
		expect(cleanLastMapView("2d")).toBe("2d");
	});

	it("falls back to 2D when nothing valid is stored", () => {
		expect(cleanLastMapView(null)).toBe("2d");
		expect(cleanLastMapView(undefined)).toBe("2d");
		expect(cleanLastMapView("3D")).toBe("2d");
		expect(cleanLastMapView(3)).toBe("2d");
		expect(cleanLastMapView({})).toBe("2d");
	});
});
