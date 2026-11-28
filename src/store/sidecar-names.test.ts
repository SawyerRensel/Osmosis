import { describe, expect, it } from "vitest";
import { SidecarNamer, sidecarNames } from "./sidecar-names";

const names = (...paths: string[]) => Object.fromEntries(sidecarNames(paths));

describe("sidecarNames", () => {
	it("names a note with a unique basename after the note alone", () => {
		expect(names("Sailing/Knots.md", "Tides.md")).toEqual({
			"Sailing/Knots.md": "Knots.osmosis.md",
			"Tides.md": "Tides.osmosis.md",
		});
	});

	it("qualifies every note sharing a basename with its parent folder", () => {
		expect(names("Travel/Pantry.md", "Home/Pantry.md", "Knots.md")).toEqual({
			"Travel/Pantry.md": "Travel.Pantry.osmosis.md",
			"Home/Pantry.md": "Home.Pantry.osmosis.md",
			"Knots.md": "Knots.osmosis.md",
		});
	});

	it("adds further folders, in path order, only while names still collide", () => {
		expect(names("Lisbon/Food/Pantry.md", "Porto/Food/Pantry.md", "Home/Pantry.md")).toEqual({
			"Lisbon/Food/Pantry.md": "Lisbon.Food.Pantry.osmosis.md",
			"Porto/Food/Pantry.md": "Porto.Food.Pantry.osmosis.md",
			"Home/Pantry.md": "Home.Pantry.osmosis.md",
		});
	});

	it("leaves a root note bare inside a collision: its whole path is the bare name", () => {
		expect(names("Pantry.md", "Travel/Pantry.md")).toEqual({
			"Pantry.md": "Pantry.osmosis.md",
			"Travel/Pantry.md": "Travel.Pantry.osmosis.md",
		});
	});

	it("treats basenames differing only by case as colliding", () => {
		expect(names("Galley/Knives.md", "Deck/knives.md")).toEqual({
			"Galley/Knives.md": "Galley.Knives.osmosis.md",
			"Deck/knives.md": "Deck.knives.osmosis.md",
		});
	});

	it("qualifies a dotted basename that would read as another note's qualified name", () => {
		expect(names("Sea/Travel.Pantry.md", "Travel/Pantry.md", "Home/Pantry.md")).toEqual({
			"Sea/Travel.Pantry.md": "Sea.Travel.Pantry.osmosis.md",
			"Travel/Pantry.md": "Travel.Pantry.osmosis.md",
			"Home/Pantry.md": "Home.Pantry.osmosis.md",
		});
	});

	it("falls back to a path hash when no folder is left to tell names apart", () => {
		const result = names("Travel.Pantry.md", "Travel/Pantry.md", "Home/Pantry.md");
		expect(result["Home/Pantry.md"]).toBe("Home.Pantry.osmosis.md");
		expect(result["Travel.Pantry.md"]).toMatch(/^Travel\.Pantry~[0-9a-f]{8}\.osmosis\.md$/);
		expect(result["Travel/Pantry.md"]).toMatch(/^Travel\.Pantry~[0-9a-f]{8}\.osmosis\.md$/);
		expect(result["Travel.Pantry.md"]).not.toBe(result["Travel/Pantry.md"]);
	});

	it("keeps .osmosis inside a basename unambiguous: only the final suffix is the marker", () => {
		expect(names("Logs/Crew.osmosis.md")).toEqual({ "Logs/Crew.osmosis.md": "Crew.osmosis.osmosis.md" });
	});

	it("depends on the set of paths, not their order", () => {
		const paths = ["A/X/Pantry.md", "B/X/Pantry.md", "C/Pantry.md", "Pantry.md"];
		expect(names(...paths)).toEqual(names(...[...paths].reverse()));
	});
});

describe("SidecarNamer", () => {
	it("re-qualifies the existing note when a collision appears, and back when it goes", () => {
		const namer = new SidecarNamer();
		namer.reset(["Travel/Pantry.md", "Knots.md"]);
		expect(namer.nameOf("Travel/Pantry.md")).toBe("Pantry.osmosis.md");

		expect(namer.add("Home/Pantry.md")).toEqual([
			{ path: "Travel/Pantry.md", from: "Pantry.osmosis.md", to: "Travel.Pantry.osmosis.md" },
			{ path: "Home/Pantry.md", from: null, to: "Home.Pantry.osmosis.md" },
		]);

		expect(namer.remove("Home/Pantry.md")).toEqual([
			{ path: "Home/Pantry.md", from: "Home.Pantry.osmosis.md", to: null },
			{ path: "Travel/Pantry.md", from: "Travel.Pantry.osmosis.md", to: "Pantry.osmosis.md" },
		]);
	});

	it("reports a rename as the old path leaving and the new one arriving, re-qualifying both partitions", () => {
		const namer = new SidecarNamer();
		namer.reset(["Travel/Pantry.md", "Home/Pantry.md", "Knives.md"]);
		const changes = namer.update(["Home/Pantry.md"], ["Home/Knives.md"]);
		expect(changes).toHaveLength(3);
		expect(changes).toEqual(expect.arrayContaining([
			{ path: "Home/Pantry.md", from: "Home.Pantry.osmosis.md", to: null },
			{ path: "Travel/Pantry.md", from: "Travel.Pantry.osmosis.md", to: "Pantry.osmosis.md" },
			{ path: "Home/Knives.md", from: null, to: "Home.Knives.osmosis.md" },
		]));
		// The root note keeps its bare name: nothing to report for it.
		expect(namer.nameOf("Knives.md")).toBe("Knives.osmosis.md");
	});

	it("finds a note from its sidecar's file name, case-insensitively", () => {
		const namer = new SidecarNamer();
		namer.reset(["Travel/Pantry.md", "Home/Pantry.md"]);
		expect(namer.noteOf("Travel.Pantry.osmosis.md")).toBe("Travel/Pantry.md");
		expect(namer.noteOf("travel.pantry.osmosis.md")).toBe("Travel/Pantry.md");
		expect(namer.noteOf("Pantry.osmosis.md")).toBeNull();
		namer.remove("Home/Pantry.md");
		expect(namer.noteOf("Pantry.osmosis.md")).toBe("Travel/Pantry.md");
		expect(namer.noteOf("Travel.Pantry.osmosis.md")).toBeNull();
	});

	it("ignores removing an unknown note and adding a known one", () => {
		const namer = new SidecarNamer();
		namer.reset(["Knots.md"]);
		expect(namer.remove("Tides.md")).toEqual([]);
		expect(namer.add("Knots.md")).toEqual([]);
	});

	it("matches the one-shot naming after any sequence of events", () => {
		const namer = new SidecarNamer();
		namer.reset(["A/X/Pantry.md", "Pantry.md"]);
		namer.add("B/X/Pantry.md");
		namer.update(["Pantry.md"], ["C/Pantry.md"]);
		namer.add("Travel.Pantry.md");
		const expected = sidecarNames(["A/X/Pantry.md", "B/X/Pantry.md", "C/Pantry.md", "Travel.Pantry.md"]);
		for (const [path, name] of expected) expect(namer.nameOf(path)).toBe(name);
	});
});
