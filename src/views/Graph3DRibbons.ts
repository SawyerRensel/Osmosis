import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial, type Color, type Material } from "three";
import type { Vec3 } from "../graph3d/flight";
import { PLATE_END_ATTRIBUTES, writePlateEnd, type PlateEnd, type PlateEndArrays } from "../graph3d/own-plate";
import { RIBBON_FRAGMENT_GLSL, RIBBON_VERTEX_GLSL } from "../graph3d/taper";

/** Floats per vertex in each attribute. */
/** With both end plates of the edge, which it passes under (`own-plate.ts`, via the scene's `patch`). */
const ATTRIBUTES = { position: 3, color: 4, aCore: 4, aRibbon: 4, aDash: 3, ...PLATE_END_ATTRIBUTES } as const;
type AttributeName = keyof typeof ATTRIBUTES;

/**
 * The tapered hierarchy edges (`taper.ts`): every ribbon segment of every
 * edge in one indexed mesh, so one draw call. Each segment is a quad of four
 * vertices on its two end points; the vertex shader pushes them apart to face
 * the camera, so the mesh is rewritten only when the edges change (the
 * scene's `writeEdges`), never as the camera moves.
 *
 * Like the line edges it dims with the focus and on a planet's far side
 * (`aCore`, via the `patch` the scene hands in).
 */
export class Graph3DRibbons {
	readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
	/** The drawing buffer's half height in device px, for the shader's one-pixel floor. */
	private readonly halfHeight = { value: 1 };
	private arrays: Record<AttributeName, BufferAttribute> | null = null;
	private capacity = 0;
	private count = 0;
	/** The plates at the ends of the edge being written (`ends`). */
	private endA: PlateEnd | null = null;
	private endB: PlateEnd | null = null;

	/** `patch` dims the material as the line edges are (`dimWithFocus` with the far side). */
	constructor(patch: (material: Material) => void) {
		const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
		patch(material);
		const dim = material.onBeforeCompile.bind(material);
		const key = material.customProgramCacheKey.bind(material);
		material.customProgramCacheKey = () => `${key()}-ribbon`;
		material.onBeforeCompile = (shader, renderer) => {
			dim(shader, renderer);
			shader.uniforms.uRibbonHalfHeight = this.halfHeight;
			shader.vertexShader = shader.vertexShader
				.replace("void main() {", "attribute vec4 aRibbon;\nattribute vec3 aDash;\nuniform float uRibbonHalfHeight;\nvarying vec3 vDash;\nvoid main() {")
				.replace("#include <begin_vertex>", `#include <begin_vertex>\n${RIBBON_VERTEX_GLSL}`);
			shader.fragmentShader = shader.fragmentShader.replace("void main() {", `varying vec3 vDash;\nvoid main() {\n${RIBBON_FRAGMENT_GLSL}`);
		};
		this.mesh = new Mesh(new BufferGeometry(), material);
		this.mesh.frustumCulled = false;
		// The attributes exist before the first frame draws, so the program compiles with RGBA colours from the start.
		this.begin(0);
		this.end();
	}

	/** The canvas's drawing buffer height in device px; cheap to call every frame. */
	setViewportHeight(px: number): void {
		this.halfHeight.value = Math.max(1, px / 2);
	}

	/** Start a rewrite of at most `segments` segments, growing the buffers if they are too small. */
	begin(segments: number): void {
		this.count = 0;
		if (this.arrays !== null && segments <= this.capacity) return;
		const capacity = Math.max(64, Math.ceil(segments * 1.5));
		const geometry = this.mesh.geometry;
		geometry.dispose();
		const arrays = {} as Record<AttributeName, BufferAttribute>;
		for (const name of Object.keys(ATTRIBUTES) as AttributeName[]) {
			const size = ATTRIBUTES[name];
			arrays[name] = new BufferAttribute(new Float32Array(capacity * 4 * size), size).setUsage(DynamicDrawUsage);
			geometry.setAttribute(name, arrays[name]);
		}
		// Two triangles a quad: a's two sides, then b's.
		const index = new Uint32Array(capacity * 6);
		for (let q = 0; q < capacity; q++) index.set([4 * q, 4 * q + 1, 4 * q + 2, 4 * q + 2, 4 * q + 1, 4 * q + 3], 6 * q);
		geometry.setIndex(new BufferAttribute(index, 1));
		this.arrays = arrays;
		this.capacity = capacity;
	}

	/** The plates at the ends of the edge whose segments come next. */
	ends(a: PlateEnd, b: PlateEnd): void {
		this.endA = a;
		this.endB = b;
	}

	/**
	 * One segment from `a` to `b`, full widths `wa` and `wb` in world units,
	 * `along` world units down its edge at `a` (for dashes: `on` drawn of every
	 * `period`, 0 = solid), each end's planet core or null (the far-side dim).
	 */
	segment(a: Vec3, b: Vec3, wa: number, wb: number, along: number, dash: { on: number; period: number }, color: Color, alpha: number, coreA: Vec3 | null, coreB: Vec3 | null): void {
		const arrays = this.arrays;
		if (arrays === null || this.count >= this.capacity) return;
		const [dx, dy, dz] = [b.x - a.x, b.y - a.y, b.z - a.z];
		const length = Math.hypot(dx, dy, dz);
		let vertex = this.count * 4;
		const endA: PlateEndArrays = { centre: arrays.aEndA.array as Float32Array, right: arrays.aEndARight.array as Float32Array, up: arrays.aEndAUp.array as Float32Array };
		const endB: PlateEndArrays = { centre: arrays.aEndB.array as Float32Array, right: arrays.aEndBRight.array as Float32Array, up: arrays.aEndBUp.array as Float32Array };
		for (const [end, half, core, at] of [
			[a, wa / 2, coreA, along],
			[b, wb / 2, coreB, along + length],
		] as const) {
			for (const side of [1, -1]) {
				arrays.position.setXYZ(vertex, end.x, end.y, end.z);
				arrays.color.setXYZW(vertex, color.r, color.g, color.b, alpha);
				if (core === null) arrays.aCore.setXYZW(vertex, 0, 0, 0, 0);
				else arrays.aCore.setXYZW(vertex, core.x, core.y, core.z, 1);
				arrays.aRibbon.setXYZW(vertex, dx, dy, dz, side * half);
				writePlateEnd(endA, vertex, this.endA);
				writePlateEnd(endB, vertex, this.endB);
				arrays.aDash.setXYZ(vertex++, at, dash.on, dash.period);
			}
		}
		this.count++;
	}

	/** Finish a rewrite: draw what `segment` wrote since `begin`. */
	end(): void {
		const geometry = this.mesh.geometry;
		geometry.setDrawRange(0, this.count * 6);
		if (this.arrays !== null) for (const attribute of Object.values(this.arrays)) attribute.needsUpdate = true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.arrays = null;
	}
}
