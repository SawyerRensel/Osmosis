/** Card types that Osmosis can generate from markdown. */
export type CardType =
	| "explicit"
	| "explicit_bidi"
	| "explicit_cloze"
	| "code_cloze"
	| "occlusion"
	| "line";

/** Which masks an occlusion card paints on its front. */
export type OcclusionMode = "hide-all-guess-one" | "hide-one-guess-one";

/**
 * One mask on an occluded image.
 *
 * Coordinates are normalised 0–1 against the image's own dimensions rather
 * than stored in pixels, so a mask stays put when the image is resized, swapped
 * for a retina variant, or given a `|300` sizing suffix.
 *
 * `rotation` is degrees clockwise about the centre of the shape's own bounding
 * box, applied in the image's **pixel** space rather than in this normalised
 * one — the two differ by the image's aspect ratio, and rotating in normalised
 * space would render a tilted rectangle as a parallelogram on any diagram that
 * is not square. The stored geometry is always the *unrotated* shape, so every
 * edit (move, resize, vertex drag) goes on working in one axis-aligned frame;
 * only painting and hit testing know about the angle. Omitted when 0, so no
 * existing note churns.
 */
export type OcclusionShape =
	| { group: string; kind: "rect"; x: number; y: number; w: number; h: number; rotation?: number }
	| { group: string; kind: "ellipse"; x: number; y: number; rx: number; ry: number; rotation?: number }
	| { group: string; kind: "poly"; points: [number, number][]; rotation?: number };

/**
 * A text label placed on an occluded image.
 *
 * Deliberately *not* an `OcclusionShape`: an annotation hides nothing and must
 * never derive a card. Keeping it in its own list is what stops that happening
 * by construction — every consumer that maps a shape to a group
 * (`occlusionGroups`, `occludeLineCard`, `usedGroupsInFence`) would otherwise
 * have to learn to skip it, and a single missed one mints a phantom card.
 *
 * `x`/`y` are the label's top-left corner, normalised 0–1 like every other
 * coordinate here.
 *
 * `rotation` is degrees clockwise about that same corner — the anchor, not the
 * label's middle. A label is placed to point at a feature, so the anchor is the
 * part that must stay pinned while the text swings round it. Unlike a shape's
 * rotation this one needs no aspect compensation: annotations are positioned
 * HTML precisely so they dodge the mask overlay's stretch, and a CSS `rotate()`
 * is already applied in screen space. Omitted when 0.
 */
export interface OcclusionAnnotation {
	x: number;
	y: number;
	text: string;
	rotation?: number;
}

/**
 * The set of masks bound to one image embed.
 *
 * `header` and `backExtra` are two of Anki's three occlusion text fields; both
 * are omitted when empty, so a set that uses neither serializes exactly as it
 * did before they existed and no existing note churns. Anki's third, Comments,
 * is deliberately absent — it renders nowhere, so it earned no place in the
 * user's file.
 */
export interface OcclusionSet {
	mode: OcclusionMode;
	shapes: OcclusionShape[];
	/** Text labels drawn on the image, on both sides of every card. */
	annotations?: OcclusionAnnotation[];
	/** Shown above the image on both sides. */
	header?: string;
	/** Shown below the image on the answer side only. */
	backExtra?: string;
}

/**
 * What the mask renderer needs to draw one occlusion card: the image, every
 * mask on it (other groups' included — both modes need to know about them),
 * and which group this card is asking about.
 */
export interface CardOcclusion {
	/** Embed target exactly as written in source, e.g. "diagrams/bridge.png". */
	image: string;
	mode: OcclusionMode;
	shapes: OcclusionShape[];
	/** The group this card asks the user to recall, e.g. "c1". */
	target: string;
	/** Text labels drawn over the image, identical on front and back. */
	annotations?: OcclusionAnnotation[];
	/** Anki's Header field: shown above the image on both sides. */
	header?: string;
	/** Anki's Back Extra field: shown below the image on the answer side. */
	backExtra?: string;
}

/** FSRS card states. */
export type CardState = "new" | "learning" | "review" | "relearning";

/** Study modes for review tagging. */
export type StudyMode = "sequential" | "contextual" | "spatial";

/** A card with content and optional scheduling data. */
export interface Card {
	id: string;
	notePath: string;
	deck: string;
	cardType: CardType;
	front: string;
	back: string;
	typeIn: boolean;
	sourceLine: number;
	/** Block ID for line cards (e.g. "os-a1b2c3") — routes schedule writes to frontmatter. */
	blockId?: string;
	/**
	 * Excluded from deck totals and the sequential study queue (line-card
	 * opt-out). The card stays in the store for in-place study modes.
	 */
	excludeFromDecks?: boolean;
	/**
	 * Disabled (line-card "exclude"): fully out of study — not hidden by peek
	 * or study in either surface, skipped by the sequential queue, and dropped
	 * from dashboard counts. FSRS schedule is preserved so enabling restores
	 * history. Stored as `disabled: true` on the card's osmosis-schedule entry.
	 */
	disabled?: boolean;
	/**
	 * Line cards: contents of the immediately preceding sibling lines
	 * (document order), rendered as front context in sequential study.
	 */
	contextBefore?: string[];
	/** Occlusion cards: the image, its masks, and the group being asked. */
	occlusion?: CardOcclusion;
	/**
	 * Occluded *line* cards: the shape group this card asks about. Routes the
	 * card's schedule to a per-group entry nested under its block ID, since one
	 * block ID now backs several cards.
	 */
	occlusionGroup?: string;

	// Schedule fields (all optional — absent means new/unreviewed card)
	stability?: number;
	difficulty?: number;
	due?: number;        // epoch ms
	lastReview?: number; // epoch ms
	reps?: number;
	lapses?: number;
	state?: CardState;
	learningSteps?: number; // current learning step index (0-based)
}

/**
 * FSRS schedule data used internally by the scheduler.
 * Epoch-ms for timestamps. All fields required (new cards use defaults).
 */
export interface ScheduleData {
	stability: number;
	difficulty: number;
	due: number;           // epoch ms
	lastReview: number | null; // epoch ms, null = never reviewed
	reps: number;
	lapses: number;
	state: CardState;
	learningSteps: number; // current learning step index (0-based)
}
