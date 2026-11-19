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
 * - **Opaque, ordered by depth:** backgrounds write depth at their real
 *   depth, so a nearer plate covers a farther one, and a nearer edge, with no
 *   sorting. An edge passes under the plates at its own ends instead
 *   (`../graph3d/own-plate.ts`). Glyphs blend over their own plate,
 *   which is always drawn first, and use a polygon offset to win the depth tie.
 * - **Fading:** an opaque plate can't fade with alpha, so arrival and
 *   departure mix it toward the background colour (as the mist does). Focus
 *   dimming (`../graph3d/focus.ts`) folds into the same mix, from the depth of
 *   the plate's centre, so a whole plate and its text dim together.
 * - **Glyphs ride their plate:** a glyph stores its plate's index, and its
 *   vertex shader reads the plate's centre and opacity from a float texture
 *   (`uPlates`), so a simulating tick writes one texel per plate, not one
 *   centre per glyph (T78).
 * - **Laid out a slice at a time:** `shape` measures a plate at once (its size
 *   spaces the layout), but its glyphs are built by `write`, a few ms a frame
 *   (`drainWithin`). A plate still waiting is drawn hidden and appears from the
 *   background. Layouts are cached by text and size (`ShapeCache`).
 * - **Per-node styles:** a node's `osmosis-styles` look (`NodeLook`, from
 *   `../graph3d/node-style.ts`) rides in instance attributes: fill, outline
 *   colour and thickness, corner radius, text colour. An unstyled plate keeps
 *   the theme uniforms, so styling adds no draw call.
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
	DataTexture,
	FloatType,
	NearestFilter,
	RGBAFormat,
	type IUniform,
} from "three";
import { GlyphPacker, PLATE_STROKE_EM, PLATE_HEIGHT_EM, PLATE_TEXTURE_WIDTH, ShapeCache, drainWithin, layoutPlate, plateTextureRows, shapeKey, type PlateLayout } from "../graph3d/plates";
import { FAR_SIDE_DIM } from "../graph3d/far-side";
import { UPRIGHT_GLSL } from "../graph3d/upright";
import { FOCUS_DIM_GLSL } from "../graph3d/focus";
import { DEFAULT_LOOK, type NodeLook } from "../graph3d/node-style";

/** Glyphs are rasterised at this size, in rows this tall, on square pages this wide (all px). */
const FONT_PX = 48;
const ROW_PX = 64;
const PAGE_PX = 1024;
/** Clear space around each glyph in the atlas, so mipmaps don't bleed neighbours together. */
const GLYPH_PAD_PX = 4;
/** Least time a write spends building queued glyphs, in ms; it spends as long as its last full layout write took, if longer. */
const GLYPH_BUDGET_MS = 4;
/** The layout cache keeps plates no longer shown until it holds this many, or twice the plates shown. */
const SHAPE_CACHE_MIN = 4096;
/**
 * The glyph layers' `renderOrder`: below every other transparent object's 0,
 * so three draws them straight after the opaque plates. A layer is made when
 * its atlas page is, after the edges, and three breaks ties by object id, so
 * at 0 a farther plate's text was painted over a nearer edge (T97).
 */
export const GLYPH_RENDER_ORDER = -1;

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
	/** Its glyphs aren't built yet (`Graph3DPlates.write` builds them): the plate is drawn hidden until they are. */
	pending?: boolean;
}

/** A plate waiting for its glyphs: its layout in font px, and the scale to world units. */
interface QueuedShape {
	shape: PlateShape;
	layout: PlateLayout;
	scale: number;
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
	/** In the multi-select: drawn with the selection border (the theme accent, at least 2 px). */
	selected?: boolean;
	/** A find bar match: drawn with the find border (as thick, in `PlateColors.found`). The selection's wins. */
	found?: boolean;
	/** Planets mode: the plate lies on its planet's surface along these unit axes (text-right, text-up), drawn dimmed and without text from behind. Without, it faces the camera. */
	frame?: { right: { x: number; y: number; z: number }; up: { x: number; y: number; z: number } };
	/** The node's style: fill, outline (over `color`), corners and text colour. Without, the default plate. */
	look?: NodeLook;
}

export interface PlateColors {
	background: string;
	text: string;
	plate: string;
	font: string;
	/** The selection border's colour. */
	accent: string;
	/** The find match border's colour. */
	found: string;
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

/**
 * The tail of both vertex shaders. A plate faded right out is collapsed off
 * screen; a planet's plate seen from behind is drawn dimmed by the plate
 * shader (`FAR_SIDE_DIM`), but its glyphs are collapsed (`hideBack`): no text
 * on a plate's back.
 */
const fogVertex = (hideBack: boolean): string => /* glsl */ `
#include <fog_vertex>
gl_Position = projectionMatrix * mvPosition;
if (aOpacity <= 0.0${hideBack ? " || plateBack" : ""}) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
`;

/**
 * Where a point `offset` from a plate's centre (text-right, text-up) lands, in
 * view space: across the screen for a billboard, or along the plate's own
 * axes for a plate lying on a planet, spun about its normal so its text reads
 * upright on screen (`uprightSpin`; the near tier spins its panels the same
 * way) (`plateBack` when seen from behind: dimmed, no text).
 */
const ORIENT_GLSL = /* glsl */ `
${UPRIGHT_GLSL}
attribute vec3 aRight;
attribute vec3 aUp;
bool plateBack = false;
vec4 placeOnPlate(vec2 offset) {
	if (dot(aRight, aRight) < 0.5) {
		vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
		mv.xy += offset;
		return mv;
	}
	plateBack = dot(cross(aRight, aUp), cameraPosition - aCenter) <= 0.0;
	// Spun about its normal so its text reads upright on screen (see upright.ts).
	mat3 toView = mat3(modelViewMatrix);
	vec2 spin = uprightSpin((modelViewMatrix * vec4(aCenter, 1.0)).xyz, toView * aRight, toView * aUp);
	vec3 right = spin.x * aRight + spin.y * aUp;
	vec3 up = spin.x * aUp - spin.y * aRight;
	return modelViewMatrix * vec4(aCenter + right * offset.x + up * offset.y, 1.0);
}
`;

const PLATE_VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aSize;
attribute vec3 aColor;
attribute float aOpacity;
attribute float aSelected;
attribute vec4 aFill;
attribute vec2 aShape;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vColor;
varying float vOpacity;
varying float vSelected;
varying vec4 vFill;
varying vec2 vShape;
${FOCUS_DIM_GLSL}
${ORIENT_GLSL}
#include <fog_pars_vertex>
void main() {
	vLocal = position.xy * aSize;
	vec4 mvPosition = placeOnPlate(vLocal);
	vHalf = aSize * 0.5;
	vColor = aColor;
	vSelected = aSelected;
	vFill = aFill;
	vShape = aShape;
	vOpacity = aOpacity * (1.0 - focusDim(-mvPosition.z)) * (plateBack ? ${(1 - FAR_SIDE_DIM).toFixed(4)} : 1.0);
	${fogVertex(false)}
}
`;

const PLATE_FRAGMENT = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uBackground;
uniform vec3 uAccent;
uniform vec3 uFound;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vColor;
varying float vOpacity;
// 1 in the selection, 2 a find match (FindBar), else 0.
varying float vSelected;
// A styled plate's fill (rgb, and 1 in a), or the theme's (a = 0).
varying vec4 vFill;
// The style's outline thickness (× the default) and corner radius (share of the height).
varying vec2 vShape;
#include <fog_pars_fragment>
void main() {
	float height = vHalf.y * 2.0;
	float radius = height * vShape.y;
	vec2 q = abs(vLocal) - (vHalf - radius);
	float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	float aa = max(fwidth(d), 1e-4);
	float coverage = clamp(0.5 - d / aa, 0.0, 1.0);
	if (coverage <= 0.0) discard;
	float stroke = height * ${(PLATE_STROKE_EM / PLATE_HEIGHT_EM).toFixed(4)} * vShape.x;
	// A selected plate's border is the accent, and never under 2 px, as the mind map's selection is. A find match's is as thick, in the find colour.
	float selected = step(0.5, vSelected) * (1.0 - step(1.5, vSelected));
	float found = step(1.5, vSelected);
	stroke = mix(stroke, max(stroke * 1.5, 2.0 * aa), max(selected, found));
	vec3 edge = mix(mix(vColor, uFound, found), uAccent, selected);
	// An outline thinner than a pixel is drawn a pixel wide and that much fainter,
	// so a distant plate's border doesn't shimmer as it lands between pixels.
	float band = max(stroke, aa);
	float border = smoothstep(-band - aa * 0.5, -band + aa * 0.5, d) * (stroke / band);
	vec3 fill = mix(uFill, vFill.rgb, vFill.a);
	gl_FragColor = vec4(mix(uBackground, mix(fill, edge, border), vOpacity), coverage);
	#include <fog_fragment>
	#include <colorspace_fragment>
}
`;

const GLYPH_VERTEX = /* glsl */ `
// The plate's centre (xyz) and opacity (w), one texel per plate (\`Graph3DPlates.write\`).
uniform highp sampler2D uPlates;
attribute float aPlate;
vec3 aCenter;
float aOpacity;
attribute vec4 aRect;
attribute vec4 aUv;
attribute vec4 aInk;
varying vec2 vUv;
varying float vOpacity;
varying vec4 vInk;
${FOCUS_DIM_GLSL}
${ORIENT_GLSL}
#include <fog_pars_vertex>
void main() {
	int plate = int(aPlate + 0.5);
	vec4 centre = texelFetch(uPlates, ivec2(plate % ${PLATE_TEXTURE_WIDTH}, plate / ${PLATE_TEXTURE_WIDTH}), 0);
	aCenter = centre.xyz;
	aOpacity = centre.w;
	vec4 mvPosition = placeOnPlate(aRect.xy + position.xy * aRect.zw);
	vUv = aUv.xy + (position.xy + 0.5) * aUv.zw;
	vInk = aInk;
	vOpacity = aOpacity * (1.0 - focusDim(-mvPosition.z));
	${fogVertex(true)}
}
`;

const GLYPH_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uText;
uniform vec3 uBackground;
varying vec2 vUv;
varying float vOpacity;
// A styled node's text colour (rgb, and 1 in a), or the theme's (a = 0).
varying vec4 vInk;
#include <fog_pars_fragment>
void main() {
	float alpha = texture2D(uAtlas, vUv).a;
	if (alpha < 0.02) discard;
	gl_FragColor = vec4(mix(uBackground, mix(uText, vInk.rgb, vInk.a), vOpacity), alpha);
	#include <fog_fragment>
	#include <colorspace_fragment>
}
`;

/** Instanced attributes and their widths, for each mesh. */
const PLATE_ATTRIBUTES = { aCenter: 3, aOpacity: 1, aSize: 2, aColor: 3, aSelected: 1, aRight: 3, aUp: 3, aFill: 4, aShape: 2 } as const;
const GLYPH_ATTRIBUTES = { aPlate: 1, aRect: 4, aUv: 4, aRight: 3, aUp: 3, aInk: 4 } as const;
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
		uAccent: { value: new Color() },
		uFound: { value: new Color() },
	};
	/** View depth of the focus, for focus dimming. The scene eases it each frame and shares it with the edges. */
	readonly focus: IUniform<number> = { value: 0 };
	private font = "";
	private labelsVisible = true;
	/** Style colours as parsed, by their CSS text: a layout write reads them for every styled plate. */
	private readonly styleColors = new Map<string, Color>();
	/** Plate layouts by text and size. */
	private readonly shapes = new ShapeCache<PlateShape>();
	/** Plates whose glyphs `write` still has to build, from `queueAt` on. */
	private queue: QueuedShape[] = [];
	private queueAt = 0;
	/** Every plate's centre and opacity, for the glyph shader. */
	private readonly plateTexture: IUniform<DataTexture> = { value: Graph3DPlates.plateTexture(1) };
	/** The last writes' costs, for the perf readout (ms). */
	private readonly timing = { layout: 0, tick: 0, glyphs: 0 };

	constructor(colors: PlateColors) {
		const material = new ShaderMaterial({
			vertexShader: PLATE_VERTEX,
			fragmentShader: PLATE_FRAGMENT,
			uniforms: UniformsUtils.clone(UniformsLib.fog) as Record<string, IUniform>,
			fog: true,
			// With the renderer's multisampling, the shader's edge coverage becomes a smooth edge.
			alphaToCoverage: true,
		});
		Object.assign(material.uniforms, { uFill: this.uniforms.uFill, uBackground: this.uniforms.uBackground, uAccent: this.uniforms.uAccent, uFound: this.uniforms.uFound, uFocus: this.focus });
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
		this.uniforms.uAccent.value.setStyle(colors.accent);
		this.uniforms.uFound.value.setStyle(colors.found);
		const font = `${FONT_PX}px ${colors.font}`;
		if (font === this.font) return;
		this.font = font;
		this.atlas.dispose();
		this.atlas = new GlyphAtlas(font);
		for (const layer of this.glyphs) layer.dispose();
		this.glyphs.length = 0;
		// Layouts measured in the old font are stale.
		this.shapes.clear();
		this.queue = [];
		this.queueAt = 0;
	}

	/** Show or hide the text on every plate (the Overlays menu's labels); the plates keep their size. */
	setLabelsVisible(visible: boolean): void {
		this.labelsVisible = visible;
		for (const layer of this.glyphs) layer.mesh.visible = visible;
	}

	/** Lay `text` out on a plate `height` world units tall, its text cut at `maxEm` ems wide and the plate at least `minEm` wide. */
	shape(text: string, height: number, maxEm: number, minEm = 0): PlateShape {
		const key = shapeKey(text, height, maxEm, minEm);
		const known = this.shapes.get(key);
		if (known !== undefined) return known;
		const layout = layoutPlate(text, (char) => this.atlas.advance(char), FONT_PX, maxEm * FONT_PX, minEm * FONT_PX);
		const scale = height / layout.height;
		const shape: PlateShape = { width: layout.width * scale, height, glyphs: [], pending: true };
		this.shapes.set(key, shape);
		this.queue.push({ shape, layout, scale });
		return shape;
	}

	/** Plates still waiting for their glyphs. While any are, the scene keeps writing. */
	get queued(): number {
		return this.queue.length - this.queueAt;
	}

	/** Build a queued plate's glyphs, drawing any new characters into the atlas. */
	private build({ shape, layout, scale }: QueuedShape): void {
		shape.glyphs = layout.glyphs.map(({ char, x }) => {
			const glyph = this.atlas.glyph(char);
			return {
				page: glyph.page,
				x: (x + glyph.left + glyph.width / 2) * scale,
				width: glyph.width * scale,
				height: ROW_PX * scale,
				uv: glyph.uv,
			};
		});
		shape.pending = false;
	}

	/** Build queued glyphs for this write's share of time. Whether any were built. */
	private buildQueued(): boolean {
		if (this.queued === 0) return false;
		const start = performance.now();
		this.queueAt = drainWithin(this.queue, this.queueAt, (queued) => this.build(queued), Math.max(GLYPH_BUDGET_MS, this.timing.layout), () => performance.now());
		if (this.queueAt === this.queue.length) {
			this.queue = [];
			this.queueAt = 0;
		}
		this.timing.glyphs = performance.now() - start;
		return true;
	}

	private static plateTexture(rows: number): DataTexture {
		const texture = new DataTexture(new Float32Array(PLATE_TEXTURE_WIDTH * rows * 4), PLATE_TEXTURE_WIDTH, rows, RGBAFormat, FloatType);
		texture.minFilter = texture.magFilter = NearestFilter;
		texture.generateMipmaps = false;
		return texture;
	}

	/**
	 * Write the plates into the meshes, in `nodes` order. With `layout`, every
	 * attribute is rewritten (plates came, went or changed); without, only
	 * positions and opacities, which keeps a simulating tick cheap.
	 */
	write(nodes: readonly PlateSource[], layout: boolean): void {
		// Newly built glyphs change the glyph counts: a layout write.
		if (this.buildQueued()) layout = true;
		const start = performance.now();
		this.atlas.upload();
		if (layout) {
			this.reserve(nodes);
			this.shapes.trim(nodes.map((node) => node.shape), Math.max(SHAPE_CACHE_MIN, 2 * nodes.length));
		}
		const rows = plateTextureRows(nodes.length);
		if (this.plateTexture.value.image.height < rows) {
			this.plateTexture.value.dispose();
			this.plateTexture.value = Graph3DPlates.plateTexture(rows);
		}
		const plateTexels = this.plateTexture.value.image.data as Float32Array;
		const plateCenter = this.plates.array("aCenter");
		const plateOpacity = this.plates.array("aOpacity");
		const plateSize = this.plates.array("aSize");
		const plateColor = this.plates.array("aColor");
		const plateSelected = this.plates.array("aSelected");
		const plateRight = this.plates.array("aRight");
		const plateUp = this.plates.array("aUp");
		const plateFill = this.plates.array("aFill");
		const plateShape = this.plates.array("aShape");
		const glyphCursor = this.glyphs.map(() => 0);
		const glyphArrays = this.glyphs.map((layer) => ({
			plate: layer.array("aPlate"),
			rect: layer.array("aRect"),
			uv: layer.array("aUv"),
			right: layer.array("aRight"),
			up: layer.array("aUp"),
			ink: layer.array("aInk"),
		}));
		// A style colour into `array` at `i` as rgb and a 1 flag, or a 0 flag for the theme's.
		const paint = (array: Float32Array, i: number, css: string | null): void => {
			const color = css === null ? null : this.styleColor(css);
			array[i * 4] = color?.r ?? 0;
			array[i * 4 + 1] = color?.g ?? 0;
			array[i * 4 + 2] = color?.b ?? 0;
			array[i * 4 + 3] = color === null ? 0 : 1;
		};
		// A plate's axes, or zeros for a billboard. Written with the layout: a planet's plates turn only when it is laid out again.
		const axes = (array: Float32Array, i: number, axis: { x: number; y: number; z: number } | undefined): void => {
			array[i * 3] = axis?.x ?? 0;
			array[i * 3 + 1] = axis?.y ?? 0;
			array[i * 3 + 2] = axis?.z ?? 0;
		};
		// Plain index writes: this runs for every plate on every simulating tick (and every glyph on a layout write).
		nodes.forEach((node, i) => {
			const placed = node.x !== undefined && node.y !== undefined && node.z !== undefined;
			const x = placed ? node.x ?? 0 : 0;
			const y = placed ? node.y ?? 0 : 0;
			const z = placed ? node.z ?? 0 : 0;
			// A plate waiting for its glyphs stays hidden: it appears from the background once they're built.
			const opacity = placed && node.shape.pending !== true ? node.opacity : 0;
			plateCenter[i * 3] = x;
			plateCenter[i * 3 + 1] = y;
			plateCenter[i * 3 + 2] = z;
			plateOpacity[i] = opacity;
			plateTexels[i * 4] = x;
			plateTexels[i * 4 + 1] = y;
			plateTexels[i * 4 + 2] = z;
			plateTexels[i * 4 + 3] = opacity;
			const look = node.look ?? DEFAULT_LOOK;
			if (layout) {
				plateSize[i * 2] = node.shape.width;
				plateSize[i * 2 + 1] = node.shape.height;
				// A style's border colour outlines the plate in place of the colour-by mode's.
				const outline = (look.border === null ? null : this.styleColor(look.border)) ?? node.color;
				plateColor[i * 3] = outline.r;
				plateColor[i * 3 + 1] = outline.g;
				plateColor[i * 3 + 2] = outline.b;
				paint(plateFill, i, look.fill);
				plateShape[i * 2] = look.stroke;
				plateShape[i * 2 + 1] = look.corner;
				plateSelected[i] = node.selected === true ? 1 : node.found === true ? 2 : 0;
				axes(plateRight, i, node.frame?.right);
				axes(plateUp, i, node.frame?.up);
			}
			if (!layout) return;
			for (const glyph of node.shape.glyphs) {
				const arrays = glyphArrays[glyph.page];
				if (arrays === undefined) continue;
				const g = glyphCursor[glyph.page]!++;
				arrays.plate[g] = i;
				arrays.rect[g * 4] = glyph.x;
				arrays.rect[g * 4 + 1] = 0;
				arrays.rect[g * 4 + 2] = glyph.width;
				arrays.rect[g * 4 + 3] = glyph.height;
				arrays.uv.set(glyph.uv, g * 4);
				axes(arrays.right, g, node.frame?.right);
				axes(arrays.up, g, node.frame?.up);
				paint(arrays.ink, g, look.text);
			}
		});
		this.plates.touch("aCenter", "aOpacity");
		if (layout) this.plates.touch("aSize", "aColor", "aSelected", "aRight", "aUp", "aFill", "aShape");
		this.plateTexture.value.needsUpdate = true;
		if (layout) for (const layer of this.glyphs) layer.touch("aPlate", "aRect", "aUv", "aRight", "aUp", "aInk");
		this.timing[layout ? "layout" : "tick"] = performance.now() - start;
	}

	/** A style colour (already checked by `cssColor`), parsed once. */
	private styleColor(css: string): Color {
		let color = this.styleColors.get(css);
		if (color === undefined) {
			color = new Color().setStyle(css);
			this.styleColors.set(css, color);
		}
		return color;
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
			uPlates: this.plateTexture,
		});
		const layer = new QuadLayer(material, GLYPH_ATTRIBUTES);
		layer.mesh.visible = this.labelsVisible;
		// First of the transparent objects, right after the opaque plates: glyphs write no depth, so
		// a nearer edge drawn before them would be painted over by a farther plate's text (T97).
		layer.mesh.renderOrder = GLYPH_RENDER_ORDER;
		this.glyphs.push(layer);
		this.group.add(layer.mesh);
	}

	/** Counts and memory, for the perf readout. */
	stats(): { plates: number; glyphs: number; pages: number; atlasBytes: number; instanceBytes: number; queued: number; layoutMs: number; tickMs: number; glyphMs: number } {
		return {
			queued: this.queued,
			layoutMs: this.timing.layout,
			tickMs: this.timing.tick,
			glyphMs: this.timing.glyphs,
			plates: this.plates.count,
			glyphs: this.glyphs.reduce((sum, layer) => sum + layer.count, 0),
			pages: this.atlas.pages.length,
			// RGBA, plus a third again for the mipmap chain.
			atlasBytes: this.atlas.pages.length * PAGE_PX * PAGE_PX * 4 * (4 / 3),
			instanceBytes: this.glyphs.reduce((sum, layer) => sum + layer.bytes, this.plates.bytes) + this.plateTexture.value.image.width * this.plateTexture.value.image.height * 16,
		};
	}

	dispose(): void {
		this.plates.dispose();
		for (const layer of this.glyphs) layer.dispose();
		this.atlas.dispose();
		this.plateTexture.value.dispose();
		this.group.removeFromParent();
	}
}
