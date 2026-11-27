import { describe, expect, it, vi } from "vitest";
import { Color, type DataTexture, type InstancedBufferAttribute, type Mesh, type InstancedBufferGeometry } from "three";
import { GLYPH_RENDER_ORDER, CosmosPlates, type PlateSource } from "./CosmosPlates";
import { DEFAULT_LOOK } from "../cosmos/node-style";
import { DASH_ID, PLATE_SHAPE_ID } from "../cosmos/plate-shapes";
import { PLATE_HEIGHT_EM, PLATE_RADIUS } from "../cosmos/plates";

// Node has no canvas: every character is 24 px wide and drawing does nothing.
vi.stubGlobal("createEl", () => ({
	width: 0,
	height: 0,
	getContext: () => ({ font: "", fillStyle: "", textBaseline: "", fillText: () => undefined, measureText: (t: string) => ({ width: 24 * t.length, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 24 * t.length }) }),
}));

const COLORS = { background: "#000", text: "#fff", plate: "#222", font: "sans-serif", accent: "#f0f", found: "#ff0" };

function meshes(plates: CosmosPlates): Mesh<InstancedBufferGeometry>[] {
	return plates.group.children as Mesh<InstancedBufferGeometry>[];
}
const attribute = (mesh: Mesh<InstancedBufferGeometry>, name: string): Float32Array => (mesh.geometry.getAttribute(name) as InstancedBufferAttribute).array as Float32Array;

describe("CosmosPlates (T78)", () => {
	it("reuses a plate's layout for the same text and size", () => {
		const plates = new CosmosPlates(COLORS);
		const first = plates.shape("Halyard", 5, 20);
		expect(plates.shape("Halyard", 5, 20)).toBe(first);
		expect(plates.shape("Halyard", 12, 20)).not.toBe(first);
		plates.dispose();
	});

	it("lays a shaped plate out round its text, as the mind map sizes the shape (T130)", () => {
		const plates = new CosmosPlates(COLORS);
		const plain = plates.shape("Jib", 5, 20);
		const diamond = plates.shape("Jib", 5, 20, 0, "diamond");
		expect(diamond).not.toBe(plain);
		expect(diamond.width).toBeCloseTo(plain.width * 2);
		expect(diamond.height).toBeCloseTo(10);
		// Text keeps its size: the outline and dashes are sized by it.
		expect(diamond.em).toBe(plain.em);
		const triangle = plates.shape("Jib", 5, 20, 0, "triangle");
		expect(triangle.textX).toBeLessThan(0);
		plates.write([plain, triangle].map((shape) => ({ x: 0, y: 0, z: 0, opacity: 1, color: new Color(), shape, look: { ...DEFAULT_LOOK, shape: shape === triangle ? "triangle" : "rounded-rect", dash: "dotted" } })), true);
		// The glyphs of the triangle's text sit left, in its inner box.
		expect(triangle.glyphs[0]!.x).toBeCloseTo(plain.glyphs[0]!.x + triangle.textX);
		const shapes = attribute(meshes(plates)[0]!, "aShape");
		expect(Array.from(shapes.slice(0, 8))).toEqual([1, PLATE_RADIUS, PLATE_SHAPE_ID["rounded-rect"], DASH_ID.dotted, 1, PLATE_RADIUS, PLATE_SHAPE_ID.triangle, DASH_ID.dotted].map(Math.fround));
		expect(attribute(meshes(plates)[0]!, "aEm")[1]).toBeCloseTo(5 / PLATE_HEIGHT_EM);
		plates.dispose();
	});

	it("sizes a plate at once, builds its glyphs at the next write, and hides it until then", () => {
		const plates = new CosmosPlates(COLORS);
		const shape = plates.shape("Sheet", 5, 20);
		expect(shape.width).toBeGreaterThan(0);
		expect(shape.pending).toBe(true);
		expect(shape.glyphs).toHaveLength(0);
		expect(plates.queued).toBe(1);
		const node: PlateSource = { x: 1, y: 2, z: 3, opacity: 1, color: new Color(), shape };
		plates.write([node], true);
		expect(plates.queued).toBe(0);
		expect(shape.pending).toBe(false);
		expect(shape.glyphs).toHaveLength(5);
		expect(attribute(meshes(plates)[0]!, "aOpacity")[0]).toBe(1);
		plates.dispose();
	});

	it("points each glyph at its plate, and moves plates by their centres alone", () => {
		const plates = new CosmosPlates(COLORS);
		const nodes: PlateSource[] = ["Tack", "Clew"].map((text, i) => ({ x: i, y: 0, z: 0, opacity: 1, color: new Color(), shape: plates.shape(text, 5, 20) }));
		plates.write(nodes, true);
		const glyphs = meshes(plates)[1]!;
		expect(Array.from(attribute(glyphs, "aPlate").slice(0, 8))).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
		const texture = (glyphs.material as unknown as { uniforms: { uPlates: { value: DataTexture } } }).uniforms.uPlates.value;
		nodes[1]!.x = 7;
		nodes[1]!.opacity = 0.5;
		plates.write(nodes, false);
		expect(Array.from((texture.image.data as Float32Array).slice(4, 8))).toEqual([7, 0, 0, 0.5]);
		plates.dispose();
	});

	it("draws glyph layers before every other transparent object, so a nearer edge is not painted over by farther text (T97)", () => {
		const plates = new CosmosPlates(COLORS);
		plates.write([{ x: 0, y: 0, z: 0, opacity: 1, color: new Color(), shape: plates.shape("Jib", 5, 20) }], true);
		const [background, glyphs] = meshes(plates);
		expect(GLYPH_RENDER_ORDER).toBeLessThan(0);
		expect(glyphs!.renderOrder).toBe(GLYPH_RENDER_ORDER);
		expect(background!.renderOrder).toBe(0);
		plates.dispose();
	});
});
