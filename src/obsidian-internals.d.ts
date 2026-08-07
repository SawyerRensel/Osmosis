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

		/**
		 * Core (first-party) plugin registry. Used to borrow Obsidian Sync's
		 * device name for review-log shard filenames, and to tell whether Sync
		 * is running at all. Both are optional — every field is guarded at the
		 * call site, and a missing `sync` just means the public `Platform`
		 * fallback names the device.
		 *
		 * Note what is deliberately *not* declared here: whether Sync's "Sync
		 * all other types" toggle is on, which governs whether the log's
		 * `.jsonl` shards travel between devices at all. It was looked for and
		 * is not reachable from the instance — there is no `allowTypes` on it,
		 * `filter.allowTypes` stays `{}` with the toggle both on and off, and
		 * `canSyncPath()` tests only path filters (it answers true for
		 * `.jsonl` and `.png` in both states). Checked against Sync internal
		 * version 5280. The settings notice therefore informs rather than
		 * detects — see `shouldShowSyncNotice()` in main.ts.
		 */
		internalPlugins: {
			plugins: {
				sync?: {
					enabled?: boolean;
					instance?: {
						/** The device name shown in Sync's settings. */
						deviceName?: string;
					};
				};
			};
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
