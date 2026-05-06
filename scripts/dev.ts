// ---- Dev orchestrator: watch-mode rebuilds + deterministic Electron startup --
//
// Starts:
//   1. Vite dev server (renderer)
//   2. esbuild watch for backend, preload, and main
//   3. Electron (launched after Vite is ready and first build completes)
//
// Restarts Electron when main or preload artifacts change.
// Backend is managed by backend-supervisor inside Electron, so backend rebuilds
// do NOT restart Electron — the supervisor handles that on its own.

import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dir, "..");

// ---- Helpers ----------------------------------------------------------------

function log(tag: string, msg: string): void {
	const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
	console.log(`\x1b[90m${timestamp}\x1b[0m \x1b[36m[${tag}]\x1b[0m ${msg}`);
}

function log_error(tag: string, msg: string): void {
	const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
	console.error(`\x1b[90m${timestamp}\x1b[0m \x1b[31m[${tag}]\x1b[0m ${msg}`);
}

// ---- Vite dev server --------------------------------------------------------

function start_vite(): ChildProcess {
	log("vite", "starting renderer dev server...");

	const vite_process = spawn(
		"bunx",
		["vite", "--port", "1420", "--strictPort"],
		{
			cwd: root,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env },
		},
	);

	vite_process.stdout?.on("data", (data: Buffer) => {
		const text = data.toString().trim();
		if (text) log("vite", text);
	});

	vite_process.stderr?.on("data", (data: Buffer) => {
		const text = data.toString().trim();
		if (text) log_error("vite", text);
	});

	vite_process.on("exit", (code) => {
		log("vite", `exited with code ${code}`);
	});

	return vite_process;
}

async function wait_for_vite(
	url: string,
	timeout_ms: number = 30_000,
): Promise<void> {
	const start = Date.now();
	const poll_interval_ms = 250;

	while (Date.now() - start < timeout_ms) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				log("vite", `dev server ready at ${url}`);
				return;
			}
		} catch {
			// not ready yet
		}
		await Bun.sleep(poll_interval_ms);
	}

	throw new Error(
		`Vite dev server did not become ready within ${timeout_ms}ms`,
	);
}

// ---- esbuild watchers -------------------------------------------------------

type BuildTarget = {
	name: string;
	entry: string;
	outfile: string;
	format: "cjs" | "esm";
	external: string[];
	banner?: Record<string, string>;
};

const build_targets: BuildTarget[] = [
	{
		name: "backend",
		entry: "backend/index.ts",
		outfile: "backend/dist/index.js",
		format: "esm",
		external: ["electron", "better-sqlite3"],
	},
	{
		name: "analytics-worker",
		entry: "backend/workers/analytics-build.worker.ts",
		outfile: "backend/dist/analytics-build.worker.js",
		format: "esm",
		external: ["electron", "better-sqlite3"],
	},
	{
		name: "preload",
		entry: "electron/preload/index.ts",
		outfile: "electron/preload/dist/index.js",
		format: "cjs",
		external: ["electron"],
	},
	{
		name: "qmd-bridge",
		entry: "src-sidecar/qmd-bridge.ts",
		outfile: "src-sidecar/dist/qmd-bridge.js",
		format: "esm",
		external: ["better-sqlite3", "sqlite-vec", "node-llama-cpp"],
		banner: {
			js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
		},
	},
	{
		name: "main",
		entry: "electron/main/index.ts",
		outfile: "electron/main/dist/index.cjs",
		format: "cjs",
		external: ["electron"],
	},
];

async function start_esbuild_watchers(
	on_rebuild: (target_name: string) => void,
): Promise<esbuild.BuildContext[]> {
	const contexts: esbuild.BuildContext[] = [];

	for (const target of build_targets) {
		const rebuild_plugin: esbuild.Plugin = {
			name: `rebuild-notify-${target.name}`,
			setup(build) {
				let is_first_build = true;

				build.onEnd((result) => {
					if (result.errors.length > 0) {
						log_error(
							target.name,
							`build failed with ${result.errors.length} error(s)`,
						);
						return;
					}

					if (is_first_build) {
						log(target.name, "initial build complete");
						is_first_build = false;
					} else {
						log(target.name, "rebuilt");
						on_rebuild(target.name);
					}
				});
			},
		};

		const ctx = await esbuild.context({
			entryPoints: [path.join(root, target.entry)],
			bundle: true,
			platform: "node",
			outfile: path.join(root, target.outfile),
			format: target.format,
			external: target.external,
			logLevel: "warning",
			plugins: [rebuild_plugin],
			...(target.banner ? { banner: target.banner } : {}),
		});

		await ctx.watch();
		contexts.push(ctx);
	}

	return contexts;
}

// ---- Electron process -------------------------------------------------------

let electron_process: ChildProcess | null = null;
let restart_pending = false;

function start_electron(): void {
	log("electron", "starting...");

	const electron_bin = path.join(root, "node_modules", ".bin", "electron");
	electron_process = spawn(electron_bin, ["."], {
		cwd: root,
		stdio: "inherit",
		env: {
			...process.env,
			NODE_ENV: "development",
		},
	});

	electron_process.on("exit", (code) => {
		log("electron", `exited with code ${code}`);
		electron_process = null;

		// If no restart is pending, the user closed the window — shut everything down
		if (!restart_pending) {
			shutdown();
		}
	});
}

function restart_electron(): void {
	if (restart_pending) return;
	restart_pending = true;

	log("electron", "restarting due to rebuild...");

	if (electron_process) {
		electron_process.once("exit", () => {
			electron_process = null;
			restart_pending = false;
			start_electron();
		});
		electron_process.kill("SIGTERM");
	} else {
		restart_pending = false;
		start_electron();
	}
}

// ---- Shutdown ---------------------------------------------------------------

let is_shutting_down = false;
let vite_process: ChildProcess | null = null;
let esbuild_contexts: esbuild.BuildContext[] = [];

function shutdown(): void {
	if (is_shutting_down) return;
	is_shutting_down = true;

	log("dev", "shutting down...");

	if (electron_process) {
		electron_process.kill("SIGTERM");
	}

	if (vite_process) {
		vite_process.kill("SIGTERM");
	}

	for (const ctx of esbuild_contexts) {
		ctx.dispose().catch(() => {});
	}

	// Give processes a moment, then force exit
	setTimeout(() => {
		process.exit(0);
	}, 2000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---- Main -------------------------------------------------------------------

async function main(): Promise<void> {
	log("dev", "starting dev environment...");

	// 1. Start Vite dev server
	vite_process = start_vite();

	// 2. Start esbuild watchers (builds backend, preload, main)
	esbuild_contexts = await start_esbuild_watchers((target_name) => {
		// Restart Electron on main or preload changes
		if (target_name === "main" || target_name === "preload") {
			restart_electron();
		}

		// Backend changes: supervisor inside Electron handles restart
		if (target_name === "backend") {
			log(
				"backend",
				"rebuilt — backend-supervisor will pick up changes on next restart",
			);
		}
	});

	// 3. Wait for Vite to be ready (deterministic, no sleep)
	const vite_url = "http://localhost:1420";
	await wait_for_vite(vite_url);

	// 4. Launch Electron
	start_electron();

	log("dev", "all systems running. watching for changes...");
}

main().catch((err) => {
	log_error("dev", `fatal: ${err}`);
	process.exit(1);
});
