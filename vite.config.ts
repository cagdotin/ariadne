import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(async () => ({
	// Use relative paths so Electron can load from file:// in production
	base: "./",
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@contracts": path.resolve(__dirname, "./contracts"),
		},
	},

	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (
						id.includes("node_modules/react-dom/") ||
						id.includes("node_modules/react/")
					) {
						return "react";
					}
					if (id.includes("node_modules/@tanstack/react-router")) {
						return "router";
					}
					if (
						id.includes("node_modules/recharts") ||
						id.includes("node_modules/d3-")
					) {
						return "recharts";
					}
					if (id.includes("node_modules/@tanstack/react-table")) {
						return "tanstack";
					}
					if (id.includes("node_modules/lucide-react")) {
						return "icons";
					}
				},
			},
		},
	},

	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		watch: {
			ignored: ["**/backend/**", "**/electron/**"],
		},
	},
}));
