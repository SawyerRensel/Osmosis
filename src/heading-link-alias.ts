/**
 * Heading links picked from Obsidian's `[[` suggest get a display alias that
 * hides the heading's Osmosis block id. See
 * `vault/Planner/Heading links - Insert with a pipe alias that hides the block id.md`.
 *
 * Obsidian writes a picked heading into the link's subpath with `^` (and a few
 * other characters) turned into spaces, so a heading `` `defer` ^os-8vmwam ``
 * becomes ``[[#`defer` os-8vmwam]]`` and renders as "`defer` os-8vmwam". The
 * transaction filter below catches that insertion (Obsidian dispatches it as
 * `input.autocomplete`) and adds `|<heading without the id>`, leaving the
 * target exactly as Obsidian wrote it. Nothing typed by hand, and no existing
 * link, is ever touched: only the text the suggest has just inserted.
 */
/* eslint-disable-next-line import/no-extraneous-dependencies -- CodeMirror 6 ships inside Obsidian and is resolved from the host at runtime; it is a peer of the editor API, not a bundled dependency. */
import { EditorSelection, EditorState, type Extension, type TransactionSpec } from "@codemirror/state";
import { extractTrailingBlockId, isOsmosisBlockId } from "./block-id";
import { headingMatches } from "./heading-links";

export interface AliasedHeadingLink {
	/** The link with its alias, `[[target|alias]]`. */
	text: string;
	/** Offsets of the alias within `text`. */
	aliasFrom: number;
	aliasTo: number;
}

/**
 * `link` (a whole `[[target]]` as the suggest wrote it) with an alias hiding
 * the Osmosis block id of the heading it targets, or null when it is not such
 * a link: no heading subpath, a block reference, an alias already present, or
 * a heading without an `^os-` id. `headingsOf(linkpath)` lists the target
 * note's heading texts as Obsidian caches them (ids included), so the alias
 * keeps the characters the subpath dropped (`:`, `#`, `|`); when it returns
 * null, or no heading matches, the alias is the subpath minus its id.
 */
export function aliasHeadingLink(link: string, headingsOf: (linkpath: string) => readonly string[] | null): AliasedHeadingLink | null {
	const match = /^\[\[([^[\]|\n]*)\]\]$/.exec(link);
	if (match === null) return null;
	const target = match[1]!;
	const hash = target.indexOf("#");
	if (hash === -1) return null;
	const segment = target.slice(target.lastIndexOf("#") + 1);
	if (segment.trim() === "" || segment.trim().startsWith("^")) return null;
	const tail = /\s([A-Za-z0-9-]+)$/.exec(segment);
	if (tail === null || !isOsmosisBlockId(tail[1]!)) return null;

	let alias: string;
	const heading = headingsOf(target.slice(0, hash))?.find((h) => headingMatches(h, segment));
	if (heading !== undefined) {
		const id = extractTrailingBlockId(heading);
		// The link matched a heading whose text merely ends in "os-…".
		if (id === null || !isOsmosisBlockId(id.id)) return null;
		alias = id.stripped.trim();
	} else {
		alias = segment.slice(0, tail.index).trim();
	}
	// An alias holding link brackets would end or nest the link.
	if (alias === "" || /\[\[|\]\]|\]$/.test(alias)) return null;

	const aliasFrom = target.length + 3;
	return { text: `[[${target}|${alias}]]`, aliasFrom, aliasTo: aliasFrom + alias.length };
}

/**
 * A CodeMirror transaction filter that aliases a heading link the moment the
 * link suggest inserts it (see `aliasHeadingLink`). Embeds (`![[…]]`) are
 * skipped, as an alias does not change how they render. The cursor keeps its
 * place relative to the link: after `]]` when the pick was Enter or a click;
 * when Tab left it before `]]`, the alias is selected, as Obsidian does for
 * a link that carries one.
 */
export function headingLinkAliasFilter(headingsOf: (state: EditorState, linkpath: string) => readonly string[] | null): Extension {
	return EditorState.transactionFilter.of((tr) => {
		if (!tr.docChanged || !tr.isUserEvent("input.autocomplete")) return tr;
		const changes: { fromA: number; fromB: number; text: string }[] = [];
		tr.changes.iterChanges((fromA, _toA, fromB, _toB, inserted) => {
			changes.push({ fromA, fromB, text: inserted.toString() });
		});
		if (changes.length !== 1) return tr;
		const { fromA, fromB, text } = changes[0]!;
		if (tr.startState.sliceDoc(fromA - 1, fromA) === "!") return tr;
		const aliased = aliasHeadingLink(text, (linkpath) => headingsOf(tr.startState, linkpath));
		if (aliased === null) return tr;

		const at = fromB + aliased.aliasFrom - 1;
		const spec: TransactionSpec = { changes: { from: at, insert: aliased.text.slice(aliased.aliasFrom - 1, aliased.aliasTo) }, sequential: true };
		const main = tr.newSelection.main;
		if (main.empty && main.head === fromB + text.length - 2) {
			spec.selection = EditorSelection.single(fromB + aliased.aliasFrom, fromB + aliased.aliasTo);
		}
		return [tr, spec];
	});
}
