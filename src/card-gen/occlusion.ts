import type {
	CardOcclusion,
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
 * Drop whole labelled embeds other than `keepLabel`, and strip the surviving
 * label. A fence can carry several diagrams; a card asking about one of them
 * must not show the others.
 */
export function isolateEmbed(content: string, keepLabel: string): string {
	const withoutOthers = content.replace(
		LABELED_EMBED_REGEX,
		(full, _t1: string | undefined, l1: string | undefined, _t2: string | undefined, l2: string | undefined) =>
			(l1 ?? l2) === keepLabel ? full : "",
	);
	return stripEmbedLabels(withoutOthers);
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

/** Parse the indented body of an occlude block: `mode:` and a `shapes:` list. */
function parseOccludeBody(body: readonly string[]): OcclusionSet {
	let mode = DEFAULT_OCCLUSION_MODE;
	const shapes: OcclusionShape[] = [];
	let inShapes = false;

	for (let i = 0; i < body.length; i++) {
		const raw = body[i]!;
		const line = raw.trim();
		if (line === "") continue;

		const modeMatch = line.match(/^mode\s*:\s*(\S+)\s*$/);
		if (modeMatch) {
			mode = parseMode(modeMatch[1]!);
			inShapes = false;
			continue;
		}

		if (/^shapes\s*:\s*$/.test(line)) {
			inShapes = true;
			continue;
		}

		if (inShapes && line.startsWith("-")) {
			const rest = line.slice(1).trim();

			// Flow mapping — `- { group: c1, kind: rect, … }`. Every note written
			// before shapes moved to block mappings uses this spelling, so it
			// stays readable indefinitely; only the writer changed.
			if (rest.startsWith("{")) {
				const shape = parseShape(parseFlowValue(rest));
				if (shape) shapes.push(shape);
				continue;
			}

			// Block mapping — the first key rides the `-`, the rest follow
			// indented past it.
			const indent = leadingWhitespace(raw);
			const entry = [rest];
			while (i + 1 < body.length && leadingWhitespace(body[i + 1]!) > indent) {
				entry.push(body[++i]!.trim());
			}
			const shape = parseShape(parseBlockMapping(entry));
			if (shape) shapes.push(shape);
			continue;
		}

		// Anything else is a key this version does not know about. Skipping it
		// rather than bailing keeps a note written by a newer Osmosis loadable.
	}

	return { mode, shapes };
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

	return { mode: parseMode(raw["mode"]), shapes };
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

	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
	) {
		return trimmed.slice(1, -1);
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
			if (char === quote) quote = null;
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
	return [
		`occlude${label === "" ? "" : `-${label}`}:`,
		`  mode: ${set.mode}`,
		"  shapes:",
		...set.shapes.flatMap((shape) => serializeShape(shape)),
	];
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
	return fields.map((field, idx) => (idx === 0 ? `    - ${field}` : `      ${field}`));
}

/** Serialize a shape set to the plain object the frontmatter carrier stores. */
export function occlusionSetToYamlValue(set: OcclusionSet): Record<string, unknown> {
	return {
		mode: set.mode,
		shapes: set.shapes.map((shape) => {
			switch (shape.kind) {
				case "rect":
					return { group: shape.group, kind: "rect", x: num(shape.x), y: num(shape.y), w: num(shape.w), h: num(shape.h) };
				case "ellipse":
					return { group: shape.group, kind: "ellipse", x: num(shape.x), y: num(shape.y), rx: num(shape.rx), ry: num(shape.ry) };
				case "poly":
					return { group: shape.group, kind: "poly", points: shape.points.map(([x, y]) => [num(x), num(y)]) };
			}
		}),
	};
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
	return { image, mode: set.mode, shapes: set.shapes, target };
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

// ── Rename rewriting ──────────────────────────────────────────

/** Matches an osmosis fence opening, capturing its backtick run. */
const FENCE_OPEN_REGEX = /^(`{3,})osmosis\s*$/;

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
