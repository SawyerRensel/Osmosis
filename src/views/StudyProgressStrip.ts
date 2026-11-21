import type { SessionCounts, CountBucket } from "../study/session-counts";

/** The counts beside the bar, in Anki's order and colours (see styles.css). */
const COUNT_BUCKETS: Array<{ bucket: CountBucket; label: string }> = [
	{ bucket: "new", label: "New" },
	{ bucket: "learn", label: "Learn" },
	{ bucket: "due", label: "Due" },
];

/**
 * The progress bar with Anki's new | learn | due counts to its right — one
 * builder for the study tab's strip and note study's (T102), so the two cannot
 * drift apart. Colours come from `--osmosis-count-*`, which each host declares.
 */
export class StudyProgressStrip {
	/** `.osmosis-study-progress`, appended to the parent given. */
	readonly el: HTMLElement;
	private readonly fill: HTMLElement;
	private readonly countEls = new Map<CountBucket, HTMLElement>();

	constructor(parent: HTMLElement) {
		this.el = parent.createDiv({ cls: "osmosis-study-progress" });
		const bar = this.el.createDiv({ cls: "osmosis-study-progress-bar" });
		this.fill = bar.createDiv({ cls: "osmosis-study-progress-fill" });
		const countsEl = this.el.createDiv({ cls: "osmosis-study-counts" });
		for (const { bucket } of COUNT_BUCKETS) {
			this.countEls.set(bucket, countsEl.createSpan({ cls: `osmosis-study-count osmosis-study-count-${bucket}` }));
		}
	}

	/** Fill the bar to `percent` (clamped to 100). */
	setProgress(percent: number): void {
		this.fill.setCssProps({ "--osmosis-progress-width": `${Math.min(percent, 100)}%` });
	}

	/** Show the counts and underline the bucket of the card being answered. */
	setCounts(counts: SessionCounts): void {
		for (const { bucket, label } of COUNT_BUCKETS) {
			const el = this.countEls.get(bucket);
			if (!el) continue;
			el.textContent = String(counts[bucket]);
			el.setAttribute("aria-label", `${label}: ${counts[bucket]}`);
			el.toggleClass("is-current", counts.current === bucket);
		}
	}
}

/**
 * Put `el` directly above the note's inline title in a reading view's sizer,
 * or at the top of the sizer when there is no inline title. A no-op when it is
 * already there, so it can run on every refresh.
 */
export function mountAboveInlineTitle(sizer: HTMLElement, el: HTMLElement): void {
	const title = sizer.querySelector(".inline-title");
	if (title) {
		if (el.nextSibling !== title) title.before(el);
	} else if (sizer.firstChild !== el) {
		sizer.prepend(el);
	}
}
