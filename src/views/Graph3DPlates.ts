/**
 * Every node of the 3D graph as a label plate, drawn in a few draw calls: one
 * instanced mesh of plate backgrounds and one instanced mesh of glyphs per
 * atlas page. See `vault/Planner/3D Graph - Plates for every node.md`.
 *
 * - **Glyph atlas:** each character is drawn once, in white, with the theme
 *   font, into a shared canvas page. Plates place glyph quads by the measured
 *   advances (`layoutPlate`), so there is no kerning and no ligatures.
 * - **Backgrounds:** camera-facing quads whose rounded rectangle and outline
 *   come from a signed distance in the fragment shader.
 * - **Opaque, ordered by depth:** backgrounds write depth, so a nearer plate
 *   covers a farther one with no sorting. Glyphs blend over their own plate,
 *   which is always drawn first, and use a polygon offset to win the depth tie.
 * - **Fading:** an opaque plate can't fade with alpha, so arrival and
 *   departure mix it toward the background colour (as the mist does). Focus
 *   dimming (`../graph3d/focus.ts`) folds into the same mix, from the depth of
 *   the plate's centre, so a whole plate and its text dim together.
 */

import {
	Color,
	DynamicDrawUsage,
	Group,
	InstancedBufferAttribute,
	InstancedBufferGeometry,
	Mesh,
	PlaneGeometry,
	ShaderMaterial,
	UniformsLib,
	UniformsUtils,
	CanvasTexture,
	type IUniform,
} from "three";
import { GlyphPacker, PLATE_RADIUS, PLATE_STROKE_EM, PLATE_HEIGHT_EM, layoutPlate } from "../graph3d/plates";
import { FOCUS_DIM_GLSL } from "../graph3d/focus";

/** Glyphs are rasterised at this size, in rows this tall, on square pages this wide (all px). */
const FONT_PX = 48;
const ROW_PX = 64;
const PAGE_PX = 1024;
/** Clear space around each glyph in the atlas, so mipmaps don't bleed neighbours together. */
const GLYPH_PAD_PX = 4;
/**
 * Plates (and their glyphs) are drawn at this share of their depth, scaled
 * toward the camera so they keep their size on screen. An edge leaving a node
 * toward the camera then stays under its plate instead of running across the
 * text. One factor for every plate keeps their depth order.
 */
const PLATE_PULL = 0.97;

/** A glyph quad on a plate, in world units relative to the plate's centre. */
interface ShapeGlyph {
	page: number;
	x: number;
	width: number;
	height: number;
	/** Atlas rectangle: left, bottom, width, height in UV. */
	uv: [number, number, number, number];
}

/** A plate laid out at its world size, ready to be written into the meshes. */
export interface PlateShape {
	width: number;
	height: number;
	glyphs: ShapeGlyph[];
}

/** What the plate meshes need to know about a node each time they're written. */
export interface PlateSource {
	x?: number;
	y?: number;
	z?: number;
	/** 0–1; at 0 the plate isn't drawn. */
	opacity: number;
	/** Outline colour. */
	color: Color;
	shape: PlateShape;
}

export interface PlateColors {
	background: string;
	text: string;
	plate: string;
	font: string;
}

interface AtlasGlyph {
	page: number;
	/** Left edge of the slot, relative to the pen, in font px. */
	left: number;
	width: number;
	uv: [number, number, number, number];
}

interface AtlasPage {
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D | null;
	texture: CanvasTexture;
	/** Glyphs were drawn since the texture was last uploaded. */
	dirty: boolean;
}

/** The shared glyph atlas for one font: measured advances, and pages drawn as characters first appear. */
class GlyphAtlas {
	readonly pages: AtlasPage[] = [];
	private readonly packer = new GlyphPacker(PAGE_PX, ROW_PX);
	private readonly advances = new Map<string, number>();
	private readonly glyphs = new Map<string, AtlasGlyph>();
	private readonly measure: CanvasRenderingContext2D | null;

	constructor(private readonly font: string) {
		this.measure = createEl("canvas").getContext("2d");
		if (this.measure !== null) this.measure.font = font;
	}

	advance(char: string): number {
		let advance = this.advances.get(char);
		if (advance === undefined) this.advances.set(char, (advance = this.measure?.measureText(char).width ?? FONT_PX / 2));
		return advance;
	}

	glyph(char: string): AtlasGlyph {
		const known = this.glyphs.get(char);
		if (known !== undefined) return known;
		const metrics = this.measure?.measureText(char);
		// Ink can reach past the advance on either side (a "j" or an italic overhang).
		const inkLeft = Math.max(0, Math.ceil(metrics?.actualBoundingBoxLeft ?? 0));
		const inkRight = Math.max(Math.ceil(this.advance(char)), Math.ceil(metrics?.actualBoundingBoxRight ?? 0));
		const slot = this.packer.slot(char, inkLeft + inkRight + 2 * GLYPH_PAD_PX);
		const page = this.page(slot.page);
		if (page.context !== null) {
			page.context.fillText(char, slot.x + GLYPH_PAD_PX + inkLeft, slot.y + ROW_PX / 2);
			page.dirty = true;
		}
		// Canvas textures are flipped: v runs up from the bottom of the canvas.
		const glyph: AtlasGlyph = {
			page: slot.page,
			left: -GLYPH_PAD_PX - inkLeft,
			width: slot.width,
			uv: [slot.x / PAGE_PX, 1 - (slot.y + ROW_PX) / PAGE_PX, slot.width / PAGE_PX, ROW_PX / PAGE_PX],
		};
		this.glyphs.set(char, glyph);
		return glyph;
	}

	private page(index: number): AtlasPage {
		while (this.pages.length <= index) {
			const canvas = createEl("canvas", { attr: { width: PAGE_PX, height: PAGE_PX } });
			const context = canvas.getContext("2d");
			if (context !== null) {
				context.font = this.font;
				context.fillStyle = "#ffffff";
				context.textBaseline = "middle";
			}
			this.pages.push({ canvas, context, texture: new CanvasTexture(canvas), dirty: true });
		}
		return this.pages[index]!;
	}

	/** Upload the pages that gained glyphs. Once a frame at most, however many characters arrived. */
	upload(): void {
		for (const page of this.pages) {
			if (!page.dirty) continue;
			page.dirty = false;
			page.texture.needsUpdate = true;
		}
	}

	dispose(): void {
		for (const page of this.pages) page.texture.dispose();
	}
}

const FOG_VERTEX = /* glsl */ `
#include <fog_vertex>
mvPosition.xyz *= ${PLATE_PULL.toFixed(3)};
gl_Position = projectionMatrix * mvPosition;
// A plate faded right out is collapsed off screen.
if (aOpacity <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
`;

const PLATE_VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aSize;
attribute vec3 aColor;
attribute float aOpacity;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vColor;
varying float vOpacity;
${FOCUS_DIM_GLSL}
#include <fog_pars_vertex>
void main() {
	vec4 mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
	vLocal = position.xy * aSize;
	vHalf = aSize * 0.5;
	mvPosition.xy += vLocal;
	vColor = aColor;
	vOpacity = aOpacity * (1.0 - focusDim(-mvPosition.z));
	${FOG_VERTEX}
}
`;

const PLATE_FRAGMENT = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uBackground;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vColor;
varying float vOpacity;
#include <fog_pars_fragment>
void main() {
	float height = vHalf.y * 2.0;
	float radius = height * ${PLATE_RADIUS.toFixed(3)};
	vec2 q = abs(vLocal) - (vHalf - radius);
	float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	float aa = max(fwidth(d), 1e-4);
	float coverage = clamp(0.5 - d / aa, 0.0, 1.0);
	if (coverage <= 0.0) discard;
	float stroke = height * ${(PLATE_STROKE_EM / PLATE_HEIGHT_EM).toFixed(4)};
	// An outline thinner than a pixel is drawn a pixel wide and that much fainter,
	// so a distant plate's border doesn't shimmer as it lands between pixels.
	float band = max(stroke, aa);
	float border = smoothstep(-band - aa * 0.5, -band + aa * 0.5, d) * (stroke / band);
	gl_FragColor = vec4(mix(uBackground, mix(uFill, vColor, border), vOpacity), coverage);
	#include <fog_fragment>
	#include <colorspace_fragment>
}
`;

const GLYPH_VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute float aOpacity;
attribute vec4 aRect;
attribute vec4 aUv;
varying vec2 vUv;
varying float vOpacity;
${FOCUS_DIM_GLSL}
#include <fog_pars_vertex>
void main() {
	vec4 mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
	mvPosition.xy += aRect.xy + position.xy * aRect.zw;
	vUv = aUv.xy + (position.xy + 0.5) * aUv.zw;
	vOpacity = aOpacity * (1.0 - focusDim(-mvPosition.z));
	${FOG_VERTEX}
}
`;

const GLYPH_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uText;
uniform vec3 uBackground;
varying vec2 vUv;
varying float vOpacity;
#include <fog_pars_fragment>
void main() {
	float alpha = texture2D(uAtlas, vUv).a;
	if (alpha < 0.02) discard;
	gl_FragColor = vec4(mix(uBackground, uText, vOpacity), alpha);
	#include <fog_fragment>
	#include <colorspace_fragment>
}
`;

/** Instanced attributes and their widths, for each mesh. */
const PLATE_ATTRIBUTES = { aCenter: 3, aOpacity: 1, aSize: 2, aColor: 3 } as const;
const GLYPH_ATTRIBUTES = { aCenter: 3, aOpacity: 1, aRect: 4, aUv: 4 } as const;
type PlateAttribute = keyof typeof PLATE_ATTRIBUTES;
type GlyphAttribute = keyof typeof GLYPH_ATTRIBUTES;

/** An instanced quad mesh whose instance buffers grow as needed. */
class QuadLayer<A extends string> {
	readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
	private capacity = 0;

	constructor(material: ShaderMaterial, private readonly widths: Record<A, number>) {
		this.mesh = new Mesh(new InstancedBufferGeometry(), material);
		// Instances move every tick; three.js would cull by stale bounds.
		this.mesh.frustumCulled = false;
		this.reserve(64);
	}

	/** Make room for `count` instances and draw that many. */
	reserve(count: number): void {
		if (count > this.capacity) {
			this.capacity = Math.max(count, this.capacity * 2, 64);
			const old = this.mesh.geometry;
			const quad = new PlaneGeometry(1, 1);
			const geometry = new InstancedBufferGeometry();
			geometry.setIndex(quad.getIndex());
			geometry.setAttribute("position", quad.getAttribute("position"));
			for (const [name, width] of Object.entries(this.widths) as [A, number][]) {
				const attribute = new InstancedBufferAttribute(new Float32Array(this.capacity * width), width).setUsage(DynamicDrawUsage);
				geometry.setAttribute(name, attribute);
			}
			this.mesh.geometry = geometry;
			old.dispose();
		}
		this.mesh.geometry.instanceCount = count;
	}

	array(name: A): Float32Array {
		return (this.mesh.geometry.getAttribute(name) as InstancedBufferAttribute).array as Float32Array;
	}

	touch(...names: A[]): void {
		for (const name of names) (this.mesh.geometry.getAttribute(name) as InstancedBufferAttribute).needsUpdate = true;
	}

	get count(): number {
		return this.mesh.geometry.instanceCount;
	}

	get bytes(): number {
		return this.capacity * Object.values<number>(this.widths).reduce((sum, width) => sum + width, 0) * 4;
	}

	dispose(): void {
		this.mesh.removeFromParent();
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}

export class Graph3DPlates {
	/** Everything the plates draw; hide it to see the scene without them. */
	readonly group = new Group();
	private atlas: GlyphAtlas;
	private readonly plates: QuadLayer<PlateAttribute>;
	/** One glyph layer per atlas page. */
	private readonly glyphs: QuadLayer<GlyphAttribute>[] = [];
	private readonly uniforms = {
		uFill: { value: new Color() },
		uText: { value: new Color() },
		uBackground: { value: new Color() },
	};
	/** View depth of the focus, for focus dimming. The scene eases it each frame and shares it with the edges. */
	readonly focus: IUniform<number> = { value: 0 };
	private font = "";
	private labelsVisible = true;

	constructor(colors: PlateColors) {
		const material = new ShaderMaterial({
			vertexShader: PLATE_VERTEX,
			fragmentShader: PLATE_FRAGMENT,
			uniforms: UniformsUtils.clone(UniformsLib.fog) as Record<string, IUniform>,
			fog: true,
			// With the renderer's multisampling, the shader's edge coverage becomes a smooth edge.
			alphaToCoverage: true,
		});
		Object.assign(material.uniforms, { uFill: this.uniforms.uFill, uBackground: this.uniforms.uBackground, uFocus: this.focus });
		this.plates = new QuadLayer(material, PLATE_ATTRIBUTES);
		this.group.add(this.plates.mesh);
		this.atlas = new GlyphAtlas("");
		this.setColors(colors);
	}

	/**
	 * Take on new theme colours and font. A new font starts a fresh atlas, so
	 * every plate has to be laid out again with `shape()`.
	 */
	setColors(colors: PlateColors): void {
		this.uniforms.uFill.value.setStyle(colors.plate);
		this.uniforms.uText.value.setStyle(colors.text);
		this.uniforms.uBackground.value.setStyle(colors.background);
		const font = `${FONT_PX}px ${colors.font}`;
		if (font === this.font) return;
		this.font = font;
		this.atlas.dispose();
		this.atlas = new GlyphAtlas(font);
		for (const layer of this.glyphs) layer.dispose();
		this.glyphs.length = 0;
	}

	/** Show or hide the text on every plate (the Overlays menu's labels); the plates keep their size. */
	setLabelsVisible(visible: boolean): void {
		this.labelsVisible = visible;
		for (const layer of this.glyphs) layer.mesh.visible = visible;
	}

	/** Lay `text` out on a plate `height` world units tall, cut at `maxEm` ems wide. */
	shape(text: string, height: number, maxEm: number): PlateShape {
		const layout = layoutPlate(text, (char) => this.atlas.advance(char), FONT_PX, maxEm * FONT_PX);
		const scale = height / layout.height;
		const glyphs = layout.glyphs.map(({ char, x }) => {
			const glyph = this.atlas.glyph(char);
			return {
				page: glyph.page,
				x: (x + glyph.left + glyph.width / 2) * scale,
				width: glyph.width * scale,
				height: ROW_PX * scale,
				uv: glyph.uv,
			};
		});
		return { width: layout.width * scale, height, glyphs };
	}

	/**
	 * Write the plates into the meshes, in `nodes` order. With `layout`, every
	 * attribute is rewritten (plates came, went or changed); without, only
	 * positions and opacities, which keeps a simulating tick cheap.
	 */
	write(nodes: readonly PlateSource[], layout: boolean): void {
		this.atlas.upload();
		if (layout) this.reserve(nodes);
		const plateCenter = this.plates.array("aCenter");
		const plateOpacity = this.plates.array("aOpacity");
		const plateSize = this.plates.array("aSize");
		const plateColor = this.plates.array("aColor");
		const glyphCursor = this.glyphs.map(() => 0);
		const glyphArrays = this.glyphs.map((layer) => ({
			center: layer.array("aCenter"),
			opacity: layer.array("aOpacity"),
			rect: layer.array("aRect"),
			uv: layer.array("aUv"),
		}));
		// Plain index writes: this runs for every glyph on every simulating tick.
		nodes.forEach((node, i) => {
			const placed = node.x !== undefined && node.y !== undefined && node.z !== undefined;
			const x = placed ? node.x ?? 0 : 0;
			const y = placed ? node.y ?? 0 : 0;
			const z = placed ? node.z ?? 0 : 0;
			const opacity = placed ? node.opacity : 0;
			plateCenter[i * 3] = x;
			plateCenter[i * 3 + 1] = y;
			plateCenter[i * 3 + 2] = z;
			plateOpacity[i] = opacity;
			if (layout) {
				plateSize[i * 2] = node.shape.width;
				plateSize[i * 2 + 1] = node.shape.height;
				plateColor[i * 3] = node.color.r;
				plateColor[i * 3 + 1] = node.color.g;
				plateColor[i * 3 + 2] = node.color.b;
			}
			for (const glyph of node.shape.glyphs) {
				const arrays = glyphArrays[glyph.page];
				if (arrays === undefined) continue;
				const g = glyphCursor[glyph.page]!++;
				arrays.center[g * 3] = x;
				arrays.center[g * 3 + 1] = y;
				arrays.center[g * 3 + 2] = z;
				arrays.opacity[g] = opacity;
				if (!layout) continue;
				arrays.rect[g * 4] = glyph.x;
				arrays.rect[g * 4 + 1] = 0;
				arrays.rect[g * 4 + 2] = glyph.width;
				arrays.rect[g * 4 + 3] = glyph.height;
				arrays.uv.set(glyph.uv, g * 4);
			}
		});
		this.plates.touch("aCenter", "aOpacity");
		if (layout) this.plates.touch("aSize", "aColor");
		for (const layer of this.glyphs) {
			layer.touch("aCenter", "aOpacity");
			if (layout) layer.touch("aRect", "aUv");
		}
	}

	/** Size the meshes for `nodes`, adding a glyph layer for each new atlas page. */
	private reserve(nodes: readonly PlateSource[]): void {
		this.plates.reserve(nodes.length);
		while (this.glyphs.length < this.atlas.pages.length) this.addGlyphLayer(this.glyphs.length);
		const counts = this.glyphs.map(() => 0);
		for (const node of nodes) for (const glyph of node.shape.glyphs) counts[glyph.page]!++;
		this.glyphs.forEach((layer, page) => layer.reserve(counts[page]!));
	}

	private addGlyphLayer(page: number): void {
		const material = new ShaderMaterial({
			vertexShader: GLYPH_VERTEX,
			fragmentShader: GLYPH_FRAGMENT,
			uniforms: UniformsUtils.clone(UniformsLib.fog) as Record<string, IUniform>,
			fog: true,
			transparent: true,
			depthWrite: false,
			// Glyphs lie in their plate's plane; the offset wins them the depth tie.
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -4,
		});
		Object.assign(material.uniforms, {
			uAtlas: { value: this.atlas.pages[page]!.texture },
			uText: this.uniforms.uText,
			uBackground: this.uniforms.uBackground,
			uFocus: this.focus,
		});
		const layer = new QuadLayer(material, GLYPH_ATTRIBUTES);
		layer.mesh.visible = this.labelsVisible;
		this.glyphs.push(layer);
		this.group.add(layer.mesh);
	}

	/** Counts and memory, for the perf readout. */
	stats(): { plates: number; glyphs: number; pages: number; atlasBytes: number; instanceBytes: number } {
		return {
			plates: this.plates.count,
			glyphs: this.glyphs.reduce((sum, layer) => sum + layer.count, 0),
			pages: this.atlas.pages.length,
			// RGBA, plus a third again for the mipmap chain.
			atlasBytes: this.atlas.pages.length * PAGE_PX * PAGE_PX * 4 * (4 / 3),
			instanceBytes: this.glyphs.reduce((sum, layer) => sum + layer.bytes, this.plates.bytes),
		};
	}

	dispose(): void {
		this.plates.dispose();
		for (const layer of this.glyphs) layer.dispose();
		this.atlas.dispose();
		this.group.removeFromParent();
	}
}
