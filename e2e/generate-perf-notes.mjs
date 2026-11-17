// Generates the Mind Map benchmark notes: "Perf 10k" (about 10,000 lines, for
// desktop) and "Perf 3k" (about 3,000, for phones). Deterministic, so a rerun
// rewrites the same bytes. Open either in the 2D Mind Map or the 3D graph and
// turn on the perf gauge (top-left corner).
//
//   node e2e/generate-perf-notes.mjs
//
// Writes e2e/fixtures/perf/ (the master copy) and copies it to
// vault/tests/perf/. Both are gitignored. Reload Obsidian afterwards.
//
// Each note mixes headings at depths 1–5, nested lists, prose, adjacent-line
// groups (two or more lines with no blank line between: one node each),
// code blocks, callouts, tables, images from vault/media, block references
// and wikilinks. `buildPerfNote` is exported for the vitest benchmarks.

import { mkdirSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORDS = ("rope sail mast keel tack jib boom cleat halyard sheet mooring buoy chart tide " +
	"current knot bearing compass harbour anchor rudder tiller hull deck bow stern wake " +
	"gauge valve piston gear shaft bearing flange bolt torque spring lever crank pulley " +
	"ledger budget invoice margin audit forecast quarter balance asset ledger column total " +
	"canvas pigment glaze brush easel palette sketch frame light shade tone hue").split(" ");
const TOPICS = ["Rigging", "Navigation", "Engine Room", "Bookkeeping", "Painting", "Harbour Log", "Workshop", "Weather"];
const IMAGES = ["3d-graph-feedback-force-0.25.png", "2026-10-31 3D graph title plate order.png", "Pasted image 20260316060949.png"];
const LANGS = ["ts", "python", "text"];

// mulberry32: a tiny seeded PRNG, so the note is the same on every run.
function rng(seed) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function sentence(rand, min, max) {
	const n = min + Math.floor(rand() * (max - min + 1));
	const words = [];
	for (let i = 0; i < n; i++) words.push(WORDS[Math.floor(rand() * WORDS.length)]);
	const style = rand();
	if (style < 0.08) words[0] = `**${words[0]}**`;
	else if (style < 0.14) words[0] = `*${words[0]}*`;
	else if (style < 0.2) words[words.length - 1] = `\`${words[words.length - 1]}\``;
	const text = words.join(" ");
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One note of about `size` lines titled `title`. `other` is the sibling
 * benchmark note it links to. Every 50th list item carries a block ID
 * (`^b50`, `^b100`, …), and every 30th links back to an earlier one.
 */
export function buildPerfNote(title, size, other, seed) {
	const rand = rng(seed);
	const lines = [`# ${title}`, ""];
	let item = 0;
	let block = 0;
	let image = 0;
	// -1 after anything but a list item, so a list always starts at the left margin.
	let depth = -1;
	for (; lines.length < size; block++) {
		const before = lines.length;
		const kind = block % 24;
		if (block % 120 === 0) lines.push("", `## ${TOPICS[(block / 120) % TOPICS.length]} ${Math.floor(block / 120) + 1}`, "");
		else if (kind === 1) lines.push("", `### ${sentence(rand, 2, 4)}`, "");
		else if (kind === 7) lines.push("", `#### ${sentence(rand, 2, 4)}`, "");
		else if (kind === 13) lines.push("", `##### ${sentence(rand, 2, 3)}`, "");
		else if (kind === 3) lines.push("", sentence(rand, 12, 30), "");
		else if (kind === 5 || kind === 17) {
			// An adjacent-line group: 2–4 lines with no blank line between.
			const n = 2 + Math.floor(rand() * 3);
			lines.push("");
			for (let i = 0; i < n; i++) lines.push(sentence(rand, 5, 14));
			lines.push("");
		} else if (kind === 9) lines.push("", `> [!tip] ${sentence(rand, 2, 5)}`, `> ${sentence(rand, 6, 14)}`, `> ${sentence(rand, 6, 14)}`, "");
		else if (kind === 11) {
			const lang = LANGS[block % LANGS.length];
			lines.push("", `\`\`\`${lang}`);
			for (let i = 0, n = 3 + Math.floor(rand() * 6); i < n; i++) lines.push(`${"  ".repeat(i % 3)}${sentence(rand, 3, 8).toLowerCase()}`);
			lines.push("```", "");
		} else if (kind === 15) lines.push("", "| Item | Detail | Count |", "| --- | --- | --- |", `| ${sentence(rand, 1, 2)} | ${sentence(rand, 3, 6)} | ${block} |`, `| ${sentence(rand, 1, 2)} | ${sentence(rand, 3, 6)} | ${block + 1} |`, "");
		else if (kind === 19 && block % 240 === 19) lines.push("", `![[${IMAGES[image++ % IMAGES.length]}]]`, "");
		else {
			item++;
			depth = Math.min(depth + 1, Math.floor(rand() * 4));
			let text = sentence(rand, 3, rand() < 0.05 ? 40 : 12);
			if (item % 25 === 0) text += ` see [[${other}]]`;
			if (item % 30 === 0 && item > 50) text += ` (from [[#^b${Math.floor((item - 30) / 50) * 50 || 50}]])`;
			if (item % 50 === 0) text += ` ^b${item}`;
			lines.push(`${"\t".repeat(depth)}- ${text}`);
		}
		if (lines.length - before > 1) depth = -1;
	}
	return lines.join("\n") + "\n";
}

const NOTES = [
	["Perf 10k", 10000, "Perf 3k", 10],
	["Perf 3k", 3000, "Perf 10k", 3],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = dirname(dirname(fileURLToPath(import.meta.url)));
	const master = join(root, "e2e/fixtures/perf");
	const vaultCopy = join(root, "vault/tests/perf");
	rmSync(master, { recursive: true, force: true });
	mkdirSync(master, { recursive: true });
	for (const [title, size, other, seed] of NOTES) {
		const text = buildPerfNote(title, size, other, seed);
		writeFileSync(join(master, `${title}.md`), text);
		console.log(`${title}: ${text.split("\n").length - 1} lines`);
	}
	rmSync(vaultCopy, { recursive: true, force: true });
	cpSync(master, vaultCopy, { recursive: true });
	console.log(`Wrote ${master} and ${vaultCopy}`);
}
