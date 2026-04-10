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
		include: ["tests/unit/**/*.test.ts"],
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "text-summary"],
			include: ["src/lib/**", "src/components/**/utils/**", "backend/**"],
			exclude: ["**/node_modules/**", "**/dist/**"],
		},
	},
});
