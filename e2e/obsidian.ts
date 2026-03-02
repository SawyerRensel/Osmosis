import { Page, chromium, Browser } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const E2E_VAULT_DIR = path.join(PROJECT_ROOT, "e2e-vault");

const FLATPAK_APP_ID = "md.obsidian.Obsidian";

export interface ObsidianApp {
	browser?: Browser;
	process?: ChildProcess;
	page: Page;
	isExistingInstance?: boolean;
}

async function tryConnectExisting(port: number): Promise<string | null> {
	try {
		const http = await import("http");
		return new Promise((resolve) => {
			const req = http.get(`http://localhost:${port}/json/version`, (res) => {
				let data = "";
				res.on("data", (chunk: Buffer) => { data += chunk; });
				res.on("end", () => {
					try {
						const json = JSON.parse(data);
						resolve(json.webSocketDebuggerUrl || null);
					} catch {
						resolve(null);
					}
				});
			});
			req.on("error", () => resolve(null));
			req.setTimeout(2000, () => {
				req.destroy();
				resolve(null);
			});
		});
	} catch {
		return null;
	}
}

function launchObsidianProcess(remoteDebuggingPort: number): { process: ChildProcess; cdpUrlPromise: Promise<string> } {
	const vaultUri = `obsidian://open?path=${E2E_VAULT_DIR}`;

	const obsidianProcess = spawn("flatpak", [
		"run",
		FLATPAK_APP_ID,
		`--remote-debugging-port=${remoteDebuggingPort}`,
		vaultUri,
	], {
		stdio: ["ignore", "pipe", "pipe"],
	});

	const cdpUrlPromise = new Promise<string>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Timeout waiting for DevTools")),
			30000
		);

		obsidianProcess.stderr?.on("data", (data: Buffer) => {
			const output = data.toString();
			const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
			if (match?.[1]) {
				clearTimeout(timeout);
				resolve(match[1]);
			}
		});

		obsidianProcess.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});

	return { process: obsidianProcess, cdpUrlPromise };
}

async function connectToBrowser(cdpUrl: string): Promise<{ browser: Browser; page: Page }> {
	const browser = await chromium.connectOverCDP(cdpUrl);

	let contexts = browser.contexts();
	let page: Page;

	if (contexts.length > 0 && contexts[0]!.pages().length > 0) {
		page = contexts[0]!.pages()[0]!;
	} else {
		if (contexts.length === 0) {
			await new Promise<void>((resolve) => {
				const checkContexts = () => {
					contexts = browser.contexts();
					if (contexts.length > 0) {
						resolve();
					} else {
						setTimeout(checkContexts, 100);
					}
				};
				checkContexts();
			});
		}
		const context = contexts[0]!;
		if (context.pages().length > 0) {
			page = context.pages()[0]!;
		} else {
			page = await context.waitForEvent("page");
		}
	}

	return { browser, page };
}

export async function launchObsidian(): Promise<ObsidianApp> {
	if (!fs.existsSync(E2E_VAULT_DIR)) {
		throw new Error(
			"E2E vault not found. Run `npm run e2e:setup` first."
		);
	}

	const remoteDebuggingPort = 9222;
	let obsidianProcess: ChildProcess | undefined;
	let isExisting = false;
	let browser: Browser;
	let page: Page;

	// Try to connect to an already running instance
	const existingCdpUrl = await tryConnectExisting(remoteDebuggingPort);

	if (existingCdpUrl) {
		try {
			console.log("Found existing Obsidian instance, connecting...");
			({ browser, page } = await connectToBrowser(existingCdpUrl));
			isExisting = true;
		} catch {
			console.log("Existing instance is stale, launching fresh...");
			const launched = launchObsidianProcess(remoteDebuggingPort);
			obsidianProcess = launched.process;
			const cdpUrl = await launched.cdpUrlPromise;
			console.log("Connecting to CDP:", cdpUrl);
			({ browser, page } = await connectToBrowser(cdpUrl));
		}
	} else {
		const launched = launchObsidianProcess(remoteDebuggingPort);
		obsidianProcess = launched.process;
		const cdpUrl = await launched.cdpUrlPromise;
		console.log("Connecting to CDP:", cdpUrl);
		({ browser, page } = await connectToBrowser(cdpUrl));
	}

	// Wait for Obsidian to fully load
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(3000);

	// Handle trust/plugin dialogs
	await dismissObsidianDialogs(page);

	// Wait for workspace
	await page.waitForSelector(".workspace", { timeout: 30000 });
	await page.waitForTimeout(2000);

	// Dismiss any remaining modals
	for (let i = 0; i < 3; i++) {
		await page.keyboard.press("Escape");
		await page.waitForTimeout(200);
	}

	// Click on workspace to ensure focus
	const workspace = page.locator(".workspace");
	if (await workspace.isVisible({ timeout: 1000 }).catch(() => false)) {
		await workspace.click({ position: { x: 100, y: 100 } }).catch(() => {});
		await page.waitForTimeout(200);
	}

	// Verify Osmosis is loaded
	try {
		await page.keyboard.press("Control+p");
		await page.waitForSelector(".prompt", { timeout: 5000 });
		const promptInput = page.locator(".prompt-input");
		await promptInput.fill("Osmosis");
		await page.waitForTimeout(500);
		const suggestion = page.locator(".suggestion-item");
		const hasSuggestions = await suggestion.first().isVisible({ timeout: 3000 }).catch(() => false);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(300);

		if (!hasSuggestions) {
			console.warn("Warning: Osmosis commands not found. Plugin may not be loaded.");
		}
	} catch (e) {
		console.warn("Could not verify Osmosis plugin status:", e);
	}

	return { browser, process: obsidianProcess, page, isExistingInstance: isExisting };
}

async function dismissObsidianDialogs(page: Page): Promise<void> {
	const dialogButtons = [
		'button:has-text("Trust author and enable plugins")',
		'button:has-text("Trust")',
		'button:has-text("Turn on community plugins")',
		'button:has-text("Enable community plugins")',
	];

	for (const selector of dialogButtons) {
		const btn = page.locator(selector);
		if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
			await btn.click();
			await page.waitForTimeout(1500);
		}
	}
}

export async function closeObsidian(app: ObsidianApp): Promise<void> {
	if (app.isExistingInstance) {
		console.log("Keeping existing Obsidian instance running");
		return;
	}
	if (app.browser) {
		for (const context of app.browser.contexts()) {
			for (const pg of context.pages()) {
				await pg.close().catch(() => {});
			}
		}
		await app.browser.close();
	}
	if (app.process) {
		app.process.kill();
	}
}

export async function openCommandPalette(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await page.waitForTimeout(200);

	const workspace = page.locator(".workspace");
	if (await workspace.isVisible({ timeout: 1000 }).catch(() => false)) {
		await workspace.click({ position: { x: 10, y: 10 } }).catch(() => {});
		await page.waitForTimeout(100);
	}

	await page.keyboard.press("Control+p");
	await page.waitForSelector(".prompt", { timeout: 5000 });
	const promptInput = page.locator(".prompt-input");
	await promptInput.fill("");
}

export async function runCommand(page: Page, command: string): Promise<void> {
	await openCommandPalette(page);
	await page.keyboard.type(command, { delay: 30 });
	await page.waitForTimeout(500);

	const suggestion = page.locator(".suggestion-item").first();
	try {
		await suggestion.waitFor({ timeout: 3000, state: "visible" });
		await page.keyboard.press("Enter");
	} catch {
		await page.keyboard.press("Escape");
		throw new Error(`Command not found: "${command}". Is the Osmosis plugin loaded?`);
	}
}

export async function openFile(page: Page, filename: string): Promise<void> {
	await page.keyboard.press("Escape");
	await page.waitForTimeout(200);

	// Ctrl+O opens the Quick Switcher (file opener)
	await page.keyboard.press("Control+o");
	await page.waitForSelector(".prompt", { timeout: 5000 });

	await page.keyboard.type(filename, { delay: 30 });
	await page.waitForTimeout(500);

	const suggestion = page.locator(".suggestion-item").first();
	try {
		await suggestion.waitFor({ timeout: 3000, state: "visible" });
		await page.keyboard.press("Enter");
	} catch {
		await page.keyboard.press("Escape");
		throw new Error(`File not found: "${filename}".`);
	}
	await page.waitForTimeout(500);
}

export async function resetWorkspace(page: Page): Promise<void> {
	// Close other tab groups to prevent split accumulation, keeping one pane active
	try {
		await runCommand(page, "Close all other tabs");
		await page.waitForTimeout(300);
	} catch {
		// Command may not be available if only one tab — that's fine
	}
}

export async function openMindMap(page: Page): Promise<void> {
	await runCommand(page, "Osmosis: Open mind map");
	await page.waitForSelector(".osmosis-mindmap-container", { timeout: 10000 });
}
