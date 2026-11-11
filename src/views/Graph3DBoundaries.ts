/**
 * Boundaries (clouds) in the 3D graph, every one in a single mesh and draw
 * call. Geometry and which nodes each wraps come from
 * `../graph3d/boundary3d.ts`; the look (fill, opacity, outline colour, width
 * and dashes) is the node's `osmosis-styles` boundary (`NodeLook.boundary`),
 * as the mind map draws it. See
 * `vault/Planner/3D Graph - Boundaries in 3D and far side dimmed.md`.
 *
 * - A **hull** (off a planet) draws only its back faces, so it sits behind
 *   the plates it wraps as a 2D boundary does; its outline is a rim where the
 *   hull turns edge-on, the style's width in screen px (always solid).
 * - A **patch** (on a planet) lies on the surface under its plates (which the
 *   plate pull draws in front); its outline runs round its edge in world
 *   units, dashed or dotted as styled, and on the planet's far side it is
 *   dimmed like the plates (`FAR_SIDE_DIM`).
 * - Both dim with the focus and the mist. Rebuilt only after the scene marks
 *   it stale (positions or styles changed), at most every `REBUILD_MS` (less
 *   often after a costly build, `REBUILD_COST_RATIO`).
 */

import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, type IUniform } from "three";
import { BOUNDARY_PADDING, type ResolvedBoundary } from "../boundary";
import { boundaryGroups, hullMesh, patchMesh, type BoundaryMesh, type BoundaryPlate } from "../graph3d/boundary3d";
import { FAR_SIDE_GLSL } from "../graph3d/far-side";
import type { Vec3 } from "../graph3d/flight";
import { FOCUS_DIM_GLSL } from "../graph3d/focus";
import { STYLE_PX_PER_EM } from "../graph3d/near";
import type { TangentFrame } from "../graph3d/planets";

/** At most this often (ms) while things keep moving, so a settling graph doesn't rebuild hulls every frame. */
const REBUILD_MS = 66;
/** And no sooner than this many times the last build took: a huge subtree (measured ~18 ms for 1,000 plates) rebuilds less often, so building stays near a tenth of the time. */
const REBUILD_COST_RATIO = 10;

/** A loaded node, as boundaries need it (the scene's `EngineNode` fits). */
export interface BoundaryNode {
	id: string;
	x?: number;
	y?: number;
	z?: number;
	shape: { width: number; height: number };
	frame?: TangentFrame;
	color: Color;
	opacity: number;
	departing: boolean;
	look: { boundary: ResolvedBoundary | null };
}

/** The planet a surface plate lies on: its core's ID and position, and its radius. */
export interface BoundarySurface {
	core: string;
	centre: Vec3;
	radius: number;
}

const VERTEX = /* glsl */ `
attribute vec4 aFill;
attribute vec4 aStroke;
attribute vec4 aLine;
varying vec4 vFill;
varying vec4 vStroke;
varying vec4 vLine;
varying vec3 vNormal;
varying vec3 vView;
varying float vKeep;
${FOCUS_DIM_GLSL}
${FAR_SIDE_GLSL}
#include <fog_pars_vertex>
void main() {
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	vNormal = normalMatrix * normal;
	vView = -mvPosition.xyz;
	vFill = aFill;
	vStroke = aStroke;
	vLine = aLine;
	vKeep = 1.0 - focusDim(-mvPosition.z);
	// A patch (aLine.x >= 0) has the sphere's outward normal: on the far side it dims as the plates do.
	if (aLine.x >= 0.0) vKeep *= farSideKeep(normal, position);
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
varying vec4 vFill;
varying vec4 vStroke;
// x: distance in from a patch's outline (−1 on a hull), y: arc length along it, z: outline width (world on a patch, px on a hull), w: 0 solid, 1 dashed, 2 dotted.
varying vec4 vLine;
varying vec3 vNormal;
varying vec3 vView;
varying float vKeep;
#include <fog_pars_fragment>
void main() {
	float rim = 0.0;
	if (vLine.x < 0.0) {
		// A hull's back faces only: it lies behind what it wraps.
		if (gl_FrontFacing) discard;
		float ndv = abs(dot(normalize(vNormal), normalize(vView)));
		float px = ndv / max(fwidth(ndv), 1e-4);
		if (vLine.z > 0.0) rim = 1.0 - smoothstep(vLine.z - 0.5, vLine.z + 0.5, px);
	} else if (vLine.z > 0.0) {
		float aa = max(fwidth(vLine.x), 1e-5);
		rim = 1.0 - smoothstep(vLine.z - aa, vLine.z + aa, vLine.x);
		// The mind map's dashes: dashed 4 on 3 off, dotted a dot every 2.5, in outline widths.
		if (vLine.w > 0.5) {
			float period = vLine.z * (vLine.w < 1.5 ? 7.0 : 2.5);
			float on = vLine.w < 1.5 ? 4.0 / 7.0 : 0.4;
			rim *= step(fract(vLine.y / period), on);
		}
	}
	gl_FragColor = vec4(mix(vFill.rgb, vStroke.rgb, rim), mix(vFill.a, vStroke.a, rim) * vKeep);
	if (gl_FragColor.a <= 0.002) discard;
	#include <fog_fragment>
	#include <colorspace_fragment>
}
`;

const DASH = { solid: 0, dashed: 1, dotted: 2 } as const;

export class Graph3DBoundaries {
	readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
	private stale = false;
	private builtAt = -Infinity;
	/** How long the last build took (ms). */
	private buildMs = 0;
	/** Style colours as parsed, by their CSS text (as the plates keep them). */
	private readonly colors = new Map<string, Color>();

	/** `emWorld`: world units per em of line-plate text, to turn the style's px into world units as the near tier does. */
	constructor(focus: IUniform<number>, private readonly emWorld: number) {
		const material = new ShaderMaterial({
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			uniforms: UniformsUtils.clone(UniformsLib.fog) as Record<string, IUniform>,
			fog: true,
			transparent: true,
			depthWrite: false,
			side: DoubleSide,
		});
		material.uniforms.uFocus = focus;
		this.mesh = new Mesh(new BufferGeometry(), material);
		this.mesh.frustumCulled = false;
		this.mesh.visible = false;
	}

	/** Positions, plates or styles changed: rebuild on a coming `update`. */
	invalidate(): void {
		this.stale = true;
	}

	/**
	 * Rebuild if stale and the last build is at least `REBUILD_MS` old.
	 * `hierarchy`: the outline's parent → child edges; `surface`: the planet a
	 * plate lies on (Planets mode), or null.
	 */
	update(nodes: readonly BoundaryNode[], hierarchy: readonly { source: string; target: string }[], surface: (node: BoundaryNode) => BoundarySurface | null, now: number): void {
		if (!this.stale || now - this.builtAt < Math.max(REBUILD_MS, this.buildMs * REBUILD_COST_RATIO)) return;
		this.stale = false;
		this.builtAt = now;
		const start = performance.now();
		this.build(nodes, hierarchy, surface);
		this.buildMs = performance.now() - start;
	}

	private build(nodes: readonly BoundaryNode[], hierarchy: readonly { source: string; target: string }[], surface: (node: BoundaryNode) => BoundarySurface | null): void {
		const byId = new Map<string, BoundaryNode>();
		let any = false;
		for (const node of nodes) {
			if (node.departing || node.x === undefined || node.y === undefined || node.z === undefined) continue;
			byId.set(node.id, node);
			if (node.look.boundary !== null) any = true;
		}
		if (!any) {
			if (this.mesh.visible) this.replace(null);
			return;
		}
		const groups = boundaryGroups([...byId.keys()], hierarchy, (id) => byId.get(id)?.look.boundary != null);
		const out = { positions: [] as number[], normals: [] as number[], index: [] as number[], fill: [] as number[], stroke: [] as number[], line: [] as number[] };
		const em = this.emWorld / STYLE_PX_PER_EM;
		for (const group of groups) {
			const owner = byId.get(group.id)!;
			const look = owner.look.boundary!;
			const members = group.members.map((id) => byId.get(id)!);
			const padding = BOUNDARY_PADDING * em * (1 + group.nest);
			// A planet's plate is wrapped as it lies in its continent's frame (as `continentMap` lays it out), not as it spins for the camera, so the boundary needn't follow the camera.
			const plates: BoundaryPlate[] = members.map((n) => ({ x: n.x!, y: n.y!, z: n.z!, width: n.shape.width, height: n.shape.height, right: n.frame?.right, up: n.frame?.up }));
			// A patch when every plate lies on one planet's surface; otherwise a hull.
			const places = members.map(surface);
			const first = places[0];
			const onePlanet = first !== null && first !== undefined && places.every((p) => p !== null && p.core === first.core);
			const strokeWorld = look.strokeWidth * em;
			const mesh: BoundaryMesh = onePlanet ? patchMesh(plates, first.centre, first.radius, padding, Math.max(padding * 0.5, strokeWorld * 1.5)) : hullMesh(plates, padding);
			// An unset colour is the node's own (its colour-by colour), as 2D tints by the node.
			const fill = look.fill === null ? owner.color : this.parse(look.fill);
			const stroke = look.stroke === null ? owner.color : this.parse(look.stroke);
			const base = out.positions.length / 3;
			const count = mesh.positions.length / 3;
			out.positions.push(...mesh.positions);
			out.normals.push(...mesh.normals);
			for (const i of mesh.index) out.index.push(base + i);
			for (let i = 0; i < count; i++) {
				out.fill.push(fill.r, fill.g, fill.b, look.fillOpacity * owner.opacity);
				out.stroke.push(stroke.r, stroke.g, stroke.b, look.strokeOpacity * owner.opacity);
				out.line.push(mesh.edge[i]!, mesh.arc[i]!, onePlanet ? strokeWorld : look.strokeWidth, DASH[look.dash]);
			}
		}
		this.replace(out.index.length === 0 ? null : out);
	}

	/** Swap in a new geometry (or none), releasing the old one's GPU buffers. */
	private replace(data: { positions: number[]; normals: number[]; index: number[]; fill: number[]; stroke: number[]; line: number[] } | null): void {
		this.mesh.geometry.dispose();
		const geometry = new BufferGeometry();
		if (data !== null) {
			geometry.setAttribute("position", new BufferAttribute(new Float32Array(data.positions), 3));
			geometry.setAttribute("normal", new BufferAttribute(new Float32Array(data.normals), 3));
			geometry.setAttribute("aFill", new BufferAttribute(new Float32Array(data.fill), 4));
			geometry.setAttribute("aStroke", new BufferAttribute(new Float32Array(data.stroke), 4));
			geometry.setAttribute("aLine", new BufferAttribute(new Float32Array(data.line), 4));
			geometry.setIndex(data.index);
		}
		this.mesh.geometry = geometry;
		this.mesh.visible = data !== null;
	}

	private parse(css: string): Color {
		let color = this.colors.get(css);
		if (color === undefined) {
			color = new Color().setStyle(css);
			this.colors.set(css, color);
		}
		return color;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}
