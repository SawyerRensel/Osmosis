/**
 * Type declarations for Obsidian internals that the plugin relies on but
 * which are not part of the published `obsidian` API surface.
 *
 * Declaring them here keeps the call sites type-checked instead of forcing
 * `any` casts (which the Obsidian plugin lint rules reject). Each entry is a
 * real runtime property — if a future Obsidian release removes one, the call
 * sites guard with optional chaining where the feature is non-essential.
 */
import type { Plugin, TFile } from "obsidian";

declare module "obsidian" {
	interface App {
		/** Plugin registry. Used to reach the Osmosis instance from a view. */
		plugins: {
			plugins: Record<string, Plugin | undefined>;
		};

		/** Command registry. Used to fall back to Obsidian's built-in undo/redo. */
		commands?: {
			executeCommandById?: (id: string) => boolean;
		};

		/** Embed registry. Used to resolve the internal Markdown editor prototype. */
		embedRegistry: {
			embedByExtension: {
				md: (
					ctx: { app: App; containerEl: HTMLElement },
					file: TFile | null,
					subpath: string,
				) => unknown;
			};
		};
	}
}
