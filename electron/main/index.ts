import { app, BrowserWindow } from "electron";
import { start_backend, stop_backend } from "./backend-supervisor.js";
import { setup_ipc_router } from "./ipc-router.js";
import { create_window } from "./window.js";

const got_single_instance_lock = app.requestSingleInstanceLock();

if (!got_single_instance_lock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		const existing_window = BrowserWindow.getAllWindows()[0];
		if (!existing_window) {
			return;
		}

		if (existing_window.isMinimized()) {
			existing_window.restore();
		}

		existing_window.focus();
	});

	app.whenReady().then(async () => {
		try {
			await start_backend();
		} catch (err) {
			console.error("[main] failed to start backend:", err);
			app.quit();
			return;
		}

		setup_ipc_router();
		create_window();

		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				create_window();
			}
		});
	});

	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});

	app.on("before-quit", async () => {
		await stop_backend();
	});
}
