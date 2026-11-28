// Measures the near tier's per-frame script cost in Node: flat CSS2D panels
// (Organic) against tilted CSS3D panels (Planets mode, P3), with
// the same live panels over the same planet. It runs the real `CosmosNear`
// (`update`, which chooses and tilts the panels) and three's real
// `CSS2DRenderer` and `CSS3DRenderer` (`render`, which calls each panel's
// `place`: depth, occlusion holes, mask, veil), both every frame as the
// engine does, over a minimal fake DOM whose styles are plain objects.
//
//   npx esbuild e2e/measure-near-panels.ts --bundle --platform=node --format=esm --alias:obsidian=./src/test/obsidian-stub.ts --outfile=/tmp/osmosis-near.mjs
//   node /tmp/osmosis-near.mjs
//
// What it cannot see: the browser's own share (style recalc of the written
// transforms and masks, layout, compositing and rasterising the 3D layers).
// That needs the perf gauge (`CosmosPerf.ts`) in Obsidian.

import { PerspectiveCamera, Scene } from "three";
import { CosmosNear, type NearSource } from "../src/views/CosmosNear";
import { tangentFrame } from "../src/cosmos/planets";
import type { GraphNode } from "../src/cosmos/model";

class FakeElement {
	ownerDocument = { defaultView: { Element: FakeElement } };
	style: Record<string, string> = {};
	parentNode: FakeElement | null = null;
	childNodes: FakeElement[] = [];
	classList = { toggle: (): void => undefined, add: (): void => undefined };
	addClass(): void {}
	setAttribute(): void {}
	setCssStyles(styles: Record<string, string>): void {
		Object.assign(this.style, styles);
	}
	createDiv(): FakeElement {
		return this.appendChild(new FakeElement());
	}
	appendChild(child: FakeElement): FakeElement {
		child.parentNode = this;
		this.childNodes.push(child);
		return child;
	}
	remove(): void {
		if (this.parentNode !== null) this.parentNode.childNodes = this.parentNode.childNodes.filter((c) => c !== this);
		this.parentNode = null;
	}
	empty(): void {
		this.childNodes = [];
	}
	querySelector(): null {
		return null;
	}
	querySelectorAll(): FakeElement[] {
		return [];
	}
}
const g = globalThis as Record<string, unknown>;
g.document = { createElement: () => new FakeElement() };
g.createDiv = () => new FakeElement();
g.ResizeObserver = class {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
};

const LINE_PLATE_HEIGHT = 5;
const RADIUS = 400;
const PLATES = 800;
const FRAMES = 2000;
const WARM = 200;

// A planet: plates spread evenly over a sphere, each tangent, about a line of text wide.
const nodes: NearSource[] = [];
for (let i = 0; i < PLATES; i++) {
	const y = 1 - (2 * (i + 0.5)) / PLATES;
	const ring = Math.sqrt(1 - y * y);
	const angle = i * Math.PI * (3 - Math.sqrt(5));
	const normal = { x: ring * Math.cos(angle), y, z: ring * Math.sin(angle) };
	const text = `Reef the mainsail before the squall line ${i}`;
	const graph = { id: `line:${i}`, kind: "line", path: "Sailing.md", source: { raw: `- ${text}`, content: text } } as unknown as GraphNode;
	nodes.push({
		id: graph.id, graph, x: normal.x * RADIUS, y: normal.y * RADIUS, z: normal.z * RADIUS,
		opacity: 1, departing: false, color: { getStyle: () => "#88aacc" }, shape: { width: 40, height: LINE_PLATE_HEIGHT }, frame: tangentFrame(normal),
	});
}

// Star plates (tags) floating just above the camera's side of the planet, in front of
// the panels, so both modes have plates to cut out of them.
for (let i = 0; i < 40; i++) {
	const angle = (i / 40) * 2 * Math.PI;
	const at = { x: Math.cos(angle) * 25, y: 25 + Math.sin(angle) * 15, z: RADIUS + 15 + (i % 4) * 5 };
	const graph = { id: `tag:${i}`, kind: "tag" } as unknown as GraphNode;
	nodes.push({ id: graph.id, graph, ...at, opacity: 1, departing: false, color: { getStyle: () => "#ccaa88" }, shape: { width: 12, height: LINE_PLATE_HEIGHT } });
}

async function run(tilted: boolean, distance: number, enabled: boolean, budget: number): Promise<{ ms: number; panels: number; masked: number }> {
	const near = new CosmosNear(async () => {}, () => {}, CosmosNear.emWorld(LINE_PLATE_HEIGHT), () => ({ detail: 3, budget }));
	near.renderer.setSize(1600, 900);
	near.renderer3d.setSize(1600, 900);
	near.setTilted(tilted);
	near.setEnabled(enabled);
	const scene = new Scene();
	scene.add(near.group);
	const camera = new PerspectiveCamera(50, 1600 / 900, 1, 100000);
	const frame = (i: number): void => {
		// Hover over the planet, turning slowly, so every transform changes each frame.
		const a = i * 0.00005;
		camera.position.set(Math.sin(a) * (RADIUS + distance), 60, Math.cos(a) * (RADIUS + distance));
		camera.lookAt(0, 0, 0);
		camera.updateMatrixWorld();
		near.update(nodes, camera, distance, 0.25 / Math.max(150, distance), 1 / 60);
		near.renderer.render(scene, camera);
		near.renderer3d.render(scene, camera);
	};
	const panels = (near as unknown as { panels: Map<string, { width: number; height: number; rendered: boolean; mask: string }> }).panels;
	for (let i = 0; i < WARM; i++) {
		frame(i);
		// Laid out as a one-line panel would be (no ResizeObserver here).
		for (const panel of panels.values()) [panel.width, panel.height] = [340, 32];
		await Promise.resolve();
	}
	const start = performance.now();
	for (let i = WARM; i < WARM + FRAMES; i++) frame(i);
	const ms = (performance.now() - start) / FRAMES;
	const masked = [...panels.values()].filter((p) => p.mask !== "").length;
	const count = panels.size;
	near.destroy();
	return { ms, panels: count, masked };
}

// Each mode with its panels, and with the tier off (the same frame, no panels), so the
// difference is what the panels themselves cost. Three rounds, to see the spread.
for (const budget of [24, 48, 128]) {
for (const distance of [240, 400]) {
	for (let round = 0; round < 3; round++) {
		for (const tilted of [false, true]) {
			const off = await run(tilted, distance, false, budget);
			const { ms, panels, masked } = await run(tilted, distance, true, budget);
			const delta = (ms - off.ms) * 1000;
			console.log(`${tilted ? "CSS3D tilted" : "CSS2D flat  "}  budget ${budget}  hover ${distance}  panels ${panels} (masked ${masked})  frame ${(ms * 1000).toFixed(1)} µs, tier off ${(off.ms * 1000).toFixed(1)} µs, panels ${delta.toFixed(1)} µs = ${(delta / Math.max(1, panels)).toFixed(2)} µs/panel`);
		}
	}
}
}
