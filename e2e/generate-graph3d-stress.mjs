// Generates the 3D graph stress web: large notes linked together, for
// measuring label and frame cost. Deterministic, so a rerun rewrites the same
// bytes.
//
//   node e2e/generate-graph3d-stress.mjs
//
// Writes e2e/fixtures/graph3d-stress/ (the master copy) and copies it to
// vault/tests/graph3d-stress/. Reload Obsidian afterwards.
//
// Shape, from "Stress Hub" (open the 3D graph there):
//   depth 1: the hub (1,000 lines) and 30 spokes of 400–3,000 lines
//   depth 2: 10 outer notes of 300 lines each, linked only from spokes

import { mkdirSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const master = join(root, "e2e/fixtures/graph3d-stress");
const vaultCopy = join(root, "vault/tests/graph3d-stress");

const SPOKES = [
	"Joinery", "Lathe Work", "Sharpening", "Wood Finishing", "Dovetails", "Hand Planes",
	"Bread Baking", "Knife Skills", "Stock Making", "Fermentation", "Pastry", "Sauces",
	"Star Charts", "Telescopes", "Lunar Phases", "Eclipses", "Planet Spotting", "Light Pollution",
	"Music Theory", "Chord Voicing", "Rhythm Drills", "Ear Training", "Scales", "Counterpoint",
	"Bookbinding", "Letterpress", "Paper Making", "Calligraphy", "Map Reading", "Orienteering",
];
const SIZES = [400, 800, 1500, 3000, 1000];
const OUTER = ["Tool Care", "Kitchen Safety", "Night Sky Log", "Practice Journal", "Studio Notes",
	"Supply List", "Glossary", "Field Notes", "Reading List", "Project Ideas"];
const HUB = "Stress Hub";
const TAGS = ["#stress/craft", "#stress/kitchen", "#stress/sky", "#stress/music", "#stress/paper"];
const WORDS = ("grain edge bevel jig clamp glue joint chisel mallet board rip cross cut sand oil wax " +
	"dough crust oven rise proof salt flour stock simmer reduce whisk fold chill bake rest " +
	"star orbit lens focus mount eyepiece filter horizon phase shadow dusk dawn zenith " +
	"chord note scale tempo beat bar key minor major interval voice line phrase rest " +
	"spine paper fold stitch press ink type plate margin north bearing contour compass").split(" ");

// mulberry32: a tiny seeded PRNG, so the web is the same on every run.
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
	// Inline formatting on some lines, as real notes have.
	if (style < 0.08) words[0] = `**${words[0]}**`;
	else if (style < 0.14) words[0] = `*${words[0]}*`;
	else if (style < 0.18) words[0] = `~~${words[0]}~~`;
	else if (style < 0.24) words[words.length - 1] = `\`${words[words.length - 1]}\``;
	const text = words.join(" ");
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One note of about `size` lines. `links` are note names this note links to;
 * one is placed on every 20th list item, cycling, and every third is a block reference.
 * Every 50th list item carries a block ID (`^b50`, `^b100`, …).
 */
function note(title, size, links, tag, seed) {
	const rand = rng(seed);
	const lines = [`# ${title}`, ""];
	let section = 0;
	let item = 0;
	let link = 0;
	// -1 after anything but a list item, so a list always starts at the left margin.
	let depth = -1;
	for (let block = 0; lines.length < size; block++) {
		const before = lines.length;
		if (block % 40 === 0) lines.push("", `## Section ${++section}`, "");
		else if (block % 12 === 0) lines.push("", `### ${sentence(rand, 2, 4)}`, "");
		else if (block % 60 === 30) lines.push("", `> [!note] ${sentence(rand, 2, 5)}`, `> ${sentence(rand, 6, 14)}`, `> ${sentence(rand, 6, 14)}`, "");
		else if (block % 90 === 45) lines.push("", "```text", sentence(rand, 4, 8), sentence(rand, 4, 8), "```", "");
		else if (block % 110 === 55) lines.push("", "| Step | Detail |", "| --- | --- |", `| ${sentence(rand, 1, 2)} | ${sentence(rand, 3, 6)} |`, `| ${sentence(rand, 1, 2)} | ${sentence(rand, 3, 6)} |`, "");
		else if (block % 25 === 11) lines.push("", sentence(rand, 12, 30), "");
		else {
			item++;
			depth = Math.min(depth + 1, Math.floor(rand() * 3));
			let text = sentence(rand, 3, rand() < 0.05 ? 40 : 12);
			if (item % 20 === 0 && links.length > 0) {
				const target = links[link++ % links.length];
				text += link % 3 === 0 ? ` see [[${target}#^b50]]` : ` see [[${target}]]`;
			}
			if (item % 40 === 20) text += ` ${tag}`;
			if (item % 50 === 0) text += ` ^b${item}`;
			lines.push(`${"\t".repeat(depth)}- ${text}`);
		}
		if (lines.length - before > 1) depth = -1;
	}
	return lines.join("\n") + "\n";
}

const files = new Map();
// The hub opens with a list of every spoke, so all 30 sit one hop out.
const contents = ["", "## Contents", "", ...SPOKES.map((title) => `- [[${title}]]`), ""].join("\n");
files.set(HUB, note(HUB, 1000, SPOKES, TAGS[0], 1).replace("\n", `\n${contents}\n`));
SPOKES.forEach((title, i) => {
	const links = [HUB, SPOKES[(i + 1) % SPOKES.length], OUTER[i % OUTER.length]];
	files.set(title, note(title, SIZES[i % SIZES.length], links, TAGS[Math.floor(i / 6)], 100 + i));
});
OUTER.forEach((title, i) => files.set(title, note(title, 300, [], TAGS[i % TAGS.length], 200 + i)));

rmSync(master, { recursive: true, force: true });
mkdirSync(master, { recursive: true });
let total = 0;
for (const [title, text] of files) {
	writeFileSync(join(master, `${title}.md`), text);
	total += text.split("\n").length - 1;
}
rmSync(vaultCopy, { recursive: true, force: true });
cpSync(master, vaultCopy, { recursive: true });
console.log(`Wrote ${files.size} notes, ${total} lines, to ${master} and ${vaultCopy}`);
