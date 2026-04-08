import { BrowserWindow } from "electron";
import {
  is_dev,
  get_preload_path,
  get_renderer_dev_url,
  get_renderer_index_path,
} from "./paths.js";

const should_open_devtools = process.env.ARIADNE_OPEN_DEVTOOLS === "1";

let main_window: BrowserWindow | null = null;

function is_allowed_navigation(url: string): boolean {
  if (is_dev) {
    return url.startsWith(get_renderer_dev_url());
  }

  return url.startsWith("file://");
}

export function create_window(): BrowserWindow {
  main_window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: get_preload_path(),
    },
  });

  main_window.once("ready-to-show", () => {
    main_window?.show();
  });

  main_window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  main_window.webContents.on("will-navigate", (event, url) => {
    if (!is_allowed_navigation(url)) {
      event.preventDefault();
    }
  });

  if (is_dev) {
    main_window.loadURL(get_renderer_dev_url());
    if (should_open_devtools) {
      main_window.webContents.openDevTools();
    }
  } else {
    main_window.loadFile(get_renderer_index_path());
  }

  main_window.on("closed", () => {
    main_window = null;
  });

  return main_window;
}

export function get_main_window(): BrowserWindow | null {
  return main_window;
}
