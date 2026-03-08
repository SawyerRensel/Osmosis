declare module "sql.js" {
	function initSqlJs(config?: {
		wasmBinary?: ArrayLike<number>;
		locateFile?: (file: string) => string;
	}): Promise<SqlJsModule>;

	interface SqlJsModule {
		Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
	}

	interface SqlJsDatabase {
		run(sql: string, params?: unknown[]): void;
		exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
		export(): Uint8Array;
		close(): void;
	}

	export default initSqlJs;
	export type { SqlJsModule, SqlJsDatabase };
}
