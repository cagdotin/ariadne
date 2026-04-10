// ---- IPC router: bridges Electron IPC (preload -> main) to backend service --

import { BrowserWindow, dialog, ipcMain } from "electron";
import { on_backend_event, send_request } from "./backend-supervisor.js";

export function setup_ipc_router(): void {
	// Generic command channel: renderer invokes "ariadne:command" with { channel, payload }
	ipcMain.handle(
		"ariadne:command",
		async (
			_event,
			args: { channel: string; payload: Record<string, unknown> },
		) => {
			const { channel, payload } = args;
			return send_request(channel, payload);
		},
	);

	// Dialog channel: renderer invokes "ariadne:dialog" with { type, options }
	ipcMain.handle(
		"ariadne:dialog",
		async (
			_event,
			args: { type: string; options?: Record<string, unknown> },
		) => {
			const { type, options } = args;
			if (type === "pick_directory") {
				const result = await dialog.showOpenDialog({
					properties: ["openDirectory"],
					title: (options?.title as string) ?? "Select Directory",
				});
				if (result.canceled || result.filePaths.length === 0) {
					return null;
				}
				return result.filePaths[0];
			}
			throw new Error(`Unknown dialog type: ${type}`);
		},
	);

	// Forward backend events to all renderer windows
	on_backend_event((event, payload) => {
		for (const win of BrowserWindow.getAllWindows()) {
			win.webContents.send("ariadne:event", { event, payload });
		}
	});
}
