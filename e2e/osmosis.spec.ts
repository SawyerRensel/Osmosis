import { test, expect, Page } from "@playwright/test";
import {
	launchObsidian,
	closeObsidian,
	ObsidianApp,
	resetWorkspace,
	openFile,
	openMindMap,
} from "./obsidian";

let app: ObsidianApp;

test.beforeAll(async () => {
	app = await launchObsidian();
	// Reset workspace to prevent tab/split accumulation from previous runs
	await resetWorkspace(app.page);
});

test.afterAll(async () => {
	if (app) {
		// Clean up splits so Obsidian doesn't reopen them next launch
		await resetWorkspace(app.page);
		await closeObsidian(app);
	}
});

function getPage(): Page {
	if (!app?.page) {
		throw new Error("Obsidian app not initialized");
	}
	return app.page;
}

test.describe("Osmosis Plugin", () => {
	test("plugin loads and ribbon icon is present", async () => {
		const page = getPage();

		const ribbonIcon = page.locator('.side-dock-ribbon-action[aria-label="Open mind map"]');
		await expect(ribbonIcon).toBeVisible({ timeout: 10000 });
	});

	test("mind map view opens via command palette", async () => {
		const page = getPage();

		await openMindMap(page);

		const container = page.locator(".osmosis-mindmap-container");
		await expect(container).toBeVisible({ timeout: 10000 });
	});

	test("mind map renders SVG nodes from a markdown file", async () => {
		const page = getPage();

		// Open the test fixture file via Quick Switcher
		await openFile(page, "test-note");
		await page.waitForTimeout(1000);

		// Ensure mind map is open
		const container = page.locator(".osmosis-mindmap-container");
		if (!(await container.isVisible().catch(() => false))) {
			await openMindMap(page);
		}

		// Wait for SVG to render
		const svg = page.locator(".osmosis-mindmap-svg");
		await expect(svg).toBeVisible({ timeout: 10000 });

		// Verify nodes rendered (test-note.md has headings and list items)
		const nodeGroups = svg.locator(".osmosis-node-group");
		await expect(nodeGroups.first()).toBeVisible({ timeout: 10000 });

		const count = await nodeGroups.count();
		expect(count).toBeGreaterThan(1);
	});
});
