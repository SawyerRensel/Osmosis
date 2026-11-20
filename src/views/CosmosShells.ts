/**
 * Planets mode's core layer shells: with Core layers above 1, each planet's
 * inner shells (`PlanetLayout.shells`) draw as faint translucent spheres in
 * the planet's colour, brightest at the rim, and each fades out as the camera
 * comes close to it (`shellFade`, computed in the shader, so moving the
 * camera costs nothing here). Every shell of every planet is one instance of
 * one shared sphere, so all of them are a single draw call. They write no
 * depth, so they never hide a plate or stop one being picked. See
 * `vault/Planner/3D Graph - Planet core layer shells drawn.md`.
 */

import { Color, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, ShaderMaterial, SphereGeometry, UniformsLib, UniformsUtils, type IUniform } from "three";
import { SHELL_ALPHA, SHELL_FACE_SHARE, SHELL_FADE_GLSL } from "../cosmos/shells";

/** One shell to draw: its planet's centre, its radius, colour and opacity (the core's, as it fades in or out). */
export interface ShellInstance {
	x: number;
	y: number;
	z: number;
	radius: number;
	color: Color;
	alpha: number;
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aShell;
varying vec4 vShell;
varying vec3 vNormal;
varying vec3 vView;
${SHELL_FADE_GLSL}
void main() {
	vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
	vNormal = world.xyz - centre;
	vView = cameraPosition - world.xyz;
	vShell = vec4(aShell.rgb, aShell.a * shellFade(length(cameraPosition - centre), length(vNormal)));
	vec4 mvPosition = viewMatrix * world;
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec4 vShell;
varying vec3 vNormal;
varying vec3 vView;
void main() {
	float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
	float alpha = vShell.a * ${SHELL_ALPHA.toFixed(4)} * mix(${SHELL_FACE_SHARE.toFixed(4)}, 1.0, rim * rim);
	if (alpha < 0.002) discard;
	gl_FragColor = vec4(vShell.rgb, alpha);
	#include <fog_fragment>
}
`;

/** The shared sphere's segments round and top to bottom: smooth enough for a rim filling the view, cheap enough for many shells on a phone. */
const SEGMENTS = [40, 20] as const;

export class CosmosShells {
	readonly group = new Group();
	private readonly material: ShaderMaterial;
	private mesh: InstancedMesh<SphereGeometry, ShaderMaterial> | null = null;
	private readonly matrix = new Matrix4();

	constructor() {
		this.material = new ShaderMaterial({
			vertexShader: VERTEX,
			fragmentShader: FRAGMENT,
			uniforms: UniformsUtils.clone(UniformsLib.fog) as Record<string, IUniform>,
			fog: true,
			transparent: true,
			depthWrite: false,
			side: DoubleSide,
		});
	}

	/** Draw these shells (none hides the mesh). The mesh grows, never shrinks, so a re-layout doesn't reallocate. */
	write(shells: readonly ShellInstance[]): void {
		if (shells.length === 0) {
			if (this.mesh !== null) this.mesh.visible = false;
			return;
		}
		const mesh = this.reserve(shells.length);
		const data = (mesh.geometry.getAttribute("aShell") as InstancedBufferAttribute).array as Float32Array;
		shells.forEach((shell, i) => {
			this.matrix.makeScale(shell.radius, shell.radius, shell.radius).setPosition(shell.x, shell.y, shell.z);
			mesh.setMatrixAt(i, this.matrix);
			data.set([shell.color.r, shell.color.g, shell.color.b, shell.alpha], i * 4);
		});
		mesh.count = shells.length;
		mesh.instanceMatrix.needsUpdate = true;
		mesh.geometry.getAttribute("aShell").needsUpdate = true;
		mesh.visible = true;
	}

	/** A mesh with room for `count` shells: the current one, or a new one twice as big (the old one's GPU buffers released). */
	private reserve(count: number): InstancedMesh<SphereGeometry, ShaderMaterial> {
		if (this.mesh !== null && this.mesh.instanceMatrix.count >= count) return this.mesh;
		const capacity = Math.max(8, 2 ** Math.ceil(Math.log2(count)));
		this.release();
		const geometry = new SphereGeometry(1, SEGMENTS[0], SEGMENTS[1]);
		geometry.setAttribute("aShell", new InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
		const mesh = new InstancedMesh(geometry, this.material, capacity);
		// Shells span whole planets and the shader fades them; the instance bounds aren't kept up to date.
		mesh.frustumCulled = false;
		this.mesh = mesh;
		this.group.add(mesh);
		return mesh;
	}

	private release(): void {
		if (this.mesh === null) return;
		this.group.remove(this.mesh);
		this.mesh.geometry.dispose();
		this.mesh.dispose();
		this.mesh = null;
	}

	dispose(): void {
		this.release();
		this.material.dispose();
	}
}
