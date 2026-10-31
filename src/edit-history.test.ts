import { describe, expect, it } from "vitest";
import { EditHistory, EditRecorder, type HistoryLimits } from "./edit-history";
import type { FileEdit } from "./mindmap-edit";

const LOOSE: HistoryLimits = { maxSteps: 50, maxMemoryMB: 20 };

function setup(limits: HistoryLimits = LOOSE): { history: EditHistory; recorder: (owner: string | null) => EditRecorder } {
	const history = new EditHistory(() => limits);
	return { history, recorder: (owner) => new EditRecorder(history, () => owner) };
}

function edit(path: string, before: string, after: string): FileEdit {
	return { path, before, after };
}

/**
 * These pin what the 2D mind map did with its own per-view stacks before the
 * history was shared: one view, one owner, every entry filed under it.
 */
describe("EditHistory: one view (the 2D map's old behaviour)", () => {
	it("undoes newest first, and redoes in the order undone", () => {
		const { history, recorder } = setup();
		const map = recorder("Harbour.md");
		map.record("Harbour.md", "a", "b");
		map.record("Harbour.md", "b", "c");
		expect(history.undo("Harbour.md")).toEqual({ ok: true, edits: [edit("Harbour.md", "b", "c")] });
		expect(history.undo("Harbour.md")).toEqual({ ok: true, edits: [edit("Harbour.md", "a", "b")] });
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
		expect(history.redo("Harbour.md")).toEqual({ ok: true, edits: [edit("Harbour.md", "a", "b")] });
		expect(history.redo("Harbour.md")).toEqual({ ok: true, edits: [edit("Harbour.md", "b", "c")] });
		expect(history.redo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("ignores a write that changed nothing", () => {
		const { history, recorder } = setup();
		recorder("Harbour.md").record("Harbour.md", "same", "same");
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("clears redo on a fresh edit", () => {
		const { history, recorder } = setup();
		const map = recorder("Harbour.md");
		map.record("Harbour.md", "a", "b");
		history.undo("Harbour.md");
		map.record("Harbour.md", "a", "z");
		expect(history.redo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("files an edit to a transcluded note under the map's own note too", () => {
		const { history, recorder } = setup();
		const map = recorder("Harbour.md");
		map.record("Knots.md", "k1", "k2");
		map.record("Harbour.md", "h1", "h2");
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Harbour.md", "h1", "h2")] });
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Knots.md", "k1", "k2")] });
	});

	it("keeps at most maxSteps entries, dropping the oldest", () => {
		const { history, recorder } = setup({ maxSteps: 2, maxMemoryMB: 20 });
		const map = recorder("Harbour.md");
		map.record("Harbour.md", "a", "b");
		map.record("Harbour.md", "b", "c");
		map.record("Harbour.md", "c", "d");
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true });
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Harbour.md", "b", "c")] });
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("treats a step limit below one as one", () => {
		const { history, recorder } = setup({ maxSteps: 0, maxMemoryMB: 20 });
		const map = recorder("Harbour.md");
		map.record("Harbour.md", "a", "b");
		map.record("Harbour.md", "b", "c");
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Harbour.md", "b", "c")] });
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("drops the oldest entries past the memory limit, but always keeps the newest", () => {
		const { history, recorder } = setup({ maxSteps: 50, maxMemoryMB: 1 });
		const map = recorder("Harbour.md");
		// An entry costs (before + after) × 2 bytes: 0.4 MB, then 0.8 MB.
		const big = "x".repeat(200_000);
		map.record("Harbour.md", "a", big);
		map.record("Harbour.md", big, big + "y");
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true });
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });

		const huge = "x".repeat(1_000_000);
		map.record("Harbour.md", "a", huge);
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true });
	});

	it("does not trim on redo", () => {
		const { history, recorder } = setup({ maxSteps: 1, maxMemoryMB: 20 });
		const map = recorder("Harbour.md");
		map.record("Harbour.md", "a", "b");
		history.undo("Harbour.md");
		history.redo("Harbour.md");
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true });
	});

	it("clears a file's history when the map lets go of it", () => {
		const { history, recorder } = setup();
		const release = history.hold("Harbour.md");
		recorder("Harbour.md").record("Harbour.md", "a", "b");
		history.undo("Harbour.md");
		recorder("Harbour.md").record("Harbour.md", "a", "c");
		release();
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
		expect(history.redo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});
});

describe("EditRecorder", () => {
	it("coalesces a live edit into one entry from the first before to the last after", () => {
		const { history, recorder } = setup();
		const map = recorder("Harbour.md");
		map.beginLive();
		expect(map.live).toBe(true);
		map.record("Harbour.md", "a", "b");
		map.record("Harbour.md", "b", "c");
		map.record("Knots.md", "k1", "k2");
		map.endLive();
		expect(map.live).toBe(false);
		expect(history.undo("Harbour.md")).toEqual({ ok: true, edits: [edit("Harbour.md", "a", "c")] });
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
		expect(history.undo("Knots.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("records nothing for a live edit with no writes, and ignores a stray end", () => {
		const { history, recorder } = setup();
		const map = recorder("Harbour.md");
		map.endLive();
		map.beginLive();
		map.endLive();
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("collects a group into one entry across files, in first-written order", () => {
		const { history, recorder } = setup();
		const map = recorder("Harbour.md");
		map.beginGroup();
		expect(map.grouping).toBe(true);
		map.record("Knots.md", "k1", "k2");
		map.record("Harbour.md", "h1", "h2");
		map.record("Knots.md", "k2", "k3");
		map.endGroup();
		expect(map.grouping).toBe(false);
		expect(history.undo("Harbour.md")).toEqual({
			ok: true,
			edits: [edit("Knots.md", "k1", "k3"), edit("Harbour.md", "h1", "h2")],
		});
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("drops a group whose net change is nil", () => {
		const { history, recorder } = setup();
		const map = recorder("Harbour.md");
		map.beginGroup();
		map.record("Harbour.md", "a", "b");
		map.record("Harbour.md", "b", "a");
		map.endGroup();
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("files an entry under the first written file when it has no owner", () => {
		const { history, recorder } = setup();
		recorder(null).record("Knots.md", "k1", "k2");
		expect(history.undo("Knots.md")).toMatchObject({ ok: true });
	});
});

describe("EditHistory: shared between views", () => {
	it("undoes another view's edit to the same note", () => {
		const { history, recorder } = setup();
		const map2d = recorder("Harbour.md");
		const graph3d = recorder("Harbour.md");
		map2d.record("Harbour.md", "a", "b");
		graph3d.record("Harbour.md", "b", "c");
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Harbour.md", "b", "c")] });
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Harbour.md", "a", "b")] });
	});

	it("lets a note's own history undo a 2D edit made through an embed", () => {
		const { history, recorder } = setup();
		recorder("Harbour.md").record("Knots.md", "k1", "k2");
		expect(history.undo("Knots.md")).toMatchObject({ ok: true, edits: [edit("Knots.md", "k1", "k2")] });
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("blocks an undo while a newer edit shares one of its files", () => {
		const { history, recorder } = setup();
		recorder("Harbour.md").record("Knots.md", "k1", "k2"); // 2D map of Harbour, through its embed of Knots
		recorder("Knots.md").record("Knots.md", "k2", "k3"); // 3D, on a Knots line
		expect(history.undo("Harbour.md")).toEqual({ ok: false, reason: "blocked", path: "Knots.md" });
		expect(history.undo("Knots.md")).toMatchObject({ ok: true, edits: [edit("Knots.md", "k2", "k3")] });
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Knots.md", "k1", "k2")] });
	});

	it("blocks a redo until the edits undone after it are redone", () => {
		const { history, recorder } = setup();
		recorder("Knots.md").record("Knots.md", "k1", "k2"); // older, 3D
		recorder("Harbour.md").record("Knots.md", "k2", "k3"); // newer, 2D via embed
		history.undo("Harbour.md");
		history.undo("Knots.md");
		// Knots' own redo comes first (it is the older edit), then the 2D one.
		expect(history.redo("Harbour.md")).toEqual({ ok: false, reason: "blocked", path: "Knots.md" });
		expect(history.redo("Knots.md")).toMatchObject({ ok: true, edits: [edit("Knots.md", "k1", "k2")] });
		expect(history.redo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Knots.md", "k2", "k3")] });
	});

	it("leaves other notes' entries alone", () => {
		const { history, recorder } = setup();
		recorder("Harbour.md").record("Harbour.md", "a", "b");
		recorder("Knots.md").record("Knots.md", "k1", "k2");
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true, edits: [edit("Harbour.md", "a", "b")] });
		expect(history.undo("Knots.md")).toMatchObject({ ok: true, edits: [edit("Knots.md", "k1", "k2")] });
	});

	it("clears only the redo entries a fresh edit shares a file with", () => {
		const { history, recorder } = setup();
		recorder("Harbour.md").record("Harbour.md", "a", "b");
		recorder("Knots.md").record("Knots.md", "k1", "k2");
		history.undo("Harbour.md");
		history.undo("Knots.md");
		recorder("Knots.md").record("Knots.md", "k1", "k9");
		expect(history.redo("Knots.md")).toEqual({ ok: false, reason: "empty" });
		expect(history.redo("Harbour.md")).toMatchObject({ ok: true });
	});

	it("applies the step limit per note", () => {
		const { history, recorder } = setup({ maxSteps: 1, maxMemoryMB: 20 });
		recorder("Harbour.md").record("Harbour.md", "a", "b");
		recorder("Knots.md").record("Knots.md", "k1", "k2");
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true });
		expect(history.undo("Knots.md")).toMatchObject({ ok: true });
	});

	it("keeps a note's history while another view still holds it", () => {
		const { history, recorder } = setup();
		const release2d = history.hold("Harbour.md");
		const release3d = history.hold("Harbour.md");
		recorder("Harbour.md").record("Harbour.md", "a", "b");
		release2d();
		release2d(); // a second release from the same holder counts once
		expect(history.undo("Harbour.md")).toMatchObject({ ok: true });
		release3d();
		expect(history.redo("Harbour.md")).toEqual({ ok: false, reason: "empty" });
	});

	it("drops every entry touching a released note, wherever it is filed", () => {
		const { history, recorder } = setup();
		const release = history.hold("Harbour.md");
		history.hold("Knots.md");
		recorder("Harbour.md").record("Knots.md", "k1", "k2");
		release();
		expect(history.undo("Knots.md")).toEqual({ ok: false, reason: "empty" });
	});
});
