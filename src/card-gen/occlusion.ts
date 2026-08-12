import type {
	CardOcclusion,
	OcclusionAnnotation,
	OcclusionMode,
	OcclusionSet,
	OcclusionShape,
} from "../database/types";
import type { GeneratedCard } from "./types";

/**
 * Image occlusion: shape sets, their binding to image embeds, and the
 * derivation of one card per shape group.
 *
 * Masks are card data, so they live in the carrier that card's data already
 * lives in — the ```osmosis fence header for fence cards, the
 * `osmosis-schedule` frontmatter entry for line cards. There is no separate
 * occlusion file format.
 *
 * A shape group is a cloze group: several shapes sharing a `group` label
 * collapse into one card, exactly as several `cN:`-labelled cloze occurrences
 * do, and the card ID derives the same way (`<fenceId>-cN`). That is Anki's
 * shape-grouping feature arriving for free.
 *
 * Geometry is the one thing that cannot sit inline in the content — nobody
 * hand-writes coordinates, a visual editor emits them — so shapes live in the
 * header and bind to their embed through an inline `{label}` marker.
 */

/** Anki's default: paint every mask on the front, mark the one being asked. */
export const DEFAULT_OCCLUSION_MODE: OcclusionMode = "hide-all-guess-one";

const OCCLUSION_MODES: readonly OcclusionMode[] = [
	"hide-all-guess-one",
	"hide-one-guess-one",
];

/**
 * A shape set's header key: `occlude-a:` for a labelled embed, bare `occlude:`
 * for the single-embed line-card form. Value must be empty — the set is the
 * indented block beneath.
 */
const OCCLUDE_KEY_REGEX = /^occlude(?:-([A-Za-z0-9_-]+))?\s*:\s*$/;

/**
 * The occlusion text fields: the YAML key each is stored under, paired with its
 * `OcclusionSet` property, in the order they serialize.
 *
 * Hyphenated in YAML like every other multi-word value in this format
 * (`hide-all-guess-one`), camel-cased in TypeScript.
 *
 * Anki's third field, Comments, is deliberately not here: it renders on no
 * surface, so it was a field whose only effect was to sit in the user's note.
 * A `comments:` key written by an older build parses as an unknown key, which
 * this format ignores, and is dropped the next time the set is written.
 */
const TEXT_FIELDS = [
	["header", "header"],
	["back-extra", "backExtra"],
] as const;

/** The YAML key half of `TEXT_FIELDS`, as the alternation a line match needs. */
const TEXT_FIELD_KEY_REGEX = /^(header|back-extra)\s*:\s*(.*)$/;

/**
 * An image embed carrying an occlusion label. Both embed spellings are
 * matched, since either can appear inside a fence:
 *   `![[bridge.png]]{a}`   (group 1 = target, group 2 = label)
 *   `![alt](bridge.png){a}` (group 3 = target, group 4 = label)
 *
 * The wikilink form tolerates a `|300` sizing suffix, which is display data
 * and not part of the link target.
 */
const LABELED_EMBED_REGEX =
	/!\[\[([^\]|#^]+)(?:[|#^][^\]]*)?\]\]\{([A-Za-z0-9_-]+)\}|!\[[^\]]*\]\(([^)]+)\)\{([A-Za-z0-9_-]+)\}/g;

/**
 * The `{label}` suffix on an embed, captured so it can be dropped while the
 * embed itself is kept. Deliberately anchored to a preceding embed: a bare
 * `{x}` elsewhere in the content is the user's prose (or LaTeX) and must
 * survive untouched.
 */
const EMBED_LABEL_SUFFIX_REGEX =
	/(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]*\))\{[A-Za-z0-9_-]+\}/g;

/** An image embed with no label, used to find the line card's single embed. */
const ANY_EMBED_REGEX = /!\[\[([^\]|#^]+)(?:[|#^][^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\)/g;

/** One labelled embed found in fence content. */
export interface LabeledEmbed {
	/** The `{a}` label binding this embed to a shape set. */
	label: string;
	/** Link target as written, e.g. "diagrams/bridge.png". */
	target: string;
}

/**
 * Every labelled embed in the content, in source order.
 *
 * The label is what binds an embed to its shapes. Binding by filename breaks
 * when the same image is embedded twice; binding by position breaks silently
 * the moment embeds are reordered, moving masks onto the wrong diagram. An
 * explicit label survives both.
 */
export function findLabeledEmbeds(content: string): LabeledEmbed[] {
	const found: LabeledEmbed[] = [];
	for (const match of content.matchAll(LABELED_EMBED_REGEX)) {
		const target = match[1] ?? match[3];
		const label = match[2] ?? match[4];
		if (target !== undefined && label !== undefined) {
			found.push({ label, target: target.trim() });
		}
	}
	return found;
}

/** The first image embed in the content, labelled or not, or null when none. */
export function findFirstEmbed(content: string): string | null {
	ANY_EMBED_REGEX.lastIndex = 0;
	const match = ANY_EMBED_REGEX.exec(content);
	if (!match) return null;
	const target = match[1] ?? match[2];
	return target === undefined ? null : target.trim();
}

/**
 * Remove `{label}` markers from embeds, leaving the embeds themselves.
 *
 * Fence content is rendered through `MarkdownRenderer`, which knows nothing
 * about the marker — so a label that survives to render time appears as
 * literal stray text beside the diagram. Every render surface (sequential,
 * contextual, spatial) has to call this, and the source file keeps its labels:
 * only the rendered output is cleaned.
 */
export function stripEmbedLabels(content: string): string {
	return content.replace(EMBED_LABEL_SUFFIX_REGEX, (_, embed: string) => embed);
}

/**
 * Drop image embeds, leaving whatever prose surrounds them.
 *
 * An occlusion card's image is painted by the mask renderer rather than by
 * `MarkdownRenderer`, so the embed has to come out of the card body before the
 * body is rendered — otherwise the diagram appears twice, once masked and once
 * not. A caption, or the fence's hint, is not the renderer's business and
 * stays.
 */
export function stripEmbeds(content: string): string {
	return content.replace(ANY_EMBED_REGEX, "");
}

/**
 * Drop the labelled embeds named in `labels`, leaving every other embed where
 * it is. The surviving labels stay on, so run `stripEmbedLabels` afterwards.
 *
 * A fence can hold a diagram that has masks beside one that does not: only the
 * occluded embeds are drawn by the mask renderer, so only they come out of the
 * markdown. `stripEmbeds` would take the plain diagram with them and it would
 * vanish from the note entirely.
 */
export function stripLabeledEmbeds(content: string, labels: ReadonlySet<string>): string {
	return content.replace(
		LABELED_EMBED_REGEX,
		(full: string, _t1: string | undefined, l1: string | undefined, _t2: string | undefined, l2: string | undefined) => {
			const label = l1 ?? l2;
			return label !== undefined && labels.has(label) ? "" : full;
		},
	);
}

/**
 * Split content at the first embed pointing at `target`, or null when it holds
 * none. The embed itself is dropped: the mask renderer draws that picture.
 *
 * Splitting rather than stripping is what keeps a card's diagram *where the
 * author put it*. A fence's other diagrams stay in the body as ordinary
 * embeds — one picture is often the context for another, so a card asking
 * about the cross-section still shows the elevation beside it — and simply
 * appending the masked image after all the prose would print those siblings
 * first, reversing the order they were written in.
 *
 * When the same image is embedded twice in one fence, the first occurrence is
 * the masked one and the second renders plainly.
 */
export function splitAtEmbed(content: string, target: string): { before: string; after: string } | null {
	for (const match of content.matchAll(ANY_EMBED_REGEX)) {
		if ((match[1] ?? match[2])?.trim() !== target || match.index === undefined) continue;
		return {
			before: content.slice(0, match.index),
			after: content.slice(match.index + match[0].length),
		};
	}
	return null;
}

// ── Parsing ───────────────────────────────────────────────────

/**
 * Parse an `occlude[-label]:` block starting at `startIdx`.
 *
 * The block is the header key plus every following indented line, so it ends
 * at the first line that is blank, unindented, or the closing fence. Returns
 * null when `startIdx` is not an occlude key.
 */
export function parseOccludeBlock(
	lines: readonly string[],
	startIdx: number,
): { label: string; set: OcclusionSet; nextIdx: number } | null {
	const keyMatch = lines[startIdx]?.trim().match(OCCLUDE_KEY_REGEX);
	if (!keyMatch) return null;

	let end = startIdx + 1;
	while (end < lines.length && /^\s+\S/.test(lines[end]!)) end++;

	const set = parseOccludeBody(lines.slice(startIdx + 1, end));
	return { label: keyMatch[1] ?? "", set, nextIdx: end };
}

/**
 * Parse the indented body of an occlude block: `mode:`, a `shapes:` list, an
 * optional `annotations:` list, and Anki's three text fields.
 */
function parseOccludeBody(body: readonly string[]): OcclusionSet {
	let mode = DEFAULT_OCCLUSION_MODE;
	const shapes: OcclusionShape[] = [];
	const annotations: OcclusionAnnotation[] = [];
	const text: Record<string, string> = {};
	let list: "shapes" | "annotations" | null = null;

	for (let i = 0; i < body.length; i++) {
		const raw = body[i]!;
		const line = raw.trim();
		if (line === "") continue;

		const modeMatch = line.match(/^mode\s*:\s*(\S+)\s*$/);
		if (modeMatch) {
			mode = parseMode(modeMatch[1]!);
			list = null;
			continue;
		}

		// Header / Back Extra. The value goes through the flow-scalar
		// reader so the double quotes the writer always puts round it come back
		// off, escapes and all.
		const textMatch = line.match(TEXT_FIELD_KEY_REGEX);
		if (textMatch) {
			text[textMatch[1]!] = asText(parseFlowValue(textMatch[2]!));
			list = null;
			continue;
		}

		const listMatch = line.match(/^(shapes|annotations)\s*:\s*$/);
		if (listMatch) {
			list = listMatch[1] as "shapes" | "annotations";
			continue;
		}

		if (list !== null && line.startsWith("-")) {
			const rest = line.slice(1).trim();
			let entry: unknown;

			// Flow mapping — `- { group: c1, kind: rect, … }`. Every note written
			// before shapes moved to block mappings uses this spelling, so it
			// stays readable indefinitely; only the writer changed.
			if (rest.startsWith("{")) {
				entry = parseFlowValue(rest);
			} else {
				// Block mapping — the first key rides the `-`, the rest follow
				// indented past it.
				const indent = leadingWhitespace(raw);
				const fields = [rest];
				while (i + 1 < body.length && leadingWhitespace(body[i + 1]!) > indent) {
					fields.push(body[++i]!.trim());
				}
				entry = parseBlockMapping(fields);
			}

			if (list === "shapes") {
				const shape = parseShape(entry);
				if (shape) shapes.push(shape);
			} else {
				const annotation = parseAnnotation(entry);
				if (annotation) annotations.push(annotation);
			}
			continue;
		}

		// Anything else is a key this version does not know about. Skipping it
		// rather than bailing keeps a note written by a newer Osmosis loadable.
	}

	const set: OcclusionSet = { mode, shapes };
	if (annotations.length > 0) set.annotations = annotations;
	return assignTextFields(set, (key) => text[key]);
}

/**
 * Copy Anki's three text fields onto a set from whatever holds them, dropping
 * any that are blank.
 *
 * Blank is the same as absent: an empty field renders nothing on any surface,
 * and keeping it would write an empty key into the user's note that they can
 * neither see nor reach.
 */
function assignTextFields(set: OcclusionSet, read: (key: string) => unknown): OcclusionSet {
	for (const [key, prop] of TEXT_FIELDS) {
		const value = asText(read(key));
		if (value.trim() !== "") set[prop] = value;
	}
	return set;
}

/**
 * A parsed scalar as the text of a field. A number is accepted because a
 * hand-written `header: 12` parses as one, and refusing it would silently lose
 * what the user typed — the same tolerance `parseAnnotation` gives its text.
 */
function asText(value: unknown): string {
	if (typeof value === "string") return value;
	return typeof value === "number" ? String(value) : "";
}

/** Width of a line's leading indent. A blank line counts as zero, ending a block. */
function leadingWhitespace(line: string): number {
	return /^[ \t]*/.exec(line)![0].length;
}

/**
 * Parse `key: value` lines into the plain object `parseShape` validates —
 * values through `parseFlowValue`, so a `points:` sequence still reads inline.
 */
function parseBlockMapping(entry: readonly string[]): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const line of entry) {
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		if (key !== "") result[key] = parseFlowValue(line.slice(colon + 1));
	}
	return result;
}

/**
 * Validate an already-parsed shape set — the frontmatter path, where Obsidian's
 * YAML parser has handed us plain objects. Returns null when `raw` holds no
 * usable shapes, so a hand-mangled entry degrades to "no occlusion" rather than
 * throwing during card generation.
 */
export function parseOcclusionSet(raw: unknown): OcclusionSet | null {
	if (!isPlainObject(raw)) return null;

	const rawShapes = raw["shapes"];
	if (!Array.isArray(rawShapes)) return null;

	const shapes: OcclusionShape[] = [];
	for (const entry of rawShapes) {
		const shape = parseShape(entry);
		if (shape) shapes.push(shape);
	}
	if (shapes.length === 0) return null;

	const annotations = parseAnnotations(raw["annotations"]);
	const set: OcclusionSet = { mode: parseMode(raw["mode"]), shapes };
	if (annotations.length > 0) set.annotations = annotations;
	return assignTextFields(set, (key) => raw[key]);
}

/** Validate an `annotations` list, dropping any entry that cannot be drawn. */
function parseAnnotations(raw: unknown): OcclusionAnnotation[] {
	if (!Array.isArray(raw)) return [];
	const annotations: OcclusionAnnotation[] = [];
	for (const entry of raw) {
		const annotation = parseAnnotation(entry);
		if (annotation) annotations.push(annotation);
	}
	return annotations;
}

/**
 * Validate one annotation. Empty text is dropped rather than kept: a label with
 * nothing in it is invisible on the card and unreachable in the editor, so it
 * would be a permanent invisible passenger in the user's note.
 *
 * A number is accepted for `text` because a hand-written `text: 12` parses as
 * one, and refusing it would silently lose the label.
 */
function parseAnnotation(raw: unknown): OcclusionAnnotation | null {
	if (!isPlainObject(raw)) return null;

	const x = toFiniteNumber(raw["x"]);
	const y = toFiniteNumber(raw["y"]);
	if (x === null || y === null) return null;

	const value = raw["text"];
	const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
	if (text.trim() === "") return null;

	const annotation: OcclusionAnnotation = { x, y, text };
	const rotation = parseRotation(raw["rotation"]);
	if (rotation !== 0) annotation.rotation = rotation;
	return annotation;
}

/**
 * Degrees folded into [0, 360), which is the range everything downstream
 * assumes and the range the editor writes.
 *
 * Exported because `study/occlusion-geometry.ts` folds the angle a rotate drag
 * produces through the same function — a drag turns past 360° and back below 0°
 * freely, and the two halves must agree on what that becomes or a shape's stored
 * angle would depend on which way the user got there.
 */
export function normalizeRotation(degrees: number): number {
	if (!Number.isFinite(degrees)) return 0;
	const wrapped = degrees % 360;
	return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** A stored `rotation` value, or 0 when it is absent or unusable. */
function parseRotation(raw: unknown): number {
	const value = toFiniteNumber(raw);
	return value === null ? 0 : normalizeRotation(value);
}

function parseMode(value: unknown): OcclusionMode {
	return OCCLUSION_MODES.includes(value as OcclusionMode)
		? (value as OcclusionMode)
		: DEFAULT_OCCLUSION_MODE;
}

/** Validate one shape object. Returns null when required geometry is missing. */
function parseShape(raw: unknown): OcclusionShape | null {
	if (!isPlainObject(raw)) return null;

	const group = typeof raw["group"] === "string" ? raw["group"].trim() : "";
	if (!/^c\d+$/.test(group)) return null;

	const shape = parseShapeGeometry(raw, group);
	if (shape === null) return null;

	// Applied after the geometry rather than inside each branch, so a kind added
	// later cannot forget it. Absent at 0, which is what the writer emits.
	const rotation = parseRotation(raw["rotation"]);
	if (rotation !== 0) shape.rotation = rotation;
	return shape;
}

/** One shape's kind and coordinates, before rotation is applied. */
function parseShapeGeometry(raw: Record<string, unknown>, group: string): OcclusionShape | null {
	switch (raw["kind"]) {
		case "rect": {
			const x = toFiniteNumber(raw["x"]);
			const y = toFiniteNumber(raw["y"]);
			const w = toFiniteNumber(raw["w"]);
			const h = toFiniteNumber(raw["h"]);
			if (x === null || y === null || w === null || h === null) return null;
			return { group, kind: "rect", x, y, w, h };
		}
		case "ellipse": {
			const x = toFiniteNumber(raw["x"]);
			const y = toFiniteNumber(raw["y"]);
			const rx = toFiniteNumber(raw["rx"]);
			const ry = toFiniteNumber(raw["ry"]);
			if (x === null || y === null || rx === null || ry === null) return null;
			return { group, kind: "ellipse", x, y, rx, ry };
		}
		case "poly": {
			const points = parsePoints(raw["points"]);
			// Fewer than three points cannot enclose an area, so it would render
			// as an invisible mask — a card the user could never answer.
			return points.length >= 3 ? { group, kind: "poly", points } : null;
		}
		default:
			return null;
	}
}

function parsePoints(raw: unknown): [number, number][] {
	if (!Array.isArray(raw)) return [];
	const points: [number, number][] = [];
	for (const entry of raw) {
		if (!Array.isArray(entry) || entry.length < 2) continue;
		const x = toFiniteNumber(entry[0]);
		const y = toFiniteNumber(entry[1]);
		if (x !== null && y !== null) points.push([x, y]);
	}
	return points;
}

// ── Flow-mapping scalar parsing ───────────────────────────────

/**
 * Parse a YAML flow scalar, sequence, or mapping — the subset a shape line
 * uses: `{ group: c1, kind: rect, x: 0.31 }` and `[[0.2, 0.18], [0.42, 0.18]]`.
 *
 * The fence header is raw text rather than parsed YAML, and this module
 * deliberately does not pull in a YAML library (matching `frontmatter.ts`),
 * so shapes are read with a parser scoped to exactly what the editor writes.
 */
export function parseFlowValue(text: string): unknown {
	const trimmed = text.trim();

	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		const result: Record<string, unknown> = {};
		for (const entry of splitTopLevel(trimmed.slice(1, -1))) {
			const colon = entry.indexOf(":");
			if (colon === -1) continue;
			const key = entry.slice(0, colon).trim();
			if (key !== "") result[key] = parseFlowValue(entry.slice(colon + 1));
		}
		return result;
	}

	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return splitTopLevel(trimmed.slice(1, -1))
			.filter((entry) => entry.trim() !== "")
			.map((entry) => parseFlowValue(entry));
	}

	// Double-quoted scalars carry backslash escapes — the writer produces them
	// for annotation text, which is the one field a user types freely.
	if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
		return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
	}
	if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
		return trimmed.slice(1, -1).replace(/''/g, "'");
	}

	if (trimmed !== "" && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(trimmed)) {
		return Number(trimmed);
	}

	return trimmed;
}

/** Split on commas that sit outside any nested `[]`, `{}`, or quotes. */
function splitTopLevel(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let start = 0;

	for (let i = 0; i < text.length; i++) {
		const char = text[i]!;
		if (quote !== null) {
			// A backslash escape inside a double-quoted scalar hides the closing
			// quote from this scan; without skipping it a `\"` would end the string
			// early and the rest would split on commas that are really text.
			if (char === "\\" && quote === '"') i++;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") quote = char;
		else if (char === "[" || char === "{") depth++;
		else if (char === "]" || char === "}") depth--;
		else if (char === "," && depth === 0) {
			parts.push(text.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(text.slice(start));
	return parts;
}

// ── Serialization ─────────────────────────────────────────────

/**
 * Render a shape set back to fence-header lines, as the block mappings the
 * frontmatter carrier already stores. Both carriers then hold one structure,
 * and the grouping is visible in the text rather than packed into a line.
 *
 * Flow mappings are still read — see `parseOccludeBody` — so notes written
 * before this migrate when their fence is next written, not by a sweep.
 */
export function serializeOccludeBlock(label: string, set: OcclusionSet): string[] {
	const lines = [
		`occlude${label === "" ? "" : `-${label}`}:`,
		`  mode: ${set.mode}`,
		"  shapes:",
		...set.shapes.flatMap((shape) => serializeShape(shape)),
	];
	// Omitted entirely when there are none, so an occlusion that never had a
	// label is not given an empty key it will never use.
	if (set.annotations && set.annotations.length > 0) {
		lines.push("  annotations:", ...set.annotations.flatMap((a) => serializeAnnotation(a)));
	}
	// Anki's three text fields, each omitted when empty for the same reason —
	// and each double-quoted, since they are free text the user types.
	for (const [key, prop] of TEXT_FIELDS) {
		const value = set[prop];
		if (value !== undefined && value !== "") lines.push(`  ${key}: ${yamlString(value)}`);
	}
	return lines;
}

/**
 * One annotation as an indented YAML block mapping, matching `serializeShape`.
 *
 * `text` is always double-quoted. It is the only field a user types freely, so
 * it can hold a `:`, a `#`, or a leading `-`, any of which would change the
 * meaning of a bare scalar — and in the frontmatter carrier a malformed line
 * fails the parse of the *whole note's* frontmatter, not just this entry.
 */
export function serializeAnnotation(annotation: OcclusionAnnotation): string[] {
	const fields = [`x: ${num(annotation.x)}`, `y: ${num(annotation.y)}`];
	if (annotation.rotation) fields.push(`rotation: ${num(annotation.rotation)}`);
	// Last, so the one free-text field is where the eye lands rather than buried
	// between two numbers.
	fields.push(`text: ${yamlString(annotation.text)}`);
	return fields.map((field, idx) => (idx === 0 ? `    - ${field}` : `      ${field}`));
}

/** A string as a double-quoted YAML scalar. */
function yamlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * One shape as an indented YAML block mapping: `- ` on the first key, the rest
 * aligned beneath it. Coordinates round to 4dp — sub-pixel on any real image.
 *
 * A poly's `points` stays a flow sequence on its own line. It is the one field
 * that is a list of lists, and a block sequence of block sequences buys nothing
 * a reader can use.
 */
export function serializeShape(shape: OcclusionShape): string[] {
	const fields: string[] = [`group: ${shape.group}`, `kind: ${shape.kind}`];
	switch (shape.kind) {
		case "rect":
			fields.push(`x: ${num(shape.x)}`, `y: ${num(shape.y)}`, `w: ${num(shape.w)}`, `h: ${num(shape.h)}`);
			break;
		case "ellipse":
			fields.push(`x: ${num(shape.x)}`, `y: ${num(shape.y)}`, `rx: ${num(shape.rx)}`, `ry: ${num(shape.ry)}`);
			break;
		case "poly":
			fields.push(`points: [${shape.points.map(([x, y]) => `[${num(x)}, ${num(y)}]`).join(", ")}]`);
			break;
	}
	// After the coordinates, and omitted at 0: an unrotated shape serializes
	// exactly as it did before rotation existed, so no existing note churns the
	// first time it is written.
	if (shape.rotation) fields.push(`rotation: ${num(shape.rotation)}`);
	return fields.map((field, idx) => (idx === 0 ? `    - ${field}` : `      ${field}`));
}

/** Serialize a shape set to the plain object the frontmatter carrier stores. */
export function occlusionSetToYamlValue(set: OcclusionSet): Record<string, unknown> {
	const value: Record<string, unknown> = {
		mode: set.mode,
		shapes: set.shapes.map((shape) => withRotation(shapeToYamlValue(shape), shape.rotation)),
	};
	if (set.annotations && set.annotations.length > 0) {
		value["annotations"] = set.annotations.map((a) =>
			withRotation({ x: num(a.x), y: num(a.y), text: a.text }, a.rotation),
		);
	}
	// Obsidian's own YAML dumper quotes whatever needs quoting here, so the text
	// goes in raw — unlike the fence carrier, which is written as plain text.
	for (const [key, prop] of TEXT_FIELDS) {
		const text = set[prop];
		if (text !== undefined && text !== "") value[key] = text;
	}
	return value;
}

/** One shape's kind and coordinates as the plain object frontmatter stores. */
function shapeToYamlValue(shape: OcclusionShape): Record<string, unknown> {
	switch (shape.kind) {
		case "rect":
			return { group: shape.group, kind: "rect", x: num(shape.x), y: num(shape.y), w: num(shape.w), h: num(shape.h) };
		case "ellipse":
			return { group: shape.group, kind: "ellipse", x: num(shape.x), y: num(shape.y), rx: num(shape.rx), ry: num(shape.ry) };
		case "poly":
			return { group: shape.group, kind: "poly", points: shape.points.map(([x, y]) => [num(x), num(y)]) };
	}
}

/**
 * Add a `rotation` key, unless there is nothing to add. Omitted at 0 for the
 * same reason the fence writer omits it: an unrotated shape must serialize
 * exactly as it did before rotation existed.
 */
function withRotation(
	value: Record<string, unknown>,
	rotation: number | undefined,
): Record<string, unknown> {
	if (rotation) value["rotation"] = num(rotation);
	return value;
}

// ── Card derivation ───────────────────────────────────────────

/**
 * The distinct group labels across a set's shapes, in the order they first
 * appear, sorted by group number so `c2` never precedes `c10`'s predecessor
 * out of source-order accident.
 */
export function occlusionGroups(set: OcclusionSet): string[] {
	const seen = new Set<string>();
	for (const shape of set.shapes) seen.add(shape.group);
	return [...seen].sort((a, b) => groupNumber(a) - groupNumber(b));
}

/** The numeric part of a `cN` group label. */
export function groupNumber(group: string): number {
	const match = group.match(/^c(\d+)$/);
	return match ? parseInt(match[1]!, 10) : Number.MAX_SAFE_INTEGER;
}

/** Build the renderer payload for one group's card. */
export function cardOcclusion(
	image: string,
	set: OcclusionSet,
	target: string,
): CardOcclusion {
	const occlusion: CardOcclusion = { image, mode: set.mode, shapes: set.shapes, target };
	// Annotations ride along on every card the set derives: they label the
	// picture rather than any one group, so they read the same on all of them.
	if (set.annotations && set.annotations.length > 0) occlusion.annotations = set.annotations;
	// Header and Back Extra do the same: they describe the picture rather than
	// any one group, so every card the set derives carries both.
	if (set.header !== undefined && set.header !== "") occlusion.header = set.header;
	if (set.backExtra !== undefined && set.backExtra !== "") occlusion.backExtra = set.backExtra;
	return occlusion;
}

/**
 * Fan a line card out into one occlusion card per shape group.
 *
 * A line card holding an occluded image needs no `image:` field and no label:
 * the block ID already identifies the line, and the line holds exactly one
 * embed. If it holds none the shape set has nothing to sit on, so the card is
 * returned unoccluded rather than dropped — the user's line is still a line.
 */
export function occludeLineCard(card: GeneratedCard, set: OcclusionSet): GeneratedCard[] {
	const image = findFirstEmbed(card.back);
	if (image === null || set.shapes.length === 0) return [card];

	return occlusionGroups(set).map((group) => ({
		...card,
		id: `${card.id}-${group}`,
		card_type: "occlusion",
		occlusion: cardOcclusion(image, set, group),
		occlusionGroup: group,
	}));
}

// ── Locating the carrier for an image the user right-clicked ──

/** Matches an osmosis fence opening, capturing its backtick run. */
const FENCE_OPEN_REGEX = /^(`{3,})osmosis\s*$/;

/** The extent of one ```osmosis fence: its opening and closing line indices. */
export interface FenceSpan {
	/** 0-based line of the opening ```osmosis. */
	start: number;
	/** 0-based line of the closing fence, or the last line when unterminated. */
	end: number;
}

/**
 * The osmosis fence containing `line`, or null when the line is ordinary prose.
 *
 * This is what decides which carrier a newly drawn shape set is written into:
 * an image already inside a fence keeps its shapes in that fence's header, and
 * an image in prose becomes a line card instead. Wrapping prose in a fence
 * would restructure the user's note and cost the embed Obsidian's own rename
 * handling, which only reaches links *outside* code fences.
 */
export function enclosingOsmosisFence(lines: readonly string[], line: number): FenceSpan | null {
	let i = 0;
	while (i < lines.length) {
		const openMatch = lines[i]!.replace(/\s*<!--.*?-->/g, "").trim().match(FENCE_OPEN_REGEX);
		if (!openMatch) {
			i++;
			continue;
		}

		const backticks = openMatch[1]!.length;
		const start = i;
		// A code cloze opens ````osmosis around an inner ```block, so the close
		// is the first run of *at least* as many backticks.
		let close: number | null = null;
		for (let j = start + 1; j < lines.length; j++) {
			const closeMatch = lines[j]!.trim().match(/^(`{3,})\s*$/);
			if (closeMatch && closeMatch[1]!.length >= backticks) {
				close = j;
				break;
			}
		}

		// An unterminated fence runs to EOF — as `removeFence` also treats it —
		// so its last line is content, not a delimiter to be excluded.
		const contentEnd = close ?? lines.length;
		if (line > start && line < contentEnd) {
			return { start, end: close ?? lines.length - 1 };
		}
		i = contentEnd + 1;
	}
	return null;
}

/** The `id:` a fence declares, or null when it has none yet. */
export function fenceId(lines: readonly string[], span: FenceSpan): string | null {
	for (let i = span.start + 1; i < span.end; i++) {
		const match = lines[i]!.trim().match(/^id\s*:\s*(\S+)\s*$/i);
		if (match) return match[1]!;
		if (lines[i]!.trim() === "") break; // the header ends at the blank line
	}
	return null;
}

/** Every shape set a fence's header declares, keyed by embed label. */
export function fenceOcclusions(
	lines: readonly string[],
	span: FenceSpan,
): Map<string, OcclusionSet> {
	const sets = new Map<string, OcclusionSet>();
	for (let i = span.start + 1; i < span.end; i++) {
		if (lines[i]!.trim() === "") break;
		const block = parseOccludeBlock(lines, i);
		if (block) {
			sets.set(block.label, block.set);
			i = block.nextIdx - 1; // the loop's own i++ lands on nextIdx
		}
	}
	return sets;
}

/**
 * Every occluded diagram a fence declares, paired with the image it binds to,
 * and the prose left once those pictures are taken out of the markdown.
 *
 * `target` is left empty on purpose. In the note nobody is answering one of the
 * questions a diagram carries, so there is no group to single out — the note
 * surfaces paint `all-hidden` / `all-revealed`, which never consult it.
 *
 * The prose comes back with the occluded embeds removed and every remaining
 * label stripped: the mask renderer draws those pictures, so leaving them in
 * the markdown would render each diagram a second time, unmasked, beside its
 * masked copy. An embed in the same fence that has *no* shape set is ordinary
 * content and stays.
 *
 * `lines` is the fence *body*, so the header runs from line 0 and the synthetic
 * span says so. Shared by reading view and the mind map, which paint the same
 * diagrams from the same fence text.
 */
export function fenceDiagrams(
	lines: readonly string[],
	contentStart: number,
): { diagrams: CardOcclusion[]; prose: string } {
	const sets = fenceOcclusions(lines, { start: -1, end: lines.length });
	if (sets.size === 0) return { diagrams: [], prose: "" };

	const raw = lines.slice(contentStart).join("\n");
	const diagrams: CardOcclusion[] = [];
	const occluded = new Set<string>();
	for (const embed of findLabeledEmbeds(raw)) {
		const set = sets.get(embed.label);
		if (set) {
			diagrams.push(cardOcclusion(embed.target, set, ""));
			occluded.add(embed.label);
		}
	}
	if (diagrams.length > 0) {
		return { diagrams, prose: stripEmbedLabels(stripLabeledEmbeds(raw, occluded)).trim() };
	}

	// A single-embed fence carries no `{label}` and stores its shapes under the
	// bare `occlude:` key — a label is text in the user's own file and only
	// earns its keep once there are two diagrams to tell apart.
	const set = sets.get("");
	const image = findFirstEmbed(raw);
	if (!set || image === null) return { diagrams: [], prose: "" };
	return {
		diagrams: [cardOcclusion(image, set, "")],
		prose: stripEmbedLabels(stripEmbeds(raw)).trim(),
	};
}

/**
 * Every `cN` group label already in use anywhere in a fence, across all of its
 * shape sets — what a newly drawn mask must number above.
 *
 * A fence derives its occlusion card IDs as `<fenceId>-cN` over *all* of its
 * labelled embeds, so two diagrams in one fence that each numbered from `c1`
 * would derive the same IDs and the second card would overwrite the first in
 * the store. Allocation is therefore per fence, not per diagram.
 */
export function usedGroupsInFence(lines: readonly string[], span: FenceSpan): string[] {
	const groups = new Set<string>();
	for (const set of fenceOcclusions(lines, span).values()) {
		for (const shape of set.shapes) groups.add(shape.group);
	}
	return [...groups];
}

/** Where an image the editor was invoked on stores its shapes. */
export interface OcclusionTarget {
	/** Which carrier holds the shape set. */
	carrier: "fence" | "line";
	/** The embed's link target as written, e.g. "diagrams/bridge.png". */
	image: string;
	/** 0-based line the embed sits on. */
	line: number;
	/** Fence carrier: the fence's extent. */
	span?: FenceSpan;
	/** Fence carrier: the fence's `id:`, or null when it has none yet. */
	id?: string | null;
	/** Fence carrier: the embed's `{label}`, or null when it carries none yet. */
	label?: string | null;
	/** Line carrier: the line's block ID, or null when it has none yet. */
	blockId?: string | null;
}

/** The trailing ` ^block-id` on a line, without the caret. */
const TRAILING_BLOCK_ID_REGEX = /\s\^([a-zA-Z0-9-]+)\s*$/;

/**
 * Work out where an image on `line` should store its shapes, or null when the
 * line holds no image embed.
 *
 * Reports what is *there*, not what needs creating — a fence with no `id:`, or
 * an embed with no `{label}`, comes back null-valued so the caller can mint one
 * and write it. Keeping that split means this function stays pure and the file
 * is touched exactly once, by the caller, rather than twice.
 */
export function locateOcclusionTarget(content: string, line: number): OcclusionTarget | null {
	const lines = content.split("\n");
	const raw = lines[line];
	if (raw === undefined) return null;

	ANY_EMBED_REGEX.lastIndex = 0;
	const embed = ANY_EMBED_REGEX.exec(raw);
	const image = (embed?.[1] ?? embed?.[2])?.trim();
	if (image === undefined) return null;

	const span = enclosingOsmosisFence(lines, line);
	if (span) {
		const labeled = findLabeledEmbeds(raw);
		return {
			carrier: "fence",
			image,
			line,
			span,
			id: fenceId(lines, span),
			// Several embeds can share a line; the label that belongs to this one
			// is the one whose target matches.
			label: labeled.find((entry) => entry.target === image)?.label ?? null,
		};
	}

	return {
		carrier: "line",
		image,
		line,
		blockId: TRAILING_BLOCK_ID_REGEX.exec(raw)?.[1] ?? null,
	};
}

/**
 * The first label not already bound in a fence: `a`, `b`, … then `a1`, `a2`, …
 *
 * Letters rather than numbers because the label names the *embed*, while `cN`
 * names a shape group, and the two appear side by side in the header. Mixing
 * both numbering schemes would make `occlude-1:`/`group: c1` read as related
 * when they are not.
 */
export function nextEmbedLabel(used: Iterable<string>): string {
	const taken = new Set(used);
	for (let round = 0; ; round++) {
		for (let i = 0; i < 26; i++) {
			const label = String.fromCharCode(97 + i) + (round === 0 ? "" : String(round));
			if (!taken.has(label)) return label;
		}
	}
}

/**
 * Add `{label}` to the embed for `image` on `line`, leaving an embed that
 * already carries one untouched.
 *
 * The marker is what binds the embed to its shapes, and it is written into the
 * user's file — so it has to survive rendering, which is `stripEmbedLabels`'
 * job on every study surface.
 */
export function labelEmbed(content: string, line: number, image: string, label: string): string {
	const lines = content.split("\n");
	const raw = lines[line];
	if (raw === undefined) return content;

	let done = false;
	lines[line] = raw.replace(
		/(!\[\[([^\]|#^]+)(?:[|#^][^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\))(\{[A-Za-z0-9_-]+\})?/g,
		(full, embed: string, wiki: string | undefined, md: string | undefined, existing: string | undefined) => {
			if (done || existing !== undefined) return full;
			if ((wiki ?? md ?? "").trim() !== image) return full;
			done = true;
			return `${embed}{${label}}`;
		},
	);
	return done ? lines.join("\n") : content;
}

/**
 * Add `id: <id>` to a fence that declares none, directly under its opening
 * line — where `explicit.ts` reads header keys from.
 */
export function labelFence(content: string, span: FenceSpan, id: string): string {
	const lines = content.split("\n");
	lines.splice(span.start + 1, 0, `id: ${id}`);
	return lines.join("\n");
}

/** Every image embed in a note, with the line it sits on. */
export function embedLines(content: string): { line: number; target: string }[] {
	const found: { line: number; target: string }[] = [];
	content.split("\n").forEach((raw, line) => {
		ANY_EMBED_REGEX.lastIndex = 0;
		for (const match of raw.matchAll(ANY_EMBED_REGEX)) {
			const target = (match[1] ?? match[2])?.trim();
			if (target !== undefined) found.push({ line, target });
		}
	});
	return found;
}

/**
 * Which of an image's embeds a menu was raised over, or null.
 *
 * A note can embed the same image more than once — deliberately, since each
 * instance carries its own masks — so the file the menu hands us cannot say on
 * its own which one was clicked. `at` is the document line the click resolved
 * to, and the nearest candidate to it wins; ties go to the earlier embed, so
 * the answer never depends on list order.
 *
 * With no line to go on, a single candidate is still unambiguous, but several
 * are not: null then, so the caller can withhold the menu item rather than open
 * the editor on the wrong diagram's shapes. Same reasoning as `fenceEmbedLine`.
 */
export function pickEmbedLine(candidates: readonly number[], at: number | null): number | null {
	if (candidates.length <= 1) return candidates[0] ?? null;
	if (at === null) return null;
	return candidates.reduce((best, line) => {
		const closer = Math.abs(line - at) - Math.abs(best - at);
		return closer < 0 || (closer === 0 && line < best) ? line : best;
	});
}

/** How many image embeds a fence's body holds. */
export function countFenceEmbeds(lines: readonly string[], span: FenceSpan): number {
	let count = 0;
	for (let i = span.start + 1; i < span.end; i++) {
		ANY_EMBED_REGEX.lastIndex = 0;
		count += [...lines[i]!.matchAll(ANY_EMBED_REGEX)].length;
	}
	return count;
}

/** A fence's identity for occlusion, after anything missing has been minted. */
export interface FenceIdentity {
	/** The note's markdown, with any minted `id:` and `{label}` written in. */
	content: string;
	/** The fence's `id:` — the base every card it generates derives from. */
	id: string;
	/** The embed's label, or `""` for the bare `occlude:` single-embed form. */
	label: string;
}

/**
 * Give a fence whatever identity an occlusion needs and it does not yet have:
 * an `id:` for the fence, and a `{label}` marker on the embed.
 *
 * Both are minted lazily and only here, at save time, so cancelling the editor
 * leaves the note untouched. A fence holding a single embed is deliberately
 * left unlabelled and uses the bare `occlude:` spelling — a label only earns
 * its keep once there are two diagrams to tell apart, and it is text the user
 * sees in their own file.
 *
 * Returns null when `line` is not inside a fence. `mintId` is injected so the
 * function stays pure and its output is assertable.
 */
export function ensureFenceIdentity(
	content: string,
	line: number,
	image: string,
	mintId: () => string,
): FenceIdentity | null {
	let lines = content.split("\n");
	let span = enclosingOsmosisFence(lines, line);
	if (!span) return null;

	let next = content;
	let embedLine = line;

	let id = fenceId(lines, span);
	if (id === null) {
		id = mintId();
		next = labelFence(next, span, id);
		// The inserted `id:` line pushes everything below it down by one.
		embedLine += 1;
		lines = next.split("\n");
		span = enclosingOsmosisFence(lines, embedLine)!;
	}

	const labelled = findLabeledEmbeds(lines[embedLine] ?? "");
	let label = labelled.find((entry) => entry.target === image)?.label ?? "";

	if (label === "" && countFenceEmbeds(lines, span) > 1) {
		const taken = findLabeledEmbeds(lines.slice(span.start, span.end + 1).join("\n"))
			.map((entry) => entry.label);
		label = nextEmbedLabel(taken);
		next = labelEmbed(next, embedLine, image, label);
	}

	return { content: next, id, label };
}

/**
 * An embed target reduced to its file path: percent-decoded, with any `|300`
 * sizing suffix, `#heading`, or `^block` reference dropped.
 *
 * Obsidian writes the link *as authored* into an embed's `src` attribute, so
 * matching a rendered image back to its source line means comparing the two
 * spellings on equal terms.
 */
export function normalizeEmbedTarget(target: string): string {
	return decodeEmbedTarget(target).split(/[|#^]/)[0]!.trim();
}

/**
 * The line within a fence's content holding the embed for `target`, or null.
 *
 * Null when nothing matches *and* when several embeds do: a fence can hold the
 * same diagram twice, and the target alone cannot say which one was clicked.
 * That ambiguity is the whole reason shapes bind by `{label}` rather than by
 * filename — but a fence with no occlusion yet has no labels to disambiguate
 * with, so the honest answer is to decline rather than guess and attach the
 * shapes to the wrong diagram.
 */
export function fenceEmbedLine(source: string, target: string): number | null {
	const want = normalizeEmbedTarget(target);
	const matches = embedLines(source).filter(
		(embed) => normalizeEmbedTarget(embed.target) === want,
	);
	return matches.length === 1 ? matches[0]!.line : null;
}

/** Markdown-style embeds percent-encode spaces; wikilinks do not. */
export function decodeEmbedTarget(target: string): string {
	if (!target.includes("%")) return target;
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

// ── Rename rewriting ──────────────────────────────────────────

/**
 * Rewrite image embeds inside ```osmosis fences when their file is renamed.
 *
 * Obsidian's metadata cache deliberately does not index links inside code
 * fences — that is exactly why `[[example]]` in a code block renders as
 * literal text rather than a link. So an embed inside an osmosis fence is
 * invisible to Obsidian's rename handling, whatever spelling it uses, and the
 * masks would end up pointing at a file that no longer exists.
 *
 * Line cards need none of this: their embed is ordinary Markdown outside any
 * fence, so Obsidian already rewrites it.
 *
 * `resolve` maps a link target as written to its replacement, or null to leave
 * it alone. Link resolution needs the metadata cache (shortest-path links,
 * duplicate basenames), which belongs to the caller, not to a pure function.
 */
export function rewriteFenceEmbeds(
	content: string,
	resolve: (target: string) => string | null,
): string {
	const lines = content.split("\n");
	let changed = false;
	let i = 0;

	while (i < lines.length) {
		const openMatch = lines[i]!.replace(/\s*<!--.*?-->/g, "").trim().match(FENCE_OPEN_REGEX);
		if (!openMatch) {
			i++;
			continue;
		}

		const backticks = openMatch[1]!.length;
		i++;
		while (i < lines.length) {
			const closeMatch = lines[i]!.trim().match(/^(`{3,})\s*$/);
			if (closeMatch && closeMatch[1]!.length >= backticks) {
				i++;
				break;
			}
			const rewritten = rewriteEmbedsInLine(lines[i]!, resolve);
			if (rewritten !== lines[i]) {
				lines[i] = rewritten;
				changed = true;
			}
			i++;
		}
	}

	return changed ? lines.join("\n") : content;
}

/** Replace embed targets on one line, preserving sizing suffixes and labels. */
function rewriteEmbedsInLine(line: string, resolve: (target: string) => string | null): string {
	return line
		.replace(/!\[\[([^\]|#^]+)((?:[|#^][^\]]*)?)\]\]/g, (full, target: string, suffix: string) => {
			const next = resolve(target.trim());
			return next === null ? full : `![[${next}${suffix}]]`;
		})
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt: string, target: string) => {
			const next = resolve(target.trim());
			return next === null ? full : `![${alt}](${next})`;
		});
}

// ── Shared helpers ────────────────────────────────────────────

function toFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function num(value: number): number {
	return Math.round(value * 10000) / 10000;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}
