/**
 * Stand-in for `three/webgpu`, aliased in `esbuild.config.mjs`.
 *
 * `three-render-objects` (under 3d-force-graph) imports `WebGPURenderer`
 * statically but only constructs it when asked for WebGPU, which the 3D graph
 * never does. The real module is Three's whole WebGPU and node-material stack,
 * about 588 KB of `main.js`, so the bundle gets this instead.
 */
export class WebGPURenderer {
	constructor() {
		throw new Error("Osmosis bundles Three.js without its WebGPU renderer");
	}
}
