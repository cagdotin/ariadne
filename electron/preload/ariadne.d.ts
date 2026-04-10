// Type declarations for the window.ariadne preload API.
// Backed by shared contract types — see contracts/ipc-commands.ts.

import type { AriadnePreloadApi } from "@contracts/ipc-commands";

declare global {
	interface Window {
		ariadne: AriadnePreloadApi;
	}
}
