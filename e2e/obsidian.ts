import { Page, chromium, Browser } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const E2E_VAULT_DIR = path.join(PROJECT_ROOT, "vault");
const FIXTURES_DIR = path.join(PROJECT_ROOT, "e2e", "fixtures");

const FLATPAK_APP_ID = "md.obsidian.Obsidian";
const CDP_PORT = 9222;

export interface ObsidianApp {
	browser: Browser;
	page: Page;
	process?: ChildProcess;
}

/**
 * Try to connect to an already-running Obsidian instance via CDP.
 * Returns the WebSocket debugger URL if found, null otherwise.
 */
async function tryConnectExisting(): Promise<string | null> {
	try {
		const http = await import("http");
		return new Promise((resolve) => {
			const req = http.get(
				`http://localhost:${CDP_PORT}/json/version`,
				(res) => {
					let data = "";
					res.on("data", (chunk: Buffer) => {
						data += chunk;
					});
					res.on("end", () => {
						try {
							const json = JSON.parse(data);
							resolve(json.webSocketDebuggerUrl || null);
						} catch {
							resolve(null);
						}
					});
				},
			);
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

/**
 * Launch Obsidian via Flatpak and wait for CDP to be ready.
 */
function launchObsidianProcess(): {
	process: ChildProcess;
	cdpUrlPromise: Promise<string>;
} {
	const vaultUri = `obsidian://open?path=${E2E_VAULT_DIR}`;

	const obsidianProcess = spawn(
		"flatpak",
		[
			"run",
			FLATPAK_APP_ID,
			`--remote-debugging-port=${CDP_PORT}`,
			vaultUri,
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);

	const cdpUrlPromise = new Promise<string>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Timeout waiting for DevTools (30s)")),
			30000,
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

/**
 * Connect to a browser via CDP and get the first available page.
 */
async function connectToBrowser(
	cdpUrl: string,
): Promise<{ browser: Browser; page: Page }> {
	const browser = await chromium.connectOverCDP(cdpUrl);

	let contexts = browser.contexts();
	if (contexts.length === 0) {
		await new Promise<void>((resolve) => {
			const check = () => {
				contexts = browser.contexts();
				if (contexts.length > 0) resolve();
				else setTimeout(check, 100);
			};
			check();
		});
	}

	const context = contexts[0]!;
	const page =
		context.pages().length > 0
			? context.pages()[0]!
			: await context.waitForEvent("page");

	return { browser, page };
}

/**
 * Dismiss Obsidian trust/plugin dialogs that appear on first vault open.
 */
async function dismissDialogs(page: Page): Promise<void> {
	const selectors = [
		'button:has-text("Trust author and enable plugins")',
		'button:has-text("Trust")',
		'button:has-text("Turn on community plugins")',
		'button:has-text("Enable community plugins")',
	];

	for (const selector of selectors) {
		const btn = page.locator(selector);
		if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
			await btn.click();
			await page.waitForTimeout(1500);
		}
	}
}

/**
 * Launch (or connect to) Obsidian and return a ready-to-use Page.
 *
 * IMPORTANT: This function intentionally does NOT kill Obsidian on cleanup.
 * Killing the process causes a close/reopen death spiral when Playwright
 * workers restart after timeouts. Instead, we just disconnect the CDP
 * connection and let Obsidian keep running for the next test run.
 */
export async function launchObsidian(): Promise<ObsidianApp> {
	if (!fs.existsSync(E2E_VAULT_DIR)) {
		throw new Error("E2E vault not found. Run `npm run e2e:setup` first.");
	}

	let obsidianProcess: ChildProcess | undefined;
	let browser: Browser;
	let page: Page;

	// Try to connect to an already-running instance first
	const existingCdpUrl = await tryConnectExisting();

	if (existingCdpUrl) {
		console.log("Connecting to existing Obsidian instance...");
		({ browser, page } = await connectToBrowser(existingCdpUrl));
	} else {
		console.log("Launching new Obsidian instance...");
		const launched = launchObsidianProcess();
		obsidianProcess = launched.process;
		const cdpUrl = await launched.cdpUrlPromise;
		console.log("CDP ready:", cdpUrl);
		({ browser, page } = await connectToBrowser(cdpUrl));
	}

	// Wait for Obsidian to be ready
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(3000);
	await dismissDialogs(page);
	await page.waitForSelector(".workspace", { timeout: 30000 });
	await page.waitForTimeout(2000);

	// Dismiss any stale modals
	for (let i = 0; i < 3; i++) {
		await page.keyboard.press("Escape");
		await page.waitForTimeout(200);
	}

	// Focus the workspace
	const workspace = page.locator(".workspace");
	if (await workspace.isVisible({ timeout: 1000 }).catch(() => false)) {
		await workspace.click({ position: { x: 100, y: 100 } }).catch(() => {});
		await page.waitForTimeout(200);
	}

	return { browser, page, process: obsidianProcess };
}

/**
 * Disconnect from Obsidian without killing it.
 * The Obsidian instance stays running for fast reconnection on the next run.
 */
export async function disconnectObsidian(app: ObsidianApp): Promise<void> {
	if (app.browser) {
		await app.browser.close().catch(() => {});
	}
	// Intentionally NOT killing app.process — see launchObsidian() comment.
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
	await page.locator(".prompt-input").fill("");
}

export async function runCommand(
	page: Page,
	command: string,
): Promise<void> {
	await openCommandPalette(page);
	await page.keyboard.type(command, { delay: 30 });
	await page.waitForTimeout(500);

	const suggestion = page.locator(".suggestion-item").first();
	try {
		await suggestion.waitFor({ timeout: 3000, state: "visible" });
		await page.keyboard.press("Enter");
	} catch {
		await page.keyboard.press("Escape");
		throw new Error(
			`Command not found: "${command}". Is the Osmosis plugin loaded?`,
		);
	}
}

export async function openFile(
	page: Page,
	filename: string,
): Promise<void> {
	await page.keyboard.press("Escape");
	await page.waitForTimeout(200);

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

export async function openMindMap(page: Page): Promise<void> {
	await runCommand(page, "Osmosis: Open mind map");
	await page.waitForSelector(".osmosis-mindmap-container", {
		timeout: 10000,
	});
}

export async function resetWorkspace(page: Page): Promise<void> {
	try {
		await runCommand(page, "Close all other tabs");
		await page.waitForTimeout(300);
	} catch {
		// Only one tab open — fine
	}
}

/**
 * Copy all fixture files from e2e/fixtures/ into vault/,
 * restoring any files that tests may have modified.
 */
export function resetFixtures(): void {
	const files = fs.readdirSync(FIXTURES_DIR);
	for (const file of files) {
		fs.copyFileSync(
			path.join(FIXTURES_DIR, file),
			path.join(E2E_VAULT_DIR, file),
		);
	}
}
