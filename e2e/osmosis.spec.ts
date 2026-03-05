import { test, expect, Page } from "@playwright/test";
import {
	launchObsidian,
	disconnectObsidian,
	ObsidianApp,
	resetWorkspace,
	resetFixtures,
	openFile,
	openMindMap,
} from "./obsidian";

// ── Shared state ─────────────────────────────────────────────────────────────
// All tests run serially in one worker, sharing a single Obsidian instance.

let app: ObsidianApp;
let page: Page;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Click empty SVG space near the top-left corner to deselect all nodes. */
async function deselectAll(): Promise<void> {
	const svg = page.locator(".osmosis-mindmap-svg");
	const box = await svg.boundingBox();
	if (box) {
		await page.mouse.click(box.x + 2, box.y + 2);
		await page.waitForTimeout(200);
	}
}

/** Expand all collapsed branches by clicking every "+" toggle. */
async function expandAll(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		const collapsed = page.locator('.osmosis-collapse-icon:text("+")');
		if ((await collapsed.count()) === 0) break;
		await collapsed.first().locator("..").click();
		await page.waitForTimeout(200);
	}
}

/** Return the bounding box of the mind map SVG, or throw. */
async function svgBox() {
	const box = await page.locator(".osmosis-mindmap-svg").boundingBox();
	if (!box) throw new Error("SVG has no bounding box");
	return box;
}

/** Standard mind map setup: reset workspace, open fixture, open mind map view. */
async function setupMindMap(fixture = "test-note"): Promise<void> {
	await resetWorkspace(page);
	await openFile(page, fixture);
	await page.waitForTimeout(500);
	await openMindMap(page);
	await page.waitForTimeout(500);
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
	resetFixtures();
	app = await launchObsidian();
	page = app.page;
});

test.afterAll(async () => {
	if (app) {
		await resetWorkspace(page);
		await disconnectObsidian(app);
	}
});

// ── Task 2.1: Plugin & View Registration ─────────────────────────────────────

test.describe("Task 2.1: Plugin Registration", () => {
	test.beforeAll(async () => {
		await resetWorkspace(page);
	});

	test("plugin loads — ribbon icon is present", async () => {
		const ribbonIcon = page.locator(
			'.side-dock-ribbon-action[aria-label="Open mind map"]',
		);
		await expect(ribbonIcon).toBeVisible({ timeout: 10000 });
	});
});

// ── Task 2.2/2.3: Node Rendering ────────────────────────────────────────────

test.describe("Task 2.2/2.3: Node Rendering", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
	});

	test("open test file and mind map view", async () => {
		await expect(page.locator(".osmosis-mindmap-svg")).toBeVisible({
			timeout: 10000,
		});
	});

	test("SVG contains multiple node groups", async () => {
		const nodes = page.locator(".osmosis-node-group");
		await expect(nodes.first()).toBeVisible({ timeout: 5000 });
		expect(await nodes.count()).toBeGreaterThan(1);
	});

	test("heading nodes have correct type class", async () => {
		const headings = page.locator(".osmosis-node-group-heading");
		expect(await headings.count()).toBeGreaterThanOrEqual(2);
	});

	test("bullet nodes have correct type class", async () => {
		const bullets = page.locator(".osmosis-node-group-bullet");
		expect(await bullets.count()).toBeGreaterThanOrEqual(4);
	});

	test("every node has a data-node-id attribute", async () => {
		const nodes = page.locator(".osmosis-node-group");
		const count = await nodes.count();
		for (let i = 0; i < count; i++) {
			await expect(nodes.nth(i)).toHaveAttribute("data-node-id", /.+/);
		}
	});

	test("nodes contain rendered Markdown content", async () => {
		const texts = await page.locator(".osmosis-node-content").allTextContents();
		expect(texts.some((t) => t.includes("Section A"))).toBe(true);
	});
});

// ── Task 2.4: Branch Lines ──────────────────────────────────────────────────

test.describe("Task 2.4: Branch Lines", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
	});

	test("branch lines connect nodes", async () => {
		const lines = page.locator(".osmosis-branch-line");
		expect(await lines.count()).toBeGreaterThan(0);
	});
});

// ── Task 2.5: Pan & Zoom ───────────────────────────────────────────────────

test.describe("Task 2.5: Pan & Zoom", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
	});

	test("mouse wheel changes zoom (viewBox changes)", async () => {
		const svg = page.locator(".osmosis-mindmap-svg");
		const initial = await svg.getAttribute("viewBox");

		const box = await svgBox();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.wheel(0, -300);
		await page.waitForTimeout(300);

		expect(await svg.getAttribute("viewBox")).not.toBe(initial);
	});

	test("drag on empty space pans the view", async () => {
		const svg = page.locator(".osmosis-mindmap-svg");
		const initial = await svg.getAttribute("viewBox");

		const box = await svgBox();
		const sx = box.x + 5;
		const sy = box.y + 5;

		await page.mouse.move(sx, sy);
		await page.mouse.down();
		await page.mouse.move(sx + 100, sy + 50, { steps: 5 });
		await page.mouse.up();
		await page.waitForTimeout(200);

		expect(await svg.getAttribute("viewBox")).not.toBe(initial);
	});
});

// ── Task 2.6: Collapse & Expand ─────────────────────────────────────────────

test.describe("Task 2.6: Collapse & Expand", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
		await expandAll();
	});

	test("collapse toggles exist on parent nodes", async () => {
		const toggles = page.locator(".osmosis-collapse-toggle");
		expect(await toggles.count()).toBeGreaterThanOrEqual(2);
	});

	test("clicking collapse toggle hides children", async () => {
		await expandAll();
		const nodesBefore = await page.locator(".osmosis-node-group").count();

		const toggle = page.locator(".osmosis-collapse-toggle").first();
		await toggle.click();
		await page.waitForTimeout(300);

		const nodesAfter = await page.locator(".osmosis-node-group").count();
		expect(nodesAfter).toBeLessThan(nodesBefore);

		// Icon should show "+"
		await expect(toggle.locator(".osmosis-collapse-icon")).toHaveText("+");

		// Re-expand for subsequent tests
		await toggle.click();
		await page.waitForTimeout(300);
	});

	test("clicking collapse toggle again re-expands children", async () => {
		await expandAll();
		const nodesBefore = await page.locator(".osmosis-node-group").count();

		const toggle = page.locator(".osmosis-collapse-toggle").first();
		await toggle.click();
		await page.waitForTimeout(300);
		await toggle.click();
		await page.waitForTimeout(300);

		expect(await page.locator(".osmosis-node-group").count()).toBe(nodesBefore);
		const icon = toggle.locator(".osmosis-collapse-icon");
		expect(await icon.textContent()).toBe("\u2212"); // minus sign
	});

	test("Space bar toggles collapse on selected node", async () => {
		await expandAll();
		await deselectAll();

		// Select a non-root parent node (second one with a collapse toggle)
		const parentsWithToggle = page.locator(
			".osmosis-node-group:has(.osmosis-collapse-toggle)",
		);
		const parentCount = await parentsWithToggle.count();
		const parentNode =
			parentCount > 1 ? parentsWithToggle.nth(1) : parentsWithToggle.first();
		await parentNode.click();
		await page.waitForTimeout(200);

		const container = page.locator(".osmosis-mindmap-container");
		const nodesBefore = await page.locator(".osmosis-node-group").count();

		// Collapse via Space — focus container first to ensure keydown fires
		await container.focus();
		await page.keyboard.press("Space");
		await page.waitForTimeout(400);
		const nodesAfterCollapse = await page
			.locator(".osmosis-node-group")
			.count();
		expect(nodesAfterCollapse).toBeLessThan(nodesBefore);

		// Expand via Space — container should still have focus, selection persists
		await container.focus();
		await page.keyboard.press("Space");
		await page.waitForTimeout(400);
		expect(await page.locator(".osmosis-node-group").count()).toBe(nodesBefore);
	});
});

// ── Task 2.7: Selection & Keyboard Navigation ──────────────────────────────

test.describe("Task 2.7: Selection & Keyboard Nav", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
		await expandAll();
	});

	test("clicking a node selects it", async () => {
		await deselectAll();

		const node = page.locator(".osmosis-node-group").first();
		await node.click();
		await page.waitForTimeout(200);
		await expect(node).toHaveClass(/osmosis-node-selected/);
	});

	test("clicking empty space deselects all", async () => {
		const node = page.locator(".osmosis-node-group").first();
		await node.click();
		await page.waitForTimeout(200);
		await expect(node).toHaveClass(/osmosis-node-selected/);

		await deselectAll();
		await expect(node).not.toHaveClass(/osmosis-node-selected/);
	});

	test("clicking a different node moves selection", async () => {
		await deselectAll();
		const nodes = page.locator(".osmosis-node-group");
		const first = nodes.first();
		const second = nodes.nth(1);

		await first.click();
		await page.waitForTimeout(200);
		await expect(first).toHaveClass(/osmosis-node-selected/);

		await second.click();
		await page.waitForTimeout(200);
		await expect(second).toHaveClass(/osmosis-node-selected/);
		await expect(first).not.toHaveClass(/osmosis-node-selected/);
	});

	test("ArrowDown selects a node when none is selected", async () => {
		await deselectAll();
		const container = page.locator(".osmosis-mindmap-container");
		await container.click({ position: { x: 5, y: 5 } });
		await page.waitForTimeout(100);

		await container.press("ArrowDown");
		await page.waitForTimeout(300);

		await expect(page.locator(".osmosis-node-selected")).toBeVisible();
	});

	test("ArrowDown / ArrowUp navigate between siblings", async () => {
		await expandAll();
		await deselectAll();

		// Select the first heading child (Section A) which has a sibling (Section B)
		const headings = page.locator(".osmosis-node-group-heading");
		const sectionA = headings.nth(1); // nth(0) is root "Test Note"
		await sectionA.click();
		await page.waitForTimeout(200);
		const sectionAId = await sectionA.getAttribute("data-node-id");

		const container = page.locator(".osmosis-mindmap-container");
		await container.press("ArrowDown");
		await page.waitForTimeout(200);

		const downId = await page
			.locator(".osmosis-node-selected")
			.getAttribute("data-node-id");
		expect(downId).not.toBe(sectionAId);

		await container.press("ArrowUp");
		await page.waitForTimeout(200);

		const upId = await page
			.locator(".osmosis-node-selected")
			.getAttribute("data-node-id");
		expect(upId).toBe(sectionAId);
	});

	test("ArrowRight navigates to first child", async () => {
		await expandAll();
		await deselectAll();

		const parent = page
			.locator(".osmosis-node-group:has(.osmosis-collapse-toggle)")
			.first();
		await parent.click();
		await page.waitForTimeout(200);
		const parentId = await parent.getAttribute("data-node-id");

		const container = page.locator(".osmosis-mindmap-container");
		await container.press("ArrowRight");
		await page.waitForTimeout(200);

		const childId = await page
			.locator(".osmosis-node-selected")
			.getAttribute("data-node-id");
		expect(childId).not.toBe(parentId);
	});

	test("ArrowLeft navigates back to parent", async () => {
		await expandAll();
		await deselectAll();

		const parent = page
			.locator(".osmosis-node-group:has(.osmosis-collapse-toggle)")
			.first();
		await parent.click();
		await page.waitForTimeout(200);
		const parentId = await parent.getAttribute("data-node-id");

		const container = page.locator(".osmosis-mindmap-container");
		await container.press("ArrowRight");
		await page.waitForTimeout(200);
		await container.press("ArrowLeft");
		await page.waitForTimeout(200);

		const selectedId = await page
			.locator(".osmosis-node-selected")
			.getAttribute("data-node-id");
		expect(selectedId).toBe(parentId);
	});
});

// ── Task 2.7: Inline Editing ────────────────────────────────────────────────

test.describe("Task 2.7: Inline Editing", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
		await expandAll();
	});

	test("double-click opens inline editor", async () => {
		await deselectAll();
		const node = page.locator(".osmosis-node-group-bullet").first();
		await node.dblclick({ force: true });
		await page.waitForTimeout(300);

		const input = page.locator(".osmosis-node-input");
		await expect(input).toBeVisible({ timeout: 5000 });
		await expect(input).toBeFocused();

		await input.press("Escape");
		await page.waitForTimeout(200);
	});

	test("Enter key opens inline editor on selected node", async () => {
		await deselectAll();
		const node = page.locator(".osmosis-node-group-bullet").first();
		await node.click({ force: true });
		await page.waitForTimeout(200);

		await page.locator(".osmosis-mindmap-container").press("Enter");
		await page.waitForTimeout(300);

		const input = page.locator(".osmosis-node-input");
		await expect(input).toBeVisible({ timeout: 5000 });

		await input.press("Escape");
		await page.waitForTimeout(200);
	});

	test("F2 opens inline editor on selected node", async () => {
		await deselectAll();
		const node = page.locator(".osmosis-node-group-bullet").first();
		await node.click({ force: true });
		await page.waitForTimeout(200);

		await page.locator(".osmosis-mindmap-container").press("F2");
		await page.waitForTimeout(300);

		const input = page.locator(".osmosis-node-input");
		await expect(input).toBeVisible({ timeout: 5000 });

		await input.press("Escape");
		await page.waitForTimeout(200);
	});

	test("Escape cancels edit without saving", async () => {
		await deselectAll();
		const node = page.locator(".osmosis-node-group-bullet").first();
		const original = await node.locator(".osmosis-node-content").textContent();

		await node.dblclick({ force: true });
		await page.waitForTimeout(300);

		const input = page.locator(".osmosis-node-input");
		await expect(input).toBeVisible();
		await input.fill("SHOULD NOT BE SAVED");
		await input.press("Escape");
		await page.waitForTimeout(500);

		const after = await node.locator(".osmosis-node-content").textContent();
		expect(after).toBe(original);
	});
});

// ── Task 2.10: Cursor Sync ──────────────────────────────────────────────────

test.describe("Task 2.10: Cursor Sync", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
		await expandAll();
	});

	test("clicking a map node highlights it (cursor sync)", async () => {
		await deselectAll();
		const heading = page.locator(".osmosis-node-group-heading").first();
		await heading.click();
		await page.waitForTimeout(500);
		await expect(heading).toHaveClass(/osmosis-node-selected/);
	});
});

// ── Task 2.11: Drag-and-Drop ────────────────────────────────────────────────

test.describe("Task 2.11: Drag-and-Drop", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
		await expandAll();
	});

	test("dragging a node beyond threshold shows drag ghost", async () => {
		await deselectAll();
		const node = page.locator(".osmosis-node-group-bullet").first();
		const box = await node.boundingBox();
		if (!box) throw new Error("Node has no bounding box");

		const cx = box.x + box.width / 2;
		const cy = box.y + box.height / 2;

		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx + 20, cy + 20, { steps: 5 });
		await page.waitForTimeout(200);

		const ghost = page.locator(".osmosis-drag-ghost");
		await expect(ghost).toBeVisible({ timeout: 3000 });

		await expect(page.locator(".osmosis-mindmap-container")).toHaveClass(
			/osmosis-dragging/,
		);

		await page.mouse.up();
		await page.waitForTimeout(300);

		await expect(ghost).not.toBeVisible();
		await expect(page.locator(".osmosis-mindmap-container")).not.toHaveClass(
			/osmosis-dragging/,
		);
	});

	test("drop indicator appears when dragging over another node", async () => {
		await deselectAll();
		const bullets = page.locator(".osmosis-node-group-bullet");
		if ((await bullets.count()) < 2) {
			test.skip();
			return;
		}

		const first = await bullets.first().boundingBox();
		const second = await bullets.nth(1).boundingBox();
		if (!first || !second) throw new Error("Nodes have no bounding box");

		await page.mouse.move(
			first.x + first.width / 2,
			first.y + first.height / 2,
		);
		await page.mouse.down();
		// Drag to just past the bottom edge of the second node so the "insert after"
		// drop position wins — this avoids isSamePosition filtering (inserting before
		// the immediate next sibling is treated as a no-op).
		await page.mouse.move(
			second.x + second.width / 2,
			second.y + second.height + 5,
			{ steps: 10 },
		);
		await page.waitForTimeout(300);

		// SVG <line> elements have near-zero bounding box height, so Playwright's
		// toBeVisible() doesn't work reliably. Check the display attribute instead.
		const indicator = page.locator(".osmosis-drop-indicator");
		await expect(indicator).not.toHaveAttribute("display", "none", {
			timeout: 3000,
		});

		await page.mouse.up();
		await page.waitForTimeout(300);

		await expect(indicator).toHaveCount(0);
	});
});

// ── Task 2.12: Multi-Node Selection ─────────────────────────────────────────

test.describe("Task 2.12: Multi-Node Selection", () => {
	test.beforeAll(async () => {
		await setupMindMap("test-note");
		await expandAll();
	});

	test("Shift+click adds to selection", async () => {
		await deselectAll();
		const nodes = page.locator(".osmosis-node-group");

		await nodes.nth(0).click();
		await page.waitForTimeout(200);
		await nodes.nth(1).click({ modifiers: ["Shift"] });
		await page.waitForTimeout(200);

		await expect(nodes.nth(0)).toHaveClass(/osmosis-node-selected/);
		await expect(nodes.nth(1)).toHaveClass(/osmosis-node-selected/);
	});

	test("Ctrl+A selects all visible nodes", async () => {
		await deselectAll();
		const container = page.locator(".osmosis-mindmap-container");
		await container.click({ position: { x: 10, y: 10 } });
		await page.waitForTimeout(100);

		await container.press("Control+a");
		await page.waitForTimeout(300);

		const total = await page.locator(".osmosis-node-group").count();
		const selected = await page.locator(".osmosis-node-selected").count();
		expect(selected).toBe(total);
	});

	test("Shift+click deselects an already-selected node", async () => {
		await deselectAll();
		const nodes = page.locator(".osmosis-node-group");

		await nodes.nth(0).click();
		await page.waitForTimeout(200);
		await nodes.nth(1).click({ modifiers: ["Shift"] });
		await page.waitForTimeout(200);

		// Shift+click node 0 again to deselect it
		await nodes.nth(0).click({ modifiers: ["Shift"] });
		await page.waitForTimeout(200);

		await expect(nodes.nth(0)).not.toHaveClass(/osmosis-node-selected/);
		await expect(nodes.nth(1)).toHaveClass(/osmosis-node-selected/);
	});

	test("Shift+drag rubber-band selects multiple nodes", async () => {
		await deselectAll();
		const box = await svgBox();

		await page.keyboard.down("Shift");
		await page.mouse.move(box.x + 2, box.y + 2);
		await page.mouse.down();
		await page.mouse.move(
			box.x + box.width * 0.8,
			box.y + box.height * 0.8,
			{ steps: 5 },
		);
		await page.waitForTimeout(200);

		const rubberBand = page.locator(".osmosis-rubber-band");
		await expect(rubberBand).toBeVisible({ timeout: 3000 });

		await page.mouse.up();
		await page.keyboard.up("Shift");
		await page.waitForTimeout(300);

		await expect(rubberBand).not.toBeVisible();
		expect(await page.locator(".osmosis-node-selected").count()).toBeGreaterThan(
			0,
		);
	});
});

// ── Task 2.13: Viewport Culling ─────────────────────────────────────────────

test.describe("Task 2.13: Viewport Culling", () => {
	test.beforeAll(async () => {
		await setupMindMap("large-map");
	});

	test("large map renders fewer DOM nodes than total", async () => {
		// The large-map has 50 sections x 20 items = 1050 nodes total.
		// With culling, the DOM should contain far fewer than all 1050.
		const domNodeCount = await page.locator(".osmosis-node-group").count();
		expect(domNodeCount).toBeGreaterThan(0);
		expect(domNodeCount).toBeLessThan(1050);
	});

	test("panning reveals new nodes in the DOM", async () => {
		const svg = page.locator(".osmosis-mindmap-svg");
		const box = await svg.boundingBox();
		if (!box) throw new Error("SVG has no bounding box");

		const beforeIds = await page.locator(".osmosis-node-group").evaluateAll(
			(els) => els.map((el) => el.getAttribute("data-node-id")),
		);

		// Pan downward by dragging on empty space (left-click on background)
		// The map is arranged vertically, so panning down reveals new sections.
		const cx = box.x + box.width / 2;
		const cy = box.y + box.height / 2;
		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx, cy - 400, { steps: 10 });
		await page.mouse.up();
		await page.waitForTimeout(800);

		const afterIds = await page.locator(".osmosis-node-group").evaluateAll(
			(els) => els.map((el) => el.getAttribute("data-node-id")),
		);

		// After panning, at least some nodes should be different
		const beforeSet = new Set(beforeIds);
		const newNodes = afterIds.filter((id) => !beforeSet.has(id));
		expect(newNodes.length).toBeGreaterThan(0);
	});

	test("branch lines use data-child-id attribute", async () => {
		const lines = page.locator(".osmosis-branch-line[data-child-id]");
		expect(await lines.count()).toBeGreaterThan(0);
	});
});

// ── Task 3.1: Transclusion Link Resolution ──────────────────────────────────

test.describe("Task 3.1: Transclusion Link Resolution", () => {
	test.beforeAll(async () => {
		await setupMindMap("transclusion-source");
	});

	test("transclusion nodes appear in the mind map", async () => {
		const transclusionNodes = page.locator(".osmosis-node-group-transclusion");
		expect(await transclusionNodes.count()).toBeGreaterThanOrEqual(2);
	});

	test("wiki-link transclusion resolves to target file", async () => {
		// The first transclusion ![[transclusion-target]] should resolve
		const resolved = page.locator(
			'.osmosis-node-group-transclusion.osmosis-node-resolved[data-source-file="transclusion-target.md"]',
		);
		expect(await resolved.count()).toBeGreaterThanOrEqual(1);
	});

	test("markdown-style transclusion resolves to target file", async () => {
		// ![](transclusion-target.md) should also resolve
		const resolved = page.locator(
			'.osmosis-node-group-transclusion.osmosis-node-resolved',
		);
		expect(await resolved.count()).toBeGreaterThanOrEqual(2);
	});

	test("missing file transclusion is marked unresolved", async () => {
		const unresolved = page.locator(
			".osmosis-node-group-transclusion.osmosis-node-unresolved",
		);
		expect(await unresolved.count()).toBeGreaterThanOrEqual(1);
	});
});

// ── Task 3.2: Embedded Sub-Tree Rendering ───────────────────────────────────

test.describe("Task 3.2: Embedded Sub-Tree Rendering", () => {
	test.beforeAll(async () => {
		await setupMindMap("transclusion-source");
	});

	test("resolved transclusion expands target content as child nodes", async () => {
		// The ![[transclusion-target]] node should have children from the target file
		const resolved = page.locator(
			'.osmosis-node-group-transclusion.osmosis-node-resolved[data-source-file="transclusion-target.md"]',
		);
		expect(await resolved.count()).toBeGreaterThanOrEqual(1);

		// Transcluded children from target file should appear in the SVG.
		// Some may be off-screen due to viewport culling, so check for
		// specific transcluded nodes rather than total count.
		const transcludedNodes = page.locator(
			'[data-source-file="transclusion-target.md"]',
		);
		// At minimum: the transclusion node itself + some expanded children
		expect(await transcludedNodes.count()).toBeGreaterThanOrEqual(2);
	});

	test("transcluded children are marked with sourceFile", async () => {
		// Zoom out so culled transcluded children come into the viewport
		const box = await svgBox();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		for (let i = 0; i < 5; i++) {
			await page.mouse.wheel(0, 300);
			await page.waitForTimeout(100);
		}
		await page.waitForTimeout(500);

		// After zooming out, transcluded children should be visible
		const transcludedChildren = page.locator(
			'[data-source-file="transclusion-target.md"]:not(.osmosis-node-group-transclusion)',
		);
		expect(await transcludedChildren.count()).toBeGreaterThan(0);
	});

	test("recursive embedding works (A→B chain)", async () => {
		await setupMindMap("transclusion-chain-a");

		// Chain A embeds B. B has "Deep item from B".
		// Verify B's content appears as transcluded nodes.
		const transcludedFromB = page.locator(
			'[data-source-file="transclusion-chain-b.md"]',
		);
		// At least the transclusion node itself should be visible
		expect(await transcludedFromB.count()).toBeGreaterThanOrEqual(1);
	});

	test("transclusion node is collapsible", async () => {
		await setupMindMap("transclusion-source");

		// Resolved transclusion nodes with children should have a collapse toggle
		const resolved = page.locator(
			".osmosis-node-group-transclusion.osmosis-node-resolved",
		);
		expect(await resolved.count()).toBeGreaterThanOrEqual(1);

		// Find a collapse toggle within the first resolved transclusion
		const firstResolved = resolved.first();
		const toggle = firstResolved.locator(".osmosis-collapse-toggle");
		expect(await toggle.count()).toBe(1);
	});
});
