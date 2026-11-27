/**
 * Every node of Cosmos as a label plate, drawn in a few draw calls: one
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
 *   (`../cosmos/own-plate.ts`). Glyphs blend over their own plate,
 *   which is always drawn first, and use a polygon offset to win the depth tie.
 * - **Fading:** an opaque plate can't fade with alpha, so arrival and
 *   departure mix it toward the background colour (as the mist does). Focus
 *   dimming (`../cosmos/focus.ts`) folds into the same mix, from the depth of
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
 *   `../cosmos/node-style.ts`) rides in instance attributes: fill, outline
 *   colour and thickness, corner radius, shape and dash, text colour. An
 *   unstyled plate keeps the theme uniforms, so styling adds no draw call.
 * - **Shapes (T130):** a shaped plate is laid out larger, as the mind map
 *   sizes the shape round its text (`shapeBox`), and the fragment shader draws
 *   the shape's signed distance by id (`PLATE_SHAPE_ID`): a rounded box,
 *   an ellipse, a circle, a polygon of up to eight corners, or four
 *   overlapping ellipses for a cloud. Dashes run along an arc length: the
 *   polygon's own perimeter, or an inscribed octagon's for a curved shape.
 *   Picks and spacing keep the plate's bounding box.
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
import { GlyphPacker, PLATE_STROKE_EM, PLATE_HEIGHT_EM, PLATE_TEXTURE_WIDTH, ShapeCache, drainWithin, layoutPlate, plateTextureRows, shapeKey, type PlateLayout } from "../cosmos/plates";
import { FAR_SIDE_DIM } from "../cosmos/far-side";
import { UPRIGHT_GLSL } from "../cosmos/upright";
import { FOCUS_DIM_GLSL } from "../cosmos/focus";
import { DEFAULT_FONT, DEFAULT_LOOK, fontKey, plateAlign, type FontLook, type NodeLook } from "../cosmos/node-style";
import { DASH_EM, DASH_ID, PLATE_SHAPE_ID, shapeBox } from "../cosmos/plate-shapes";
import type { TopicShape } from "../styles";

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
	/** World units per em of its text: the outline and dashes are sized by it, not by a shape's larger box. */
	em: number;
	/** How far the text's centre sits right of the plate's (a triangle's inner box is off-centre). */
	textX: number;
	glyphs: ShapeGlyph[];
	/** Its glyphs aren't built yet (`CosmosPlates.write` builds them): the plate is drawn hidden until they are. */
	pending?: boolean;
}

/** A plate waiting for its glyphs: its layout in font px, and the scale to world units. */
interface QueuedShape {
	shape: PlateShape;
	layout: PlateLayout;
	scale: number;
	/** The atlas face its glyphs are drawn in. Atlases (and so faces) are replaced only with the queue cleared. */
	face: AtlasFace;
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

/** One face of the scene font the atlas draws in (`fontKey`): its canvas font, and its characters' measured advances. */
interface AtlasFace {
	/** Prefixes its characters in the packer, so a face's "a" gets its own slot. */
	id: number;
	font: string;
	advances: Map<string, number>;
}

/**
 * The shared glyph atlas: measured advances, and pages drawn as characters
 * first appear. Each face a style asks for (`FontLook`: family, weight,
 * slant) draws its characters into the same pages, so a face costs only the
 * slots its characters take, never a page of its own.
 */
class GlyphAtlas {
	readonly pages: AtlasPage[] = [];
	private readonly packer = new GlyphPacker(PAGE_PX, ROW_PX);
	private readonly faces = new Map<string, AtlasFace>();
	private readonly glyphs = new Map<string, AtlasGlyph>();
	private readonly measure: CanvasRenderingContext2D | null;
	/** The face `measure` is set to, so measuring a run of one face's characters sets its font once. */
	private measuring: AtlasFace | null = null;
	/** The scene's own face: the theme font. */
	readonly base: AtlasFace;

	constructor(private readonly family: string) {
		this.measure = createEl("canvas").getContext("2d");
		this.base = { id: 0, font: `${FONT_PX}px ${family}`, advances: new Map() };
		this.faces.set("", this.base);
	}

	/** How many faces the plates have asked for, the scene's own included. */
	get faceCount(): number {
		return this.faces.size;
	}

	/**
	 * The face `font` is drawn in, made on first use. A family the canvas can't
	 * parse is dropped, and one that isn't installed falls through to the
	 * theme font, which follows it in the font's family list.
	 */
	face(font: FontLook): AtlasFace {
		const key = fontKey(font);
		const known = this.faces.get(key);
		if (known !== undefined) return known;
		const css = (family: string | null): string => `${font.italic ? "italic " : ""}${font.weight ?? "normal"} ${FONT_PX}px ${family === null ? "" : `"${family}", `}${this.family}`;
		let face = css(font.family);
		if (this.measure !== null && font.family !== null) {
			// A font the canvas rejects leaves its old one: measure with the theme's then.
			this.measuring = null;
			this.measure.font = "1px serif";
			this.measure.font = face;
			if (this.measure.font === "1px serif") face = css(null);
		}
		const created: AtlasFace = { id: this.faces.size, font: face, advances: new Map() };
		this.faces.set(key, created);
		return created;
	}

	advance(face: AtlasFace, char: string): number {
		let advance = face.advances.get(char);
		if (advance === undefined) {
			this.measureIn(face);
			face.advances.set(char, (advance = this.measure?.measureText(char).width ?? FONT_PX / 2));
		}
		return advance;
	}

	glyph(face: AtlasFace, char: string): AtlasGlyph {
		const key = `${face.id}\u0000${char}`;
		const known = this.glyphs.get(key);
		if (known !== undefined) return known;
		this.measureIn(face);
		const metrics = this.measure?.measureText(char);
		// Ink can reach past the advance on either side (a "j" or an italic overhang).
		const inkLeft = Math.max(0, Math.ceil(metrics?.actualBoundingBoxLeft ?? 0));
		const inkRight = Math.max(Math.ceil(this.advance(face, char)), Math.ceil(metrics?.actualBoundingBoxRight ?? 0));
		const slot = this.packer.slot(key, inkLeft + inkRight + 2 * GLYPH_PAD_PX);
		const page = this.page(slot.page);
		if (page.context !== null) {
			page.context.font = face.font;
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
		this.glyphs.set(key, glyph);
		return glyph;
	}

	private measureIn(face: AtlasFace): void {
		if (this.measure === null || this.measuring === face) return;
		this.measure.font = face.font;
		this.measuring = face;
	}

	private page(index: number): AtlasPage {
		while (this.pages.length <= index) {
			const canvas = createEl("canvas", { attr: { width: PAGE_PX, height: PAGE_PX } });
			const context = canvas.getContext("2d");
			if (context !== null) {
				context.font = this.base.font;
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
attribute vec4 aShape;
attribute float aEm;
varying vec2 vLocal;
varying vec2 vHalf;
varying vec3 vColor;
varying float vOpacity;
varying float vSelected;
varying vec4 vFill;
varying vec4 vShape;
varying float vEm;
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
	vEm = aEm;
	vOpacity = aOpacity * (1.0 - focusDim(-mvPosition.z)) * (plateBack ? ${(1 - FAR_SIDE_DIM).toFixed(4)} : 1.0);
	${fogVertex(false)}
}
`;

/** A shape id in the fragment shader, as a float literal. */
const shapeId = (shape: TopicShape): string => PLATE_SHAPE_ID[shape].toFixed(1);

/**
 * Signed distances for the plate shapes (negative inside), in the plate's own
 * units, centred, y up. `poly` holds a polygon's corners for `polyDistance`,
 * which also returns the arc length round it to the nearest point, for dashes.
 */
const SHAPE_GLSL = /* glsl */ `
vec2 poly[8];
int polyCount;
float boxDistance(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - (b - r);
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// An ellipse's distance, close to the edge (Quilez's approximation).
float ellipseDistance(vec2 p, vec2 b) {
	float k1 = length(p / (b * b));
	if (k1 < 1e-6) return -min(b.x, b.y);
	float k0 = length(p / b);
	return k0 * (k0 - 1.0) / k1;
}
void setRect(vec2 b) {
	poly[0] = vec2(-b.x, b.y); poly[1] = vec2(b.x, b.y); poly[2] = vec2(b.x, -b.y); poly[3] = vec2(-b.x, -b.y);
	polyCount = 4;
}
// An octagon inscribed in an ellipse: a curved shape's dashes are spaced along its perimeter.
void setOctagon(vec2 b) {
	for (int i = 0; i < 8; i++) {
		float a = 1.5708 - float(i) * 0.7854;
		poly[i] = b * vec2(cos(a), sin(a));
	}
	polyCount = 8;
}
// The mind map's polygons (shapes.ts), from its box's half size, y up.
void setPolygon(float shape, vec2 b) {
	float w = 2.0 * b.x;
	float h = 2.0 * b.y;
	if (shape < ${shapeId("hexagon")} - 0.5) {
		poly[0] = vec2(0.0, b.y); poly[1] = vec2(b.x, 0.0); poly[2] = vec2(0.0, -b.y); poly[3] = vec2(-b.x, 0.0);
		polyCount = 4;
	} else if (shape < ${shapeId("octagon")} - 0.5) {
		float inset = min(w * 0.25, h * 0.5);
		poly[0] = vec2(-b.x + inset, b.y); poly[1] = vec2(b.x - inset, b.y); poly[2] = vec2(b.x, 0.0);
		poly[3] = vec2(b.x - inset, -b.y); poly[4] = vec2(-b.x + inset, -b.y); poly[5] = vec2(-b.x, 0.0);
		polyCount = 6;
	} else if (shape < ${shapeId("triangle")} - 0.5) {
		vec2 i = vec2(w, h) * 0.29;
		poly[0] = vec2(-b.x + i.x, b.y); poly[1] = vec2(b.x - i.x, b.y); poly[2] = vec2(b.x, b.y - i.y); poly[3] = vec2(b.x, -b.y + i.y);
		poly[4] = vec2(b.x - i.x, -b.y); poly[5] = vec2(-b.x + i.x, -b.y); poly[6] = vec2(-b.x, -b.y + i.y); poly[7] = vec2(-b.x, b.y - i.y);
		polyCount = 8;
	} else if (shape < ${shapeId("parallelogram")} - 0.5) {
		poly[0] = vec2(-b.x, b.y); poly[1] = vec2(b.x, 0.0); poly[2] = vec2(-b.x, -b.y);
		polyCount = 3;
	} else if (shape < ${shapeId("trapezoid")} - 0.5) {
		float skew = min(w * 0.2, h);
		poly[0] = vec2(-b.x + skew, b.y); poly[1] = vec2(b.x, b.y); poly[2] = vec2(b.x - skew, -b.y); poly[3] = vec2(-b.x, -b.y);
		polyCount = 4;
	} else if (shape < ${shapeId("arrow-right")} - 0.5) {
		float inset = w * 0.15;
		poly[0] = vec2(-b.x + inset, b.y); poly[1] = vec2(b.x - inset, b.y); poly[2] = vec2(b.x, -b.y); poly[3] = vec2(-b.x, -b.y);
		polyCount = 4;
	} else {
		float notch = min(w * 0.3, h);
		poly[0] = vec2(-b.x, b.y); poly[1] = vec2(b.x - notch, b.y); poly[2] = vec2(b.x, 0.0);
		poly[3] = vec2(b.x - notch, -b.y); poly[4] = vec2(-b.x, -b.y); poly[5] = vec2(-b.x + notch * 0.5, 0.0);
		polyCount = 6;
	}
}
// Distance to the polygon in poly (negative inside; Quilez's winding test), and the arc length from its first corner to the nearest point.
vec2 polyDistance(vec2 p) {
	float best = 1e20;
	float arc = 0.0;
	float run = 0.0;
	float side = 1.0;
	for (int i = 0; i < 8; i++) {
		if (i >= polyCount) break;
		vec2 a = poly[i];
		vec2 e = poly[i + 1 < polyCount ? i + 1 : 0] - a;
		vec2 w = p - a;
		float len = length(e);
		float t = clamp(dot(w, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
		vec2 q = w - e * t;
		float dd = dot(q, q);
		if (dd < best) {
			best = dd;
			arc = run + t * len;
		}
		run += len;
		bvec3 crosses = bvec3(p.y >= a.y, p.y < a.y + e.y, e.x * w.y > e.y * w.x);
		if (all(crosses) || all(not(crosses))) side = -side;
	}
	return vec2(side * sqrt(best), arc);
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
// The style's outline thickness (× the default), corner radius (share of the height), shape id (PLATE_SHAPE_ID) and dash id (DASH_ID).
varying vec4 vShape;
// World units per em of the plate's text.
varying float vEm;
${SHAPE_GLSL}
#include <fog_pars_fragment>
void main() {
	vec2 p = vLocal;
	vec2 b = vHalf;
	float shape = vShape.z;
	// The selection and find borders are solid, as the mind map's are.
	bool dashed = vShape.w > 0.5 && vSelected < 0.5;
	float d;
	// Distance to the drawn outline (an underline's is its bottom edge alone), and the arc length round it, for dashes.
	float edgeD;
	float arc = 0.0;
	if (shape < 0.5 || shape > ${shapeId("underline")} - 0.5) {
		d = boxDistance(p, b, shape < 0.5 ? min(b.y * 2.0 * vShape.y, min(b.x, b.y)) : 0.0);
		edgeD = d;
		if (shape > ${shapeId("underline")} - 0.5 && shape < ${shapeId("none")} - 0.5) {
			edgeD = -(p.y + b.y);
			arc = p.x + b.x;
		} else if (dashed) {
			setRect(b);
			arc = polyDistance(p).y;
		}
	} else if (shape < ${shapeId("circle")} - 0.5) {
		d = ellipseDistance(p, b);
		edgeD = d;
		if (dashed) {
			setOctagon(b);
			arc = polyDistance(p).y;
		}
	} else if (shape < ${shapeId("diamond")} - 0.5) {
		float r = min(b.x, b.y);
		d = length(p) - r;
		edgeD = d;
		arc = (atan(p.y, p.x) + 3.14159) * r;
	} else if (shape < ${shapeId("cloud")} - 0.5) {
		setPolygon(shape, b);
		vec2 da = polyDistance(p);
		d = da.x;
		edgeD = d;
		arc = da.y;
	} else {
		// Four overlapping lobes, one a quadrant: the mind map's cloud of four bumps.
		vec2 q = abs(p);
		vec2 c = b * vec2(0.34, 0.4);
		vec2 r = b * vec2(0.5, 0.6);
		d = min(ellipseDistance(q - c, r), min(ellipseDistance(q - vec2(-c.x, c.y), r), ellipseDistance(q - vec2(c.x, -c.y), r)));
		edgeD = d;
		if (dashed) {
			setOctagon(b * vec2(0.84, 1.0));
			arc = polyDistance(p).y;
		}
	}
	float aa = max(fwidth(d), 1e-4);
	// Before any branch or discard: derivatives want every pixel of a quad to take them.
	float edgeAa = max(fwidth(edgeD), 1e-4);
	float arcStep = max(fwidth(arc), 1e-4);
	float coverage = clamp(0.5 - d / aa, 0.0, 1.0);
	if (coverage <= 0.0) discard;
	float stroke = vEm * ${PLATE_STROKE_EM.toFixed(4)} * vShape.x;
	// A selected plate's border is the accent, and never under 2 px, as the mind map's selection is. A find match's is as thick, in the find colour.
	float selected = step(0.5, vSelected) * (1.0 - step(1.5, vSelected));
	float found = step(1.5, vSelected);
	stroke = mix(stroke, max(stroke * 1.5, 2.0 * aa), max(selected, found));
	vec3 edge = mix(mix(vColor, uFound, found), uAccent, selected);
	// An outline thinner than a pixel is drawn a pixel wide and that much fainter,
	// so a distant plate's border doesn't shimmer as it lands between pixels.
	float band = max(stroke, aa);
	float border = smoothstep(-band - edgeAa * 0.5, -band + edgeAa * 0.5, edgeD) * (stroke / band);
	if (dashed) {
		// The mind map's stroke-dasharray, in ems of text; dashes finer than about two pixels blend to their share of the line.
		vec2 dash = vEm * (vShape.w < 1.5 ? vec2(${DASH_EM.dashed[0].toFixed(4)}, ${DASH_EM.dashed[1].toFixed(4)}) : vec2(${DASH_EM.dotted[0].toFixed(4)}, ${DASH_EM.dotted[1].toFixed(4)}));
		float period = dash.x + dash.y;
		float phase = mod(arc, period);
		float on = clamp((dash.x - phase) / arcStep + 0.5, 0.0, 1.0) * clamp(phase / arcStep + 0.5, 0.0, 1.0);
		border *= mix(on, dash.x / period, smoothstep(0.25, 0.5, arcStep / period));
	}
	vec3 fill = mix(uFill, vFill.rgb, vFill.a);
	// Underline and none have no plate of their own: the scene's background, unless a none node's style fills it (inline, as in the mind map).
	if (shape > ${shapeId("underline")} - 0.5 && (shape < ${shapeId("none")} - 0.5 || vFill.a < 0.5)) fill = uBackground;
	gl_FragColor = vec4(mix(uBackground, mix(fill, edge, border), vOpacity), coverage);
	#include <fog_fragment>
	#include <colorspace_fragment>
}
`;

const GLYPH_VERTEX = /* glsl */ `
// The plate's centre (xyz) and opacity (w), one texel per plate (\`CosmosPlates.write\`).
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
const PLATE_ATTRIBUTES = { aCenter: 3, aOpacity: 1, aSize: 2, aColor: 3, aSelected: 1, aRight: 3, aUp: 3, aFill: 4, aShape: 4, aEm: 1 } as const;
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

export class CosmosPlates {
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
	/** The theme's font family list, every face's fallback. */
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
	private readonly plateTexture: IUniform<DataTexture> = { value: CosmosPlates.plateTexture(1) };
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
		if (colors.font === this.font) return;
		this.font = colors.font;
		this.atlas.dispose();
		this.atlas = new GlyphAtlas(colors.font);
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

	/**
	 * Lay `text` out on a plate `height` world units tall, its text cut at
	 * `maxEm` ems wide and the plate at least `minEm` wide, in `font`'s face
	 * and alignment. A bigger text size (`font.scale`) is a taller plate: its
	 * ems are the height's share, so its text and widths scale with it, its
	 * outline doesn't.
	 */
	shape(text: string, height: number, maxEm: number, minEm = 0, topicShape: TopicShape = "rounded-rect", font: FontLook = DEFAULT_FONT): PlateShape {
		const key = shapeKey(text, height, maxEm, minEm, topicShape, `${fontKey(font)}|${font.scale}`);
		const known = this.shapes.get(key);
		if (known !== undefined) return known;
		const face = this.atlas.face(font);
		const layout = layoutPlate(text, (char) => this.atlas.advance(face, char), FONT_PX, maxEm * FONT_PX, minEm * FONT_PX, plateAlign(font));
		const scale = height / layout.height;
		// A shape is laid out round its text as the mind map's is: its text in the shape's inner box.
		const box = shapeBox(topicShape, layout.width * scale, height);
		// The outline and dashes keep the unscaled text's em: the mind map's border is in px, whatever the text size.
		const shape: PlateShape = { width: box.width, height: box.height, em: height / PLATE_HEIGHT_EM / font.scale, textX: box.textX, glyphs: [], pending: true };
		this.shapes.set(key, shape);
		this.queue.push({ shape, layout, scale, face });
		return shape;
	}

	/** Plates still waiting for their glyphs. While any are, the scene keeps writing. */
	get queued(): number {
		return this.queue.length - this.queueAt;
	}

	/** Build a queued plate's glyphs, drawing any new characters into the atlas. */
	private build({ shape, layout, scale, face }: QueuedShape): void {
		shape.glyphs = layout.glyphs.map(({ char, x }) => {
			const glyph = this.atlas.glyph(face, char);
			return {
				page: glyph.page,
				x: (x + glyph.left + glyph.width / 2) * scale + shape.textX,
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
			this.plateTexture.value = CosmosPlates.plateTexture(rows);
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
		const plateEm = this.plates.array("aEm");
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
				plateShape[i * 4] = look.stroke;
				plateShape[i * 4 + 1] = look.corner;
				plateShape[i * 4 + 2] = PLATE_SHAPE_ID[look.shape];
				plateShape[i * 4 + 3] = DASH_ID[look.dash];
				plateEm[i] = node.shape.em;
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
		if (layout) this.plates.touch("aSize", "aColor", "aSelected", "aRight", "aUp", "aFill", "aShape", "aEm");
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
	stats(): { plates: number; glyphs: number; pages: number; faces: number; atlasBytes: number; instanceBytes: number; queued: number; layoutMs: number; tickMs: number; glyphMs: number } {
		return {
			queued: this.queued,
			layoutMs: this.timing.layout,
			tickMs: this.timing.tick,
			glyphMs: this.timing.glyphs,
			plates: this.plates.count,
			glyphs: this.glyphs.reduce((sum, layer) => sum + layer.count, 0),
			pages: this.atlas.pages.length,
			faces: this.atlas.faceCount,
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
