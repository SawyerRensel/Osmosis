/**
 * How 3D graph nodes and edges look: sprite label text and colours. Colour is
 * by note for now; the Overlays menu (Phase 5) adds the other colour modes.
 */

import type { GraphEdgeKind, GraphNode } from "./model";

/**
 * The first words of a line, as plain text for a sprite. Sprites can't render
 * Markdown, so link syntax collapses to its display text and inline markers go.
 * A code block's fence line and a callout's `> [!type]` prefix are skipped, so
 * the label shows what the line says rather than how it's written.
 */
export function spriteLabel(text: string, maxChars = 32): string {
	const line = text
		.split("\n")
		.map((l) => l.replace(/^\s*>\s?/, "").replace(/^\[![^\]]*\][+-]?\s*/, "").trim())
		.find((l) => l !== "" && !/^(```|~~~)/.test(l)) ?? "";
	const plain = line
		.replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
		.replace(/!?\[\[([^\]#]*)(#[^\]]*)?\]\]/g, (_, path: string, sub: string | undefined) =>
			path !== "" ? path : (sub ?? "").replace(/^#\^?/, ""))
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/(\*\*|__|==|~~|`)/g, "")
		.replace(/^\|\s*|\s*\|$/g, "")
		.replace(/\s*\|\s*/g, " · ")
		.replace(/\s+/g, " ")
		.trim();
	if (plain.length <= maxChars) return plain;
	const cut = plain.slice(0, maxChars);
	const space = cut.lastIndexOf(" ");
	return `${(space > maxChars / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A stable hue per note path, so a note keeps its colour between sessions. */
export function noteHue(path: string): number {
	let hash = 5381;
	for (let i = 0; i < path.length; i++) hash = ((hash << 5) + hash + path.charCodeAt(i)) | 0;
	return (hash >>> 0) % 360;
}

export function nodeColor(node: GraphNode): string {
	switch (node.kind) {
		case "note":
			return `hsl(${noteHue(node.path ?? "")}, 80%, 72%)`;
		case "line":
			return `hsl(${noteHue(node.path ?? "")}, 55%, 58%)`;
		case "tag":
			return "hsl(45, 90%, 60%)";
		case "attachment":
			return "hsl(190, 45%, 60%)";
		case "ghost":
			return "hsl(0, 0%, 45%)";
	}
}

/** Relative size: the note core is the largest, so lines visibly orbit it. */
export function nodeSize(node: GraphNode): number {
	switch (node.kind) {
		case "note":
			return 12;
		case "tag":
			return 4;
		case "attachment":
			return 3;
		case "ghost":
			return 2;
		case "line":
			return 1;
	}
}

export function edgeColor(kind: GraphEdgeKind): string {
	switch (kind) {
		case "hierarchy":
			return "hsl(0, 0%, 55%)";
		case "link":
			return "hsl(220, 70%, 65%)";
		case "embed":
			return "hsl(280, 60%, 65%)";
		case "property":
			return "hsl(160, 55%, 55%)";
		case "tag":
			return "hsl(45, 70%, 55%)";
		case "attachment":
			return "hsl(190, 45%, 55%)";
	}
}

/**
 * Rest length per edge kind. Hierarchy is short, so each note reads as a mind
 * map up close; links are longer and looser, the organic web; embeds sit in
 * between and pull their clusters together.
 */
export function edgeDistance(kind: GraphEdgeKind): number {
	switch (kind) {
		case "hierarchy":
			return 18;
		case "embed":
			return 45;
		case "tag":
		case "attachment":
			return 50;
		case "link":
		case "property":
			return 80;
	}
}
