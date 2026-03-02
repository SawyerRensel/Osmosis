import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: "list",
	timeout: 60_000,
	use: {
		trace: "retain-on-failure",
		video: "retain-on-failure",
		screenshot: "on",
	},
	projects: [
		{
			name: "obsidian",
		},
	],
});
