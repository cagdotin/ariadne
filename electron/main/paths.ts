import path from "node:path";

export const is_dev = process.env.NODE_ENV === "development";

export function get_preload_path(): string {
  return path.join(__dirname, "..", "..", "preload", "dist", "index.js");
}

export function get_renderer_dev_url(): string {
  return process.env.ARIADNE_RENDERER_URL ?? "http://localhost:1420";
}

export function get_renderer_index_path(): string {
  return path.join(__dirname, "..", "..", "..", "dist", "index.html");
}

export function get_backend_entry_path(): string {
  return path.join(__dirname, "..", "..", "..", "backend", "dist", "index.js");
}
