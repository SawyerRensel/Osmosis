/**
 * Placeholder replaced by esbuild post-build step with base64-encoded sql-wasm.wasm.
 * In test/dev without injection, falls back to null (sql.js loads WASM from node_modules).
 */
export const SQL_WASM_BASE64: string | null =
	"__OSMOSIS_SQL_WASM_PLACEHOLDER__" as unknown as string | null;

export function getEmbeddedWasmBinary(): Uint8Array | null {
	if (
		typeof SQL_WASM_BASE64 === "string" &&
		SQL_WASM_BASE64 !== ("__OSMOSIS_SQL_WASM_PLACEHOLDER__" as string)
	) {
		const binaryString = atob(SQL_WASM_BASE64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes;
	}
	return null;
}
