#!/usr/bin/env node
/**
 * Write a synthetic review log into the dev vault, so the stats dashboard can
 * be tested against a full year of history without waiting a year for one.
 *
 * The generated shards are real `.jsonl` files in the log folder and are
 * gitignored (`vault/**\/*.jsonl`), which is why the *generator* is committed
 * and its output is not. Only this script is a fixture; the data is disposable.
 *
 *   node e2e/fixtures/generate-review-log.mjs            # 400 days, ~6k reviews
 *   node e2e/fixtures/generate-review-log.mjs --days 60
 *   node e2e/fixtures/generate-review-log.mjs --clean    # remove them again
 *
 * Card IDs are deliberately synthetic and will not resolve against the vault's
 * real cards. That is the point of one of the things worth testing: volume
 * graphs must still count reviews of cards that no longer exist, while any
 * deck-scoped view correctly shows nothing for them.
 */

import {
	mkdirSync,
	writeFileSync,
	readdirSync,
	rmSync,
	existsSync,
	readFileSync,
	statSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * The log folder is a setting, so read it rather than assuming the default —
 * writing to `Osmosis/Reviews` when the vault is configured for `Study/History`
 * produces a fixture the plugin never looks at, which reads as "the dashboard
 * is broken" rather than "the fixture went to the wrong place".
 */
function resolveLogFolder() {
	const settingsPath = join("vault", ".obsidian", "plugins", "Osmosis", "data.json");
	try {
		const folder = JSON.parse(readFileSync(settingsPath, "utf8")).reviewLogFolder;
		if (typeof folder === "string" && folder.trim() !== "") {
			return join("vault", ...folder.split("/"));
		}
	} catch {
		// No settings yet — the plugin has never run in this vault.
	}
	return join("vault", "Osmosis", "Reviews");
}

const LOG_FOLDER = resolveLogFolder();
const DEVICE = "fixture";
const INSTALL = "fixture-install";
const MATURE_SECONDS = 21 * 86_400;

const args = process.argv.slice(2);
const clean = args.includes("--clean");
const daysArg = args.indexOf("--days");
const totalDays = daysArg === -1 ? 400 : Number(args[daysArg + 1]);

if (clean) {
	if (existsSync(LOG_FOLDER)) {
		for (const name of readdirSync(LOG_FOLDER)) {
			if (name.endsWith(`.${DEVICE}.jsonl`)) rmSync(join(LOG_FOLDER, name));
		}
	}
	console.log(`Removed ${DEVICE} shards from ${LOG_FOLDER}`);
	process.exit(0);
}

if (!Number.isFinite(totalDays) || totalDays <= 0) {
	console.error("--days needs a positive number");
	process.exit(1);
}

/**
 * Harvest the vault's real card IDs.
 *
 * Synthetic IDs would leave every card-joined graph empty — Answer buttons,
 * Recall by card type, Weakest notes all resolve a review back to its card, and
 * an ID that matches nothing resolves to nothing. Borrowing the vault's own IDs
 * is what makes those panels testable.
 *
 *   line cards:  `<notePath>#^<blockId>`, from a trailing `^os-…` marker
 *   fence cards: the fence's own `id:`, plus `-r` for a bidirectional reverse
 */
function harvestCardIds(root) {
	const ids = [];

	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			if (name.startsWith(".")) continue;
			const path = join(dir, name);
			if (statSync(path).isDirectory()) {
				walk(path);
				continue;
			}
			if (!name.endsWith(".md")) continue;

			const notePath = relative(root, path).split(sep).join("/");
			const text = readFileSync(path, "utf8");

			for (const match of text.matchAll(/^.*?\s\^(os-[a-z0-9]+)\s*$/gm)) {
				ids.push(`${notePath}#^${match[1]}`);
			}

			let inFence = false;
			for (const line of text.split("\n")) {
				if (line.startsWith("```osmosis")) inFence = true;
				else if (inFence && line.startsWith("```")) inFence = false;
				else if (inFence) {
					const match = /^id:\s*([A-Za-z0-9_-]+)\s*$/.exec(line);
					if (match) ids.push(match[1]);
				}
			}
		}
	};

	try {
		walk(root);
	} catch {
		// An unreadable vault just means synthetic IDs below.
	}
	return [...new Set(ids)];
}

/** Deterministic PRNG, so two runs produce the same log and bugs reproduce. */
let seed = 20260807;
function random() {
	seed = (seed * 1664525 + 1013904223) % 4294967296;
	return seed / 4294967296;
}

const MODES = ["sequential", "contextual", "spatial"];
const shards = new Map();

const realIds = harvestCardIds("vault");
/**
 * A tail of unresolvable IDs is deliberate: reviews of deleted cards must still
 * count in the volume graphs, and the card-joined graphs must say how many they
 * had to leave out. Keeping a few makes both behaviours visible.
 */
const cardIds =
	realIds.length === 0
		? Array.from({ length: 400 }, (_, i) => `os-fx${String(i).padStart(4, "0")}`)
		: [...realIds, ...Array.from({ length: 20 }, (_, i) => `os-deleted-${String(i)}`)];

/** Cards accumulate an interval over time, so maturity actually develops. */
const cards = new Map();

const now = new Date();
for (let dayOffset = totalDays - 1; dayOffset >= 0; dayOffset--) {
	const day = new Date(now);
	day.setDate(day.getDate() - dayOffset);

	// Weekends lighter, plus stretches of nothing — a flat log makes the
	// heatmap and the streak counters untestable.
	const weekend = day.getDay() === 0 || day.getDay() === 6;
	if (random() < (weekend ? 0.45 : 0.12)) continue;

	const reviews = Math.floor(random() * (weekend ? 15 : 45)) + 1;

	for (let i = 0; i < reviews; i++) {
		// Clustered around morning and evening, so the hourly graph has shape.
		const hour = random() < 0.55
			? 7 + Math.floor(random() * 4)
			: 19 + Math.floor(random() * 4);
		const t = new Date(day);
		t.setHours(hour, Math.floor(random() * 60), Math.floor(random() * 60), 0);

		const cardId = cardIds[Math.floor(random() * cardIds.length)];
		const previous = cards.get(cardId) ?? { iv: 0 };

		const rating = pickRating(previous.iv);
		const state = nextState(rating, previous.iv);
		const iv = nextInterval(previous.iv, rating);
		cards.set(cardId, { iv });

		const month = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
		const line = JSON.stringify({
			t: t.getTime(),
			c: cardId,
			r: rating,
			s: state,
			iv,
			st: Math.round((iv / 86_400) * 1.4 * 10000) / 10000,
			d: Math.round((2 + random() * 7) * 10000) / 10000,
			e: Math.floor(2000 + random() * 12_000),
			m: MODES[Math.floor(random() * MODES.length)],
		});

		const shard = shards.get(month) ?? [];
		shard.push(line);
		shards.set(month, shard);
	}
}

/** Mature cards are answered well more often — otherwise retention is noise. */
function pickRating(priorIv) {
	const roll = random();
	if (priorIv >= MATURE_SECONDS) {
		if (roll < 0.09) return 1;
		if (roll < 0.24) return 2;
		if (roll < 0.85) return 3;
		return 4;
	}
	if (roll < 0.24) return 1;
	if (roll < 0.42) return 2;
	if (roll < 0.9) return 3;
	return 4;
}

function nextState(rating, priorIv) {
	if (rating === 1) return priorIv >= 86_400 ? "relearning" : "learning";
	if (priorIv < 600) return "learning";
	return "review";
}

function nextInterval(priorIv, rating) {
	if (rating === 1) return 600;
	if (priorIv < 600) return 86_400;
	const factor = rating === 2 ? 1.2 : rating === 3 ? 2.3 : 3.4;
	return Math.min(Math.round(priorIv * factor), 365 * 86_400);
}

mkdirSync(LOG_FOLDER, { recursive: true });

let written = 0;
for (const [month, lines] of shards) {
	const header = JSON.stringify({ device: DEVICE, install: INSTALL, v: 1 });
	writeFileSync(
		join(LOG_FOLDER, `${month}.${DEVICE}.jsonl`),
		`${header}\n${lines.join("\n")}\n`,
	);
	written += lines.length;
}

console.log(
	`Wrote ${written} reviews across ${shards.size} shards into ${LOG_FOLDER},\n` +
		`drawn from ${realIds.length} real card IDs harvested from the vault.\n` +
		"Reload Obsidian (or the plugin) so the rollup cache picks them up.",
);
