import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"eslint.config.mts",
						"manifest.json",
					],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// This file polyfills Obsidian's DOM helpers so the charts can be
		// smoke-tested under jsdom. It has to call the raw DOM API these two
		// rules exist to steer plugin code away from — it is the thing they
		// would steer it towards.
		files: ["src/stats/charts.dom.test.ts"],
		rules: {
			"obsidianmd/prefer-create-el": "off",
			"obsidianmd/no-static-styles-assignment": "off",
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"vault",
		"ref",
		"vitest.config.ts",
		"e2e",
		"playwright.config.ts",
		".venv",
		"site",
	]),
);
