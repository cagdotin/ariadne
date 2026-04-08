import { app, BrowserWindow } from "electron";
import { create_window } from "./window.js";
import { start_backend, stop_backend } from "./backend-supervisor.js";
import { setup_ipc_router } from "./ipc-router.js";

app.whenReady().then(async () => {
  try {
    await start_backend();
  } catch (err) {
    console.error("[main] failed to start backend:", err);
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
