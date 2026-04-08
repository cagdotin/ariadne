import { BrowserWindow } from "electron";
import path from "node:path";

const is_dev = process.env.NODE_ENV === "development";

let main_window: BrowserWindow | null = null;

export function create_window(): BrowserWindow {
  const preload_path = path.join(
    __dirname,
    "..",
    "..",
    "preload",
    "dist",
    "index.js",
  );

  main_window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preload_path,
    },
  });

  if (is_dev) {
    main_window.loadURL("http://localhost:1420");
    main_window.webContents.openDevTools();
  } else {
    main_window.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }

  main_window.on("closed", () => {
    main_window = null;
  });

  return main_window;
}

export function get_main_window(): BrowserWindow | null {
  return main_window;
}
