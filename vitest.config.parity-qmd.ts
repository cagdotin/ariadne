/**
 * Vitest config for QMD parity tests — Node runtime.
 *
 * QMD parity tests require better-sqlite3 which is a Node native addon that
 * cannot load in Bun's test runner. This config runs only the QMD parity
 * subset under Node via vitest, while non-QMD parity tests continue to run
 * under Bun (see `bun run test:parity`).
 */

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@contracts": path.resolve(__dirname, "./contracts"),
		},
	},
	test: {
		include: ["tests/parity/run-parity-qmd.test.ts"],
		environment: "node",
	},
});
