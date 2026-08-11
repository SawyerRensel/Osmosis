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
		// These files polyfill Obsidian's DOM helpers so views can be
		// smoke-tested under jsdom. They have to call the raw DOM API these two
		// rules exist to steer plugin code away from — they are the thing the
		// rules would steer it towards.
		files: ["src/**/*.dom.test.ts", "src/test/**"],
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
