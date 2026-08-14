import type { Plugin } from "obsidian";
import {
	SHARD_FENCE_TAG,
	parseShardFileName,
	summarizeShardSource,
} from "../store/ReviewLog";

/**
 * Renders a review log shard as three facts instead of fifteen thousand lines
 * of JSON.
 *
 * This exists because of a hazard the Markdown switch created: before it, a
 * shard could not be opened as a note at all, and after it there are sixty
 * openable multi-megabyte files sitting in the file explorer. A code block
 * processor replaces the block's rendering entirely, so the enormous DOM is
 * never built in the first place.
 *
 * **The source is never `JSON.parse`d.** The processor is handed the whole
 * fence body — ~1.8 MB on a heavy month — and parsing it per line would cost
 * 100 ms+ on every open to display one number. Counting lines and parsing the
 * single header line is one pass over the bytes.
 *
 * No charts, no statistics: that is what the Stats view is for, and anything
 * richer would need exactly the full parse just avoided.
 */
export function registerReviewShardProcessor(plugin: Plugin): void {
	plugin.registerMarkdownCodeBlockProcessor(SHARD_FENCE_TAG, (source, el, ctx) => {
		const { header, entries } = summarizeShardSource(source);
		const month = parseShardFileName(basename(ctx.sourcePath))?.month;

		const box = el.createDiv({ cls: "osmosis-shard-summary" });
		box.createDiv({ cls: "osmosis-shard-title", text: "Osmosis review log" });

		const facts = box.createDiv({ cls: "osmosis-shard-facts" });
		fact(facts, "Device", header?.device ?? "unknown");
		fact(facts, "Month", month ?? "unknown");
		fact(facts, "Reviews", entries.toLocaleString());

		box.createDiv({
			cls: "osmosis-shard-note",
			text: "Generated file — do not edit. Open Osmosis stats to read it.",
		});
	});
}

function fact(parent: HTMLElement, label: string, value: string): void {
	const row = parent.createDiv({ cls: "osmosis-shard-fact" });
	row.createSpan({ cls: "osmosis-shard-fact-label", text: label });
	row.createSpan({ cls: "osmosis-shard-fact-value", text: value });
}

function basename(path: string): string {
	const index = path.lastIndexOf("/");
	return index === -1 ? path : path.slice(index + 1);
}
