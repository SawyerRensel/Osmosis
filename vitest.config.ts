import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		exclude: ["ref/**", "node_modules/**"],
		alias: {
			// The `obsidian` package ships types only (`"main": ""`), so anything
			// importing it for a *value* cannot be loaded under vitest. Pure logic
			// therefore lives outside `src/views/` — but the DOM assembly inside a
			// view has nowhere else to go, and this alias is what lets it be
			// tested. See the stub's own header before reaching for it.
			obsidian: fileURLToPath(new URL("./src/test/obsidian-stub.ts", import.meta.url)),
		},
	},
});
